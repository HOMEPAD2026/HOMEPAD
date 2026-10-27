// world-studio-tdbuild.js — Studio 4d: "Build it yourself" for Tower Defense (the same frame and habits as the other builders:
// world-studio-build.js). The grid from above: draw the path cell by cell from the top row (the portal) down to the bottom
// row (your crystal), put tower pads beside it (or let it suggest them), set the starting gold, and write each wave — how
// many grunts, runners and tanks. Undo / redo, what the server would drop shown in red (cleanDefense), the bots' stars.
// ctx: { T, esc, toast, spec, onDone(build, spec), onTest(spec, 0), onClose }
import { DEF, cleanDefense, clampSpec, estimate, THEMES, defGold } from "./world-studio-gen.js";
/// STU-B: the tools drawn as Meshy's glass icons (images/studio/ic); the emoji stays where there's none
const popAt = (e, x) => { const p = document.createElement("i"); p.className = "wsb-pop" + (x ? " x" : ""); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px"; /* STB4 (2026-10-27): six bits fly out of it — dust when a piece lands, shards when it breaks */ for (let k = 0; k < 6; k++) { const b = document.createElement("b"), a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, d = 18 + Math.random() * 16; b.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px"); b.style.setProperty("--dy", (Math.sin(a) * d * (x ? 1 : 0.5) + (x ? 0 : 6)).toFixed(1) + "px"); p.appendChild(b); } document.body.appendChild(p); setTimeout(() => p.remove(), 650); }; // (STU-B: a placed piece pops, an erased one puffs)
const toolIcon = (M, k, ic) => (M[k] ? `<img class="wsb-ic" src="/images/studio/ic/${M[k]}.webp?v=1" alt="" aria-hidden="true" loading="lazy">` : ic);

const TOOLS = [["path", "✏️", "Path"], ["pad", "🟦", "Tower pad"], ["x", "🧽", "Erase"]];

