// world-decor.js — the world's set dressing from free CC0 model packs (Kenney, kenney.nl; KayKit by Kay Lousberg,
// kaylousberg.com; Quaternius, quaternius.com), repacked in /models/world/packs (one GLB per pack, one root node per model, meshopt-compressed):
//   the plaza and the town: lanterns, benches, flower beds, bushes and trees, a market stall with food, critters
//   the districts: a rocket and landers at Launch, gold and cars at Finance, dishes and solar at Research, plants at ARCIA
//   the hunting grounds: a camp at each gate and props in each ground's theme
//   the gear: KayKit weapons and shields in the ARC Bots' hands (world-rpg.js dress)
//   the neighbourhoods: Kenney's suburban houses and city offices between the districts, and a city skyline far out
// Nothing here is solid except the few big pieces in solids(); the packs load in stages after the world is up, and
// the ones only the hunting grounds use load when you get near one.
//
// ctx: { THREE, K, planet, blocked(v), shops[], zones[], ver, low, reduce, on(fn), here(v), onWeapons() }
import { infinityStatue } from "./world-gear3d.js";
import { sway } from "./world-look.js";
export const PACKS = ["k-suburban", "k-commercial", "q-nature", "q-props", "kk-nature", "kenney-nature", "kenney-town", "kk-city", "kenney-food", "kk-furniture", "kenney-furniture", "kk-space", "kenney-space", "kk-resources", "kk-tools", "kk-weapons", "kenney-survival", "kenney-pets"];

