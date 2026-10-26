// world-studio-jump.js — SB-2 JUMP WORLD (the owner's Studio Beta plan, phase 2: "a Mario-Maker-style 3D jump game"), and on
// the same engine SB-3's Dungeon Crawl, Escape Room, Boss Battle and Mine Rush. A level is a grid seen from the side
// (world-studio-gen.js JW / genJump: the same level for everyone); every piece on it is a SMART PREFAB that already works:
//   blocks — ground and brick (the theme's look), ice (you slide), lava (hurts, back to the checkpoint), bridges (jump up through)
//   motion — moving platforms and lifts (they carry you), falling platforms (half a second after you land), blinking platforms
//   things — springs (a big bounce), spikes, checkpoints, keys + doors (a key opens a whole door), a switch that swaps the
//            red and blue blocks, potions (+1 heart), chests (+5 coins), coins, ores (Mine Rush: dig with the action button)
//   foes   — walkers (stomp them), flyers, cannons (they fire your way), the DRAGON BOSS (3 stomps; it jumps and breathes
//            fire; the finish stays shut while a boss is up)
// You run (walk / sprint clips by the speed), jump (a buffered jump, a moment's grace off a ledge, a short hop if you let
// go), stomp, take three hearts; a clock in Escape Room and Mine Rush. env: { ctx, THREE, T, esc, makeFx, makeGhost, result, back }
import { makePad } from "./world-studio-pad.js";
import { THEMES, JW, genLevel, jwTimer } from "./world-studio-gen.js";

// each theme's blocks (the drawn look; Meshy's textures take their place when they're in: images/studio/jw)
export const JLOOK = {
  neon: { ground: [0x2a3d6b, 0x5fd3ff, "metal"], brick: [0x3b2f6b, 0xb48cff, "metal"], sky: 0x0b1430, bg: 0x14244a },
  jungle: { ground: [0x7a5532, 0x5ed35a, "grass"], brick: [0x9a7a56, 0xc8a27a, "stone"], sky: 0x9fd8f0, bg: 0x6fb0a0 },
  ice: { ground: [0x8fb6d8, 0xffffff, "snow"], brick: [0x6fa6d8, 0xcfeaff, "ice"], sky: 0xcfe8ff, bg: 0xa8c8e8 },
  lava: { ground: [0x3a2a2a, 0x6a4a3a, "stone"], brick: [0x4a2a24, 0xff7a2e, "stone"], sky: 0x2a0d0a, bg: 0x4a1a10 },
  candy: { ground: [0xffc0e0, 0xff6fae, "candy"], brick: [0xffe0a0, 0xffb02e, "candy"], sky: 0xffd6ec, bg: 0xf0b8e0 },
};
const TEX = { grass: "jw-grass", stone: "jw-stone", ice: "jw-ice", metal: "jw-metal", candy: "jw-candy", snow: "jw-ice", dirt: "jw-dirt", lava: "jw-lava", wood: "jw-wood" };

