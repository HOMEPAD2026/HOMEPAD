// world-wardrobe.js — the ARC Bot wardrobe: parts to wear (head, face, neck, back, aura) and an accent colour, with a
// turning 3D preview of your own ARC Bot. Parts open with your level; nothing here costs anything.
//
// ctx: { THREE, T, esc, level(), charId(), outfit(), save(outfit), toast, Snd }
import { ARCBOTS, makeArcBot, withOutfit, WARDROBE, WARDROBE_SLOTS, WARDROBE_COLORS } from "./world-arcbots.js";

const SLOT_NAME = { head: "Head", face: "Face", neck: "Neck", back: "Back", aura: "Aura" };

export function createWardrobe(ctx) {
  const { THREE, T, esc } = ctx;
  let el = null, open = false, draft = null, r3 = null, scene = null, cam = null, bot = null, raf = 0, spin = 0.5, last = 0;
  const specOf = () => ARCBOTS.find((b) => "arc-" + b.id === ctx.charId()) || null;

  function build() {
    if (!r3) {
      const cv = el.querySelector(".wd-view canvas");
      try { r3 = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { r3 = null; return; }
      r3.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r3.outputColorSpace = THREE.SRGBColorSpace; r3.toneMapping = THREE.ACESFilmicToneMapping; r3.toneMappingExposure = 1.05;
      scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xdff0ff, 0x1a2a3a, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x2ee07a, 0.8); rim.position.set(-3, 1, -2); scene.add(rim);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshBasicMaterial({ color: 0x2f86ff, transparent: true, opacity: 0.18 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
      cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 1.55, 6.2); cam.lookAt(0, 1.05, 0);
    }
    const sp = specOf(); if (!sp) return;
    if (bot) { scene.remove(bot.obj); bot.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    bot = makeArcBot(THREE, withOutfit(sp, draft)); scene.add(bot.obj); bot.obj.rotation.y = spin;
    const cr = bot.obj.getObjectByName("crown"); if (cr) cr.visible = false;
  }
  function loop(t) {
    if (!open) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!r3 || !bot) return;
    const cv = r3.domElement, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r3.getPixelRatio()) || cv.height !== Math.round(h * r3.getPixelRatio())) { r3.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    if (!drag) spin += dt * 0.5; bot.obj.rotation.y = spin; bot.update(dt, t / 1000); r3.render(scene, cam);
  }
  let drag = null;
  function paint() {
    const lv = ctx.level(), sp = specOf();
    const body = el.querySelector(".wd-parts");
    body.innerHTML = !sp ? `<p class="wd-note">${esc(T("The wardrobe is for the ARC Bots. Pick one in Settings → Change character."))}</p>` :
      WARDROBE_SLOTS.map((sl) => `<section><h3>${esc(T(SLOT_NAME[sl]))}</h3><div class="wd-row"><button type="button" data-wslot="${sl}" data-wid="" aria-pressed="${!(draft.wear || {})[sl]}">${esc(T("The look's own"))}</button>${WARDROBE.filter((w) => w.slot === sl).map((w) => {
        const locked = lv < w.lv; return `<button type="button" data-wslot="${sl}" data-wid="${w.id}" aria-pressed="${(draft.wear || {})[sl] === w.id}" ${locked ? "disabled" : ""}>${esc(T(w.name))}${locked ? `<small>${esc(T("Lv {n}", { n: w.lv }))}</small>` : ""}</button>`; }).join("")}</div></section>`).join("") +
      `<section><h3>${esc(T("Accent colour"))}</h3><div class="wd-row wd-colors">${WARDROBE_COLORS.map(([hex, name]) => `<button type="button" data-wcol="${hex}" aria-pressed="${(draft.accent || "") === hex}" title="${esc(T(name))}" style="--c:${hex ? "#" + hex : "conic-gradient(#2f86ff,#2ee07a,#ffc861,#ff4d6d,#2f86ff)"}"><i></i><span>${esc(T(name))}</span></button>`).join("")}</div></section>`;
    el.querySelector(".wd-name").textContent = sp ? sp.name : "";
  }
  function show() {
    if (!el) {
      el = document.createElement("div"); el.className = "wd-sheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
      el.innerHTML = `<div class="wd-card"><button type="button" class="wp-btn wp-x" data-wx aria-label="${esc(T("Close"))}">×</button>
        <h2>${esc(T("Wardrobe"))} <span class="wd-name"></span></h2><p class="wd-note">${esc(T("Parts open as you level up. Drag the preview to turn it."))}</p>
        <div class="wd-body"><div class="wd-view"><canvas></canvas></div><div class="wd-parts"></div></div>
        <div class="wd-acts"><button type="button" class="wp-cta" data-wsave>${esc(T("Wear this"))}</button><button type="button" class="wp-btn" data-wreset>${esc(T("Take it all off"))}</button></div></div>`;
      document.body.appendChild(el);
      el.addEventListener("click", onClick);
      const cv = el.querySelector(".wd-view canvas");
      cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, s: spin }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener("pointermove", (e) => { if (drag) spin = drag.s + (e.clientX - drag.x) * 0.012; });
      cv.addEventListener("pointerup", () => { drag = null; });
      addEventListener("keydown", (e) => { if (open && e.key === "Escape") { e.stopImmediatePropagation(); hide(); } }, true);
    }
    const o = ctx.outfit() || {}; draft = { wear: { ...(o.wear || {}) }, accent: o.accent || "" };
    open = true; el.hidden = false; paint(); build(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function hide() { if (!el) return; open = false; el.hidden = true; cancelAnimationFrame(raf); }
  function onClick(e) {
    if (e.target === el) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-wx")) { hide(); return; }
    if (b.dataset.wslot != null) { draft.wear = { ...(draft.wear || {}) }; if (b.dataset.wid) draft.wear[b.dataset.wslot] = b.dataset.wid; else delete draft.wear[b.dataset.wslot]; paint(); build(); ctx.Snd.pick && ctx.Snd.pick(); return; }
    if (b.dataset.wcol != null) { draft.accent = b.dataset.wcol; paint(); build(); ctx.Snd.pick && ctx.Snd.pick(); return; }
    if (b.hasAttribute("data-wreset")) { draft = { wear: {}, accent: "" }; paint(); build(); return; }
    if (b.hasAttribute("data-wsave")) { ctx.save({ wear: { ...draft.wear }, accent: draft.accent }); hide(); ctx.toast(T("New look on")); }
  }
  return { show, hide, isOpen: () => open, draft: () => draft };
}
