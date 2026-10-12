// world-life.js — the quiet things to do between fights: gathering (ore, data crystals, logs) with any weapon, a
// workbench to turn what you gathered into potions, scrolls and scrap, and fishing in the fountain and the swamp
// ponds with a small timing game and a log of your best catches.
//
// Everything here is local progress kept in the save (rpg.x.mat, rpg.x.fish): materials and fish are never ARCL and
// never sold for it.
//
// ctx: { THREE, planet, T, esc, toast, Snd, rpg(), here(v), blocked(v), zones, inHub(), save(), vfx, low,
//        float(text, v, color), shake(n) }
import { gatherNode, fish as fish3d, weaponThumb, weaponKind } from "./world-gear3d.js";
import { pondOf, temperCost, temperOf, TEMPER_MAX, TEMPER_STEP, parseBase, RARITY } from "./world-rpg-data.js";
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
  // one of its own in each far ground's pond
  { id: "cod", name: "Cold Wallet Cod", w: 22, cm: [30, 80], color: 0x9fe8ff, where: "peaks" },
  { id: "snapper", name: "Mirage Snapper", w: 22, cm: [25, 60], color: 0xffc861, where: "dunes" },
  { id: "angler", name: "Phish Angler", w: 22, cm: [40, 110], color: 0x35d8d0, where: "reef" },
  { id: "barb", name: "Bot Farm Barb", w: 22, cm: [20, 50], color: 0x9aff3c, where: "wastes" },
  { id: "sturgeon", name: "Insolvent Sturgeon", w: 22, cm: [60, 150], color: 0xb48cff, where: "ruins" },
  { id: "ray", name: "Lava Bridge Ray", w: 22, cm: [50, 130], color: 0xff5a1a, where: "abyss" },
  { id: "leviathan", name: "Last Rug Leviathan", w: 14, cm: [100, 300], color: 0xff4dd2, where: "void" },
];
// mastery: gathering and fishing get better the more you do them (levels 1–10, local progress in rpg.x.gm / rpg.x.fm)
export const masteryLv = (xp) => Math.min(10, 1 + Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 6)));
export const masteryNext = (lv) => (lv >= 10 ? null : 6 * lv * lv);

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
    if ((ctx.zones || []).some((zn) => { const p = pondOf(zn); return p && Math.hypot(p.x - x, p.z - z) < p.r + 2; })) return;
    const g = gatherNode(kind); mergeStatic(g); g.position.set(x, 0, z); // its parts in one mesh per material: a few draw calls each g.rotation.y = r() * 6.28; g.scale.setScalar(kind === "wood" ? 1 : 1.1); root.add(g);
    nodes.push({ kind, x, z, g, hp: 3, back: 0 });
  }
  const KINDS = ["ore", "crystal", "wood"];
  for (let i = 0; i < (ctx.low ? 10 : 15); i++) { const a = r() * 6.28, d = 20 + r() * 26; place(KINDS[i % 3], Math.sin(a) * d, Math.cos(a) * d); }
  for (const z of ctx.zones || []) for (let i = 0; i < 3; i++) { const a = r() * 6.28, d = 6 + r() * (z.r - 9); place(z.id === "depths" ? "crystal" : z.id === "canyon" ? "ore" : KINDS[(i + z.x) % 3 | 0] || "ore", z.x + Math.sin(a) * d, z.z + Math.cos(a) * d); }

  function gainMastery(d, key, n, what) {
    const lv0 = masteryLv(d.x[key]); d.x[key] = Math.min(99999, (d.x[key] || 0) + n); const lv1 = masteryLv(d.x[key]);
    if (lv1 > lv0) { ctx.toast(T(what === "Fishing" ? "Fishing mastery {n}" : "Gathering mastery {n}", { n: lv1 })); ctx.Snd.level && ctx.Snd.level(); }
  }
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
    const glv = masteryLv(d.x.gm), got = 2 + Math.floor(r() * 2) + (r() < 0.15 ? 2 : 0) + (r() < (glv - 1) * 0.06 ? 1 : 0); // a sure hand finds a little more
    gainMastery(d, "gm", 1, "Gathering");
    d.x.mat[n.kind] = Math.min(999, (d.x.mat[n.kind] || 0) + got);
    ctx.float(`+${got} ${T(MATS[n.kind].name)}`, tmp.set(n.x, 2, n.z), MATS[n.kind].color);
    if (ctx.vfx) ctx.vfx.collect(tmp.set(n.x, 0.8, n.z), new THREE.Color(MATS[n.kind].color).getHex());
    n.back = 120; n.g.visible = false; ctx.save(); paintMats();
  }

  // ---------------- fishing: the fountain's pool and the swamp's ponds ----------------
  const PONDS = (ctx.zones || []).map((z) => { const p = pondOf(z); return p ? { ...p, where: z.id } : null; }).filter(Boolean);
  const POOLS = () => { const out = [{ x: 0, z: 0, r: 4.1, where: "fountain" }]; const sw = (ctx.zones || []).find((z) => z.id === "swamp"); if (sw) out.push({ x: sw.x, z: sw.z, r: sw.r - 2, where: "swamp" }); return out.concat(PONDS); };
  // each far pond in its ground's look: an ice hole, an oasis, a tide pool, a toxic pool, a flooded vault, lava, stars
  const POND_LOOK = { peaks: [0x1a3a5a, 0xf4fbff, 0x8fe6ff], dunes: [0x1f8a8a, 0xe8c080, 0x7fe6d0], reef: [0x0e6a70, 0xf0e4d8, 0x35d8d0], wastes: [0x3a7a10, 0x3a4450, 0x9aff3c], ruins: [0x2a1e4a, 0xd8d0e4, 0xb48cff], abyss: [0xff4a10, 0x1a0e10, 0xff8a3a], void: [0x0a0418, 0x3a2a5a, 0xff4dd2] };
  for (const pd of PONDS) {
    const [wc, rc, gc] = POND_LOOK[pd.where] || [0x2a6a9a, 0x888888, 0x8fe6ff], g = new THREE.Group(); g.position.set(pd.x, 0, pd.z); g.name = "pond:" + pd.where;
    const water = new THREE.Mesh(new THREE.CircleGeometry(pd.r, 40), new THREE.MeshStandardMaterial({ color: wc, emissive: pd.where === "abyss" ? 0xff4a10 : gc, emissiveIntensity: pd.where === "abyss" ? 1.6 : 0.18, roughness: 0.15, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -4 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.06; g.add(water);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(pd.r, 0.28, 8, 40), new THREE.MeshStandardMaterial({ color: rc, roughness: 0.8, flatShading: true })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; g.add(rim);
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x5a4a3a })); sign.position.set(pd.r + 0.6, 0.8, 0); g.add(sign);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.8 })); flag.position.set(pd.r + 0.95, 1.4, 0); g.add(flag);
    root.add(g);
  }
  const poolAt = (p) => POOLS().find((w) => Math.hypot(p.x - w.x, p.z - w.z) < w.r + 1.2) || null;
  const bar = document.createElement("div"); bar.className = "wl-fish"; bar.hidden = true; bar.setAttribute("role", "dialog"); bar.setAttribute("data-no-i18n", "");
  bar.innerHTML = `<p></p><div class="wl-track"><i class="wl-zone"></i><b class="wl-mark"></b></div><button type="button" class="wp-cta" data-wlreel>${esc(T("Reel in"))}</button>`;
  document.body.appendChild(bar);
  let fishing = null;
  function startFish(w) {
    if (fishing) return;
    const d0 = X(), flv = d0 ? masteryLv(d0.x.fm) : 1; // a practised angler: bites come sooner, the green is wider
    const zone = 0.18 + r() * 0.08 + (flv - 1) * 0.012, at = 0.15 + r() * (0.85 - zone - 0.15);
    fishing = { w, t: 0, bite: (1.2 + r() * 2.2) * (1 - (flv - 1) * 0.04), zone, at, mark: 0, dir: 1, speed: 0.9 + r() * 0.6, tries: 2 };
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
    const flv = masteryLv(d.x.fm), wt = (x) => x.w * (x.id === "koi" || x.where === w.where ? 1 + (flv - 1) * 0.1 : 1); // rarer ones a little likelier with practice
    const pool = FISH.filter((x) => x.where === "any" || x.where === w.where); let roll = r() * pool.reduce((a, x) => a + wt(x), 0), fsh = pool[0];
    for (const x of pool) { roll -= wt(x); if (roll <= 0) { fsh = x; break; } }
    const cm = Math.round(fsh.cm[0] + (fsh.cm[1] - fsh.cm[0]) * Math.pow(r(), 1.6));
    const best = d.x.fish[fsh.id] || 0, rec = cm > best; if (rec) d.x.fish[fsh.id] = cm;
    gainMastery(d, "fm", rec ? 2 : 1, "Fishing");
    ctx.toast(rec ? T("Caught a {x}, {n} cm — your biggest!", { x: T(fsh.name), n: cm }) : T("Caught a {x}, {n} cm", { x: T(fsh.name), n: cm }));
    ctx.Snd.win && ctx.Snd.win(); ctx.save(); paintMats();
    // the fish leaps out of the water and falls back in
    const fm = fish3d(fsh.color); ctx.here(me); if (w.where !== "swamp") fm.position.set((me.x + w.x) / 2, 0.4, (me.z + w.z) / 2); else fm.position.set(me.x, 0.4, me.z + 1.5); root.add(fm);
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
  // three tabs: Make (what you can make first, short materials in red), Temper (the weapon in hand), Mastery (levels and
  // the fish log, town fish and each far ground's own)
  let tab = "make";
  const need = (m, rc) => Object.entries(rc.need).every(([k, n]) => (m[k] || 0) >= n);
  const chips = (m, req) => Object.entries(req).filter(([k]) => MATS[k]).map(([k, n]) => `<span class="wl-chip${(m[k] || 0) >= n ? "" : " short"}" style="--c:${MATS[k].color}"><i></i>${(m[k] || 0) >= n ? n : `${m[k] || 0}/${n}`} ${esc(T(MATS[k].name))}</span>`).join("");
  function weaponNow() { const d = ctx.rpg() && ctx.rpg().data(); return d && d.eq && d.eq.weapon ? d.eq.weapon : null; }
  function paintSheet() {
    const d = X(); if (!d) return; const m = d.x.mat;
    let body = "";
    if (tab === "make") {
      const list = [...RECIPES].sort((a, b) => need(m, b) - need(m, a));
      body = `<ul class="wl-recipes">${list.map((rc) => { const ok = need(m, rc);
        return `<li class="${ok ? "ok" : "no"}"><div><b>${esc(T(rc.name))}</b><p>${chips(m, rc.need)}</p></div><button type="button" class="${ok ? "wp-cta" : "wp-btn"}" data-wlmake="${rc.id}" ${ok ? "" : "disabled"}>${esc(T("Make"))}</button></li>`; }).join("")}</ul>`;
    } else if (tab === "temper") {
      const w = weaponNow();
      if (!w) body = `<p class="wl-note">${esc(T("Equip a weapon to temper it."))}</p>`;
      else { const tm = temperOf(w), pb = parseBase(w.b), cost = tm < TEMPER_MAX ? temperCost(tm + 1) : null, okM = cost && Object.entries(cost).every(([k, n]) => k === "scrap" ? (d.scrap || 0) >= n : (m[k] || 0) >= n);
        const thumb = pb ? weaponThumb(weaponKind(w), pb.tier, RARITY[w.r || 0].color) : "";
        body = `<div class="wl-temper"><div class="wl-wpn" style="--rc:${RARITY[w.r || 0].color}">${thumb ? `<img src="${thumb}" alt="">` : ""}</div><div><b>${esc(ctx.rpg().itemName(w))}</b>
          <p class="wl-stars" aria-label="${esc(T("Temper {n} of {m}", { n: tm, m: TEMPER_MAX }))}">${Array.from({ length: TEMPER_MAX }, (_, i) => `<i class="${i < tm ? "on" : ""}"></i>`).join("")}</p>
          <small>${esc(T("Each stage: +{p}% to the weapon, and it glows brighter", { p: Math.round(TEMPER_STEP * 100) }))}</small></div></div>
          ${cost ? `<p class="wl-cost">${chips(m, cost)}<span class="wl-chip${(d.scrap || 0) >= cost.scrap ? "" : " short"}" style="--c:#c8d2dc"><i></i>${cost.scrap} ${esc(T("Scrap"))}</span></p>
          <button type="button" class="${okM ? "wp-cta" : "wp-btn"} wl-wide" data-wltemper ${okM ? "" : "disabled"}>${esc(T("Temper to stage {n}", { n: tm + 1 }))}</button>` : `<p class="wl-note">${esc(T("Fully tempered."))}</p>`}`; }
    } else {
      const gl = masteryLv(d.x.gm), fl = masteryLv(d.x.fm), bar = (xp, lv) => { const nx = masteryNext(lv), lo = 6 * (lv - 1) * (lv - 1); return nx ? `<i><u style="width:${Math.min(100, (100 * ((xp || 0) - lo)) / (nx - lo))}%"></u></i>` : `<i><u style="width:100%"></u></i>`; };
      const groups = [["any", T("Town waters")], ...PONDS.map((p) => [p.where, (ctx.zones.find((z) => z.id === p.where) || {}).name || p.where])];
      body = `<div class="wl-mastery"><div><b>${esc(T("Gathering"))} <em>${gl}</em></b>${bar(d.x.gm, gl)}<small>${esc(T("Sometimes one more material"))}</small></div><div><b>${esc(T("Fishing"))} <em>${fl}</em></b>${bar(d.x.fm, fl)}<small>${esc(T("Quicker bites, a wider green, rarer fish"))}</small></div></div>
        <h3>${esc(T("Fish log"))} <small>${FISH.filter((f) => d.x.fish[f.id]).length} / ${FISH.length}</small></h3>
        ${groups.map(([wh, name]) => { const fs = FISH.filter((f) => (wh === "any" ? f.where === "any" || f.where === "swamp" || f.where === "fountain" : f.where === wh)); return `<h4>${esc(name)}</h4><ul class="wl-fishlog">${fs.map((f) => { const b = d.x.fish[f.id]; return `<li class="${b ? "" : "none"}"><i style="background:#${new THREE.Color(f.color).getHexString()}"></i><span>${esc(b ? T(f.name) : "???")}</span><b>${b ? esc(T("{n} cm", { n: b })) : "—"}</b></li>`; }).join("")}</ul>`; }).join("")}`;
    }
    sheet.innerHTML = `<div class="wl-card"><button type="button" class="wp-btn wp-x" data-wlx aria-label="${esc(T("Close"))}">×</button>
      <h2>${esc(T("Workbench"))}</h2><p class="wl-note">${esc(T("Gather ore, data crystals and wood out in the world (G, or the Gather button), then make things here."))}</p>
      <div class="wl-mats">${Object.entries(MATS).map(([k, x]) => `<span style="--c:${x.color}"><i></i>${esc(T(x.name))}<b>${m[k] || 0}</b></span>`).join("")}</div>
      <nav class="wl-tabs" role="tablist">${[["make", "Make"], ["temper", "Temper"], ["mastery", "Mastery"]].map(([id, n]) => `<button type="button" role="tab" data-wltab="${id}" aria-selected="${tab === id}">${esc(T(n))}</button>`).join("")}</nav>
      <div class="wl-body">${body}</div>
      <p class="wl-foot">${esc(T("Materials and fish are for the game only: they're never ARCL and can't be sold for it."))}</p></div>`;
  }
  // what you made pops up for a moment
  function made(name, color = "#9fffd0") {
    const c = sheet.querySelector(".wl-card"); if (!c) return; const el = document.createElement("div"); el.className = "wl-made"; el.style.setProperty("--c", color); el.textContent = name; c.appendChild(el); setTimeout(() => el.remove(), 1300);
  }
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("[data-wlx]")) { hideSheet(); return; }
    const tb = e.target.closest("[data-wltab]"); if (tb) { tab = tb.dataset.wltab; paintSheet(); return; }
    if (e.target.closest("[data-wltemper]")) { temper(); return; }
    const b = e.target.closest("[data-wlmake]"); if (!b) return;
    const d = X(), rc = RECIPES.find((x) => x.id === b.dataset.wlmake); if (!d || !rc) return;
    if (!need(d.x.mat, rc)) return;
    for (const [k, n] of Object.entries(rc.need)) d.x.mat[k] -= n;
    rc.give(d); ctx.Snd.pick && ctx.Snd.pick(); ctx.toast(T("Made: {x}", { x: T(rc.name) }));
    ctx.rpg().refresh && ctx.rpg().refresh(); ctx.onPots && ctx.onPots(); ctx.save(); paintSheet(); paintMats(); made(T(rc.name));
  });
  function temper() {
    const d = X(), w = weaponNow(); if (!d || !w) return; const tm = temperOf(w); if (tm >= TEMPER_MAX) return;
    const cost = temperCost(tm + 1); if (!Object.entries(cost).every(([k, n]) => k === "scrap" ? (d.scrap || 0) >= n : (d.x.mat[k] || 0) >= n)) return;
    for (const [k, n] of Object.entries(cost)) { if (k === "scrap") d.scrap -= n; else d.x.mat[k] -= n; }
    w.tm = tm + 1; ctx.Snd.chest && ctx.Snd.chest(); ctx.toast(T("Tempered to stage {n}", { n: w.tm }));
    ctx.rpg().dress && ctx.rpg().dress(); ctx.rpg().refresh && ctx.rpg().refresh(); ctx.onStats && ctx.onStats(); ctx.save(); paintSheet(); paintMats(); made("✦".repeat(w.tm), RARITY[w.r || 0].color);
    if (ctx.vfx) { ctx.here(me); ctx.vfx.buff && ctx.vfx.buff(new THREE.Color(RARITY[w.r || 0].color).getHex()); }
  }
  addEventListener("keydown", (e) => { if (!sheet.hidden && e.key === "Escape") { e.stopImmediatePropagation(); hideSheet(); } }, true);
  function showSheet(t) { if (t) tab = t; paintSheet(); sheet.hidden = false; }
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
      if (f.t >= f.bite) { if (!bar.classList.contains("bite")) { bar.classList.add("bite"); bar.querySelector("p").textContent = T("A bite! Reel in when the mark is in the green"); ctx.Snd.pick && ctx.Snd.pick(); ctx.buzz && ctx.buzz([30, 40, 30]); }
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
    if (actFor && ctx.hint) ctx.hint(actFor.fish ? "fish" : "gather");
  }
  paintMats();
  return { tick, swingAt, reel, showSheet, hideSheet, isOpen: () => !sheet.hidden || !!fishing, nodes: () => nodes.map((n) => ({ kind: n.kind, x: n.x, z: n.z, up: n.back <= 0 })), mats: () => { const d = X(); return d ? { ...d.x.mat } : null; }, fishLog: () => { const d = X(); return d ? { ...d.x.fish } : null; }, fishing: () => fishing && { ...fishing } };
}
