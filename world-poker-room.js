// world-poker-room.js — ARCIA POKER LOUNGE as a room you walk in (b-pk3d): world-poker.js hands it its scene and the
// table's measures. Round walls with gold pilasters and neon arches, a marble floor with a carpet under the table,
// chandeliers, the cashier's bar (chips and missions), the week's board, a style mirror and the door back to town.
// Round the table: six chairs, and the players drawn as the game's heroes (ARON / LUMI / NEX in their colours) sitting
// in them; a win makes one cheer, a fold shakes its head. In the lobby your own hero walks the room (stick, keys, or a
// tap on a place's name) and each place offers what it does (world-poker.js shows the prompt).
// All drawn in code: no models but the heroes. Clip names are world-kit.js CU_AS keys only (sit, walk, sprint, idle,
// celebrate, emote-no, emote-yes) — there is no "run".
//
// makeLounge({ THREE, K, ver, low, coarse, scene, RX, RZ, slotPos })
//   → { stations, seat(d, look), react(d, kind), walkStart(look, at), walkStop(), step(dt, inp), tick(dt, t, cam),
//       camFollow(cam, dt), me(), goTo(id), near(), setBoard(rows), debug() }
export const HS = 1.55; // the heroes' scale here: the table is a lounge table, the heroes the town's height
const FLOOR = -1.25, WALL_R = 19, WALK_R = 15.2;

