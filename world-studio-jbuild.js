// world-studio-jbuild.js — SB-2 JUMP WORLD's builder (and SB-3's Dungeon Crawl, Escape Room, Boss Battle, Mine Rush): the
// level from the side on a grid, a cell a metre, the start on the left. Pick a piece from the palette (blocks, motion,
// things, items, foes, goal) and tap or drag across the grid to paint it; the hand (or two fingers) moves the view; flip
// turns a moving platform, a walker or a cannon round; erase; ready-made chunks (a key and its door, a boss arena …);
// undo / redo; the level's length; a strip of the whole level to jump along. What the server would drop shows a red ✕
// (cleanJump — the same rules it plays by), a stretch you can't reach from the start shows red, and the bots' stars sit
// at the top. The phone's one-hand set (the owner's plan): place · move · flip · erase · test · done.
// ctx: { T, esc, toast, spec, onDone(build), onTest(spec, startX), onClose }
import { JW, JEV, cleanJump, cleanEvents, clampSpec, estimate, jwReach, THEMES } from "./world-studio-gen.js";
// STB5 (2026-10-27): the event blocks' words (WHEN … THEN …)
const EVW = { coins: "I have this many coins", switch: "A switch is pressed", key: "I pick up a key", boss: "Every boss is down", time: "This many seconds pass", col: "I reach column" };
const EVT = { doors: "Every door opens", say: "Show a message", time: "Add seconds to the clock", heart: "Get a heart", coins: "Coins rain down", speed: "Run faster for 6 s" };

// the palette: [kind, emoji, group]; the names are JW.K's
const GROUPS = [["block", "🧱", "Blocks"], ["move", "🔀", "Motion"], ["thing", "🌀", "Things"], ["item", "🪙", "Items"], ["foe", "👾", "Foes"], ["goal", "🏁", "Goal"]];
// STB3 (2026-10-27): Meshy's 3D icons for the tabs and tools (images/studio/ui2), the emoji only if a picture fails
const GIC = { block: "tab-blocks", move: "tab-motion", thing: "tab-devices", item: "tab-items", foe: "tab-foes", goal: "tab-goal", chunk: "tab-prefabs", put: "tool-place", hand: "tool-move", erase: "tool-erase", test: "tool-test", done: "tool-done" };
const gimg = (k, ic) => (GIC[k] ? `<img src="/images/studio/ui2/${GIC[k]}.webp?v=1" alt="" class="wsj-ic" onerror="this.replaceWith(document.createTextNode('${ic}'))">` : ic);
const EMO = { g: "🟩", s: "🧱", i: "🧊", l: "🔥", w: "🪵", m: "↔️", v: "↕️", f: "🍂", b: "✨", p: "🌀", k: "🔺", c: "🚩", o: "🪙", y: "🗝️", d: "🚪", t: "🔘", r: "🟥", u: "🟦", h: "🧪", q: "🎁", e: "🍄", n: "🦇", z: "💣", B: "🐉", S: "🟢", F: "🏁", 1: "🟫", 2: "⬜", 3: "🟨" };
const ICON = { g: "grass", s: "stone", i: "ice", l: "lava", w: "bridge", m: "moving-platform", v: "moving-platform", f: "falling-platform", b: "blinking-platform", p: "spring", k: "spikes", c: "checkpoint", o: "coin", y: "key", d: "door", t: "switch", e: "walker", n: "flyer", q: "chest", h: "potion", F: "finish", B: "dragon", z: "cannon" }; // (Meshy's glass icons, images/studio/jw/icon-*.webp)
const FLIP = new Set(["m", "v", "z", "e"]);
/// ready-made chunks: [dx, dy, kind, d?] from the cell you tap (its bottom-left)
export const JCHUNKS = {
  stairs: { icon: "🪜", name: "Staircase", c: [[0, 0, "s"], [1, 0, "s"], [1, 1, "s"], [2, 0, "s"], [2, 1, "s"], [2, 2, "s"], [3, 0, "s"], [3, 1, "s"], [3, 2, "s"], [3, 3, "s"], [3, 4, "o"]] },
  lava: { icon: "🔥", name: "Lava bridge", c: [[0, 0, "l"], [1, 0, "l"], [2, 0, "l"], [3, 0, "l"], [1, 3, "w"], [2, 3, "w"], [1, 4, "o"], [2, 4, "o"]] },
  keydoor: { icon: "🗝️", name: "Key and door", c: [[0, 0, "y"], [4, 0, "d"], [4, 1, "d"], [4, 2, "s"], [4, 3, "s"], [4, 4, "s"], [4, 5, "s"], [4, 6, "s"], [4, 7, "s"], [4, 8, "s"], [4, 9, "s"], [4, 10, "s"], [4, 11, "s"], [4, 12, "s"]] },
  gate: { icon: "🔘", name: "Switch gate", c: [[0, 0, "t"], [3, 0, "r"], [3, 1, "r"], [3, 2, "r"], [3, 3, "r"], [3, 4, "r"], [6, 3, "u"], [7, 3, "u"], [8, 3, "u"]] },
  arena: { icon: "🐉", name: "Boss arena", c: [[0, 0, "s"], [0, 1, "s"], [0, 2, "s"], [10, 0, "B"], [3, 3, "w"], [4, 3, "w"], [13, 4, "w"], [14, 4, "w"], [2, 0, "h"]] },
  arch: { icon: "🌈", name: "Coin arch", c: [[0, 0, "o"], [1, 1, "o"], [2, 2, "o"], [3, 2, "o"], [4, 1, "o"], [5, 0, "o"]] },
  patrol: { icon: "🍄", name: "Enemy patrol", c: [[0, 0, "s"], [6, 0, "s"], [2, 0, "e"], [4, 0, "e", 1], [3, 3, "n"]] },
  tower: { icon: "🌀", name: "Spring tower", c: [[0, 0, "p"], [2, 0, "s"], [2, 1, "s"], [2, 2, "s"], [2, 3, "s"], [2, 4, "s"], [2, 5, "s"], [2, 6, "o"], [3, 6, "q"]] },
  lifts: { icon: "↕️", name: "Lift shaft", c: [[0, 0, "v"], [3, 3, "v", 1], [6, 6, "w"], [7, 6, "w"], [7, 7, "o"]] },
  ores: { icon: "⛏️", name: "Ore vein", c: [[0, 0, "1"], [1, 0, "1"], [0, 1, "2"], [1, 1, "1"], [2, 0, "2"], [1, 2, "3"]] },
};
const ZOOMS = [22, 32, 44];

