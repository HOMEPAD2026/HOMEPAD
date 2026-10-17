// tools/gen-terrain-tex.mjs — Jurassic World's ground textures, drawn from noise (no third-party images): five tileable
// 512² colour layers (grass, forest floor, dirt, sand, rock) and one shared tileable normal map, as webp.
//   node tools/gen-terrain-tex.mjs models/world/jurassic/ground     (needs sharp: NODE_PATH)
import sharp from "sharp"; import fs from "node:fs";
const out = process.argv[2] || "models/world/jurassic/ground"; fs.mkdirSync(out, { recursive: true });
const N = 512;
// periodic value noise (wraps every `per` cells, so the texture tiles)
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vn = (x, y, per, s) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = (a) => ((a % per) + per) % per;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, y, base, oct, s) => { let t = 0, a = 1, n = 0, p = base; for (let i = 0; i < oct; i++) { t += a * vn(x * p, y * p, p, s + i); n += a; a *= 0.5; p *= 2; } return t / n; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
function layer(name, fn, strokes) {
  const img = new Float32Array(N * N * 3);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = fn(x / N, y / N); img.set(c, (y * N + x) * 3); }
  if (strokes) strokes(img);
  const buf = Buffer.alloc(N * N * 3); for (let i = 0; i < buf.length; i++) buf[i] = Math.max(0, Math.min(255, Math.round(img[i])));
  return sharp(buf, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 86 }).toFile(`${out}/${name}.webp`).then(() => console.log(name));
}
// a short stroke drawn with wrap-around (blades, twigs, cracks)
const stroke = (img, x0, y0, ang, len, col, wgt = 1) => { for (let t = 0; t < len; t += 0.6) { const x = Math.round(x0 + Math.cos(ang) * t), y = Math.round(y0 + Math.sin(ang) * t), i = ((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 3, k = wgt * (1 - t / len * 0.5); for (let c = 0; c < 3; c++) img[i + c] += (col[c] - img[i + c]) * k; } };
const dot = (img, x0, y0, r, col, wgt = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = Math.hypot(dx, dy) / r; if (d > 1) continue; const x = (((x0 + dx) % N) + N) % N, y = (((y0 + dy) % N) + N) % N, i = (y * N + x) * 3, k = wgt * (1 - d * d); for (let c = 0; c < 3; c++) img[i + c] += (col[c] - img[i + c]) * k; } };
const G1 = hex(0x5c8a33), G2 = hex(0x3f6a26), GY = hex(0x8ea24a), FD = hex(0x4a4a2a), LF = hex(0x6b5233), MOS = hex(0x4f7a2c), DI = hex(0x7a6244), DD = hex(0x5a4632), SA = hex(0xcdb88c), SD = hex(0xa89064), RK = hex(0x86827a), RD = hex(0x5e5a54);
await layer("grass", (u, v) => { const n = fbm(u, v, 4, 5, 1), m = fbm(u, v, 16, 3, 9); let c = mix(G2, G1, n); c = mix(c, GY, Math.max(0, fbm(u, v, 3, 3, 4) - 0.55) * 1.6); return c.map((x) => x * (0.82 + m * 0.3)); },
  (img) => { for (let i = 0; i < 9000; i++) { const g = rnd() < 0.5 ? hex(0x7fb04a) : hex(0x2f5420); stroke(img, rnd() * N, rnd() * N, -Math.PI / 2 + (rnd() - 0.5) * 1.2, 4 + rnd() * 9, g, 0.45); } });
await layer("forest", (u, v) => { const n = fbm(u, v, 5, 5, 2); let c = mix(FD, MOS, fbm(u, v, 3, 4, 7)); c = mix(c, LF, Math.max(0, n - 0.5) * 1.5); return c.map((x) => x * (0.8 + fbm(u, v, 20, 2, 3) * 0.35)); },
  (img) => { for (let i = 0; i < 700; i++) dot(img, Math.floor(rnd() * N), Math.floor(rnd() * N), 2 + Math.floor(rnd() * 4), rnd() < 0.5 ? hex(0x8a6a3a) : hex(0x5d4a2a), 0.7); for (let i = 0; i < 900; i++) stroke(img, rnd() * N, rnd() * N, rnd() * 6.28, 3 + rnd() * 8, hex(0x3a2c1c), 0.5); });
await layer("dirt", (u, v) => { const n = fbm(u, v, 6, 5, 3); return mix(DD, DI, n).map((x) => x * (0.85 + fbm(u, v, 24, 2, 5) * 0.3)); },
  (img) => { for (let i = 0; i < 1200; i++) dot(img, Math.floor(rnd() * N), Math.floor(rnd() * N), 1 + Math.floor(rnd() * 3), rnd() < 0.5 ? hex(0x9a8a72) : hex(0x4a3a28), 0.8); });
await layer("sand", (u, v) => { const n = fbm(u, v, 8, 4, 4); return mix(SD, SA, n).map((x) => x * (0.9 + fbm(u, v, 40, 2, 6) * 0.2)); },
  (img) => { for (let i = 0; i < 300; i++) dot(img, Math.floor(rnd() * N), Math.floor(rnd() * N), 1 + Math.floor(rnd() * 2), hex(0x8a7a62), 0.6); });
await layer("rock", (u, v) => { const n = fbm(u, v, 4, 6, 5), s = Math.sin((v + fbm(u, v, 2, 3, 8) * 0.3) * Math.PI * 14) * 0.5 + 0.5; return mix(RD, RK, n * 0.7 + s * 0.3).map((x) => x * (0.85 + fbm(u, v, 30, 2, 2) * 0.25)); },
  (img) => { for (let i = 0; i < 260; i++) stroke(img, rnd() * N, rnd() * N, rnd() * 6.28, 8 + rnd() * 26, hex(0x3e3a35), 0.6); });
// the shared normal map: clumps, pebbles and fine grain, from a height field
const H = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = fbm(x / N, y / N, 6, 5, 11) * 0.6 + fbm(x / N, y / N, 32, 3, 12) * 0.4;
for (let i = 0; i < 900; i++) { const cx = Math.floor(rnd() * N), cy = Math.floor(rnd() * N), r = 2 + Math.floor(rnd() * 5); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = Math.hypot(dx, dy) / r; if (d <= 1) H[((cy + dy + N) % N) * N + ((cx + dx + N) % N)] += (1 - d * d) * 0.35; } }
const nb = Buffer.alloc(N * N * 3), S = 6;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const h = (a, b) => H[((b + N) % N) * N + ((a + N) % N)]; const dx = (h(x + 1, y) - h(x - 1, y)) * S, dy = (h(x, y + 1) - h(x, y - 1)) * S, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 3; nb[i] = (-dx / l * 0.5 + 0.5) * 255; nb[i + 1] = (-dy / l * 0.5 + 0.5) * 255; nb[i + 2] = (1 / l * 0.5 + 0.5) * 255; }
await sharp(nb, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 90 }).toFile(`${out}/normal.webp`); console.log("normal");
// the lake's ripples: smooth, wide waves (a separate tileable normal map)
const HW = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) HW[y * N + x] = fbm(x / N, y / N, 3, 4, 21) * 0.7 + fbm(x / N, y / N, 9, 3, 22) * 0.3;
const wb = Buffer.alloc(N * N * 3), SW = 9;
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const h = (a, b) => HW[((b + N) % N) * N + ((a + N) % N)]; const dx = (h(x + 1, y) - h(x - 1, y)) * SW, dy = (h(x, y + 1) - h(x, y - 1)) * SW, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 3; wb[i] = (-dx / l * 0.5 + 0.5) * 255; wb[i + 1] = (-dy / l * 0.5 + 0.5) * 255; wb[i + 2] = (1 / l * 0.5 + 0.5) * 255; }
await sharp(wb, { raw: { width: N, height: N, channels: 3 } }).webp({ quality: 90 }).toFile(`${out}/water-normal.webp`); console.log("water-normal");
