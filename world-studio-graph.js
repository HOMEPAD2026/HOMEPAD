// world-studio-graph.js — ED3 (2026-10-29, the owner: "the WHEN → THEN rules as a node graph"): the 3D editor's logic
// drawn as nodes — events on the left (one node for each event, fanned out to every rule it starts), the conditions in
// the middle, the actions on the right — joined by wires. It edits the same rules (B.lg) the list and the script do;
// nothing here runs. Drag an event's port onto an action to move that rule onto the event.
//   graphHtml(B, o) → the pane's html · graphWire(root) draws the wires once it's laid out
import { OB, condText } from "./world-studio-gen.js";

const VARS = ["A", "B", "coins", "phase"], OPS = ["≥", "<", "="];
export function graphHtml(B, o) {
  const { T, esc, WHEN_N, THEN_N, NOARG_W, NOARG_T } = o, lg = B.lg || [];
  const keyOf = (r) => r[0] + ":" + (NOARG_W.has(r[0]) ? 0 : r[1]);
  const evs = []; for (const r of lg) if (!evs.includes(keyOf(r))) evs.push(keyOf(r));
  const order = evs.flatMap((k) => lg.map((r, i) => (keyOf(r) === k ? i : -1)).filter((i) => i >= 0));
  let row = 1; const cells = [];
  for (const k of evs) { const idx = order.filter((i) => keyOf(lg[i]) === k), [w, a] = k.split(":");
    cells.push(`<div class="wng-n ev" data-gev="${esc(k)}" style="grid-row:${row} / span ${idx.length}"><small>${esc(T("WHEN"))}</small><select data-gw="${esc(k)}">${OB.WHEN.map((x) => `<option value="${x}"${x === w ? " selected" : ""}>${esc(T(WHEN_N[x] || x))}</option>`).join("")}</select>${NOARG_W.has(w) ? "" : `<input type="number" data-gwa="${esc(k)}" value="${a}" min="0" max="999">`}
      <button type="button" class="wng-add" data-gadd="${esc(k)}" title="${esc(T("Another action for this event"))}">＋</button><i class="wng-p out" data-pev="${esc(k)}" title="${esc(T("Drag onto an action to move it here"))}"></i></div>`);
    for (const i of idx) { const r = lg[i], cd = r[5];
      cells.push(cd ? `<div class="wng-n cd" data-gr="${i}" style="grid-row:${row}"><i class="wng-p in"></i><small>${esc(T("IF"))}</small><span class="wng-cr"><select data-gc="0">${VARS.map((v, j) => `<option value="${j}"${j === cd[0] ? " selected" : ""}>${esc(j === 0 ? T(OB.VARL[B.vl] || "A") + " (A)" : T(v))}</option>`).join("")}</select><select data-gc="1">${OPS.map((v, j) => `<option value="${j}"${j === cd[1] ? " selected" : ""}>${v}</option>`).join("")}</select><input type="number" data-gc="2" value="${cd[2]}" min="0" max="999"></span><button type="button" class="wng-x" data-gcdel="${i}" aria-label="${esc(T("Remove the condition"))}">×</button><i class="wng-p out"></i></div>`
        : `<div class="wng-gap" style="grid-row:${row}"></div>`);
      cells.push(`<div class="wng-n ac" data-gr="${i}" style="grid-row:${row}"><i class="wng-p in"></i><small>${esc(T("THEN"))}</small><select data-gt="${i}">${OB.THEN.map((x) => `<option value="${x}"${x === r[2] ? " selected" : ""}>${esc(T(THEN_N[x] || x))}</option>`).join("")}</select>
        ${NOARG_T.has(r[2]) ? "" : r[2] === "say" ? `<select data-gta="${i}">${OB.MSGS.map((m, j) => `<option value="${j}"${j === r[3] ? " selected" : ""}>${esc(T(m))}</option>`).join("")}</select>` : `<input type="number" data-gta="${i}" value="${r[3]}" min="-10" max="999">`}
        <span class="wng-ft">${r[0] === "every" || r[0] === "touch" ? "" : `<label><input type="checkbox" data-gag="${i}"${r[4] ? " checked" : ""}> ${esc(T("again"))}</label>`}${cd ? "" : `<button type="button" data-gcadd="${i}">＋ ${esc(T("if"))}</button>`}<button type="button" class="wng-x" data-rdel="${i}" aria-label="${esc(T("Delete"))}">×</button></span></div>`);
      row++; } }
  return `<div class="wng-vars"><b>${esc(T("Variables"))}</b>${VARS.map((v, j) => `<span>${esc(j === 0 ? T(OB.VARL[B.vl] || "A") + " = A" : v)}</span>`).join("")}<span>${esc(T("channels 1–8"))}</span><span>${esc(T("groups"))}</span><span>${esc(T("tags #1–#{n}", { n: OB.TAGS }))}</span></div>
    <div class="wng"><div class="wng-hd"><b>${esc(T("Events"))}</b><b>${esc(T("Conditions"))}</b><b>${esc(T("Actions"))}</b></div><div class="wng-g">${cells.join("") || `<p class="wse-empty">${esc(T("No rules yet."))}</p>`}</div><svg class="wng-w" aria-hidden="true"></svg></div>
    <div class="wse-acts"><button type="button" class="wsb-b" data-radd${lg.length >= OB.LG ? " disabled" : ""}>＋ ${esc(T("Add an event"))}</button><span class="wse-cnt">${lg.length}/${OB.LG}</span></div>`;
}
/// the wires: an event's right edge to each of its rules' condition (or action), a condition to its action
export function graphWire(root) {
  const svg = root && root.querySelector(".wng-w"), box = root && root.querySelector(".wng"); if (!svg || !box) return;
  const R0 = box.getBoundingClientRect(), pt = (e, side) => { const r = e.getBoundingClientRect(); return [side ? r.right - R0.left : r.left - R0.left, r.top - R0.top + Math.min(26, r.height / 2)]; };
  const path = ([x1, y1], [x2, y2]) => { const m = Math.max(18, (x2 - x1) / 2); return `<path d="M${x1} ${y1} C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}"/>`; };
  let d = ""; svg.setAttribute("width", R0.width); svg.setAttribute("height", R0.height);
  for (const ev of box.querySelectorAll(".wng-n.ev")) { const k = ev.dataset.gev;
    for (const ac of box.querySelectorAll(".wng-n.ac")) { const i = ac.dataset.gr; if (ac.dataset.ev !== k) continue;
      const cd = box.querySelector(`.wng-n.cd[data-gr="${i}"]`); if (cd) { d += path(pt(ev, 1), pt(cd, 0)); d += path(pt(cd, 1), pt(ac, 0)); } else d += path(pt(ev, 1), pt(ac, 0)); } }
  svg.innerHTML = d;
}
/// which event each action node belongs to (set after the html is in, for graphWire and the port drag)
export function graphTag(root, B, NOARG_W) { const lg = B.lg || []; for (const ac of root.querySelectorAll(".wng-n.ac")) { const r = lg[+ac.dataset.gr]; if (r) ac.dataset.ev = r[0] + ":" + (NOARG_W.has(r[0]) ? 0 : r[1]); } }
export { condText };
