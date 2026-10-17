// world-jursurv.js — Jurassic World's survival on the page (world-jurassic.js hands it the land): what you can chop, mine,
// pick and hunt in reach, the swings, the server's say on each one (api/_world-jur.mjs: how many swings, the drop, when
// it grows back), your pack and what you can make from it, your camp (the workbench and the campfire stand there), the
// goal card, the numbers floating up, and the trunks and boulders you can't walk through. GM only for now, no ARCL.
//
// The land's things come as nodes: { id, kind (the server's: tree, palm, ancient, fern, bush, log, rock), x, z, cr (the
// trunk's radius you bump into, 0 for none), hr (how far from its middle you can reach it), hide(), show() }. The dinosaurs
// come as targets through hooks.dinos(): { id, kind (raptor, trike, alpha, spino), x, z, hr, alive, hurt(), die(), revive() }.
export const CAMP = { x: -16, z: 46 };
const ICON = { wood: "🪵", hardwood: "🌳", stone: "🪨", flint: "🔺", clay: "🟤", fiber: "🌾", berries: "🫐", amber: "🟠", hide: "🟫", bone: "🦴", meat: "🥩", cooked: "🍖", torch: "🔥", rope: "🪢", fang: "🦷", cu: "🟧", ag: "⬜", au: "🟨" };
const MAT_N = { wood: "Wood", hardwood: "Hardwood", stone: "Stone", flint: "Flint", clay: "Clay", fiber: "Fiber", berries: "Berries", amber: "Amber", hide: "Hide", bone: "Bone", meat: "Raw meat", cooked: "Cooked meat", torch: "Torch", rope: "Rope", fang: "Fang", cu: "Copper ore", ag: "Silver ore", au: "Gold ore" };
const NODE_N = { tree: "Tree", palm: "Palm", ancient: "Ancient tree", fern: "Fern", bush: "Bush", log: "Log", rock: "Rock", raptor: "Raptor", trike: "Triceratops", alpha: "Alpha Raptor", spino: "Spinosaurus", titan: "Thornback Titan", claw: "Clawstrider" };
const VERB = { tree: "Chop", palm: "Chop", ancient: "Chop", fern: "Gather", bush: "Gather", log: "Chop", rock: "Mine", raptor: "Hunt", trike: "Hunt", alpha: "Hunt", spino: "Hunt", titan: "Hunt", claw: "Hunt" };
// XP for each one (× what a scammer of your level gives, 6 + 3·level): the work counts towards your level
const XP_K = { tree: 1, palm: 0.8, ancient: 5, fern: 0.25, bush: 0.25, log: 0.6, rock: 1.4, raptor: 3, trike: 6, alpha: 20, spino: 12, titan: 25, claw: 4.5 };
const FOOD = { berries: 12, meat: 25, cooked: 45 };
const ORE = ["cu", "ag", "au"];

