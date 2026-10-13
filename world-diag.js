// world-diag.js — anonymous health counters for ARCIRCLE World, so problems that only show on some phones can be found:
//   errors   a script error's message (cut to 180 characters), where it came from and the GPU's name; at most five
//            different ones a visit
//   fps      once every three minutes of play: which band the frame rate sat in (under 15, 15–25, 25–35, 35–50, 50+),
//            on a phone or a computer, at which quality
//   memory   once, if GPU memory keeps climbing during a long session (geometries or textures up by 300+ since the
//            first minutes): a leak to look for
// No wallet, no name, no position: only these counters (api/_world.mjs diag). ?nodiag turns it off.
export function createDiag({ post, renderer, quality = "", coarse = false, active = () => true }) {
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
  function tick(dt) {
    if (off || document.hidden || !active()) return;
    acc += dt; n++;
    const now = performance.now();
    if (!base && now - t0 > 120e3) { const m = renderer.info.memory; base = { g: m.geometries, t: m.textures }; }
    if (acc < 180) return;
    const fps = n / acc; acc = 0; n = 0;
    const band = fps < 15 ? 0 : fps < 25 ? 1 : fps < 35 ? 2 : fps < 50 ? 3 : 4;
    if (now - last > 170e3) { last = now; send({ kind: "fps", b: band, dev, q: quality }); }
    if (base && !memSent) { const m = renderer.info.memory, dg = m.geometries - base.g, dtx = m.textures - base.t; if (dg > 300 || dtx > 300) { memSent = true; send({ kind: "mem", g: dg, t: dtx, dev, q: quality }); } }
  }
  return { tick, err, gpu };
}
