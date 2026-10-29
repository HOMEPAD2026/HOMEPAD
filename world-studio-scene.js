// world-studio-scene.js — OBBY WORLD's 3D scene editor (2026-10-28, the owner's "Roblox feel" list, items 1–7, 9, 10, 12):
// the course in 3D as it will be played. Tap a thing to pick it; the gizmo moves it along an axis or flat on the ground,
// turns it (15° steps) or sizes it along its own axes; duplicate, delete, nudge, undo / redo, snap. The insert palette
// puts a new piece where the middle of the view lands (on top of what's there). The side panel: Properties (place, turn,
// size, colour, surface, the kind's two options, a group), Logic (WHEN → THEN rules on two counters, a phase, channels
// and groups, or the same as a short script), Look & UI (seven look presets, the baseplate, hearts, a time limit, the
// quest line, the HUD's pieces, the cinematics, your hero's gear and pet), Director (one sentence makes a course; later
// sentences change it: "add a boss", "harder ending" …), Assets (Meshy's props, and new ones made with Meshy for this
// course). Under the view: the 40 test players' stars and clear rate, their report — where the course is dull, when it's
// too easy, what ends the most runs — and the pieces nobody can reach (red).
//   createSceneBuilder(ctx) — ctx: { THREE, T, esc, toast, spec, onDone, onChange, onClose, onTest, K, ver, coarse, assets }
import { pfThumb, thinPf } from "./world-studio-pfthumb.js";
import { ask } from "./world-ask.js";
import { OB, PF, PREFABS, clampSpec, cleanObby, estimate, obReach, obScript, obParse, genObbyBuild, obWants, obTweak, packPrefab, placePrefab, cleanPrefab, THEMES, CMP, CMP_CAP, CMP_SND, CMP_PK, entsOf, presetOf, edParse, obBudget, OB_BUDGET, SC_HELP, SC_DO, compOf } from "./world-studio-gen.js";
import { graphHtml, graphWire, graphTag } from "./world-studio-graph.js";
import { LOOKS, obGeos, obMats, obSurfaces } from "./world-studio-obby.js";

const NAMES = { b: "Block", r: "Ramp", y: "Round platform", k: "Lava", s: "Spinner", m: "Moving platform", p: "Jump pad", c: "Checkpoint", S: "Start", g: "Goal", o: "Coin", h: "Heart", d: "Door", u: "Button", e: "Elevator", t: "Teleporter", n: "Shop", B: "Boss", x: "Prop", X: "My asset", E: "Enemy", R: "Race ring", Q: "Gem", H: "Hill", W: "Water", P: "Crate", A: "Character" };
const ICONS = { b: "🧱", r: "📐", y: "⭕", k: "🌋", s: "🌀", m: "↔️", p: "🦘", c: "🚩", S: "🟢", g: "🏁", o: "🪙", h: "❤️", d: "🚪", u: "🔘", e: "🛗", t: "🌀", n: "🛒", B: "👑", x: "🌳", X: "✨", E: "👾", R: "💫", Q: "💎", H: "⛰️", W: "🌊", P: "📦", A: "🧑" };
const PAL = [["Build", ["b", "r", "y"]], ["Terrain", ["H", "W", "P"]], ["Hazards", ["k", "s"]], ["Motion", ["m", "e", "p"]], ["Smart", ["d", "u", "t", "n"]], ["Combat", ["E", "B"]], ["Race & explore", ["R", "Q", "A"]], ["Course", ["S", "c", "g", "o", "h"]], ["Decor", ["x"]]];
const WHEN_N = { start: "The run starts", button: "Button on channel", coins: "Coins at least", every: "Every N seconds", after: "After N seconds", varA: "Counter A at least", varB: "Counter B at least", phase: "Phase becomes", bosshalf: "The boss at half health", boss: "The boss falls", checkpoint: "Checkpoint number", enemies: "Every enemy defeated", collect: "Gems collected at least", ring: "Race ring number", touch: "A piece is touched (its tag)", broken: "A piece breaks (its tag)" };
const THEN_N = { open: "Open channel", close: "Close channel", toggle: "Toggle channel", say: "Show a message", addA: "Add to counter A", addB: "Add to counter B", setA: "Set counter A", setB: "Set counter B", phase: "Go to phase", show: "Show group", hide: "Hide group", heart: "Give hearts", coins: "Give coins", time: "Add seconds", speed: "Speed boost (s)", win: "Win the game", hurt: "Lose a heart", track: "Play animation track", cutscene: "Play the cutscene", lose: "Lose the game", dmg: "Damage a piece (its tag)", sound: "Play a sound", spawn: "Spawn from a spawner (its tag)", on: "Show a piece (its tag)", off: "Hide a piece (its tag)" };
const NOARG_W = new Set(["start", "bosshalf", "boss", "enemies"]), NOARG_T = new Set(["win", "hurt", "cutscene", "lose"]);
// ED1–ED5 (2026-10-29, the owner: "a pro 3D editor like the screenshot — easy, but real"): the inspector's components, the
// feature cards that add them, the palette's ready-made sets
const PCOMP = { mesh: "Mesh", collider: "Collider", damage: "Damage", spinner: "Spinner", knock: "Knock-back", mover: "Mover", jump: "Jump pad", checkpoint: "Checkpoint", spawn: "Player start", goal: "Goal", pickup: "Pickup", door: "Door", trigger: "Trigger", elevator: "Elevator", teleport: "Teleporter", shop: "Shop", health: "Health", ai: "AI", boss: "Boss", ring: "Race ring", water: "Water", rigidbody: "Rigidbody", npc: "Character" };
const CICON = { mv: "↔️", sp: "🌀", dm: "🔥", pk: "🪙", tg: "⚡", hl: "❤️", sn: "🔊", lt: "💡", sw: "👾", sc: "⌨️" };
const CENUM = { "mv:0": ["X", "Y (up)", "Z"], "sp:1": ["Clockwise", "Anticlockwise"], "pk:0": CMP_PK, "sn:0": CMP_SND, "sw:2": ["Walker", "Flyer", "Shooter"], "tg:1": ["Every time", "Once"] };
const FEATS = [["mv", "Moving platform"], ["sp", "Spinning"], ["dm", "Hurts"], ["pk", "Collectible"], ["hl", "Breakable"], ["sw", "Enemy spawner"], ["tg", "Trigger"], ["lt", "Light"], ["sc", "Script"]];
const SETS = [["doorbtn", "🚪", "Door + button"], ["platform", "↔️", "Moving platform"], ["spawner", "👾", "Enemy spawner"], ["breakwall", "💥", "Breakable wall"], ["checkpoint", "🚩", "Checkpoint"], ["bossarena", "👑", "Boss arena"]];
const MODES = { obby: ["Obby", "Jump from start to goal"], combat: ["Combat", "Fight enemies and bosses"], race: ["Race", "Fly through rings, lap after lap"], explore: ["Explore", "An open world with gems to find"] };
const WINS = { goal: "Reach the goal", enemies: "Defeat every enemy", collect: "Find every gem", race: "Finish the race", varA: "Only the rules ('Win the game')" };
const TRACKS = [["Slide 6 m", [[0, 0, 0, 0, 0], [2, 6, 0, 0, 0], [4, 0, 0, 0, 0]]], ["Rise 4 m", [[0, 0, 0, 0, 0], [2, 0, 4, 0, 0], [4, 0, 0, 0, 0]]], ["Spin", [[0, 0, 0, 0, 0], [2, 0, 0, 0, 180], [4, 0, 0, 0, 360]]], ["Door swing", [[0, 0, 0, 0, 0], [1, 0, 0, 0, 90]]], ["Patrol a square", [[0, 0, 0, 0, 0], [2, 6, 0, 0, 90], [4, 6, 0, 6, 180], [6, 0, 0, 6, 270], [8, 0, 0, 0, 360]]], ["Bob up and down", [[0, 0, 0, 0, 0], [1, 0, 0.8, 0, 0], [2, 0, 0, 0, 0]]]];
const LICN = { "cc-by": ["Free · credit", "Anyone may use and remix it; your name stays on it."], remix: ["Remix · share", "Use and remix inside ARCIRCLE; a remix that sells shares 25 % of its creator share with you."], personal: ["Personal use", "Use in their own games only — it can't be shared again or listed."] };
const PKIND = { boss: "Boss", enemy: "Enemy", building: "Building", device: "Device", terrain: "Terrain", set: "Set" };
const hex = (c) => "#" + (c >>> 0).toString(16).padStart(6, "0");

