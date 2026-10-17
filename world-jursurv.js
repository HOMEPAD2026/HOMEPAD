// world-jursurv.js — Jurassic World's survival on the page (world-jurassic.js hands it the land): what you can chop, mine,
// pick and hunt in reach, the swings, the server's say on each one (api/_world-jur.mjs: how many swings, the drop, when
// it grows back), your pack and what you can make from it, your camp (the workbench and the campfire stand there), the
// goal card, the numbers floating up, and the trunks and boulders you can't walk through. No ARCL is paid here (yet).
//
// The land's things come as nodes: { id, kind (the server's: tree, palm, ancient, fern, bush, log, rock), x, z, cr (the
// trunk's radius you bump into, 0 for none), hr (how far from its middle you can reach it), hide(), show() }. The dinosaurs
// come as targets through hooks.dinos(): { id, kind (raptor, trike, alpha, spino), x, z, hr, alive, hurt(), die(), revive() }.
// the 20 camp spots round the gate (api/_world-jur.mjs JUR.CAMPS): kept clear of trees and rocks, safe from dinosaurs
export const CAMPS = [[17, 67], [30, 47], [25, 25], [5, 12], [-17, 17], [-30, 37], [-25, 59], [0, 92], [35, 77], [50, 38], [-4, -8], [-35, 7], [-50, 46], [-35, 77], [12, 111], [35, 103], [54, 87], [66, 66], [68, 24], [-18, -26]];
export const CAMP_R = 9;
const ICON = { wood: "🪵", hardwood: "🌳", stone: "🪨", flint: "🔺", clay: "🟤", fiber: "🌾", berries: "🫐", amber: "🟠", hide: "🟫", bone: "🦴", meat: "🥩", cooked: "🍖", torch: "🔥", rope: "🪢", fang: "🦷", cu: "🟧", ag: "⬜", au: "🟨" };
const MAT_N = { wood: "Wood", hardwood: "Hardwood", stone: "Stone", flint: "Flint", clay: "Clay", fiber: "Fiber", berries: "Berries", amber: "Amber", hide: "Hide", bone: "Bone", meat: "Raw meat", cooked: "Cooked meat", torch: "Torch", rope: "Rope", fang: "Fang", cu: "Copper ore", ag: "Silver ore", au: "Gold ore" };
const NODE_N = { tree: "Tree", palm: "Palm", ancient: "Ancient tree", fern: "Fern", bush: "Bush", log: "Log", rock: "Rock", raptor: "Raptor", trike: "Triceratops", alpha: "Alpha Raptor", spino: "Spinosaurus", titan: "Thornback Titan", claw: "Clawstrider" };
const VERB = { tree: "Chop", palm: "Chop", ancient: "Chop", fern: "Gather", bush: "Gather", log: "Chop", rock: "Mine", raptor: "Hunt", trike: "Hunt", alpha: "Hunt", spino: "Hunt", titan: "Hunt", claw: "Hunt" };
// XP for each one (× what a scammer of your level gives, 6 + 3·level): the work counts towards your level
const XP_K = { tree: 1, palm: 0.8, ancient: 5, fern: 0.25, bush: 0.25, log: 0.6, rock: 1.4, raptor: 3, trike: 6, alpha: 20, spino: 12, titan: 25, claw: 4.5 };
const FOOD = { berries: 12, meat: 25, cooked: 45 };
// the dinosaurs' card (like a boss bar in town): level, HP (shown; the server counts the hits), about how many hits
const FOE = { raptor: { lv: 8, hp: 900, n: 12 }, claw: { lv: 14, hp: 1700, n: 21 }, trike: { lv: 18, hp: 2800, n: 28 }, alpha: { lv: 30, hp: 7000, n: 70, boss: 1 }, spino: { lv: 26, hp: 5200, n: 51 }, titan: { lv: 35, hp: 9000, n: 80, boss: 1 } };
const ORE = ["cu", "ag", "au"];