export function createDecor(ctx) {
  const { THREE, K, planet } = ctx;
  const root = new THREE.Group(); root.name = "decor"; planet.add(root);
  const packs = {}, loading = {}, solids = [], critters = [], homes = [];
  let landmark = null;
  let rnd = 1234567;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const load = (n) => (loading[n] = loading[n] || K.loadPack(`/models/world/packs/${n}.glb`, ctx.ver).then((p) => (packs[n] = p)).catch((e) => { console.warn("pack", n, e && e.message); return null; }));

  // one model, standing on the ground at its own centre; h: scale it to this height, w: to this footprint
  function piece(pack, name, { h, w, s = 1 } = {}) {
    const p = packs[pack]; if (!p) return null;
    const o = K.packClone(p, name); if (!o) return null;
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    let k = s; if (h) k = h / Math.max(0.01, sz.y); else if (w) k = w / Math.max(0.01, Math.max(sz.x, sz.z));
    const g = new THREE.Group(); o.position.set(-c.x, -b.min.y, -c.z); g.add(o); g.scale.setScalar(k);
    g.userData.size = sz.multiplyScalar(k); g.name = pack + ":" + name;
    const big = Math.max(g.userData.size.x, g.userData.size.y, g.userData.size.z) >= 1.4; // the small things cast no shadow (cheaper)
    g.traverse((m) => { if (m.isMesh) { m.castShadow = big; m.receiveShadow = true; } });
    return g;
  }
  const at = (g, x, z, ry = r() * 6.283, y = 0) => { if (!g) return null; g.position.set(x, y, z); g.rotation.y = ry; return g; };
  const solid = (g, radius) => { if (!g) return g; g.userData.radius = radius; solids.push(g); return g; };

  // where things can go: not inside a hall, not on the paths from the plaza to the halls, not on top of each other
  const taken = [];
  const segDist = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1))); return Math.hypot(px - ax - vx * t, pz - az - vz * t); };
  const halls = () => ctx.shops.map((g) => g.position);
  function free(x, z, room = 1.6) {
    if (ctx.blocked(new THREE.Vector3(x, 0, z))) return false;
    for (const p of halls()) if (segDist(x, z, 0, 0, p.x, p.z) < 2.6) return false; // the walk from the plaza
    if (Math.hypot(x, z) < 15.5) return false; // the plaza itself stays open
    if (avoided(x, z, room)) return false;
    for (const [tx, tz, tr] of taken) if (Math.hypot(x - tx, z - tz) < room + tr) return false;
    return true;
  }
  const take = (x, z, room = 1.2) => taken.push([x, z, room]);
  // the race course (its pad and rings) and anything else the game keeps clear: ctx.avoid() → [[x, z, r], …]
  const avoided = (x, z, room = 0) => (ctx.avoid ? ctx.avoid() : []).some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar + room);
  // a free spot in a ring around (cx, cz)
  function spotNear(cx, cz, r0, r1, room = 1.4, tries = 30, check = free) {
    for (let i = 0; i < tries; i++) { const a = r() * 6.283, d = r0 + r() * (r1 - r0), x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d; if (check(x, z, room)) { take(x, z, room); return [x, z]; } }
    return null;
  }
  // the many small plants: instanced, one draw per model part
  function scatter(pack, names, n, spotFn, { h, hJit = 0.35, tint } = {}) {
    const p = packs[pack]; if (!p) return;
    const per = new Map(); names.forEach((nm) => per.set(nm, []));
    for (let i = 0; i < n; i++) {
      const s = spotFn(); if (!s) continue;
      const nm = names[Math.floor(r() * names.length)], m = new THREE.Matrix4(), k = 1 + (r() - 0.5) * hJit * 2;
      m.compose(new THREE.Vector3(s[0], 0, s[1]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.283), new THREE.Vector3(k, k, k));
      per.get(nm).push(m);
    }
    for (const [nm, mats] of per) { if (!mats.length) continue; const inst = K.packInstanced(p, nm, mats, { h }); if (inst) { inst.name = pack + ":" + nm + "×" + mats.length; const sh = (h || 0) >= 4; inst.traverse((m) => { if (m.isMesh) m.castShadow = sh; });
      if (/flower|Bush|Grass|Tree|mushroom|plant/i.test(nm) && !ctx.low) sway(inst, { frac: (h || 1) >= 4 ? 0.025 : 0.07 });
      root.add(inst); } }
  }
  const group = (name) => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
  // merged per 24 m square rather than all in one, so what's off screen (or outside the shadow box) is skipped
  function mergeCells(g, size = 24) {
    const cells = new Map();
    for (const c of [...g.children]) {
      const k = Math.floor(c.position.x / size) + "," + Math.floor(c.position.z / size);
      let cg = cells.get(k); if (!cg) { cg = new THREE.Group(); cg.name = g.name + "@" + k; cells.set(k, cg); g.add(cg); }
      cg.add(c);
    }
    for (const cg of cells.values()) K.mergeStatic(cg);
  }

  // ---------------- the plaza and the town ----------------
  function dressTown() {
    const g = group("decor-town");
    // lanterns and benches around the plaza's edge, between the arches
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283 + 0.26, R = 16.6, x = Math.sin(a) * R, z = Math.cos(a) * R;
      if (ctx.blocked(new THREE.Vector3(x, 0, z))) continue;
      let bad = avoided(x, z, 1); for (const p of halls()) if (segDist(x, z, 0, 0, p.x, p.z) < 2.4) bad = true; if (bad) continue;
      const face = Math.atan2(-x, -z);
      if (i % 2 === 0) g.add(at(piece("kk-city", "streetlight", { h: 3.4 }) || piece("kenney-town", "lantern", { h: 2.6 }), x, z, face));
      else g.add(at(piece("kk-city", "bench", { w: 2.1 }), x, z, face));
      take(x, z, 1.2);
    }
    // a few big trees close to the plaza (the detailed ones), the rest of the woods further out (instanced, lighter)
    for (let i = 0; i < (ctx.low ? 3 : ctx.lite ? 4 : 7); i++) { const s = spotNear(0, 0, 19, 30, 2.6); if (s) g.add(at(piece("q-nature", ["CommonTree_3", "CommonTree_4", "Pine_1"][i % 3], { h: 7 + r() * 2 }), s[0], s[1])); }
    for (let i = 0; i < 8; i++) { const s = spotNear(0, 0, 18, 32, 1.2); if (s) g.add(at(piece("q-nature", ["Bush_Common_Flowers", "Bush_Common", "Flower_4_Group", "Fern_1"][i % 4], { h: i % 4 === 2 ? 0.6 : 1.1 }), s[0], s[1])); }
    // the ∞ landmark (world-gear3d.js) at the plaza's edge, facing in
    const lm = spotNear(0, 0, 19.5, 23, 3.6);
    if (lm) { const st = solid(at(infinityStatue(0.9), lm[0], lm[1], Math.atan2(-lm[0], -lm[1])), 2.4); st.userData.keep = true; root.add(st); landmark = st; }
    // a market corner: two stalls with food on the counter
    const mk = spotNear(0, 0, 19, 24, 3.2);
    if (mk) {
      const face = Math.atan2(-mk[0], -mk[1]);
      const st = solid(at(piece("kenney-town", "stall-red", { h: 2.6 }), mk[0], mk[1], face), 1.4); g.add(st);
      ["burger", "donut", "cake", "pizza", "ice-cream"].forEach((f, i) => { const it = piece("kenney-food", f, { w: 0.42 }); if (it && st) { it.position.set(-0.7 + i * 0.35, 1.02 / st.scale.y, 0.45 / st.scale.y); it.scale.multiplyScalar(1 / st.scale.y); st.add(it); } });
      const s2 = spotNear(mk[0], mk[1], 3.5, 5, 2.4); if (s2) g.add(solid(at(piece("q-props", "Stall_Cart_Empty", { h: 2.4 }) || piece("kenney-town", "stall-green", { h: 2.6 }), s2[0], s2[1], Math.atan2(-s2[0], -s2[1])), 1.4));
      for (const [nm, h] of [["Barrel_Apples", 0.9], ["Crate_Wooden", 0.6], ["Barrel", 0.8], ["Bag", 0.5]]) { const s = spotNear(mk[0], mk[1], 1.8, 4, 0.7); if (s) g.add(at(piece("q-props", nm, { h }), s[0], s[1])); }
      for (let i = 0; i < 3; i++) { const s = spotNear(mk[0], mk[1], 2, 3.5, 0.6); if (s) g.add(at(piece("kenney-town", "stall-stool", { h: 0.6 }), s[0], s[1])); }
    }
    // carts and a water tower out on the green (the town kit's windmill and watermill are only their wheels, so not here)
    for (const [pk, nm, h, rr] of [["kenney-town", "cart", 1.4, 1.2], ["kenney-town", "cart-high", 1.8, 1.2], ["kk-city", "watertower", 6.5, 2]]) {
      const s = spotNear(0, 0, 26, 44, rr + 1.5); if (!s) continue; const o = at(piece(pk, nm, { h }), s[0], s[1]); if (rr > 1.8) solid(o, rr); g.add(o);
    }
    // flower beds, bushes, rocks and trees on the meadows between the districts (instanced)
    const meadow = () => spotNear(0, 0, 17, 46, 0.5, 12);
    scatter("kenney-nature", ["flower_redA", "flower_redB", "flower_yellowA", "flower_yellowB", "flower_purpleA", "flower_purpleB"], ctx.low ? 50 : ctx.lite ? 80 : 120, meadow, { h: 0.55 });
    scatter("kk-nature", ["Bush_1_A_Color1", "Bush_2_A_Color1", "Bush_3_A_Color1", "Bush_4_A_Color1"], ctx.low ? 24 : 48, meadow, { h: 1.0 });
    scatter("kk-nature", ["Grass_1_A_Color1", "Grass_2_A_Color1"], ctx.low ? 40 : ctx.lite ? 70 : 110, meadow, { h: 0.45 });
    scatter("kk-nature", ["Rock_1_A_Color1", "Rock_2_A_Color1", "Rock_3_A_Color1"], 18, meadow, { h: 0.7 });
    scatter("kk-nature", ["Tree_1_A_Color1", "Tree_2_A_Color1", "Tree_3_A_Color1", "Tree_4_A_Color1"], ctx.low ? 10 : 22, () => spotNear(0, 0, 30, 60, 2.2, 10), { h: 6.5, hJit: 0.25 });
    scatter("kenney-nature", ["mushroom_red", "mushroom_redGroup", "mushroom_tan"], 14, meadow, { h: 0.5 });
    mergeCells(g);
  }

  // ---------------- the districts ----------------
  function dressDistricts() {
    const by = {}; for (const g of ctx.shops) { const d = g.userData.spec.district; (by[d] = by[d] || []).push(g); }
    const around = (hall, rr = [4.5, 8]) => { const p = hall.position, rad = (hall.userData.radius || 3.5); return spotNear(p.x, p.z, rad + rr[0] - 3, rad + rr[1] - 3, 1.6); };
    const g = group("decor-districts");
    // Launch: a rocket on its pad, landers and cargo
    for (const hall of by.Launch || []) {
      const s = around(hall, [6, 9]);
      if (s && hall.userData.spec.id === "launch") {
        const pad = at(piece("kk-space", "landingpad_large", { w: 5 }), s[0], s[1], 0); g.add(solid(pad, 2.4));
        const rk = new THREE.Group(); let y = 0;
        for (const nm of ["rocket_baseA", "rocket_fuelA", "rocket_sidesA", "rocket_topA"]) { const pc = piece("kenney-space", nm, { s: 1.6 }); if (!pc) continue; pc.position.y = y; y += pc.userData.size.y; rk.add(pc); }
        const fins = piece("kenney-space", "rocket_finsA", { s: 1.6 }); if (fins) rk.add(fins);
        rk.position.set(s[0], 0.25, s[1]); g.add(rk);
      }
      for (const [pk, nm, h, rr] of [["kk-space", "lander_A", 2.6, 1.4], ["kk-space", "cargo_A_stacked", 1.6, 0], ["kk-space", "containers_A", 1.4, 0], ["kk-space", "lights", 2.2, 0], ["kenney-space", "satelliteDish", 2.4, 0]]) {
        const p = around(hall); if (p) g.add(rr ? solid(at(piece(pk, nm, { h }), p[0], p[1]), rr) : at(piece(pk, nm, { h }), p[0], p[1]));
      }
    }
    // Finance: gold stacks by the vaults, parked cars, street furniture
    for (const hall of by.Finance || []) {
      const id = hall.userData.spec.id;
      for (const nm of id === "locker" || id === "staking" || id === "reward" ? ["Gold_Bars_Stack_Large", "Gold_Bars_Stack_Medium", "Silver_Bars_Stack_Medium"] : ["Pallet_Wood_Covered_A", "Textiles_Stack_Large_Colored"]) { const p = around(hall, [3.5, 5.5]); if (p) g.add(at(piece("kk-resources", nm, nm.startsWith("Pallet") || nm.startsWith("Textiles") ? { w: 1.5 } : { h: 0.9 }), p[0], p[1])); }
      if (id === "reward" || id === "staking") { const p = around(hall, [3.5, 5.5]); if (p) g.add(at(piece("q-props", "Coin_Pile_2", { h: 0.5 }), p[0], p[1])); }
      const c = around(hall, [7, 10]); if (c) g.add(solid(at(piece("kk-city", ["car_sedan", "car_taxi", "car_hatchback", "car_stationwagon"][Math.floor(r() * 4)], { w: 3.6 }), c[0], c[1]), 1.6));
      for (const nm of ["trash_A", "firehydrant"]) { const p = around(hall, [4, 7]); if (p) g.add(at(piece("kk-city", nm, { h: nm === "firehydrant" ? 0.8 : 1.0 }), p[0], p[1])); }
    }
    // Research: dishes, solar, a wind turbine and a generator
    for (const hall of by.Research || []) {
      for (const [pk, nm, h, rr] of [["kenney-space", "satelliteDish_large", 3.2, 1.3], ["kk-space", "solarpanel", 1.6, 0], ["kk-space", "solarpanel", 1.6, 0], ["kk-space", "windturbine_tall", 7, 1.0], ["kenney-space", "machine_generator", 1.6, 0], ["kk-tools", "blueprint_stacked", 0.4, 0]]) {
        const p = around(hall); if (p) g.add(rr ? solid(at(piece(pk, nm, { h }), p[0], p[1]), rr) : at(piece(pk, nm, { h }), p[0], p[1]));
      }
    }
    // ARCIA's studio: plants and lamps; the ARCL halls (the Forge, the shop): the smith's corner
    for (const hall of [...(by.ARCIA || [])]) for (const [pk, nm, h] of [["kenney-furniture", "pottedPlant", 1.2], ["kk-furniture", "lamp_standing", 1.9], ["kenney-furniture", "plantSmall2", 0.8], ["kk-furniture", "cactus_medium_A", 0.9]]) { const p = around(hall, [3.5, 6]); if (p) g.add(at(piece(pk, nm, { h }), p[0], p[1])); }
    for (const hall of by.ARCL || []) for (const [pk, nm, h] of [["q-props", "Anvil", 0.9], ["q-props", "WeaponStand", 1.6], ["kk-tools", "grindstone", 1.1], ["q-props", "Workbench", 1.1], ["q-props", "Dummy", 1.9], ["q-props", "Cauldron", 0.9], ["kk-resources", "Wood_Log_Stack", 1.0], ["q-props", "Banner_1", 2.6]]) { const p = around(hall, [3.5, 6.5]); if (p) g.add(at(piece(pk, nm, { h }), p[0], p[1])); }
    mergeCells(g);
  }

  // ---------------- the neighbourhoods: houses and offices on the green, a skyline on the horizon ----------------
  // Kenney City Kits (Suburban, Commercial). Houses stand in the ring past the halls (52–74 m), facing the plaza with a
  // stone path and a planter at the door; offices near the Finance and ARCL halls; the hunting grounds and Coin City
  // stay clear. Far out (205–240 m, past the hunting grounds) a ring of towers draws a city line over the hills.
  const inZone = (x, z, pad) => (ctx.zones || []).some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + pad);
  const bearing = (x, z) => ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
  const coinCity = (x, z) => { const b = bearing(x, z), d = Math.hypot(x, z); return (b < 58 || b > 302) && d < 86; };
  function dressNeighbourhoods() {
    const g = group("decor-homes");
    const HOUSES = "abcdefghijklmnopqrstu".split("").map((c) => "building-type-" + c), OFFICES = "abcdefghijklmn".split("").map((c) => "building-" + c);
    const ok = (x, z, room) => free(x, z, room) && !inZone(x, z, room + 4) && !coinCity(x, z);
    const N = ctx.low ? 8 : ctx.lite ? 14 : 22;
    for (let i = 0, placed = 0; i < N * 4 && placed < N; i++) {
      const a = ((i % N) / N) * 6.283 + Math.floor(i / N) * 0.13 + r() * 0.3, d = 52 + r() * 22, x = Math.sin(a) * d, z = -Math.cos(a) * d;
      const b = bearing(x, z), office = b > 80 && b < 180 && r() < 0.65, room = office ? 4.6 : 4.2;
      if (!ok(x, z, room)) continue; take(x, z, room); placed++;
      const face = Math.atan2(-x, -z) + (r() - 0.5) * 0.5;
      const h = office ? 9 + r() * 6 : 5.6 + r() * 1.6, o = at(piece(office ? "k-commercial" : "k-suburban", (office ? OFFICES : HOUSES)[Math.floor(r() * (office ? OFFICES : HOUSES).length)], { h }), x, z, face);
      if (!o) continue; g.add(solid(o, Math.min(4.2, Math.max(o.userData.size.x, o.userData.size.z) * 0.5))); homes.push([Math.round(x), Math.round(z), office ? 1 : 0]);
      // the front: a stone path to the door and a planter by it (houses); an awning or parasols (offices)
      const fx = Math.sin(face), fz = Math.cos(face), front = Math.max(o.userData.size.z, 3) * 0.5;
      if (!office) {
        g.add(at(piece("k-suburban", "path-stones-short", { w: 2.4 }), x + fx * (front + 1.3), z + fz * (front + 1.3), face));
        g.add(at(piece("k-suburban", "planter", { w: 1.6 }), x + fx * (front + 0.9) + fz * 2.2, z + fz * (front + 0.9) - fx * 2.2, face));
        if (r() < 0.5) g.add(at(piece("k-suburban", r() < 0.5 ? "tree-small" : "tree-large", { h: 3.4 + r() * 1.6 }), x - fz * (front + 2), z + fx * (front + 2), r() * 6.283));
      } else if (r() < 0.6) g.add(at(piece("k-commercial", r() < 0.5 ? "detail-parasol-a" : "detail-parasol-b", { h: 2.4 }), x + fx * (front + 2.2), z + fz * (front + 2.2), face));
    }
    mergeCells(g);
    if (ctx.low) return;
    // the skyline: low-detail towers, instanced (one draw per model), never solid (nobody walks that far)
    const TOW = ["low-detail-building-a", "low-detail-building-b", "low-detail-building-c", "low-detail-building-d", "low-detail-building-e", "low-detail-building-f", "low-detail-building-g", "low-detail-building-h", "low-detail-building-i", "low-detail-building-j", "low-detail-building-k", "low-detail-building-l", "low-detail-building-m", "low-detail-building-n", "low-detail-building-wide-a", "low-detail-building-wide-b"];
    const pk = packs["k-commercial"]; if (!pk) return;
    const per = new Map(); TOW.forEach((n) => per.set(n, []));
    // two stretches of city on the horizon (behind Finance and behind Research), in one hazy blue-grey: a far
    // silhouette that the fog and the evening take, not a wall of white towers
    const M = ctx.lite ? 26 : 44, ARCS = [[62, 150], [205, 268]];
    for (let i = 0; i < M; i++) {
      const [b0, b1] = ARCS[i % 2], b = ((b0 + r() * (b1 - b0)) * Math.PI) / 180, d = 262 + r() * 34, x = Math.sin(b) * d, z = -Math.cos(b) * d;
      if (inZone(x, z, 8)) continue;
      const nm = TOW[Math.floor(r() * TOW.length)], k = 0.8 + r() * 0.5, m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(x, -1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-x, -z) + (r() - 0.5)), new THREE.Vector3(k, k * (0.8 + r() * 0.8), k));
      per.get(nm).push(m);
    }
    const sky = group("decor-skyline"), haze = new THREE.MeshStandardMaterial({ color: 0x9fb6cf, roughness: 0.95, metalness: 0 });
    for (const [nm, mats] of per) { if (!mats.length) continue; const inst = K.packInstanced(pk, nm, mats, { h: 16 }); if (inst) { inst.traverse((m) => { if (m.isMesh) { m.material = haze; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } }); inst.userData.keep = true; sky.add(inst); } }
  }

  // ---------------- the hunting grounds: a camp by each gate, props in each ground's theme ----------------
  const THEME = {
    spam: [["kenney-survival", "box-large", 1.1], ["kenney-survival", "barrel", 1.1], ["kk-resources", "Fuel_C_Jerrycan", 0.6], ["kenney-survival", "signpost", 1.6], ["kk-resources", "Parts_Pile_Medium", 0.8]],
    fields: [["kenney-nature", "flower_yellowC", 0.6], ["kenney-nature", "plant_bushLarge", 1.2], ["kk-resources", "Wood_Log_Stack", 1.0], ["kenney-survival", "bucket", 0.5], ["kk-nature", "Bush_2_C_Color1", 1.1]],
    swamp: [["kenney-nature", "lily_large", 0.2], ["kenney-nature", "mushroom_redGroup", 0.6], ["kk-nature", "Tree_Bare_1_A_Color1", 5], ["kenney-nature", "log_large", 0.8], ["kenney-nature", "stump_old", 0.8]],
    canyon: [["kk-nature", "Rock_3_E_Color1", 2.2], ["kenney-nature", "cactus_tall", 2.0], ["kenney-nature", "cactus_short", 1.0], ["kk-nature", "Rock_1_J_Color1", 1.4], ["kenney-survival", "resource-stone", 0.7]],
    depths: [["kenney-space", "rock_crystalsLargeA", 2.4], ["kenney-space", "rock_crystals", 1.2], ["kenney-space", "meteor_detailed", 1.4], ["kenney-space", "rock_crystalsLargeB", 2.0], ["kk-resources", "Stone_Chunks_Large", 0.8]],
  };
  const dressed = new Set();
  function dressZone(zn) {
    if (dressed.has(zn.id)) return; dressed.add(zn.id);
    const g = group("decor-zone-" + zn.id), toPlaza = Math.atan2(-zn.x, -zn.z);
    const inZone = (x, z, room) => Math.hypot(x - zn.x, z - zn.z) < zn.r - 2 && !ctx.blocked(new THREE.Vector3(x, 0, z)) && !taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < room + tr);
    // the camp, just inside the gate to one side
    const cx = zn.x + Math.sin(toPlaza) * (zn.r - 6) + Math.cos(toPlaza) * 5, cz = zn.z + Math.cos(toPlaza) * (zn.r - 6) - Math.sin(toPlaza) * 5;
    const camp = [["kenney-survival", "tent", 1.9, 1.5, 0, 0], ["kenney-survival", "campfire-pit", 0.6, 0, 2.2, 0.6], ["q-props", "Chest_Wood", 0.7, 0, -1.6, 1.8], ["q-props", "Torch_Metal", 1.6, 0, 2.6, -1.4], ["kenney-survival", "bedroll", 0.25, 0, 1.4, -1.8], ["kk-tools", "lantern", 0.6, 0, -2.2, -0.8]];
    for (const [pk, nm, h, rr, dx, dz] of camp) { const o = at(piece(pk, nm, { h }), cx + dx, cz + dz, toPlaza + Math.PI); if (o) { g.add(rr ? solid(o, rr) : o); take(cx + dx, cz + dz, 1); } }
    // the ground's own props
    const list = THEME[zn.id] || [];
    for (let i = 0; i < 16; i++) { const [pk, nm, h] = list[i % list.length] || []; if (!pk) break; const s = spotNear(zn.x, zn.z, 5, zn.r - 3, 1.6, 20, inZone); if (s) g.add(at(piece(pk, nm, { h: h * (0.8 + r() * 0.5) }), s[0], s[1])); }
    mergeCells(g);
  }
  async function nearZones() {
    if (!ctx.zones) return;
    const p = ctx.here(new THREE.Vector3());
    for (const zn of ctx.zones) if (!dressed.has(zn.id) && Math.hypot(p.x - zn.x, p.z - zn.z) < zn.r + 45) { await Promise.all(["kenney-survival", "kk-resources", "kenney-nature", "kk-nature", "kenney-space", "kk-tools", "q-props", "q-nature"].map(load)); dressZone(zn); }
  }

  // ---------------- critters: a few cube pets wandering the meadows ----------------
  const KINDS = ["animal-bunny", "animal-chick", "animal-cat", "animal-dog", "animal-fox", "animal-panda", "animal-penguin", "animal-pig", "animal-koala", "animal-deer"];
  function addCritters() {
    const p = packs["kenney-pets"]; if (!p) return;
    const n = ctx.low ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const kind = KINDS[Math.floor(r() * KINDS.length)], s = spotNear(0, 0, 18, 40, 1.5); if (!s) continue;
      const o = piece("kenney-pets", kind, { h: 0.85 }); if (!o) continue;
      o.position.set(s[0], 0, s[1]); root.add(o);
      const mixer = new THREE.AnimationMixer(o), act = (a) => { const clip = p.clips.find((c) => c.name === kind + "/" + a); return clip ? mixer.clipAction(clip) : null; };
      const c = { o, mixer, walk: act("walk"), idle: act("idle"), dance: act("dance"), to: null, wait: 1 + r() * 3, cur: null };
      const play = (a) => { if (c.cur === a || !a) return; if (c.cur) c.cur.fadeOut(0.2); a.reset().fadeIn(0.2).play(); c.cur = a; };
      c.play = play; play(c.idle); critters.push(c);
    }
  }
  const tmp = new THREE.Vector3();
  function tickCritters(dt) {
    if (landmark) landmark.userData.loop.rotation.y += dt * 0.25;
    if (!critters.length) return;
    ctx.here(tmp);
    for (const c of critters) {
      const o = c.o, near = Math.hypot(tmp.x - o.position.x, tmp.z - o.position.z);
      if (near > 70) continue; // far away: frozen (cheaper)
      if (near > 26) { c.acc = (c.acc || 0) + dt; if ((c.fc = (c.fc || 0) + 1) % 3 === 0) { c.mixer.update(c.acc); c.acc = 0; } } else { c.mixer.update(dt + (c.acc || 0)); c.acc = 0; } // past 26 m: its animation every third frame (it still walks every frame)
      if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { const a = r() * 6.283, d = 3 + r() * 6, x = o.position.x + Math.sin(a) * d, z = o.position.z + Math.cos(a) * d; if (free(x, z, 0) || Math.hypot(x, z) > 17 && Math.hypot(x, z) < 45 && !ctx.blocked(new THREE.Vector3(x, 0, z))) { c.to = [x, z]; c.play(c.walk); } else c.wait = 0.5; } continue; }
      if (!c.to) continue;
      const dx = c.to[0] - o.position.x, dz = c.to[1] - o.position.z, dd = Math.hypot(dx, dz);
      if (dd < 0.2) { c.to = null; c.wait = 2 + r() * 5; c.play(near < 4 && c.dance && r() < 0.5 ? c.dance : c.idle); continue; }
      const sp = 1.1 * dt; o.position.x += (dx / dd) * Math.min(sp, dd); o.position.z += (dz / dd) * Math.min(sp, dd);
      const want = Math.atan2(dx, dz); o.rotation.y += Math.atan2(Math.sin(want - o.rotation.y), Math.cos(want - o.rotation.y)) * Math.min(1, dt * 6);
    }
  }

  // ---------------- gear in hand: KayKit weapons and shields ----------------
  const WEAPON = ["dagger_A", "sword_A", "axe_B", "sword_D", "sword_E"], SHIELD = ["shield_A", "shield_A", "shield_B", "shield_B", "shield_C"];
  function gear(slot, tier, rarityColor, glow) {
    const nm = slot === "weapon" ? WEAPON[tier] : slot === "shield" ? SHIELD[tier] : null; if (!nm) return null;
    const o = piece("kk-weapons", nm, slot === "weapon" ? { h: tier === 0 ? 0.75 : 1.25 } : { h: 0.7 }); if (!o) return null;
    if (glow) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(rarityColor); m.material.emissiveIntensity = glow; } });
    o.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return o;
  }

  // ---------------- loading, in stages ----------------
  let started = false;
  async function start() {
    if (started) return; started = true;
    await load("kk-weapons"); ctx.onWeapons && ctx.onWeapons();
    await Promise.all(["kk-nature", "kenney-nature", "kenney-town", "kk-city", "kenney-food", "q-nature", "q-props"].map(load)); dressTown();
    await Promise.all(["kk-space", "kenney-space", "kk-resources", "kk-tools", "kk-furniture", "kenney-furniture"].map(load)); dressDistricts();
    await load("kenney-pets"); addCritters();
    await Promise.all(["k-suburban", "k-commercial"].map(load)); dressNeighbourhoods();
    setInterval(nearZones, 3000); nearZones();
  }
  return { root, start, solids: () => solids, tick: (dt) => tickCritters(dt), gear, ready: (n) => !!packs[n], debug: () => ({ packs: Object.keys(packs), critters: critters.length, solids: solids.length, zones: [...dressed], homes }) };
}