export function createJumpBuilder(ctx) {
  const { T, esc } = ctx;
  let spec = clampSpec(ctx.spec), B = spec.build && spec.build.jw ? JSON.parse(JSON.stringify(spec.build)) : { jw: 1, W: 90, c: [] };
  const th = THEMES[spec.theme] || THEMES.neon, hex = (n) => "#" + n.toString(16).padStart(6, "0");
  // STB5 (2026-10-27): my pieces — an area you saved (two corners), kept on this device, placed like a ready-made one
  const PF_KEY = "arc.studio.jpf", PF_MAX = 8, PF_CELLS = 80;
  let myPf = []; try { const v = JSON.parse(localStorage.getItem(PF_KEY) || "[]"); if (Array.isArray(v)) myPf = v.filter((q) => q && Array.isArray(q.c)).slice(0, PF_MAX); } catch { /* none */ }
  const pfSave = () => { try { localStorage.setItem(PF_KEY, JSON.stringify(myPf)); } catch { /* private window */ } };
  let grabA = null;
  let group = "block", piece = "g", tool = "put", chunk = "", undo = [], redo = [], vx = 0, zi = 1, el = null, cv = null, g = null, raf = 0, dirty = true, est = null, reach = null, drag = null, pinch = null;
  const imgs = {}; for (const [k, n] of Object.entries(ICON)) { const im = new Image(); im.onload = () => { dirty = true; }; im.src = `/images/studio/jw/icon-${n}.webp?v=1`; imgs[k] = im; }
  const snapshot = () => JSON.stringify(B);
  function push() { undo.push(snapshot()); if (undo.length > 100) undo.shift(); redo = []; }
  const valid = () => { const c = cleanJump(B, spec), ok = new Set(c.c.map((x) => x[0] + ":" + x[1] + x[2])); return { c, bad: B.c.filter((x) => !ok.has(x[0] + ":" + x[1] + x[2])) }; };
  // ---- the window ----
  function open() {
    el = document.createElement("div"); el.className = "wsb wsj"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in">
      <header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>🛠️ ${esc(T("Build it yourself"))}</b>
        <span class="wsb-hr"><button type="button" class="wsb-b alt wsj-evb" data-evs>⚡ ${esc(T("Events"))} <i class="wsj-evn"></i></button><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}">↩️</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}">↪️</button>
        <button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test from here"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wsj-main"><aside class="wsj-pal"><nav class="wsj-grp">${GROUPS.map(([id, ic, n]) => `<button type="button" data-grp="${id}" title="${esc(T(n))}"><i>${gimg(id, ic)}</i><span>${esc(T(n))}</span></button>`).join("")}<button type="button" data-grp="chunk" title="${esc(T("Ready-made"))}"><i>${gimg("chunk", "📦")}</i><span>${esc(T("Ready-made"))}</span></button></nav><div class="wsj-items"></div></aside>
        <div class="wsj-stage"><canvas class="wsb-cv wsj-cv"></canvas><canvas class="wsj-strip" aria-label="${esc(T("The whole level"))}"></canvas>
          <div class="wsj-zoom"><button type="button" class="wsb-i" data-zoom="1" aria-label="+">＋</button><button type="button" class="wsb-i" data-zoom="-1" aria-label="−">－</button></div></div></div>
      <nav class="wsj-tools">${[["put", "✏️", "Place"], ["hand", "✋", "Move"], ["flip", "🔄", "Flip"], ["erase", "🧽", "Erase"]].map(([k, ic, n]) => `<button type="button" data-tool="${k}"><i>${gimg(k, ic)}</i><span>${esc(T(n))}</span></button>`).join("")}<button type="button" data-test class="alt"><i>${gimg("test", "▶")}</i><span>${esc(T("Test"))}</span></button><button type="button" data-done class="go"><i>${gimg("done", "✓")}</i><span>${esc(T("Done"))}</span></button></nav>
    </div>`;
    document.body.appendChild(el); cv = el.querySelector(".wsj-cv"); g = cv.getContext("2d");
    el.addEventListener("click", onClick);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", () => { drag = null; pinch = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); vx = clampV(vx + (e.deltaX || e.deltaY) / cs()); dirty = true; }, { passive: false });
    cv.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { pinch = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, v0: vx }; drag = null; } }, { passive: true });
    cv.addEventListener("touchmove", (e) => { if (pinch && e.touches.length === 2) { const x = (e.touches[0].clientX + e.touches[1].clientX) / 2; vx = clampV(pinch.v0 - (x - pinch.x) / u / cs()); dirty = true; } }, { passive: true });
    cv.addEventListener("touchend", () => { if (pinch) setTimeout(() => { pinch = null; }, 60); }, { passive: true });
    const strip = el.querySelector(".wsj-strip"); strip.addEventListener("pointerdown", (e) => { const r = strip.getBoundingClientRect(), f = (e.clientX - r.left) / r.width; vx = clampV(f * B.W - visC() / 2); dirty = true; });
    addEventListener("resize", fit); fit(); paintPal(); paintTools(); paintBar(); paintEv(); loop();
  }
  let evOpen = false;
  function paintEv() {
    if (!el) return; const n = (B.ev || []).length, nb = el.querySelector(".wsj-evn"); if (nb) nb.textContent = n ? String(n) : "";
    let p = el.querySelector(".wsj-evp"); if (!evOpen) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement("div"); p.className = "wsj-evp"; el.querySelector(".wsb-in").appendChild(p);
      p.addEventListener("change", (e) => { const t = e.target, i = Number(t.dataset.i); if (!(i >= 0) || !B.ev || !B.ev[i]) return; push(); const r = [...B.ev[i]];
        if (t.dataset.f === "w") r[0] = t.value; else if (t.dataset.f === "a") r[1] = Number(t.value); else if (t.dataset.f === "t") r[2] = t.value; else if (t.dataset.f === "b") r[3] = Number(t.value);
        B.ev[i] = r; B.ev = cleanEvents(B.ev, B.W); paintEv(); after(); }); }
    const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(T(l))}</option>`).join("");
    p.innerHTML = `<header><b>⚡ ${esc(T("Events"))}</b><small>${esc(T("WHEN something happens, THEN something else — each once a run"))}</small><button type="button" class="wsb-i" data-ev-x aria-label="${esc(T("Close"))}">✕</button></header>
      <ol>${(B.ev || []).map(([w, a, t, v], i) => `<li><span class="wsj-evk">${esc(T("WHEN"))}</span><select data-i="${i}" data-f="w">${opt(EVW, w)}</select>${w === "coins" || w === "time" || w === "col" ? `<input type="number" data-i="${i}" data-f="a" value="${a}" min="1" max="300">` : ""}
        <span class="wsj-evk then">${esc(T("THEN"))}</span><select data-i="${i}" data-f="t">${opt(EVT, t)}</select>${t === "say" ? `<select data-i="${i}" data-f="b">${JEV.MSGS.map((m, k) => `<option value="${k}"${k === v ? " selected" : ""}>${esc(T(m))}</option>`).join("")}</select>` : t === "time" || t === "coins" ? `<input type="number" data-i="${i}" data-f="b" value="${v}" min="1" max="60">` : ""}
        <button type="button" class="wsb-i" data-ev-del="${i}" aria-label="${esc(T("Delete"))}">🗑️</button></li>`).join("") || `<p class="wsj-evnone">${esc(T("No events yet — add one, e.g. WHEN 10 coins THEN every door opens."))}</p>`}</ol>
      ${(B.ev || []).length < JEV.MAX ? `<button type="button" class="wsb-b go" data-ev-add>＋ ${esc(T("Add an event"))}</button>` : ""}`;
  }
  function close(done) { cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null; if (done) ctx.onDone(cleanJump(B, spec)); if (ctx.onClose) ctx.onClose(); }
  // ---- the canvas: x grows right (columns), y up (rows); vx = the column at the left edge ----
  let W = 0, H = 0, dpr = 1, u = 1;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 640) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const s = el && el.querySelector(".wsj-strip"); if (s) { const q = s.getBoundingClientRect(); s.width = Math.round(q.width * dpr); s.height = Math.round(q.height * dpr); } dirty = true; }
  const cs = () => Math.min(ZOOMS[zi], (H - 8) / JW.H * (zi === 2 ? 1.6 : 1)), visC = () => W / cs(), y0 = () => H - 4; // (the grid's bottom on the canvas)
  const clampV = (v) => Math.max(-2, Math.min(B.W - visC() + 2, v));
  const cellAt = (px, py) => [Math.floor(vx + px / cs()), Math.floor((y0() - py) / cs())];
  const pxOf = (x) => (x - vx) * cs(), pyOf = (y) => y0() - (y + 1) * cs();
  function loop() { raf = requestAnimationFrame(loop); if (!dirty) return; dirty = false; draw(); drawStrip(); }
  function draw() {
    const C = cs(), v = valid(), bad = new Set(v.bad.map((x) => x[0] + ":" + x[1])), R = reach || (reach = jwReach(v.c));
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, hex(th.sky)); sky.addColorStop(1, hex(th.fog)); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // the grid and the level's ends
    const xA = Math.max(0, Math.floor(vx)), xB = Math.min(B.W, Math.ceil(vx + W / C) + 1);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1;
    for (let x = xA; x <= xB; x++) { const X = pxOf(x); g.beginPath(); g.moveTo(X, pyOf(JW.H - 1)); g.lineTo(X, y0()); g.stroke(); }
    for (let y = 0; y <= JW.H; y++) { const Y = y0() - y * C; g.beginPath(); g.moveTo(pxOf(xA), Y); g.lineTo(pxOf(xB), Y); g.stroke(); }
    g.fillStyle = "rgba(2,6,16,.55)"; if (pxOf(0) > 0) g.fillRect(0, 0, pxOf(0), H); if (pxOf(B.W) < W) g.fillRect(pxOf(B.W), 0, W - pxOf(B.W), H);
    // past where you can get to: red
    if (!R.ok) { const X = pxOf(R.far + 2); if (X < W) { g.fillStyle = "rgba(255,59,92,.13)"; g.fillRect(Math.max(0, X), 0, W - Math.max(0, X), y0()); g.fillStyle = "#ff8aa0"; g.font = "800 12px Sora, sans-serif"; g.textAlign = "left"; if (X > 0 && X < W - 160) g.fillText("⚠ " + T("Can't reach past here"), X + 6, 16); } }
    // metres every 10
    g.font = "700 10px Sora, sans-serif"; g.fillStyle = "rgba(255,255,255,.5)"; g.textAlign = "center"; for (let x = Math.ceil(xA / 10) * 10; x <= xB; x += 10) g.fillText(x + "m", pxOf(x), 12);
    // the pieces
    for (const c of B.c) { const [x, y, k, d] = c; if (x < xA - 2 || x > xB + 1) continue; const X = pxOf(x), Y = pyOf(y), wd = k === "B" ? 2 : 1;
      const block = "gsilwrud123z".includes(k), im = imgs[k], ok = im && im.complete && im.naturalWidth;
      if (block && !(ok && "gsilwz".includes(k))) { g.fillStyle = k === "g" ? hex(th.track) : k === "s" ? hex(th.wall) : { i: "#9fd8ff", l: "#ff5a1a", w: "#a8744a", r: "#ff3b5c", u: "#3b7bff", d: "#a8744a", 1: "#d97a3a", 2: "#dfe6f2", 3: "#ffd23a", z: "#2a2f3a" }[k];
        if (k === "w") g.fillRect(X + 1, Y + 1, C - 2, C * 0.28); else g.fillRect(X + 1, Y + 1, C - 2, C - 2); g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(X + 1, Y + 1, C - 2, 3); if (k === "g") { g.fillStyle = "rgba(120,230,120,.7)"; g.fillRect(X + 1, Y + 1, C - 2, C * 0.22); } }
      if (ok && (!block || "gsilwzd".includes(k))) g.drawImage(im, X - (block ? 1 : 0), Y - (wd - 1) * C - (block ? 1 : 0), C * wd + (block ? 2 : 0), C * wd + (block ? 2 : 0)); // (SB-2: Meshy's glass icon for the cell)
      else if (!block) { g.font = `${Math.round(C * 0.7 * wd)}px sans-serif`; g.textAlign = "center"; g.fillText(EMO[k] || "?", X + (C * wd) / 2, Y + C * 0.78 - (wd - 1) * C * 0.5); }
      if (FLIP.has(k)) { g.fillStyle = "#fff"; g.font = "800 10px Sora, sans-serif"; g.textAlign = "center"; g.fillText(d ? "▶" : "◀", X + C / 2, Y + C - 2); }
      if (bad.has(x + ":" + y)) { g.strokeStyle = "#ff3b5c"; g.lineWidth = 3; g.beginPath(); g.moveTo(X + 4, Y + 4); g.lineTo(X + C - 4, Y + C - 4); g.moveTo(X + C - 4, Y + 4); g.lineTo(X + 4, Y + C - 4); g.stroke(); } }
    // where the next tap goes
    if (hover && tool !== "hand") { const X = pxOf(hover[0]), Y = pyOf(hover[1]); g.strokeStyle = tool === "erase" ? "#ff8aa0" : "#7cf5c8"; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(X + 1, Y + 1, C - 2, C - 2); g.setLineDash([]); }
    // the area being saved: from the first corner to where the next tap goes
    if (tool === "grab" && grabA) { const b2 = hover || grabA, xa = Math.min(grabA[0], b2[0]), xb = Math.max(grabA[0], b2[0]), ya = Math.min(grabA[1], b2[1]), yb = Math.max(grabA[1], b2[1]);
      g.fillStyle = "rgba(255,210,58,.16)"; g.fillRect(pxOf(xa), pyOf(yb), (xb - xa + 1) * C, (yb - ya + 1) * C); g.strokeStyle = "#ffd23a"; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(pxOf(xa) + 1, pyOf(yb) + 1, (xb - xa + 1) * C - 2, (yb - ya + 1) * C - 2); g.setLineDash([]); }
  }
  let hover = null;
  function drawStrip() {
    const s = el && el.querySelector(".wsj-strip"); if (!s) return; const q = s.getContext("2d"), w = s.width, h = s.height, k = w / B.W, kh = h / JW.H; q.clearRect(0, 0, w, h); q.fillStyle = "rgba(4,10,24,.85)"; q.fillRect(0, 0, w, h);
    for (const c of B.c) { const blk = "gsilw123".includes(c[2]); q.fillStyle = blk ? hex(c[2] === "g" ? th.track : th.wall) : c[2] === "B" ? "#2fb36a" : c[2] === "F" ? "#ffd23a" : c[2] === "o" ? "#ffc94a" : "e n z".includes(c[2]) ? "#ff6fae" : "#7cf5c8"; q.fillRect(c[0] * k, h - (c[1] + 1) * kh, Math.max(1, k), Math.max(1, kh)); }
    q.strokeStyle = "#5fd3ff"; q.lineWidth = 2 * dpr; q.strokeRect(Math.max(0, vx) * k, 1, visC() * k, h - 2);
  }
  // ---- input: a tap or a drag places / erases / flips; the hand (or two fingers) moves the view ----
  function pd(e) { if (pinch) return; const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / u, py = (e.clientY - r.top) / u; drag = { x: e.clientX, v0: vx, moved: false, painted: new Set(), first: true }; cv.setPointerCapture(e.pointerId);
    if (tool !== "hand" && e.pointerType !== "touch") act(px, py); else if (tool !== "hand") drag.pend = [px, py]; }
  function pm(e) { const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / u, py = (e.clientY - r.top) / u; const hc = cellAt(px, py); if (!hover || hover[0] !== hc[0] || hover[1] !== hc[1]) { hover = hc; dirty = true; }
    if (!drag || pinch) return; if (Math.abs(e.clientX - drag.x) > 6 * u) drag.moved = true;
    if (tool === "hand") { if (drag.moved) { vx = clampV(drag.v0 - (e.clientX - drag.x) / u / cs()); dirty = true; } return; }
    if (drag.pend) { act(...drag.pend); drag.pend = null; } if (tool === "put" || tool === "erase") act(px, py); }
  function pu(e) { const d = drag; drag = null; if (!d || pinch) return; if (d.pend) { act(...d.pend); } if (d.did) { after(); popAt(e, tool === "erase"); } }
  function act(px, py) {
    const [x, y] = cellAt(px, py); if (x < 0 || x >= B.W || y < 0 || y >= JW.H) return; const key = x + ":" + y;
    if (tool === "grab") { if (!grabA) { grabA = [x, y]; dirty = true; ctx.toast(esc(T("Now tap the other corner"))); return; }
      const x0 = Math.min(grabA[0], x), x1 = Math.max(grabA[0], x), y0 = Math.min(grabA[1], y), y1 = Math.max(grabA[1], y); grabA = null;
      const c = B.c.filter((q) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1 && q[2] !== "S" && q[2] !== "F" && q[2] !== "B").slice(0, PF_CELLS).map((q) => q[3] ? [q[0] - x0, q[1] - y0, q[2], 1] : [q[0] - x0, q[1] - y0, q[2]]);
      if (!c.length) { tool = "put"; paintTools(); ctx.toast(esc(T("Nothing there to save"))); return; }
      myPf = [...myPf, { name: T("My piece") + " " + (myPf.length + 1), c }].slice(-PF_MAX); pfSave(); dirty = true; chunk = "my" + (myPf.length - 1); tool = "chunk"; paintTools(); ctx.toast(esc(T("Saved to My pieces — tap where it goes"))); return; } if (drag && drag.painted.has(key)) return; if (drag) drag.painted.add(key);
    const i = B.c.findIndex((c) => c[0] === x && c[1] === y), i2 = B.c.findIndex((c) => c[2] === "B" && x >= c[0] && x <= c[0] + 1 && y >= c[1] && y <= c[1] + 1);
    if (!drag || !drag.did) push(); if (drag) drag.did = true;
    if (tool === "erase") { const j = i >= 0 ? i : i2; if (j >= 0) B.c.splice(j, 1); }
    else if (tool === "flip") { const c = B.c[i]; if (c && FLIP.has(c[2])) { if (c[3]) c.length = 3; else c[3] = 1; } }
    else if (tool === "chunk") { const P = chunk.startsWith("my") ? myPf[Number(chunk.slice(2))] : JCHUNKS[chunk]; if (!P) { ctx.toast(esc(T("Pick a piece first"))); return; } for (const [dx, dy, k, d] of P.c) { const nx = x + dx, ny = y + dy; if (nx >= B.W || ny >= JW.H) continue; const j = B.c.findIndex((c) => c[0] === nx && c[1] === ny); if (j >= 0) B.c.splice(j, 1); B.c.push(d ? [nx, ny, k, 1] : [nx, ny, k]); } if (drag) drag.painted = new Set(["x"]); tool = "put"; paintTools(); }
    else { if (piece === "S" || piece === "F") B.c = B.c.filter((c) => c[2] !== piece); if (i >= 0) { if (B.c[i][2] === piece && !(drag && drag.moved)) { B.c.splice(i, 1); } else B.c[i] = [x, y, piece]; } else B.c.push([x, y, piece]); if (navigator.vibrate) try { navigator.vibrate(6); } catch { /* no buzz */ } }
    if (!drag) after(); else { reach = null; dirty = true; }
  }
  function after() { est = null; reach = null; B.c = B.c.filter((c) => c[0] >= 0 && c[0] < B.W).slice(0, JW.CELLS * 2); dirty = true; paintBar(); paintEv(); }
  const popAt = (e, x) => { const p = document.createElement("i"); p.className = "wsb-pop" + (x ? " x" : ""); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px"; /* STB4 (2026-10-27): six bits fly out of it — dust when a piece lands, shards when it breaks */ for (let k = 0; k < 6; k++) { const b = document.createElement("b"), a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, d = 18 + Math.random() * 16; b.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px"); b.style.setProperty("--dy", (Math.sin(a) * d * (x ? 1 : 0.5) + (x ? 0 : 6)).toFixed(1) + "px"); p.appendChild(b); } document.body.appendChild(p); setTimeout(() => p.remove(), 650); };
  // ---- the bars ----
  function paintPal() { if (!el) return; el.querySelectorAll("[data-grp]").forEach((b) => b.classList.toggle("on", b.dataset.grp === group));
    const box = el.querySelector(".wsj-items");
    box.innerHTML = group === "chunk" ? Object.entries(JCHUNKS).map(([id, P]) => `<button type="button" data-chunk="${id}" class="${tool === "chunk" && chunk === id ? "on" : ""}"><i>${P.icon}</i><span>${esc(T(P.name))}</span></button>`).join("")
        + `<p class="wsj-pfh">⭐ ${esc(T("My pieces"))}</p>` + myPf.map((P, i) => `<button type="button" data-chunk="my${i}" class="wsj-pf ${tool === "chunk" && chunk === "my" + i ? "on" : ""}"><i>⭐</i><span>${esc(P.name)} · ${P.c.length}</span><b data-pfdel="${i}" role="button" aria-label="${esc(T("Delete"))}">✕</b></button>`).join("")
        + `<button type="button" data-pfnew class="wsj-pfnew ${tool === "grab" ? "on" : ""}"><i>＋</i><span>${esc(T(tool === "grab" ? "Tap two corners" : "Save an area"))}</span></button>`
      : Object.entries(JW.K).filter(([k, [, gp]]) => gp === group || (group === "item" && gp === "ore")).filter(([k]) => spec.tpl === "mining" || JW.K[k][1] !== "ore").map(([k, [n]]) => `<button type="button" data-piece="${k}" class="${piece === k && tool === "put" ? "on" : ""}" title="${esc(T(n))}"><i>${ICON[k] ? `<img src="/images/studio/jw/icon-${ICON[k]}.webp?v=1" alt="" onerror="this.replaceWith(document.createTextNode('${EMO[k]}'))">` : EMO[k]}</i><span>${esc(T(n))}</span></button>`).join(""); }
  function paintTools() { if (!el) return; el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool || (tool === "chunk" && b.dataset.tool === "put"))); paintPal(); }
  function paintBar() { if (!el) return; const v = valid(), sp = clampSpec({ ...spec, build: v.c }), E = est || (est = estimate(sp)), R = reach || (reach = jwReach(v.c)), n = (f) => v.c.c.filter((c) => f(c[2])).length;
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-len"><button type="button" class="wsb-i" data-len="-1">－</button><b>${B.W} m</b><button type="button" class="wsb-i" data-len="1">＋</button></span>
      <span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span>
      <span class="wsb-cnt">🧱 ${n((k) => "gsiw".includes(k))} · 👾 ${n((k) => "enz".includes(k))} · 🐉 ${n((k) => k === "B")} · 🪙 ${n((k) => k === "o")} · 🗝️ ${n((k) => k === "y")}/${n((k) => k === "d")}🚪</span>
      ${R.ok ? `<span class="wsb-ok">✓ ${esc(T("The finish can be reached"))}</span>` : `<span class="wsb-bad">⚠️ ${esc(T("The finish can't be reached from the start yet — the red stretch is out of reach"))}</span>`}
      ${v.bad.length ? `<span class="wsb-bad">⚠️ ${esc(T("{n} pieces won't count (red ✕): one thing a cell, at most {e} foes and {b} bosses", { n: v.bad.length, e: JW.ENEMIES, b: JW.BOSSES }))}</span>` : ""}`;
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length && !confirm(T("Leave without keeping your changes?"))) return; return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-evs")) { evOpen = !evOpen; return paintEv(); }
    if (b.hasAttribute("data-ev-x")) { evOpen = false; return paintEv(); }
    if (b.hasAttribute("data-ev-add")) { push(); B.ev = cleanEvents([...(B.ev || []), ["coins", 10, "doors", 0]], B.W); paintEv(); return after(); }
    if (b.dataset.evDel != null) { push(); B.ev = (B.ev || []).filter((_, i) => i !== Number(b.dataset.evDel)); paintEv(); return after(); }
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snapshot()); B = JSON.parse(undo.pop()); after(); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snapshot()); B = JSON.parse(redo.pop()); after(); } return; }
    if (b.hasAttribute("data-test")) { const v = valid(); ctx.onTest(clampSpec({ ...spec, build: v.c }), Math.max(0, Math.round(vx + 2))); return; }
    if (b.dataset.grp) { group = b.dataset.grp; if (group !== "chunk" && (tool === "chunk" || tool === "grab")) { tool = "put"; grabA = null; } paintPal(); return; }
    if (b.dataset.piece) { piece = b.dataset.piece; tool = "put"; paintTools(); return; }
    const del = e.target.closest("[data-pfdel]"); if (del) { const i = Number(del.dataset.pfdel); myPf = myPf.filter((_, k) => k !== i); pfSave(); if (chunk.startsWith("my")) { chunk = ""; if (tool === "chunk") tool = "put"; } paintTools(); return; }
    if (b.hasAttribute("data-pfnew")) { tool = tool === "grab" ? "put" : "grab"; grabA = null; paintTools(); if (tool === "grab") ctx.toast(esc(T("Tap one corner of the area, then the other"))); return; }
    if (b.dataset.chunk) { chunk = b.dataset.chunk; tool = "chunk"; paintTools(); ctx.toast(esc(T("Tap the grid where it starts (its bottom-left)"))); return; }
    if (b.dataset.tool) { tool = b.dataset.tool; paintTools(); dirty = true; return; }
    if (b.dataset.zoom) { const mid = vx + visC() / 2; zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + Number(b.dataset.zoom))); vx = clampV(mid - visC() / 2); dirty = true; return; }
    if (b.dataset.len) { push(); B.W = Math.max(JW.MIN, Math.min(JW.MAX, B.W + Number(b.dataset.len) * 10)); const F = B.c.find((c) => c[2] === "F"); if (F && F[0] >= B.W) { F[0] = B.W - 2; } after(); return; }
  }
  return { open, close, state: () => ({ B, tool, piece, vx }), setPiece: (k) => { piece = k; tool = "put"; paintTools(); }, setTool: (k) => { tool = k; paintTools(); }, tapCell: (x, y) => { const C = cs(); act((x - vx + 0.5) * C, y0() - (y + 0.5) * C); }, scrollTo: (x) => { vx = clampV(x); dirty = true; } };
}
