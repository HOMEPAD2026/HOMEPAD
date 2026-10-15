// world-diag.js — anonymous health counters for ARCIRCLE World, so problems that only show on some phones can be found:
//   errors   a script error's message (cut to 180 characters), where it came from and the GPU's name; at most five
//            different ones a visit
//   fps      once every three minutes of play: which band the frame rate sat in (under 15, 15–25, 25–35, 35–50, 50+),
//            on a phone or a computer, at which quality
//   memory   once, if GPU memory keeps climbing during a long session (geometries or textures up by 300+ since the
//            first minutes): a leak to look for
//   frames   (b404) after the first minute of play and then every three minutes (six at most a visit): the typical
//            frame rate (median) and the bad moments (the slowest 10% of frames), in bands, with the graphics chip's
//            class and family (Adreno, Mali, Apple…), the frame limit and the pixel ratio, so Auto quality can be
//            tuned from real phones rather than guesses
// No wallet, no name, no position: only these counters (api/_world.mjs diag). ?nodiag turns it off.
// fps → band 0..7: under 15, 15–20, 20–25, 25–30, 30–40, 40–50, 50–55, 55 and up
export const fpsBand = (f) => (f < 15 ? 0 : f < 20 ? 1 : f < 25 ? 2 : f < 30 ? 3 : f < 40 ? 4 : f < 50 ? 5 : f < 55 ? 6 : 7);
/// the graphics chip's family from its name, in a few broad words (never the full string)
export function gpuFamily(name) {
  const g = String(name || "").toLowerCase();
  const m = /adreno[^0-9]*(\d)/.exec(g); if (m) return "adreno" + m[1];
  if (/immortalis/.test(g)) return "immortalis";
  const ml = /mali-?g(\d)/.exec(g); if (ml) return "malig" + ml[1]; if (/mali/.test(g)) return "mali";
  if (/apple/.test(g)) return "apple"; if (/powervr/.test(g)) return "powervr"; if (/xclipse/.test(g)) return "xclipse";
  if (/nvidia|geforce|rtx|gtx/.test(g)) return "nvidia"; if (/radeon|amd/.test(g)) return "amd"; if (/intel/.test(g)) return "intel";
  if (/swiftshader|llvmpipe|software/.test(g)) return "soft"; return "other";
}
export function createDiag({ post, renderer, quality = "", coarse = false, active = () => true, tier = "", cap = () => 60, where = () => "", busy = () => false }) {
  const off = (() => { try { return new URLSearchParams(location.search).has("nodiag") || navigator.webdriver; } catch { return true; } })();
  const gpu = (() => { try { const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info"); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 80); } catch { return ""; } })();
  const dev = coarse ? "phone" : "pc", sent = new Set();
  const send = (b) => { if (off) return; try { post({ action: "world-diag", ...b }).catch(() => {}); } catch { /* offline */ } };
  function err(msg, src) {
    const m = String(msg || "").slice(0, 180); if (!m || sent.has(m) || sent.size >= 5) return; sent.add(m);
    send({ kind: "err", msg: m, src: String(src || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 60), gpu, dev });
  }
  addEventListener("error", (e) => err(e.message, e.filename + ":" + e.lineno));
  addEventListener("unhandledrejection", (e) => { const r = e.reason; err(r && r.message ? r.message : String(r), r && r.stack ? (String(r.stack).split("\n")[1] || "").trim() : ""); });
  // the frame rate and the GPU memory, measured while you play (not in menus, not while the tab is hidden)
  let acc = 0, n = 0, last = 0, base = null, memSent = false, t0 = performance.now();
  // frame times in ms (a gap over a second is a pause, not a frame); sent after 60 s of play, then every 180 s
  const fam = gpuFamily(gpu), tr = tier === "high" ? "h" : tier === "low" ? "l" : "u";
  let ft = [], prev = 0, play = 0, nextAt = 60e3, frames = 0;
  // b441: hitches. A frame over 100 ms is counted with where you were (hub / zone / isle / def / jump) and its likely
  // cause: a shader built in that frame, textures or geometry uploaded, a place change or a fight starting in the last
  // 1.5 s, else "other" (garbage collection, layout, the browser). Sent in batches, at most once a minute.
  let hit = {}, hitN = 0, hitAt = 0, lastW = "", wAt = 0, lastB = false, bAt = 0, info0 = null;
  const word = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x";
  function hitch(d, now) {
    const i = renderer.info, pr = (i.programs || []).length, m = i.memory;
    let cause = "other";
    if (info0) { if (pr > info0.p) cause = "shader"; else if (m.textures > info0.t) cause = "tex"; else if (m.geometries > info0.g + 10) cause = "geo"; else if (now - wAt < 1500) cause = "move"; else if (now - bAt < 1500) cause = "fight"; }
    const band = d < 200 ? 0 : d < 500 ? 1 : 2, k = `${word(lastW)}_${cause}_${band}`;
    if (hitN < 60) { hit[k] = (hit[k] || 0) + 1; hitN++; }
    if (now - hitAt > 60e3 && Object.keys(hit).length) { hitAt = now; send({ kind: "hitch", dev, q: quality, h: hit }); hit = {}; hitN = 0; }
  }
  function frameSample() {
    const now = performance.now(), d = prev ? now - prev : 0; prev = now;
    let w = ""; try { w = where(); } catch { w = "load"; } if (w !== lastW) { lastW = w; wAt = now; }
    let b = false; try { b = !!busy(); } catch { b = false; } if (b && !lastB) bAt = now; lastB = b;
    if (d > 100 && d <= 3000) hitch(d, now);
    { const i = renderer.info; info0 = { p: (i.programs || []).length, t: i.memory.textures, g: i.memory.geometries }; }
    if (!d || d > 1000) return;
    play += d; if (ft.length < 24000) ft.push(d);
    if (play < nextAt || frames >= 6 || ft.length < 120) return;
    frames++; nextAt = play + 180e3;
    const a = ft.slice().sort((x, y) => x - y); ft = [];
    const p50 = 1000 / a[Math.floor(a.length * 0.5)], p10 = 1000 / a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
    const dpr = Math.round((renderer.getPixelRatio() || 1) * 4) / 4;
    send({ kind: "frames", dev, q: quality, tier: tr, fam, cap: Number(cap()) || 60, dpr, p50: fpsBand(p50), p10: fpsBand(p10) });
  }
  function tick(dt) {
    if (off || document.hidden || !active()) { prev = 0; return; }
    frameSample();
    acc += dt; n++;
    const now = performance.now();
    if (!base && now - t0 > 120e3) { const m = renderer.info.memory; base = { g: m.geometries, t: m.textures }; }
    if (acc < 180) return;
    const fps = n / acc; acc = 0; n = 0;
    const band = fps < 15 ? 0 : fps < 25 ? 1 : fps < 35 ? 2 : fps < 50 ? 3 : 4;
    if (now - last > 170e3) { last = now; send({ kind: "fps", b: band, dev, q: quality }); }
    if (base && !memSent) { const m = renderer.info.memory, dg = m.geometries - base.g, dtx = m.textures - base.t; if (dg > 300 || dtx > 300) { memSent = true; send({ kind: "mem", g: dg, t: dtx, dev, q: quality }); } }
  }
  return { tick, err, gpu, fam };
}
