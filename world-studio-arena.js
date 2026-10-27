// world-studio-arena.js — Studio 4c: "Build it yourself" for Arena Survival (the owner, 2026-10-24: simple tools that make a
// great game when you take care). The arena seen from above with a timeline under it: pick a moment, then tap the ring to
// send a drone from that side, a big drone, a laser sweep along that line, drop a coin, or stand a pillar (pillars block you
// and stop drones). Ready-made pieces, undo / redo, the length, a quick preview of who comes when, what the server would drop
// shown in red (cleanArena — the same rules it plays by), the bots' stars as you go, test from the moment you're on.
// ctx: { T, esc, toast, spec, onDone(build), onTest(spec, startT), onClose }
import { ask } from "./world-ask.js";
import { ARENA_B, ARENA_R, LENS, cleanArena, clampSpec, estimate, THEMES } from "./world-studio-gen.js";
/// STU-B: the tools drawn as Meshy's glass icons (images/studio/ic); the emoji stays where there's none
const popAt = (e, x) => { const p = document.createElement("i"); p.className = "wsb-pop" + (x ? " x" : ""); p.style.left = e.clientX + "px"; p.style.top = e.clientY + "px"; /* STB4 (2026-10-27): six bits fly out of it — dust when a piece lands, shards when it breaks */ for (let k = 0; k < 6; k++) { const b = document.createElement("b"), a = (k / 6) * Math.PI * 2 + Math.random() * 0.6, d = 18 + Math.random() * 16; b.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px"); b.style.setProperty("--dy", (Math.sin(a) * d * (x ? 1 : 0.5) + (x ? 0 : 6)).toFixed(1) + "px"); p.appendChild(b); } document.body.appendChild(p); setTimeout(() => p.remove(), 650); }; // (STU-B: a placed piece pops, an erased one puffs)
const toolIcon = (M, k, ic) => (M[k] ? `<img class="wsb-ic" src="/images/studio/ic/${M[k]}.webp?v=1" alt="" aria-hidden="true" loading="lazy">` : ic);

const TOOLS = [["d", "🛸", "Drone"], ["D", "🟠", "Big drone"], ["L", "⚡", "Laser sweep"], ["c", "🪙", "Coin"], ["p", "🗿", "Pillar"], ["x", "🧽", "Erase"]];
/// ready-made pieces, from the moment you're on and the side you tap (a: degrees from that side, t: seconds after now)
export const APIECES = {
  ring: { icon: "⭕", name: "Drone ring", w: [0, 60, 120, 180, 240, 300].map((a) => [0, "d", a]) },
  rush: { icon: "🌊", name: "Wave rush", w: [[0, "d", -25], [0.5, "d", 15], [1, "d", -10], [1.5, "d", 25], [2, "d", 0], [2.5, "d", -20]] },
  cross: { icon: "✖️", name: "Sweep cross", w: [[0, "L", 0], [0, "L", 90], [3, "L", 45], [3, "L", 135]] },
  boss: { icon: "👾", name: "Big boss", w: [[0, "D", 0], [1, "d", 150], [2, "d", 210], [3, "d", 170], [4, "d", 190]] },
  coins: { icon: "🌈", name: "Coin circle", c: [0, 45, 90, 135, 180, 225, 270, 315].map((a) => [0, Math.cos((a * Math.PI) / 180) * 6, Math.sin((a * Math.PI) / 180) * 6]) },
  fort: { icon: "🏰", name: "Pillar fort", p: [[5, 5], [-5, 5], [5, -5], [-5, -5]] },
};
const R = ARENA_R, TL = 132; // (the timeline's height under the map)

export function createArenaBuilder(ctx) {
  const { T, esc } = ctx;
  let spec = clampSpec(ctx.spec), B = spec.build && spec.build.w ? JSON.parse(JSON.stringify(spec.build)) : { p: [], w: [], c: [] };
  let tool = "d", piece = "", cur = 2, undo = [], redo = [], el = null, cv = null, g = null, raf = 0, drag = null, dirty = true, heat = null, prevOn = false, prevT0 = 0, last = 0;
  const th = THEMES[spec.theme] || THEMES.neon, hex = (n) => "#" + n.toString(16).padStart(6, "0"), secs = () => spec.len;
  const snapshot = () => JSON.stringify(B);
  function push() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo = []; }
  function setB(json) { B = JSON.parse(json); after(); }
  const r1 = (v) => Math.round(v * 10) / 10;
  const valid = () => { const c = cleanArena(B, spec), ok = { p: new Set(c.p.map(String)), w: new Set(c.w.map(String)), c: new Set(c.c.map(String)) }; return { c, bad: { p: B.p.filter((x) => !ok.p.has(String(x))), w: B.w.filter((x) => !ok.w.has(String([r1(x[0]), x[1], x[2]]))), c: B.c.filter((x) => !ok.c.has(String(x))) } }; };
  // ---- the window (the runner builder's frame: .wsb) ----
  function open() {
    el = document.createElement("div"); el.className = "wsb wsb-ar"; el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="wsb-in">
      <header class="wsb-h"><button type="button" class="wsb-b" data-close>← ${esc(T("Back"))}</button><b>🛠️ ${esc(T("Build it yourself"))}</b>
        <span class="wsb-hr"><button type="button" class="wsb-i" data-undo aria-label="${esc(T("Undo"))}">↩️</button><button type="button" class="wsb-i" data-redo aria-label="${esc(T("Redo"))}">↪️</button>
        <button type="button" class="wsb-b alt" data-test>▶ ${esc(T("Test from here"))}</button><button type="button" class="wsb-b go" data-done>✓ ${esc(T("Done"))}</button></span></header>
      <div class="wsb-bar"></div>
      <div class="wsb-main"><canvas class="wsb-cv"></canvas><div class="wsb-side"><button type="button" class="wsb-i" data-dt="-1" aria-label="−1 s">⏪</button><button type="button" class="wsb-i" data-prev aria-label="${esc(T("Preview"))}">▷</button><button type="button" class="wsb-i" data-dt="1" aria-label="+1 s">⏩</button></div></div>
      <div class="wsb-pieces" hidden></div>
      <nav class="wsb-tools">${TOOLS.map(([k, ic, n]) => `<button type="button" data-tool="${k}"><i>${toolIcon({ d: "drone", D: "big-drone", L: "laser", c: "coin", p: "pillar" }, k, ic)}</i><span>${esc(T(n))}</span></button>`).join("")}<button type="button" data-tool="pc"><i>🧩</i><span>${esc(T("Pieces"))}</span></button></nav></div>`;
    document.body.appendChild(el); cv = el.querySelector(".wsb-cv"); g = cv.getContext("2d");
    el.addEventListener("click", onClick);
    cv.addEventListener("pointerdown", pd); cv.addEventListener("pointermove", pm); cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", () => { drag = null; });
    addEventListener("resize", fit); fit(); paintTools(); paintBar(); loop(0);
  }
  function close(done) {
    cancelAnimationFrame(raf); removeEventListener("resize", fit); if (el) el.remove(); el = null;
    if (done) ctx.onDone(cleanArena(B, spec), spec); if (ctx.onClose) ctx.onClose();
  }
  // ---- the canvas: the arena on top (x right, z down — as the game's camera sees it), the timeline under it ----
  // (W, H in drawing units: on the phone layout — a 980 px page shown at phone size — a unit is u px, so text and pieces stay readable)
  let W = 0, H = 0, dpr = 1, u = 1;
  function fit() { if (!cv) return; const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); u = document.documentElement.classList.contains("wp-pcphone") ? Math.max(1, r.width / 410) : 1; W = r.width / u; H = r.height / u; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); dirty = true; }
  const mapS = () => Math.max(120, Math.min(W - 24, H - TL - 20)), sc = () => mapS() / (2 * R + 4), mx = () => W / 2, my = () => 10 + mapS() / 2;
  const toScr = (x, z) => [mx() + x * sc(), my() + z * sc()], toMap = (px, py) => [(px - mx()) / sc(), (py - my()) / sc()];
  const tlY = () => H - TL + 6, tlX0 = 46, tlX1 = () => W - 14, tAt = (px) => Math.max(0, Math.min(secs(), ((px - tlX0) / (tlX1() - tlX0)) * secs())), xOfT = (t) => tlX0 + (t / secs()) * (tlX1() - tlX0);
  function loop(ts) { raf = requestAnimationFrame(loop); if (prevOn) { if (!last) last = ts; cur = Math.min(secs(), cur + (ts - last) / 1000); last = ts; dirty = true; if (cur >= secs()) { prevOn = false; paintSide(); } } if (!dirty) return; dirty = false; draw(); }
  const dS = () => 2.6 + spec.speed * 0.9;
  function draw() {
    const S = sc(), [cx, cy] = [mx(), my()], v = valid(), badW = new Set(v.bad.w.map(String)), badP = new Set(v.bad.p.map(String)), badC = new Set(v.bad.c.map(String));
    g.setTransform(dpr * u, 0, 0, dpr * u, 0, 0); g.fillStyle = hex(th.sky); g.fillRect(0, 0, W, H);
    // the floor, its rings, the middle (where you start)
    g.fillStyle = hex(th.track); g.beginPath(); g.arc(cx, cy, R * S, 0, 7); g.fill();
    g.strokeStyle = hex(th.edge); g.lineWidth = 3; g.stroke(); g.globalAlpha = 0.3; g.lineWidth = 1; for (const f of [0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, R * S * f, 0, 7); g.stroke(); } g.globalAlpha = 1;
    g.fillStyle = "rgba(124,245,200,.25)"; g.beginPath(); g.arc(cx, cy, 3.2 * S, 0, 7); g.fill(); g.fillStyle = "#7cf5c8"; g.font = "800 11px Sora, sans-serif"; g.textAlign = "center"; g.fillText(T("START"), cx, cy + 4);
    // pillars
    for (const q of B.p) { const [px, py] = toScr(q[0], q[1]); g.fillStyle = hex(th.wall); g.beginPath(); g.arc(px, py, Math.max(6, 1 * S), 0, 7); g.fill(); g.strokeStyle = badP.has(String(q)) ? "#ff3b5c" : hex(th.edge); g.lineWidth = badP.has(String(q)) ? 3 : 2; g.stroke(); if (badP.has(String(q))) cross(px, py); }
    // coins on the floor at this moment (a coin stays 9 s)
    for (const c of B.c) { const age = cur - c[0]; if (age < -1.5 || age > 9) continue; const [px, py] = toScr(c[1], c[2]); g.globalAlpha = age < 0 ? 0.35 : 1; g.fillStyle = "#ffc94a"; g.beginPath(); g.arc(px, py, Math.max(4, 0.42 * S), 0, 7); g.fill(); g.strokeStyle = "#a86a00"; g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1; if (badC.has(String(c))) cross(px, py); }
    // waves around now: a sweep's line (a warning 1.2 s, the beam 0.5 s); drones as marks at the edge, flying in once they're out
    for (const w of B.w) { const age = cur - w[0]; if (age < -2 || age > (w[1] === "L" ? 1.7 : 6)) continue; const a = (w[2] * Math.PI) / 180, bad = badW.has(String([r1(w[0]), w[1], w[2]]));
      if (w[1] === "L") { const dx = Math.cos(a) * R * S, dy = Math.sin(a) * R * S; g.strokeStyle = bad ? "#ff3b5c" : age >= 1.2 ? "#ff3355" : "rgba(255,51,85,.45)"; g.lineWidth = age >= 1.2 ? 6 : 3; g.setLineDash(age < 0 ? [6, 6] : []); g.globalAlpha = age < 0 ? 0.5 : 1; g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; continue; }
      const big = w[1] === "D", rr = age <= 0 ? R + 1 : Math.max(0, R + 1 - age * dS() * (big ? 0.6 : 1)); if (rr <= 0.5) continue;
      const [px, py] = toScr(Math.cos(a) * rr, Math.sin(a) * rr); g.globalAlpha = age < 0 ? 0.4 + 0.3 * (1 + age / 2) : 1; g.fillStyle = big ? "#ffb02e" : hex(th.wall); g.beginPath(); g.arc(px, py, big ? Math.max(8, 1.1 * S) : Math.max(5, 0.55 * S), 0, 7); g.fill(); g.strokeStyle = hex(th.edge); g.lineWidth = 2; g.stroke(); g.globalAlpha = 1; if (bad) cross(px, py);
      if (age < 0) { g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py); const [ix, iy] = toScr(Math.cos(a) * (R - 2), Math.sin(a) * (R - 2)); g.lineTo(ix, iy); g.stroke(); } }
    // the timeline: where the bots' runs end (red), the three rows, coins, now
    const y0 = tlY(), X0 = tlX0, X1 = tlX1(), rows = [["d", "🛸"], ["D", "🟠"], ["L", "⚡"], ["c", "🪙"]], rh = (TL - 30) / rows.length;
    g.fillStyle = "rgba(6,14,32,.85)"; g.fillRect(0, y0 - 6, W, TL + 6);
    { const E = heat || (heat = estimate(clampSpec({ ...spec, build: v.c }))), m = Math.max(1, ...E.fails); for (let i = 0; i < 10; i++) { const k = E.fails[i] / m; g.fillStyle = k ? `rgba(255,${Math.round(200 - 160 * k)},80,${0.3 + 0.6 * k})` : "rgba(124,245,200,.25)"; g.fillRect(X0 + ((X1 - X0) * i) / 10, y0, (X1 - X0) / 10 - 1, 5); } }
    g.font = "13px sans-serif"; g.textAlign = "center";
    rows.forEach(([k, ic], i) => { const y = y0 + 10 + i * rh; g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(X0, y, X1 - X0, rh - 3); g.fillText(ic, 22, y + rh / 2 + 4);
      const list = k === "c" ? B.c : B.w.filter((w) => w[1] === k); g.fillStyle = k === "c" ? "#ffc94a" : k === "D" ? "#ffb02e" : k === "L" ? "#ff3355" : hex(th.wall); for (const x of list) g.fillRect(xOfT(x[0]) - 1.5, y + 3, 3, rh - 9); });
    g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 10px Sora, sans-serif"; for (let t = 0; t <= secs(); t += 5) { const x = xOfT(t); g.fillRect(x, y0 + 8, 1, TL - 30); if (t % 10 === 0) g.fillText(t + "s", x, H - 6); }
    const nx = xOfT(cur); g.fillStyle = "#7cf5c8"; g.fillRect(nx - 1.5, y0 + 4, 3, TL - 24); g.beginPath(); g.moveTo(nx - 7, y0 + 2); g.lineTo(nx + 7, y0 + 2); g.lineTo(nx, y0 + 10); g.fill();
    g.font = "800 13px Sora, sans-serif"; g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(`⏱ ${cur.toFixed(1)} s`, 10, 22);
  }
  function cross(x, y) { g.strokeStyle = "#ff3b5c"; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 7, y - 7); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y - 7); g.lineTo(x - 7, y + 7); g.stroke(); }
  // ---- input: on the timeline a tap or a drag picks the moment; on the arena a tap uses the tool ----
  function pd(e) { const r = cv.getBoundingClientRect(), y = (e.clientY - r.top) / u; drag = { tl: y > tlY() - 8, x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); if (drag.tl) { prevOn = false; paintSide(); setTime(tAt((e.clientX - r.left) / u)); } }
  function pm(e) { if (!drag || !drag.tl) return; const r = cv.getBoundingClientRect(); setTime(tAt((e.clientX - r.left) / u)); }
  function pu(e) { const d = drag; drag = null; if (!d || d.tl || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 * u) return; const r = cv.getBoundingClientRect(); tap((e.clientX - r.left) / u, (e.clientY - r.top) / u); popAt(e, tool === "x"); }
  function setTime(t) { cur = Math.round(t * 10) / 10; dirty = true; }
  function tap(px, py) {
    const [x, z] = toMap(px, py), rr = Math.hypot(x, z), deg = Math.round(((Math.atan2(z, x) * 180) / Math.PI + 360) % 360), t = Math.round(cur * 10) / 10;
    if (rr > R + 3) return;
    if (tool === "pc") { const P = APIECES[piece]; if (!P) { ctx.toast(esc(T("Pick a piece first"))); return; } push();
      for (const [dt, k, a] of P.w || []) B.w.push([r1(t + dt), k, Math.round((((deg + a) % (k === "L" ? 180 : 360)) + 360) % (k === "L" ? 180 : 360))]);
      for (const [dt, cx, cz] of P.c || []) B.c.push([r1(t + dt), r1(cx), r1(cz)]);
      for (const [cx, cz] of P.p || []) B.p.push([cx, cz]); after(); return; }
    if (tool === "x") { const hit = nearest(x, z); if (hit) { push(); hit.list.splice(hit.i, 1); after(); } return; }
    push();
    if (tool === "p") B.p.push([r1(x), r1(z)]);
    else if (tool === "c") B.c.push([t, r1(x), r1(z)]);
    else B.w.push([t, tool, tool === "L" ? deg % 180 : deg]);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* no buzz */ }
    after();
  }
  /// what an erase tap means: the closest pillar / coin on the floor now / wave around now, within reach
  function nearest(x, z) {
    let best = null; const consider = (list, i, d) => { if (d < 1.8 && (!best || d < best.d)) best = { list, i, d }; };
    B.p.forEach((q, i) => consider(B.p, i, Math.hypot(q[0] - x, q[1] - z)));
    B.c.forEach((c, i) => { const age = cur - c[0]; if (age >= -1.5 && age <= 9) consider(B.c, i, Math.hypot(c[1] - x, c[2] - z)); });
    B.w.forEach((w, i) => { const age = cur - w[0]; if (age < -2 || age > 1.7) return; const a = (w[2] * Math.PI) / 180;
      if (w[1] === "L") consider(B.w, i, Math.abs(-Math.sin(a) * x + Math.cos(a) * z) + 0.3);
      else { const rr = age <= 0 ? R + 1 : Math.max(0, R + 1 - age * dS() * (w[1] === "D" ? 0.6 : 1)); consider(B.w, i, Math.hypot(Math.cos(a) * rr - x, Math.sin(a) * rr - z)); } });
    return best;
  }
  function after() { if (ctx.onChange) try { ctx.onChange(B); } catch { /* (STB7: the Studio's autosave) */ } heat = null; B.p = B.p.slice(0, ARENA_B.PILLARS * 3); B.w = B.w.filter((w) => w[0] >= 0 && w[0] <= secs()).slice(0, ARENA_B.WAVES * 2); B.c = B.c.slice(0, ARENA_B.COINS * 2); dirty = true; paintBar(); }
  // ---- the bars ----
  function paintTools() { if (!el) return; el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === tool));
    const pc = el.querySelector(".wsb-pieces"); pc.hidden = tool !== "pc";
    if (tool === "pc") pc.innerHTML = Object.entries(APIECES).map(([id, P]) => `<button type="button" data-piece="${id}" class="${piece === id ? "on" : ""}"><i>${P.icon}</i>${esc(T(P.name))}</button>`).join("") + `<small>${esc(T("Pick a piece, pick a moment, then tap the side it comes from."))}</small>`; }
  function paintSide() { if (el) el.querySelector("[data-prev]").textContent = prevOn ? "⏸" : "▷"; }
  function paintBar() { if (!el) return; const v = valid(), E = estimate(clampSpec({ ...spec, build: v.c })), nW = (k) => v.c.w.filter((w) => w[1] === k).length, nb = v.bad.p.length + v.bad.w.length + v.bad.c.length;
    el.querySelector(".wsb-bar").innerHTML = `<span class="wsb-len">${LENS.map((s) => `<button type="button" class="wsb-i${s === spec.len ? " on" : ""}" data-secs="${s}">${s}s</button>`).join("")}</span>
      <span class="wsb-st">${"★".repeat(E.stars)}<i>${"★".repeat(5 - E.stars)}</i> <small>${esc(T("Estimated clear rate {p}%", { p: Math.round(E.clear * 100) }))}</small></span>
      <span class="wsb-cnt">🛸 ${nW("d")} · 🟠 ${nW("D")} · ⚡ ${nW("L")} · 🪙 ${v.c.c.length} · 🗿 ${v.c.p.length}/${ARENA_B.PILLARS}</span>
      ${nb ? `<span class="wsb-bad">⚠️ ${esc(T("{n} pieces won't count (red ✕): pillars apart and off the start, at most {b} arrivals a second", { n: nb, b: ARENA_B.BURST }))}</span>` : ""}`;
    el.querySelector("[data-undo]").disabled = !undo.length; el.querySelector("[data-redo]").disabled = !redo.length; }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.hasAttribute("data-close")) { if (undo.length) { ask(T, T("Leave without keeping your changes?"), { ok: T("Leave"), danger: true }).then((y) => { if (y) close(false); }); return; } return close(false); }
    if (b.hasAttribute("data-done")) return close(true);
    if (b.hasAttribute("data-undo")) { if (undo.length) { redo.push(snapshot()); setB(undo.pop()); } return; }
    if (b.hasAttribute("data-redo")) { if (redo.length) { undo.push(snapshot()); setB(redo.pop()); } return; }
    if (b.hasAttribute("data-test")) { ctx.onTest(clampSpec({ ...spec, build: valid().c }), Math.max(0, Math.floor(cur))); return; }
    if (b.hasAttribute("data-prev")) { prevOn = !prevOn; last = 0; if (prevOn && cur >= secs() - 0.5) cur = 0; paintSide(); return; }
    if (b.dataset.dt) { prevOn = false; paintSide(); setTime(Math.max(0, Math.min(secs(), cur + Number(b.dataset.dt)))); return; }
    if (b.dataset.tool) { tool = b.dataset.tool; paintTools(); return; }
    if (b.dataset.piece) { piece = b.dataset.piece; paintTools(); return; }
    if (b.dataset.secs) { push(); spec = clampSpec({ ...spec, len: Number(b.dataset.secs), build: null }); delete spec.build; cur = Math.min(cur, secs()); after(); return; }
  }
  return { open, close, state: () => ({ B, tool, cur, spec }), tap: (px, py) => tap(px, py), setTool: (k) => { tool = k; paintTools(); }, setPiece: (k) => { piece = k; paintTools(); }, setTime, at: (x, z) => { const [px, py] = toScr(x, z); return { px, py }; }, secs: () => spec.len };
}
