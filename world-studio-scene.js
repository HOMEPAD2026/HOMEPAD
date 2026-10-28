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
import { OB, PF, PREFABS, clampSpec, cleanObby, estimate, obReach, obScript, obParse, genObbyBuild, obWants, obTweak, packPrefab, placePrefab, cleanPrefab, THEMES } from "./world-studio-gen.js";
import { LOOKS, obGeos, obMats, obSurfaces } from "./world-studio-obby.js";

const NAMES = { b: "Block", r: "Ramp", y: "Round platform", k: "Lava", s: "Spinner", m: "Moving platform", p: "Jump pad", c: "Checkpoint", S: "Start", g: "Goal", o: "Coin", h: "Heart", d: "Door", u: "Button", e: "Elevator", t: "Teleporter", n: "Shop", B: "Boss", x: "Prop", X: "My asset", E: "Enemy", R: "Race ring", Q: "Gem", H: "Hill", W: "Water", P: "Crate", A: "Character" };
const ICONS = { b: "🧱", r: "📐", y: "⭕", k: "🌋", s: "🌀", m: "↔️", p: "🦘", c: "🚩", S: "🟢", g: "🏁", o: "🪙", h: "❤️", d: "🚪", u: "🔘", e: "🛗", t: "🌀", n: "🛒", B: "👑", x: "🌳", X: "✨", E: "👾", R: "💫", Q: "💎", H: "⛰️", W: "🌊", P: "📦", A: "🧑" };
const PAL = [["Build", ["b", "r", "y"]], ["Terrain", ["H", "W", "P"]], ["Hazards", ["k", "s"]], ["Motion", ["m", "e", "p"]], ["Smart", ["d", "u", "t", "n"]], ["Combat", ["E", "B"]], ["Race & explore", ["R", "Q", "A"]], ["Course", ["S", "c", "g", "o", "h"]], ["Decor", ["x"]]];
const WHEN_N = { start: "The run starts", button: "Button on channel", coins: "Coins at least", every: "Every N seconds", after: "After N seconds", varA: "Counter A at least", varB: "Counter B at least", phase: "Phase becomes", bosshalf: "The boss at half health", boss: "The boss falls", checkpoint: "Checkpoint number", enemies: "Every enemy defeated", collect: "Gems collected at least", ring: "Race ring number" };
const THEN_N = { open: "Open channel", close: "Close channel", toggle: "Toggle channel", say: "Show a message", addA: "Add to counter A", addB: "Add to counter B", setA: "Set counter A", setB: "Set counter B", phase: "Go to phase", show: "Show group", hide: "Hide group", heart: "Give hearts", coins: "Give coins", time: "Add seconds", speed: "Speed boost (s)", win: "Win the game", hurt: "Lose a heart", track: "Play animation track", cutscene: "Play the cutscene" };
const NOARG_W = new Set(["start", "bosshalf", "boss", "enemies"]), NOARG_T = new Set(["win", "hurt", "cutscene"]);
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
  let G = null, MT = null, objs = [], grid = null, bp = null, gizmo = null, selBox = null, redBoxes = null, chat = [];
  const R = (d) => (d * Math.PI) / 180;
  // ---------------- open / close ----------------
  function open() {
    el = document.createElement("div"); el.className = "wsb wse"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in"><header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>${esc(T("3D editor"))}</b>
      <span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}">↩</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}">↪</button>
      <button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test from here"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wse-main"><aside class="wse-pal">${PAL.map(([g, ks]) => `<small>${esc(T(g))}</small>${ks.map((k) => `<button type="button" data-add="${k}" title="${esc(T(NAMES[k]))}"><i>${ICONS[k]}</i><span>${esc(T(NAMES[k]))}</span></button>`).join("")}`).join("")}</aside>
        <div class="wse-view"><canvas class="wse-cv"></canvas><nav class="wse-modes">${[["move", "✥", "Move (W)"], ["rot", "⟳", "Turn (E)"], ["scale", "⤢", "Size (R)"]].map(([m, ic, n]) => `<button type="button" data-mode="${m}" title="${esc(T(n))}">${ic}<span>${esc(T(n.replace(/ \(.\)$/, "")))}</span></button>`).join("")}<i></i><button type="button" data-dup title="${esc(T("Duplicate (Ctrl+D)"))}">⧉<span>${esc(T("Copy"))}</span></button><button type="button" data-del title="${esc(T("Delete"))}">🗑<span>${esc(T("Delete"))}</span></button><button type="button" data-madd title="${esc(T("Pick more pieces (or Shift + click)"))}">⊕<span>${esc(T("Multi"))}</span></button><button type="button" data-snap title="${esc(T("Snap"))}">#<span>${esc(T("Snap"))}</span></button><button type="button" data-focus title="${esc(T("Focus (F)"))}">◎<span>${esc(T("Focus"))}</span></button></nav>
          <p class="wse-hint">${esc(T(ctx.coarse ? "Tap a piece to pick it · drag empty space to look around · pinch to zoom" : "Click a piece to pick it · drag empty space to orbit · right-drag to pan · wheel to zoom"))}</p></div>
        <aside class="wse-side"><nav class="wse-tabs">${[["prop", "Properties"], ["game", "Game"], ["scene", "Scene"], ["logic", "Logic"], ["look", "Look & UI"], ["ai", "Director"], ["assets", "Assets"]].map(([k, n]) => `<button type="button" data-tab="${k}">${esc(T(n))}</button>`).join("")}</nav><div class="wse-pane"></div></aside></div></div>`;
    document.body.appendChild(el); cv = el.querySelector(".wse-cv");
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onInput);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", pu); cv.addEventListener("wheel", wheel, { passive: false }); cv.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", key, true); addEventListener("resize", fit);
    setup(); fit(); rebuild(); focusAll(); paintTabs(); pane(); bar(); loop();
  }
  function close(done) {
    cancelAnimationFrame(raf); removeEventListener("keydown", key, true); removeEventListener("resize", fit); clearTimeout(estT);
    if (scene) scene.traverse((m) => { if (m.geometry && !Object.values(G).includes(m.geometry)) m.geometry.dispose(); if (m.material && !(MT && MT.all().includes(m.material))) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose && x.dispose()); });
    if (G) Object.values(G).forEach((g) => g.dispose()); if (MT) MT.all().forEach((m) => m.dispose());
    if (rd) { rd.dispose(); try { rd.forceContextLoss(); } catch { /* fine */ } rd = null; }
    if (el) el.remove(); el = null; if (done) ctx.onDone(cleanObby(B)); if (ctx.onClose) ctx.onClose();
  }
  const evt = (k) => { try { if (ctx.ev) ctx.ev(k); } catch { /* fine */ } };
  const changed = () => { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (the Studio's autosave) */ } est = null; clearTimeout(estT); estT = setTimeout(() => { bar(); }, 250); };
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
  function loop() { raf = requestAnimationFrame(loop);
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
    if (k === "b" || k === "y" || k === "r") { const me = add(k === "y" ? G.cyl : k === "r" ? G.wedge : G.box, MT.get(c, a), sx, sy, k === "y" ? sx : sz); if (!(B.tk || []).some((t) => t[0] === i)) { me.layers.set(1); g.userData.ik = k + ":" + c + ":" + a; g.userData.im = me; } } // (drawn by the instanced meshes below; this one is only picked)
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
    gizmo.root.rotation.y = mode === "scale" ? R(q[4]) : 0; const s = cam.position.distanceTo(gizmo.root.position) * 0.075; gizmo.root.scale.setScalar(Math.max(0.6, s));
    for (const k of ["move", "rot", "scale"]) gizmo.parts[k].visible = mode === k; }
  // ---------------- pointer: pick, drag a handle, orbit, pan, pinch ----------------
  const ptrs = new Map(); let act = null, downAt = null;
  const ndc = (e) => { const r = cv.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const ray = new THREE.Raycaster(); ray.layers.enableAll(); // (the instanced pieces' pick meshes live on layer 1)
  function pd(e) {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; act = { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; return; }
    ray.setFromCamera(ndc(e), cam);
    if (sel >= 0 && gizmo.root.visible) { const hit = ray.intersectObjects(gizmo.handles.filter((h) => { let p = h; while (p && p !== gizmo.root) { if (p.visible === false) return false; p = p.parent; } return true; }), false)[0];
      if (hit) { const h = hit.object.userData.h, q = B.o[sel], M = many(); push(); act = { kind: h.kind, h, q0: q.slice(), o: new THREE.Vector3(q[1], q[2], q[3]) };
        if (M.length > 1 && h.kind !== "scale") { act.many = M.map((i) => [i, B.o[i].slice()]); if (h.kind === "rot") { const xs = M.map((i) => B.o[i][1]), zs = M.map((i) => B.o[i][3]); act.o.set((Math.min(...xs) + Math.max(...xs)) / 2, q[2], (Math.min(...zs) + Math.max(...zs)) / 2); } } act.plane = planeFor(h, act.o); act.p0 = hitPlane(act.plane); if (!act.p0) act = null; return; } }
    act = { kind: e.button === 2 || e.button === 1 || e.shiftKey ? "pan" : "orbit", x: e.clientX, y: e.clientY };
  }
  function planeFor(h, o) { const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    if (h.kind === "flat" || h.kind === "rot") return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), o);
    const ax = h.kind === "scale" ? h.axis.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), R(B.o[sel][4])) : h.axis.clone(), n = ax.clone().cross(camDir).cross(ax).normalize(); if (n.lengthSq() < 1e-6) n.copy(camDir); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, o); }
  function hitPlane(pl) { const p = new THREE.Vector3(); return ray.ray.intersectPlane(pl, p) ? p : null; }
  const sn = (v, st) => (snap ? Math.round(v / st) * st : Math.round(v * 4) / 4);
  function pm(e) {
    if (!ptrs.has(e.pointerId)) return; const last = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!act) return;
    if (act.kind === "pinch" && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; orbit.dist = Math.max(6, Math.min(220, orbit.dist * (act.d / Math.max(10, d)))); panBy(mx - act.mx, my - act.my); act.d = d; act.mx = mx; act.my = my; dirty = true; return; }
    if (act.kind === "orbit") { orbit.yaw -= (e.clientX - last.x) * 0.006; orbit.pitch = Math.max(0.08, Math.min(1.5, orbit.pitch + (e.clientY - last.y) * 0.005)); dirty = true; return; }
    if (act.kind === "pan") { panBy(e.clientX - last.x, e.clientY - last.y); dirty = true; return; }
    ray.setFromCamera(ndc(e), cam); const p = hitPlane(act.plane); if (!p) return; const q = B.o[sel], d = p.clone().sub(act.p0);
    if (act.kind === "move") { const ax = act.h.axis, t = d.dot(ax), i = ax.x ? 1 : ax.y ? 2 : 3; q[i] = clampAx(i, sn(act.q0[i] + t, 0.5)); }
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
    if (tap && act && act.kind !== "pinch") { ray.setFromCamera(ndc(e), cam); const hit = ray.intersectObjects(objs, true).find((h) => h.object.userData.i != null && h.object.visible), hi = hit ? hit.object.userData.i : -1;
      if ((e.shiftKey || madd) && hi >= 0 && sel >= 0) { if (hi === sel) { const rest = many().filter((i) => i !== sel); msel.clear(); rest.forEach((i) => msel.add(i)); sel = rest.length ? rest[0] : -1; } else if (msel.has(hi)) msel.delete(hi); else msel.add(hi); }
      else { msel.clear(); sel = hi; } selShow(); if (tab !== "prop" && sel >= 0) tab = "prop"; paintTabs(); pane(); }
    if (ptrs.size < 2) act = null;
  }
  function wheel(e) { e.preventDefault(); orbit.dist = Math.max(6, Math.min(220, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); dirty = true; }
  function key(e) { if (!el || (e.target && e.target.closest && e.target.closest("input,textarea,select"))) return; const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z") { e.preventDefault(); doUndo(e.shiftKey); return; } if (mod && k === "y") { e.preventDefault(); doUndo(true); return; }
    if (mod && k === "d") { e.preventDefault(); dup(); return; } if (k === "delete" || k === "backspace") { if (sel >= 0) { e.preventDefault(); del(); } return; }
    if (k === "w" && !mod) setMode("move"); else if (k === "e") setMode("rot"); else if (k === "r" && !mod) setMode("scale"); else if (k === "f") focusSel();
    else if (sel >= 0 && ["arrowleft", "arrowright", "arrowup", "arrowdown", "pageup", "pagedown"].includes(k)) { e.preventDefault(); push(); const st = e.shiftKey ? 2 : 0.5;
      for (const i of many()) { const q = B.o[i]; if (k === "arrowleft") q[1] = clampAx(1, q[1] - st); if (k === "arrowright") q[1] = clampAx(1, q[1] + st); if (k === "arrowup") q[3] = clampAx(3, q[3] - st); if (k === "arrowdown") q[3] = clampAx(3, q[3] + st); if (k === "pageup") q[2] = clampAx(2, q[2] + st); if (k === "pagedown") q[2] = clampAx(2, q[2] - st); refresh(i); }
      marks(); changed(); pane(); }
    else if (k === "escape") { sel = -1; msel.clear(); selShow(); pane(); } }
  function setMode(m) { mode = m; el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode)); dirty = true; }
  function doUndo(re) { const from = re ? redo : undo, to = re ? undo : redo; if (!from.length) return; to.push(snapS()); B = JSON.parse(from.pop()); msel.clear(); rebuild(); changed(); pane(); }
  // ---------------- insert, duplicate, delete ----------------
  function addAt(k) {
    if (B.o.length >= OB.MAX) { ctx.toast(esc(T("A course holds up to {n} pieces", { n: OB.MAX }))); return; }
    const n = B.o.filter((q) => q[0] === k).length; if (OB.CAP[k] && n >= OB.CAP[k]) { ctx.toast(esc(T("No more of this piece ({n} at most)", { n: OB.CAP[k] }))); return; }
    if (k === "S" && n) { sel = B.o.findIndex((q) => q[0] === "S"); selShow(); focusSel(); pane(); return; }
    ray.setFromCamera(new THREE.Vector2(0, 0), cam); const hit = ray.intersectObjects(objs, true).find((h) => h.object.userData.i != null);
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
  function paintTabs() { if (!el) return; el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); setMode(mode); el.querySelector("[data-snap]").classList.toggle("on", snap); }
  const num = (k, v, a, b, st = 0.5, lab = "") => `<label class="wse-num"><span>${esc(lab || k)}</span><input type="number" data-f="${k}" value="${v}" min="${a}" max="${b}" step="${st}"></label>`;
  function pane() { if (!el) return; const P = el.querySelector(".wse-pane"); P.innerHTML = tab === "prop" ? propPane() : tab === "game" ? gamePane() : tab === "scene" ? scenePane() : tab === "logic" ? logicPane() : tab === "look" ? lookPane() : tab === "ai" ? aiPane() : assetPane(); el.querySelector(".wse-side").dataset.tab = tab; }
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
    return `${many().length > 1 ? `<p class="wse-multi">✥ ${esc(T("{n} pieces picked — the gizmo and the arrow keys move them together; Delete removes them all", { n: many().length }))} <button type="button" class="wsb-b alt" data-mclr>${esc(T("Just this one"))}</button></p>` : ""}<div class="wse-ph"><i>${ICONS[k]}</i><b>${esc(T(NAMES[k]))}</b><small>#${sel + 1}</small></div>${HELP[k] ? `<p class="wse-help">${esc(T(HELP[k]))}</p>` : ""}
      <h5>${esc(T("Position"))}</h5><div class="wse-row3">${num("1", x, -OB.R, OB.R, 0.5, "X")}${num("2", y, -10, OB.Y, 0.5, "Y")}${num("3", z, -OB.R, OB.R, 0.5, "Z")}</div>
      <h5>${esc(T("Turn"))} · ${esc(T("Size"))}</h5><div class="wse-row3">${num("4", ry, 0, 359, 15, "°")}${fix ? "" : num("5", sx, 0.25, OB.SZ, 0.25, "W") + num("6", sy, 0.25, OB.SZ, 0.25, "H") + (k === "y" ? "" : num("7", sz, 0.25, OB.SZ, 0.25, "D"))}</div>
      ${["b", "y", "r", "m", "e", "d", "H", "P"].includes(k) ? `<h5>${esc(T("Colour"))}</h5><div class="wse-cols">${OB.COLORS.map((col, j) => `<button type="button" data-col="${j}" class="${j === c ? "on" : ""}" style="background:${hex(col)}" aria-label="${j}"></button>`).join("")}</div>` : ""}
      ${O.length ? `<h5>${esc(T("Options"))}</h5><div class="wse-opts">${O.map((o, i) => opt(o, i, i ? b : a)).join("")}</div>` : ""}
      <h5>${esc(T("Group"))} <small>${esc(T("(the logic shows or hides a whole group)"))}</small></h5><div class="wse-grps">${[...new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, ...(B.gn || []).map((x) => x[0]), g])].sort((a2, b2) => a2 - b2).map((n) => `<button type="button" data-grp="${n}" class="${n === g ? "on" : ""}" title="${esc(gName(n))}">${n ? "G" + n : "—"}</button>`).join("")}<button type="button" data-newgrp title="${esc(T("A new group for this piece"))}">＋</button></div>
      ${k === "S" ? "" : animRow(sel)}
      <div class="wse-acts"><button type="button" class="wsb-b" data-dup>⧉ ${esc(T("Duplicate"))}</button>${k === "S" ? "" : `<button type="button" class="wsb-b" data-del>🗑 ${esc(T("Delete"))}</button>`}<button type="button" class="wsb-b alt" data-testsel>▶ ${esc(T("Test from this piece"))}</button></div>`;
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
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length;
  }
  function winMsg(c) { const w = c.win || "goal", tk = { enemies: "E", collect: "Q", race: "R" }[w], has = tk ? c.o.some((q) => q[0] === tk || (tk === "E" && q[0] === "B")) : true;
    if (w === "goal") return c.o.some((q) => q[0] === "g") ? "Nobody can reach the goal yet — the red boxes are out of reach" : "Place a goal so the course can be won";
    if (!has) return { E: "Place at least one enemy — this game is won by defeating them", Q: "Place at least one gem — this game is won by finding them", R: "Place race rings — this game is won by flying through them" }[tk];
    return { enemies: "Some enemies can't be reached", collect: "Some gems can't be reached", race: "Some rings can't be reached", varA: "The start has nothing to stand on" }[w]; }
  // ---------------- clicks and fields ----------------
  async function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length) { if (await ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true })) close(false); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) return doUndo(false); if (b.hasAttribute("data-redo")) return doUndo(true);
    if (b.hasAttribute("data-test") || b.hasAttribute("data-testsel")) { const c = cleanObby(B), q = b.hasAttribute("data-testsel") && B.o[sel]; ctx.onTest(clampSpec({ ...spec, build: c }), q && OB.K[q[0]][0] ? [q[1], q[2] + q[6], q[3]] : null); return; }
    if (b.dataset.add) return addAt(b.dataset.add);
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
    if (b.hasAttribute("data-radd")) { push(); B.lg.push(["coins", 10, "open", 1, 0]); changed(); pane(); evt("ob-logic"); return; }
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
    const f = e.target; if (!f || !el) return; if (e.type === "input" && f.tagName === "TEXTAREA") return; if (e.type === "input" && f.type === "number") return; // (numbers apply on change)
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
