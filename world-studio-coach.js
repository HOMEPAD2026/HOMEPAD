// world-studio-coach.js — S6 (2026-10-29, the owner: "learn by doing"): the 3D Builder's coach. ARON, LUMI and NEX take turns;
// each step says one line, lights the control it means and waits for the editor to report that action (createSceneBuilder's
// on(): select, move, rotate, scale, add, duplicate, addComponent, test, save / publish). Back / Skip; the step is kept on the
// device (arc.studio.coach); Expert (arc.studio.lvl = "expert") hides the coach for good, Beginner brings it back.
const KEY = "arc.studio.coach", LVL = "arc.studio.lvl";
export const COACH = [
  ["aron", "select", "canvas.wse-cv", "Pick a block", "Click (or tap) any block in the world to pick it."],
  ["lumi", "move", '[data-mode="move"], .wse-qbar [data-qb="move"]', "Move it", "Drag one of the coloured arrows — or use the arrows on the little bar beside it."],
  ["nex", "rotate", '[data-mode="rot"], .wse-qbar [data-qb="rot"]', "Turn it", "Press Turn, then drag the green ring around the block."],
  ["aron", "scale", '[data-mode="scale"], .wse-qbar [data-qb="scale"]', "Make it bigger", "Press Size and pull one of the little cubes outward."],
  ["lumi", "add", ".wse-pal", "Add a new piece", "Drag a piece from Objects into the world — a ramp, lava, a coin, anything."],
  ["nex", "duplicate", '[data-dup], .wse-qbar [data-qb="dup"]', "Make a copy", "Copy the piece you picked — the ⧉ button or Ctrl + D."],
  ["aron", "addComponent", "[data-cadd]", "Give it a power", "In Properties, + Add Component: make it spin, move, hurt or give coins."],
  ["lumi", "test", "[data-test]", "Play it", "Press Play and run your course as your own hero."],
  ["nex", "save", "[data-save], [data-pub]", "Keep it", "Save your game — or Publish it so everyone in ARCIRCLE WORLD can play."],
];
const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not kept */ } };
export const coachLevel = () => get(LVL, "beginner");
export const coachDone = () => get(KEY, "") === "done";
/// starts (or resumes) the coach over an open scene builder; returns { stop }
export function makeCoach({ T, esc, img, builder, onEnd }) {
  if (coachLevel() === "expert" || !builder || !builder.on) return { stop() {} };
  let i = Math.max(0, Math.min(COACH.length - 1, Number(get(KEY, 0)) || 0)), lit = [], gone = false;
  const el = document.createElement("div"); el.className = "wsc"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el);
  const unlight = () => { for (const x of lit) x.classList.remove("wse-coachhi"); lit = []; };
  const light = (sel, n = 0) => { unlight(); if (gone) return; const root = (builder.el && builder.el()) || document; root.querySelectorAll(sel).forEach((x) => { x.classList.add("wse-coachhi"); lit.push(x); });
    if (!lit.length && n < 60) setTimeout(() => { if (COACH[i] && COACH[i][2] === sel) light(sel, n + 1); }, 250); }; // (the canvas / a pane may still be on its way)
  function paint(ok) {
    if (gone) return; const [h, , sel, t, line] = COACH[i];
    el.innerHTML = `<div class="wsc-who" style="background-image:url('${img(h + "-full")}')"></div><div class="wsc-card${ok ? " wsc-ok" : ""}"><small><span>${esc(h.toUpperCase())} · ${esc(T("Step {a} of {b}", { a: i + 1, b: COACH.length }))}</span><span>${esc(T("Learn by doing"))}</span></small>
      <b>${esc(T(t))}</b><span>${esc(T(line))}</span><div class="wsc-bar"><i style="width:${Math.round((i / COACH.length) * 100)}%"></i></div>
      <div class="wsc-acts"><button type="button" data-cb ${i ? "" : "disabled"}>${esc(T("Back"))}</button><button type="button" data-cs>${esc(T("Skip this step"))}</button><button type="button" data-ce title="${esc(T("Hide the coach — Beginner in the 3D Builder tab brings it back"))}">${esc(T("I'm an expert"))}</button><button type="button" class="wsc-x" data-cx aria-label="${esc(T("Close"))}">✕</button></div></div>`;
    setTimeout(() => light(sel), 60); // (the editor's panes repaint: light the control a moment later)
  }
  function next() { i++; set(KEY, String(i)); if (i >= COACH.length) return finish(); paint(true); }
  function finish() { set(KEY, "done"); unlight(); el.className = "wsc wsc-done";
    el.innerHTML = `<div class="wsc-who" style="background-image:url('${img("aron-full")}')"></div><div class="wsc-card"><small><span>ARON · LUMI · NEX</span><span>🎉</span></small><b>${esc(T("You built a 3D game!"))}</b><span>${esc(T("You can pick, move, turn, size, add, copy, power up, play and keep it. The rest is yours to try."))}</span><div class="wsc-acts"><button type="button" class="wsc-x" data-cx>${esc(T("Thanks!"))}</button></div></div>`;
    setTimeout(stop, 9000); }
  const off = builder.on((k) => { if (gone) return; const want = COACH[i][1]; if (k === want || (want === "save" && k === "publish")) next(); else setTimeout(() => { if (!gone) light(COACH[i][2]); }, 80); }); // (another action repainted the panes: light the control again)
  el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-cb")) { i = Math.max(0, i - 1); set(KEY, String(i)); paint(); }
    else if (b.hasAttribute("data-cs")) next();
    else if (b.hasAttribute("data-ce")) { set(LVL, "expert"); stop(); }
    else if (b.hasAttribute("data-cx")) stop(); });
  function stop() { if (gone) return; gone = true; off(); unlight(); el.remove(); if (onEnd) onEnd(); }
  paint();
  return { stop, step: () => i };
}
/// the Beginner / Expert switch (the 3D Builder tab)
export function setCoachLevel(v) { set(LVL, v === "expert" ? "expert" : "beginner"); if (v !== "expert" && coachDone()) set(KEY, "0"); }
