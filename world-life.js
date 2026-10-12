// world-life.js — the quiet things to do between fights: gathering (ore, data crystals, logs) with any weapon, a
// workbench to turn what you gathered into potions, scrolls and scrap, and fishing in the fountain and the swamp
// ponds with a small timing game and a log of your best catches.
//
// Everything here is local progress kept in the save (rpg.x.mat, rpg.x.fish): materials and fish are never ARCL and
// never sold for it.
//
// ctx: { THREE, planet, T, esc, toast, Snd, rpg(), here(v), blocked(v), zones, inHub(), save(), vfx, low,
//        float(text, v, color), shake(n) }
import { gatherNode, fish as fish3d } from "./world-gear3d.js";
import { mergeStatic } from "./world-arcstyle.js";

export const MATS = { ore: { name: "Ore", color: "#ffb83d" }, crystal: { name: "Data crystal", color: "#38e8ff" }, wood: { name: "Wood", color: "#c98a4a" } };
export const RECIPES = [
  { id: "hp", name: "Health potion", need: { wood: 2, crystal: 1 }, give: (d) => { d.hp = (d.hp || 0) + 1; } },
  { id: "sp", name: "Mana potion", need: { ore: 2, crystal: 1 }, give: (d) => { d.sp = (d.sp || 0) + 1; } },
  { id: "recall", name: "Recall scroll", need: { crystal: 3, wood: 1 }, give: (d) => { d.recall = (d.recall || 0) + 1; } },
  { id: "scrap", name: "40 scrap", need: { ore: 3, wood: 2 }, give: (d) => { d.scrap = (d.scrap || 0) + 40; } },
];
// the fish: weight decides how often; size is rolled in a range (the log keeps your biggest)
export const FISH = [
  { id: "guppy", name: "Gas Guppy", w: 34, cm: [6, 14], color: 0x7fe6ff, where: "any" },
  { id: "minnow", name: "Mempool Minnow", w: 28, cm: [8, 18], color: 0xb4c8e0, where: "any" },
  { id: "carp", name: "Stablecoin Carp", w: 18, cm: [25, 55], color: 0x2ee07a, where: "any" },
  { id: "eel", name: "Rug Eel", w: 10, cm: [40, 90], color: 0xb48cff, where: "swamp" },
  { id: "whale", name: "Baby Whale", w: 6, cm: [80, 160], color: 0x2f86ff, where: "fountain" },
  { id: "koi", name: "Golden ARC Koi", w: 4, cm: [30, 70], color: 0xffc861, where: "any" },
];

