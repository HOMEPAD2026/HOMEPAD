// world-studio-prev.js — ARCIRCLE Studio 3 (the owner's "스튜디오만 다 진행" 2026-10-24): the editor's live 3D preview. A small
// renderer of its own (its canvas moves into each paint of the editor, so it isn't remade), the level built from the
// spec as you change it — the track with its walls, gaps, lasers and coins flown along, or the arena with its drones —
// and a still of each theme for the theme cards. Nothing here is the game: no hero, no rules, just how it will look.
// makePreview({ THREE }) → { canvas, set(spec), snap(spec) → dataURL, stop(), dispose() } (null where WebGL can't start)
import { THEMES, LANES, CLIMB, DEF, JUMPS, JW, genLevel, speedOf } from "./world-studio-gen.js";
import { level as ringLevel } from "./world-rings-engine.js";
import { look as themeLook } from "./world-studio-look.js";

// the Jump World tiles per theme (the run's world-studio-jump.js JLOOK / TEX) and their colours before they're in
const JLK = { neon: { g: "metal", s: "metal", gc: 0x2a3d6b, sc: 0x3b2f6b }, jungle: { g: "grass", s: "stone", gc: 0x5ed35a, sc: 0xc8a27a }, ice: { g: "ice", s: "ice", gc: 0xcfeaff, sc: 0x9fd0f0 }, lava: { g: "stone", s: "stone", l: "lava", gc: 0x6a4a3a, sc: 0x8a4a34 }, candy: { g: "candy", s: "candy", gc: 0xff9ccf, sc: 0xffc970 } };
for (const k in JLK) { JLK[k].l = JLK[k].l || "lava"; JLK[k].i = "ice"; }
const jwTex = {};
export function makePreview({ THREE, w = 640, h = 300, ver = "", low = false }) {
  // STB1 (2026-10-27): Jump World's tiles and sky fetched into the cache now (no GPU upload), so its preview isn't flat colours first
  try { for (const n of ["grass", "stone", "metal", "ice", "lava", "candy"]) new Image().src = `/images/studio/jw/jw-${n}-256.webp${ver}`; new Image().src = `/images/studio/jw/jw-sky-768.webp${ver}`; } catch { /* the textures load on their own */ }
  const canvas = document.createElement("canvas"); canvas.className = "wst-3d"; canvas.width = w; canvas.height = h;
  let R; try { R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "low-power" }); } catch { return null; }
  R.setPixelRatio(1); R.setSize(w, h, false); if ("outputColorSpace" in R) R.outputColorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(58, w / h, 0.1, 400);
  let scene = null, built = null, raf = 0, t0 = performance.now(), live = false;
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...o }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false });
  // STU-6 (2026-10-26): each theme's Meshy sky behind the level and its painted floor / block faces on it, once they're in
  // (world-studio-look.js caches them for the page: the runs use the same); the drawn colours until then. A face's texture
  // copy is kept per theme and tiling, so moving a slider doesn't upload new ones.
  const lookNow = {}, maps = new Map();
  function dressNow(b, spec, lk) {
    const th = THEMES[spec.theme] || THEMES.neon, tc = new THREE.Color(th.track).getHex(), wc = new THREE.Color(th.wall).getHex();
    if (lk.sky) { b.sc.background = lk.sky; if (b.sc.fog) { b.sc.fog.near = 70; b.sc.fog.far = 280; } }
    b.sc.traverse((m) => { if (!m.isMesh || !m.material || m.material.map || !m.material.color) return; const c = m.material.color.getHex(), tr = c === tc, src = tr ? lk.track : c === wc ? lk.wall : null; if (!src) return;
      const gp = m.geometry.parameters || {}, rx = tr ? Math.max(1, Math.round((gp.width || gp.radiusTop * 2 || 8) / 6)) : 1, ry = tr ? Math.max(1, Math.round((gp.depth || gp.radiusTop * 2 || 8) / 6)) : 1, key = spec.theme + (tr ? "t" : "w") + rx + "x" + ry;
      let t = maps.get(key); if (!t) { t = src.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; maps.set(key, t); }
      m.material.map = t; m.material.color.set(0xffffff); m.material.needsUpdate = true; });
  }
  function dress(b, spec) {
    const th = spec.theme in THEMES ? spec.theme : "neon";
    if (lookNow[th]) { dressNow(b, spec, lookNow[th]); return; }
    themeLook(THREE, th, { ver, low }).then((lk) => { if (!lk) return; lookNow[th] = lk; if (built === b) dressNow(b, spec, lk); }).catch(() => {});
  }
  // STB4 (2026-10-27): a little robot runs the preview's level, so it reads as a game being played, not a flyover
  function bot(sc) { const g = new THREE.Group(), w = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 }), body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), w), head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), w), eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0x29e0ff })); body.scale.set(1, 1.1, 0.9); head.position.y = 0.62; eye.scale.set(1.2, 0.7, 0.5); eye.position.set(0, 0.64, 0.24); g.add(body, head, eye); g.traverse((m) => { m.userData.bot = 1; }); sc.add(g); return g; }
  function free(sc) { if (sc) sc.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose()); }); } // (the theme's textures are shared: a material's dispose leaves them)
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
    if (spec.tpl === "defense") { // (S4d: the board — the path, its pads, the portal and the crystal — and a few foes walking it)
      const CS = 2, P = (c, r) => [(c - (DEF.C - 1) / 2) * CS, (r - (DEF.R - 1) / 2) * CS], on = new Set(L.path.map(String)), tG = new THREE.BoxGeometry(CS * 0.96, 0.3, CS * 0.96), offM = std(th.prop, { roughness: 0.9 }), onM = std(th.track, { roughness: 0.7 });
      for (let c = 0; c < DEF.C; c++) for (let r = 0; r < DEF.R; r++) { const m = new THREE.Mesh(tG, on.has(String([c, r])) ? onM : offM); const [x, z] = P(c, r); m.position.set(x, on.has(String([c, r])) ? -0.2 : -0.1, z); sc.add(m); }
      const pM = std(0x3a4a66, { emissive: th.edge, emissiveIntensity: 0.3 }); for (const [c, r] of L.pads) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, 20), pM); const [x, z] = P(c, r); m.position.set(x, 0.12, z); sc.add(m); }
      const pts = L.path.map(([c, r]) => P(c, r)); if (pts.length) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), std(0x5fd3ff, { emissive: 0x2fa8ff, emissiveIntensity: 0.7 })); cr.position.set(pts[pts.length - 1][0], 1.3, pts[pts.length - 1][1] + 1.2); sc.add(cr); }
      const fM = std(th.wall, { emissive: th.wall, emissiveIntensity: 0.4 }), fs = Array.from({ length: Math.min(6, pts.length) }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), fM); sc.add(m); return m; });
      return { sc, tick(t) { const n = pts.length; fs.forEach((m, i) => { if (n < 2) return; const f = ((t * 0.9 + i * 1.6) % (n - 1)), a = Math.floor(f), b = Math.min(n - 1, a + 1), k = f - a; m.position.set(pts[a][0] + (pts[b][0] - pts[a][0]) * k, 0.6, pts[a][1] + (pts[b][1] - pts[a][1]) * k); }); cam.position.set(Math.sin(t * 0.2) * 3, 24, 13); cam.lookAt(0, 0, 0.5); } };
    }
    if (L.survival || L.beat || L.race) { // (SB-3: the survival arena with its crowd turning in, the beat highway, the race's ring loop)
      if (L.survival) { const floor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16.5, 0.6, 48), std(0x3a2a24, { roughness: 0.9 })); floor.position.y = -0.3; sc.add(floor); const mG = new THREE.SphereGeometry(0.5, 10, 8), mM = std(0xff5a7a, { emissive: 0xff2a4a, emissiveIntensity: 0.4 }), n = Math.round(30 * L.rate), im = new THREE.InstancedMesh(mG, mM, n), mt = new THREE.Matrix4(); sc.add(im);
        const boss = L.bossAt.length ? new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), std(0x8b5cf6, { emissive: 0x5b2cd6, emissiveIntensity: 0.5 })) : null; if (boss) sc.add(boss);
        return { sc, tick(t) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + t * 0.3, r = 4 + ((i * 7 + t * 2) % 11); mt.makeTranslation(Math.cos(a) * r, 0.5, Math.sin(a) * r); im.setMatrixAt(i, mt); } im.instanceMatrix.needsUpdate = true; if (boss) boss.position.set(Math.cos(t * 0.4) * 9, 1.6, Math.sin(t * 0.4) * 9); cam.position.set(0, 18, 16); cam.lookAt(0, 0, 0); } }; }
      if (L.beat) { sc.background = new THREE.Color(0x070b1c); const road = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 60), std(0x10183a)); road.rotation.x = -Math.PI / 2; road.position.z = -28; sc.add(road); const cols = [0xff6fae, 0xffd23a, 0x7cf5c8, 0x5fd3ff], ms = cols.map((c) => std(c, { emissive: c, emissiveIntensity: 0.8 })), g = new THREE.SphereGeometry(0.4, 12, 8), spb = 60 / L.bpm / 2;
        const ns = L.B.n.slice(0, 160).map(([s0, l]) => { const m = new THREE.Mesh(g, ms[l]); sc.add(m); return { s0, l, m }; });
        return { sc, tick(t) { const now = (t % (L.secs * 0.5)) + 3; for (const q of ns) { const ah = 3 + q.s0 * spb - now; q.m.visible = ah > -0.2 && ah < 2.4; q.m.position.set((q.l - 1.5) * 1.5, 0.35, -ah * 20); } cam.position.set(0, 6, 8.5); cam.lookAt(0, 0, -12); } }; }
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), std(th.track, { roughness: 0.8 })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
      const rs = L.B.r.map((q, i) => { const nx = L.B.r[(i + 1) % L.B.r.length], m = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 10, 36), glow(0xffd23a)); m.position.set(q[0], 3.4, q[1]); m.rotation.y = Math.atan2(nx[0] - q[0], nx[1] - q[1]); sc.add(m); return m; });
      for (const q of L.B.w) { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 7, 12), std(th.wall, { emissive: th.wall, emissiveIntensity: 0.3 })); m.position.set(q[0], 3.5, q[1]); sc.add(m); }
      return { sc, tick(t) { const n = L.B.r.length, f = (t * 0.35) % n, i = Math.floor(f), a = L.B.r[i], c = L.B.r[(i + 1) % n], k = f - i, x = a[0] + (c[0] - a[0]) * k, z = a[1] + (c[1] - a[1]) * k, h = Math.atan2(c[0] - a[0], c[1] - a[1]); cam.position.set(x - Math.sin(h) * 12, 6, z - Math.cos(h) * 12); cam.lookAt(x + Math.sin(h) * 8, 1.5, z + Math.cos(h) * 8); rs.forEach((m) => { m.rotation.z = t; }); } };
    }
    if (JUMPS[spec.tpl]) { // (SB-2 JUMP WORLD and its modes: the level from the side, the camera panning along it)
      const dark = spec.tpl === "dungeon" || spec.tpl === "mining", B = L.B, box = new THREE.BoxGeometry(1, 1, 1.6), mt = new THREE.Matrix4(), by = {};
      if (dark) { sc.background = new THREE.Color(0x0b0a14); sc.fog = new THREE.Fog(0x0b0a14, 18, 60); }
      // CCR2 (2026-10-27): the run's own look in the preview — Meshy's tiles on the ground and brick blocks and its sky
      // behind (images/studio/jw, the same files the run loads, cached for the page); the run's brighter colours until then
      const JL = JLK[spec.theme] || JLK.neon, tile = (k) => { const nm = JL[k]; if (!nm) return null; return jwTex[nm] || (jwTex[nm] = (() => { try { const t = new THREE.TextureLoader().load(`/images/studio/jw/jw-${nm}-256.webp${ver}`); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } })()); };
      let sky = null; if (!dark) { sky = jwTex.sky || (jwTex.sky = (() => { try { const t = new THREE.TextureLoader().load(`/images/studio/jw/jw-sky-768.webp${ver}`); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } })()); if (sky) { sc.background = sky; sc.fog = null; } }
      const COL = { g: th.track, s: th.wall, i: 0x9fd8ff, l: 0xff5a1a, w: 0xa8744a, m: 0xff9a3d, v: 0x5fd3ff, f: 0xc8a27a, b: 0xff5ad8, p: 0x7cf5c8, k: 0xdfe6f2, o: 0xffc94a, y: 0xffd23a, d: 0xa8744a, t: 0xff3b5c, r: 0xff3b5c, u: 0x3b7bff, h: 0xff4d6d, q: 0xffb02e, e: 0x8b5cf6, n: 0x2a2f3a, z: 0x2a2f3a, B: 0x2fb36a, F: 0xffd23a, S: 0x7cf5c8, 1: 0xd97a3a, 2: 0xdfe6f2, 3: 0xffd23a };
      for (const c of B.c) (by[c[2]] || (by[c[2]] = [])).push(c);
      for (const [k, list] of Object.entries(by)) { const small = !"gsilwmvfbdzru123".includes(k), g = k === "B" ? new THREE.BoxGeometry(2, 2, 1.4) : small ? new THREE.SphereGeometry(k === "F" ? 0.8 : 0.36, 12, 8) : box, tx = k === "g" ? tile("g") : k === "s" ? tile("s") : k === "l" ? tile("l") : k === "i" ? tile("i") : null, im = new THREE.InstancedMesh(g, tx ? std(0xffffff, { map: tx, roughness: 0.7 }) : std(k === "g" ? JL.gc : k === "s" ? JL.sc : COL[k] ?? 0xffffff, { emissive: COL[k] ?? 0, emissiveIntensity: small || k === "l" ? 0.5 : 0.08 }), list.length);
        list.forEach((c, i) => { mt.makeTranslation(c[0] + (k === "B" ? 1 : 0.5), c[1] + (k === "B" ? 1 : 0.5), 0); im.setMatrixAt(i, mt); }); sc.add(im); }
      if (!sky) { const back = new THREE.Mesh(new THREE.PlaneGeometry(B.W + 80, 50), std(dark ? 0x141220 : th.fog, { roughness: 1 })); back.position.set(B.W / 2, 14, -14); sc.add(back); }
      const span = Math.max(1, B.W - 24);
      const top = {}; for (const c of B.c) if ("gsilwmvfbd123".includes(c[2])) top[c[0]] = Math.max(top[c[0]] ?? -9, c[1] + 1); const jb = bot(sc); jb.rotation.y = Math.PI / 2; jb.scale.setScalar(0.85); let jy = 2;
      return { sc, tick(t) { const x = 12 + ((t * 3.2) % span), bx = x - 3, gy = top[Math.floor(bx)] ?? -6; jy = gy > jy ? gy : Math.max(gy, jy - 0.25); jb.position.set(bx, jy + 0.4 + Math.abs(Math.sin(t * 7)) * 0.25, 0.4); cam.position.set(x, 7.5, 19); cam.lookAt(x, 5, 0); } };
    }
    if (spec.tpl === "climb") { // (S4d: the tower's first stretch — platforms, springs, spikes, coins — the camera rising past it)
      const top = Math.min(L.len, 70), wall = new THREE.Mesh(new THREE.BoxGeometry(CLIMB.W + 3, top + 20, 0.6), std(th.track, { roughness: 0.8 })); wall.position.set(0, top / 2, -1.6); sc.add(wall);
      const cols = { plat: th.wall, mplat: 0xff9a3d, break: 0xc8a27a, spring: 0x7cf5c8 }, pG = new THREE.BoxGeometry(1.8, 0.32, 1.6), cG = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 14), mats = {};
      for (const r of L.rows) { if (r.z > top) break; const x = CLIMB.COLS[r.lane] || 0; let m;
        if (cols[r.k] != null) m = new THREE.Mesh(pG, mats[r.k] || (mats[r.k] = std(cols[r.k], { emissive: cols[r.k], emissiveIntensity: 0.3 })));
        else if (r.k === "coin") { m = new THREE.Mesh(cG, mats.c || (mats.c = std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.6, metalness: 0.8 }))); m.rotation.x = Math.PI / 2; }
        else if (r.k === "spike") m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 8), mats.k || (mats.k = std(0xff3355, { emissive: 0xff2244, emissiveIntensity: 0.5 })));
        else continue; m.position.set(x, r.z, 0); sc.add(m); }
      return { sc, tick(t) { const y = 3 + ((t * 3) % Math.max(10, top - 8)); cam.position.set(Math.sin(t * 0.4) * 2, y + 1.5, 15); cam.lookAt(0, y, 0); } };
    }
    if (spec.tpl === "arena" || spec.tpl === "rush") {
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
    const rb = bot(sc); rb.rotation.y = 0;
    return { sc, tick(t) { const z = (t * v) % Math.max(40, view - 20), ln = Math.round(Math.sin(t * 0.9) * 1.2); rb.position.set(rb.position.x + ((LANES[ln + 1] ?? 0) - rb.position.x) * 0.12, 0.45 + Math.abs(Math.sin(t * 9)) * 0.18, z); cam.position.set(Math.sin(t * 0.7) * 1.4, 4.6, z - 8); cam.lookAt(0, 1, z + 12); } };
  }
  let cw = w, ch = h;
  function fit() { const W0 = canvas.clientWidth, H0 = canvas.clientHeight; if (!W0 || !H0) return; const k = Math.min(1, (low ? 720 : 1100) / Math.max(W0, H0)), W1 = Math.round(W0 * k), H1 = Math.round(H0 * k); if (Math.abs(W1 - cw) < 8 && Math.abs(H1 - ch) < 8) return; cw = W1; ch = H1; R.setSize(cw, ch, false); cam.aspect = cw / ch; cam.updateProjectionMatrix(); } // (STU-6: drawn at the size it's shown, not stretched)
  function frame() { raf = 0; if (!live || !built) return; if (!canvas.isConnected) { live = false; return; } fit(); built.tick((performance.now() - t0) / 1000); R.render(built.sc, cam); raf = requestAnimationFrame(frame); }
  function set(spec) { const old = built; built = build(spec); scene = built.sc; dress(built, spec); if (old) free(old.sc); live = true; if (!raf) raf = requestAnimationFrame(frame); }
  /// a still of a spec (the theme cards): built, drawn once, let go; the live view carries on after
  function snap(spec) { const b = build(spec); if (lookNow[spec.theme]) dressNow(b, spec, lookNow[spec.theme]); b.tick(1.6); R.render(b.sc, cam); const url = canvas.toDataURL("image/jpeg", 0.8); free(b.sc); if (built) R.render(built.sc, cam); return url; }
  function stop() { live = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function dispose() { stop(); if (built) free(built.sc); built = null; scene = null; try { R.dispose(); R.forceContextLoss && R.forceContextLoss(); } catch { /* gone */ } }
  return { canvas, set, snap, stop, dispose, scene: () => scene };
}