export async function makeJump(o, env) {
  const { ctx, THREE, T, esc, makeFx, makeGhost, result } = env, { st } = ctx, spec = o.spec, L = genLevel(spec), B = L.B, mode = L.mode;
  const look = JLOOK[spec.theme] || JLOOK.neon, low = !!ctx.low, dark = mode === "dungeon" || mode === "mining", ver = ctx.ver || "";
  const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? 0x07070f : look.sky); scene.fog = new THREE.Fog(dark ? 0x07070f : look.bg, 22, dark ? 42 : 70); scene.userData.live = true;
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x221a2a : look.ground[0], dark ? 0.55 : 1.15)); const sun = new THREE.DirectionalLight(0xffffff, dark ? 0.5 : 1.5); sun.position.set(-6, 14, 10); scene.add(sun);
  const std = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.1, ...x }), glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, toneMapped: false, depthWrite: op >= 1 });
  const D = 1.6; // (a block's depth: you run along z = 0)
  // ---- the drawn block faces (a bevel, a pattern), replaced by Meshy's textures as they load ----
  const texCache = {}, loader = new THREE.TextureLoader();
  function drawn(kind, base, accent) {
    const k = kind + base + accent; if (texCache[k]) return texCache[k];
    const cv = document.createElement("canvas"); cv.width = cv.height = 128; const g = cv.getContext("2d"), hx = (n) => "#" + n.toString(16).padStart(6, "0");
    g.fillStyle = hx(base); g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
    if (kind === "grass") { g.fillStyle = hx(accent); g.fillRect(0, 0, 128, 34); for (let x = 0; x < 128; x += 8) { g.beginPath(); g.moveTo(x, 34); g.lineTo(x + 4, 46 + (x % 16 ? 4 : 0)); g.lineTo(x + 8, 34); g.fill(); } }
    if (kind === "snow") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 30); for (let x = 0; x < 128; x += 16) { g.beginPath(); g.arc(x + 8, 30, 8, 0, Math.PI); g.fill(); } }
    if (kind === "stone" || kind === "candy") { g.strokeStyle = kind === "candy" ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.28)"; g.lineWidth = 4; for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(0, r * 32); g.lineTo(128, r * 32); g.stroke(); for (let c = 0; c < 3; c++) { const x = c * 64 + (r % 2) * 32; g.beginPath(); g.moveTo(x, r * 32); g.lineTo(x, r * 32 + 32); g.stroke(); } } }
    if (kind === "metal") { g.strokeStyle = hx(accent); g.globalAlpha = 0.8; g.lineWidth = 3; g.strokeRect(10, 10, 108, 108); g.globalAlpha = 0.35; g.fillStyle = hx(accent); g.fillRect(10, 56, 108, 16); g.globalAlpha = 1; }
    if (kind === "ice") { g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.moveTo(10, 100); g.lineTo(60, 14); g.lineTo(78, 14); g.lineTo(28, 100); g.fill(); }
    // the bevel
    const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, "rgba(255,255,255,.28)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,.3)"); g.strokeStyle = gr; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache[k] = t; return t;
  }
  const real = (name, mat, rep = 1) => { if (low && ctx.saver) return; try { loader.load(`/images/studio/jw/${name}-${low ? 256 : 512}.webp${ver}`, (t) => { if (!scene.userData.live) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); mat.map = t; mat.color.set(0xffffff); mat.needsUpdate = true; }, undefined, () => { /* the drawn face stays */ }); } catch { /* the drawn face stays */ } };
  // ---- the static blocks: one instanced mesh a kind (a level holds a few hundred) ----
  const box = new THREE.BoxGeometry(1, 1, D), kinds = {}; for (const c of B.c) (kinds[c[2]] || (kinds[c[2]] = [])).push(c);
  const blockMats = (k) => {
    if (k === "g" || k === "s") { const [base, acc, kind] = k === "g" ? look.ground : look.brick, top = std(0xffffff, { map: drawn(kind, base, acc) }), side = std(0xffffff, { map: drawn(kind === "grass" ? "stone" : kind === "snow" ? "stone" : kind, kind === "grass" || kind === "snow" ? base : base, acc) });
      if (kind === "grass") { real(TEX.grass, top); real(TEX.dirt, side); } else if (kind === "snow") { real(TEX.ice, top); } else { real(TEX[kind], top); real(TEX[kind], side); }
      return [side, side, top, side, side, side]; }
    if (k === "i") { const m = std(0xffffff, { map: drawn("ice", 0x9fd8ff, 0xffffff), roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }); real(TEX.ice, m); return m; }
    if (k === "l") { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, map: drawn("stone", 0xff5a1a, 0xffc04a), toneMapped: false }); real(TEX.lava, m); return m; }
    if (k === "1" || k === "2" || k === "3") { const c = { 1: [0x6a4a3a, 0xd97a3a], 2: [0x5a5a66, 0xdfe6f2], 3: [0x5a4a2a, 0xffd23a] }[k], m = std(0xffffff, { map: drawn("stone", c[0], c[1]), emissive: c[1], emissiveIntensity: 0.18 }); return m; }
    if (k === "z") return std(0x2a2f3a, { metalness: 0.6, roughness: 0.35 });
    return null;
  };
  const statics = {}; // kind → { mesh, cells: [c], index: Map(key → i) }
  for (const k of ["g", "s", "i", "l", "1", "2", "3", "z"]) { const list = kinds[k]; if (!list || !list.length) continue; const mat = blockMats(k), im = new THREE.InstancedMesh(k === "l" ? new THREE.BoxGeometry(1, 0.86, D) : box, mat, list.length), mt = new THREE.Matrix4(), idx = new Map();
    list.forEach((c, i) => { mt.makeTranslation(c[0] + 0.5, c[1] + (k === "l" ? 0.43 : 0.5), 0); im.setMatrixAt(i, mt); idx.set(c[0] + ":" + c[1], i); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im); statics[k] = { mesh: im, cells: list, index: idx }; }
  const lavaMat = statics.l && statics.l.mesh.material;
  // the back: far hills and clouds (or a cave wall), the level's floor plate below, the edges
  { const back = new THREE.Mesh(new THREE.PlaneGeometry(B.W * 1.4 + 120, 60), new THREE.MeshBasicMaterial({ color: dark ? 0x0f0d18 : look.bg, fog: false })); back.position.set(B.W / 2, 18, -26); scene.add(back);
    if (!dark) { const hm = std(new THREE.Color(look.bg).multiplyScalar(0.8).getHex(), { roughness: 1 }); for (let x = -20; x < B.W + 40; x += 14) { const h = 6 + ((x * 37) % 9); const hill = new THREE.Mesh(new THREE.SphereGeometry(h, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hm); hill.scale.set(1.3, 0.8, 0.5); hill.position.set(x, -2, -18 - (x % 3)); scene.add(hill); }
      try { loader.load(`/images/studio/jw/jw-sky-${low ? 768 : 1344}.webp${ver}`, (t) => { if (!scene.userData.live) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; back.material.map = t; back.material.color.set(0xffffff); back.material.needsUpdate = true; }); } catch { /* the colour stays */ } } }
  // ---- the things: each a small group ----
  const things = [], add = (c, obj, extra = {}) => { obj.position.set(c[0] + 0.5, c[1], 0); scene.add(obj); const t = { k: c[2], x: c[0], y: c[1], d: c[3] ? 1 : -1, obj, gone: false, ...extra }; things.push(t); return t; };
  const M = { plat: std(0xff9a3d, { emissive: 0xff7a1a, emissiveIntensity: 0.3 }), lift: std(0x5fd3ff, { emissive: 0x2f8cff, emissiveIntensity: 0.35 }), fall: std(0xc8a27a, { roughness: 0.9 }), blink: std(0xff5ad8, { emissive: 0xff2ab8, emissiveIntensity: 0.5, transparent: true }),
    gold: std(0xffc94a, { emissive: 0xffa21a, emissiveIntensity: 0.55, metalness: 0.8, roughness: 0.25 }), red: std(0xff3b5c, { emissive: 0xff1a3a, emissiveIntensity: 0.4, transparent: true }), blue: std(0x3b7bff, { emissive: 0x1a4aff, emissiveIntensity: 0.4, transparent: true }),
    wood: std(0xa8744a, { roughness: 0.85 }), dark: std(0x2a2f3a, { metalness: 0.5, roughness: 0.4 }), white: std(0xf2f7fd), mint: std(0x7cf5c8, { emissive: 0x2fd39a, emissiveIntensity: 0.5 }) };
  real(TEX.wood, M.wood); real(TEX.wood, M.fall); real(TEX.metal, M.lift); real(TEX.metal, M.plat);
  const slab = (mat, w = 1.6, h = 0.32) => new THREE.Mesh(new THREE.BoxGeometry(w, h, D * 0.9), mat);
  for (const c of B.c) { const k = c[2];
    if (k === "w") { const m = slab(M.wood, 1, 0.24); m.position.y = 0.88; const g = new THREE.Group(); g.add(m); add(c, g, { solid: "oneway" }); }
    else if (k === "m" || k === "v") { const g = new THREE.Group(), m = slab(k === "m" ? M.plat : M.lift, 1.8); m.position.y = 0.84; g.add(m); for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), glow(0xffffff, 0.8)); if (k === "m") { a.rotation.z = -s * Math.PI / 2; a.position.set(s * 0.6, 0.84, D * 0.46); } else { a.rotation.z = s > 0 ? 0 : Math.PI; a.position.set(0, 0.84 + s * 0.3, D * 0.46); } g.add(a); } add(c, g, { solid: "plat", hx: c[0] + 0.5, hy: c[1], w: 1.8 }); }
    else if (k === "f") { const g = new THREE.Group(), m = slab(M.fall, 1, 0.4); m.position.y = 0.8; g.add(m); add(c, g, { solid: "plat", w: 1, hx: c[0] + 0.5, hy: c[1], t0: -1 }); }
    else if (k === "b") { const g = new THREE.Group(), m = slab(M.blink, 1, 0.4); m.position.y = 0.8; g.add(m); add(c, g, { solid: "plat", w: 1, hx: c[0] + 0.5, hy: c[1] }); }
    else if (k === "p") { const g = new THREE.Group(), base = slab(M.dark, 1, 0.3); base.position.y = 0.15; const coil = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 18), M.mint); coil.rotation.x = Math.PI / 2; coil.position.y = 0.45; const top = slab(M.mint, 0.9, 0.16); top.position.y = 0.7; g.add(base, coil, top); add(c, g, { solid: "spring", top, coil }); }
    else if (k === "k") { const g = new THREE.Group(), sp = std(0xdfe6f2, { metalness: 0.8, roughness: 0.25 }); for (const dx of [-0.3, 0, 0.3]) for (const dz of [-0.4, 0.4]) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), sp); s.position.set(dx, 0.25, dz); g.add(s); } add(c, g); }
    else if (k === "c") { const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), M.white); pole.position.y = 1.1; const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a96a8, side: THREE.DoubleSide })); flag.position.set(0.42, 1.9, 0); const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 18), M.mint); pad.position.y = 0.06; g.add(pole, flag, pad); add(c, g, { flag }); }
    else if (k === "o") { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), M.gold); m.rotation.x = Math.PI / 2; const g = new THREE.Group(); m.position.y = 0.5; g.add(m); add(c, g, { spin: m }); }
    else if (k === "y") { const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 8, 16), M.gold), bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.09), M.gold); ring.position.x = -0.25; bar.position.x = 0.08; const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.09), M.gold); tooth.position.set(0.22, -0.08, 0); const s = new THREE.Group(); s.add(ring, bar, tooth); s.position.y = 0.55; g.add(s); add(c, g, { spin: s }); }
    else if (k === "d") { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, D * 0.7), M.wood); m.position.y = 0.5; const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.1), M.gold); lock.position.set(0, 0.5, D * 0.36); g.add(m, lock); add(c, g, { solid: "door" }); }
    else if (k === "t") { const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 18), M.dark), btn = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 18), M.red); base.position.y = 0.07; btn.position.y = 0.2; g.add(base, btn); add(c, g, { btn }); }
    else if (k === "r" || k === "u") { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, D * 0.96), k === "r" ? M.red : M.blue); m.position.y = 0.5; g.add(m); add(c, g, { solid: "toggle", m }); }
    else if (k === "h") { const g = new THREE.Group(), b2 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), std(0xff4d6d, { emissive: 0xff1a4a, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 })), neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 10), M.white); b2.position.y = 0.42; neck.position.y = 0.7; g.add(b2, neck); add(c, g, { spin: g }); }
    else if (k === "q") { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), M.wood), lid = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.62), M.gold); body.position.y = 0.25; lid.position.y = 0.6; g.add(body, lid); add(c, g, { lid }); }
    else if (k === "e") { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), std(0x8b5cf6, { emissive: 0x5b2cd6, emissiveIntensity: 0.25 })); body.scale.y = 0.8; body.position.y = 0.36; for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.white); eye.position.set(0.18, 0.46, s * 0.14); const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), M.dark); brow.position.set(0.2, 0.58, s * 0.14); brow.rotation.x = s * 0.4; g.add(eye, brow); } g.add(body); add(c, g, { foe: true, vx: (c[3] ? 1 : -1) * (1.6 + spec.speed * 0.25), vy: 0, px: c[0] + 0.5, py: c[1], body }); }
    else if (k === "n") { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), std(0x2a2f3a, { emissive: 0xff3355, emissiveIntensity: 0.2 })), eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xff3355)); eye.position.set(0.24, 0.05, 0); const wings = []; for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x5fd3ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); w.position.set(0, 0.2, s * 0.35); w.rotation.x = Math.PI / 2; g.add(w); wings.push(w); } body.position.y = 0; g.add(body, eye); add(c, g, { foe: true, fly: true, hx: c[0] + 0.5, hy: c[1] + 0.5, px: c[0] + 0.5, py: c[1] + 0.5, wings, ph: c[0] * 0.7 }); }
    else if (k === "z") { const g = new THREE.Group(), bar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 14), M.dark); bar.rotation.z = Math.PI / 2; bar.position.set((c[3] ? 1 : -1) * 0.45, 0.6, 0); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 16), glow(0xff7a2e)); ring.rotation.y = Math.PI / 2; ring.position.set((c[3] ? 1 : -1) * 0.8, 0.6, 0); g.add(bar, ring); add(c, g, { cannon: true, cd: 1 + (c[0] % 3) * 0.6 }); }
    else if (k === "B") { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), std(0x2fb36a, { emissive: 0x0f5a2a, emissiveIntensity: 0.25 })); body.scale.set(1.15, 0.9, 0.9); body.position.y = 1; const belly = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), std(0xffe08a)); belly.position.set(0.35, 0.85, 0); belly.scale.set(0.6, 0.9, 0.9);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), body.material); head.position.set(0.9, 1.75, 0); const snout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.5), body.material); snout.position.set(1.35, 1.65, 0);
      const horns = []; for (const s of [-1, 1]) { const hn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), M.white); hn.position.set(0.75, 2.25, s * 0.25); hn.rotation.z = 0.5; g.add(hn); horns.push(hn); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow(0xff3355)); eye.position.set(1.25, 1.95, s * 0.22); g.add(eye); const wing = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), std(0x1a7a4a, { side: THREE.DoubleSide })); wing.position.set(-0.3, 1.7, s * 0.6); wing.rotation.set(s * 0.6, 0, -0.9); g.add(wing); }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 8), body.material); tail.position.set(-1.15, 0.7, 0); tail.rotation.z = 1.9; g.add(body, belly, head, snout, tail);
      add(c, g, { foe: true, boss: true, hp: JW.BOSS_HP + (spec.speed >= 4 ? 1 : 0), px: c[0] + 1, py: c[1], vx: -1, vy: 0, home: c[0] + 1, cd: 2.4, flash: 0, head, body }); }
    else if (k === "F") { const g = new THREE.Group(), ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 12, 40), glow(0xffd23a)); ring.position.y = 1.3; const fill = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: 0x7cf5c8, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); fill.position.y = 1.3; const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.14, 24), M.gold); base.position.y = 0.07; g.add(ring, fill, base); add(c, g, { fill, ring }); }
    else if (k === "S") { const g = new THREE.Group(), pad = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.1, 24), glow(0x7cf5c8, 0.7)); pad.position.y = 0.05; g.add(pad); add(c, g); }
  }
  // ---- Meshy's prefabs (models/world/studio/jw): each kind's model fitted to its cell once it's in, the drawn one hidden;
  // the walker and the dragon play their own clips (walk / idle / attack). Coins stay drawn (there can be a hundred).
  const GLB = { p: ["spring", 0.95], k: ["spike-trap", 0.95], c: ["checkpoint", 2.3, 1], y: ["key", 0.6], d: ["door", 1], t: ["switch", 0.75], q: ["chest", 0.9], h: ["potion", 0.62], F: ["finish-portal", 2.7, 1], z: ["cannon", 1.05], n: ["enemy-flyer", 0.95], e: ["walker", 0.95, 1], B: ["dragon", 2.7, 1] };
  const mixers = [], SIDE = new Set(["e", "n", "B", "z"]);
  const tint = (m, c, k = 0.5) => m.traverse((x) => { if (x.isMesh && x.material && x.material.emissive) { x.material = x.material.clone(); x.material.emissive.set(c); x.material.emissiveIntensity = k; } });
  async function prefabs() {
    const ld = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null; if (!ld || ctx.saver) return;
    for (const k of [...new Set(things.map((t) => t.k))].filter((x) => GLB[x])) {
      if (!scene.userData.live) return; let gl; try { gl = await ld.loadAsync(`/models/world/studio/jw/${GLB[k][0]}.glb${ver}`); } catch { continue; } if (!scene.userData.live) return;
      const src = gl.scene, bx = new THREE.Box3().setFromObject(src), sz = bx.getSize(new THREE.Vector3()), cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
      for (const t of things.filter((q) => q.k === k)) {
        let h = GLB[k][1]; if (k === "d") { if (cell.get(t.x + ":" + (t.y - 1)) === "d") { t.obj.children.forEach((c) => { c.visible = false; }); continue; } if (cell.get(t.x + ":" + (t.y + 1)) === "d") h = 2; } // (a door two cells tall: one door)
        const sc = h / (GLB[k][2] ? sz.y : Math.max(sz.x, sz.y, sz.z)), m = gl.animations.length ? ctx.K.skelClone(src) : src.clone(true);
        m.scale.setScalar(sc); m.position.set(-cx * sc, -bx.min.y * sc, -cz * sc); m.traverse((x) => { if (x.isSkinnedMesh) x.frustumCulled = false; });
        const w = new THREE.Group(); w.add(m); if (SIDE.has(k)) w.rotation.y = k === "z" ? (t.d > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI / 2; // (models face +Z: the moving ones turn to face along the level)
        if (k === "B") w.position.x = 0; if (k === "n") w.position.y = 0.05;
        t.obj.children.forEach((c) => { if (!(k === "c" && c.geometry && c.geometry.type === "CylinderGeometry" && c.position.y < 0.1)) c.visible = false; }); t.obj.add(w); t.model = m;
        if (k === "t") tint(m, 0xff3b5c, 0.35);
        if (gl.animations.length) { const mx = new THREE.AnimationMixer(m), act = (n2) => { const c = gl.animations.find((a) => a.name === n2); return c ? mx.clipAction(c) : null; }; t.mx = mx; t.acts = { walk: act("walk"), idle: act("idle"), attack: act("attack") }; (t.acts.walk || t.acts.idle) && (k === "B" ? (t.acts.idle || t.acts.walk) : t.acts.walk).play(); mixers.push(mx); }
      }
    }
  }
  // ---- the solid test: the grid's blocks, the doors and toggles that still stand ----
  const cell = new Map(); for (const c of B.c) cell.set(c[0] + ":" + c[1], c[2]);
  const thingAt = new Map(); for (const t of things) if (t.solid === "door" || t.solid === "toggle") thingAt.set(t.x + ":" + t.y, t);
  const S = { x: 0, y: 0, vx: 0, vy: 0, on: null, ground: false, coyote: 0, buf: 0, hold: false, hearts: 3, inv: 0, coins: 0, keys: 0, sw: false, face: 1, t: -3, over: false, best: 0, clip: "", combo: 0, lastCoin: -9, tr: [], cp: null, bosses: things.filter((t) => t.boss).length, dig: 0, digCd: 0, oreHp: new Map() };
  const solidAt = (x, y) => { const k = cell.get(x + ":" + y); if (k === "g" || k === "s" || k === "i" || k === "z" || ((k === "1" || k === "2" || k === "3") && !S.oreHp.has("x" + x + ":" + y))) return k; const t = thingAt.get(x + ":" + y); if (t && !t.gone && (t.solid === "door" || (t.solid === "toggle" && ((t.k === "r") !== S.sw)))) return t.k; return null; };
  const start = B.c.find((c) => c[2] === "S") || [1, 2, "S"]; S.x = start[0] + 0.5; S.y = start[1]; S.cp = { x: S.x, y: S.y };
  if (o.startZ) { const want = Math.max(1, Math.min(B.W - 2, o.startZ)); for (let y = JW.H - 2; y >= 1; y--) if (solidAt(want, y - 1) && !solidAt(want, y) && !solidAt(want, y + 1)) { S.x = want + 0.5; S.y = y; S.cp = { x: S.x, y: S.y }; break; } }
  const HW = 0.34, HH = 1.45;
  // the hero
  let hero = null; try { hero = await ctx.makeHero(); } catch (e) { console.warn("jump hero", e); }
  const me = new THREE.Group(); scene.add(me); if (hero) { me.add(hero.obj); const k = 1.55 / (hero.height || 1.7); hero.obj.scale.multiplyScalar(k); try { hero.play("idle"); } catch { /* no clip */ } } else { const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 10), std(0xeef4fb)); cap.position.y = 0.75; me.add(cap); }
  const lamp = dark ? new THREE.PointLight(0xffd9a0, 2.4, 13, 1.4) : null; if (lamp) { lamp.position.set(0, 1.6, 2.2); me.add(lamp); }
  const gh = makeGhost(scene, o.ghost, false);
  // ---- the HUD ----
  document.body.classList.add("wp-studio");
  const tm = jwTimer(spec), hud = document.createElement("div"); hud.className = "wst-hud wst-jw";
  hud.innerHTML = `<div class="wst-top" data-game-hud><b class="wst-hn">${esc(o.title || spec.title)}</b><span class="wst-hp">❤️❤️❤️</span><span class="wst-hc">🪙 0</span><span class="wst-hk" hidden>🗝️ 0</span>${tm ? `<span class="wst-ht">⏱ ${tm}</span>` : ""}<span class="wst-combo" hidden></span><button type="button" class="wst-hx" aria-label="${esc(T("Leave"))}">×</button><i class="wst-bar"><em></em></i></div>
    <div class="wst-boss" hidden><small>🐉 ${esc(T("Dragon boss"))}</small><i><em></em></i></div><div class="wst-cd">3</div>
    ${ctx.coarse ? "" : `<p class="wst-keys">${esc(T("← → run · Space jump"))}${mode === "mining" ? " · " + esc(T("E dig")) : ""}</p>`}`;
  document.body.appendChild(hud); const fx = makeFx(hud);
  const keyOn = new Set(), kd = (e) => { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "a", "d", " ", "arrowup", "w", "e", "j", "shift"].includes(k)) { if (!keyOn.has(k) && (k === " " || k === "arrowup" || k === "w")) jumpPress(); if (!keyOn.has(k) && (k === "e" || k === "j")) digPress(); keyOn.add(k); e.preventDefault(); } }, ku = (e) => { const k = e.key.toLowerCase(); keyOn.delete(k); if (k === " " || k === "arrowup" || k === "w") S.hold = false; };
  addEventListener("keydown", kd, true); addEventListener("keyup", ku, true);
  const pad = ctx.coarse ? makePad(hud, { mode: "side", T, onJump: () => jumpPress(), onJumpUp: () => { S.hold = false; }, onAct: mode === "mining" ? () => digPress() : null }) : null;
  function jumpPress() { S.buf = 0.14; S.hold = true; }
  function digPress() { if (mode !== "mining") return; S.dig = 0.18; }
  const play = (c, o2) => { if (!hero) return; try { hero.play(c, o2 || {}); } catch { /* no clip */ } S.clip = o2 && o2.once ? "" : c; };
  const paintHud = () => { hud.querySelector(".wst-hp").textContent = "❤️".repeat(Math.max(0, S.hearts)) + "🖤".repeat(Math.max(0, 3 - Math.max(0, S.hearts))); hud.querySelector(".wst-hc").textContent = `🪙 ${S.coins}`; const hk = hud.querySelector(".wst-hk"); hk.hidden = !S.keys; hk.textContent = "🗝️ " + S.keys; hud.querySelector(".wst-bar em").style.width = Math.min(100, (S.best / Math.max(1, L.len)) * 100).toFixed(1) + "%"; if (tm) hud.querySelector(".wst-ht").textContent = "⏱ " + Math.max(0, Math.ceil(tm - Math.max(0, S.t))); };
  const bossBar = () => { const bs = things.filter((t) => t.boss), el = hud.querySelector(".wst-boss"), alive = bs.filter((b2) => !b2.gone); el.hidden = !alive.length || !alive.some((b2) => Math.abs(b2.px - S.x) < 18); if (alive.length) { const tot = bs.reduce((a, b2) => a + b2.max, 0) || 1, left = alive.reduce((a, b2) => a + b2.hp, 0); el.querySelector("em").style.width = ((left / tot) * 100).toFixed(1) + "%"; } };
  things.filter((t) => t.boss).forEach((b2) => { b2.max = b2.hp; });
  const snd = (k) => { try { if (ctx.Snd && ctx.Snd[k]) ctx.Snd[k](); } catch { /* no sound */ } };
  function hurt(back) { if (S.over) return; if (!back && S.inv > 0) return; S.hearts--; S.inv = 1.3; play(S.hearts > 0 ? "hit" : "die", { once: true }); snd("hurt"); env.ouch && env.ouch(hud); paintHud(); if (S.hearts <= 0) return end(false);
    if (back) { S.x = S.cp.x; S.y = S.cp.y; S.vx = S.vy = 0; } else { S.vy = 8; S.vx = -S.face * 5; } }
  function burst(x, y, col, n = 10) { if (low) n = Math.ceil(n / 2); for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), glow(col)); p.position.set(x, y, 0.4); p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 3); p.userData.life = 0.7; scene.add(p); sparks.push(p); } }
  const sparks = [], shots = [];
  function coin(n = 1, x = S.x, y = S.y + 1) { S.coins += n; S.combo = S.t - S.lastCoin < 2 ? S.combo + 1 : 1; S.lastCoin = S.t; fx.combo(S.combo); snd("coin"); burst(x, y, 0xffd23a, 6); paintHud(); }
  // ---- the physics ----
  const platOf = (t, tt) => { if (t.k === "m") return { x: t.hx + Math.sin(tt * 0.9 + t.x) * 2.5 * t.d * -1, y: t.hy }; if (t.k === "v") return { x: t.hx, y: t.hy + (Math.sin(tt * 0.9 + t.x) * 0.5 + 0.5) * 3 }; if (t.k === "f") return { x: t.hx, y: t.hy - (t.t0 >= 0 && tt - t.t0 > 0.5 ? (tt - t.t0 - 0.5) ** 2 * 9 : 0) }; return { x: t.hx, y: t.hy }; };
  const blinkOn = (t, tt) => ((tt + t.x * 0.37) % 4) < 2.6;
  const plats = things.filter((t) => t.solid === "plat"), oneways = things.filter((t) => t.solid === "oneway"), springs = things.filter((t) => t.solid === "spring");
  function collideX() {
    const y0 = Math.floor(S.y + 0.05), y1 = Math.floor(S.y + HH - 0.05);
    if (S.vx > 0) { const x = Math.floor(S.x + HW); for (let y = y0; y <= y1; y++) if (solidAt(x, y) || (cell.get(x + ":" + y) === "p")) { S.x = x - HW - 0.001; S.vx = 0; touchSolid(x, y); return; } }
    if (S.vx < 0) { const x = Math.floor(S.x - HW); for (let y = y0; y <= y1; y++) if (solidAt(x, y) || (cell.get(x + ":" + y) === "p")) { S.x = x + 1 + HW + 0.001; S.vx = 0; touchSolid(x, y); return; } }
    if (S.x < HW) S.x = HW; if (S.x > B.W - HW) S.x = B.W - HW;
  }
  function touchSolid(x, y) { const t = thingAt.get(x + ":" + y); if (t && t.solid === "door" && !t.gone && S.keys > 0) openDoor(t); }
  function openDoor(t) { S.keys--; const col = things.filter((q) => q.solid === "door" && !q.gone && q.x === t.x && Math.abs(q.y - t.y) <= 8); col.forEach((q) => { q.gone = true; q.obj.visible = false; burst(q.x + 0.5, q.y + 0.5, 0xffd23a, 8); }); fx.say("🔓 " + T("Door open!")); snd("coin"); paintHud(); }
  function collideY(dt, tt, y0) {
    S.ground = false; S.on = null; const xa = Math.floor(S.x - HW + 0.02), xb = Math.floor(S.x + HW - 0.02);
    if (S.vy <= 0) { // landing on the grid
      const y = Math.floor(S.y); for (let x = xa; x <= xb; x++) { const k = solidAt(x, y) || (cell.get(x + ":" + y) === "p" ? "p" : null); if (k && y0 >= y + 1 - 0.02) { S.y = y + 1; S.vy = 0; S.ground = true; S.under = k; if (k === "p") spring(things.find((t) => t.k === "p" && t.x === x && t.y === y)); return; } }
      for (const t of oneways) { if (Math.abs(t.x + 0.5 - S.x) > 0.5 + HW) continue; const top = t.y + 1; if (y0 >= top - 0.02 && S.y <= top) { S.y = top; S.vy = 0; S.ground = true; S.under = "w"; return; } }
      for (const t of plats) { if (t.gone || (t.k === "b" && !blinkOn(t, tt))) continue; const p = platOf(t, tt), top = p.y + 1; if (Math.abs(p.x - S.x) > t.w / 2 + HW - 0.05) continue; if (y0 >= top - 0.12 && S.y <= top + 0.02) { S.y = top; S.vy = 0; S.ground = true; S.on = t; S.under = t.k; if (t.k === "f" && t.t0 < 0) t.t0 = tt; return; } }
    } else { // a head bump
      const y = Math.floor(S.y + HH); for (let x = xa; x <= xb; x++) { const k = solidAt(x, y); if (k) { S.y = y - HH; S.vy = 0; if (k === "1" || k === "2" || k === "3") hitOre(x, y); return; } }
    }
  }
  function spring(t) { S.vy = JW.V0 * Math.sqrt(JW.SPRING / JW.REACH[1]) * 0.98; S.ground = false; snd("jump"); fx.say(T("Boing!")); if (t) t.sq = 0.25; }
  function hitOre(x, y) { const k = cell.get(x + ":" + y), id = x + ":" + y; if (!JW.ORE[k] || S.oreHp.has("x" + id)) return; const hp = (S.oreHp.get(id) ?? JW.ORE[k][0]) - 1; S.oreHp.set(id, hp); burst(x + 0.5, y + 0.5, k === "3" ? 0xffd23a : k === "2" ? 0xdfe6f2 : 0xd97a3a, 5); snd("hit");
    if (hp <= 0) { S.oreHp.set("x" + id, 1); const st0 = statics[k], i = st0 && st0.index.get(id); if (st0 && i != null) { const mt = new THREE.Matrix4().makeScale(0, 0, 0); st0.mesh.setMatrixAt(i, mt); st0.mesh.instanceMatrix.needsUpdate = true; } coin(JW.ORE[k][1], x + 0.5, y + 0.5); fx.say("⛏ +" + JW.ORE[k][1]); } }
  let lastT = 0;
  function tick(dt, tt) {
    dt = Math.min(dt, 0.04); lastT = tt;
    if (S.t < 0) { const n0 = Math.ceil(-S.t); S.t += dt; const n1 = Math.ceil(-Math.min(0, S.t)); if (n1 !== n0) { const cd = hud.querySelector(".wst-cd"); if (cd) { cd.textContent = n1 > 0 ? String(n1) : T("GO!"); cd.classList.remove("pop"); void cd.offsetWidth; cd.classList.add("pop"); if (n1 <= 0) setTimeout(() => cd.remove(), 700); } } }
    else if (!S.over) {
      S.t += dt; S.inv = Math.max(0, S.inv - dt); S.buf = Math.max(0, S.buf - dt); S.coyote = Math.max(0, S.coyote - dt); S.digCd = Math.max(0, S.digCd - dt);
      const ix = (keyOn.has("arrowright") || keyOn.has("d") ? 1 : 0) - (keyOn.has("arrowleft") || keyOn.has("a") ? 1 : 0) || (pad && pad.on ? (Math.abs(pad.x) > 0.18 ? pad.x : 0) : 0);
      const run = keyOn.has("shift") || (pad && Math.abs(pad.x) > 0.85), top = L.v * (run ? 1.3 : 1) * (Math.abs(ix) < 1 && ix ? Math.max(0.5, Math.abs(ix)) : 1);
      const ice = S.ground && S.under === "i", acc = S.ground ? (ice ? 7 : 55) : 26, want = ix ? Math.sign(ix) * top : 0;
      S.vx += Math.max(-acc * dt, Math.min(acc * dt, want - S.vx)); if (ix) S.face = Math.sign(ix);
      if (S.ground) S.coyote = 0.1;
      if (S.buf > 0 && S.coyote > 0) { S.vy = JW.V0; S.buf = 0; S.coyote = 0; S.ground = false; snd("jump"); play("jump", { once: true }); }
      if (!S.hold && S.vy > 4) S.vy *= 0.6; // (let go early: a short hop)
      if (S.on) { const a = platOf(S.on, tt - dt), b2 = platOf(S.on, tt); S.x += b2.x - a.x; if (S.on.k !== "f") S.y += Math.max(0, b2.y - a.y); }
      S.x += S.vx * dt; collideX();
      const y0 = S.y; S.vy = Math.max(-26, S.vy - JW.G * dt); S.y += S.vy * dt; collideY(dt, tt, y0);
      // dig (Mine Rush): the ore in front, or the one under your feet
      if (S.dig > 0 && S.digCd <= 0) { S.dig = 0; S.digCd = 0.22; play("attack", { once: true, speed: 1.6 }); const fx0 = Math.floor(S.x + S.face * (HW + 0.4)), fy = Math.floor(S.y + 0.6); if (JW.ORE[cell.get(fx0 + ":" + fy)] && !S.oreHp.has("x" + fx0 + ":" + fy)) hitOre(fx0, fy); else if (JW.ORE[cell.get(fx0 + ":" + Math.floor(S.y + 1.3))]) hitOre(fx0, Math.floor(S.y + 1.3)); else hitOre(Math.floor(S.x), Math.floor(S.y - 0.5)); }
      // lava and spikes, falling out
      const fxC = Math.floor(S.x), fyC = Math.floor(S.y - 0.05);
      if (cell.get(fxC + ":" + fyC) === "l" || cell.get(fxC + ":" + Math.floor(S.y + 0.3)) === "l") { burst(S.x, S.y + 0.5, 0xff7a2e, 12); hurt(true); }
      if (S.y < -4) hurt(true);
      // the things you touch
      for (const t of things) { if (t.gone) continue; const dx = Math.abs(t.x + 0.5 - S.x), dy = S.y + HH / 2 - (t.y + 0.5);
        if (t.k === "k" && dx < 0.5 + HW && S.y < t.y + 0.55 && S.y + HH > t.y) hurt(false);
        else if (t.k === "o" && dx < 0.75 && Math.abs(dy) < 1.1) { t.gone = true; t.obj.visible = false; coin(1, t.x + 0.5, t.y + 0.5); }
        else if (t.k === "y" && dx < 0.75 && Math.abs(dy) < 1.1) { t.gone = true; t.obj.visible = false; S.keys++; fx.say("🗝️ " + T("Key!")); snd("coin"); paintHud(); }
        else if (t.k === "h" && dx < 0.75 && Math.abs(dy) < 1.1) { t.gone = true; t.obj.visible = false; S.hearts = Math.min(5, S.hearts + 1); fx.say("❤️ +1"); paintHud(); }
        else if (t.k === "q" && dx < 0.8 && Math.abs(dy) < 1.1 && !t.open) { t.open = true; t.lid.rotation.z = -1.1; t.lid.position.x = -0.25; if (t.model) t.model.parent.scale.set(1.15, 0.85, 1.15); coin(JW.CHEST, t.x + 0.5, t.y + 1); fx.say("💰 +" + JW.CHEST); }
        else if (t.k === "c" && dx < 0.8 && Math.abs(dy) < 1.4 && !t.hit) { t.hit = true; S.cp = { x: t.x + 0.5, y: t.y }; if (t.model) tint(t.model, 0x7cf5c8, 0.6); t.flag.material.color.set(0x7cf5c8); t.flag.material.emissive = new THREE.Color(0x2fd39a); fx.say("🚩 " + T("Checkpoint")); snd("coin"); }
        else if (t.k === "t" && dx < 0.7 && S.y < t.y + 0.4 && S.y >= t.y - 0.1 && S.vy <= 0 && (t.cool || 0) < tt) { t.cool = tt + 0.8; S.sw = !S.sw; t.btn.material = S.sw ? M.blue : M.red; if (t.model) tint(t.model, S.sw ? 0x3b7bff : 0xff3b5c, 0.35); things.forEach((q) => { if (q.solid === "toggle") { const on = (q.k === "r") !== S.sw; q.m.material.opacity = on ? 1 : 0.22; } }); fx.say(S.sw ? "🔵" : "🔴"); snd("jump"); }
        else if (t.k === "F" && dx < 0.9 && Math.abs(dy) < 1.4) { if (S.bosses > 0) { if ((t.warn || 0) < tt) { t.warn = tt + 2; fx.say("🐉 " + T("Defeat the boss first!")); } } else { end(true); break; } }
      }
      // foes
      for (const t of things) { if (!t.foe || t.gone) continue; t.flash = Math.max(0, (t.flash || 0) - dt);
        if (t.boss) bossTick(t, dt, tt);
        else if (t.fly) { t.px = t.hx + Math.sin(tt * 0.8 + t.ph) * 2.2; t.py = t.hy + Math.sin(tt * 2.1 + t.ph) * 0.5; t.wings.forEach((w, i) => { w.rotation.y = Math.sin(tt * 18 + i * Math.PI) * 0.6; }); }
        else { t.vy -= JW.G * dt; const nx = t.px + t.vx * dt, ahead = Math.floor(nx + Math.sign(t.vx) * 0.45), fy = Math.floor(t.py + 0.3);
          if (solidAt(ahead, fy) || (!solidAt(ahead, fy - 1) && !oneways.some((w) => w.x === ahead && w.y === fy - 1) && t.vy === 0)) t.vx = -t.vx; else t.px = nx;
          t.py += t.vy * dt; if (solidAt(Math.floor(t.px), Math.floor(t.py - 0.01)) || oneways.some((w) => w.x === Math.floor(t.px) && w.y + 1 > t.py - 0.05 && w.y + 1 <= t.py + 0.3)) { t.py = Math.floor(t.py - 0.01) + 1; if (oneways.some((w) => w.x === Math.floor(t.px) && w.y + 1 > t.py - 1.05)) t.py = Math.max(t.py, Math.floor(t.py)); t.vy = 0; }
          if (t.py < -6) { t.gone = true; t.obj.visible = false; } t.body.scale.y = 0.8 + Math.sin(tt * 10) * 0.05; }
        t.obj.position.set(t.px, t.fly ? t.py - 0.5 : t.py, 0); t.obj.rotation.y = t.vx > 0 || (t.fly && Math.cos(tt * 0.8 + t.ph) > 0) ? 0 : Math.PI;
        // you and it: a stomp from above, otherwise it hurts
        const w2 = t.boss ? 1.2 : 0.45, h2 = t.boss ? 2.1 : 0.8, ox = Math.abs(t.px - S.x), top = (t.fly ? t.py - 0.4 : t.py) + h2;
        if (ox < w2 + HW && S.y < top && S.y + HH > (t.fly ? t.py - 0.4 : t.py)) {
          if (S.vy < -0.5 && S.y > top - 0.55 && !(t.boss && t.flash > 0)) { stomp(t); }
          else if (!(t.boss && t.flash > 0.9)) hurt(false);
        }
      }
      for (const t of things) if (t.cannon) { t.cd -= dt; if (t.cd <= 0 && Math.abs(t.x - S.x) < 16) { t.cd = 2.6; const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), M.dark); b2.position.set(t.x + 0.5 + t.d * 0.9, t.y + 0.6, 0); scene.add(b2); shots.push({ m: b2, vx: t.d * 6.5, vy: 0, life: 4, g: 0 }); snd("hit"); } }
      for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.life -= dt; s.vy -= s.g * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; const px = s.m.position.x, py = s.m.position.y;
        const hitMe = Math.abs(px - S.x) < 0.25 + HW && py > S.y && py < S.y + HH; if (hitMe) hurt(false);
        if (hitMe || s.life <= 0 || solidAt(Math.floor(px), Math.floor(py)) || py < -3) { burst(px, py, s.fire ? 0xff7a2e : 0x9aa6b8, 5); scene.remove(s.m); s.m.geometry.dispose(); shots.splice(i, 1); } }
      // motion for the platforms and blinkers
      for (const t of plats) { const p = platOf(t, tt); t.obj.position.set(p.x, p.y, 0); if (t.k === "b") { const on = blinkOn(t, tt); t.obj.children[0].material.opacity = on ? 1 : 0.18; } if (t.k === "f" && p.y < -6) t.obj.visible = false; }
      for (const t of springs) { if (t.sq > 0) { t.sq -= dt; const k = 1 - Math.sin((t.sq / 0.25) * Math.PI) * 0.4; t.top.position.y = 0.7 * k; t.coil.scale.z = k; } }
      if (lavaMat && lavaMat.map) lavaMat.map.offset.y = (tt * 0.06) % 1;
      // the clips: walk / sprint by the speed, jump / fall in the air (CU_AS names only)
      if (hero && !hero.busy()) { const sp = Math.abs(S.vx), want = !S.ground ? (S.vy > 0 ? "jump" : "fall") : sp > L.v * 1.12 ? "sprint" : sp > 0.6 ? "walk" : "idle"; if (S.clip !== want) play(want, want === "walk" ? { speed: Math.max(0.8, sp / 4.2) } : want === "sprint" ? { speed: Math.max(0.9, sp / 7) } : {}); }
      S.best = Math.max(S.best, S.x);
      if (tm && S.t >= tm) end(false, true);
      if (((S.t * 4) | 0) !== ((S.t - dt) * 4 | 0)) paintHud();
      while (S.tr.length * 0.2 <= S.t && S.tr.length < 1500) S.tr.push([Math.round(S.x * 10), Math.round(S.y * 10), 0]);
      bossBar();
    }
    for (const t of things) if (t.spin && !t.gone) t.spin.rotation.y += dt * 3;
    for (const mx of mixers) mx.update(dt);
    for (const t of things) if (t.model && !t.gone && (t.k === "y" || t.k === "h")) t.model.parent.rotation.y += dt * 2.4;
    for (const t of things) if (t.k === "F") { t.ring.rotation.z += dt * (S.bosses ? 0.3 : 1.6); t.fill.material.opacity = S.bosses ? 0.12 : 0.3 + Math.sin(tt * 3) * 0.1; }
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.userData.life -= dt; p.userData.v.y -= 14 * dt; p.position.addScaledVector(p.userData.v, dt); p.rotation.x += dt * 8; if (p.userData.life <= 0) { scene.remove(p); p.geometry.dispose(); p.material.dispose(); sparks.splice(i, 1); } }
    if (gh) gh.at(Math.max(0, S.t), tt);
    me.position.set(S.x, S.y, 0); me.rotation.y = S.face > 0 ? Math.PI / 2 : -Math.PI / 2; me.visible = !(S.inv > 0 && ((tt * 12) | 0) % 2 && !S.over);
    if (hero) hero.update(dt, tt);
    if (cam.aspect !== innerWidth / innerHeight) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
    const dist = cam.aspect < 1 ? 22 : 15.5, hwv = Math.tan((cam.fov * Math.PI) / 360) * dist * cam.aspect, cx = Math.max(hwv - 1, Math.min(B.W - hwv + 1, S.x + S.face * 1.2));
    camX += (cx - camX) * Math.min(1, dt * 5); camY += (Math.max(4.5, S.y + 2.2) - camY) * Math.min(1, dt * 3);
    cam.position.set(camX, camY + 1.2, dist); cam.lookAt(camX, camY, 0);
  }
  let camX = S.x, camY = Math.max(4.5, S.y + 2.2);
  function stomp(t) {
    S.vy = JW.V0 * 0.62; S.hold = false; snd("hit"); burst(t.px, t.py + 0.6, 0xffffff, 8);
    if (t.boss) { t.hp--; t.flash = 1.4; t.vx *= 1.25; fx.say(t.hp > 0 ? "💥 " + t.hp : "🏆"); if (t.hp <= 0) { t.gone = true; S.bosses--; burst(t.px, t.py + 1.2, 0xffd23a, 24); coin(JW.BOSS, t.px, t.py + 1.5); fx.say("🐉 " + T("The dragon falls! The finish is open")); t.obj.visible = false; } return; }
    t.gone = true; t.obj.visible = false; coin(JW.FOE, t.px, t.py + 0.5);
  }
  function bossTick(t, dt, tt) {
    t.vy -= JW.G * 0.6 * dt; t.py += t.vy * dt; const fy = Math.floor(t.py - 0.01); if (solidAt(Math.floor(t.px), fy) || solidAt(Math.floor(t.px + 0.9), fy)) { if (t.vy < -1) burst(t.px, t.py, 0xc8a27a, 6); t.py = fy + 1; t.vy = 0; }
    const near = Math.abs(t.px - S.x) < 14; if (!near) return;
    const sp = (1.1 + spec.speed * 0.25) * (t.flash > 0 ? 1.6 : 1), nx = t.px + Math.sign(t.vx) * sp * dt; if (Math.abs(nx - t.home) > 6 || solidAt(Math.floor(nx + Math.sign(t.vx) * 1.2), Math.floor(t.py + 0.5))) t.vx = -t.vx; else t.px = nx;
    t.cd -= dt; if (t.cd <= 0 && t.vy === 0) { t.cd = Math.max(1.3, 2.6 - spec.speed * 0.2);
      if (Math.random() < 0.45) { t.vy = 11; } else { const dir = S.x > t.px ? 1 : -1; t.vx = dir * Math.abs(t.vx); if (t.acts && t.acts.attack) { const a = t.acts.attack; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.play(); } for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glow(0xff7a2e)); f.position.set(t.px + dir * 1.3, t.py + 1.7, 0); scene.add(f); shots.push({ m: f, vx: dir * (4.5 + i * 1.6), vy: 4 + i * 1.5, g: 14, life: 3, fire: true }); } snd("dash"); } }
    t.head.rotation.z = Math.sin(tt * 3) * 0.1; t.obj.children.forEach((c) => { if (c.material && c.material.emissive) c.material.emissiveIntensity = t.flash > 0 ? 0.6 + Math.sin(tt * 30) * 0.4 : 0.25; });
  }
  hud.querySelector(".wst-hx").addEventListener("click", () => leave());
  async function end(done, timeUp) { if (S.over) return; S.over = true; if (pad) pad.hide(); play(done ? "emote-yes" : timeUp ? "emote-no" : "die", { once: true }); paintHud();
    const dist = done ? L.len : Math.min(L.len, S.best);
    const head = done ? (mode === "boss" ? "🐉 " + T("Boss defeated!") : mode === "escape" ? "🚪 " + T("You escaped!") : "🏁 " + T("Level clear!")) : timeUp ? "⏱ " + T("Time's up") : "💥 " + T("Out of hearts");
    await result(o, hud, { trace: S.tr, coins: S.coins, dist, done, line: `🪙 ${S.coins} / ${L.coins} · ${Math.round(dist)} / ${L.len} m${tm ? " · ⏱ " + Math.min(tm, Math.round(S.t)) + " s" : ""}`, head, confetti: done }, leave); }
  function leave(again) {
    removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true);
    st.solo(null); st.view(null); hud.remove(); document.body.classList.remove("wp-studio");
    if (hero) me.remove(hero.obj);
    scene.userData.live = false; scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (x.map && !Object.values(texCache).includes(x.map)) x.map.dispose(); x.dispose(); }); });
    Object.values(texCache).forEach((t) => t.dispose());
    env.back(again, o);
  }
  st.view(scene, cam); st.solo(tick); tick(0.016, 0); paintHud(); prefabs().catch(() => { /* the drawn prefabs stay */ });
  return { S, L, leave, isJump: true, clips: (all) => (hero && hero.mixer && hero.mixer._actions ? hero.mixer._actions.filter((x) => x.isRunning() && (all || x.getEffectiveWeight() > 0.5)).map((x) => x.getClip().name) : []),
    steer: (d) => { keyOn.clear(); if (d > 0) keyOn.add("d"); if (d < 0) keyOn.add("a"); }, jump: () => jumpPress(), dig: () => digPress(), things };
}
