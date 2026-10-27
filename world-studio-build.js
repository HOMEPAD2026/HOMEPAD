// world-studio-build.js — Studio 4, the second tier: "Build it yourself" for Sky Runner and Infinity Dash (the owner, 2026-10-24:
// not a one-tap random game but simple tools that make a great game when you take care). The track seen from above, start at
// the bottom: tap to place walls, gaps, lasers, coins and hearts; ready-made pieces; select a stretch to copy, cut, paste or
// clear; undo / redo; the length; what the server would drop shown in red (cleanBuild — the same rules it plays by); the bots'
// stars as you go; test from where you're looking. → onDone(build) with the layout, or nothing on Back.
// ctx: { T, esc, toast, spec, onDone, onTest(spec, startZ), onClose }
import { ask } from "./world-ask.js";
import { BUILD, CLIMB, cleanBuild, cleanClimb, climbGaps, clampSpec, estimate, THEMES, buildGap } from "./world-studio-gen.js";
/// STU-B: the tools drawn as Meshy's glass icons (images/studio/ic); the emoji stays where there's none
const popAt = (e, x) => { const p = document.createElement("i"); p.className = "wsb-pop" + (x ? " x" : ""); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px"; /* STB4 (2026-10-27): six bits fly out of it — dust when a piece lands, shards when it breaks */ for (let k = 0; k < 6; k++) { const b = document.createElement("b"), a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, d = 18 + Math.random() * 16; b.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px"); b.style.setProperty("--dy", (Math.sin(a) * d * (x ? 1 : 0.5) + (x ? 0 : 6)).toFixed(1) + "px"); p.appendChild(b); } document.body.appendChild(p); setTimeout(() => p.remove(), 650); }; // (STU-B: a placed piece pops, an erased one puffs)
const toolIcon = (M, k, ic) => (M[k] ? `<img class="wsb-ic" src="/images/studio/ic/${M[k]}.webp?v=1" alt="" aria-hidden="true" loading="lazy">` : ic);