export function createTdBuilder(ctx) {
  const { T, esc } = ctx;
  let spec = clampSpec(ctx.spec), B = spec.build && spec.build.td ? JSON.parse(JSON.stringify(spec.build)) : { td: 1, path: [], pads: [], waves: [[5, 0, 0]] };
  let tool = "path", undo = [], redo = [], el = null, cv = null, g = null, raf = 0, dirty = true;
  const th = THEMES[spec.theme] || THEMES.neon, hex = (n) => "#" + n.toString(16).padStart(6, "0"), key = (q) => q[0] + "," + q[1];
  const snapshot = () => JSON.stringify({ B, coins: spec.coins });
  function push() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo = []; }
  function setB(json) { const j = JSON.parse(json); B = j.B; spec = clampSpec({ ...spec, coins: j.coins, build: null }); delete spec.build; after(); }
  const valid = () => cleanDefense(B, spec);
  function open() {
    el = document.createElement("div"); el.className = "wsb wsb-td"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in">
      <header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>🛠️ ${esc(T("Build it yourself"))}</b>
        <span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}">↩️</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}">↪️</button>
        <button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test play"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wsb-main"><canvas class="wsb-cv"></canvas><div class="wsb-side"><button type="button" class="wsb-i" data-suggest aria-label="${esc(T("Suggest pads"))}" title="${esc(T("Suggest pads"))}">✨</button><button type="button" class="wsb-i" data-clearpath aria-label="${esc(T("Clear the path"))}" title="${esc(T("Clear the path"))}">🗑️</button></div></div>
      <div class="wtd-waves"></div>
      <nav class="wsb-tools">${TOOLS.map(([k, ic, n]) => `<button type="button" data-tool="${k}"><i>${toolIcon({ pad: "tower" }, k, ic)}</i><span>${esc(T(n))}</span></button>`).join("")}</nav></div>`;
    document.body.appendChild(el); cv = el.querySelector(".wsb-cv"); g = cv.getContext("2d");
    el.addEventListener("click", onClick); el.addEventListener("input", onInput);
    cv.addEventListener("pointerup", (e) => { const r = cv.getBoundingClientRect(); tap((e.clientX - r.left) / u, (e.clientY - r.top) / u); popAt(e, tool === "x"); });
    addEventListener("resize", fit); fit(); paintTools(); paintBar(); paintWaves(); loop();
  }
  function close(done) { cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null; if (done) ctx.onDone(valid(), spec); if (ctx.onClose) ctx.onClose(); }
  let W = 0, H = 0, dpr = 1, u = 1;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 410) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); dirty = true; }
  const cell = () => Math.min((W - 60) / DEF.C, (H - 16) / DEF.R), ox = () => (W - cell() * DEF.C) / 2, oy = () => (H - cell() * DEF.R) / 2;
  const cellAt = (px, py) => { const k = cell(), c = Math.floor((px - ox()) / k), r = Math.floor((py - oy()) / k); return c >= 0 && c < DEF.C && r >= 0 && r < DEF.R ? [c, r] : null; };
  function loop() { raf = requestAnimationFrame(loop); if (!dirty) return; dirty = false; draw(); }
  function draw() {
    const k = cell(), X = ox(), Y = oy(), v = valid(), okPad = new Set(v.pads.map(key)), done = v.path.length > 0;
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.fillStyle = hex(th.sky); g.fillRect(0, 0, W, H);
    for (let c = 0; c < DEF.C; c++) for (let r = 0; r < DEF.R; r++) { g.fillStyle = r === 0 ? "rgba(180,140,255,.18)" : r === DEF.R - 1 ? "rgba(95,211,255,.18)" : "rgba(255,255,255,.06)"; g.fillRect(X + c * k + 1, Y + r * k + 1, k - 2, k - 2); }
    g.font = "800 11px Sora, sans-serif"; g.textAlign = "center"; g.fillStyle = "#c9b5ff"; g.fillText("🌀 " + T("PORTAL"), X + (k * DEF.C) / 2, Y - 4 > 8 ? Y - 4 : Y + 12); g.fillStyle = "#9fe8ff"; g.fillText("💎 " + T("CRYSTAL"), X + (k * DEF.C) / 2, Math.min(H - 2, Y + k * DEF.R + 12));
    // the path: cells joined in order, its end marked (where the next tap goes)
    B.path.forEach((q, i) => { g.fillStyle = hex(th.track); g.fillRect(X + q[0] * k + 2, Y + q[1] * k + 2, k - 4, k - 4); g.strokeStyle = done ? hex(th.edge) : "#ffd23a"; g.lineWidth = 2; g.strokeRect(X + q[0] * k + 2, Y + q[1] * k + 2, k - 4, k - 4); g.fillStyle = "rgba(255,255,255,.55)"; g.fillText(String(i + 1), X + (q[0] + 0.5) * k, Y + (q[1] + 0.5) * k + 4); });
    if (B.path.length > 1) { g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 3; g.beginPath(); B.path.forEach((q, i) => { const px = X + (q[0] + 0.5) * k, py = Y + (q[1] + 0.5) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); }
    if (!done) { const l = B.path[B.path.length - 1]; g.fillStyle = "rgba(255,210,58,.35)"; const next = l ? [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [l[0] + a, l[1] + b]).filter((q) => q[0] >= 0 && q[0] < DEF.C && q[1] >= 0 && q[1] < DEF.R && !B.path.some((p) => key(p) === key(q))) : Array.from({ length: DEF.C }, (_, c) => [c, 0]); for (const q of next) g.fillRect(X + q[0] * k + 6, Y + q[1] * k + 6, k - 12, k - 12); }
    // pads
    for (const q of B.pads) { const px = X + (q[0] + 0.5) * k, py = Y + (q[1] + 0.5) * k; g.fillStyle = hex(th.edge); g.beginPath(); g.arc(px, py, k * 0.32, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); if (!okPad.has(key(q))) { g.strokeStyle = "#ff3b5c"; g.lineWidth = 3; g.beginPath(); g.moveTo(px - 8, py - 8); g.lineTo(px + 8, py + 8); g.moveTo(px + 8, py - 8); g.lineTo(px - 8, py + 8); g.stroke(); } }
  }
  function tap(px, py) {
    const q = cellAt(px, py); if (!q) return; const onP = B.path.findIndex((p) => key(p) === key(q)), padI = B.pads.findIndex((p) => key(p) === key(q));
    if (tool === "path") { const l = B.path[B.path.length - 1];
      if (onP >= 0) { push(); B.path = B.path.slice(0, onP); return after(); } // (tap a path cell: the path goes back to just before it)
      if (valid().path.length) { ctx.toast(esc(T("The path already reaches the crystal — tap one of its cells to shorten it"))); return; }
      if (!l ? q[1] !== 0 : Math.abs(l[0] - q[0]) + Math.abs(l[1] - q[1]) !== 1) { ctx.toast(esc(T(l ? "The next cell must be beside the path's end" : "Start the path in the top row (by the portal)"))); return; }
      push(); if (padI >= 0) B.pads.splice(padI, 1); B.path.push(q); if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* no buzz */ } return after(); }
    if (tool === "pad") { if (onP >= 0) return; push(); if (padI >= 0) B.pads.splice(padI, 1); else B.pads.push(q); return after(); }
    if (tool === "x" && padI >= 0) { push(); B.pads.splice(padI, 1); after(); }
  }
  function after() { dirty = true; paintBar(); }
  function paintTools() { if (el) el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool)); }
  function paintBar() { if (!el) return; const v = valid(), E = estimate(clampSpec({ ...spec, build: v })), badP = B.pads.length - v.pads.length;
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-len">🪙 ${[0, 1, 2, 3, 4, 5].map((c) => `<button type="button" class="wsb-i${c === spec.coins ? " on" : ""}" data-gold="${c}">${defGold({ coins: c })}</button>`).join("")}</span>
      <span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span>
      <span class="wsb-cnt">✏️ ${B.path.length} · 🟦 ${v.pads.length}/${DEF.PADS} · 🌊 ${v.waves.length}</span>
      ${!v.path.length ? `<span class="wsb-bad">⚠️ ${esc(T("Draw the path from the top row (portal) down to the bottom row (crystal)"))}</span>` : badP ? `<span class="wsb-bad">⚠️ ${esc(T("{n} pads won't count (red ✕): a pad must touch the path", { n: badP }))}</span>` : ""}`;
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; el.querySelector("[data-test]").disabled = !v.path.length; }
  function paintWaves() { if (!el) return; const box = el.querySelector(".wtd-waves"), sum = (w) => w[0] + w[1] + w[2];
    box.innerHTML = `<div class="wtd-wh"><b>🌊 ${esc(T("Waves"))}</b><small>🟣 ${esc(T("Grunt"))} · 🟠 ${esc(T("Runner"))} · 🟥 ${esc(T("Tank"))} — ${esc(T("up to {n} a wave", { n: DEF.PER }))}</small></div>` + B.waves.map((w, i) => `<div class="wtd-w"><span>${i + 1}</span>${["🟣", "🟠", "🟥"].map((ic, j) => `<label>${ic}<input type="number" min="0" max="${DEF.PER}" inputmode="numeric" data-w="${i}" data-j="${j}" value="${w[j]}"></label>`).join("")}<em class="${sum(w) > DEF.PER ? "bad" : ""}">${sum(w)}</em><button type="button" class="wsb-i" data-wdel="${i}" aria-label="${esc(T("Delete"))}">×</button></div>`).join("")
      + (B.waves.length < DEF.WAVES ? `<button type="button" class="wsb-b" data-wadd>＋ ${esc(T("Add a wave"))}</button>` : ""); }
  function onInput(e) { const t = e.target; if (t.dataset.w == null) return; push(); B.waves[Number(t.dataset.w)][Number(t.dataset.j)] = Math.max(0, Math.min(DEF.PER, Math.round(Number(t.value) || 0))); after(); const em = t.closest(".wtd-w").querySelector("em"), w = B.waves[Number(t.dataset.w)]; em.textContent = w[0] + w[1] + w[2]; em.classList.toggle("bad", w[0] + w[1] + w[2] > DEF.PER); }
  function suggest() { if (!valid().path.length) { ctx.toast(esc(T("Draw the path first"))); return; } push(); const on = new Set(B.path.map(key)), cand = [];
    for (let i = 1; i < B.path.length - 1; i++) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const q = [B.path[i][0] + a, B.path[i][1] + b]; if (q[0] < 0 || q[0] >= DEF.C || q[1] < 0 || q[1] >= DEF.R || on.has(key(q)) || cand.some((x) => key(x.q) === key(q))) continue; cand.push({ q, n: B.path.filter((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 2.2).length }); }
    cand.sort((x, y) => y.n - x.n); B.pads = []; for (const c of cand) { if (B.pads.length >= 8) break; if (B.pads.some((p) => Math.hypot(p[0] - c.q[0], p[1] - c.q[1]) < 1.5)) continue; B.pads.push(c.q); } after(); }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length && !confirm(T("Leave without keeping your changes?"))) return; return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snapshot()); setB(undo.pop()); paintWaves(); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snapshot()); setB(redo.pop()); paintWaves(); } return; }
    if (b.hasAttribute("data-test")) { ctx.onTest(clampSpec({ ...spec, build: valid() }), 0); return; }
    if (b.hasAttribute("data-suggest")) return suggest();
    if (b.hasAttribute("data-clearpath")) { if (!B.path.length) return; push(); B.path = []; return after(); }
    if (b.dataset.tool) { tool = b.dataset.tool; return paintTools(); }
    if (b.dataset.gold != null) { push(); spec = clampSpec({ ...spec, coins: Number(b.dataset.gold), build: null }); delete spec.build; return after(); }
    if (b.hasAttribute("data-wadd")) { push(); const l = B.waves[B.waves.length - 1] || [4, 0, 0]; B.waves.push(l.map((x) => Math.min(DEF.PER, Math.round(x * 1.25 + (x ? 0 : 0))))); if (B.waves[B.waves.length - 1].every((x) => !x)) B.waves[B.waves.length - 1][0] = 5; paintWaves(); return after(); }
    if (b.dataset.wdel != null) { if (B.waves.length <= 1) return; push(); B.waves.splice(Number(b.dataset.wdel), 1); paintWaves(); return after(); }
  }
  return { open, close, state: () => ({ B, tool, spec }), tap: (px, py) => tap(px, py), setTool: (k) => { tool = k; paintTools(); }, at: (c, r) => ({ px: ox() + (c + 0.5) * cell(), py: oy() + (r + 0.5) * cell() }), suggest };
}