export function createLife(ctx) {
  const { THREE, planet, T, esc } = ctx;
  const root = new THREE.Group(); root.name = "life"; planet.add(root);
  const X = () => { const d = ctx.rpg() && ctx.rpg().data(); if (!d) return null; d.x = d.x || {}; d.x.mat = d.x.mat || { ore: 0, crystal: 0, wood: 0 }; d.x.fish = d.x.fish || {}; return d; };
  let rnd = 98765; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const tmp = new THREE.Vector3(), me = new THREE.Vector3();

  // ---------------- the nodes: spread over the meadows and inside each hunting ground ----------------
  const nodes = [];
  function place(kind, x, z) {
    const v = new THREE.Vector3(x, 0, z); if (ctx.blocked(v) || Math.hypot(x, z) < 17) return;
    if (nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 4)) return;
    const g = gatherNode(kind); mergeStatic(g); g.position.set(x, 0, z); // its parts in one mesh per material: a few draw calls each g.rotation.y = r() * 6.28; g.scale.setScalar(kind === "wood" ? 1 : 1.1); root.add(g);
    nodes.push({ kind, x, z, g, hp: 3, back: 0 });
  }
  const KINDS = ["ore", "crystal", "wood"];
  for (let i = 0; i < (ctx.low ? 10 : 15); i++) { const a = r() * 6.28, d = 20 + r() * 26; place(KINDS[i % 3], Math.sin(a) * d, Math.cos(a) * d); }
  for (const z of ctx.zones || []) for (let i = 0; i < 3; i++) { const a = r() * 6.28, d = 6 + r() * (z.r - 9); place(z.id === "depths" ? "crystal" : z.id === "canyon" ? "ore" : KINDS[(i + z.x) % 3 | 0] || "ore", z.x + Math.sin(a) * d, z.z + Math.cos(a) * d); }

  /// a swing at p facing f: the closest node in front takes a hit (the hammer hits twice as hard)
  function swingAt(p, f, heavy = false, hammer = false) {
    let best = null, bd = 2.6;
    for (const n of nodes) { if (n.back > 0) continue; const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz); if (d < bd && (d < 1.2 || (dx * f.x + dz * f.z) / d > 0.2)) { bd = d; best = n; } }
    if (!best) return false;
    best.hp -= (hammer ? 2 : 1) + (heavy ? 1 : 0);
    best.g.scale.setScalar(best.g.scale.x * 0.92); best.shake = 0.2;
    ctx.Snd.hit ? ctx.Snd.hit() : ctx.Snd.pick && ctx.Snd.pick();
    if (best.hp <= 0) harvest(best);
    return true;
  }
  function harvest(n) {
    const d = X(); if (!d) return;
    const got = 2 + Math.floor(r() * 2) + (r() < 0.15 ? 2 : 0);
    d.x.mat[n.kind] = Math.min(999, (d.x.mat[n.kind] || 0) + got);
    ctx.float(`+${got} ${T(MATS[n.kind].name)}`, tmp.set(n.x, 2, n.z), MATS[n.kind].color);
    if (ctx.vfx) ctx.vfx.collect(tmp.set(n.x, 0.8, n.z), new THREE.Color(MATS[n.kind].color).getHex());
    n.back = 120; n.g.visible = false; ctx.save(); paintMats();
  }

  // ---------------- fishing: the fountain's pool and the swamp's ponds ----------------
  const POOLS = () => { const out = [{ x: 0, z: 0, r: 4.1, where: "fountain" }]; const sw = (ctx.zones || []).find((z) => z.id === "swamp"); if (sw) out.push({ x: sw.x, z: sw.z, r: sw.r - 2, where: "swamp" }); return out; };
  const poolAt = (p) => POOLS().find((w) => Math.hypot(p.x - w.x, p.z - w.z) < w.r + 1.2) || null;
  const bar = document.createElement("div"); bar.className = "wl-fish"; bar.hidden = true; bar.setAttribute("role", "dialog"); bar.setAttribute("data-no-i18n", "");
  bar.innerHTML = `<p></p><div class="wl-track"><i class="wl-zone"></i><b class="wl-mark"></b></div><button type="button" class="wp-cta" data-wlreel>${esc(T("Reel in"))}</button>`;
  document.body.appendChild(bar);
  let fishing = null;
  function startFish(w) {
    if (fishing) return;
    const zone = 0.18 + r() * 0.08, at = 0.15 + r() * (0.85 - zone - 0.15);
    fishing = { w, t: 0, bite: 1.2 + r() * 2.2, zone, at, mark: 0, dir: 1, speed: 0.9 + r() * 0.6, tries: 2 };
    bar.hidden = false; bar.querySelector("p").textContent = T("Waiting for a bite…"); bar.classList.remove("bite");
    const z = bar.querySelector(".wl-zone"); z.style.left = at * 100 + "%"; z.style.width = zone * 100 + "%";
  }
  function reel() {
    const f = fishing; if (!f) return;
    if (f.t < f.bite) { ctx.toast(T("Too soon: nothing's biting yet")); stopFish(); return; }
    if (f.mark >= f.at && f.mark <= f.at + f.zone) { catchFish(f.w); stopFish(); return; }
    f.tries--; if (f.tries <= 0) { ctx.toast(T("It got away")); stopFish(); } else bar.querySelector("p").textContent = T("Missed! One more try");
  }
  function stopFish() { fishing = null; bar.hidden = true; }
  function catchFish(w) {
    const d = X(); if (!d) return;
    const pool = FISH.filter((x) => x.where === "any" || x.where === w.where); let roll = r() * pool.reduce((a, x) => a + x.w, 0), fsh = pool[0];
    for (const x of pool) { roll -= x.w; if (roll <= 0) { fsh = x; break; } }
    const cm = Math.round(fsh.cm[0] + (fsh.cm[1] - fsh.cm[0]) * Math.pow(r(), 1.6));
    const best = d.x.fish[fsh.id] || 0, rec = cm > best; if (rec) d.x.fish[fsh.id] = cm;
    ctx.toast(rec ? T("Caught a {x}, {n} cm — your biggest!", { x: T(fsh.name), n: cm }) : T("Caught a {x}, {n} cm", { x: T(fsh.name), n: cm }));
    ctx.Snd.win && ctx.Snd.win(); ctx.save(); paintMats();
    // the fish leaps out of the water and falls back in
    const fm = fish3d(fsh.color); ctx.here(me); fm.position.set(w.where === "fountain" ? me.x * 0.5 : me.x, 0.4, w.where === "fountain" ? me.z * 0.5 : me.z + 1.5); root.add(fm);
    jumps.push({ g: fm, t: 0, x0: fm.position.x, z0: fm.position.z });
    if (ctx.vfx) ctx.vfx.collect(fm.position.clone().setY(0.4), fsh.color);
  }
  const jumps = [];
  bar.addEventListener("click", (e) => { if (e.target.closest("[data-wlreel]")) reel(); });

  // ---------------- the action button: Gather / Fish when there's something to do close by ----------------
  const act = document.createElement("button"); act.type = "button"; act.className = "wl-act"; act.hidden = true; act.setAttribute("data-no-i18n", ""); document.body.appendChild(act);
  let actFor = null;
  act.addEventListener("click", () => doAct());
  addEventListener("keydown", (e) => {
    if (e.repeat || e.target.closest("input,textarea,[contenteditable]")) return;
    if (e.key === "g" || e.key === "G") { if (fishing) reel(); else doAct(); }
    else if (fishing && e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); reel(); }
  }, true);
  function doAct() {
    if (!actFor) return;
    if (actFor.fish) startFish(actFor.fish);
    else if (actFor.node) { ctx.here(me); swingAt(me, tmp.set(actFor.node.x - me.x, 0, actFor.node.z - me.z).normalize(), false, false); if (ctx.onGather) ctx.onGather(); }
  }

  // ---------------- the workbench: in the character sheet's footer, and here as a sheet of its own ----------------
  const sheet = document.createElement("div"); sheet.className = "wl-sheet"; sheet.hidden = true; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("data-no-i18n", ""); document.body.appendChild(sheet);
  function paintSheet() {
    const d = X(); if (!d) return; const m = d.x.mat;
    sheet.innerHTML = `<div class="wl-card"><button type="button" class="wp-btn wp-x" data-wlx aria-label="${esc(T("Close"))}">×</button>
      <h2>${esc(T("Workbench"))}</h2><p class="wl-note">${esc(T("Gather ore, data crystals and wood out in the world (G, or the Gather button), then make things here."))}</p>
      <div class="wl-mats">${Object.entries(MATS).map(([k, x]) => `<span style="--c:${x.color}"><i></i>${esc(T(x.name))}<b>${m[k] || 0}</b></span>`).join("")}</div>
      <ul class="wl-recipes">${RECIPES.map((rc) => { const ok = Object.entries(rc.need).every(([k, n]) => (m[k] || 0) >= n);
        return `<li><div><b>${esc(T(rc.name))}</b><small>${Object.entries(rc.need).map(([k, n]) => `${n} ${esc(T(MATS[k].name))}`).join(" + ")}</small></div><button type="button" class="${ok ? "wp-cta" : "wp-btn"}" data-wlmake="${rc.id}" ${ok ? "" : "disabled"}>${esc(T("Make"))}</button></li>`; }).join("")}</ul>
      <h3>${esc(T("Fish log"))}</h3><ul class="wl-fishlog">${FISH.map((f) => { const b = d.x.fish[f.id]; return `<li class="${b ? "" : "none"}"><i style="background:#${new THREE.Color(f.color).getHexString()}"></i><span>${esc(b ? T(f.name) : "???")}</span><b>${b ? esc(T("{n} cm", { n: b })) : "—"}</b></li>`; }).join("")}</ul></div>`;
  }
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("[data-wlx]")) { hideSheet(); return; }
    const b = e.target.closest("[data-wlmake]"); if (!b) return;
    const d = X(), rc = RECIPES.find((x) => x.id === b.dataset.wlmake); if (!d || !rc) return;
    if (!Object.entries(rc.need).every(([k, n]) => (d.x.mat[k] || 0) >= n)) return;
    for (const [k, n] of Object.entries(rc.need)) d.x.mat[k] -= n;
    rc.give(d); ctx.Snd.pick && ctx.Snd.pick(); ctx.toast(T("Made: {x}", { x: T(rc.name) }));
    ctx.rpg().refresh && ctx.rpg().refresh(); ctx.onPots && ctx.onPots(); ctx.save(); paintSheet(); paintMats();
  });
  addEventListener("keydown", (e) => { if (!sheet.hidden && e.key === "Escape") { e.stopImmediatePropagation(); hideSheet(); } }, true);
  function showSheet() { paintSheet(); sheet.hidden = false; }
  function hideSheet() { sheet.hidden = true; }
  // a small line of what you carry, under the action button
  function paintMats() { const d = X(); if (!d) return; act.dataset.mats = `${d.x.mat.ore || 0} · ${d.x.mat.crystal || 0} · ${d.x.mat.wood || 0}`; }

  // ---------------- each frame ----------------
  let scan = 0;
  function tick(dt) {
    for (const n of nodes) {
      if (n.back > 0) { n.back -= dt; if (n.back <= 0) { n.hp = 3; n.g.visible = true; n.g.scale.setScalar(n.kind === "wood" ? 1 : 1.1); } continue; }
      if (n.shake > 0) { n.shake -= dt; n.g.position.x = n.x + Math.sin(n.shake * 80) * 0.05; } else n.g.position.x = n.x;
    }
    for (let i = jumps.length - 1; i >= 0; i--) { const j = jumps[i]; j.t += dt; const k = j.t / 1.1; j.g.position.y = 0.4 + Math.sin(Math.min(1, k) * Math.PI) * 2.2; j.g.rotation.x = -k * 4; if (k >= 1) { root.remove(j.g); jumps.splice(i, 1); } }
    if (fishing) {
      const f = fishing; f.t += dt;
      if (f.t >= f.bite) { if (!bar.classList.contains("bite")) { bar.classList.add("bite"); bar.querySelector("p").textContent = T("A bite! Reel in when the mark is in the green"); ctx.Snd.pick && ctx.Snd.pick(); }
        f.mark += f.dir * f.speed * dt; if (f.mark > 1) { f.mark = 1; f.dir = -1; } if (f.mark < 0) { f.mark = 0; f.dir = 1; }
        bar.querySelector(".wl-mark").style.left = f.mark * 100 + "%"; }
      if (f.t > f.bite + 9) { ctx.toast(T("It got away")); stopFish(); }
      ctx.here(me); if (!poolAt(me)) stopFish();
    }
    if ((scan -= dt) > 0) return; scan = 0.25;
    if (!ctx.inHub()) { act.hidden = true; actFor = null; return; }
    ctx.here(me);
    for (const n of nodes) if (n.back <= 0) n.g.visible = Math.hypot(n.x - me.x, n.z - me.z) < 75; // far ones aren't drawn
    let near = null, nd = 2.4; for (const n of nodes) { if (n.back > 0) continue; const d = Math.hypot(n.x - me.x, n.z - me.z); if (d < nd) { nd = d; near = n; } }
    const w = near ? null : poolAt(me);
    actFor = near ? { node: near } : w ? { fish: w } : null;
    act.hidden = !actFor || !!fishing;
    if (actFor) act.innerHTML = `<b>G</b>${esc(actFor.fish ? T("Fish") : T("Gather {x}", { x: T(MATS[near.kind].name) }))}`;
  }
  paintMats();
  return { tick, swingAt, reel, showSheet, hideSheet, isOpen: () => !sheet.hidden || !!fishing, nodes: () => nodes.map((n) => ({ kind: n.kind, x: n.x, z: n.z, up: n.back <= 0 })), mats: () => { const d = X(); return d ? { ...d.x.mat } : null; }, fishLog: () => { const d = X(); return d ? { ...d.x.fish } : null; }, fishing: () => fishing && { ...fishing } };
}