const TOOLS = [["w", "🧱", "Wall"], ["m", "🔀", "Moving wall"], ["g", "🕳️", "Gap"], ["l", "⚡", "Laser"], ["b", "✨", "Blinking laser"], ["c", "🪙", "Coin"], ["h", "❤️", "Heart"], ["x", "🧽", "Erase"], ["sel", "⬚", "Select"]];
/// ready-made pieces: [dz, kind, lane] from where you tap (metres up the track)
export const PIECES = {
  zigzag: { icon: "〰️", name: "Zigzag walls", r: [[0, "w", 0], [0, "w", 1], [14, "w", 1], [14, "w", 2], [28, "w", 0], [28, "w", 1], [7, "c", 2], [21, "c", 0], [35, "c", 2]] },
  tunnel: { icon: "⚡", name: "Laser tunnel", r: [[0, "l", 0], [10, "l", 0], [20, "l", 0], [5, "c", 1], [15, "c", 1], [25, "c", 1]] },
  arch: { icon: "🌈", name: "Coin arch", r: [[0, "c", 0], [3, "c", 0], [6, "c", 1], [9, "c", 1], [12, "c", 2], [15, "c", 2]] },
  jumps: { icon: "🕳️", name: "Gap jumps", r: [[0, "g", 0], [14, "g", 0], [28, "g", 0], [7, "c", 1], [21, "c", 1]] },
  slalom: { icon: "🎿", name: "Slalom", r: [[0, "w", 0], [12, "w", 2], [24, "w", 0], [36, "w", 2], [6, "c", 2], [18, "c", 0], [30, "c", 2]] },
  gauntlet: { icon: "🔥", name: "Gauntlet", r: [[0, "w", 0], [0, "w", 2], [10, "l", 0], [20, "g", 0], [30, "w", 1], [30, "w", 2], [40, "h", 0]] },
  reward: { icon: "💝", name: "Reward run", r: [[0, "c", 1], [3, "c", 1], [6, "c", 1], [9, "c", 1], [12, "h", 1]] },
};
/// S4d SKY CLIMB: the same toolbox on a tower of five columns (height up the screen)
const CTOOLS = [["n", "🟪", "Ledge"], ["m", "🔀", "Moving platform"], ["b", "🪵", "Breaking platform"], ["s", "🌀", "Spring"], ["k", "🔺", "Spikes"], ["c", "🪙", "Coin"], ["h", "❤️", "Heart"], ["x", "🧽", "Erase"], ["sel", "⬚", "Select"]];
export const CPIECES = {
  stairs: { icon: "🪜", name: "Staircase", r: [[0, "n", 0], [2.5, "n", 1], [5, "n", 2], [7.5, "n", 3], [10, "n", 4], [11.5, "c", 4]] },
  zigzag: { icon: "〰️", name: "Zigzag", r: [[0, "n", 1], [3, "n", 3], [6, "n", 1], [9, "n", 3], [4.5, "c", 2], [10.5, "c", 2]] },
  spring: { icon: "🌀", name: "Spring jump", r: [[0, "s", 2], [6, "c", 2], [9, "c", 2], [12, "n", 2]] },
  crumble: { icon: "🪵", name: "Crumble bridge", r: [[0, "b", 0], [2.5, "b", 1], [5, "b", 2], [7.5, "b", 3], [10, "n", 4]] },
  spikes: { icon: "🔺", name: "Spike gauntlet", r: [[0, "n", 2], [1, "k", 1], [1, "k", 3], [3, "m", 2], [4, "k", 0], [4, "k", 4], [6, "n", 2]] },
  column: { icon: "🪙", name: "Coin column", r: [[0, "n", 2], [1.5, "c", 2], [2.5, "c", 2], [3.5, "c", 2], [4.5, "n", 2]] },
};
const SNAP0 = 2, ZOOMS0 = [4, 6, 9];