export function createSurvival(H) {
  const { THREE, T, esc, toast, ctx } = H;
  const Snd = ctx.Snd || {};
  const nodes = H.nodes, grid = new Map(), GC = 10;
  const key = (x, z) => Math.floor(x / GC) + "," + Math.floor(z / GC);
  for (const n of nodes) { const k = key(n.x, n.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(n); }
  const near = (x, z, fn) => { const cx = Math.floor(x / GC), cz = Math.floor(z / GC); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get(cx + i + "," + (cz + j)); if (l) for (const n of l) fn(n); } };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let inv = null, ore = {}, plot = [], felled = {}, recipes = {}, signedOut = false, loaded = false;
  let tgt = null, work = null, busy = false, ui = null, campG = null, fireF = null;

  // ---------------- the server ----------------
  async function api(action, extra = {}) {
    const s = ctx.sess && ctx.sess(); if (!s) return { ok: false, status: 401, j: { error: T("Sign in to gather") } };
    try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, status: 0, j: { error: String((e && e.message) || e) } }; }
  }
  async function load() {
    const s = ctx.sess && ctx.sess(); signedOut = !s; if (!s) { paint(); return; }
    try {
      const r = await fetch("/api/social?world=jur&wallet=" + s.wallet, { cache: "no-store" }); const j = r.ok ? await r.json() : null;
      if (j && j.ok) { inv = j.inv; ore = j.ore || {}; felled = j.felled || {}; recipes = j.recipes || {}; plot = j.plot || []; loaded = true; applyFelled(); drawCamp(); }
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
  function pick(px, pz, face) {
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
    if (isDino) { o.die(); (Snd.kill || (() => {}))(); } else { o.down = true; o.hide(); if (o.kind === "tree" || o.kind === "ancient" || o.kind === "palm") (Snd.timber || (() => {}))(); else if (o.kind === "rock") (Snd.crumble || (() => {}))(0); else (Snd.pick || (() => {}))(); }
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
  const atOk = (R) => !R.at || (R.at === "bench" ? inv && inv.stations.bench === "placed" : plot.some((p) => p.k === "campfire"));
  const owned = (R) => (R.tool && inv && (inv.tools[R.tool[0]] | 0) >= R.tool[1]) || (R.station && inv && inv.stations[R.station]);
  async function make(id) {
    if (busy) return; busy = true; const R = recipes[id];
    const r = await api("world-jur-craft", { recipe: id }); busy = false;
    if (!r.ok) { toast(T("Couldn't make it: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    inv = r.j.inv; if (r.j.ore) ore = r.j.ore; if (r.j.plot) { plot = r.j.plot; drawCamp(); }
    (Snd.equip || Snd.buy || (() => {}))(); toast(T("Made: {x}", { x: T(R ? R.name : id) })); paint(); paintPack();
  }
  async function eat(f) {
    if (busy) return; const hp = ctx.vitals && ctx.vitals(); if (hp && hp.hp >= hp.max) { toast(T("You're not hungry")); return; }
    busy = true; const r = await api("world-jur-eat", { food: f }); busy = false;
    if (!r.ok) { toast(T("Couldn't eat: {e}", { e: String((r.j && r.j.error) || "").slice(0, 60) })); return; }
    inv = r.j.inv; if (ctx.heal) ctx.heal((FOOD[f] || 10) / 100); (Snd.pick || (() => {}))(); paint(); paintPack();
  }

  // ---------------- the camp: your plot by the gate; the workbench and the campfire stand there once made ----------------
  const campSolid = [];
  function drawCamp() {
    if (!H.scene) return;
    if (!campG) {
      campG = new THREE.Group(); campG.position.set(CAMP.x, H.height(CAMP.x, CAMP.z), CAMP.z); H.scene.add(campG);
      // the plot's edge: a ring of little stones and a sign
      const st = new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 1, flatShading: true }), sg = new THREE.DodecahedronGeometry(0.22, 0);
      const ring = new THREE.InstancedMesh(sg, st, 40); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 9, z = Math.sin(a) * 9; v.set(x, H.height(CAMP.x + x, CAMP.z + z) - campG.position.y + 0.05, z); s3.setScalar(0.7 + ((i * 37) % 10) / 15); q.setFromEuler(new THREE.Euler(i, i * 2, 0)); ring.setMatrixAt(i, m4.compose(v, q, s3)); }
      ring.instanceMatrix.needsUpdate = true; ring.receiveShadow = true; campG.add(ring);
      if (ctx.K && ctx.K.label) { const tag = ctx.K.label(T("Your camp"), { accent: "#39ff88", size: 0.8 }); tag.position.set(0, 3.2, -8.6); campG.add(tag); }
    }
    for (const c of campG.children.filter((o) => o.userData.piece)) campG.remove(c);
    campSolid.length = 0; fireF = null;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.95 });
    for (const p of plot) {
      const g = new THREE.Group(); g.userData.piece = p.k; g.position.set(p.x, 0, p.z); g.rotation.y = (p.r || 0) * Math.PI / 2;
      if (p.k === "bench") {
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.1), wood); top.position.y = 0.95; g.add(top);
        for (const [x, z] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), dark); l.position.set(x, 0.45, z); g.add(l); }
        const saw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.35 })); saw.position.set(0.4, 1.06, 0.1); saw.rotation.y = 0.4; g.add(saw);
        campSolid.push({ x: CAMP.x + p.x, z: CAMP.z + p.z, r: 1.1 });
      } else if (p.k === "campfire") {
        const sg = new THREE.DodecahedronGeometry(0.2, 0), sm = new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1, flatShading: true });
        for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, s = new THREE.Mesh(sg, sm); s.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62); g.add(s); }
        for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6), dark); l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; l.position.y = 0.14; g.add(l); }
        // the flame: two glowing cones that flicker (no light of its own: a new light remakes every shader in the land)
        const fm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 8, 1, true), fm); f1.position.y = 0.55; const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); f2.position.y = 0.45;
        g.add(f1, f2); fireF = [f1, f2];
        campSolid.push({ x: CAMP.x + p.x, z: CAMP.z + p.z, r: 0.75 });
      } else continue;
      g.traverse((m) => { if (m.isMesh && !m.material.blending) { m.castShadow = !!H.shadows; m.receiveShadow = true; } });
      campG.add(g);
    }
  }

  // ---------------- the HUD bits: the prompt, the goal card, the pack ----------------
  function bind(root) {
    const q = (s) => root.querySelector(s);
    ui = { root, act: q(".wz-act"), goal: q(".wz-goal"), goalT: q(".wz-goal-t"), goalBar: q(".wz-goal-bar i"), packBtn: q(".wz-packbtn"), pack: q(".wz-pack"), pops: q(".wz-pops") };
    ui.packBtn.addEventListener("click", () => togglePack());
    ui.pack.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.make) make(b.dataset.make); else if (b.dataset.eat) eat(b.dataset.eat); else if (b.classList.contains("wz-pack-x")) togglePack(false);
    });
  }
  function togglePack(open) { if (!ui) return; const o = open != null ? open : ui.pack.hidden; ui.pack.hidden = !o; if (o) { paintPack(); load().then(paintPack); } (Snd.tab || (() => {}))(); }
  const packOpen = () => !!(ui && !ui.pack.hidden);
  function goal() {
    if (signedOut) return [T("Sign in to gather"), 0];
    if (!inv) return [T("Loading your pack…"), 0];
    const m = inv.mat, tl = inv.tools, stn = inv.stations, wood = m.wood || 0;
    if ((tl.axe | 0) < 1) { if (wood < 3 || (m.stone || 0) < 2 || (m.fiber || 0) < 2) return [T("Gather wood, stone and fiber for a stone axe"), Math.min(1, (Math.min(wood, 3) + Math.min(m.stone || 0, 2) + Math.min(m.fiber || 0, 2)) / 7)]; return [T("Open your pack and make a stone axe"), 0.9]; }
    if (stn.bench !== "placed") return [T("Make a workbench: {a}/20 wood · {b}/10 stone", { a: Math.min(20, wood), b: Math.min(10, m.stone || 0) }), Math.min(1, (Math.min(20, wood) + Math.min(10, m.stone || 0)) / 30)];
    if ((tl.spear | 0) < 1) return [T("Make a spear at the workbench (flint from rocks)"), Math.min(1, ((m.flint || 0) / 3 + Math.min(1, wood / 6)) / 2)];
    if (stn.fire !== "placed") return [T("Make a campfire for your camp"), Math.min(1, (Math.min(6, wood) + Math.min(8, m.stone || 0)) / 14)];
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
    if (html !== lastAct) { lastAct = html; ui.act.innerHTML = html; ui.act.hidden = !html; }
    const [g, k] = goal(), gs = g + "|" + k.toFixed(2);
    if (gs !== lastGoal) { lastGoal = gs; ui.goalT.textContent = g; ui.goalBar.style.width = Math.round(k * 100) + "%"; ui.goal.hidden = false; }
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
    for (let i = flying.length - 1; i >= 0; i--) { const f = flying[i]; f.t -= dt; f.vy -= 14 * dt; f.c.position.x += f.vx * dt; f.c.position.y += f.vy * dt; f.c.position.z += f.vz * dt; f.c.rotation.x += dt * 9; f.c.rotation.y += dt * 7;
      if (f.t <= 0) { H.scene.remove(f.c); flying.splice(i, 1); } }
    if (fireF) { const k = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 29) * 0.06; fireF[0].scale.set(1, k, 1); fireF[1].scale.set(1, 1.6 - k * 0.6, 1); fireF[0].rotation.y = t * 1.3; }
  }
  return { load, tick, swing, collide, bind, togglePack, packOpen, target: () => tgt, use: () => false, drawCamp, debug: () => ({ loaded, signedOut, inv, ore, plot, felled: Object.keys(felled).length, tgt: tgt && tgt.id, work: work && { id: work.o.id, hits: work.hits, need: work.need } }) };
}