export function createSurvival(H) {
  const { THREE, T, esc, toast, ctx } = H;
  const Snd = ctx.Snd || {};
  const nodes = H.nodes, grid = new Map(), GC = 10;
  const key = (x, z) => Math.floor(x / GC) + "," + Math.floor(z / GC);
  for (const n of nodes) { const k = key(n.x, n.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
  const near = (x, z, fn) => { const cx = Math.floor(x / GC), cz = Math.floor(z / GC); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(cx + i + "," + (cz + j)); if (l) for (const n of l) fn(n); } };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let inv = null, ore = {}, felled = {}, recipes = {}, pieceDefs = {}, camps = { list: [], free: 20 }, home = -1, campFull = false, signedOut = false, loaded = false;
  let tgt = null, work = null, busy = false, ui = null;

  // ---------------- the server ----------------
  async function api(action, extra = {}) {
    const s = ctx.sess && ctx.sess(); if (!s) return { ok: false, status: 401, j: { error: T("Sign in to gather") } };
    try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, status: 0, j: { error: String((e && e.message) || e) } }; }
  }
  async function load() {
    const s = ctx.sess && ctx.sess(); signedOut = !s; if (!s) { paint(); return; }
    try {
      const r = await fetch("/api/social?world=jur&wallet=" + s.wallet, { cache: "no-store" }); const j = r.ok ? await r.json() : null;
      if (j && j.ok) { inv = j.inv; ore = j.ore || {}; felled = j.felled || {}; recipes = j.recipes || {}; pieceDefs = j.pieces || {}; camps = j.camps || camps; home = j.home ?? -1; loaded = true; applyFelled();
        // your camp spot: the first free one round the gate; when all 20 are taken you join someone's (from the pack)
        if (home < 0 && !campFull) { const r2 = await api("world-jur-camp", { op: "claim" }); if (r2.ok) { home = r2.j.home; camps = r2.j.camps; } else if (r2.j && r2.j.full) { campFull = true; if (r2.j.camps) camps = r2.j.camps; } }
        drawCamps(); }
    } catch { /* the pack shows as empty until the next try */ }
    paint();
  }
  // what's felled stays down until it grows back (the server's time); what's back stands again
  function applyFelled() {
    const t = Date.now();
    for (const n of nodes) { const down = (felled[n.id] || 0) > t; if (down !== !!n.down) { n.down = down; if (down) n.hide(); else n.show(); } }
    if (H.dinos) for (const d of H.dinos()) { const dead = (felled[d.id] || 0) > t; if (dead && d.alive) d.die(true); else if (!dead && !d.alive && d.diedAt && t - d.diedAt > 3000) d.revive(); }
  }

  // ---------------- what's in reach ----------------
  let sel = null, selT = 0, ring = null;
  function select(o) { if (o && !FOE[o.kind]) return; sel = o; selT = 0; paintFoe(); }
  function pick(px, pz, face) {
    if (sel && sel.alive && Math.hypot(sel.x - px, sel.z - pz) < sel.hr + 1.9) return sel;
    let best = null, bs = 1e9;
    const consider = (o, alive) => { if (!alive) return; const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz), reach = o.hr + 1.7; if (d > reach) return;
      let da = Math.atan2(dx, dz) - face; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); const sc = d - o.hr + da * 1.4; if (sc < bs) { bs = sc; best = o; } };
    near(px, pz, (n) => consider(n, !n.down));
    if (H.dinos) for (const d of H.dinos()) consider(d, d.alive);
    return best;
  }
  // the trunks, boulders and the camp's pieces: pushed back out of them
  function collide(x, z) {
    const R = 0.45; near(x, z, (n) => { if (!n.cr || n.down) return; const dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz), m = n.cr + R; if (d < m && d > 1e-4) { x = n.x + dx / d * m; z = n.z + dz / d * m; } });
    // the dinosaurs' bodies too (you walked into them)
    if (H.dinos) for (const o of H.dinos()) { if (!o.alive) continue; const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), m = o.hr * 0.85 + R; if (d < m && d > 1e-4) { x = o.x + dx / d * m; z = o.z + dz / d * m; } }
    for (const c of campSolid) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + R; if (d < m && d > 1e-4) { x = c.x + dx / d * m; z = c.z + dz / d * m; } }
    return [x, z];
  }

  // ---------------- a swing ----------------
  let swingT = 0;
  function swing(px, pz, face) {
    const now = performance.now(); if (now - swingT < 430) return false; swingT = now;
    const o = tgt || pick(px, pz, face); if (!o) { H.swingAnim(); return true; }
    H.faceTo(Math.atan2(o.x - px, o.z - pz)); H.swingAnim();
    if (signedOut) { toast(T("Sign in to gather")); return true; }
    if (!work || work.o !== o) { work = { o, hits: 0, need: 0, started: null, breaking: false }; work.started = api("world-jur-start", { node: o.id, kind: o.kind }).then((r) => { if (!work || work.o !== o) return; if (r.ok) work.need = r.j.need; else { toast(T("Couldn't gather: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); work = null; } }); }
    work.hits++;
    if (FOE[o.kind]) { if (sel !== o) select(o); const F = FOE[o.kind], need = work.need || F.n * (inv && (inv.tools.spear | 0) ? 1 : 1.4), dmg = Math.round(F.hp / need * (0.85 + Math.random() * 0.3));
      o.hpNow = Math.max(work.need && work.hits >= work.need ? 0 : 1, (o.hpNow ?? F.hp) - dmg); o.hpAt = performance.now(); pop(o, "-" + dmg.toLocaleString("en-US"), "dmg", 0.4); paintFoe(); }
    const k = o.kind; if (k === "rock") (Snd.chink || Snd.hit || (() => {}))(0); else if (k === "raptor" || k === "trike" || k === "alpha" || k === "spino" || k === "titan" || k === "claw") { (Snd.hitFx || Snd.hit || (() => {}))(0); if (o.hurt) o.hurt(); } else if (k === "fern" || k === "bush") (Snd.pick || (() => {}))(); else (Snd.chop || Snd.hit || (() => {}))();
    if (o.shake) o.shake();
    chips(o);
    if (work.need && work.hits >= work.need) finish(work);
    paint(); return true;
  }
  async function finish(w) {
    if (w.breaking) return; w.breaking = true; await w.started;
    let r = null; for (let i = 0; i < 4; i++) { r = await api("world-jur-break", { node: w.o.id }); if (r.ok || r.status !== 429 || /full day/.test(String(r.j && r.j.error))) break; await new Promise((ok) => setTimeout(ok, 600)); }
    if (work === w) work = null;
    if (!r || !r.ok) { toast(T("Couldn't gather: {e}", { e: String((r && r.j && r.j.error) || "").slice(0, 60) })); paint(); return; }
    const j = r.j, o = w.o; inv = j.inv; if (j.ore) ore = j.ore.inv || j.ore; felled[o.id] = j.regrowAt;
    const isDino = o.kind === "raptor" || o.kind === "trike" || o.kind === "alpha" || o.kind === "spino" || o.kind === "titan" || o.kind === "claw";
    if (isDino) { o.die(); o.hpNow = 0; paintFoe(); (Snd.kill || (() => {}))(); } else { o.down = true; o.hide(); if (o.kind === "tree" || o.kind === "ancient" || o.kind === "palm") (Snd.timber || (() => {}))(); else if (o.kind === "rock") (Snd.crumble || (() => {}))(0); else (Snd.pick || (() => {}))(); }
    const parts = Object.entries(j.loot || {}).filter(([m]) => m !== "ore").map(([m, n]) => `${ICON[m] || ""}+${n}`);
    if (j.loot && j.loot.ore) for (const [m, n] of Object.entries(j.loot.ore)) parts.push(`${ICON[m]}+${n}`);
    pop(o, parts.join(" ") || T("Nothing this time"), "loot");
    const lv = ctx.level ? ctx.level() : 1, xp = Math.round((6 + 3 * lv) * (XP_K[o.kind] || 1));
    if (xp && ctx.gain) { try { ctx.gain(xp, T(NODE_N[o.kind] || "Gathering")); setTimeout(() => pop(o, `+${xp.toLocaleString("en-US")} XP`, "xp", 0.6), 380); } catch { /* the level waits */ } }
    tgt = null; paint();
  }

  // ---------------- making and eating ----------------
  const have = (m) => (ORE.includes(m) ? ore[m] || 0 : (inv && inv.mat[m]) || 0);
  const canMake = (R) => Object.entries(R.need).every(([m, n]) => have(m) >= n);
  const homeCamp = () => camps.list.find((c) => c.slot === home) || null;
  const campHas = (k) => { const c = homeCamp(); return !!(c && c.pieces.some((p) => p.k === k)); };
  const atOk = (R) => !R.at || (R.at === "bench" ? campHas("bench") : campHas("campfire"));
  const owned = (R) => !!(R.tool && inv && (inv.tools[R.tool[0]] | 0) >= R.tool[1]);
  async function make(id) {
    if (busy) return; busy = true; const R = recipes[id];
    const r = await api("world-jur-craft", { recipe: id }); busy = false;
    if (!r.ok) { toast(T("Couldn't make it: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    inv = r.j.inv; if (r.j.ore) ore = r.j.ore;
    (Snd.equip || Snd.buy || (() => {}))(); toast(T("Made: {x}", { x: T(R ? R.name : id) })); paint(); paintPack();
  }
  async function eat(f) {
    if (busy) return; const hp = ctx.vitals && ctx.vitals(); if (hp && hp.hp >= hp.max) { toast(T("You're not hungry")); return; }
    busy = true; const r = await api("world-jur-eat", { food: f }); busy = false;
    if (!r.ok) { toast(T("Couldn't eat: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    inv = r.j.inv; if (ctx.heal) ctx.heal((FOOD[f] || 10) / 100); (Snd.pick || (() => {}))(); paint(); paintPack();
  }

  // ---------------- the camps: a ring of stones and a sign for each one taken, what's built there ----------------
  const campSolid = []; let campGs = [], fires = [];
  const MAT = {};
  const mat = (k, c, o = {}) => MAT[k] || (MAT[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o }));
  const flameM = () => MAT.flame || (MAT.flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
  // one built piece as a mesh (its collider radius in userData.r; flames to flicker in userData.fire)
  function pieceMesh(k) {
    const g = new THREE.Group(), wood = mat("wood", 0x8a5a32), dark = mat("dark", 0x5a3a20, { roughness: 0.95 }), stone = mat("stone", 0x77736b, { roughness: 1, flatShading: true }), thatch = mat("thatch", 0xb8935a, { roughness: 1, flatShading: true });
    g.userData.r = 0.6;
    if (k === "bench") { g.add(box(2.2, 0.16, 1.1, wood, 0, 0.95)); for (const [x, z] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) g.add(box(0.14, 0.9, 0.14, dark, x, 0.45, z)); g.add(box(0.7, 0.04, 0.2, mat("steel", 0x9aa3ad, { metalness: 0.7, roughness: 0.35 }), 0.4, 1.06, 0.1)); g.userData.r = 1.1; }
    else if (k === "campfire") { const sg = new THREE.DodecahedronGeometry(0.2, 0); for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, o = new THREE.Mesh(sg, stone); o.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62); g.add(o); }
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6), dark); l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; l.position.y = 0.14; g.add(l); }
      const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 8, 1, true), flameM()); f1.position.y = 0.55; g.add(f1); g.userData.fire = f1; g.userData.r = 0.75; }
    else if (k === "hut") { g.add(box(4.2, 0.2, 4.2, dark, 0, 0.1)); const W = 4, H0 = 2.3;
      g.add(box(W, H0, 0.18, wood, 0, H0 / 2, -W / 2)); g.add(box(0.18, H0, W, wood, -W / 2, H0 / 2, 0)); g.add(box(0.18, H0, W, wood, W / 2, H0 / 2, 0));
      g.add(box(1.4, H0, 0.18, wood, -1.3, H0 / 2, W / 2)); g.add(box(1.4, H0, 0.18, wood, 1.3, H0 / 2, W / 2)); g.add(box(1.2, 0.5, 0.18, wood, 0, H0 - 0.25, W / 2));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.9, 4), thatch); roof.rotation.y = Math.PI / 4; roof.position.y = H0 + 0.95; g.add(roof); g.userData.r = 2.3; }
    else if (k === "bed") { g.add(box(1.1, 0.35, 2.1, wood, 0, 0.18)); g.add(box(1, 0.16, 1.9, mat("hide", 0xa0703f), 0, 0.42)); g.add(box(0.8, 0.14, 0.4, mat("fur", 0xd9c39a), 0, 0.55, -0.7)); g.userData.r = 0.9; }
    else if (k === "chest") { g.add(box(1, 0.6, 0.62, wood, 0, 0.3)); g.add(box(1.04, 0.16, 0.66, dark, 0, 0.66)); g.add(box(0.14, 0.18, 0.06, mat("brass", 0xd8b04a, { metalness: 0.6, roughness: 0.4 }), 0, 0.5, 0.33)); g.userData.r = 0.6; }
    else if (k === "fence") { for (const x of [-0.95, 0, 0.95]) g.add(box(0.14, 1.1, 0.14, dark, x, 0.55)); g.add(box(2, 0.1, 0.08, wood, 0, 0.75)); g.add(box(2, 0.1, 0.08, wood, 0, 0.4)); g.userData.r = 0.5; }
    else if (k === "wall") { g.add(box(2, 2.2, 0.2, wood, 0, 1.1)); g.userData.r = 0.6; }
    else if (k === "floor") { g.add(box(2, 0.12, 2, dark, 0, 0.06)); g.userData.r = 0; }
    else if (k === "torchpost") { g.add(box(0.14, 1.6, 0.14, dark, 0, 0.8)); const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 7, 1, true), flameM()); f.position.y = 1.78; g.add(f); g.userData.fire = f; g.userData.r = 0.3; }
    else return null;
    return g;
  }
  function drawCamps() {
    if (!H.scene) return;
    for (const g of campGs) H.scene.remove(g); campGs = []; campSolid.length = 0; fires = [];
    const sg = new THREE.DodecahedronGeometry(0.22, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (const c of camps.list) {
      const g = new THREE.Group(), y0 = H.height(c.x, c.z); g.position.set(c.x, y0, c.z); H.scene.add(g); campGs.push(g);
      const ring = new THREE.InstancedMesh(sg, mat("stone", 0x77736b, { roughness: 1, flatShading: true }), 36);
      for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, x = Math.cos(a) * CAMP_R, z = Math.sin(a) * CAMP_R; v.set(x, H.height(c.x + x, c.z + z) - y0 + 0.05, z); s3.setScalar(0.7 + ((i * 37) % 10) / 15); q.setFromEuler(new THREE.Euler(i, i * 2, 0)); ring.setMatrixAt(i, m4.compose(v, q, s3)); }
      ring.instanceMatrix.needsUpdate = true; ring.receiveShadow = true; g.add(ring);
      const mine = c.slot === home;
      if (ctx.K && ctx.K.label) { const tag = ctx.K.label(mine ? T("Your camp") : T("{w}'s camp", { w: c.owner }), { accent: mine ? "#39ff88" : "#9fd0ff", size: 0.5, sub: c.members > 1 ? T("{n} living here", { n: c.members }) : "" }); tag.position.set(0, 2.2, -CAMP_R + 0.4); g.add(tag); }
      for (const p of c.pieces) { const o = pieceMesh(p.k); if (!o) continue; o.position.set(p.x, H.height(c.x + p.x, c.z + p.z) - y0, p.z); o.rotation.y = (p.r || 0) * Math.PI / 2;
        o.traverse((m) => { if (m.isMesh && !m.material.blending) { m.castShadow = !!H.shadows; m.receiveShadow = true; } }); g.add(o);
        if (o.userData.fire) fires.push(o.userData.fire); if (o.userData.r) campSolid.push({ x: c.x + p.x, z: c.z + p.z, r: o.userData.r }); }
    }
  }
  // building: in your camp a Build button; pick a piece, a see-through ghost of it stands in front of you on the
  // camp's 1 m grid (green where it can go), turn it, place it (the server takes the materials)
  let ghost = null, ghostK = "", ghostR = 0, ghostAt = null;
  const inHome = (px, pz) => { const c = homeCamp(); return c && Math.hypot(px - c.x, pz - c.z) < CAMP_R + 1.5 ? c : null; };
  function startGhost(k) {
    endGhost(); const o = pieceMesh(k); if (!o) return; ghostK = k; ghostR = 0;
    const gm = new THREE.MeshBasicMaterial({ color: 0x7dffc8, transparent: true, opacity: 0.45, depthWrite: false });
    o.traverse((m) => { if (m.isMesh) m.material = gm; }); o.userData.gm = gm; ghost = o; H.scene.add(o);
    if (ui) { ui.ghostBar.hidden = false; ui.build.hidden = true; } paint();
  }
  function endGhost() { if (ghost) H.scene.remove(ghost); ghost = null; ghostK = ""; ghostAt = null; if (ui) ui.ghostBar.hidden = true; }
  function tickGhost(px, pz, face) {
    if (!ghost) return; const c = inHome(px, pz); if (!c) { endGhost(); return; }
    const off = 1.6 + (ghost.userData.r || 0.6) * 1.3; let gx = Math.round(px + Math.sin(face) * off - c.x), gz = Math.round(pz + Math.cos(face) * off - c.z); const d = Math.hypot(gx, gz); if (d > CAMP_R) { gx = Math.round(gx / d * CAMP_R); gz = Math.round(gz / d * CAMP_R); }
    const RAD = { hut: 2.2, bench: 1.1, campfire: 0.8, bed: 1, chest: 0.6, fence: 0.7, wall: 0.7, floor: 0, torchpost: 0.3 }, rr = RAD[ghostK] ?? 0.6;
    const taken = c.pieces.some((p) => p.x === gx && p.z === gz), crowded = !!rr && c.pieces.some((p) => (RAD[p.k] ?? 0.6) && Math.hypot(p.x - gx, p.z - gz) < (rr + (RAD[p.k] ?? 0.6)) * 0.8), def = pieceDefs[ghostK], ok = !taken && !crowded && def && canMake(def) && !(def.station && c.pieces.some((p) => p.k === ghostK));
    ghostAt = { gx, gz, ok, taken, c }; ghost.position.set(c.x + gx, H.height(c.x + gx, c.z + gz) + 0.02, c.z + gz); ghost.rotation.y = ghostR * Math.PI / 2;
    ghost.userData.gm.color.setHex(ok ? 0x7dffc8 : 0xff6b7d);
    if (ui) { ui.ghostBar.querySelector('[data-g="place"]').disabled = !ok; ui.ghostBar.querySelector('[data-g="down"]').hidden = !taken; }
  }
  async function ghostDo(op) {
    if (!ghostAt || busy) return; const { gx, gz, c } = ghostAt; busy = true;
    const r = await api("world-jur-build", { op, piece: { k: op === "remove" ? (c.pieces.find((p) => p.x === gx && p.z === gz) || {}).k : ghostK, x: gx, z: gz, r: ghostR } }); busy = false;
    if (!r.ok) { toast(T("Couldn't build: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    inv = r.j.inv; const cc = camps.list.find((x) => x.slot === r.j.slot); if (cc) cc.pieces = r.j.plot; drawCamps();
    (Snd.place || Snd.equip || (() => {}))(); if (op === "place") { toast(T("Built: {x}", { x: T((pieceDefs[ghostK] || {}).name || ghostK) })); if (pieceDefs[ghostK] && pieceDefs[ghostK].station) endGhost(); }
    paint(); paintPack();
  }
  function paintBuild() {
    if (!ui || ui.build.hidden) return;
    const c = homeCamp(), chip = (m, need) => `<span class="wz-chip${have(m) < need ? " short" : ""}">${ICON[m] || ""}<b>${Math.min(have(m), need)}/${need}</b></span>`;
    const rows = Object.entries(pieceDefs).map(([k, P]) => { const one = P.station && c && c.pieces.some((p) => p.k === k), ok = canMake(P) && !one;
      return `<li class="${ok ? "ok" : ""}${one ? " own" : ""}"><div><b>${esc(T(P.name || k))}</b><p>${Object.entries(P.need).map(([m, n]) => chip(m, n)).join("")}</p></div><button type="button" data-build="${esc(k)}" ${ok ? "" : "disabled"}>${esc(one ? T("Built") : T("Build"))}</button></li>`; }).join("");
    ui.build.querySelector(".wz-pack-in").innerHTML = `<header><b>${esc(T("Build at your camp"))}</b><small>${c ? esc(T("{n} living here", { n: c.members })) : ""}</small><button type="button" class="wz-pack-x" aria-label="${esc(T("Close"))}">✕</button></header><ul class="wz-recipes">${rows}</ul>`;
  }
  // a camp's campfire (at night only a camp with one is safe from raids)
  const campFire = (slot) => { const c = camps.list.find((x) => x.slot === slot); return !!(c && c.pieces.some((p) => p.k === "campfire")); };
  // your camp's bed: stand by it and rest (HP back to full), once a minute
  let bedNear = false, restAt = 0;
  function nearBed(px, pz) { const c = homeCamp(); if (!c) return false; return c.pieces.some((p) => p.k === "bed" && Math.hypot(c.x + p.x - px, c.z + p.z - pz) < 2.2); }
  function rest() {
    if (!bedNear) return false; const now = performance.now(); if (now - restAt < 60000) { toast(T("You can rest again in {s} s", { s: Math.ceil((60000 - (now - restAt)) / 1000) })); return true; }
    const v = ctx.vitals && ctx.vitals(); if (v && v.hp >= v.max) { toast(T("You're already rested")); return true; }
    restAt = now; if (ctx.heal) ctx.heal(1); (Snd.heart || Snd.pick || (() => {}))(); toast(T("Rested: HP full")); return true;
  }
  async function join(slot) {
    if (busy) return; busy = true; const r = await api("world-jur-camp", { op: "join", slot }); busy = false;
    if (!r.ok) { toast(T("Couldn't join: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    home = r.j.home; camps = r.j.camps; campFull = false; drawCamps(); toast(T("You live at {w}'s camp now", { w: (homeCamp() || {}).owner || "" })); paint(); paintPack();
  }

  // ---------------- the HUD bits: the prompt, the goal card, the pack ----------------
  function bind(root) {
    const q = (s) => root.querySelector(s);
    ui = { root, act: q(".wz-act"), goal: q(".wz-goal"), goalT: q(".wz-goal-t"), goalBar: q(".wz-goal-bar i"), packBtn: q(".wz-packbtn"), pack: q(".wz-pack:not(.wz-build)"), pops: q(".wz-pops"), foe: q(".wz-foe") };
    ui.buildBtn = q(".wz-buildbtn"); ui.build = q(".wz-build"); ui.ghostBar = q(".wz-ghost");
    ui.buildBtn.addEventListener("click", () => { endGhost(); ui.build.hidden = !ui.build.hidden; if (!ui.build.hidden) { ui.pack.hidden = true; paintBuild(); } (Snd.tab || (() => {}))(); });
    ui.build.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.build) startGhost(b.dataset.build); else if (b.classList.contains("wz-pack-x")) ui.build.hidden = true; });
    ui.ghostBar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const g = b.dataset.g; if (g === "turn") ghostR = (ghostR + 1) % 4; else if (g === "place") ghostDo("place"); else if (g === "down") ghostDo("remove"); else endGhost(); });
    ui.packBtn.addEventListener("click", () => togglePack());
    ui.pack.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.make) make(b.dataset.make); else if (b.dataset.eat) eat(b.dataset.eat); else if (b.dataset.join) join(Number(b.dataset.join)); else if (b.classList.contains("wz-pack-x")) togglePack(false);
    });
  }
  function togglePack(open) { if (!ui) return; const o = open != null ? open : ui.pack.hidden; ui.pack.hidden = !o; if (o) { paintPack(); load().then(paintPack); } (Snd.tab || (() => {}))(); }
  const packOpen = () => !!(ui && !ui.pack.hidden);
  function goal() {
    if (signedOut) return [T("Sign in to gather"), 0];
    if (!inv) return [T("Loading your pack…"), 0];
    const m = inv.mat, tl = inv.tools, wood = m.wood || 0;
    if (campFull && home < 0) return [T("Every camp spot is taken — join someone's camp from your pack"), 0];
    if ((tl.axe | 0) < 1) { if (wood < 3 || (m.stone || 0) < 2 || (m.fiber || 0) < 2) return [T("Gather wood, stone and fiber for a stone axe"), Math.min(1, (Math.min(wood, 3) + Math.min(m.stone || 0, 2) + Math.min(m.fiber || 0, 2)) / 7)]; return [T("Open your pack and make a stone axe"), 0.9]; }
    if (!campHas("bench")) return [T("Build a workbench at your camp: {a}/20 wood · {b}/10 stone", { a: Math.min(20, wood), b: Math.min(10, m.stone || 0) }), Math.min(1, (Math.min(20, wood) + Math.min(10, m.stone || 0)) / 30)];
    if ((tl.spear | 0) < 1) return [T("Make a spear at the workbench (flint from rocks)"), Math.min(1, ((m.flint || 0) / 3 + Math.min(1, wood / 6)) / 2)];
    if (!campHas("campfire")) return [T("Build a campfire at your camp"), Math.min(1, (Math.min(6, wood) + Math.min(8, m.stone || 0)) / 14)];
    if (!(m.meat || 0) && !(m.cooked || 0) && !(m.hide || 0)) return [T("Hunt a raptor with your spear"), 0];
    if (!(m.cooked || 0)) return [T("Cook meat at your campfire"), 0.5];
    if ((tl.axe | 0) < 2) return [T("Make a copper axe (copper ore from rocks and the ARCL Mine)"), Math.min(1, (ore.cu || 0) / 8)];
    return [T("Chop an ancient tree for amber · hunt the Alpha Raptor"), 1];
  }
  let lastAct = "", lastGoal = "";
  function paint() {
    if (!ui) return;
    const o = tgt;
    let html = "";
    if (o) { const w = work && work.o === o ? work : null, need = w && w.need, n = w ? Math.min(w.hits, need || w.hits) : 0;
      html = `<kbd>J</kbd><b>${esc(T(VERB[o.kind] || "Use"))}</b><span>${esc(T(NODE_N[o.kind] || o.kind))}</span>${w ? `<i class="wz-act-bar"><i style="width:${need ? Math.round(100 * n / need) : 8}%"></i></i>` : ""}`; }
    if (!o && bedNear) html = `<kbd>E</kbd><b>${esc(T("Rest"))}</b><span>${esc(T("Bed"))}</span>`;
    if (html !== lastAct) { lastAct = html; ui.act.innerHTML = html; ui.act.hidden = !html; ui.act.dataset.rest = !o && bedNear ? "1" : ""; }
    const [g, k] = goal(), gs = g + "|" + k.toFixed(2);
    if (gs !== lastGoal) { lastGoal = gs; ui.goalT.textContent = g; ui.goalBar.style.width = Math.round(k * 100) + "%"; ui.goal.hidden = false; }
    placeGoal();
  }
  // the selected dinosaur's card: name, level, HP; it sits under the goal card
  let foeKey = "";
  function paintFoe() {
    if (!ui || !ui.foe) return; const o = sel; if (!o) { if (!ui.foe.hidden) ui.foe.hidden = true; foeKey = ""; return; }
    const F = FOE[o.kind], hp = Math.max(0, Math.round(o.hpNow ?? F.hp)), k = hp / F.hp, key = o.id + "|" + hp;
    if (key === foeKey) return; foeKey = key;
    ui.foe.innerHTML = `<b>${esc(T(NODE_N[o.kind] || o.kind))}</b><small>${F.boss ? esc(T("Boss")) + " · " : ""}Lv ${F.lv}</small><i><u style="width:${(100 * k).toFixed(1)}%"></u></i><em>${hp.toLocaleString("en-US")} / ${F.hp.toLocaleString("en-US")}</em>`;
    ui.foe.classList.toggle("boss", !!F.boss); ui.foe.hidden = false;
    const g = ui.goal.getBoundingClientRect(), z = parseFloat(getComputedStyle(ui.foe).zoom) || 1; if (g.height) { ui.foe.style.top = Math.round((g.bottom + 8) / z) + "px"; ui.foe.style.left = Math.round(g.left / z) + "px"; }
  }
  // name and HP over the dinosaurs that matter right now: the one you picked, ones you've hit, ones coming for you
  const bars = new Map(); const bv = new THREE.Vector3();
  function tickBars(px, pz) {
    if (!ui || !H.cam || !H.dinos) return; const seen = new Set();
    for (const o of H.dinos()) {
      const F = FOE[o.kind]; if (!F || !o.alive || !o.g || !o.g.visible) continue; const d = Math.hypot(o.x - px, o.z - pz);
      if (d > 38 || !(o === sel || o.hpNow != null || o.state === "chase" || o.state === "stalk" || o.state === "hunt" || o.state === "rage" || o.state === "charge")) continue;
      bv.set(o.x, (o.y ?? H.height(o.x, o.z)) + (o.R && o.R.h ? o.R.h : 2) + 0.6, o.z).project(H.cam); if (bv.z > 1 || Math.abs(bv.x) > 1.1 || Math.abs(bv.y) > 1.1) continue;
      let el = bars.get(o); if (!el) { el = document.createElement("div"); el.className = "wz-hpb" + (F.boss ? " boss" : ""); el.innerHTML = `<small>${esc(T(NODE_N[o.kind] || o.kind))} · Lv ${F.lv}</small><i><u></u></i>`; ui.pops.appendChild(el); bars.set(o, el); }
      seen.add(o); el.style.left = ((bv.x + 1) / 2 * 100).toFixed(2) + "%"; el.style.top = ((1 - bv.y) / 2 * 100).toFixed(2) + "%"; el.classList.toggle("sel", o === sel);
      const k = Math.max(0, (o.hpNow ?? F.hp) / F.hp); el.querySelector("u").style.width = (k * 100).toFixed(1) + "%";
    }
    for (const [o, el] of bars) if (!seen.has(o)) { el.remove(); bars.delete(o); }
  }
  // a ring on the ground under it
  function tickRing(t) {
    if (!H.scene) return;
    if (!ring) { ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; H.scene.add(ring); }
    ring.visible = !!(sel && sel.alive); if (!ring.visible) return;
    const r = (sel.hr || 1.5) * 1.25 * (1 + Math.sin(t * 5) * 0.05); ring.scale.set(r, r, r); ring.position.set(sel.x, H.height(sel.x, sel.z) + 0.08, sel.z); ring.material.color.setHex(FOE[sel.kind].boss ? 0xffb648 : 0xff4d6d);
  }
  // the goal card sits just under the HP card, wherever the town's HUD puts it on this screen (it covered it on phones)
  let goalAt = "";
  function placeGoal() {
    const v = document.querySelector(".wp-hud-l .wc-vit") || document.querySelector(".wc-vit"); if (!v) return;
    const r = v.getBoundingClientRect(); if (!r.height) return;
    const z = parseFloat(getComputedStyle(ui.goal).zoom) || 1, at = Math.round((r.bottom + 8) / z) + "," + Math.round(r.left / z);
    if (at === goalAt) return; goalAt = at; const [t, l] = at.split(","); ui.goal.style.top = t + "px"; ui.goal.style.left = l + "px";
  }
  function paintPack() {
    if (!ui || ui.pack.hidden) return;
    const chip = (m, n, need) => `<span class="wz-chip${need != null && have(m) < need ? " short" : ""}" title="${esc(T(MAT_N[m] || m))}">${ICON[m] || ""}<b>${need != null ? `${Math.min(have(m), need)}/${need}` : n}</b></span>`;
    const mats = inv ? Object.entries(inv.mat).filter(([, n]) => n > 0) : [];
    const ores = ORE.filter((m) => ore[m] > 0);
    const tl = inv ? inv.tools : { axe: 0, spear: 0 };
    const AXE = ["Bare hands", "Stone axe", "Copper axe", "Iron-hard axe"];
    const rec = Object.entries(recipes).map(([id, R]) => { const own = owned(R), ok = canMake(R) && atOk(R) && !own;
      return `<li class="${ok ? "ok" : ""}${own ? " own" : ""}"><div><b>${esc(T(R.name))}</b>${R.at ? `<small>${esc(T(R.at === "bench" ? "at the workbench" : "at the campfire"))}</small>` : ""}<p>${Object.entries(R.need).map(([m, n]) => chip(m, 0, n)).join("")}</p></div>
        <button type="button" data-make="${esc(id)}" ${ok ? "" : "disabled"}>${esc(own ? T("Made") : T("Make"))}</button></li>`; }).join("");
    const food = Object.keys(FOOD).filter((f) => have(f) > 0).map((f) => `<button type="button" class="wz-eat" data-eat="${f}">${ICON[f]} ${esc(T(MAT_N[f]))} ×${have(f)} <small>+${FOOD[f]}% HP</small></button>`).join("");
    ui.pack.querySelector(".wz-pack-in").innerHTML = `
      <header><b>${esc(T("Pack"))}</b><small>${inv ? esc(T("Gathering today: {a} / {b}", { a: inv.got || 0, b: inv.cap || 6000 })) : ""}</small><button type="button" class="wz-pack-x" aria-label="${esc(T("Close"))}">✕</button></header>
      ${signedOut ? `<p class="wz-empty">${esc(T("Sign in to gather"))}</p>` : ""}
      ${campFull && home < 0 ? `<h4>${esc(T("Join a camp"))}</h4><ul class="wz-recipes">${camps.list.map((c) => `<li class="${c.members < 5 ? "ok" : ""}"><div><b>${esc(T("{w}'s camp", { w: c.owner }))}</b><small>${c.members}/5</small></div><button type="button" data-join="${c.slot}" ${c.members < 5 ? "" : "disabled"}>${esc(T("Join"))}</button></li>`).join("")}</ul>` : ""}
      <h4>${esc(T("Tools"))}</h4><p class="wz-tools"><span>🪓 ${esc(T(AXE[tl.axe | 0] || AXE[0]))}</span><span>🔱 ${esc(T((tl.spear | 0) ? "Spear" : "No spear"))}</span></p>
      <h4>${esc(T("Materials"))}</h4><p class="wz-mats">${mats.length || ores.length ? mats.map(([m, n]) => chip(m, n)).join("") + ores.map((m) => chip(m, ore[m])).join("") : `<span class="wz-empty">${esc(T("Nothing yet: chop trees, pick ferns, mine rocks"))}</span>`}</p>
      ${food ? `<h4>${esc(T("Food"))}</h4><p class="wz-food">${food}</p>` : ""}
      <h4>${esc(T("Make"))}</h4><ul class="wz-recipes">${rec}</ul>`;
  }
  // numbers and loot floating up from where it happened
  const v3 = new THREE.Vector3();
  function pop(o, html, cls, up = 0) {
    if (!ui || !H.cam) return; v3.set(o.x, H.height(o.x, o.z) + (o.popY || 2.2) + up, o.z).project(H.cam); if (v3.z > 1) return;
    const el = document.createElement("div"); el.className = "wz-pop " + (cls || ""); el.innerHTML = html;
    el.style.left = ((v3.x + 1) / 2 * 100).toFixed(2) + "%"; el.style.top = ((1 - v3.y) / 2 * 100).toFixed(2) + "%"; ui.pops.appendChild(el); setTimeout(() => el.remove(), 1700);
  }
  // wood chips or stone flying off at each swing
  let chipsM = null; const flying = [];
  function chips(o) {
    if (!H.scene || ctx.reduce) return;
    if (!chipsM) chipsM = { geo: new THREE.BoxGeometry(0.09, 0.05, 0.12), wood: new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.9 }), stone: new THREE.MeshStandardMaterial({ color: 0x8c877d, roughness: 1 }), leaf: new THREE.MeshStandardMaterial({ color: 0x5e9a36, roughness: 0.9 }), blood: new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.9 }) };
    const m = o.kind === "rock" ? chipsM.stone : o.kind === "fern" || o.kind === "bush" ? chipsM.leaf : VERB[o.kind] === "Hunt" ? chipsM.blood : chipsM.wood;
    const y0 = H.height(o.x, o.z) + (VERB[o.kind] === "Hunt" ? 1.4 : o.kind === "fern" || o.kind === "bush" ? 0.6 : 1.1);
    for (let i = 0; i < 5; i++) { if (flying.length > 40) break; const c = new THREE.Mesh(chipsM.geo, m); c.position.set(o.x + (Math.random() - 0.5) * o.hr, y0, o.z + (Math.random() - 0.5) * o.hr); H.scene.add(c); flying.push({ c, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, t: 0.8 }); }
  }

  // ---------------- a frame ----------------
  let pickT = 0, feltT = 0;
  function tick(dt, t, px, pz, face) {
    if ((pickT += dt) > 0.12) { pickT = 0; const o = pick(px, pz, face); if (o !== tgt) { tgt = o; } paint(); }
    if ((feltT += dt) > 5) { feltT = 0; applyFelled(); }
    // the selection lets go when it's down a while, or far away; a dinosaur left alone a while is back to full HP
    if (sel) { const far = Math.hypot(sel.x - px, sel.z - pz) > 45; if (!sel.alive) selT += dt; if (far || selT > 2.5) { sel = null; paintFoe(); } }
    if (H.dinos && (pickT === 0)) for (const d of H.dinos()) if (d.hpNow != null && d.alive && performance.now() - (d.hpAt || 0) > 12000 && !(work && work.o === d)) { d.hpNow = null; if (d === sel) paintFoe(); }
    tickRing(t); if (pickT === 0) bedNear = nearBed(px, pz);
    tickBars(px, pz);
    for (let i = flying.length - 1; i >= 0; i--) { const f = flying[i]; f.t -= dt; f.vy -= 14 * dt; f.c.position.x += f.vx * dt; f.c.position.y += f.vy * dt; f.c.position.z += f.vz * dt; f.c.rotation.x += dt * 9; f.c.rotation.y += dt * 7;
      if (f.t <= 0) { H.scene.remove(f.c); flying.splice(i, 1); } }
    for (const f of fires) { const k = 0.85 + Math.sin(t * 17 + f.id) * 0.08 + Math.sin(t * 29 + f.id) * 0.06; f.scale.set(1, k, 1); f.rotation.y = t * 1.3; }
    tickGhost(px, pz, face); const inC = !!inHome(px, pz); if (ui && ui.buildBtn.hidden === inC) { ui.buildBtn.hidden = !inC; if (!inC) { ui.build.hidden = true; endGhost(); } }
  }
  return { select, selected: () => sel, campFire, rest, bedNear: () => bedNear, load, tick, swing, collide, bind, togglePack, packOpen, target: () => tgt, use: () => false, drawCamps, ghost: () => !!ghost, turnGhost: () => { if (ghost) ghostR = (ghostR + 1) % 4; }, cancelGhost: () => { const g = !!ghost; endGhost(); return g; }, campSpots: () => CAMPS, debug: () => ({ loaded, signedOut, inv, ore, home, camps, campFull, felled: Object.keys(felled).length, tgt: tgt && tgt.id, work: work && { id: work.o.id, hits: work.hits, need: work.need } }) };
}
