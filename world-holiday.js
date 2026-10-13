// world-holiday.js — the town dressed for the season, beside Halloween (world-halloween.js):
//   Christmas      12–31 December (Seoul time; ?xmas=1 to see it): strings of coloured lights from lamp to lamp round
//                  the plaza, twinkling after dark, and a tall tree with baubles and a star
//   Lunar New Year three days before to a week after (?lunar=1): red lanterns under every lamp, glowing at night
// and the market stalls on the plaza, all year. Nothing here changes the game's rules or rewards.
const seoul = (now) => { const d = new Date(now + 9 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), t: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }; };
const q = (k) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };
export function christmasOn(now = Date.now()) { const v = q("xmas"); if (v === "1") return true; if (v === "0") return false; const s = seoul(now); return s.m === 12 && s.day >= 12; }
// the first day of the lunar year (Seoul)
const LUNAR = { 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3] };
export function lunarOn(now = Date.now()) {
  const v = q("lunar"); if (v === "1") return true; if (v === "0") return false;
  const s = seoul(now), L = LUNAR[s.y]; if (!L) return false; const d0 = Date.UTC(s.y, L[0] - 1, L[1]), k = (s.t - d0) / 864e5; return k >= -3 && k <= 7;
}

/// Christmas: light strings between the lamps (spots: [x, z] of each lamp, round the plaza) and a tree at `tree`
export function createChristmas({ THREE, planet, spots = [], tree = [0, 0] }) {
  const root = new THREE.Group(); root.name = "christmas"; planet.add(root);
  const COLS = [0xff4d6d, 0x2ee07a, 0xffc861, 0x2f86ff, 0xb48cff];
  // bulbs hang in a sag between neighbouring lamps (in their ring order)
  const ring = spots.slice().sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])), pts = [];
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; for (let k = 1; k < 10; k++) { const t = k / 10; pts.push([a[0] + (b[0] - a[0]) * t, 2.55 - Math.sin(t * Math.PI) * 0.7, a[1] + (b[1] - a[1]) * t]); } }
  const bulbG = new THREE.SphereGeometry(0.075, 8, 6), mats = COLS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.3 }));
  const meshes = mats.map((m, i) => { const im = new THREE.InstancedMesh(bulbG, m, Math.ceil(pts.length / COLS.length)); let n = 0; const o = new THREE.Object3D(); pts.forEach((p, j) => { if (j % COLS.length !== i) return; o.position.set(...p); o.updateMatrix(); im.setMatrixAt(n++, o.matrix); }); im.count = n; root.add(im); return im; });
  // the tree: four tiers, baubles, a star on top
  const tr = new THREE.Group(); tr.position.set(tree[0], 0, tree[1]); root.add(tr);
  const green = new THREE.MeshStandardMaterial({ color: 0x1f6a3c, roughness: 0.75 });
  [[2.6, 2.4, 1.6], [2.1, 2.2, 3.2], [1.55, 2.0, 4.6], [0.95, 1.8, 5.9]].forEach(([r, h, y]) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), green); c.position.y = y; c.castShadow = true; tr.add(c); });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.8 })); trunk.position.y = 0.6; tr.add(trunk);
  const baubG = new THREE.SphereGeometry(0.17, 12, 8);
  for (let i = 0; i < 26; i++) { const y = 1.2 + Math.random() * 5, r = 2.5 * (1 - (y - 0.8) / 6.6) + 0.1, a = Math.random() * Math.PI * 2; const b = new THREE.Mesh(baubG, mats[i % mats.length]); b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); tr.add(b); }
  const starM = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffc861, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), starM); star.position.y = 7.25; tr.add(star);
  return { root, tick(t, night) { mats.forEach((m, i) => { m.emissiveIntensity = 0.3 + night * (1.4 + Math.sin(t * 2.2 + i * 1.7) * 0.9); }); star.rotation.y = t * 0.6; starM.emissiveIntensity = 1.2 + night * 1.2; } };
}

/// Lunar New Year: a red lantern beside every lamp
export function createLanterns({ THREE, planet, spots = [] }) {
  const root = new THREE.Group(); root.name = "lanterns"; planet.add(root);
  const body = new THREE.SphereGeometry(0.32, 16, 10); body.scale(1, 0.8, 1);
  const red = new THREE.MeshStandardMaterial({ color: 0xd81e2a, emissive: 0xff5a2a, emissiveIntensity: 0.2, roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc861, metalness: 0.6, roughness: 0.35 });
  const capG = new THREE.CylinderGeometry(0.14, 0.18, 0.08, 12), tasG = new THREE.CylinderGeometry(0.02, 0.06, 0.3, 6);
  spots.forEach(([x, z]) => { const a = Math.atan2(z, x), g = new THREE.Group(); g.position.set(x - Math.cos(a) * 0.55, 2.05, z - Math.sin(a) * 0.55);
    const b = new THREE.Mesh(body, red), c1 = new THREE.Mesh(capG, gold), c2 = new THREE.Mesh(capG, gold), ts = new THREE.Mesh(tasG, red); c1.position.y = 0.27; c2.position.y = -0.27; ts.position.y = -0.47; g.add(b, c1, c2, ts); root.add(g); });
  return { root, tick(t, night) { red.emissiveIntensity = 0.2 + night * (1.6 + Math.sin(t * 1.3) * 0.15); } };
}