export function createBuilder(ctx) {
  const { T, esc } = ctx;
  let spec = clampSpec(ctx.spec), B = spec.build ? JSON.parse(JSON.stringify(spec.build)) : { L: 400, r: [] };
  const climb = spec.tpl === "climb", NL = climb ? 5 : 3, SNAP = climb ? 0.5 : SNAP0, ZOOMS = climb ? [10, 16, 24] : ZOOMS0, TL = climb ? CTOOLS : TOOLS, PC = climb ? CPIECES : PIECES, LIM = climb ? { MIN: CLIMB.MIN, MAX: CLIMB.MAX, D: 20, ROWS: CLIMB.ROWS } : { MIN: BUILD.MIN, MAX: BUILD.MAX, D: 50, ROWS: BUILD.ROWS };
  const clean = (b, sp) => (climb ? cleanClimb(b, sp) : cleanBuild(b, sp)), isAcross = (k) => !climb && (k === "g" || k === "l" || k === "m" || k === "b");
  let heat = null, tool = "w", piece = "", sel = null, clip = null, undo = [], redo = [], view = 0, zi = 1, el = null, cv = null, g = null, raf = 0, drag = null, dirty = true;
  const th = THEMES[spec.theme] || THEMES.neon, hex = (n) => "#" + n.toString(16).padStart(6, "0");
  const keyOf = (x) => x[0] + x[1] + x[2];
  const snapshot = () => JSON.stringify(B);
  function push() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo = []; }
  function setB(json) { B = JSON.parse(json); heat = null; dirty = true; paintBar(); }
  const valid = () => { const c = clean(B, spec), ok = new Set(c.r.map(keyOf)); return { c, bad: B.r.filter((x) => !ok.has(keyOf(x))) }; };
  // ---- the window ----
  function open() {
    el = document.createElement("div"); el.className = "wsb"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in">
      <header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>🛠️ ${esc(T("Build it yourself"))}</b>
        <span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}"><img src="/images/studio/ic2/tool-undo.webp?v=1" alt="" class="wsb-uic" onerror="this.replaceWith(document.createTextNode('↩️'))"></button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}"><img src="/images/studio/ic2/tool-redo.webp?v=1" alt="" class="wsb-uic" onerror="this.replaceWith(document.createTextNode('↪️'))"></button>
        <button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test from here"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wsb-main"><canvas class="wsb-cv"></canvas><div class="wsb-side"><button type="button" class="wsb-i" data-zoom="1" aria-label="+">＋</button><button type="button" class="wsb-i" data-zoom="-1" aria-label="−">－</button><button type="button" class="wsb-i" data-go="start" aria-label="${esc(T("Start"))}">⤓</button><button type="button" class="wsb-i" data-go="end" aria-label="${esc(T("Finish"))}">⤒</button></div></div>
      <div class="wsb-sel" hidden></div>
      <div class="wsb-pieces" hidden></div>
      <nav class="wsb-tools">${TL.map(([k, ic, n]) => `<button type="button" data-tool="${k}"><i>${toolIcon(climb ? { n: "platform", m: "platform", b: "platform", s: "spring", k: "spike", c: "coin", h: "heart", x: "../ui2/tool-erase", sel: "../ic2/tool-select" } : { w: "wall", m: "moving-wall", g: "gap", l: "laser", b: "blinking-laser", c: "coin", h: "heart", x: "../ui2/tool-erase", sel: "../ic2/tool-select" }, k, ic)}</i><span>${esc(T(n))}</span></button>`).join("")}<button type="button" data-tool="p"><i>🧩</i><span>${esc(T("Pieces"))}</span></button></nav></div>`;
    document.body.appendChild(el); cv = el.querySelector(".wsb-cv"); g = cv.getContext("2d");
    el.addEventListener("click", onClick);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", () => { drag = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); view = clampView(view - e.deltaY / ZOOMS[zi]); dirty = true; }, { passive: false });
    // STB1 (2026-10-27): open on the first piece, zoomed out — it opened on the empty run-up and looked like an empty level
    { const zs = (B.r || []).map((x) => x[0]).filter(Number.isFinite); zi = 0; view = zs.length ? Math.max(-20, Math.min(...zs) - 6) : -20; dirty = true; }
    addEventListener("resize", fit); fit(); paintTools(); paintBar(); loop();
  }
  function close(done) {
    cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null;
    if (done) ctx.onDone(clean(B, spec)); if (ctx.onClose) ctx.onClose();
  }
  // ---- the canvas: z grows upwards; view = the z at the bottom edge ----
  // (W, H in drawing units: on the phone layout — a 980 px page shown at phone size — a unit is u px, so text and pieces stay readable)
  let W = 0, H = 0, dpr = 1, u = 1;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 410) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); dirty = true; }
  const ppm = () => ZOOMS[zi], laneW = () => Math.min(climb ? 76 : 120, (W - 70) / NL), x0 = () => (W - laneW() * NL) / 2 + 18;
  const zAt = (py) => view + (H - py) / ppm(), pyOf = (z) => H - (z - view) * ppm();
  const laneAt = (px) => Math.max(0, Math.min(NL - 1, Math.floor((px - x0()) / laneW())));
  const clampView = (v) => Math.max(-20, Math.min(B.L - H / ppm() + 20, v));
  function loop() { raf = requestAnimationFrame(loop); if (!dirty) return; dirty = false; draw(); }
  function draw() {
    const P = ppm(), lw = laneW(), X = x0(), bad = new Set(valid().bad.map(keyOf));
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = hex(th.sky); g.fillRect(0, 0, W, H);
    const yS = pyOf(0), yF = pyOf(B.L);
    g.fillStyle = hex(th.track); g.fillRect(X, Math.max(0, yF), lw * NL, Math.min(H, yS) - Math.max(0, yF));
    g.strokeStyle = hex(th.edge); g.globalAlpha = 0.35; g.lineWidth = 1; for (let i = 1; i < NL; i++) { g.beginPath(); g.moveTo(X + lw * i, Math.max(0, yF)); g.lineTo(X + lw * i, Math.min(H, yS)); g.stroke(); } g.globalAlpha = 1;
    g.fillStyle = hex(th.edge); g.fillRect(X - 3, Math.max(0, yF), 3, Math.min(H, yS) - Math.max(0, yF)); g.fillRect(X + lw * NL, Math.max(0, yF), 3, Math.min(H, yS) - Math.max(0, yF));
    // where the bots' runs end (estimate().fails, 10 stretches): a strip down the track's left side, redder where more fail
    { const E = heat || (heat = estimate(clampSpec({ ...spec, build: clean(B, spec) }))), mx = Math.max(1, ...E.fails); for (let i = 0; i < 10; i++) { const za = (B.L * i) / 10, zb = (B.L * (i + 1)) / 10, ya = pyOf(zb), yb = pyOf(za); if (yb < 0 || ya > H) continue; const k = E.fails[i] / mx; g.fillStyle = k ? `rgba(255,${Math.round(200 - 160 * k)},80,${0.25 + 0.6 * k})` : "rgba(124,245,200,.25)"; g.fillRect(X - 14, ya, 8, yb - ya); } }
    if (climb) { const c = clean(B, spec), rows = c.r.map(([z, k, l]) => ({ z, k: { n: "plat", m: "mplat", b: "break", s: "spring", k: "spike", c: "coin", h: "heart" }[k], lane: l })); for (const [a, b2] of climbGaps(spec, rows, c.L)) { const ya = pyOf(b2), yb = pyOf(a); g.fillStyle = "rgba(255,59,92,.22)"; g.fillRect(X, ya, lw * NL, yb - ya); g.fillStyle = "#ff6b85"; g.font = "800 11px Sora, sans-serif"; g.textAlign = "center"; g.fillText("⚠ " + T("too high to jump"), X + lw * NL / 2, (ya + yb) / 2 + 4); } }
    // metres every 10 (every 20 when zoomed out)
    g.font = "600 11px Sora, sans-serif"; g.fillStyle = "rgba(255,255,255,.55)"; g.textAlign = "right";
    const stepM = climb ? (P < 14 ? 10 : 5) : P < 5 ? 20 : 10; for (let z = Math.ceil(view / stepM) * stepM; z <= view + H / P; z += stepM) { if (z < 0 || z > B.L) continue; const y = pyOf(z); g.fillText(z + "m", X - 18, y + 4); g.fillStyle = "rgba(255,255,255,.07)"; g.fillRect(X, y, lw * NL, 1); g.fillStyle = "rgba(255,255,255,.55)"; }
    // start, finish
    g.textAlign = "center"; g.font = "800 12px Sora, sans-serif";
    if (yS > 0 && yS < H + 20) { g.fillStyle = "#7cf5c8"; g.fillRect(X, yS - 3, lw * NL, 3); g.fillText(T(climb ? "GROUND" : "START"), X + lw * NL / 2, yS + 14); }
    if (yF > -20 && yF < H) { g.fillStyle = "#ffd23a"; for (let i = 0; i < 12; i++) if (i % 2) g.fillRect(X + (lw * NL / 12) * i, yF, lw * NL / 12, 6); g.fillText(climb ? T("TOP") : spec.tpl === "dash" ? T("LOOP") : T("FINISH"), X + lw * NL / 2, yF - 8); }
    // the selection
    if (sel) { const a = Math.min(sel.a, sel.b ?? sel.a), b2 = Math.max(sel.a, sel.b ?? sel.a); g.fillStyle = "rgba(95,211,255,.16)"; g.strokeStyle = "#5fd3ff"; g.lineWidth = 2; const y1 = pyOf(b2), y2 = pyOf(a); g.fillRect(X, y1, lw * NL, y2 - y1 || 2); g.strokeRect(X, y1, lw * NL, y2 - y1 || 2); }
    // the pieces on the track
    const zMin = view - 4, zMax = view + H / P + 4;
    for (const x of B.r) { const [z, k, ln] = x; if (z < zMin || z > zMax) continue; const y = pyOf(z), cx = X + lw * (ln + 0.5), isBad = bad.has(keyOf(x));
      if (climb) { const px = X + lw * ln + 4, pw = lw - 8; if (k === "n" || k === "m" || k === "b" || k === "s") rr(px, y - 5, pw, 10, 4, k === "n" ? hex(th.wall) : k === "m" ? "#ff9a3d" : k === "b" ? "#c8a27a" : "#7cf5c8"); if (k === "m") { g.fillStyle = "#ffd9b0"; g.font = "800 11px Sora, sans-serif"; g.fillText("⟵ ⟶", cx, y + 18); } if (k === "b") { g.strokeStyle = "#5a3a1a"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, y - 5); g.lineTo(cx + 2, y + 5); g.stroke(); } if (k === "s") { g.fillStyle = "#06203a"; g.font = "800 11px sans-serif"; g.fillText("🌀", cx, y + 4); }
        if (k === "k") { g.fillStyle = "#ff3355"; for (let q = -1; q <= 1; q++) { g.beginPath(); g.moveTo(cx + q * 9 - 5, y + 5); g.lineTo(cx + q * 9, y - 7); g.lineTo(cx + q * 9 + 5, y + 5); g.fill(); } }
        if (k === "c") { g.fillStyle = "#ffc94a"; g.beginPath(); g.arc(cx, y, 6, 0, 7); g.fill(); } if (k === "h") { g.font = "16px sans-serif"; g.fillText("❤️", cx, y + 6); } g.font = "800 12px Sora, sans-serif"; }
      else if (k === "w") { rr(X + lw * ln + 6, y - 7, lw - 12, 14, 5, hex(th.wall)); }
      else if (k === "g") { g.fillStyle = "#05070d"; g.fillRect(X, y - 7, lw * NL, 14); g.strokeStyle = "rgba(255,255,255,.2)"; g.strokeRect(X, y - 7, lw * NL, 14); }
      else if (k === "l") { g.fillStyle = "#ff3355"; g.fillRect(X, y - 2, lw * NL, 4); g.fillStyle = "rgba(255,51,85,.25)"; g.fillRect(X, y - 6, lw * NL, 12); }
      else if (k === "m") { rr(X + lw * 1 + 6, y - 7, lw - 12, 14, 5, "#ff9a3d"); g.fillStyle = "#ffd9b0"; g.font = "800 13px Sora, sans-serif"; g.fillText("⟵ ⟶", X + lw * NL / 2, y + 22); g.font = "800 12px Sora, sans-serif"; }
      else if (k === "b") { g.strokeStyle = "#ff5ad8"; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(X, y); g.lineTo(X + lw * NL, y); g.stroke(); g.setLineDash([]); }
      else if (k === "c") { g.fillStyle = "#ffc94a"; g.beginPath(); g.arc(cx, y, 6, 0, 7); g.fill(); g.strokeStyle = "#a86a00"; g.lineWidth = 1.5; g.stroke(); }
      else if (k === "h") { g.font = "16px sans-serif"; g.fillText("❤️", cx, y + 6); g.font = "800 12px Sora, sans-serif"; }
      if (isBad) { g.strokeStyle = "#ff3b5c"; g.lineWidth = 3; const bx = isAcross(k) ? X + lw * NL / 2 : cx; g.beginPath(); g.moveTo(bx - 8, y - 8); g.lineTo(bx + 8, y + 8); g.moveTo(bx + 8, y - 8); g.lineTo(bx - 8, y + 8); g.stroke(); }
    }
  }
  function rr(x, y, w, h, r, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1; g.stroke(); }
  // ---- input: a drag scrolls, a tap uses the tool ----
  function pd(e) { drag = { y: e.clientY, x: e.clientX, v0: view, moved: false }; cv.setPointerCapture(e.pointerId); }
  function pm(e) { if (!drag) return; const dy = e.clientY - drag.y; if (Math.abs(dy) > 8 * u || Math.abs(e.clientX - drag.x) > 8 * u) drag.moved = true; if (drag.moved) { view = clampView(drag.v0 + dy / u / ppm()); dirty = true; } }
  function pu(e) { const d = drag; drag = null; if (!d || d.moved) return; const r = cv.getBoundingClientRect(); tap((e.clientX - r.left) / u, (e.clientY - r.top) / u); popAt(e, tool === "x"); }
  function tap(px, py) {
    const z = Math.round(zAt(py) / SNAP) * SNAP, ln = laneAt(px);
    if (z < 0 || z > B.L) return;
    if (tool === "sel") { if (!sel || sel.b != null) sel = { a: z, b: null }; else sel.b = z; paintSel(); dirty = true; return; }
    if (tool === "paste") { if (!clip) return; push(); for (const [dz, k, l] of clip) B.r.push([z + dz, k, l]); tool = "sel"; paintTools(); after(); return; }
    if (tool === "p") { const P = PC[piece]; if (!P) { ctx.toast(esc(T("Pick a piece first"))); return; } push(); for (const [dz, k, l] of P.r) B.r.push([z + dz, k, l]); after(); return; }
    if (tool === "x") { const i = B.r.findIndex((x) => Math.abs(x[0] - z) <= SNAP && (isAcross(x[1]) || x[2] === ln)); if (i >= 0) { push(); B.r.splice(i, 1); after(); } return; }
    const across = isAcross(tool), lane = across ? 0 : ln, i = B.r.findIndex((x) => x[0] === z && x[1] === tool && x[2] === lane);
    push(); if (i >= 0) B.r.splice(i, 1); else { B.r.push([z, tool, lane]); if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* no buzz */ } }
    after();
  }
  function after() { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (STB7: the Studio's autosave) */ } heat = null; B.r = B.r.filter((x) => x[0] >= 0 && x[0] <= B.L).slice(0, LIM.ROWS * 2); dirty = true; paintBar(); }
  // ---- the bars ----
  function paintTools() { if (!el) return; el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool || (tool === "paste" && b.dataset.tool === "sel")));
    const pc = el.querySelector(".wsb-pieces"); pc.hidden = tool !== "p";
    if (tool === "p") pc.innerHTML = Object.entries(PC).map(([id, P]) => `<button type="button" data-piece="${id}" class="${piece === id ? "on" : ""}"><i>${P.icon}</i>${esc(T(P.name))}</button>`).join("") + `<small>${esc(T("Pick a piece, then tap the track where it starts."))}</small>`;
    paintSel(); }
  function paintSel() { if (!el) return; const s = el.querySelector(".wsb-sel"); s.hidden = !(tool === "sel" || tool === "paste");
    if (s.hidden) return; const has = sel && sel.b != null;
    s.innerHTML = tool === "paste" ? `<span>📋 ${esc(T("Tap where to paste"))}</span><button type="button" data-sel="cancel">${esc(T("Cancel"))}</button>`
      : has ? `<span>${Math.min(sel.a, sel.b)}–${Math.max(sel.a, sel.b)} m</span><button type="button" data-sel="copy">📄 ${esc(T("Copy"))}</button><button type="button" data-sel="cut">✂️ ${esc(T("Cut"))}</button><button type="button" data-sel="clear">🗑️ ${esc(T("Clear"))}</button><button type="button" data-sel="paste" ${clip ? "" : "disabled"}>📋 ${esc(T("Paste"))}</button>`
      : `<span>${esc(T(sel ? "Tap where the stretch ends" : "Tap where a stretch starts"))}</span><button type="button" data-sel="paste" ${clip ? "" : "disabled"}>📋 ${esc(T("Paste"))}</button>`; }
  function paintBar() { if (!el) return; const v = valid(), sp = clampSpec({ ...spec, build: v.c }), E = estimate(sp), n = (k) => v.c.r.filter((x) => x[1] === k).length;
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-len"><button type="button" class="wsb-i" data-len="-1">－</button><b>${B.L} m</b><button type="button" class="wsb-i" data-len="1">＋</button></span>
      <span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span>
      <span class="wsb-cnt">${climb ? `🟪 ${n("n") + n("m") + n("b")} · 🌀 ${n("s")} · 🔺 ${n("k")} · 🪙 ${n("c")} · ❤️ ${n("h")}/${CLIMB.HEARTS}` : `🧱 ${n("w")} · 🕳️ ${n("g")} · ⚡ ${n("l")} · 🪙 ${n("c")} · ❤️ ${n("h")}/${BUILD.HEARTS}`}</span>
      ${v.bad.length ? `<span class="wsb-bad">⚠️ ${esc(climb ? T("{n} pieces won't count (red ✕): one thing a spot", { n: v.bad.length }) : T("{n} pieces won't count (red ✕): obstacles need {m} m between them, a free lane, one kind a row", { n: v.bad.length, m: buildGap(spec) }))}</span>` : ""}`;
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length) { ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true }).then((y) => { if (y) close(false); }); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snapshot()); setB(undo.pop()); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snapshot()); setB(redo.pop()); } return; }
    if (b.hasAttribute("data-test")) { const v = valid(); ctx.onTest(clampSpec({ ...spec, build: v.c }), Math.max(0, Math.round(view + 4))); return; }
    if (b.dataset.tool) { tool = b.dataset.tool; if (tool !== "sel") sel = null; paintTools(); dirty = true; return; }
    if (b.dataset.piece) { piece = b.dataset.piece; paintTools(); return; }
    if (b.dataset.zoom) { const mid = zAt(H / 2); zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + Number(b.dataset.zoom))); view = clampView(mid - H / 2 / ppm()); dirty = true; return; }
    if (b.dataset.go) { view = clampView(b.dataset.go === "start" ? -20 : B.L); dirty = true; return; }
    if (b.dataset.len) { push(); B.L = Math.max(LIM.MIN, Math.min(LIM.MAX, B.L + Number(b.dataset.len) * LIM.D)); after(); return; }
    if (b.dataset.sel) { const s = b.dataset.sel, a = sel ? Math.min(sel.a, sel.b ?? sel.a) : 0, z2 = sel ? Math.max(sel.a, sel.b ?? sel.a) : 0, inR = (x) => x[0] >= a && x[0] <= z2;
      if (s === "copy" || s === "cut") { clip = B.r.filter(inR).map(([z, k, l]) => [z - a, k, l]); ctx.toast(esc(T("{n} pieces copied", { n: clip.length }))); }
      if (s === "cut" || s === "clear") { push(); B.r = B.r.filter((x) => !inR(x)); after(); }
      if (s === "paste") { tool = "paste"; } if (s === "cancel") tool = "sel";
      if (s !== "paste") sel = s === "copy" ? sel : null; paintTools(); dirty = true; }
  }
  return { open, close, state: () => ({ B, tool, view, sel, clip }), tap: (px, py) => tap(px, py), setTool: (k) => { tool = k; paintTools(); }, setPiece: (k) => { piece = k; paintTools(); }, at: (z, ln) => ({ px: x0() + laneW() * (ln + 0.5), py: pyOf(z) }), scrollTo: (z) => { view = clampView(z); dirty = true; } };
}