export function makeLounge({ THREE, K, ver, low, coarse, scene, RX, RZ, slotPos }) {
  const g = new THREE.Group(); g.name = "lounge"; scene.add(g);
  const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
  const tex = (c, rep) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); } return t; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glowM = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
  const add = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const faceIn = (x, z) => Math.atan2(-x, -z); // the rotation that turns a thing at (x, z) to look at the table

  // ---------------- the floor: dark marble with gold rings, a round carpet under the table ----------------
  {
    const [c, x] = cv(1024, 1024), r = 512; const gr = x.createRadialGradient(r, r, 0, r, r, r); gr.addColorStop(0, "#1d0f3a"); gr.addColorStop(0.7, "#120826"); gr.addColorStop(1, "#08041a");
    x.fillStyle = gr; x.fillRect(0, 0, 1024, 1024);
    x.globalAlpha = 0.07; x.strokeStyle = "#e9dcff"; for (let i = 0; i < 70; i++) { x.lineWidth = 1 + Math.random() * 2; x.beginPath(); let px = Math.random() * 1024, py = Math.random() * 1024; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (Math.random() - 0.5) * 220; py += (Math.random() - 0.5) * 220; x.lineTo(px, py); } x.stroke(); }
    x.globalAlpha = 1; x.strokeStyle = "#d8a84a"; for (const [rr, w] of [[0.42, 5], [0.44, 2], [0.78, 4], [0.8, 2], [0.97, 6]]) { x.lineWidth = w; x.beginPath(); x.arc(r, r, rr * r, 0, Math.PI * 2); x.stroke(); }
    x.lineWidth = 3; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; x.beginPath(); x.moveTo(r + Math.cos(a) * 0.44 * r, r + Math.sin(a) * 0.44 * r); x.lineTo(r + Math.cos(a) * 0.78 * r, r + Math.sin(a) * 0.78 * r); x.stroke(); }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(WALL_R + 0.5, 72), std({ map: tex(c), roughness: 0.32, metalness: 0.35, envMapIntensity: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; g.add(floor);
    const [cc, cx] = cv(512, 512); const g2 = cx.createRadialGradient(256, 256, 0, 256, 256, 256); g2.addColorStop(0, "#5a1442"); g2.addColorStop(0.85, "#3a0c30"); g2.addColorStop(1, "#2a0822");
    cx.fillStyle = g2; cx.fillRect(0, 0, 512, 512); cx.strokeStyle = "#e0b050"; cx.lineWidth = 8; cx.beginPath(); cx.arc(256, 256, 236, 0, Math.PI * 2); cx.stroke(); cx.lineWidth = 3; cx.beginPath(); cx.arc(256, 256, 218, 0, Math.PI * 2); cx.stroke();
    cx.globalAlpha = 0.18; cx.fillStyle = "#ffcf7a"; for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; cx.beginPath(); cx.arc(256 + Math.cos(a) * 227, 256 + Math.sin(a) * 227, 5, 0, Math.PI * 2); cx.fill(); }
    const carpet = new THREE.Mesh(new THREE.CircleGeometry(1, 64), std({ map: tex(cc), roughness: 0.95 })); carpet.rotation.x = -Math.PI / 2; carpet.position.y = FLOOR + 0.006; carpet.scale.set(RX + 4.6, RZ + 4.6, 1); g.add(carpet);
  }

  // ---------------- the walls: plum panels, gold pilasters, neon arches (their light in the emissive map) ----------------
  {
    const W = 2048, H = 512, [c, x] = cv(W, H), [e, y] = cv(W, H), P = 8; // 8 panels in this strip, the strip 4 times round
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#160a2e"); gr.addColorStop(0.55, "#24103f"); gr.addColorStop(1, "#12082a"); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    y.fillStyle = "#000"; y.fillRect(0, 0, W, H);
    const pw = W / P; for (let k = 0; k < P; k++) {
      const x0 = k * pw; x.fillStyle = "#c99a3e"; x.fillRect(x0, 0, 10, H); x.fillStyle = "#7a5520"; x.fillRect(x0 + 10, 0, 4, H);
      const col = ["#7a4dff", "#38d8ff", "#ff5ad8", "#ffc861"][k % 4];
      for (const z of [x, y]) { z.strokeStyle = col; z.lineWidth = 7; z.beginPath(); z.moveTo(x0 + 40, H - 40); z.lineTo(x0 + 40, 190); z.arc(x0 + pw / 2 + 5, 190, pw / 2 - 35, Math.PI, 0); z.lineTo(x0 + pw - 30, H - 40); z.stroke(); }
      x.fillStyle = "rgba(255,255,255,.04)"; x.fillRect(x0 + 52, 200, pw - 94, H - 252);
    }
    x.fillStyle = "#c99a3e"; x.fillRect(0, H - 28, W, 6); x.fillRect(0, 26, W, 6); y.fillStyle = "#ffc861"; y.fillRect(0, 26, W, 3);
    const m = std({ map: tex(c, 4), emissiveMap: tex(e, 4), emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.75, metalness: 0.15, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, 11, 96, 1, true), m); wall.position.y = FLOOR + 5.5; g.add(wall);
  }

  // ---------------- chandeliers over the table ----------------
  const ceil = new THREE.Group(); g.add(ceil); // (hidden at the table: the camera looks down through it)
  {
    const gold = std({ color: 0xe0b050, roughness: 0.25, metalness: 1 }), crys = glowM(0xfff1d0, 1.6), n = low ? 14 : 28, add = (m, x, y, z) => { m.position.set(x, y, z); ceil.add(m); return m; };
    for (const [cx, cz, s] of [[0, -1.2, 1], [0, 2.6, 0.8]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 * s, 0.07, 8, 64), gold); ring.rotation.x = Math.PI / 2; add(ring, cx, 8.6, cz);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.3 * s, 0.05, 8, 48), gold); ring2.rotation.x = Math.PI / 2; add(ring2, cx, 8.15, cz);
      const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.11, 0), crys, n), M = new THREE.Matrix4();
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, r = (k % 2 ? 2.2 : 1.3) * s; M.makeScale(1, 1.8, 1).setPosition(cx + Math.cos(a) * r, (k % 2 ? 8.35 : 7.9), cz + Math.sin(a) * r); im.setMatrixAt(k, M); }
      ceil.add(im);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), gold); add(rod, cx, 10.1, cz);
    }
  }

  // ---------------- a label on a board: a canvas plane ----------------
  const sign = (lines, w, h, opt = {}) => {
    const [c, x] = cv(1024, Math.round((1024 * h) / w)); x.textAlign = "center"; x.textBaseline = "middle";
    if (opt.bg) { x.fillStyle = opt.bg; x.fillRect(0, 0, c.width, c.height); }
    lines.forEach(([t, px, col, glow], i) => { x.font = `900 ${px}px sans-serif`; x.shadowColor = glow || col; x.shadowBlur = 26; x.fillStyle = col; x.fillText(t, 512, (c.height * (i + 0.5)) / lines.length); });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, toneMapped: false }));
  };
  const colliders = [{ x: 0, z: -RZ - 2.2, r: 1.3 }]; // { x, z, r }: what you walk round (the table is its own ellipse; ARCIA stands behind it)
  let doorG = null;
  const stations = []; // { id, x, z, r, at: [x, z] where you stand, label }
  // a thing at (x, z) turned by ry faces (sin ry, cos ry); its own x axis runs along (cos ry, -sin ry)
  const front = (x, z, ry, d) => [x + Math.sin(ry) * d, z + Math.cos(ry) * d];
  const along = (x, z, ry, offs, r, back = 0) => { for (const o of offs) colliders.push({ x: x + Math.cos(ry) * o + Math.sin(ry) * back, z: z - Math.sin(ry) * o + Math.cos(ry) * back, r }); };

  // ---------------- the cashier's bar (back left): chips and missions ----------------
  {
    const bx = -11.2, bz = -9.6, ry = faceIn(bx, bz), grp = new THREE.Group(); grp.position.set(bx, FLOOR, bz); grp.rotation.y = ry; g.add(grp);
    const wood = std({ color: 0x2a1238, roughness: 0.4, metalness: 0.2 }), top = std({ color: 0x0e0718, roughness: 0.15, metalness: 0.6 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.7, 1.5), wood); counter.position.set(0, 0.85, 0); grp.add(counter);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.8), top); slab.position.set(0, 1.77, 0); grp.add(slab);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.06, 0.04), glowM(0xffc861, 2)); strip.position.set(0, 1.62, 0.77); grp.add(strip);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 0.5), wood); shelf.position.set(0, 2.2, -2.2); grp.add(shelf);
    const cols = [0xff5ad8, 0x38d8ff, 0xffc861, 0x7a4dff, 0x5ff0d0], n = low ? 18 : 36, bot = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 8), glowM(0xffffff, 1), n), M = new THREE.Matrix4(), C = new THREE.Color();
    for (let k = 0; k < n; k++) { const row = k % 3, i = Math.floor(k / 3), per = Math.ceil(n / 3); M.makeTranslation(-2.9 + (i / Math.max(1, per - 1)) * 5.8, 1.1 + row * 1.25, -1.85); bot.setMatrixAt(k, M); bot.setColorAt(k, C.set(cols[k % cols.length]).multiplyScalar(0.9)); }
    grp.add(bot);
    const s = sign([["CHIPS & MISSIONS", 92, "#ffe2a8", "#ffc861"]], 6, 0.9); s.position.set(0, 4.9, -1.9); grp.add(s);
    along(bx, bz, ry, [-2.1, 0, 2.1], 1.45, -0.6);
    stations.push({ id: "cashier", x: bx, z: bz, r: 2.6, at: front(bx, bz, ry, 2.9), label: "Chips & missions", h: 5.6 });
  }
  // ---------------- the week's board (back right) ----------------
  let boardC = null, boardT = null;
  {
    const bx = 11.2, bz = -9.6, ry = faceIn(bx, bz), grp = new THREE.Group(); grp.position.set(bx, FLOOR, bz); grp.rotation.y = ry; g.add(grp);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.9, 0.3), std({ color: 0xc99a3e, roughness: 0.3, metalness: 1 })); frame.position.set(0, 3.6, -0.4); grp.add(frame);
    const [c] = cv(1024, 640); boardC = c; boardT = tex(c);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.6), new THREE.MeshBasicMaterial({ map: boardT, toneMapped: false })); scr.position.set(0, 3.6, -0.24); grp.add(scr);
    const legs = std({ color: 0x1a0c30, roughness: 0.5, metalness: 0.4 }); for (const lx of [-2.4, 2.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), legs); l.position.set(lx, 0.9, -0.4); grp.add(l); }
    along(bx, bz, ry, [-2.2, 0, 2.2], 1.2, -0.4);
    stations.push({ id: "board", x: bx, z: bz, r: 2.4, at: front(bx, bz, ry, 2.6), label: "This week's board", h: 6.2 });
  }
  function setBoard(rows) {
    if (!boardC) return; const x = boardC.getContext("2d"), W = boardC.width, H = boardC.height;
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#1b0d3c"); gr.addColorStop(1, "#0a0620"); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.textAlign = "center"; x.textBaseline = "middle"; x.font = "900 64px sans-serif"; x.shadowColor = "#ffc861"; x.shadowBlur = 20; x.fillStyle = "#ffe2a8"; x.fillText("🏆 WEEKLY TOP", W / 2, 70); x.shadowBlur = 0;
    const list = (rows || []).slice(0, 5); x.font = "800 44px sans-serif";
    if (!list.length) { x.fillStyle = "#e6dcff"; x.font = "800 46px sans-serif"; x.fillText("No winners yet this week", W / 2, H / 2 - 30); x.fillStyle = "#ffd23a"; x.font = "900 50px sans-serif"; x.fillText("Be the first! 🏆", W / 2, H / 2 + 50); x.font = "800 44px sans-serif"; } // (b-pky: an empty board asks you to take it)
    list.forEach((r, i) => { const yy = 170 + i * 92; x.textAlign = "left"; x.fillStyle = ["#ffd23a", "#e6ecff", "#ffb27a", "#cbbcff", "#cbbcff"][i]; x.fillText(`${i + 1}  ${String(r.name || "").slice(0, 16)}`, 80, yy); x.textAlign = "right"; x.fillStyle = r.n >= 0 ? "#5ff0d0" : "#ff8aa8"; x.fillText((r.n >= 0 ? "+" : "") + Math.round(r.n || 0).toLocaleString("en-US"), W - 80, yy); });
    boardT.needsUpdate = true;
  }
  setBoard([]);
  // ---------------- the style mirror (right wall) ----------------
  {
    const bx = 15.6, bz = 3.2, ry = faceIn(bx, bz), grp = new THREE.Group(); grp.position.set(bx, FLOOR, bz); grp.rotation.y = ry; g.add(grp);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 48), std({ color: 0xd8d0ff, roughness: 0.04, metalness: 1, envMapIntensity: 1.6 })); glass.scale.set(1.5, 2.3, 1); glass.position.set(0, 3, 0); grp.add(glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 64), glowM(0xff8ae0, 1.8)); rim.scale.set(1.55, 2.35, 1); rim.position.set(0, 3, 0.02); grp.add(rim);
    const s = sign([["STYLE", 120, "#ffd6f5", "#ff5ad8"]], 2.6, 0.7); s.position.set(0, 5.75, 0.05); grp.add(s);
    colliders.push({ x: bx, z: bz, r: 1.6 });
    stations.push({ id: "style", x: bx, z: bz, r: 2, at: front(bx, bz, ry, 2.5), label: "Card backs & felts", h: 6.4 });
  }
  // ---------------- the door back to town (front) ----------------
  {
    const bx = 0, bz = 17.6, grp = new THREE.Group(); grp.position.set(bx, FLOOR, bz); grp.rotation.y = faceIn(bx, bz); g.add(grp); doorG = grp;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 10, 48, Math.PI), glowM(0x38d8ff, 2)); arch.position.set(0, 3.6, 0); grp.add(arch);
    for (const sx of [-2.1, 2.1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.6, 0.24), glowM(0x38d8ff, 2)); p.position.set(sx, 1.8, 0); grp.add(p); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 5.6), new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false })); door.position.set(0, 2.8, -0.05); grp.add(door);
    const s = sign([["◀ TOWN", 120, "#d8f6ff", "#38d8ff"]], 2.8, 0.7); s.position.set(0, 6.3, 0); grp.add(s);
    stations.push({ id: "exit", x: bx, z: bz, r: 2.6, at: [0, 14.2], label: "Back to town", h: 6.6 });
  }
  // ---------------- sofas and plants along the walls ----------------
  {
    const vel = std({ color: 0x4a1a6a, roughness: 0.85 }), gold = std({ color: 0xc99a3e, roughness: 0.3, metalness: 1 }), leaf = std({ color: 0x1f8a5a, roughness: 0.7 }), pot = std({ color: 0x1a0c30, roughness: 0.3, metalness: 0.5 });
    for (const a of [-2.25, -1.85, 1.85, 2.25].map((k) => k + Math.PI / 2)) {
      const r = WALL_R - 1.5, x = Math.cos(a) * r, z = Math.sin(a) * r, grp = new THREE.Group(); grp.position.set(x, FLOOR, z); grp.rotation.y = faceIn(x, z); g.add(grp);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.2), vel); seat.position.y = 0.5; grp.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 0.35), vel); back.position.set(0, 1.2, -0.45); grp.add(back);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 1.25), gold); trim.position.y = 0.2; grp.add(trim);
      colliders.push({ x, z, r: 1.9 });
    }
    for (const [x, z] of [[-4.2, 16.4], [4.2, 16.4], [-15.5, -3], [15.4, -3.6]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.38, 0.9, 16), pot); add(p, x, FLOOR + 0.45, z);
      for (let k = 0; k < 3; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.7 - k * 0.15, 1.3, 7), leaf); add(l, x, FLOOR + 1.3 + k * 0.6, z, k); }
      colliders.push({ x, z, r: 0.9 });
    }
  }

  // ---------------- the chairs and the heroes in them ----------------
  const CHAIR_R = 1.3, chairs = [];
  {
    const vel = std({ color: 0x3a1460, roughness: 0.8 }), gold = std({ color: 0xc99a3e, roughness: 0.3, metalness: 1 });
    const seatG = new THREE.CylinderGeometry(0.62, 0.58, 0.28, 20), backG = new THREE.BoxGeometry(1.2, 1.25, 0.2), legG = new THREE.CylinderGeometry(0.08, 0.16, 0.62, 10);
    for (let d = 0; d < 6; d++) {
      const p = slotPos(d, CHAIR_R), grp = new THREE.Group(); grp.position.set(p.x, FLOOR, p.z); grp.rotation.y = faceIn(p.x, p.z); g.add(grp);
      const s = new THREE.Mesh(seatG, vel); s.position.y = 0.76; grp.add(s);
      const b = new THREE.Mesh(backG, vel); b.position.set(0, 1.45, -0.55); b.rotation.x = -0.12; grp.add(b);
      const l = new THREE.Mesh(legG, gold); l.position.y = 0.31; grp.add(l);
      chairs.push(grp);
    }
  }
  const pick = (look) => { const ids = (K && K.HERO_IDS) || ["custom-aron"]; const ch = look && ids.includes(look.ch) ? look.ch : (K && K.HERO_DEFAULT) || ids[0]; return { ch, tn: Math.max(0, Math.min(7, (look && look.tn) | 0)) }; };
  const pool = {}; // ch → heroes not in use (made once, shown again)
  async function heroOf(look) {
    const { ch, tn } = pick(look), list = pool[ch] || (pool[ch] = []);
    let h = list.pop();
    if (!h) { h = await K.makeCharacter(ch, ver).catch(() => null); if (!h) return null; h.obj.scale.setScalar(HS); h.ch = ch; h.obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); }
    if (h.setTint) h.setTint(tn); h.obj.visible = true; g.add(h.obj); return h;
  }
  const give = (h) => { if (!h) return; g.remove(h.obj); h.obj.visible = false; (pool[h.ch] || (pool[h.ch] = [])).push(h); };
  const seats = Array.from({ length: 6 }, () => ({ key: "", h: null, wait: 0 }));
  // in a chair: CU_AS "drive" (the borrowed KayKit Sit_Chair_Idle; "sit" is on the floor, legs out), the feet on the floor
  const SIT_CLIP = "drive", SIT_Y = FLOOR, SIT_TURN = 0;
  /// who sits at drawn seat d: { ch, tn } or null (an empty chair)
  function seat(d, look) {
    const S = seats[d], key = look ? pick(look).ch + ":" + pick(look).tn : ""; if (S.key === key) return; S.key = key; const my = ++S.wait;
    give(S.h); S.h = null; if (!look || low) return;
    heroOf(look).then((h) => { if (!h) return; if (S.wait !== my) { give(h); return; } S.h = h; const p = slotPos(d, CHAIR_R - 0.08); h.obj.position.set(p.x, SIT_Y, p.z); h.obj.rotation.y = faceIn(p.x, p.z) + SIT_TURN; h.play(SIT_CLIP); });
  }
  /// a seat's moment: "win" (a cheer), "fold" (a shake of the head), "hi" (a wave)
  function react(d, kind) { const h = seats[d] && seats[d].h; if (!h || (h.busy && h.busy())) return; h.play(kind === "win" ? "celebrate" : kind === "fold" ? "emote-no" : "emote-yes", { once: true }); }

  // ---------------- you, walking the room ----------------
  let me = null, meLook = "", pos = new THREE.Vector3(0, FLOOR, 9.5), face = Math.PI, walking = false, auto = null, vel = 0, myWait = 0;
  const camAt = new THREE.Vector3(), camLook = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  async function walkStart(look, at) {
    walking = true; auto = null; if (at) { pos.x = at[0]; pos.z = at[1]; face = faceIn(at[0], at[1]); }
    const key = pick(look).ch + ":" + pick(look).tn, my = ++myWait;
    if (!me || meLook !== key) { give(me); me = null; meLook = key; const h = await heroOf(look); if (my !== myWait || !walking) { give(h); return; } me = h; }
    if (me) { me.obj.visible = true; if (!me.obj.parent) g.add(me.obj); me.obj.position.copy(pos); me.obj.rotation.y = face; me.play("idle"); }
    { const want = pos.z + 9, z = Math.min(want, 17.4); camAt.set(pos.x * 0.9, FLOOR + 7 + (want - z) * 0.7, z); camLook.set(pos.x, FLOOR + 2.2, pos.z - 3.5); }
  }
  function walkStop() { walking = false; auto = null; myWait++; if (me) me.obj.visible = false; }
  const ellipseOut = (x, z, m) => (x / (RX + m)) ** 2 + (z / (RZ + m)) ** 2 >= 1;
  function blocked(x, z) {
    if (Math.hypot(x, z) > WALK_R) return true;
    if (!ellipseOut(x, z, 2.1)) return true;
    return colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  }
  // a tap on a place's name walks you there round the table: the shortest way through a ring of points about it
  const RING = Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return [Math.cos(a) * (RX + 3.3), Math.sin(a) * (RZ + 3.3)]; }).filter(([x, z]) => !blocked(x, z));
  function clear(ax, az, bx, bz) { const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4)); for (let i = 1; i <= n; i++) { const k = i / n; if (blocked(ax + (bx - ax) * k, az + (bz - az) * k)) return false; } return true; }
  function route(ax, az, bx, bz) {
    if (clear(ax, az, bx, bz)) return [[bx, bz]];
    const N = [[ax, az], ...RING, [bx, bz]], dist = N.map(() => Infinity), prev = N.map(() => -1), done = N.map(() => false); dist[0] = 0;
    for (;;) { let u = -1; for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i; if (u < 0 || u === N.length - 1) break; done[u] = true;
      for (let v = 0; v < N.length; v++) { if (done[v] || v === u) continue; const d = Math.hypot(N[v][0] - N[u][0], N[v][1] - N[u][1]); if (dist[u] + d < dist[v] && clear(N[u][0], N[u][1], N[v][0], N[v][1])) { dist[v] = dist[u] + d; prev[v] = u; } } }
    if (prev[N.length - 1] < 0) return [[bx, bz]]; const out = []; for (let v = N.length - 1; v > 0; v = prev[v]) out.unshift(N[v]); return out;
  }
  const TABLE_AT = [0, RZ + 2.7];
  function goTo(id) { const s = stations.find((x) => x.id === id) || (id === "table" ? { at: TABLE_AT } : null); if (!s || !walking) return; const path = route(pos.x, pos.z, s.at[0], s.at[1]); auto = { path, id, x: path[0][0], z: path[0][1], stuck: 0 }; }
  /// inp: { x, y } in -1..1 (the stick or the keys: y up is away from the camera), fast
  function step(dt, inp) {
    if (!walking) return;
    let mx = inp ? inp.x : 0, mz = inp ? -inp.y : 0; const hand = Math.hypot(mx, mz) > 0.12;
    if (hand) auto = null;
    else if (auto) {
      let dx = auto.x - pos.x, dz = auto.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.45) { auto.path.shift(); if (!auto.path.length) auto = null; else { auto.x = auto.path[0][0]; auto.z = auto.path[0][1]; dx = auto.x - pos.x; dz = auto.z - pos.z; d = Math.hypot(dx, dz); } }
      if (auto && d > 0) { mx = dx / d; mz = dz / d; }
    }
    // the stick's y is up on the screen, which is -z in the room (the camera looks toward the dealer); mz above is +z down
    const len = Math.hypot(mx, mz), want = len > 0.05 ? Math.min(1, len) * ((inp && inp.fast) || (auto && Math.hypot(auto.x - pos.x, auto.z - pos.z) > 8) ? 9 : 5.6) : 0;
    vel += (want - vel) * Math.min(1, dt * 10);
    if (vel > 0.05 && len > 0.05) {
      const ux = mx / len, uz = mz / len, nx = pos.x + ux * vel * dt, nz = pos.z + uz * vel * dt;
      const ox = pos.x, oz = pos.z;
      if (!blocked(nx, nz)) { pos.x = nx; pos.z = nz; } else if (!blocked(nx, pos.z)) pos.x = nx; else if (!blocked(pos.x, nz)) pos.z = nz;
      // (walking into something: slide along it, the way round that keeps closer to where you were going)
      else { const px = -uz, pz = ux; for (const sg of [1, -1]) { const tx = pos.x + px * sg * vel * dt, tz = pos.z + pz * sg * vel * dt; if (!blocked(tx, tz)) { pos.x = tx; pos.z = tz; break; } } }
      if (auto) { auto.stuck = Math.hypot(pos.x - ox, pos.z - oz) < vel * dt * 0.2 ? auto.stuck + dt : 0; if (auto.stuck > 1.2) auto = null; }
      const a = Math.atan2(ux, uz); let da = a - face; da = Math.atan2(Math.sin(da), Math.cos(da)); face += da * Math.min(1, dt * 12);
    }
    if (me) {
      me.obj.position.set(pos.x, FLOOR, pos.z); me.obj.rotation.y = face;
      const clip = vel > 7.5 ? "sprint" : vel > 0.6 ? "walk" : "idle";
      if (!me.busy || !me.busy()) me.play(clip, { speed: clip === "walk" ? Math.max(0.8, vel / 5.6) : 1 });
    }
  }
  /// the station you're at (within its reach of where you stand), or the table, or null
  function near() {
    if (!walking) return null;
    const tr = (pos.x / (RX + 3.6)) ** 2 + (pos.z / (RZ + 3.6)) ** 2; if (tr < 1) return { id: "table", label: "ARCIA's table" };
    for (const s of stations) if (Math.hypot(pos.x - s.at[0], pos.z - s.at[1]) < s.r) return s;
    return null;
  }
  /// the third-person camera behind and above you, eased
  function camFollow(cam, dt) {
    const k = Math.min(1, dt * 5), want = pos.z + 9, z = Math.min(want, 17.4), lift = (want - z) * 0.7;
    camAt.lerp(tA.set(pos.x * 0.9, FLOOR + 7 + lift, z), k); camLook.lerp(tB.set(pos.x, FLOOR + 2.2, pos.z - 3.5), k);
    cam.position.copy(camAt); cam.lookAt(camLook); cam.updateMatrixWorld();
    if (doorG) doorG.visible = cam.position.z < 17; // (from just inside the door it would fill the view)
  }
  function tick(dt, t) {
    for (const S of seats) if (S.h) { S.h.update(dt, t); if (!S.h.busy || !S.h.busy()) S.h.play(SIT_CLIP); }
    if (me && me.obj.visible) me.update(dt, t);
  }
  function facing(h, d) {
    if (!h) return null; const a = new THREE.Vector3(), b = new THREE.Vector3(); let na = 0, nb = 0; h.obj.updateMatrixWorld(true);
    h.obj.traverse((o) => { if (!o.isBone) return; if (/^mixamorig[:_]?head$/i.test(o.name)) { o.getWorldPosition(a); na = 1; } else if (/^headfront$/i.test(o.name)) { o.getWorldPosition(b); nb = 1; } }); // (the heroes' rigs carry a "headfront" bone in front of the face)
    if (!na || !nb) return null; const f = b.sub(a).setY(0).normalize(), p = slotPos(d, 1), to = new THREE.Vector3(-p.x, 0, -p.z).normalize(); return Math.round(f.dot(to) * 100) / 100;
  }
  return {
    show: (kind) => { ceil.visible = kind !== "table"; },
    stations, seat, react, walkStart, walkStop, step, near, camFollow, tick, goTo, setBoard, walking: () => walking,
    me: () => ({ x: pos.x, z: pos.z }),
    /// tests: does a seated hero face the table? its knees (in front of its hips when it sits) against the way to the middle: > 0 yes
    facing: (d) => facing(seats[d].h, d),
    bones: (d) => { const h = seats[d].h, n = []; if (h) h.obj.traverse((o) => { if (o.isBone) n.push(o.name); }); return n; },
    /// tests: the clip each hero is playing
    debug: () => { const clip = (h) => (h && h.mixer && h.mixer._actions ? h.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name) : []); return { me: me ? { ch: me.ch, x: pos.x, z: pos.z, vel, clips: clip(me) } : null, seats: seats.map((S, d) => (S.h ? { ch: S.h.ch, clips: clip(S.h), faces: facing(S.h, d) } : null)), near: (near() || {}).id || "", auto: auto ? { path: auto.path, stuck: auto.stuck } : null }; },
  };
}
