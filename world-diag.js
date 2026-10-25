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
//   funnel   (b-st3) the first minutes, step by step (each once a visit): the page opened, loading done, the maker shown,
//            a name picked, the how-to closed, the first steps, the first knock-out, the first game — new browsers apart
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
/// the browser and system in a few words for the per-player log ("Mac Chrome 131", "Win Edge 130", "Android Samsung 26")
export function uaShort(u = (typeof navigator !== "undefined" && navigator.userAgent) || "") {
  const os = /iPhone|iPad/.test(u) ? "iOS" : /Android/.test(u) ? "Android" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Win" : /Linux/.test(u) ? "Linux" : "other";
  const m = /SamsungBrowser\/(\d+)/.exec(u) || /Edg\/(\d+)/.exec(u) || /Firefox\/(\d+)/.exec(u) || /CriOS\/(\d+)/.exec(u) || /Chrome\/(\d+)/.exec(u) || /Version\/(\d+)[\d.]* .*Safari/.exec(u);
  const br = !m ? "?" : /Samsung/.test(m[0]) ? "Samsung" : /Edg/.test(m[0]) ? "Edge" : /Firefox/.test(m[0]) ? "Firefox" : /CriOS|Chrome/.test(m[0]) ? "Chrome" : "Safari";
  return `${os} ${br} ${m ? m[1] : ""}`.trim();
}
export function createDiag({ post, renderer, quality = "", coarse = false, active = () => true, tier = "", cap = () => 60, where = () => "", busy = () => false, work = () => -1, who = () => ({}), ver = "" }) {
  const off = (() => { try { return new URLSearchParams(location.search).has("nodiag") || navigator.webdriver; } catch { return true; } })();
  const gpu = (() => { try { const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info"); return String(x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 80); } catch { return ""; } })();
  const dev = coarse ? "phone" : "pc", sent = new Set();
  const send = (b) => { if (off) return; try { post({ action: "world-diag", ...b }).catch(() => {}); } catch { /* offline */ } };
  function err(msg, src) {
    const m = String(msg || "").slice(0, 180); if (!m || sent.has(m) || sent.size >= 5) return; sent.add(m);
    send({ kind: "err", msg: m, src: String(src || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 60), gpu, dev, ...me() });
  }
  // (the per-player log: who, on what — a signed-in player's wallet and name, the browser, the build)
  const me = () => { let o = {}; try { o = who() || {}; } catch { /* nobody yet */ } return { w: o.w || "", nm: o.nm || "", ua: uaShort(), v: String(ver || "").slice(0, 24), q: quality }; };
  /// a signed-in player got in (once a visit): the load's length, so their log shows the visits that worked too
  function ready(sec) { if (me().w) send({ kind: "uready", sec, gpu, dev, ...me() }); }
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
  let hitSh = {}, hit = {}, hitN = 0, hitAt = 0, lastW = "", wAt = 0, lastB = false, bAt = 0, info0 = null;
  // b447: an "other" frame is looked up in the browser's Long Animation Frames (Chrome 123+, recent Samsung Internet):
  // "layout" when style and layout took most of it, "js" when one script did (which file and how it was called goes in
  // hitJs), "resume" in the 2 s after the tab comes back. Without the API it stays "other".
  let hitJs = {}, loaf = [], resAt = 0; const loafOn = (() => { try { return PerformanceObserver.supportedEntryTypes.includes("long-animation-frame"); } catch { return false; } })();
  if (loafOn) try { new PerformanceObserver((l) => { loaf.push(...l.getEntries()); if (loaf.length > 24) loaf = loaf.slice(-24); }).observe({ type: "long-animation-frame" }); } catch { /* no lookup */ }
  try { document.addEventListener("visibilitychange", () => { if (!document.hidden) resAt = performance.now(); }); } catch { /* fine */ }
  const fileOf = (u) => word(String(u || "").split("/").pop().split("?")[0].replace(/\.m?js$/, "").replace(/^world-/, "w")).slice(0, 10);
  function whyLong(t0, t1) {
    let e = null; for (const x of loaf) if (x.startTime < t1 && x.startTime + x.duration > t0 && (!e || x.duration > e.duration)) e = x;
    if (!e) return "other";
    if ((e.styleAndLayoutDuration || 0) > e.duration * 0.4) return "layout";
    let top = null; for (const sc of e.scripts || []) if (!top || sc.duration > top.duration) top = sc;
    if (!top || top.duration < e.duration * 0.3) return "other";
    const k = `${fileOf(top.sourceURL) || "x"}-${word(top.invokerType).slice(0, 8)}`.slice(0, 24);
    if (Object.keys(hitJs).length < 12 || hitJs[k]) hitJs[k] = (hitJs[k] || 0) + 1;
    return "js";
  }
  const word = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x";
  function hitch(d, now) {
    const i = renderer.info, pr = (i.programs || []).length, m = i.memory;
    let cause = "other";
    if (info0 && pr > info0.p) { // b445: which kinds of shader were built (the shader type and its patches: fade, toon, wind2…)
      for (const pg of (i.programs || []).slice(info0.p, info0.p + 6)) { const ck = String(pg.cacheKey || "").split(","), ty = word(ck[0]), pt = (ck[ck.length - 1] || "").split("|").slice(1).map(word).filter(Boolean).join("-").slice(0, 14), k = (ty + (pt ? "-" + pt : "")).slice(0, 24);
        if (Object.keys(hitSh).length < 12 || hitSh[k]) hitSh[k] = (hitSh[k] || 0) + 1; } }
    if (info0) { if (pr > info0.p) cause = "shader"; else if (m.textures > info0.t) cause = "tex"; else if (m.geometries > info0.g + 10) cause = "geo"; else if (now - wAt < 1500) cause = "move"; else if (now - bAt < 1500) cause = "fight"; }
    if (cause === "other" && now - resAt < 2000) cause = "resume";
    // b447: the last frame's own work (updates + render) against the gap: most of the gap ours is "busy", little of it
    // ours is a "stall" outside our code (the GPU or its driver finishing, the browser, garbage collection). Phones
    // without Long Animation Frames (Samsung Internet) only ever said "other".
    let wk = -1; try { wk = Number(work()); } catch { wk = -1; }
    const split = (c) => (c === "other" && wk >= 0 ? (wk > d * 0.5 ? "busy" : "stall") : c);
    const w = word(lastW), rec = (c) => { const band = d < 200 ? 0 : d < 500 ? 1 : 2, k = `${w}_${c}_${band}`;
      if (hitN < 60) { hit[k] = (hit[k] || 0) + 1; hitN++; }
      if (now - hitAt > 60e3 && Object.keys(hit).length) { hitAt = now; send({ kind: "hitch", dev, q: quality, h: hit, s: hitSh, j: hitJs }); hit = {}; hitSh = {}; hitJs = {}; hitN = 0; } };
    // the long frame's entry arrives a moment after the frame: look it up then
    if (cause === "other" && loafOn) setTimeout(() => { let c = "other"; try { c = whyLong(now - d - 20, now); } catch { /* other */ } rec(split(c)); }, 500);
    else rec(split(cause));
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
  /// b-st3: the first minutes, counted (no id): open → ready → maker → named → start → move → fight → game, and back on another day; nw: a browser here for the first time
  const funnel = (ev, nw = false) => send({ kind: "funnel", ev, dev, nw: nw ? 1 : 0 });
  return { tick, err, gpu, fam, funnel, ready };
}