export function createSceneBuilder(ctx) {
  const { THREE, T, esc } = ctx; let spec = clampSpec(ctx.spec);
  let B = spec.build && spec.build.ob ? JSON.parse(JSON.stringify(spec.build)) : genObbyBuild(spec);
  let el = null, cv = null, rd = null, scene = null, cam = null, raf = 0, dirty = true, sel = -1, mode = "move", snap = true, tab = "prop", undo = [], redo = [], est = null, estT = 0, reach = null;
  const snapS = () => JSON.stringify(B), push = () => { undo.push(snapS()); if (undo.length > 120) undo.shift(); redo = []; };
  const orbit = { tx: 0, ty: 0, tz: 0, yaw: 0.7, pitch: 0.75, dist: 46 };
  let simOn = false, simT0 = 0, dbg = false, dbgG = null, treeQ = "", lv = "list", local = false, snapV = 0, fps = 0, fpsN = 0, fpsT = 0, histT = 0, GHOST = null, warned = false;
  const phone = () => !!ctx.coarse || innerWidth < 760, flyKeys = new Set(); let flyT = 0;
  let G = null, MT = null, objs = [], grid = null, bp = null, gizmo = null, selBox = null, redBoxes = null, chat = [];
  const R = (d) => (d * Math.PI) / 180;
  // ---------------- open / close ----------------
  function open() {
    el = document.createElement("div"); el.className = "wsb wse wse-pro" + (phone() ? " wse-ph" : ""); el.setAttribute("role", "dialog");
    const ib = (attr, ic, tip) => `<button type="button" ${attr} title="${esc(T(tip))}" aria-label="${esc(T(tip))}">${ic}</button>`;
    el.innerHTML = `<div class="wsb-in"><header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>ARCIRCLE Studio <small>${esc(T("3D editor"))}</small></b>
      <span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}" title="${esc(T("Undo (Ctrl+Z)"))}">↩</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}" title="${esc(T("Redo (Ctrl+Y)"))}">↪</button><button type="button" class="wsb-i" data-hist aria-label="${esc(T("Version history"))}" title="${esc(T("Version history"))}">🕘</button>
      ${ctx.save ? `<button type="button" class="wsb-b" data-save title="${esc(T("Save (Ctrl+S)"))}">💾 ${esc(T("Save"))}</button>` : ""}<button type="button" class="wsb-b alt" data-test title="${esc(T("Play it as your hero"))}">▶ ${esc(T("Play"))}</button>${ctx.onPublish ? `<button type="button" class="wsb-b" data-pub>🚀 ${esc(T("Publish"))}</button>` : ""}<button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wse-main"><aside class="wse-left"><section class="wse-tree2"><h5>${esc(T("Scene"))}<button type="button" class="wse-ib" data-newfold title="${esc(T("New folder"))}">＋ 📁</button></h5><input type="search" class="wse-tq" data-tq placeholder="${esc(T("Search the scene"))}" aria-label="${esc(T("Search the scene"))}"><div class="wse-tl2" role="tree"></div></section>
        <section class="wse-pal"><h5>${esc(T("Objects"))} <small>${esc(T(phone() ? "tap to add" : "drag into the view, or click"))}</small></h5>${PAL.map(([g, ks]) => `<small>${esc(T(g))}</small><div class="wse-pg">${ks.map((k) => `<button type="button" data-add="${k}" draggable="true" title="${esc(T(NAMES[k]))}"><i>${ICONS[k]}</i><span>${esc(T(NAMES[k]))}</span></button>`).join("")}</div>`).join("")}
          <small>${esc(T("Ready-made"))}</small><div class="wse-pg">${SETS.map(([id, ic, n]) => `<button type="button" data-set="${id}" draggable="true" title="${esc(T(n))}"><i>${ic}</i><span>${esc(T(n))}</span></button>`).join("")}</div></section></aside>
        <div class="wse-view"><canvas class="wse-cv"></canvas><div class="wse-stat" hidden></div>
          <nav class="wse-modes">${[["select", "⬚", "Select (Q)"], ["move", "✥", "Move (W)"], ["rot", "⟳", "Turn (E)"], ["scale", "⤢", "Size (R)"]].map(([m, ic, n]) => `<button type="button" data-mode="${m}" title="${esc(T(n))}">${ic}<span>${esc(T(n.replace(/ \(.\)$/, "")))}</span></button>`).join("")}<i></i>
            <button type="button" data-local title="${esc(T("Move along the piece's own axes, or the world's"))}"><span class="wse-lw">${esc(T("World"))}</span></button><label class="wse-snp" title="${esc(T("Snap"))}">#<select data-snapv>${[["0", "Snap auto"], ["0.25", "0.25 m"], ["0.5", "0.5 m"], ["1", "1 m"], ["2", "2 m"], ["off", "Snap off"]].map(([v, n]) => `<option value="${v}">${esc(T(n))}</option>`).join("")}</select></label><i></i>
            ${ib("data-dup", "⧉", "Duplicate (Ctrl+D)")}${ib("data-del", "🗑", "Delete")}${ib("data-madd", "⊕", "Pick more pieces (or Shift + click)")}${ib("data-focus", "◎", "Focus (F)")}<i></i>${ib("data-dbg", "🐞", "Debug view: colliders, triggers, paths, frame rate")}<button type="button" data-sim title="${esc(T("Simulate: the moving pieces move, here in the editor"))}">⏯<span>${esc(T("Simulate"))}</span></button></nav>
          <p class="wse-hint">${esc(T(phone() ? "Tap a piece to pick it · drag to look around · two fingers to zoom, pan and turn" : "Click to pick · drag to orbit · Alt + drag orbits over a piece · middle-drag pans · right-drag + WASD flies · wheel zooms"))}</p></div>
        <aside class="wse-side"><nav class="wse-tabs">${[["prop", "Properties"], ["logic", "Logic"], ["game", "Game"], ["look", "Look & UI"], ["scene", "Prefabs"], ["ai", "Director"], ["assets", "Assets"]].map(([k, n]) => `<button type="button" data-tab="${k}">${esc(T(n))}</button>`).join("")}</nav><div class="wse-pane"></div></aside></div>
      ${phone() ? `<nav class="wse-sheets"><button type="button" data-sheet="tree">🌳<span>${esc(T("Scene"))}</span></button><button type="button" data-sheet="pal">＋<span>${esc(T("Add"))}</span></button><button type="button" data-sheet="side">⚙<span>${esc(T("Properties"))}</span></button><button type="button" data-sim>⏯<span>${esc(T("Simulate"))}</span></button></nav>` : ""}</div>`;
    document.body.appendChild(el); cv = el.querySelector(".wse-cv");
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onInput);
    el.addEventListener("dragstart", onDrag); el.addEventListener("dragover", onOver); el.addEventListener("dragleave", onLeave); el.addEventListener("drop", onDrop); el.addEventListener("dblclick", onDbl); el.addEventListener("pointerdown", onPort);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", pu); cv.addEventListener("wheel", wheel, { passive: false }); cv.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", key, true); addEventListener("keyup", keyUp, true); addEventListener("resize", fit);
    setup(); fit(); rebuild(); focusAll(); paintTabs(); pane(); bar(); loop();
  }
  function close(done) {
    cancelAnimationFrame(raf); removeEventListener("keydown", key, true); removeEventListener("keyup", keyUp, true); removeEventListener("resize", fit); clearTimeout(estT); histPush(true);
    if (scene) scene.traverse((m) => { if (m.geometry && !Object.values(G).includes(m.geometry)) m.geometry.dispose(); if (m.material && !(MT && MT.all().includes(m.material))) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose && x.dispose()); });
    if (G) Object.values(G).forEach((g) => g.dispose()); if (MT) MT.all().forEach((m) => m.dispose());
    if (rd) { rd.dispose(); try { rd.forceContextLoss(); } catch { /* fine */ } rd = null; }
    if (el) el.remove(); el = null; if (done) ctx.onDone(cleanObby(B)); if (ctx.onClose) ctx.onClose();
  }
  const evt = (k) => { try { if (ctx.ev) ctx.ev(k); } catch { /* fine */ } };
  const changed = () => { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (the Studio's autosave) */ } est = null; clearTimeout(estT); estT = setTimeout(() => { bar(); }, 250); if (dbg) dbgBuild(); histPush(false); };
  // ---------------- the scene ----------------
  function setup() {
    rd = new THREE.WebGLRenderer({ canvas: cv, antialias: !ctx.coarse, powerPreference: "high-performance" }); rd.setPixelRatio(Math.min(devicePixelRatio || 1, ctx.coarse ? 1 : 1.5)); rd.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7a90, 1.15)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(40, 70, 25); scene.add(sun);
    G = obGeos(THREE); MT = obMats(THREE, THEMES[spec.theme] || THEMES.neon, LOOKS[B.lk]);
    grid = new THREE.GridHelper(OB.R * 2, OB.R, 0x5fd3ff, 0x2a3a5a); grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    const edge = new THREE.Mesh(new THREE.RingGeometry(OB.R * 1.41 - 0.4, OB.R * 1.41, 64), new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.25, side: THREE.DoubleSide })); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.02; void edge;
    const bord = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(OB.R * 2, 0.01, OB.R * 2)), new THREE.LineBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.5 })); scene.add(bord);
    gizmo = makeGizmo(); scene.add(gizmo.root);
    selBox = new THREE.Box3Helper(new THREE.Box3(), 0x4fe3c1); selBox.visible = false; scene.add(selBox);
  }
  function fit() { if (!cv || !rd) return; const r = cv.getBoundingClientRect(); rd.setSize(Math.max(1, r.width), Math.max(1, r.height), false); cam.aspect = Math.max(0.2, r.width / Math.max(1, r.height)); cam.updateProjectionMatrix(); dirty = true; }
  let csPrev = null;
  function loop() { raf = requestAnimationFrame(loop); const now = performance.now();
    if (flyKeys.size && act && act.kind === "fly") { const dt = Math.min(0.05, (now - (flyT || now)) / 1000), sp = (flyKeys.has("shift") ? 36 : 14) * dt, cp = Math.cos(orbit.pitch), f = new THREE.Vector3(-Math.sin(orbit.yaw) * cp, -Math.sin(orbit.pitch), -Math.cos(orbit.yaw) * cp), r = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
      const m = new THREE.Vector3(); if (flyKeys.has("w")) m.add(f); if (flyKeys.has("s")) m.sub(f); if (flyKeys.has("d")) m.add(r); if (flyKeys.has("a")) m.sub(r); if (flyKeys.has("e")) m.y += 1; if (flyKeys.has("q")) m.y -= 1;
      if (m.lengthSq()) { m.normalize().multiplyScalar(sp); orbit.tx += m.x; orbit.ty += m.y; orbit.tz += m.z; dirty = true; } } flyT = now;
    if (simOn) { simTick((now - simT0) / 1000); dirty = true; }
    if (dbg) { fpsN++; if (now - fpsT > 500) { fps = Math.round((fpsN * 1000) / Math.max(1, now - fpsT)); fpsN = 0; fpsT = now; statPaint(); } dirty = true; }
    if (csPrev && B.cs && B.cs.length >= 2) { const K = B.cs, t = (performance.now() - csPrev.t0) / 1000; let j = 0; while (j < K.length - 2 && K[j + 1][0] < t) j++; const a = K[j], b = K[j + 1], f = Math.max(0, Math.min(1, (t - a[0]) / Math.max(0.01, b[0] - a[0]))), e = f * f * (3 - 2 * f);
      cam.position.set(a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e); cam.lookAt(a[4] + (b[4] - a[4]) * e, a[5] + (b[5] - a[5]) * e, a[6] + (b[6] - a[6]) * e); gizmo.root.visible = false; rd.render(scene, cam); if (t > K[K.length - 1][0] + 0.4) { csPrev = null; selShow(); dirty = true; } return; }
    if (tkPrev) { const t = (B.tk || []).find((x) => x[0] === tkPrev.i), o = objs[tkPrev.i], q = B.o[tkPrev.i], tt = (performance.now() - tkPrev.t0) / 1000;
      if (!t || !o || !q || tt > t[3][t[3].length - 1][0] + 0.3) { tkPrev = null; if (o) refresh(sel >= 0 ? sel : 0); const h = el && el.querySelector(".wse-tlh"); if (h) h.hidden = true; }
      else { const d = tkAt(t[3], tt); o.position.set(q[1] + d[0], q[2] + d[1], q[3] + d[2]); o.rotation.y = R(q[4] + d[3]); const h = el && el.querySelector(".wse-tlh"); if (h) { h.hidden = false; h.style.left = Math.min(100, (tt / Math.max(0.5, t[3][t[3].length - 1][0])) * 100).toFixed(1) + "%"; } dirty = true; } }
    if (!dirty) return; dirty = false; place(); gizmoPlace(); rd.render(scene, cam); }
  /// a small form over the editor (a name, a choice, a box to tick) → the values, or null when closed
  function askForm(title, fields) { return new Promise((res) => { const f = document.createElement("div"); f.className = "wse-form"; f.innerHTML = `<form><b>${esc(title)}</b>${fields.map(([k, lab, v, opts]) => opts === "check" ? `<label class="wse-chk"><input type="checkbox" name="${k}"> ${esc(lab)}</label>` : opts ? `<label class="wse-sel"><span>${esc(lab)}</span><select name="${k}">${opts.map(([ov, on]) => `<option value="${esc(ov)}"${ov === v ? " selected" : ""}>${esc(on)}</option>`).join("")}</select></label>` : `<label class="wse-sel"><span>${esc(lab)}</span><input name="${k}" value="${esc(v || "")}" maxlength="40"></label>`).join("")}
      <span class="wse-acts"><button type="button" class="wsb-b" data-no>${esc(T("Cancel"))}</button><button type="submit" class="wsb-b go">${esc(T("OK"))}</button></span></form>`; el.appendChild(f);
    const done = (v) => { f.remove(); res(v); }; f.querySelector("[data-no]").addEventListener("click", () => done(null)); f.addEventListener("click", (e2) => { if (e2.target === f) done(null); });
    f.querySelector("form").addEventListener("submit", (e2) => { e2.preventDefault(); const o2 = {}; for (const [k, , , opts] of fields) { const inp = f.querySelector(`[name="${k}"]`); o2[k] = opts === "check" ? inp.checked : inp.value.trim(); } done(o2); }); const first = f.querySelector("input,select"); if (first) first.focus(); }); }
  function place() { const cp = Math.cos(orbit.pitch); cam.position.set(orbit.tx + Math.sin(orbit.yaw) * orbit.dist * cp, orbit.ty + Math.sin(orbit.pitch) * orbit.dist, orbit.tz + Math.cos(orbit.yaw) * orbit.dist * cp); cam.lookAt(orbit.tx, orbit.ty, orbit.tz); }
  /// one piece as the editor draws it: the run's shapes, a small sign for the smart ones
  function meshOf(q, i) {
    const [k, x, y, z, ry, sx, sy, sz, c, a] = q, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = R(ry); g.userData.i = i;
    const add = (geo, m, w, h, d, py = 0) => { const me = new THREE.Mesh(geo, m); me.scale.set(w, h, d); me.position.y = py; me.userData.i = i; g.add(me); return me; };
    const glow = (col, op = 1) => new THREE.MeshBasicMaterial({ color: col, transparent: op < 1, opacity: op, depthWrite: op >= 1 });
    if (k === "b" || k === "y" || k === "r") { const me = add(k === "y" ? G.cyl : k === "r" ? G.wedge : G.box, MT.get(c, a), sx, sy, k === "y" ? sx : sz); if (!(B.tk || []).some((t) => t[0] === i) && !(q[12] && (q[12].mv || q[12].sp || q[12].eh || q[12].iv))) { me.layers.set(1); g.userData.ik = k + ":" + c + ":" + a; g.userData.im = me; } } // (drawn by the instanced meshes below; this one is only picked)
    else if (k === "k") add(G.box, new THREE.MeshStandardMaterial({ color: 0xff4d1a, emissive: 0xff3a00, emissiveIntensity: 1 }), sx, sy, sz);
    else if (k === "s") { add(G.box, MT.get(11, 1), sx, sy, sz, 0); add(G.cyl, MT.get(7, 0), 0.7, sy + 0.3, 0.7, -0.15); }
    else if (k === "m" || k === "e" || k === "d") { add(G.box, MT.get(c, 1), sx, sy, sz); if (k !== "d") { const ar = add(new THREE.ConeGeometry(0.4, 0.8, 8), glow(0xffffff, 0.7), 1, 1, 1, sy + 0.4); if (k === "m") { ar.rotation.z = a === 0 ? -Math.PI / 2 : 0; ar.rotation.x = a === 2 ? Math.PI / 2 : 0; } } }
    else if (k === "p" || k === "c" || k === "S" || k === "g") { add(G.cyl, MT.get(k === "g" ? 2 : k === "S" ? 1 : k === "p" ? 1 : 6, 1), sx, sy, sx); if (k !== "p") add(new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, true), glow(k === "g" ? 0xffd23a : k === "S" ? 0x5fd3ff : 0x7cf5c8, 0.25), sx * 0.85, k === "g" ? 6 : 3, sx * 0.85, sy + (k === "g" ? 3 : 1.5)); }
    else if (k === "o") add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa21a, emissiveIntensity: 0.6 }), 1, 1, 1, 0.6);
    else if (k === "h") add(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0xff1a4a, emissiveIntensity: 0.6 }), 1, 1, 1, 0.7);
    else if (k === "u") add(G.cyl, MT.get(11, 1), 1.6, 0.3, 1.6);
    else if (k === "t") { add(new THREE.TorusGeometry(0.95, 0.12, 8, 28).rotateX(Math.PI / 2), glow(0xb48cff), 1, 1, 1, 0.12); add(new THREE.CylinderGeometry(0.85, 0.85, 2.6, 16, 1, true), glow(0xb48cff, 0.22), 1, 1, 1, 1.3); }
    else if (k === "n") { add(G.box, MT.get(7, 0), 2.4, 0.9, 1.2); add(G.box, MT.get(3, 1), 2.6, 0.15, 1.6, 2.5); }
    else if (k === "B") add(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0x6a0010, emissiveIntensity: 0.5 }), sx * 0.9, sy * 0.8, sz * 0.9, sy * 0.45);
    else if (k === "x" || k === "X") { const ph = add(G.box, new THREE.MeshStandardMaterial({ color: 0x8aa0b8, transparent: true, opacity: 0.28 }), sx, sy, sz); g.userData.ph = ph; propModel(g, q); }
    else if (k === "E") { const col = [0x39c46a, 0xb48cff, 0xff7a2e][q[10]] || 0x39c46a; add(new THREE.SphereGeometry(0.6, 14, 10), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 }), 1, 1, 1, q[10] === 1 ? 2.4 : 0.75); }
    else if (k === "R") { const rr = sx / 2; add(new THREE.TorusGeometry(rr * 0.86, 0.16, 8, 36), glow(0x5fd3ff, 0.9), 1, 1, 1, rr); g.add(spr(badge("#" + a, 0x5fd3ff), 0, sx + 0.6, 0, 1)); }
    else if (k === "Q") add(new THREE.OctahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: 0x7cf5c8, emissive: 0x2ad6a0, emissiveIntensity: 0.8 }), 1, 1, 1, 0.6);
    else if (k === "H") add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), MT.get(c, a), sx / 2, sy, sx / 2);
    else if (k === "W") add(G.box, new THREE.MeshStandardMaterial({ color: 0x2a8aff, transparent: true, opacity: 0.5, depthWrite: false }), sx, sy, sz);
    else if (k === "P") add(G.box, MT.get(c || 9, 0), sx, sy, sz);
    else if (k === "A") add(new THREE.CapsuleGeometry(0.36, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: [0x5fd3ff, 0xffd23a, 0xff6fae][a] || 0x5fd3ff }), 1, 1, 1, 0.85);
    if ((B.tk || []).some((t) => t[0] === i)) g.add(spr(badge("▶", 0xffd23a), 0.9, sy + 0.8, 0, 0.7));
    if (q[11]) g.add(spr(badge(q[11]), 0, sy + 0.8, 0, 0.9));
    const xq = q[12]; if (xq) { const nC = Object.keys(CMP).filter((c2) => xq[c2] != null).length; if (nC) g.add(spr(badge("⚙" + nC, 0x4fe3c1), -0.9, sy + 0.8, 0, 0.75));
      if (xq.iv) g.traverse((m) => { if (m.isMesh && !m.isSprite) { m.material = GHOST || (GHOST = new THREE.MeshBasicMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0.2, depthWrite: false })); m.userData.shared = true; } }); // (invisible in the game: a ghost here)
      if (xq.eh) g.visible = false; }
    return g;
  }
  const spr = (map, x, y, z, k) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false })); sp.position.set(x, y, z); sp.scale.set(k, k, 1); return sp; }; // (a sprite's position can't be assigned, only set)
  const badges = new Map(); function badge(n, col = 0xb48cff) { const key = n + ":" + col; if (badges.has(key)) return badges.get(key); const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); x.fillStyle = hex(col); x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = "#fff"; x.font = "800 30px Sora,sans-serif"; x.textAlign = "center"; x.fillText(typeof n === "number" ? "G" + n : n, 32, 43); const t = new THREE.CanvasTexture(c); badges.set(key, t); return t; }
  const models = new Map();
  function propModel(g, q) { if (!ctx.K || !ctx.K.gltfLoader) return; const url = q[0] === "x" ? `/models/world/${(OB.PROPS[q[9]] || OB.PROPS[0])[1]}.glb${ctx.ver || ""}` : ctx.assets && ctx.assets.url ? ctx.assets.url(B.as[q[9]]) : null; if (!url) return;
    let p = models.get(url); if (!p) { p = ctx.K.gltfLoader().loadAsync(url).then((gl) => gl.scene).catch(() => null); models.set(url, p); }
    p.then((src) => { if (!src || !el || !g.parent) return; const m = src.clone(true), bx = new THREE.Box3().setFromObject(m), sz = bx.getSize(new THREE.Vector3()), k = Math.min(q[5] / (sz.x || 1), q[6] / (sz.y || 1), q[7] / (sz.z || 1));
      m.scale.setScalar(k); m.position.set(-((bx.min.x + bx.max.x) / 2) * k, -bx.min.y * k, -((bx.min.z + bx.max.z) / 2) * k); m.traverse((x) => { x.userData.i = g.userData.i; x.userData.shared = true; }); g.add(m); if (g.userData.ph) g.userData.ph.visible = false; dirty = true; }); }
  /// a piece's meshes let go when it's redrawn (its own geometries and materials; the shared shapes, the surface materials and a
  /// loaded prop — a clone that shares the cached model's — stay): an editing session no longer grows the GPU's memory
  function drop(o) { scene.remove(o); o.traverse((m) => { if (m.userData.shared) return; if (m.geometry && !Object.values(G).includes(m.geometry)) m.geometry.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { if (!MT.all().includes(x)) x.dispose(); }); }); }
  // RV (the review): the blocks, round platforms and ramps drawn as one InstancedMesh per shape + material (a 300-piece course
  // drew 300+ meshes); each piece keeps an undrawn mesh on layer 1 that the pointer picks and the selection box measures
  let inst = new Map(); const instOf = new Map(), IM4 = new THREE.Matrix4();
  function instBuild() { for (const im of inst.values()) { scene.remove(im); im.dispose(); } inst = new Map(); instOf.clear(); const by = new Map();
    objs.forEach((o, i) => { const key = o && o.userData.ik; if (!key) return; if (!by.has(key)) by.set(key, []); by.get(key).push(i); });
    for (const [key, list] of by) { const k = key[0], im = new THREE.InstancedMesh(k === "y" ? G.cyl : k === "r" ? G.wedge : G.box, objs[list[0]].userData.im.material, list.length); im.userData.inst = true; list.forEach((i, j) => { instOf.set(i, [im, j]); instPut(i); }); im.computeBoundingSphere(); scene.add(im); inst.set(key, im); } }
  function instPut(i) { const o = objs[i], at = instOf.get(i); if (!o || !at) return; o.updateMatrix(); o.userData.im.updateMatrix(); IM4.multiplyMatrices(o.matrix, o.userData.im.matrix); at[0].setMatrixAt(at[1], IM4); at[0].instanceMatrix.needsUpdate = true; }
  function rebuild() {
    for (const o of objs) drop(o); objs = B.o.map((q, i) => { const m = meshOf(q, i); scene.add(m); return m; }); instBuild();
    if (bp) { scene.remove(bp); bp.geometry.dispose(); bp.material.dispose(); bp = null; }
    if (B.bp) { bp = new THREE.Mesh(new THREE.BoxGeometry(OB.R * 2, 1, OB.R * 2), new THREE.MeshStandardMaterial({ color: 0x7a8a9a, roughness: 0.9 })); bp.position.y = -0.5; scene.add(bp); }
    const lk = LOOKS[B.lk] || LOOKS.day; scene.background = new THREE.Color(lk.bot).lerp(new THREE.Color(lk.top), 0.35);
    marks(); if (sel >= B.o.length) sel = -1; for (const i of [...msel]) if (i >= B.o.length) msel.delete(i); selShow(); dirty = true;
  }
  function refresh(i) { const old = objs[i]; if (!old) return rebuild(); const k0 = old.userData.ik; drop(old); const m = meshOf(B.o[i], i); scene.add(m); objs[i] = m;
    if (k0 || m.userData.ik) { if (k0 === m.userData.ik && instOf.has(i)) { instPut(i); inst.get(k0).computeBoundingSphere(); } else instBuild(); } selShow(); dirty = true; }
  function marks() { if (redBoxes) { scene.remove(redBoxes); redBoxes.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); }
    redBoxes = new THREE.Group(); scene.add(redBoxes); reach = obReach(cleanObby(B), spec);
    for (const j of reach.far) { const q = cleanObby(B).o[j]; if (!q) continue; const b = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(q[1] - q[5] / 2 - 0.1, q[2] - 0.05, q[3] - q[7] / 2 - 0.1), new THREE.Vector3(q[1] + q[5] / 2 + 0.1, q[2] + q[6] + 0.1, q[3] + q[7] / 2 + 0.1)), 0xff3b5c); redBoxes.add(b); } }
  // RV (the review): more than one piece picked at once — Shift + click / the ⊕ button / a group in the hierarchy; the gizmo then
  // moves and turns all of them together (size stays one piece's), the arrows nudge them, delete removes them
  const msel = new Set(); let madd = false, mbox = null;
  const many = () => { const out = [...new Set([sel, ...msel])].filter((i) => i >= 0 && B.o[i]); return out; };
  function selShow() { const o = objs[sel]; if (!o) { msel.clear(); selBox.visible = false; gizmo.root.visible = false; return; } selBox.box.setFromObject(o); for (const i of many()) if (i !== sel && objs[i]) selBox.box.union((mbox || (mbox = new THREE.Box3())).setFromObject(objs[i])); selBox.visible = true; gizmo.root.visible = true; dirty = true;
    const mb = el && el.querySelector("[data-madd]"); if (mb) { mb.classList.toggle("on", madd); mb.dataset.n = many().length > 1 ? many().length : ""; } }
  // ---------------- the gizmo: arrows (move along an axis), a flat square (on the ground), a ring (turn), cubes (size) ----------------
  function makeGizmo() {
    const root = new THREE.Group(), mk = (geo, col) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 })); m.renderOrder = 999; return m; };
    const parts = { move: new THREE.Group(), rot: new THREE.Group(), scale: new THREE.Group() }, handles = [];
    const AX = [["x", 0xff4d5e, new THREE.Vector3(1, 0, 0)], ["y", 0x5fe36a, new THREE.Vector3(0, 1, 0)], ["z", 0x4f8bff, new THREE.Vector3(0, 0, 1)]];
    for (const [n, col, d] of AX) { const g = new THREE.Group(), shaft = mk(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), col), tip = mk(new THREE.ConeGeometry(0.2, 0.5, 12), col); shaft.position.y = 0.8; tip.position.y = 1.8; g.add(shaft, tip);
      if (n === "x") g.rotation.z = -Math.PI / 2; if (n === "z") g.rotation.x = Math.PI / 2; g.userData.h = { kind: "move", axis: d.clone() }; [shaft, tip].forEach((m) => { m.userData.h = g.userData.h; handles.push(m); }); parts.move.add(g); }
    const flat = mk(new THREE.PlaneGeometry(0.7, 0.7), 0xffd23a); flat.rotation.x = -Math.PI / 2; flat.position.set(0.55, 0.01, 0.55); flat.material.side = THREE.DoubleSide; flat.material.opacity = 0.6; flat.userData.h = { kind: "flat" }; handles.push(flat); parts.move.add(flat);
    const ring = mk(new THREE.TorusGeometry(1.6, 0.07, 8, 48), 0x5fe36a); ring.rotation.x = Math.PI / 2; ring.userData.h = { kind: "rot" }; handles.push(ring); parts.rot.add(ring);
    const ringHit = mk(new THREE.TorusGeometry(1.6, 0.3, 6, 32), 0x5fe36a); ringHit.material.opacity = 0; ringHit.rotation.x = Math.PI / 2; ringHit.userData.h = ring.userData.h; handles.push(ringHit); parts.rot.add(ringHit);
    for (const [n, col, d] of AX) { const g = new THREE.Group(), shaft = mk(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), col), cube = mk(new THREE.BoxGeometry(0.34, 0.34, 0.34), col); shaft.position.y = 0.75; cube.position.y = 1.6; g.add(shaft, cube);
      if (n === "x") g.rotation.z = -Math.PI / 2; if (n === "z") g.rotation.x = Math.PI / 2; const h = { kind: "scale", axis: d.clone(), n }; [shaft, cube].forEach((m) => { m.userData.h = h; handles.push(m); }); parts.scale.add(g); }
    root.add(parts.move, parts.rot, parts.scale); root.visible = false;
    return { root, parts, handles };
  }
  function gizmoPlace() { const o = objs[sel]; if (!o || !gizmo) return; const q = B.o[sel]; gizmo.root.position.set(q[1], q[2] + Math.min(q[6], 4) / 2, q[3]);
    gizmo.root.rotation.y = mode === "scale" || (local && mode === "move") ? R(q[4]) : 0; const s = cam.position.distanceTo(gizmo.root.position) * 0.075; gizmo.root.scale.setScalar(Math.max(0.6, s));
    const lk = !!(q[12] && q[12].lk) || simOn; for (const k of ["move", "rot", "scale"]) gizmo.parts[k].visible = mode === k && !lk; }
  // ---------------- pointer: pick, drag a handle, orbit, pan, pinch ----------------
  const ptrs = new Map(); let act = null, downAt = null;
  const ndc = (e) => { const r = cv.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const ray = new THREE.Raycaster(); ray.layers.enableAll(); // (the instanced pieces' pick meshes live on layer 1)
  function pd(e) {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; act = { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
    ray.setFromCamera(ndc(e), cam);
    if (sel >= 0 && gizmo.root.visible && !e.altKey && e.button === 0) { const hit = ray.intersectObjects(gizmo.handles.filter((h) => { let p = h; while (p && p !== gizmo.root) { if (p.visible === false) return false; p = p.parent; } return true; }), false)[0];
      if (hit) { const h = hit.object.userData.h, q = B.o[sel], M = many(); push(); act = { kind: h.kind, h, q0: q.slice(), o: new THREE.Vector3(q[1], q[2], q[3]) }; if (h.kind === "move" && local) act.ax = h.axis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), R(q[4]));
        if (M.length > 1 && h.kind !== "scale") { act.many = M.map((i) => [i, B.o[i].slice()]); if (h.kind === "rot") { const xs = M.map((i) => B.o[i][1]), zs = M.map((i) => B.o[i][3]); act.o.set((Math.min(...xs) + Math.max(...xs)) / 2, q[2], (Math.min(...zs) + Math.max(...zs)) / 2); } } act.plane = planeFor(h, act.o); act.p0 = hitPlane(act.plane); if (!act.p0) act = null; return; } }
    act = { kind: e.button === 2 ? "fly" : e.button === 1 || e.shiftKey ? "pan" : "orbit", x: e.clientX, y: e.clientY };
  }
  function planeFor(h, o) { const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    if (h.kind === "flat" || h.kind === "rot") return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), o);
    const ax = h.kind === "scale" || (h.kind === "move" && local) ? h.axis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), R(B.o[sel][4])) : h.axis.clone(), n = ax.clone().cross(camDir).cross(ax).normalize(); if (n.lengthSq() < 1e-6) n.copy(camDir); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, o); }
  function hitPlane(pl) { const p = new THREE.Vector3(); return ray.ray.intersectPlane(pl, p) ? p : null; }
  const sn = (v, st) => { const k = snapV || st; return snap ? Math.round(v / k) * k : Math.round(v * 4) / 4; };
  function pm(e) {
    if (!ptrs.has(e.pointerId)) return; const last = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!act) return;
    if (act.kind === "pinch" && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x); orbit.dist = Math.max(6, Math.min(220, orbit.dist * (act.d / Math.max(10, d)))); panBy(mx - act.mx, my - act.my);
      if (act.ang != null) { let da = ang - act.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); orbit.yaw -= da; } act.ang = ang; act.d = d; act.mx = mx; act.my = my; dirty = true; return; } // (two fingers: pinch zooms, slide pans, twist turns)
    if (act.kind === "fly") { const cp0 = cam.position.clone(); orbit.yaw -= (e.clientX - last.x) * 0.005; orbit.pitch = Math.max(-1.2, Math.min(1.5, orbit.pitch + (e.clientY - last.y) * 0.004)); const c = Math.cos(orbit.pitch);
      orbit.tx = cp0.x - Math.sin(orbit.yaw) * orbit.dist * c; orbit.ty = cp0.y - Math.sin(orbit.pitch) * orbit.dist; orbit.tz = cp0.z - Math.cos(orbit.yaw) * orbit.dist * c; dirty = true; return; } // (right-drag looks round from where the camera is; WASD / Q E fly)
    if (act.kind === "orbit") { orbit.yaw -= (e.clientX - last.x) * 0.006; orbit.pitch = Math.max(0.08, Math.min(1.5, orbit.pitch + (e.clientY - last.y) * 0.005)); dirty = true; return; }
    if (act.kind === "pan") { panBy(e.clientX - last.x, e.clientY - last.y); dirty = true; return; }
    ray.setFromCamera(ndc(e), cam); const p = hitPlane(act.plane); if (!p) return; const q = B.o[sel], d = p.clone().sub(act.p0);
    if (act.kind === "move" && act.ax) { const t = d.dot(act.ax); if (act.h.axis.y) q[2] = clampAx(2, sn(act.q0[2] + t, 0.5)); else { q[1] = clampAx(1, sn(act.q0[1] + act.ax.x * t, 0.5)); q[3] = clampAx(3, sn(act.q0[3] + act.ax.z * t, 0.5)); } } // (along the piece's own axis)
    else if (act.kind === "move") { const ax = act.h.axis, t = d.dot(ax), i = ax.x ? 1 : ax.y ? 2 : 3; q[i] = clampAx(i, sn(act.q0[i] + t, 0.5)); }
    else if (act.kind === "flat") { q[1] = clampAx(1, sn(act.q0[1] + d.x, 0.5)); q[3] = clampAx(3, sn(act.q0[3] + d.z, 0.5)); }
    else if (act.kind === "rot") { const a0 = Math.atan2(act.p0.x - act.o.x, act.p0.z - act.o.z), a1 = Math.atan2(p.x - act.o.x, p.z - act.o.z); let deg = act.q0[4] + ((a1 - a0) * 180) / Math.PI; deg = snap ? Math.round(deg / 15) * 15 : Math.round(deg / 5) * 5; q[4] = ((deg % 360) + 360) % 360; }
    else if (act.kind === "scale") { const ax = act.h.axis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), R(act.q0[4])), t = d.dot(ax), i = act.h.n === "x" ? 5 : act.h.n === "y" ? 6 : 7; if (!FIX.has(q[0])) { q[i] = Math.max(0.25, Math.min(OB.SZ, sn(act.q0[i] + t * (act.h.n === "y" ? 1 : 2), 0.25))); if (q[0] === "y" && i !== 6) { q[5] = q[7] = q[i]; } } }
    if (act.many) { const d1 = q[1] - act.q0[1], d2 = q[2] - act.q0[2], d3 = q[3] - act.q0[3];
      if (act.kind === "rot") { const da = ((q[4] - act.q0[4]) * Math.PI) / 180, c = Math.cos(da), sn2 = Math.sin(da);
        for (const [i, q0] of act.many) { const qq = B.o[i], dx = q0[1] - act.o.x, dz = q0[3] - act.o.z; qq[1] = clampAx(1, Math.round((act.o.x + dx * c + dz * sn2) * 4) / 4); qq[3] = clampAx(3, Math.round((act.o.z - dx * sn2 + dz * c) * 4) / 4); qq[4] = (((q0[4] + q[4] - act.q0[4]) % 360) + 360) % 360; } }
      else for (const [i, q0] of act.many) if (i !== sel) { const qq = B.o[i]; qq[1] = clampAx(1, q0[1] + d1); qq[2] = clampAx(2, q0[2] + d2); qq[3] = clampAx(3, q0[3] + d3); }
      for (const [i] of act.many) refresh(i); act.moved = true; return; }
    refresh(sel); act.moved = true;
  }
  const FIX = new Set(["o", "h", "n", "u", "t", "c", "S", "g", "p", "Q", "A", "E"]);
  const clampAx = (i, v) => (i === 2 ? Math.max(-10, Math.min(OB.Y, v)) : Math.max(-OB.R, Math.min(OB.R, v)));
  function panBy(dx, dy) { const k = orbit.dist * 0.0016, r = new THREE.Vector3(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw)), f = new THREE.Vector3(-Math.sin(orbit.yaw), 0, -Math.cos(orbit.yaw)); orbit.tx -= (r.x * dx - f.x * dy) * k; orbit.tz -= (r.z * dx - f.z * dy) * k; }
  function pu(e) {
    const tap = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 450; ptrs.delete(e.pointerId);
    if (act && (act.kind === "move" || act.kind === "flat" || act.kind === "rot" || act.kind === "scale")) { if (!act.moved) undo.pop(); else { marks(); changed(); pane(); evt("ob-move"); } act = null; return; }
    if (tap && act && act.kind !== "pinch" && act.kind !== "fly") { ray.setFromCamera(ndc(e), cam); const hit = ray.intersectObjects(objs, true).find(pickable), hi = hit ? hit.object.userData.i : -1;
      if ((e.shiftKey || madd) && hi >= 0 && sel >= 0) { if (hi === sel) { const rest = many().filter((i) => i !== sel); msel.clear(); rest.forEach((i) => msel.add(i)); sel = rest.length ? rest[0] : -1; } else if (msel.has(hi)) msel.delete(hi); else msel.add(hi); }
      else { msel.clear(); sel = hi; } selShow(); if (tab !== "prop" && sel >= 0) tab = "prop"; paintTabs(); pane(); }
    if (ptrs.size < 2) { act = null; flyKeys.clear(); }
  }
  /// a hit the pointer may pick: a piece's own mesh, shown, not locked or hidden in the editor
  function pickable(h) { const i = h.object.userData.i, q = B.o[i]; if (i == null || !q || !h.object.visible || (q[12] && (q[12].lk || q[12].eh))) return false; let o = h.object; while (o) { if (o.visible === false) return false; o = o.parent; } return true; }
  function wheel(e) { e.preventDefault(); orbit.dist = Math.max(6, Math.min(220, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); dirty = true; }
  function key(e) { if (!el || (e.target && e.target.closest && e.target.closest("input,textarea,select"))) return; const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z") { e.preventDefault(); doUndo(e.shiftKey); return; } if (mod && k === "y") { e.preventDefault(); doUndo(true); return; }
    if (mod && k === "d") { e.preventDefault(); dup(); return; } if (mod && k === "s") { e.preventDefault(); doSave(); return; }
    if (act && act.kind === "fly" && ["w", "a", "s", "d", "q", "e", "shift"].includes(k)) { e.preventDefault(); flyKeys.add(k); return; } if (k === "delete" || k === "backspace") { if (sel >= 0) { e.preventDefault(); del(); } return; }
    if (k === "q" && !mod) setMode("select"); else if (k === "w" && !mod) setMode("move"); else if (k === "e") setMode("rot"); else if (k === "r" && !mod) setMode("scale"); else if (k === "f") focusSel();
    else if (sel >= 0 && ["arrowleft", "arrowright", "arrowup", "arrowdown", "pageup", "pagedown"].includes(k)) { e.preventDefault(); push(); const st = e.shiftKey ? 2 : 0.5;
      for (const i of many()) { const q = B.o[i]; if (k === "arrowleft") q[1] = clampAx(1, q[1] - st); if (k === "arrowright") q[1] = clampAx(1, q[1] + st); if (k === "arrowup") q[3] = clampAx(3, q[3] - st); if (k === "arrowdown") q[3] = clampAx(3, q[3] + st); if (k === "pageup") q[2] = clampAx(2, q[2] + st); if (k === "pagedown") q[2] = clampAx(2, q[2] - st); refresh(i); }
      marks(); changed(); pane(); }
    else if (k === "escape") { sel = -1; msel.clear(); selShow(); pane(); } }
  function keyUp(e) { flyKeys.delete(String(e.key || "").toLowerCase()); }
  function setMode(m) { mode = m; el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode)); dirty = true; }
  function doUndo(re) { const from = re ? redo : undo, to = re ? undo : redo; if (!from.length) return; to.push(snapS()); B = JSON.parse(from.pop()); msel.clear(); rebuild(); changed(); pane(); }
  // ---------------- insert, duplicate, delete ----------------
  function addAt(k, at) {
    if (B.o.length >= OB.MAX) { ctx.toast(esc(T("A course holds up to {n} pieces", { n: OB.MAX }))); return; }
    const n = B.o.filter((q) => q[0] === k).length; if (OB.CAP[k] && n >= OB.CAP[k]) { ctx.toast(esc(T("No more of this piece ({n} at most)", { n: OB.CAP[k] }))); return; }
    if (k === "S" && n) { sel = B.o.findIndex((q) => q[0] === "S"); selShow(); focusSel(); pane(); return; }
    ray.setFromCamera(at || new THREE.Vector2(0, 0), cam); const hit = ray.intersectObjects(objs, true).find(pickable);
    let p = hit ? hit.point : hitPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)) || new THREE.Vector3(orbit.tx, 0, orbit.tz); if (hit) { const q0 = B.o[hit.object.userData.i]; p = new THREE.Vector3(hit.point.x, q0[2] + q0[6], hit.point.z); }
    const K = OB.K[k], O = OB.OPT[k] || [], q = [k, clampAx(1, sn(p.x, 0.5)), clampAx(2, sn(p.y, 0.5)), clampAx(3, sn(p.z, 0.5)), 0, K[1], K[2], K[3], k === "b" ? 0 : 1, O[0] ? O[0][3] : 0, O[1] ? O[1][3] : 0, 0];
    if (k === "t") { const pairs = B.o.filter((x) => x[0] === "t"); const open1 = [1, 2, 3, 4, 5, 6, 7, 8].find((a) => pairs.filter((x) => x[9] === a).length === 1); q[9] = open1 || ([1, 2, 3, 4, 5, 6, 7, 8].find((a) => !pairs.some((x) => x[9] === a)) || 1); }
    push(); B.o.push(q); sel = B.o.length - 1; rebuild(); pop(objs[sel]); changed(); evt("build"); evt("ob-place"); if ("dutnBe".includes(k)) evt("ob-smart"); if (tab !== "prop") { tab = "prop"; paintTabs(); } pane();
  }
  function pop(o) { if (!o) return; const t0 = performance.now(), go = () => { const k = Math.min(1, (performance.now() - t0) / 260), s = 1 + Math.sin(k * Math.PI) * 0.18; o.scale.setScalar(s); dirty = true; if (k < 1 && el) requestAnimationFrame(go); else o.scale.setScalar(1); }; go(); }
  function dup() { if (sel < 0) return; const q = B.o[sel].slice(); if (q[0] === "S") return; if (OB.CAP[q[0]] && B.o.filter((x) => x[0] === q[0]).length >= OB.CAP[q[0]]) { ctx.toast(esc(T("No more of this piece ({n} at most)", { n: OB.CAP[q[0]] }))); return; }
    push(); q[1] = clampAx(1, q[1] + Math.max(1, q[5]) + 0.5); B.o.push(q); sel = B.o.length - 1; rebuild(); pop(objs[sel]); changed(); pane(); }
  function del() { if (sel < 0) return; const M = many().filter((i) => B.o[i][0] !== "S"); if (!M.length) { ctx.toast(esc(T("A course always has its start"))); return; } push();
    const gone = new Set(M), map = []; let n = 0; B.o.forEach((_, i) => { map[i] = gone.has(i) ? -1 : n++; }); B.o = B.o.filter((_, i) => !gone.has(i)); B.tk = (B.tk || []).filter((t) => map[t[0]] >= 0).map((t) => [map[t[0]], t[1], t[2], t[3]]);
    sel = -1; msel.clear(); rebuild(); changed(); pane(); }
  function focusSel() { const q = B.o[sel]; if (!q) return focusAll(); orbit.tx = q[1]; orbit.ty = q[2]; orbit.tz = q[3]; orbit.dist = Math.max(10, Math.max(q[5], q[7]) * 3); dirty = true; }
  function focusAll() { if (!B.o.length) return; let a = [1e9, 1e9, 1e9], b = [-1e9, -1e9, -1e9]; for (const q of B.o) { a = [Math.min(a[0], q[1]), Math.min(a[1], q[2]), Math.min(a[2], q[3])]; b = [Math.max(b[0], q[1]), Math.max(b[1], q[2]), Math.max(b[2], q[3])]; }
    orbit.tx = (a[0] + b[0]) / 2; orbit.ty = (a[1] + b[1]) / 2; orbit.tz = (a[2] + b[2]) / 2; orbit.dist = Math.max(20, Math.min(200, Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.9 + 12)); dirty = true; }
  // ---------------- the side panel ----------------
  function paintTabs() { if (!el) return; el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); setMode(mode); const sv = el.querySelector("[data-snapv]"); if (sv) sv.value = !snap ? "off" : String(snapV); }
  const num = (k, v, a, b, st = 0.5, lab = "") => `<label class="wse-num"><span>${esc(lab || k)}</span><input type="number" data-f="${k}" value="${v}" min="${a}" max="${b}" step="${st}"></label>`;
  function pane() { if (!el) return; const P = el.querySelector(".wse-pane"); P.innerHTML = tab === "prop" ? propPane() : tab === "game" ? gamePane() : tab === "scene" ? scenePane() : tab === "logic" ? logicPane() : tab === "look" ? lookPane() : tab === "ai" ? aiPane() : assetPane(); el.querySelector(".wse-side").dataset.tab = tab;
    if (tab === "logic" && lv === "graph") requestAnimationFrame(() => { graphTag(P, B, NOARG_W); graphWire(P); }); paintTree(); }
  function propPane() {
    const q = B.o[sel]; if (!q) return `<p class="wse-empty">${esc(T("Pick a piece in the view, or add one from the left."))}</p><p class="wse-cnt">${esc(T("{n} of {m} pieces", { n: B.o.length, m: OB.MAX }))}</p>`;
    const [k, x, y, z, ry, sx, sy, sz, c, a, b, g] = q, O = OB.OPT[k] || [], fix = FIX.has(k);
    const opt = (o, i, v) => (k === "x" && i === 0 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="${9 + i}">${OB.PROPS.map((p, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(p[0])}</option>`).join("")}</select></label>`
      : k === "n" && i === 0 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="9">${OB.SHOP.map((s, j) => `<option value="${j}"${j === v ? " selected" : ""}>${s[1]} ${esc(T(s[2]))}</option>`).join("")}</select></label>`
      : k === "B" && i === 1 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="10">${["Stomp rings", "Fire balls", "Charge"].map((s, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(T(s))}</option>`).join("")}</select></label>`
      : (k === "b" || k === "y" || k === "r" || k === "H") && i === 0 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="9">${obSurfaces.map((s, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(T(s))}</option>`).join("")}</select></label>`
      : k === "E" && i === 1 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="10">${["Walker (chases you)", "Flyer (swoops)", "Shooter (fires at you)"].map((s, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(T(s))}</option>`).join("")}</select></label>`
      : k === "A" && i === 0 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="9">${["Mentor", "Builder", "Gamer"].map((s, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(T(s))}</option>`).join("")}</select></label>`
      : k === "A" && i === 1 ? `<label class="wse-sel"><span>${esc(T(o[0]))}</span><select data-f="10">${OB.MSGS.map((m, j) => `<option value="${j}"${j === v ? " selected" : ""}>${esc(T(m))}</option>`).join("")}</select></label>`
      : o[2] - o[1] === 1 ? `<label class="wse-chk"><input type="checkbox" data-f="${9 + i}"${v ? " checked" : ""}> ${esc(T(o[0]))}</label>` : num(String(9 + i), v, o[1], o[2], 1, T(o[0])));
    const X = q[12] || {}, name = (entsOf(B)[sel] || {}).name || T(NAMES[k]), pre = presetOf(k), solid = OB.K[k][0] || k === "x" || k === "X", surf = O[0] && O[0][0] === "Surface";
    const beh = pre.filter((c2) => c2 !== "mesh" && c2 !== "collider"), optH = (from) => O.map((o, i) => (i < from ? "" : opt(o, i, i ? b : a))).join("");
    const card = (title, body, ex) => `<div class="wse-cc${ex ? " ex" : ""}"><header><b>${title}</b>${ex ? `<button type="button" class="wse-x" data-crm="${ex}" aria-label="${esc(T("Remove"))}" title="${esc(T("Remove"))}">×</button>` : `<em>${esc(T("built in"))}</em>`}</header>${body}</div>`;
    const fld = (c2, j, f) => { const v = X[c2][j], en = CENUM[c2 + ":" + j];
      if (c2 === "lt" && j === 0) return `<div class="wse-cols">${OB.COLORS.map((col, n) => `<button type="button" data-cfc="lt:0:${n}" class="${n === v ? "on" : ""}" style="background:${hex(col)}" aria-label="${n}"></button>`).join("")}</div>`;
      if (en) return `<label class="wse-sel"><span>${esc(T(f[0]))}</span><select data-cf="${c2}:${j}">${en.map((nm, n) => `<option value="${n + f[1]}"${n + f[1] === v ? " selected" : ""}>${esc(T(nm))}</option>`).join("")}</select></label>`;
      if (f[2] - f[1] === 1) return `<label class="wse-chk"><input type="checkbox" data-cf="${c2}:${j}"${v ? " checked" : ""}> ${esc(T(f[0]))}</label>`;
      return num("cf", v, f[1], f[2], 1, T(f[0])).replace('data-f="cf"', `data-cf="${c2}:${j}"`); };
    const exCards = Object.keys(CMP).filter((c2) => X[c2] != null).map((c2) => card(`${CICON[c2]} ${esc(T(CMP[c2][0]))}`, c2 === "sc" ? scriptCard(X) : `<div class="wse-opts">${CMP[c2][1].map((f, j) => fld(c2, j, f)).join("")}</div>${c2 === "sw" ? `<p class="wse-help">${esc(T("Its enemies come out every few seconds while a player is within 45 m; they drop no coins and the win doesn't wait for them."))}</p>` : c2 === "hl" ? `<p class="wse-help">${esc(T("Players break it with the action key."))}</p>` : c2 === "tg" ? `<p class="wse-help">${esc(T("Touching it opens its channel and fires the rules for this piece's tag."))}</p>` : ""}`, c2)).join("");
    const capLeft = (c2) => !CMP_CAP[c2] || B.o.filter((qq) => qq[12] && qq[12][c2] != null).length < CMP_CAP[c2];
    return `${many().length > 1 ? `<p class="wse-multi">✥ ${esc(T("{n} pieces picked — the gizmo and the arrow keys move them together; Delete removes them all", { n: many().length }))} <button type="button" class="wsb-b alt" data-mclr>${esc(T("Just this one"))}</button></p>` : ""}
      <div class="wse-ph"><i>${ICONS[k]}</i><input class="wse-nm" data-nm value="${esc(name)}" maxlength="24" aria-label="${esc(T("Name"))}"><small>${X.id ? "#" + X.id : "#" + (sel + 1)}</small></div><p class="wse-kd">${esc(T(NAMES[k]))}${HELP[k] ? " · " + esc(T(HELP[k])) : ""}</p>
      <h5>${esc(T("Transform"))}</h5><div class="wse-tf"><span>${esc(T("Position"))}</span>${num("1", x, -OB.R, OB.R, 0.5, "X")}${num("2", y, -10, OB.Y, 0.5, "Y")}${num("3", z, -OB.R, OB.R, 0.5, "Z")}
        <span>${esc(T("Rotation"))}</span><label class="wse-num off"><span>X</span><input type="number" value="0" disabled></label>${num("4", ry, 0, 359, 15, "Y °")}<label class="wse-num off"><span>Z</span><input type="number" value="0" disabled></label>
        <span>${esc(T("Scale"))}</span>${fix ? `<p class="wse-help">${esc(T("This piece keeps its own size."))}</p>` : num("5", sx, 0.25, OB.SZ, 0.25, "X") + num("6", sy, 0.25, OB.SZ, 0.25, "Y") + (k === "y" || k === "H" ? "" : num("7", sz, 0.25, OB.SZ, 0.25, "Z"))}</div>
      <div class="wse-flags">${solid ? `<label class="wse-chk"><input type="checkbox" data-xf="nc"${X.nc ? "" : " checked"}> ${esc(T("Collision"))}</label>` : ""}<label class="wse-chk"><input type="checkbox" data-xf="iv"${X.iv ? "" : " checked"}> ${esc(T("Visible"))}</label><label class="wse-chk"><input type="checkbox" data-xf="lk"${X.lk ? " checked" : ""}> ${esc(T("Locked"))}</label></div>
      <h5>${esc(T("Components"))}</h5>
      ${pre.includes("mesh") || surf ? card(`🧊 ${esc(T("Mesh"))}`, `${["b", "y", "r", "m", "e", "d", "H", "P"].includes(k) ? `<div class="wse-cols">${OB.COLORS.map((col, j) => `<button type="button" data-col="${j}" class="${j === c ? "on" : ""}" style="background:${hex(col)}" aria-label="${j}"></button>`).join("")}</div>` : ""}${surf || !beh.length ? `<div class="wse-opts">${surf ? opt(O[0], 0, a) : optH(0)}</div>` : ""}`) : ""}
      ${solid ? card(`🧱 ${esc(T("Collider"))}`, `<p class="wse-help">${esc(T(X.nc ? "Off — players pass through it." : "Players stand on it and bump into it."))}</p>`) : ""}
      ${beh.map((c2, n) => card(`⚙️ ${esc(T(PCOMP[c2] || c2))}`, n === 0 && O.length && (beh.length || !surf) ? `<div class="wse-opts">${optH(surf ? 1 : 0)}</div>` : "")).join("")}
      ${exCards}
      <label class="wse-sel wse-cadd"><select data-cadd aria-label="${esc(T("Add Component"))}"><option value="">＋ ${esc(T("Add Component"))}</option>${Object.keys(CMP).filter((c2) => X[c2] == null && capLeft(c2)).map((c2) => `<option value="${c2}">${CICON[c2]} ${esc(T(CMP[c2][0]))}</option>`).join("")}</select></label>
      <div class="wse-chips wse-feats">${FEATS.filter(([c2]) => X[c2] == null && capLeft(c2)).map(([c2, n]) => `<button type="button" data-feat="${c2}">${CICON[c2]} ${esc(T(n))}</button>`).join("")}</div>
      <h5>${esc(T("Folder"))} <small>${esc(T("(drag it in the Scene tree too; the logic shows or hides a whole folder)"))}</small></h5><div class="wse-grps">${[...new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, ...(B.gn || []).map((x2) => x2[0]), g])].sort((a2, b2) => a2 - b2).map((n) => `<button type="button" data-grp="${n}" class="${n === g ? "on" : ""}" title="${esc(gName(n))}">${n ? "G" + n : "—"}</button>`).join("")}<button type="button" data-newgrp title="${esc(T("A new group for this piece"))}">＋</button></div>
      ${k === "S" ? "" : animRow(sel)}
      <div class="wse-acts"><button type="button" class="wsb-b" data-dup>⧉ ${esc(T("Duplicate"))}</button>${k === "S" ? "" : `<button type="button" class="wsb-b" data-del>🗑 ${esc(T("Delete"))}</button>`}<button type="button" class="wsb-b alt" data-testsel>▶ ${esc(T("Test from this piece"))}</button></div>`;
  }
  /// a piece's developer script: the text, its errors by line, the handlers and statements it may use (read into rules, never run)
  function scriptCard(X) {
    const r = edParse(X.sc || "", X.id || 1), errs = r.errs.map((e) => `<li>${esc(T("Line {n}", { n: e.line }))}: ${esc(e.msg)}</li>`).join("");
    if (phone()) return `<pre class="wse-pre">${esc(X.sc || "")}</pre><p class="wse-help">${esc(T("Scripts are easier with a keyboard."))}</p><button type="button" class="wsb-b go" data-handoff="script">💻 ${esc(T("Continue on a PC"))}</button>`;
    return `<textarea data-sc rows="6" spellcheck="false" placeholder="onTouch(player) { this.hp -= 1 }">${esc(X.sc || "")}</textarea><ul class="wse-scerr">${errs || `<li class="ok">✓ ${esc(T("{n} rules from this script", { n: r.lg.length }))}</li>`}</ul>
      <small class="wse-sub">${esc(T("When"))}</small><div class="wse-chips">${SC_HELP.map((h) => `<button type="button" data-scins="${esc(h.replace(" … ", " \n  \n"))}">${esc(h)}</button>`).join("")}</div>
      <small class="wse-sub">${esc(T("Do"))}</small><div class="wse-chips">${SC_DO.map((h) => `<button type="button" data-scins="${esc(h + "; ")}">${esc(h)}</button>`).join("")}</div>
      <p class="wse-help">${esc(T("“this” is the piece (its tag #{t}). It is read into the same rules as the Logic tab — nothing runs as code.", { t: X.id || "?" }))}</p>`;
  }
  const HELP = { d: "Closed until its channel opens — a button on the same channel, or the logic.", u: "Step on it to open its channel. 'Open for' closes it again after that many seconds.", e: "Rides up while you stand on it, waits at the top, comes back down.", t: "Two teleporters with the same pair number send you between them.", n: "Sells its item for the coins a player holds — walk up and press the action key.", B: "The goal stays shut until every boss falls. Hit it with the action key or jump on its head.", s: "A bar that turns and knocks players away.", k: "Touching it sends a player back to their last checkpoint.", m: "Slides back and forth along its axis and carries whoever stands on it.", p: "Throws players up high.", c: "Where players come back after a fall.", g: "Touch it to win (after the bosses fall).", x: "Meshy-made scenery. Turn 'Solid' off for something to walk through." };
  // ---------------- G1/G3: the game's mode, how it's won, gravity, saves, the cutscene ----------------
  const gName = (n) => (n ? ((B.gn || []).find((x) => x[0] === n) || [0, T("Group {n}", { n })])[1] : T("No group"));
  function gamePane() {
    const md = B.md || "obby", cs = B.cs || [];
    return `<h5>${esc(T("Genre"))}</h5><div class="wse-modes2">${Object.entries(MODES).map(([k, [n, d]]) => `<button type="button" data-md="${k}" class="${md === k ? "on" : ""}"><b>${esc(T(n))}</b><small>${esc(T(d))}</small></button>`).join("")}</div>
      <label class="wse-sel"><span>${esc(T("How it's won"))}</span><select data-win>${OB.WINS.map((w) => `<option value="${w}"${w === (B.win || "goal") ? " selected" : ""}>${esc(T(WINS[w]))}</option>`).join("")}</select></label>
      <div class="wse-row3">${num("lp", B.lp || 1, 1, 5, 1, T("Laps"))}${num("gv", B.gv || 100, 30, 200, 10, T("Gravity %"))}</div>
      <label class="wse-chk"><input type="checkbox" data-sv${B.sv ? " checked" : ""}> ${esc(T("Save each player's progress (checkpoint, coins, what they bought)"))}</label>
      <p class="wse-help">${esc(T("Low gravity makes jumps higher and longer — the reach check knows. With saves on, players can come back later and continue from their last checkpoint."))}</p>
      <h5>${esc(T("Cutscene"))} <small>${esc(T("(camera keys: frame the view, then add a key)"))}</small></h5>
      <div class="wse-keys">${cs.map((k, i) => `<span>🎥 ${k[0]} s<button type="button" class="wse-x" data-csdel="${i}" aria-label="${esc(T("Delete"))}">×</button></span>`).join("") || `<p class="wse-empty">${esc(T("No cutscene yet."))}</p>`}</div>
      <div class="wse-acts"><button type="button" class="wsb-b" data-cskey${cs.length >= OB.KEYS ? " disabled" : ""}>＋ ${esc(T("Add the current view as a key"))}</button>${cs.length >= 2 ? `<button type="button" class="wsb-b alt" data-csplay>▶ ${esc(T("Preview"))}</button>` : ""}</div>
      <p class="wse-help">${esc(T("With two keys or more it plays as the intro (if the intro is on in Look & UI), or when a rule says 'Play the cutscene'."))}</p>`;
  }
  /// a piece's animation track: a preset, its keys, looped / at the start; the logic's 'Play animation track N' starts it
  // RV (the review): the animation as a timeline — its keys as marks along the seconds, a key picked to edit (time, the move
  // from where the piece stands, the turn), keys added after it or taken out, the whole track previewed on the piece here
  let tkK = 0, tkPrev = null;
  function animRow(i) {
    const n = (B.tk || []).findIndex((t) => t[0] === i), t = n >= 0 ? B.tk[n] : null;
    if (t) tkK = Math.max(0, Math.min(t[3].length - 1, tkK));
    const last = t ? Math.max(0.5, t[3][t[3].length - 1][0]) : 1, k = t ? t[3][tkK] : null, num = (f, v, lab, st, mn, mx) => `<label class="wse-num"><span>${esc(T(lab))}</span><input type="number" data-kf="${f}" value="${v}" step="${st}" min="${mn}" max="${mx}"></label>`;
    return `<h5>${esc(T("Animation"))} ${t ? `<small>${esc(T("track {n}", { n: n + 1 }))} · ${t[3].length}/${OB.KEYS} ${esc(T("keys"))}</small>` : ""}</h5>${t ? `
      <div class="wse-tl" style="--n:${Math.ceil(last)}"><i class="wse-tlh"${tkPrev ? "" : " hidden"}></i>${t[3].map((q, j) => `<button type="button" data-tkk="${j}" class="${j === tkK ? "on" : ""}" style="left:${((q[0] / last) * 100).toFixed(1)}%" title="${q[0]} s">${j + 1}</button>`).join("")}<em>0 s</em><em class="r">${last} s</em></div>
      <div class="wse-kfs">${num(0, k[0], "Time (s)", 0.25, 0, 60)}${num(1, k[1], "Move X", 0.5, -40, 40)}${num(2, k[2], "Move Y", 0.5, -20, 40)}${num(3, k[3], "Move Z", 0.5, -40, 40)}${num(4, k[4], "Turn °", 15, -720, 720)}</div>
      <div class="wse-acts"><button type="button" class="wsb-b alt" data-tkadd${t[3].length >= OB.KEYS ? " disabled" : ""}>＋ ${esc(T("Key after this"))}</button><button type="button" class="wsb-b alt" data-tkkdel${t[3].length <= 2 ? " disabled" : ""}>− ${esc(T("Remove key"))}</button><button type="button" class="wsb-b alt" data-tkplay>▶ ${esc(T("Preview"))}</button></div>
      <div class="wse-chks"><label class="wse-chk"><input type="checkbox" data-tkl${t[1] ? " checked" : ""}> ${esc(T("Loop"))}</label><label class="wse-chk"><input type="checkbox" data-tka${t[2] ? " checked" : ""}> ${esc(T("Plays from the start"))}</label></div>
      <div class="wse-acts"><button type="button" class="wsb-b" data-tkdel>🗑 ${esc(T("Remove the animation"))}</button></div>` : `<div class="wse-acts"><button type="button" class="wsb-b alt" data-tknew>＋ ${esc(T("New animation"))}</button></div>`}
      <small class="wse-sub">${esc(T("Or start from a ready one"))}</small><div class="wse-chips">${TRACKS.map(([nm], j) => `<button type="button" data-trk="${j}">${esc(T(nm))}</button>`).join("")}</div>`;
  }
  /// the track's place at a time (as the run plays it: eased between two keys)
  function tkAt(K, tt) { let j = 0; while (j < K.length - 2 && K[j + 1][0] < tt) j++; const a = K[j], b = K[j + 1], f = Math.max(0, Math.min(1, (tt - a[0]) / Math.max(0.01, b[0] - a[0]))), e = f * f * (3 - 2 * f); return [a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e, a[4] + (b[4] - a[4]) * e]; }
  // ---------------- G2: the hierarchy (groups with names and parents) and the prefab library ----------------
  const under = (g) => { const out = new Set([g]); let more = true; while (more) { more = false; for (const x of B.gn || []) if (!out.has(x[0]) && out.has(x[2])) { out.add(x[0]); more = true; } } return out; };
  let pfStore = null, pfQ = "", pfBusy = false;
  function scenePane() {
    const gn = B.gn || [], cnt = (g) => B.o.filter((q) => q[11] === g).length, used = [...new Set(B.o.map((q) => q[11]).filter(Boolean))], all = [...new Set([...gn.map((x) => x[0]), ...used])];
    const row = (g, depth) => { const x = gn.find((y) => y[0] === g), kids = all.filter((h) => (gn.find((y) => y[0] === h) || [0, "", 0])[2] === g), pfId = ((B.pi || []).find((p) => p[0] === g) || [])[1];
      return `<div class="wse-node" style="--d:${depth}"><button type="button" data-gsel="${g}" class="${sel >= 0 && B.o[sel][11] === g ? "on" : ""}"><i>${pfId ? "🧩" : "📁"}</i><b>${esc(x ? x[1] : T("Group {n}", { n: g }))}</b><small>${cnt(g)}</small></button>
        <span class="wse-nact"><button type="button" data-gmv="${g}" data-ax="x" data-d="-1" title="X −">◀</button><button type="button" data-gmv="${g}" data-ax="x" data-d="1" title="X +">▶</button><button type="button" data-gmv="${g}" data-ax="z" data-d="-1" title="Z −">▲</button><button type="button" data-gmv="${g}" data-ax="z" data-d="1" title="Z +">▼</button><button type="button" data-gmv="${g}" data-ax="y" data-d="1" title="Y +">⤒</button><button type="button" data-grot="${g}" title="${esc(T("Turn 90°"))}">⟳</button><button type="button" data-gdup="${g}" title="${esc(T("Duplicate"))}">⧉</button><button type="button" data-gren="${g}" title="${esc(T("Rename"))}">✎</button><button type="button" data-gpar="${g}" title="${esc(T("Put inside another group"))}">⇲</button><button type="button" data-gpf="${g}" title="${esc(T("Save as prefab"))}">🧩</button><button type="button" data-gdel="${g}" title="${esc(T("Delete"))}">🗑</button></span></div>${kids.map((h) => row(h, depth + 1)).join("")}`; };
    const roots = all.filter((g) => { const x = gn.find((y) => y[0] === g); return !x || !x[2] || !all.includes(x[2]); });
    const store = pfStore ? pfStore.items || [] : null, mine = ctx.prefabs ? ctx.prefabs.mine() : [];
    const pcard = (c, kind) => `<button type="button" class="wse-pf" data-pf${kind}="${esc(c.id)}"><img src="${pfThumb(c.th || thinPf(c.o), "pf" + kind + ":" + c.id + ":" + (c.o || c.th || []).length, 200, 110)}" alt=""><b>${esc(c.n)}</b><small>${esc(T(PKIND[c.k] || c.k))} · ${c.meta ? c.meta.pieces : (c.o || []).length} ${esc(T("pieces"))}${c.meta && c.meta.hp ? " · ❤️ " + c.meta.hp : ""}${c.meta && c.meta.reward ? " · 🪙 " + c.meta.reward : ""}</small>${c.lic ? `<em class="lic-${c.lic}" title="${esc(T(LICN[c.lic][1]))}">${esc(T(LICN[c.lic][0]))}</em>` : ""}${kind === "s" ? `<i>${c.price ? (pfStore.owned || []).includes(c.id) ? "✓ " + esc(T("Owned")) : `${c.price.toLocaleString()} ARCL` : esc(T("Free"))}</i><small class="by">${esc(T("by {n}", { n: c.by }))}${c.orig ? " · " + esc(T("based on {n}'s", { n: c.orig.name })) : ""} · ⬇ ${c.uses}</small>` : ""}</button>`;
    return `<h5>${esc(T("Hierarchy"))} <small>${esc(T("(groups inside groups — move, turn, copy or save a whole part at once)"))}</small></h5>
      <div class="wse-tree">${roots.map((g) => row(g, 0)).join("") || `<p class="wse-empty">${esc(T("No groups yet — pick a piece and give it a group in Properties."))}</p>`}</div>
      <p class="wse-cnt">${esc(T("{n} pieces without a group", { n: B.o.filter((q) => !q[11]).length }))}</p>
      <h5>${esc(T("Prefabs"))} <small>${esc(T("(a part saved once — a boss with its health, attacks, reward and rules — placed into any game)"))}</small></h5>
      <small class="wse-sub">${esc(T("ARCIRCLE's own"))}</small><div class="wse-pfs">${Object.entries(PREFABS).map(([id, P]) => pcard({ id, ...cleanPrefab(P) }, "b")).join("")}</div>
      <small class="wse-sub">${esc(T("Mine"))}</small><div class="wse-pfs">${mine.map((c, j) => pcard({ ...c, id: String(j) }, "m")).join("") || `<p class="wse-empty">${esc(T("Save a group as a prefab (🧩) to keep it here."))}</p>`}</div>
      <small class="wse-sub">${esc(T("Creators' market"))}</small><div class="wse-acts"><input type="search" data-pfq value="${esc(pfQ)}" placeholder="${esc(T("Search prefabs"))}"><button type="button" class="wsb-b alt" data-pfload>${esc(T(store ? "Refresh" : "Open the market"))}</button></div>
      ${store ? `<div class="wse-pfs">${store.map((c) => pcard(c, "s")).join("") || `<p class="wse-empty">${esc(T("Nothing here yet — be the first to share one."))}</p>`}</div><p class="wse-help">${esc(T("Free prefabs install for anyone and keep their creator's name. Paid ones are bought with ARCL: 80 % to the creator, 20 % to the platform (the creator's share waits 14 days). Each card shows its licence."))}</p>` : ""}`;
  }
  /// a prefab into this course where the view's middle lands
  function placeAt(P, id) { ray.setFromCamera(new THREE.Vector2(0, 0), cam); const hit = ray.intersectObjects(objs, true).find((h) => h.object.userData.i != null), p = hit ? hit.point : hitPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)) || new THREE.Vector3(orbit.tx, 0, orbit.tz);
    const r = placePrefab(cleanObby(B), P, [sn(p.x, 0.5), sn(p.y, 0.5), sn(p.z, 0.5)], 0, id || ""); if (!r.ok) { ctx.toast(esc(T(r.why === "full" ? "Not enough room — a course holds {n} pieces" : r.why === "groups" ? "No free group left" : "That prefab can't be placed", { n: OB.MAX }))); return; }
    push(); B = JSON.parse(JSON.stringify(r.B)); sel = B.o.findIndex((q) => q[11] === r.g); rebuild(); changed(); pane(); evt("ob-prefab"); ctx.toast("🧩 " + esc(T("Placed — it's group G{n} in the hierarchy", { n: r.g }))); }
  async function savePrefab(g) {
    const idx = B.o.map((q, i) => (under(g).has(q[11]) ? i : -1)).filter((i) => i >= 0); if (!idx.length) return;
    const name0 = gName(g), form = await askForm(T("Save as prefab"), [["name", T("Name"), name0], ["k", T("Kind"), "", Object.keys(PKIND).map((k) => [k, T(PKIND[k])])], ["lic", T("Licence"), "cc-by", Object.keys(LICN).map((k) => [k, T(LICN[k][0]) + " — " + T(LICN[k][1])])], ["price", T("Price in ARCL (0 = free)"), "0"], ["share", T("Share it on the creators' market"), "", "check"]]);
    if (!form) return; const P = packPrefab(cleanObby(B), idx, form.name || name0, form.k); if (!P) return;
    const from = ((B.pi || []).find((p) => p[0] === g) || [])[1];
    if (ctx.prefabs) ctx.prefabs.keep({ ...P, lic: form.lic, from });
    if (form.share && ctx.prefabs) { const r = await ctx.prefabs.save({ name: P.n, k: P.k, lic: form.lic, price: Math.max(0, Math.floor(Number(form.price) || 0)), pf: P, ...(from && !/^bx/.test(from) ? { from } : {}) }); ctx.toast(r && r.ok ? "🧩 " + esc(T("Shared on the creators' market")) : "⚠️ " + esc((r && r.error) || T("Couldn't share it"))); }
    else ctx.toast("🧩 " + esc(T("Saved to My prefabs"))); pfStore = null; pane(); }
  function groupOp(op, g, ax, d) {
    const G2 = under(g), idx = B.o.map((q, i) => (G2.has(q[11]) ? i : -1)).filter((i) => i >= 0); if (!idx.length && op !== "del") return;
    push();
    if (op === "mv") { const k = ax === "x" ? 1 : ax === "y" ? 2 : 3, st = snap ? 1 : 0.5; for (const i of idx) B.o[i][k] = clampAx(k, B.o[i][k] + d * st); }
    else if (op === "rot") { const xs = idx.map((i) => B.o[i][1]), zs = idx.map((i) => B.o[i][3]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      for (const i of idx) { const q = B.o[i], dx = q[1] - cx, dz = q[3] - cz; q[1] = clampAx(1, cx + dz); q[3] = clampAx(3, cz - dx); q[4] = (q[4] + 90) % 360; } }
    else if (op === "dup") { const P = packPrefab(cleanObby(B), idx, gName(g), ""); if (!P) return; const xs = idx.map((i) => B.o[i][1]), zs = idx.map((i) => B.o[i][3]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, w = Math.max(...xs) - Math.min(...xs) + 4;
      const r = placePrefab(cleanObby(B), P, [cx + w, Math.min(...idx.map((i) => B.o[i][2])), cz], 0, ((B.pi || []).find((p) => p[0] === g) || [])[1] || ""); if (!r.ok) { undo.pop(); ctx.toast(esc(T("Not enough room"))); return; } B = JSON.parse(JSON.stringify(r.B)); }
    else if (op === "del") { const keep = B.o.map((q, i) => !G2.has(q[11]) || q[0] === "S"), map = []; let n = 0; keep.forEach((k2, i) => { map[i] = k2 ? n++ : -1; }); B.o = B.o.filter((_, i) => keep[i]); B.tk = (B.tk || []).filter((t) => map[t[0]] >= 0).map((t) => [map[t[0]], t[1], t[2], t[3]]); B.gn = (B.gn || []).filter((x) => !G2.has(x[0])); B.pi = (B.pi || []).filter((x) => !G2.has(x[0])); B.hg = B.hg.filter((x) => !G2.has(x)); sel = -1; }
    rebuild(); changed(); pane(); }
  function logicPane() {
    const sw = `<nav class="wse-lv">${[["list", "List"], ["graph", "Graph"], ["script", "Script"]].map(([k, n]) => `<button type="button" data-lv="${k}" class="${lv === k ? "on" : ""}">${esc(T(n))}</button>`).join("")}</nav>`;
    if (lv === "graph") return sw + (phone() ? `<p class="wse-pcn">💻 ${esc(T("The graph is roomier on a computer."))} <button type="button" class="wsb-b alt" data-handoff="graph">${esc(T("Continue on a PC"))}</button></p>` : "") + graphHtml(B, { T, esc, WHEN_N, THEN_N, NOARG_W, NOARG_T });
    if (lv === "script") return sw + `<p class="wse-help">${esc(T("One rule a line: when coins 10 then open 1 · when every 5 then toggle 2 · when A >= 3 then phase 2 again · when touch 3 then dmg 3 1 · when start then win if coins >= 50. It reads into the same rules — nothing else runs."))}</p><textarea data-script rows="12" spellcheck="false">${esc(obScript(B.lg))}</textarea><div class="wse-acts"><button type="button" class="wsb-b alt" data-sapply>${esc(T("Apply the script"))}</button><span class="wse-serr"></span></div>`;
    return sw + logicList();
  }
  function logicList() {
    const W = OB.WHEN, Tn = OB.THEN, rows = B.lg.map((r, i) => `<div class="wse-rule" data-ri="${i}"><span class="wse-w">${esc(T("When"))}</span><select data-r="0">${W.map((w) => `<option value="${w}"${w === r[0] ? " selected" : ""}>${esc(T(WHEN_N[w]))}</option>`).join("")}</select>${NOARG_W.has(r[0]) ? "" : `<input type="number" data-r="1" value="${r[1]}" min="0" max="999">`}
      <span class="wse-w">${esc(T("then"))}</span><select data-r="2">${Tn.map((t) => `<option value="${t}"${t === r[2] ? " selected" : ""}>${esc(T(THEN_N[t]))}</option>`).join("")}</select>${NOARG_T.has(r[2]) ? "" : r[2] === "say" ? `<select data-r="3">${OB.MSGS.map((m, j) => `<option value="${j}"${j === r[3] ? " selected" : ""}>${esc(T(m))}</option>`).join("")}</select>` : `<input type="number" data-r="3" value="${r[3]}" min="-10" max="999">`}
      ${r[0] === "every" ? "" : `<label class="wse-chk"><input type="checkbox" data-r="4"${r[4] ? " checked" : ""}> ${esc(T("again"))}</label>`}<button type="button" class="wse-x" data-rdel="${i}" aria-label="${esc(T("Delete"))}">×</button></div>`).join("");
    return `<p class="wse-help">${esc(T("Rules run during the game: WHEN something happens THEN do something. Counters A and B, a phase (1–5), channels (doors) and groups (pieces you show or hide) make it a real game."))}</p>
      <div class="wse-rules">${rows || `<p class="wse-empty">${esc(T("No rules yet."))}</p>`}</div>
      <div class="wse-acts"><button type="button" class="wsb-b" data-radd${B.lg.length >= OB.LG ? " disabled" : ""}>＋ ${esc(T("Add a rule"))}</button><span class="wse-cnt">${B.lg.length}/${OB.LG}</span></div>
      <h5>${esc(T("Hidden at the start"))}</h5><div class="wse-grps">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" data-hg="${n}" class="${B.hg.includes(n) ? "on" : ""}">G${n}</button>`).join("")}</div>
      <h5>${esc(T("Templates"))}</h5><div class="wse-chips">${LOGIC_T.map(([n], i) => `<button type="button" data-lt="${i}">${esc(T(n))}</button>`).join("")}</div>
      <details class="wse-script"><summary>⌨️ ${esc(T("Script (for advanced creators)"))}</summary><p class="wse-help">${esc(T("One rule a line: when coins 10 then open 1 · when every 5 then toggle 2 · when A >= 3 then phase 2 again · when boss half then say 6. It reads into the same rules — nothing else runs."))}</p><textarea data-script rows="7" spellcheck="false">${esc(obScript(B.lg))}</textarea><div class="wse-acts"><button type="button" class="wsb-b alt" data-sapply>${esc(T("Apply the script"))}</button><span class="wse-serr"></span></div></details>`;
  }
  const LOGIC_T = [["Coins open the door", [["coins", 10, "open", 1, 0], ["coins", 10, "say", 1, 0]]], ["A door that blinks", [["every", 4, "toggle", 2, 1]]], ["Boss phase 2", [["bosshalf", 0, "phase", 2, 0], ["phase", 2, "show", 1, 0], ["phase", 2, "say", 6, 0]]], ["Kill counter wins", [["start", 0, "setA", 0, 0], ["button", 1, "addA", 1, 1], ["varA", 3, "win", 0, 0]]], ["Hurry-up clock", [["after", 60, "say", 2, 0], ["after", 60, "speed", 6, 0]]], ["Secret path", [["checkpoint", 2, "show", 3, 0], ["checkpoint", 2, "say", 7, 0]]]];
  function lookPane() {
    const bit = (v, b) => !!(v & b), chk = (f, b, n, v) => `<label class="wse-chk"><input type="checkbox" data-${f}="${b}"${bit(v, b) ? " checked" : ""}> ${esc(T(n))}</label>`;
    return `<h5>${esc(T("Pro look"))}</h5><div class="wse-looks">${OB.LOOKS.map((k) => { const L = LOOKS[k]; return `<button type="button" data-look="${k}" class="${B.lk === k ? "on" : ""}" style="--lka:${hex(L.top)};--lkb:${hex(L.bot)}"><i></i><span>${esc(T(L.name))}</span></button>`; }).join("")}</div>
      <p class="wse-help">${esc(T("Each look sets the sky, the light, the fog, a colour grade and the camera in one tap."))}</p>
      <h5>${esc(T("World"))}</h5><label class="wse-chk"><input type="checkbox" data-bp${B.bp ? " checked" : ""}> ${esc(T("Baseplate (a flat floor under everything)"))}</label>
      <div class="wse-row3">${num("hp", B.hp, 0, 5, 1, T("Hearts (0 = endless)"))}${num("tl", B.tl, 0, 900, 10, T("Time limit (s)"))}</div>
      <label class="wse-sel"><span>${esc(T("Quest line"))}</span><select data-q>${OB.QUESTS.map((qq, j) => `<option value="${j}"${j === B.q ? " selected" : ""}>${esc(T(qq))}</option>`).join("")}</select></label>
      <label class="wse-sel"><span>${esc(T("Counter A is called"))}</span><select data-vl>${OB.VARL.map((v, j) => `<option value="${j}"${j === B.vl ? " selected" : ""}>${esc(T(v))}</option>`).join("")}</select></label>
      <h5>${esc(T("UI kit"))} <small>${esc(T("(laid out for phones by itself)"))}</small></h5><div class="wse-chks">${chk("ui", OB.UI.hearts, "Hearts", B.ui)}${chk("ui", OB.UI.coins, "Coins", B.ui)}${chk("ui", OB.UI.timer, "Timer", B.ui)}${chk("ui", OB.UI.boss, "Boss health bar", B.ui)}${chk("ui", OB.UI.quest, "Quest line", B.ui)}${chk("ui", OB.UI.varA, "Counter A", B.ui)}${chk("ui", OB.UI.best, "Best time", B.ui)}${chk("ui", OB.UI.map, "Minimap", B.ui)}</div>
      <h5>${esc(T("Cinematics"))}</h5><div class="wse-chks">${chk("cn", OB.CN.intro, "Intro fly-over", B.cn)}${chk("cn", OB.CN.boss, "Boss entrance", B.cn)}${chk("cn", OB.CN.clear, "Slow motion on the clear", B.cn)}</div>
      <h5>${esc(T("Your hero"))}</h5><div class="wse-chks">${chk("av", OB.AV.gear, "Show the weapon players wear", B.av)}${chk("av", OB.AV.pet, "Players' pets come along", B.av)}</div>
      <p class="wse-help">${esc(T("Everyone plays your course as their own ARCIRCLE hero — ARON, LUMI or NEX."))}</p>`;
  }
  function aiPane() {
    return `<p class="wse-help">${esc(T("Describe a game in one sentence and the director builds the map, the hazards, the rules, the look and the HUD. Then keep talking to change it."))}</p>
      <div class="wse-chat">${chat.map((m) => `<p class="${m.me ? "me" : ""}">${esc(m.t)}</p>`).join("") || `<p>${esc(T("Try: “a lava tower with a dragon boss and a shop, night look”"))}</p>`}</div>
      <textarea data-ai rows="2" maxlength="200" placeholder="${esc(T("A long ice course with doors, a shop and a boss…"))}"></textarea>
      <div class="wse-acts"><button type="button" class="wsb-b go" data-aimake>✨ ${esc(T("Make a new course"))}</button><button type="button" class="wsb-b alt" data-aitweak>🛠 ${esc(T("Change this one"))}</button></div>
      <div class="wse-chips">${["Add a boss", "Harder ending", "Easier", "More coins", "Add a shop", "Add checkpoints", "Add spinners", "Add a timer", "Night look", "Cinematic look"].map((q) => `<button type="button" data-aiq="${esc(q)}">${esc(T(q))}</button>`).join("")}</div>`;
  }
  function assetPane() {
    const mine = ctx.assets && ctx.assets.list ? ctx.assets.list() : [];
    return `<h5>${esc(T("Meshy props"))}</h5><p class="wse-help">${esc(T("Made with Meshy and packed light for phones. Tap one to place it."))}</p><div class="wse-props">${OB.PROPS.map((p, j) => `<button type="button" data-prop="${j}">${esc(p[0])}</button>`).join("")}</div>
      <h5>${esc(T("Make your own with Meshy"))}</h5>${ctx.assets ? `<p class="wse-help">${esc(T("Describe a prop — it is made as a light 3D model (a triangle budget for phones) and lands in this list. A few a day."))}</p>
      <textarea data-asset rows="2" maxlength="160" placeholder="${esc(T("a glowing crystal tree"))}"></textarea><div class="wse-acts"><button type="button" class="wsb-b go" data-amake>✨ ${esc(T("Make it"))}</button><span class="wse-astat"></span></div>
      <div class="wse-props">${mine.map((a) => `<button type="button" data-myasset="${esc(a.id)}"${a.ready ? "" : " disabled"}>${esc(a.name)}${a.ready ? "" : " ⏳"}</button>`).join("") || `<p class="wse-empty">${esc(T("Nothing made yet."))}</p>`}</div>` : `<p class="wse-empty">${esc(T("Sign in to make your own."))}</p>`}`;
  }
  // ---------------- the bar under the view: the test players' report ----------------
  function bar() {
    if (!el) return; const c = cleanObby(B), E = est || (est = estimate(clampSpec({ ...spec, build: c }))), R0 = reach || obReach(c, spec);
    const why = { gap: "long jumps", k: "lava", s: "spinners", m: "moving platforms", hop: "small platforms", B: "the boss", time: "the clock", reach: "the goal out of reach" }[E.why] || "";
    const dull = E.dull && E.dull.length ? E.dull.map((i) => `${i * 10}–${i * 10 + 10}%`).join(", ") : "";
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span><span class="wsb-cnt">🧱 ${c.o.length}/${OB.MAX} · 🚩 ${c.o.filter((q) => q[0] === "c").length} · 🪙 ${c.o.filter((q) => q[0] === "o").length} · ⚙️ ${c.lg.length}</span>
      ${!R0.ok ? `<span class="wsb-bad">⚠️ ${esc(T(winMsg(c)))}</span>` : R0.far.length ? `<span class="wsb-bad">🟥 ${esc(T("{n} pieces nobody can reach (red)", { n: R0.far.length }))}</span>` : `<span class="wsb-ok">✓ ${esc(T((c.win || "goal") === "goal" ? "The goal can be reached" : "Everything this game needs can be reached"))}</span>`}
      <span class="wse-rep">${why ? `🤖 ${esc(T("Most runs end at {w}", { w: T(why) }))}` : ""}${dull ? ` · 😴 ${esc(T("Dull stretch at {r}", { r: dull }))}` : ""}${E.easy ? ` · 🥱 ${esc(T("Too easy — add a hazard or a boss"))}` : ""}</span>`;
    const BU = obBudget(c), pct = Math.round(BU.k * 100);
    el.querySelector(".wsb-bar").insertAdjacentHTML("beforeend", `<span class="wse-bud${BU.heavy ? " bad" : pct > 70 ? " mid" : ""}" title="${esc(T("Phone budget: {t} triangles of {m}, {l} lights of {ml}, {v} moving pieces of {mv}", { t: BU.tris.toLocaleString(), m: OB_BUDGET.tris.toLocaleString(), l: BU.lights, ml: OB_BUDGET.lights, v: BU.moving, mv: OB_BUDGET.moving }))}">📱 <i style="--p:${Math.min(100, pct)}%"></i> ${pct}%</span>`);
    const CE = compOf(c).cerr; if (CE.length) el.querySelector(".wsb-bar").insertAdjacentHTML("beforeend", `<span class="wsb-bad">⌨️ ${esc(T("{n} script lines not understood", { n: CE.length }))}</span>`);
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length;
  }
  function winMsg(c) { const w = c.win || "goal", tk = { enemies: "E", collect: "Q", race: "R" }[w], has = tk ? c.o.some((q) => q[0] === tk || (tk === "E" && q[0] === "B")) : true;
    if (w === "goal") return c.o.some((q) => q[0] === "g") ? "Nobody can reach the goal yet — the red boxes are out of reach" : "Place a goal so the course can be won";
    if (!has) return { E: "Place at least one enemy — this game is won by defeating them", Q: "Place at least one gem — this game is won by finding them", R: "Place race rings — this game is won by flying through them" }[tk];
    return { enemies: "Some enemies can't be reached", collect: "Some gems can't be reached", race: "Some rings can't be reached", varA: "The start has nothing to stand on" }[w]; }
  // ---------------- clicks and fields ----------------
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.pick != null) { const i = +b.dataset.pick; if (e.shiftKey && sel >= 0 && i !== sel) { if (msel.has(i)) msel.delete(i); else msel.add(i); } else { msel.clear(); sel = i; } selShow(); if (!e.shiftKey) focusNear(); tab = "prop"; paintTabs(); pane(); return; }
    if (b.dataset.eye != null || b.dataset.lock != null) { const i = +(b.dataset.eye ?? b.dataset.lock), f = b.dataset.eye != null ? "eh" : "lk"; push(); const x = xOf(i); x[f] = x[f] ? 0 : 1; if (!x[f]) delete x[f]; xTidy(i); if (f === "eh" && sel === i) { sel = -1; } refresh(i); changed(); pane(); return; }
    if (b.hasAttribute("data-newfold")) { const used = new Set([...B.o.map((q) => q[11]), ...(B.gn || []).map((x) => x[0])]); let g = 0; for (let i = 1; i <= OB.G; i++) if (!used.has(i)) { g = i; break; } if (!g) { ctx.toast(esc(T("No free group left"))); return; } push(); B.gn = [...(B.gn || []), [g, T("Folder {n}", { n: g }), 0]]; changed(); pane(); return; }
    if (b.hasAttribute("data-sheet")) { const k = b.dataset.sheet; el.dataset.sheet = el.dataset.sheet === k ? "" : k; el.querySelectorAll("[data-sheet]").forEach((x) => x.classList.toggle("on", el.dataset.sheet === x.dataset.sheet)); setTimeout(fit, 30); return; }
    if (b.hasAttribute("data-sim")) return simToggle();
    if (b.hasAttribute("data-dbg")) { if (phone()) return handoff("The debug view (colliders, triggers, paths, frame rate) is made for a computer's screen."); dbg = !dbg; b.classList.toggle("on", dbg); el.querySelector(".wse-stat").hidden = !dbg; dbgBuild(); statPaint(); return; }
    if (b.hasAttribute("data-local")) { local = !local; b.classList.toggle("on", local); b.querySelector(".wse-lw").textContent = T(local ? "Local" : "World"); dirty = true; return; }
    if (b.hasAttribute("data-save")) return doSave();
    if (b.hasAttribute("data-pub")) return doPublish();
    if (b.hasAttribute("data-hist")) return histOpen();
    if (b.dataset.handoff) return handoff(b.dataset.handoff === "script" ? "Scripts are easier with a keyboard." : "The logic graph is roomier on a computer.");
    if (b.dataset.lv) { lv = b.dataset.lv; pane(); return; }
    if (b.dataset.set) return applySet(b.dataset.set);
    if (b.dataset.feat && sel >= 0) return addComp(sel, b.dataset.feat);
    if (b.dataset.crm && sel >= 0) { push(); const x = xOf(sel); delete x[b.dataset.crm]; xTidy(sel); B = cleanObby(B); refresh(sel); changed(); pane(); return; }
    if (b.dataset.cfc && sel >= 0) { const [c2, j, v] = b.dataset.cfc.split(":"); push(); xOf(sel)[c2][+j] = +v; refresh(sel); changed(); pane(); return; }
    if (b.dataset.scins != null) { const ta = el.querySelector("[data-sc]"); if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, at) + b.dataset.scins + ta.value.slice(ta.selectionEnd ?? at); ta.focus(); ta.dispatchEvent(new Event("change", { bubbles: true })); return; }
    if (b.dataset.gadd) { if (B.lg.length >= OB.LG) return; const [w, a] = b.dataset.gadd.split(":"); push(); B.lg.push([w, +a, "say", 0, 0]); B.lg = cleanObby(B).lg; changed(); pane(); evt("ob-logic"); return; }
    if (b.dataset.gcadd != null) { push(); const r = B.lg[+b.dataset.gcadd]; if (r) { while (r.length < 5) r.push(0); r[5] = [0, 0, 1]; } B.lg = cleanObby(B).lg; changed(); pane(); return; }
    if (b.dataset.gcdel != null) { push(); const r = B.lg[+b.dataset.gcdel]; if (r) r[5] = 0; B.lg = cleanObby(B).lg; changed(); pane(); return; }
    if (b.hasAttribute("data-close")) { if (undo.length) { if (await ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true })) close(false); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) return doUndo(false); if (b.hasAttribute("data-redo")) return doUndo(true);
    if (b.hasAttribute("data-test") || b.hasAttribute("data-testsel")) { const c = cleanObby(B), q = b.hasAttribute("data-testsel") && B.o[sel]; ctx.onTest(clampSpec({ ...spec, build: c }), q && OB.K[q[0]][0] ? [q[1], q[2] + q[6], q[3]] : null); return; }
    if (b.dataset.add) { addAt(b.dataset.add); if (phone()) { el.dataset.sheet = ""; setTimeout(fit, 30); } return; }
    if (b.dataset.mode) return setMode(b.dataset.mode);
    if (b.hasAttribute("data-dup")) return dup(); if (b.hasAttribute("data-del")) return del();
    if (b.hasAttribute("data-snap")) { snap = !snap; paintTabs(); return; } if (b.hasAttribute("data-focus")) return sel >= 0 ? focusSel() : focusAll();
    if (b.dataset.tab) { tab = b.dataset.tab; paintTabs(); pane(); return; }
    // G1/G3 the game, tracks, the cutscene
    if (b.dataset.md) { push(); B.md = b.dataset.md; B.win = { obby: "goal", combat: "enemies", race: "race", explore: "collect" }[B.md]; if (B.md === "explore" && !B.bp) { B.bp = 1; rebuild(); } changed(); pane(); evt("ob-genre"); return; }
    if (b.hasAttribute("data-cskey")) { push(); const cs = B.cs || [], t = cs.length ? cs[cs.length - 1][0] + 2 : 0, r1 = (v) => Math.round(v * 4) / 4; B.cs = [...cs, [t, r1(cam.position.x), r1(cam.position.y), r1(cam.position.z), r1(orbit.tx), r1(orbit.ty), r1(orbit.tz)]].slice(0, OB.KEYS); changed(); pane(); return; }
    if (b.dataset.csdel != null) { push(); B.cs = (B.cs || []).filter((_, i) => i !== +b.dataset.csdel); if (B.cs.length) { const t0 = B.cs[0][0]; B.cs.forEach((k) => (k[0] -= t0)); } changed(); pane(); return; }
    if (b.hasAttribute("data-csplay")) { csPrev = { t0: performance.now() }; return; }
    if (b.dataset.trk != null && sel >= 0) { push(); const keys = TRACKS[+b.dataset.trk][1].map((k) => k.slice()); B.tk = (B.tk || []).filter((t) => t[0] !== sel); if (B.tk.length >= OB.TK) { undo.pop(); ctx.toast(esc(T("A course holds up to {n} animations", { n: OB.TK }))); return; } B.tk.push([sel, 1, 1, keys]); refresh(sel); changed(); pane(); evt("ob-track"); return; }
    if (b.dataset.tkk != null) { tkK = +b.dataset.tkk; pane(); return; }
    if (b.hasAttribute("data-tknew") && sel >= 0) { if ((B.tk || []).length >= OB.TK) { ctx.toast(esc(T("A course holds up to {n} animations", { n: OB.TK }))); return; } push(); B.tk = [...(B.tk || []), [sel, 1, 1, [[0, 0, 0, 0, 0], [2, 0, 2, 0, 0]]]]; tkK = 1; changed(); pane(); evt("ob-track"); return; }
    if ((b.hasAttribute("data-tkadd") || b.hasAttribute("data-tkkdel") || b.hasAttribute("data-tkplay")) && sel >= 0) { const t = (B.tk || []).find((x) => x[0] === sel); if (!t) return;
      if (b.hasAttribute("data-tkplay")) { tkPrev = { i: sel, t0: performance.now() }; selBox.visible = false; gizmo.root.visible = false; dirty = true; return; }
      push(); if (b.hasAttribute("data-tkadd")) { if (t[3].length >= OB.KEYS) { undo.pop(); return; } const k0 = t[3][tkK], nx = t[3][tkK + 1], nk = k0.slice(); nk[0] = nx ? Math.round(((k0[0] + nx[0]) / 2) * 4) / 4 : Math.min(60, k0[0] + 1); t[3].splice(tkK + 1, 0, nk); tkK++; }
      else { if (t[3].length <= 2) { undo.pop(); return; } t[3].splice(tkK, 1); tkK = Math.max(0, tkK - 1); }
      changed(); pane(); return; }
    if (b.hasAttribute("data-tkdel") && sel >= 0) { push(); B.tk = (B.tk || []).filter((t) => t[0] !== sel); refresh(sel); changed(); pane(); return; }
    if (b.hasAttribute("data-newgrp") && sel >= 0) { const used = new Set([...B.o.map((q) => q[11]), ...(B.gn || []).map((x) => x[0])]); let g = 0; for (let i = 1; i <= OB.G; i++) if (!used.has(i)) { g = i; break; } if (!g) { ctx.toast(esc(T("No free group left"))); return; }
      push(); B.o[sel][11] = g; B.gn = [...(B.gn || []), [g, T(NAMES[B.o[sel][0]]) + " " + g, 0]]; refresh(sel); changed(); pane(); return; }
    // G2 the hierarchy and prefabs
    if (b.dataset.gsel) { const g = +b.dataset.gsel, U = under(g), I = B.o.map((q, j) => (U.has(q[11]) ? j : -1)).filter((j) => j >= 0); if (I.length) { sel = I[0]; msel.clear(); I.forEach((j) => msel.add(j)); selShow(); focusSel(); ctx.toast("✥ " + esc(T("{n} pieces picked — drag the gizmo to move them together", { n: I.length }))); } pane(); return; }
    if (b.hasAttribute("data-mclr")) { msel.clear(); selShow(); pane(); return; }
    if (b.hasAttribute("data-madd")) { madd = !madd; selShow(); ctx.toast(esc(T(madd ? "Tap more pieces to add them to the pick" : "One piece at a time again"))); return; }
    if (b.dataset.gmv) return groupOp("mv", +b.dataset.gmv, b.dataset.ax, +b.dataset.d);
    if (b.dataset.grot) return groupOp("rot", +b.dataset.grot); if (b.dataset.gdup) return groupOp("dup", +b.dataset.gdup);
    if (b.dataset.gdel) { if (await ask(T, T("Delete this group and every piece in it?"), { ok: T("Delete"), danger: true })) groupOp("del", +b.dataset.gdel); return; }
    if (b.dataset.gren) { const g = +b.dataset.gren, f = await askForm(T("Rename"), [["name", T("Name"), gName(g)]]); if (!f || !f.name) return; push(); const gn = (B.gn || []).filter((x) => x[0] !== g), old = (B.gn || []).find((x) => x[0] === g); B.gn = [...gn, [g, f.name.slice(0, 24), old ? old[2] : 0]]; changed(); pane(); return; }
    if (b.dataset.gpar) { const g = +b.dataset.gpar, mine = under(g), opts = [["0", T("— top level —")], ...[...new Set([...(B.gn || []).map((x) => x[0]), ...B.o.map((q) => q[11]).filter(Boolean)])].filter((h) => !mine.has(h)).map((h) => [String(h), gName(h)])];
      const f = await askForm(T("Put inside another group"), [["par", T("Parent"), "0", opts]]); if (!f) return; push(); const old = (B.gn || []).find((x) => x[0] === g); B.gn = [...(B.gn || []).filter((x) => x[0] !== g), [g, old ? old[1] : gName(g), +f.par || 0]]; changed(); pane(); return; }
    if (b.dataset.gpf) return savePrefab(+b.dataset.gpf);
    if (b.dataset.pfb) return placeAt(PREFABS[b.dataset.pfb], b.dataset.pfb);
    if (b.dataset.pfm != null && ctx.prefabs) { const P = ctx.prefabs.mine()[+b.dataset.pfm]; if (P) placeAt(P, P.id || P.from || ""); return; }
    if (b.hasAttribute("data-pfload") && ctx.prefabs) { if (pfBusy) return; pfBusy = true; pfStore = await ctx.prefabs.list(pfQ).catch(() => null); pfBusy = false; pane(); return; }
    if (b.dataset.pfs && ctx.prefabs && pfStore) { const c = (pfStore.items || []).find((x) => x.id === b.dataset.pfs); if (!c) return;
      if (c.price && !(pfStore.owned || []).includes(c.id) && !(await ask(T, T("Buy “{n}” for {p} ARCL? {l}", { n: c.n, p: c.price.toLocaleString(), l: T(LICN[c.lic][1]) }), { ok: T("Buy") }))) return;
      const r = await ctx.prefabs.get(c); if (!r || !r.ok) { ctx.toast("⚠️ " + esc((r && r.error) || T("Couldn't get it"))); return; } if (c.price) pfStore.owned = [...(pfStore.owned || []), c.id];
      ctx.prefabs.keep({ ...r.prefab.pf, id: c.id, lic: c.lic, by: c.by }); placeAt(r.prefab.pf, c.id); return; }
    if (b.dataset.col != null && sel >= 0) { push(); B.o[sel][8] = +b.dataset.col; refresh(sel); changed(); pane(); return; }
    if (b.dataset.grp != null && sel >= 0) { push(); B.o[sel][11] = +b.dataset.grp; refresh(sel); changed(); pane(); return; }
    if (b.dataset.hg) { push(); const n = +b.dataset.hg; B.hg = B.hg.includes(n) ? B.hg.filter((x) => x !== n) : [...B.hg, n]; changed(); pane(); return; }
    if (b.hasAttribute("data-radd")) { push(); B.lg.push(lv === "graph" ? ["start", 0, "say", 0, 0] : ["coins", 10, "open", 1, 0]); changed(); pane(); evt("ob-logic"); return; }
    if (b.dataset.rdel != null) { push(); B.lg.splice(+b.dataset.rdel, 1); changed(); pane(); return; }
    if (b.dataset.lt != null) { push(); for (const r of LOGIC_T[+b.dataset.lt][1]) if (B.lg.length < OB.LG) B.lg.push(r.slice());  B.lg = cleanObby(B).lg; changed(); pane(); evt("ob-logic"); ctx.toast("⚙️ " + esc(T("Rules added — check the channels and groups match your pieces"))); return; }
    if (b.hasAttribute("data-sapply")) { const r = obParse(el.querySelector("[data-script]").value); push(); B.lg = r.lg; changed(); pane(); if (r.errs.length) { const s = el.querySelector(".wse-serr"); if (s) s.textContent = T("Lines not understood: {l}", { l: r.errs.join(", ") }); } else ctx.toast("✓ " + esc(T("{n} rules", { n: r.lg.length }))); return; }
    if (b.dataset.look) { push(); B.lk = b.dataset.look; rebuild(); changed(); pane(); evt("ob-look"); return; }
    if (b.hasAttribute("data-aimake") || b.hasAttribute("data-aitweak") || b.dataset.aiq) { const ta = el.querySelector("[data-ai]"), text = b.dataset.aiq || (ta && ta.value.trim()); if (!text) return; director(text, !b.hasAttribute("data-aimake")); return; }
    if (b.dataset.prop != null) { addAt("x"); if (sel >= 0 && B.o[sel][0] === "x") { B.o[sel][9] = +b.dataset.prop; const h = OB.PROPS[+b.dataset.prop][2]; B.o[sel][6] = h; B.o[sel][5] = B.o[sel][7] = Math.max(1, h * 0.6); refresh(sel); marks(); changed(); pane(); } return; }
    if (b.hasAttribute("data-amake") && ctx.assets) { const ta = el.querySelector("[data-asset]"), text = ta && ta.value.trim(); if (!text) return; const st = el.querySelector(".wse-astat"); b.disabled = true; if (st) st.textContent = "⏳ " + T("Meshy is making it — about a minute"); const r = await ctx.assets.make(text); b.disabled = false; if (st) st.textContent = r && r.ok ? "✓ " + T("Started") : "⚠️ " + ((r && r.error) || T("Couldn't start")); pane(); return; }
    if (b.dataset.myasset && ctx.assets) { let ai = B.as.indexOf(b.dataset.myasset); if (ai < 0) { if (B.as.length >= OB.AS) { ctx.toast(esc(T("A course holds up to {n} of your assets", { n: OB.AS }))); return; } B.as.push(b.dataset.myasset); ai = B.as.length - 1; } addAt("X"); if (sel >= 0 && B.o[sel][0] === "X") { B.o[sel][9] = ai; refresh(sel); changed(); pane(); } return; }
  }
  async function onInput(e) {
    const f = e.target; if (!f || !el) return;
    if (f.hasAttribute("data-sc")) { if (sel < 0) return; const x = xOf(sel), r = edParse(f.value, x.id || 1), ul = el.querySelector(".wse-scerr"); if (ul) ul.innerHTML = r.errs.map((e2) => `<li>${esc(T("Line {n}", { n: e2.line }))}: ${esc(e2.msg)}</li>`).join("") || `<li class="ok">✓ ${esc(T("{n} rules from this script", { n: r.lg.length }))}</li>`; if (e.type === "change") { push(); x.sc = f.value.slice(0, 800); changed(); } return; }
    if (f.hasAttribute("data-tq")) { treeQ = f.value.trim().slice(0, 30); paintTree(); return; }
    if (e.type === "input" && f.tagName === "TEXTAREA") return; if (e.type === "input" && f.type === "number") return; // (numbers apply on change)
    if (f.hasAttribute("data-snapv")) { const v = f.value; snap = v !== "off"; snapV = v === "off" ? 0 : +v; return; }
    if (f.hasAttribute("data-cadd")) { const c2 = f.value; f.value = ""; if (c2 && sel >= 0) addComp(sel, c2); return; }
    if (f.dataset.cf && sel >= 0) { const [c2, j] = f.dataset.cf.split(":"); push(); const x = xOf(sel); if (!x[c2]) return; x[c2][+j] = f.type === "checkbox" ? (f.checked ? 1 : 0) : Number(f.value) || 0; B = cleanObby(B); refresh(sel); marks(); changed(); if (f.tagName === "SELECT" || f.type === "checkbox") pane(); return; }
    if (f.dataset.xf && sel >= 0) { const k2 = f.dataset.xf; push(); const x = xOf(sel), on = k2 === "lk" ? f.checked : !f.checked; if (on) x[k2] = 1; else delete x[k2]; xTidy(sel); B = cleanObby(B); refresh(sel); marks(); changed(); pane(); return; }
    if (f.hasAttribute("data-nm") && sel >= 0) { if (e.type !== "change") return; push(); const x = xOf(sel), v = f.value.replace(/[<>]/g, "").trim().slice(0, 24); if (v) x.n = v; else delete x.n; xTidy(sel); changed(); paintTree(); return; }
    if ((f.dataset.gw || f.dataset.gwa) && e.type === "change") { const key2 = f.dataset.gw || f.dataset.gwa, [w0, a0] = key2.split(":"); push(); for (const r of B.lg) if (r[0] === w0 && (NOARG_W.has(w0) || String(r[1]) === a0)) { if (f.dataset.gw) r[0] = f.value; else r[1] = Number(f.value) || 0; } B.lg = cleanObby(B).lg; changed(); pane(); return; }
    if ((f.dataset.gt || f.dataset.gta || f.dataset.gag) && e.type === "change") { const i = +(f.dataset.gt || f.dataset.gta || f.dataset.gag), r = B.lg[i]; if (!r) return; push(); if (f.dataset.gt) r[2] = f.value; else if (f.dataset.gta) r[3] = Number(f.value) || 0; else r[4] = f.checked ? 1 : 0; B.lg = cleanObby(B).lg; changed(); pane(); return; }
    if (f.dataset.gc != null && e.type === "change") { const nd = f.closest("[data-gr]"), r = nd && B.lg[+nd.dataset.gr]; if (!r || !r[5]) return; push(); r[5][+f.dataset.gc] = Number(f.value) || 0; B.lg = cleanObby(B).lg; changed(); pane(); return; }
    if (f.dataset.f === "hp" || f.dataset.f === "tl" || f.dataset.f === "lp" || f.dataset.f === "gv") { push(); B[f.dataset.f] = Number(f.value) || 0; B.hp = Math.max(0, Math.min(5, B.hp)); B.tl = Math.max(0, Math.min(900, B.tl)); B.lp = Math.max(1, Math.min(5, B.lp || 1)); B.gv = Math.max(30, Math.min(200, B.gv || 100)); marks(); changed(); return; }
    if (f.hasAttribute("data-win")) { push(); B.win = f.value; marks(); changed(); return; }
    if (f.hasAttribute("data-sv")) { push(); B.sv = f.checked ? 1 : 0; changed(); return; }
    if (f.dataset.kf != null && sel >= 0) { const t = (B.tk || []).find((x) => x[0] === sel), k = t && t[3][tkK]; if (!k) return; const fi = +f.dataset.kf, lim = [[0, 60], [-40, 40], [-20, 40], [-40, 40], [-720, 720]][fi];
      push(); k[fi] = Math.max(lim[0], Math.min(lim[1], Number(f.value) || 0)); if (fi === 4) k[4] = Math.round(k[4]); t[3].sort((a, c) => a[0] - c[0]); tkK = t[3].indexOf(k); changed(); pane(); return; }
    if ((f.hasAttribute("data-tkl") || f.hasAttribute("data-tka")) && sel >= 0) { const t = (B.tk || []).find((x) => x[0] === sel); if (!t) return; push(); t[f.hasAttribute("data-tkl") ? 1 : 2] = f.checked ? 1 : 0; changed(); return; }
    if (f.hasAttribute("data-pfq")) { pfQ = f.value.trim().slice(0, 40); if (e.type === "change" && ctx.prefabs) { pfStore = await ctx.prefabs.list(pfQ).catch(() => null); pane(); } return; }
    if (f.dataset.f != null && sel >= 0) { const i = f.dataset.f; push(); const q = B.o[sel]; if (/^\d+$/.test(i)) { const n = +i; q[n] = f.type === "checkbox" ? (f.checked ? 1 : 0) : Number(f.value) || 0; if (q[0] === "y" && (n === 5 || n === 7)) q[5] = q[7] = q[n]; }
      B.o[sel] = cleanObby({ o: [q] }).o.find((x) => x[0] === q[0]) || q; if (B.o[sel][0] === "y") B.o[sel][7] = B.o[sel][5]; refresh(sel); marks(); changed(); if (f.tagName === "SELECT" || f.type === "checkbox") pane(); return; }
    const row = f.closest(".wse-rule"); if (row) { const i = +row.dataset.ri, r = B.lg[i], k = +f.dataset.r; push(); r[k] = f.type === "checkbox" ? (f.checked ? 1 : 0) : k === 0 || k === 2 ? f.value : Number(f.value) || 0; B.lg = cleanObby(B).lg; changed(); if (k === 0 || k === 2) pane(); return; }
    if (f.hasAttribute("data-bp")) { push(); B.bp = f.checked ? 1 : 0; rebuild(); changed(); return; }
    if (f.hasAttribute("data-q")) { push(); B.q = +f.value; changed(); return; } if (f.hasAttribute("data-vl")) { push(); B.vl = +f.value; changed(); return; }
    for (const kk of ["ui", "cn", "av"]) if (f.dataset[kk]) { push(); const bit = +f.dataset[kk]; B[kk] = f.checked ? B[kk] | bit : B[kk] & ~bit; changed(); return; }
  }
  // ---------------- ED1: the Scene tree (folders = groups, every piece an entity), drag and drop ----------------
  function paintTree() {
    const box = el && el.querySelector(".wse-tl2"); if (!box) return; const E = entsOf(B), gn = B.gn || [], q0 = treeQ.toLowerCase();
    const ent = (e, d) => { const x = B.o[e.i][12] || {}, nC = Object.keys(CMP).filter((c2) => x[c2] != null).length;
      return `<div class="wse-er${sel === e.i || msel.has(e.i) ? " on" : ""}${x.eh ? " off" : ""}" draggable="true" data-ent="${e.i}" style="--d:${d}"><button type="button" class="wse-eb" data-eye="${e.i}" title="${esc(T(x.eh ? "Show in the editor" : "Hide in the editor"))}">${x.eh ? "◌" : "👁"}</button><button type="button" class="wse-eb" data-lock="${e.i}" title="${esc(T(x.lk ? "Unlock" : "Lock"))}">${x.lk ? "🔒" : "·"}</button><button type="button" class="wse-en" data-pick="${e.i}"><i>${ICONS[e.c.kind]}</i><span>${esc(e.name)}</span>${nC ? `<em>⚙${nC}</em>` : ""}${x.id ? `<small>#${x.id}</small>` : ""}</button></div>`; };
    if (q0) { const hit = E.filter((e) => e.name.toLowerCase().includes(q0) || T(NAMES[e.c.kind]).toLowerCase().includes(q0)); box.innerHTML = hit.map((e) => ent(e, 0)).join("") || `<p class="wse-empty">${esc(T("Nothing matches."))}</p>`; return; }
    const folds = [...new Set([...gn.map((x) => x[0]), ...B.o.map((q) => q[11]).filter(Boolean)])], parOf = (g) => (gn.find((x) => x[0] === g) || [0, "", 0])[2];
    const fold = (g, d) => { const kids = folds.filter((h) => parOf(h) === g && h !== g), mine = E.filter((e) => e.parent === g), pf = ((B.pi || []).find((p2) => p2[0] === g) || [])[1];
      return `<div class="wse-fr" draggable="true" data-fold="${g}" style="--d:${d}"><button type="button" data-gsel="${g}"><i>${pf ? "🧩" : "📁"}</i><b>${esc(gName(g))}</b><small>${mine.length}</small></button></div>${kids.map((h) => fold(h, d + 1)).join("")}${mine.map((e) => ent(e, d + 1)).join("")}`; };
    const roots = folds.filter((g) => !parOf(g) || !folds.includes(parOf(g)));
    box.innerHTML = `<div class="wse-fr root" data-fold="0" style="--d:0"><span><i>🌍</i><b>${esc(T("World"))}</b><small>${B.o.length}/${OB.MAX}</small></span></div>${roots.map((g) => fold(g, 1)).join("")}${E.filter((e) => !e.parent || !folds.includes(e.parent)).map((e) => ent(e, 1)).join("")}`;
    const on = box.querySelector(".wse-er.on"); if (on && on.scrollIntoView && !box.matches(":hover")) on.scrollIntoView({ block: "nearest" }); }
  let drag = null;
  function onDrag(e) { const t = e.target.closest && e.target.closest("[data-add],[data-set],[data-ent],[data-fold]"); if (!t) return; drag = t.dataset.add ? { add: t.dataset.add } : t.dataset.set ? { set: t.dataset.set } : t.dataset.ent != null ? { ent: +t.dataset.ent } : { fold: +t.dataset.fold };
    try { e.dataTransfer.setData("text/plain", JSON.stringify(drag)); e.dataTransfer.effectAllowed = "copyMove"; } catch { /* (some browsers) */ } }
  function onOver(e) { if (!drag) return; const f = e.target.closest && e.target.closest("[data-fold]"), overCv = e.target === cv;
    if ((overCv && (drag.add || drag.set)) || (f && (drag.ent != null || drag.fold != null))) { e.preventDefault(); el.querySelectorAll(".wse-fr.drop").forEach((x) => x.classList.remove("drop")); if (f) f.classList.add("drop"); } }
  function onLeave(e) { const f = e.target.closest && e.target.closest("[data-fold]"); if (f) f.classList.remove("drop"); }
  function onDrop(e) { const d = drag; drag = null; el.querySelectorAll(".wse-fr.drop").forEach((x) => x.classList.remove("drop")); if (!d) return; e.preventDefault();
    if (e.target === cv) { if (d.add) addAt(d.add, ndc(e)); else if (d.set) applySet(d.set, ndc(e)); return; }
    const f = e.target.closest && e.target.closest("[data-fold]"); if (!f) return; const g = +f.dataset.fold;
    if (d.ent != null) { const M = msel.has(d.ent) || sel === d.ent ? many() : [d.ent]; push(); for (const i of M) if (B.o[i]) B.o[i][11] = g; rebuild(); changed(); pane(); evt("ob-tree"); return; } // (re-parent: the piece into that folder)
    if (d.fold != null && d.fold !== g && !under(d.fold).has(g)) { push(); const old = (B.gn || []).find((x) => x[0] === d.fold); B.gn = [...(B.gn || []).filter((x) => x[0] !== d.fold), [d.fold, old ? old[1] : gName(d.fold), g]]; changed(); pane(); } }
  async function onDbl(e) { const t = e.target.closest && e.target.closest("[data-pick],[data-gsel]"); if (!t) return;
    if (t.dataset.pick != null) { const i = +t.dataset.pick, f = await askForm(T("Rename"), [["name", T("Name"), (entsOf(B)[i] || {}).name || ""]]); if (!f || !f.name) return; push(); const x = xOf(i); x.n = f.name.replace(/[<>]/g, "").slice(0, 24); changed(); pane(); return; }
    const g = +t.dataset.gsel, f = await askForm(T("Rename"), [["name", T("Name"), gName(g)]]); if (!f || !f.name) return; push(); const old = (B.gn || []).find((x) => x[0] === g); B.gn = [...(B.gn || []).filter((x) => x[0] !== g), [g, f.name.slice(0, 24), old ? old[2] : 0]]; changed(); pane(); }
  function focusNear() { const q = B.o[sel]; if (!q) return; const d = Math.hypot(orbit.tx - q[1], orbit.tz - q[3]); if (d > orbit.dist * 0.6) focusSel(); }
  // ---------------- ED1: a piece's components ----------------
  const xOf = (i) => { const q = B.o[i]; if (!q[12] || typeof q[12] !== "object") { while (q.length < 12) q.push(0); q[12] = {}; } return q[12]; };
  const xTidy = (i) => { const q = B.o[i]; if (q && q[12] && !Object.keys(q[12]).length) q.length = 12; };
  function addComp(i, c2) { if (!B.o[i] || !CMP[c2]) return; if (CMP_CAP[c2] && B.o.filter((q) => q[12] && q[12][c2] != null).length >= CMP_CAP[c2]) { ctx.toast(esc(T("A course holds up to {n} of these", { n: CMP_CAP[c2] }))); return; }
    if (c2 === "sc" && phone()) return handoff("Scripts are easier with a keyboard.");
    push(); const x = xOf(i); x[c2] = c2 === "sc" ? "onTouch(player) {\n  say(\"Nice work!\")\n}" : CMP[c2][1].map((f) => f[3]);
    B = cleanObby(B); refresh(i); marks(); changed(); tab = "prop"; paintTabs(); pane(); evt("ob-comp"); ctx.toast(CICON[c2] + " " + esc(T("{c} added", { c: T(CMP[c2][0]) }))); }
  /// the palette's ready-made sets: a few pieces and the rules between them, where the view's middle (or the drop) lands
  function applySet(id, at) {
    ray.setFromCamera(at || new THREE.Vector2(0, 0), cam); const hit = ray.intersectObjects(objs, true).find(pickable); let p = hit ? hit.point : hitPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)) || new THREE.Vector3(orbit.tx, 0, orbit.tz);
    const X0 = clampAx(1, sn(p.x, 0.5)), Y0 = Math.max(0, clampAx(2, sn(p.y, 0.5))), Z0 = clampAx(3, sn(p.z, 0.5)), chUsed = new Set(B.o.filter((q) => q[0] === "d" || q[0] === "u").map((q) => q[9])), ch = [1, 2, 3, 4, 5, 6, 7, 8].find((c2) => !chUsed.has(c2)) || 1;
    const P = (k, dx, dy, dz, ex, o9, o10) => { const K = OB.K[k], O = OB.OPT[k] || []; const q = [k, X0 + dx, Y0 + dy, Z0 + dz, 0, K[1], K[2], K[3], k === "b" ? 0 : 1, o9 != null ? o9 : O[0] ? O[0][3] : 0, o10 != null ? o10 : O[1] ? O[1][3] : 0, 0]; if (ex) q.push(ex); return q; };
    if (id === "bossarena") return placeAt(PREFABS.bxarena || Object.values(PREFABS)[0], "bxarena");
    const add = id === "doorbtn" ? [P("b", 0, 0, 0, null), P("d", 0, 1, -1.75, null, ch, 0), P("u", 3, 1, 1, null, ch, 0)] : id === "platform" ? [P("b", 0, 0, 0, { n: T("Moving platform"), mv: [0, 8, 2] })]
      : id === "spawner" ? [P("y", 0, 0, 0, { n: T("Enemy spawner"), sw: [6, 3, 0], lt: [11, 2] })] : id === "breakwall" ? [P("b", 0, 0, 0, { n: T("Breakable wall"), hl: [3] })] : id === "checkpoint" ? [P("c", 0, 0, 0)] : [];
    if (id === "breakwall") { add[0][5] = 4; add[0][6] = 3; add[0][7] = 0.6; }
    if (B.o.length + add.length > OB.MAX) { ctx.toast(esc(T("A course holds up to {n} pieces", { n: OB.MAX }))); return; }
    push(); const n0 = B.o.length; B.o.push(...add); B = cleanObby(B); sel = Math.min(B.o.length - 1, n0); msel.clear(); for (let j = n0 + 1; j < B.o.length; j++) msel.add(j); rebuild(); changed(); tab = "prop"; paintTabs(); pane(); evt("ob-set");
    if (id === "doorbtn") ctx.toast("🚪 " + esc(T("Step on the button to open the door — they share channel {c}", { c: ch }))); }
  // ---------------- ED2: simulate in the view (the moving pieces move; stop puts everything back) ----------------
  function simToggle() { simOn = !simOn; simT0 = performance.now(); if (!simOn) rebuild(); else { selBox.visible = false; gizmo.root.visible = false; } el.querySelectorAll("[data-sim]").forEach((x) => x.classList.toggle("on", simOn)); if (simOn) evt("ob-sim"); dirty = true; }
  function simTick(t) {
    B.o.forEach((q, i) => { const o = objs[i]; if (!o) return; const k = q[0], X = q[12] || {}, tr = (B.tk || []).find((x) => x[0] === i); let dx = 0, dy = 0, dz = 0, rot = 0;
      if (tr) { const K = tr[3], last = K[K.length - 1][0], d = tkAt(K, tr[1] ? t % Math.max(0.1, last) : Math.min(t, last)); dx = d[0]; dy = d[1]; dz = d[2]; rot = d[3]; }
      else if (X.mv) { const [ax, dd, sp] = X.mv, w = (0.3 + sp * 0.35) * (6 / Math.max(3, dd)), s2 = (Math.sin(t * w) * dd) / 2; if (ax === 0) dx = s2; else if (ax === 1) dy = s2 + dd / 2; else dz = s2; }
      else if (k === "m") { const w = (spec.speed * 0.25 + 0.4) * (6 / Math.max(3, q[10])), s2 = (Math.sin(t * w) * q[10]) / 2; if (q[9] === 0) dx = s2; else if (q[9] === 1) dy = s2 + q[10] / 2; else dz = s2; }
      else if (k === "e") dy = (Math.sin(t * (0.6 + q[10] * 0.2) - Math.PI / 2) * 0.5 + 0.5) * q[9];
      if (X.sp) rot = (t * (0.5 + X.sp[0] * 0.45) * (X.sp[1] ? -1 : 1) * 180) / Math.PI; else if (k === "s") rot = (t * (0.6 + q[9] * 0.45) * (q[10] ? -1 : 1) * 180) / Math.PI; else if (k === "o" || k === "Q") rot = t * 150;
      if (!dx && !dy && !dz && !rot) return; o.position.set(q[1] + dx, q[2] + dy, q[3] + dz); o.rotation.y = R(q[4] + rot); if (instOf.has(i)) instPut(i); }); }
  // ---------------- ED2: the debug view — colliders, triggers, AI ranges and paths; the frame rate and the GPU's counts ----------------
  function dbgBuild() {
    if (dbgG) { scene.remove(dbgG); dbgG.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); }); dbgG = null; } if (!dbg) { dirty = true; return; }
    dbgG = new THREE.Group(); const L = { col: [], trg: [], ai: [], path: [] };
    const box = (arr, q, pad = 0, up = 0) => { const r = R(q[4]), c = Math.cos(r), s2 = Math.sin(r), hx = q[5] / 2 + pad, hz = (q[0] === "y" || q[0] === "H" ? q[5] : q[7]) / 2 + pad, y0 = q[2], y1 = q[2] + q[6] + up;
      const P = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [q[1] + a * c + b * s2, q[3] - a * s2 + b * c]);
      for (let j = 0; j < 4; j++) { const [ax, az] = P[j], [bx, bz] = P[(j + 1) % 4]; arr.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz, ax, y0, az, ax, y1, az); } };
    const circ = (arr, x, y, z, r, n = 40) => { for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2, b = ((j + 1) / n) * Math.PI * 2; arr.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r); } };
    B.o.forEach((q, i) => { const k = q[0], X = q[12] || {};
      if ((OB.K[k][0] || ((k === "x" || k === "X") && q[10])) && !X.nc) box(L.col, q);
      if ("kucgtRWQoh".includes(k) || X.tg || X.dm || X.pk || X.sn) box(L.trg, q, 0.25, 0.6);
      if (k === "E" || k === "B") circ(L.ai, q[1], q[2] + 0.1, q[3], 15); if (k === "E") circ(L.ai, q[1], q[2] + 0.1, q[3], 9); if (X.sw) circ(L.ai, q[1], q[2] + 0.1, q[3], 45, 64);
      const tr = (B.tk || []).find((t) => t[0] === i); if (tr) for (let j = 0; j < tr[3].length - 1; j++) { const a = tr[3][j], b = tr[3][j + 1]; L.path.push(q[1] + a[1], q[2] + a[2] + 0.5, q[3] + a[3], q[1] + b[1], q[2] + b[2] + 0.5, q[3] + b[3]); }
      const mv = X.mv || (k === "m" ? [q[9], q[10]] : null); if (mv) { const [ax, d] = mv; L.path.push(q[1] - (ax === 0 ? d / 2 : 0), q[2] + q[6] + 0.3, q[3] - (ax === 2 ? d / 2 : 0), q[1] + (ax === 0 ? d / 2 : 0), q[2] + q[6] + 0.3 + (ax === 1 ? d : 0), q[3] + (ax === 2 ? d / 2 : 0)); } });
    for (const [key, col] of [["col", 0x4fe3c1], ["trg", 0xffd23a], ["ai", 0xff4d5e], ["path", 0xb48cff]]) { if (!L[key].length) continue; const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(L[key], 3)); const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthTest: false })); m.renderOrder = 998; dbgG.add(m); }
    scene.add(dbgG); dirty = true; }
  function statPaint() { const st = el && el.querySelector(".wse-stat"); if (!st || !dbg || !rd) return; const I = rd.info.render, BU = obBudget(cleanObby(B));
    st.innerHTML = `<b>${fps} FPS</b><span>${(I.triangles / 1000).toFixed(1)}k ${esc(T("triangles"))} · ${I.calls} ${esc(T("draw calls"))}</span><span>${esc(T("In the game"))}: ~${(BU.tris / 1000).toFixed(1)}k · ${BU.batches} ${esc(T("instanced batches"))} · ${BU.lights} 💡</span><span class="wse-lg"><i style="--c:#4fe3c1"></i>${esc(T("colliders"))}<i style="--c:#ffd23a"></i>${esc(T("triggers"))}<i style="--c:#ff4d5e"></i>${esc(T("AI ranges"))}<i style="--c:#b48cff"></i>${esc(T("paths"))}</span>`; }
  // ---------------- ED5: version history on this device (the last 5), save, publish ----------------
  const HK = "arc.studio.edh." + String(ctx.histKey || spec.title || "draft").slice(0, 40);
  const hist = () => { try { return JSON.parse(localStorage.getItem(HK) || "[]"); } catch { return []; } };
  function histPush(now) { const t = Date.now(); if (!now && t - histT < 45000) return; histT = t; try { const L = hist(), cur = JSON.stringify(cleanObby(B)); if (L[0] && L[0].b === cur) return; localStorage.setItem(HK, JSON.stringify([{ at: t, n: B.o.length, b: cur }, ...L].slice(0, 5))); } catch { /* full or private */ } }
  function histOpen() { histPush(true); const L = hist(), f = document.createElement("div"); f.className = "wse-form";
    f.innerHTML = `<form><b>🕘 ${esc(T("Version history"))}</b><p class="wse-help">${esc(T("The last 5 versions on this device, kept as you work. Your saved games keep their own last 5 in My games."))}</p><ol class="wse-hl">${L.map((h, j) => `<li><span>${new Date(h.at).toLocaleString()}</span><small>${esc(T("{n} pieces", { n: h.n }))}</small>${j ? `<button type="button" class="wsb-b alt" data-hres="${j}">${esc(T("Restore"))}</button>` : `<em>${esc(T("now"))}</em>`}</li>`).join("")}</ol><span class="wse-acts"><button type="button" class="wsb-b" data-no>${esc(T("Close"))}</button></span></form>`;
    el.appendChild(f); f.addEventListener("click", (e2) => { const r = e2.target.closest("[data-hres]"); if (r) { const h = L[+r.dataset.hres]; if (h) { push(); B = JSON.parse(h.b); sel = -1; msel.clear(); rebuild(); changed(); pane(); ctx.toast("🕘 " + esc(T("Restored — Undo brings it back"))); } f.remove(); return; } if (e2.target === f || e2.target.closest("[data-no]")) f.remove(); }); }
  async function doSave() { histPush(true); if (!ctx.save) { ctx.toast(esc(T("Saved on this device"))); return; } const b0 = el.querySelector("[data-save]"); if (b0) b0.disabled = true; let ok = false; try { ok = await ctx.save(cleanObby(B)); } catch { ok = false; } if (b0) b0.disabled = false; if (ok) ctx.toast("💾 " + esc(T("Saved"))); }
  async function doPublish() { const c = cleanObby(B), BU = obBudget(c);
    if (BU.heavy && !(await ask(T, T("This game may run slowly on phones — {t} triangles (budget {m}), {l} lights, {v} moving pieces. Publish anyway, or make it lighter first?", { t: BU.tris.toLocaleString(), m: OB_BUDGET.tris.toLocaleString(), l: BU.lights, v: BU.moving }), { ok: T("Publish anyway"), cancel: T("Make it lighter") }))) return;
    const R0 = reach || obReach(c, spec); if (!R0.ok && !(await ask(T, T(winMsg(c)) + " — " + T("Publish anyway?"), { ok: T("Publish anyway"), cancel: T("Fix it first") }))) return;
    try { await ctx.onPublish(c); } catch { ctx.toast(esc(T("Couldn't open it — try again"))); } }
  /// ED1 (the owner: "on a phone, heavy work goes to the web Studio on a PC"): save the draft, hand over its link
  async function handoff(why) {
    const f = document.createElement("div"); f.className = "wse-form wse-pc";
    f.innerHTML = `<form><b>💻 ${esc(T("Continue on a PC"))}</b><p>${esc(T(why))}</p><p class="wse-help">${esc(T("We save your draft and give you a link — open it in ARCIRCLE Studio on a computer and carry on where you left off."))}</p><div class="wse-pcl">⏳ ${esc(T("Saving…"))}</div><span class="wse-acts"><button type="button" class="wsb-b" data-no>${esc(T("Keep editing here"))}</button></span></form>`;
    el.appendChild(f); let url = null;
    f.addEventListener("click", async (e2) => { if (e2.target === f || e2.target.closest("[data-no]")) { f.remove(); return; }
      if (e2.target.closest("[data-copy]") && url) { try { await navigator.clipboard.writeText(url); ctx.toast("✓ " + esc(T("Link copied"))); } catch { f.querySelector("input").select(); } }
      if (e2.target.closest("[data-shr]") && url) { try { await navigator.share({ title: "ARCIRCLE Studio", text: T("My 3D game draft — open it on a PC"), url }); } catch { /* closed */ } } });
    try { url = ctx.handoff ? await ctx.handoff(cleanObby(B)) : null; } catch { url = null; }
    const bx = f.querySelector(".wse-pcl"); if (!bx) return;
    bx.innerHTML = url ? `<input readonly value="${esc(url)}" aria-label="${esc(T("Link"))}"><button type="button" class="wsb-b go" data-copy>${esc(T("Copy link"))}</button>${navigator.share ? `<button type="button" class="wsb-b alt" data-shr>${esc(T("Share"))}</button>` : ""}` : esc(T("Sign in to send it to your PC — a draft on this phone stays on this phone.")); evt("ob-handoff"); }
  // the logic graph's ports: drag an event's port onto an action → that rule moves onto the event
  function onPort(e) { const pt = e.target.closest && e.target.closest(".wng-p.out[data-pev]"); if (!pt) return; e.preventDefault(); const key2 = pt.dataset.pev; pt.classList.add("drag");
    const up = (e2) => { removeEventListener("pointerup", up, true); pt.classList.remove("drag"); const tgt = document.elementFromPoint(e2.clientX, e2.clientY), nd = tgt && tgt.closest && tgt.closest(".wng-n.ac[data-gr]"); if (!nd) return; const r = B.lg[+nd.dataset.gr]; if (!r) return; const [w, a] = key2.split(":"); push(); r[0] = w; r[1] = +a; B.lg = cleanObby(B).lg; changed(); pane(); };
    addEventListener("pointerup", up, true); }
  /// OB6 the director: a new course from a sentence, or a change to this one; the agent's model (ctx.director) when there is one, the rules otherwise
  async function director(text, tweak) {
    chat.push({ me: true, t: text }); pane(); evt("ob-ai");
    let out = null; if (ctx.director) try { out = await ctx.director(text, tweak ? cleanObby(B) : null, spec); } catch { out = null; }
    push();
    if (tweak) { const r = out && out.build ? { build: out.build, did: out.did || ["changes"] } : obTweak(clampSpec({ ...spec, build: cleanObby(B) }), text); B = JSON.parse(JSON.stringify(r.build)); chat.push({ t: r.did.length ? "✓ " + r.did.map((d) => T(DID[d] || d)).join(" · ") : T("I couldn't tell what to change — try “add a boss” or “harder ending”.") }); }
    else { const w = obWants(text); if (w.theme) spec = clampSpec({ ...spec, theme: w.theme }); const sp = clampSpec({ ...spec, speed: Math.max(1, Math.min(5, spec.speed + w.hard)), walls: Math.max(0, Math.min(5, spec.walls + w.hard)), lasers: Math.max(0, Math.min(3, spec.lasers + (w.hard > 0 ? 1 : 0))), seed: (spec.seed * 7 + text.length * 13) % 999999 || 1 });
      B = out && out.build ? out.build : genObbyBuild(sp, w); chat.push({ t: "✨ " + T("A course with {n} pieces", { n: B.o.length }) + [w.boss && T("a boss"), w.shop && T("a shop"), w.doors && T("doors and buttons"), w.elevator && T("an elevator"), w.look && T((LOOKS[w.look] || {}).name || "")].filter(Boolean).map((x) => " · " + x).join("") }); }
    sel = -1; MT = obMats(THREE, THEMES[spec.theme] || THEMES.neon, LOOKS[B.lk]); rebuild(); focusAll(); changed(); pane();
  }
  const DID = { boss: "Added a boss arena before the goal", harder: "Made the ending harder", easier: "Made it easier", coins: "Added coins along the way", shop: "Added a shop", checkpoints: "Added checkpoints", spinners: "Added spinners", timer: "Added a timer", look: "Changed the look", changes: "Changed it" };
  return { open, close, state: () => ({ B, sel, mode }), select: (i) => { sel = i; selShow(); pane(); }, add: addAt, setMode, dup, del, director, spec: () => spec, est: () => est || estimate(clampSpec({ ...spec, build: cleanObby(B) })) };
}
