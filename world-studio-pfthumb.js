// world-studio-pfthumb.js — RV (2026-10-28, the review): a prefab's picture for its card, drawn on a 2D canvas (no WebGL, no
// model loads): its pieces as small isometric boxes in their colours — a boss and enemies as red bodies, coins and gems as
// dots, water see-through — fitted to the card. th = [[k, x, y, z, sx, sy, sz, c], …] (the server's card carries up to 48;
// a prefab of your own or ARCIRCLE's passes its o, whose first 8 fields line up the same after thinPf()).
import { OB } from "./world-studio-gen.js";

const memo = new Map();
const hexOf = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
/// a course's pieces in the card's short form
export function thinPf(o) { return (o || []).slice(0, 48).map((q) => [q[0], q[1], q[2], q[3], q[5], q[6], q[7], q[8]]); }

export function pfThumb(th, key, W = 240, H = 140) {
  if (key && memo.has(key)) return memo.get(key);
  let url = ""; try { url = draw(th || [], W, H); } catch { url = ""; }
  if (key) { memo.set(key, url); if (memo.size > 80) memo.delete(memo.keys().next().value); }
  return url;
}

function draw(th, W, H) {
  const cv = document.createElement("canvas"), dpr = Math.min(2, globalThis.devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a2440"); bg.addColorStop(1, "#0d1220"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (!th.length) return cv.toDataURL("image/png");
  const C = 0.866, S = 0.5, P = (x, y, z) => [(x - z) * C, (x + z) * S - y];
  // the bounds of every corner, to fit the picture
  let a = [1e9, 1e9], b = [-1e9, -1e9]; const pts = (q) => { const [, x, y, z, sx, sy, sz] = q, hx = Math.max(0.3, sx) / 2, hz = Math.max(0.3, sz) / 2, out = []; for (const dx of [-hx, hx]) for (const dz of [-hz, hz]) for (const dy of [0, Math.max(0.2, sy)]) out.push(P(x + dx, y + dy, z + dz)); return out; };
  for (const q of th) for (const [u, v] of pts(q)) { a = [Math.min(a[0], u), Math.min(a[1], v)]; b = [Math.max(b[0], u), Math.max(b[1], v)]; }
  const k = Math.min((W - 24) / Math.max(1, b[0] - a[0]), (H - 24) / Math.max(1, b[1] - a[1]), 26), ox = (W - (b[0] - a[0]) * k) / 2 - a[0] * k, oy = (H - (b[1] - a[1]) * k) / 2 - a[1] * k;
  const T = (x, y, z) => { const [u, v] = P(x, y, z); return [ox + u * k, oy + v * k]; };
  const poly = (ps, fill, alpha = 1) => { g.globalAlpha = alpha; g.beginPath(); ps.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.closePath(); g.fillStyle = fill; g.fill(); g.globalAlpha = 1; };
  const box = (x, y, z, sx, sy, sz, col, alpha = 1) => { const hx = sx / 2, hz = sz / 2, y1 = y + sy;
    poly([T(x - hx, y1, z - hz), T(x + hx, y1, z - hz), T(x + hx, y1, z + hz), T(x - hx, y1, z + hz)], shade(col, 1.08), alpha);
    poly([T(x - hx, y, z + hz), T(x + hx, y, z + hz), T(x + hx, y1, z + hz), T(x - hx, y1, z + hz)], shade(col, 0.72), alpha);
    poly([T(x + hx, y, z - hz), T(x + hx, y, z + hz), T(x + hx, y1, z + hz), T(x + hx, y1, z - hz)], shade(col, 0.88), alpha); };
  const dot = (x, y, z, r, col, ring) => { const [u, v] = T(x, y, z); g.beginPath(); g.arc(u, v, Math.max(2, r * k), 0, 7); if (ring) { g.strokeStyle = col; g.lineWidth = 2; g.stroke(); } else { g.fillStyle = col; g.fill(); } };
  const order = th.slice().sort((p, q) => p[1] + p[3] - (q[1] + q[3]) || p[2] - q[2]);
  for (const q of order) { const [kk, x, y, z, sx, sy, sz, c] = q, col = hexOf(OB.COLORS[c] != null ? OB.COLORS[c] : 0x9fb3c8);
    if (kk === "o") dot(x, y + 0.6, z, 0.3, "#ffd23a"); else if (kk === "Q") dot(x, y + 0.6, z, 0.32, "#7cf5c8"); else if (kk === "h") dot(x, y + 0.6, z, 0.3, "#ff3b5c");
    else if (kk === "E") dot(x, y + 0.8, z, 0.55, "#ff5a6e"); else if (kk === "B") dot(x, y + sy * 0.5, z, Math.max(0.9, sx * 0.45), "#ff3b5c"); else if (kk === "A") dot(x, y + 0.9, z, 0.4, "#5fd3ff");
    else if (kk === "R") dot(x, y + sx / 2, z, sx / 2, "#5fd3ff", true); else if (kk === "k") box(x, y, z, sx, sy, sz, "#ff5a1a");
    else if (kk === "W") box(x, y, z, sx, sy, sz, "#2a8aff", 0.55); else if (kk === "g") box(x, y, z, sx, Math.max(0.3, sy), sx, "#ffd23a"); else if (kk === "c" || kk === "S") box(x, y, z, sx, Math.max(0.3, sy), sx, "#7cf5c8");
    else if (kk === "x" || kk === "X") box(x, y, z, sx, sy, sz, "#8aa0b8", 0.7); else if (kk === "y" || kk === "p" || kk === "H") box(x, y, z, sx, sy, sx, col); else box(x, y, z, sx, sy, sz, col); }
  return cv.toDataURL("image/png");
}