/// market stalls: a counter, a striped awning, goods on top (spots: [x, z, facing])
export function createStalls({ THREE, planet, spots = [] }) {
  const root = new THREE.Group(); root.name = "stalls"; planet.add(root);
  const stripe = (a, b) => { const cv = document.createElement("canvas"); cv.width = 128; cv.height = 8; const g = cv.getContext("2d"); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, 8); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const AW = [["#ff6b8a", "#fff3f6"], ["#38c8ff", "#effaff"], ["#2ee07a", "#effff6"], ["#ffc861", "#fffaf0"]];
  const wood = new THREE.MeshStandardMaterial({ color: 0xc89a6a, roughness: 0.75 }), top = new THREE.MeshStandardMaterial({ color: 0xe8dccb, roughness: 0.6 });
  const GOODS = [0xff6b6b, 0xffc861, 0x9aff5a, 0x8fe6ff, 0xb48cff];
  const NEON = [["SNACKS", "#ff5fa2"], ["GEAR", "#38e8ff"], ["BOBA", "#9aff5a"], ["MERCH", "#ffc861"]], neons = [];
  spots.forEach(([x, z, ry], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.9), wood); counter.position.y = 0.45; counter.castShadow = true; counter.receiveShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 1.0), top); board.position.y = 0.93;
    const [ca, cb] = AW[i % AW.length], awn = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: stripe(ca, cb), side: THREE.DoubleSide, roughness: 0.8 }));
    awn.position.set(0, 2.25, 0.25); awn.rotation.x = -Math.PI / 2 + 0.38; awn.castShadow = true;
    const postG = new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6); [-1.1, 1.1].forEach((px) => { const p = new THREE.Mesh(postG, wood); p.position.set(px, 1.15, -0.4); g.add(p); });
    g.add(counter, board, awn);
    for (let k = 0; k < 7; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.05, 10, 8), new THREE.MeshStandardMaterial({ color: GOODS[(i + k) % GOODS.length], roughness: 0.5 })); s.position.set(-0.85 + k * 0.28, 1.08, (k % 2 ? 0.15 : -0.12)); g.add(s); }
    // a neon word over each stall that hums and now and then blinks off
    const word = NEON[i % NEON.length], cv = document.createElement("canvas"); cv.width = 256; cv.height = 72; const c2 = cv.getContext("2d");
    c2.font = "900 52px 'Big Shoulders Display', Sora, sans-serif"; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.shadowColor = word[1]; c2.shadowBlur = 14; c2.fillStyle = word[1]; c2.fillText(word[0], 128, 38); c2.shadowBlur = 0; c2.fillStyle = "#ffffff"; c2.globalAlpha = 0.6; c2.fillText(word[0], 128, 38);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(0, 2.95, 0.05); g.add(sign); neons.push({ m: sign.material, off: 0, next: 3 + Math.random() * 8 });
    g.userData.radius = 1.5;
  });
  return { root, stalls: root.children, tick(dt, night) { for (const n of neons) { if ((n.next -= dt) <= 0) { n.next = 4 + Math.random() * 10; n.off = 0.08 + Math.random() * 0.25; } n.off = Math.max(0, n.off - dt); n.m.opacity = n.off > 0 ? 0.15 : 0.55 + night * 0.45; } } };
}

/// the bounty board: a post-and-plank notice board with pinned papers (the day's hunts open from it: world-play.js)
export function createBountyBoard({ THREE, planet, at = [0, 0, 0] }) {
  const g = new THREE.Group(); g.position.set(at[0], 0, at[1]); g.rotation.y = at[2] || 0; g.name = "bounty"; planet.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.8 });
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 320; const x = cv.getContext("2d");
  x.fillStyle = "#6e4426"; x.fillRect(0, 0, 512, 320); for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? "#7a4c2b" : "#674023"; x.fillRect(0, i * 54, 512, 52); }
  x.fillStyle = "#ffe7b0"; x.font = "900 54px 'Big Shoulders Display', Sora, sans-serif"; x.textAlign = "center"; x.fillText("BOUNTIES", 256, 62);
  [[60, 96, -0.06], [200, 104, 0.05], [340, 92, -0.03], [120, 196, 0.04], [270, 200, -0.05], [400, 190, 0.06]].forEach(([px, py, r]) => { x.save(); x.translate(px + 50, py + 45); x.rotate(r); x.fillStyle = "#f4ead2"; x.fillRect(-48, -42, 96, 84); x.fillStyle = "#b03a2e"; x.beginPath(); x.arc(0, -36, 5, 0, 7); x.fill(); x.fillStyle = "#5a4630"; for (let l = 0; l < 4; l++) x.fillRect(-36, -18 + l * 14, 72 - (l % 2) * 20, 4); x.restore(); });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.1), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), wood]); board.position.y = 1.55; board.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 0.5), wood); roof.position.set(0, 2.32, 0.1); roof.rotation.x = 0.25;
  const postG = new THREE.CylinderGeometry(0.06, 0.07, 2.3, 6); [-1.05, 1.05].forEach((px) => { const p = new THREE.Mesh(postG, wood); p.position.set(px, 1.15, -0.02); g.add(p); });
  g.add(board, roof); g.userData.radius = 1.2;
  return g;
}
