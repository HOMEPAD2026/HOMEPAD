// world-studio-pad.js — the Studio on phones (2026-10-26, the owner: "가로모드로 게임 만들고 수정하고 플레이 편하게", "이동 있는 게임은 조이스틱"):
//   makeGate({ T, esc, coarse, onBack, ver }) → { on(kind, yes), landscape() } — Creator City and the Studio are played sideways
//     (the owner, 2026-10-26: "가로로 맞춰야 진행 가능하게 … 아니면 게임월드 기존 게임 하던 대로 돌아가기 버튼"): while any kind
//     is on and a phone is held upright, a full-screen gate stands in front of everything — "Turn sideways" (full screen and
//     held sideways, on the tap itself as a browser asks; Android browsers) or "Back to Game World" (onBack). It goes by
//     itself once the phone is sideways, and comes back if it's turned upright again. When the last kind goes off, what
//     the gate took is let go, and a phone still sideways gets a small card asking to turn it upright again (the owner:
//     "여기를 나가면 다시 세로 모드로"). The screen never turns by itself (the owner, earlier the same day).
//   makeLand(...) — the older shape ({ enter, exit }), kept for the Studio's own fallback.
//   makePad(hud, { mode, T, onLane, onJump, onSlide }) → { x, y, on, hide() } — a thumb stick on the left (it comes to where
//     your thumb lands) and, for the runs, jump / slide buttons on the right. mode "stick": x, y in −1…1; "steer": x only;
//     "lanes": a push left / right changes lane once, up jumps, down slides.
const isLand = () => innerWidth > innerHeight; // (the page's own shape: it follows a turn on every browser, and a split screen too)
const canLock = () => !!(document.documentElement.requestFullscreen && screen.orientation && screen.orientation.lock);
export function makeGate({ T = (s) => s, esc = (s) => s, coarse = false, onBack = null, ver = "" } = {}) {
  const want = new Set(); let el = null, hint = null, mine = false, was = false, hintT = 0, listening = false;
  async function lockIt(btn) {
    if (btn) btn.classList.add("busy");
    try {
      const de = document.documentElement;
      if (!document.fullscreenElement && de.requestFullscreen) { await de.requestFullscreen({ navigationUI: "hide" }); mine = true; }
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
    } catch { if (el) el.classList.add("manual"); } // (no lock on this browser: the card says how to turn it by hand)
    if (btn) btn.classList.remove("busy"); setTimeout(check, 350);
  }
  function show() {
    if (el) return;
    el = document.createElement("div"); el.className = "wsg" + (canLock() ? "" : " manual"); el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.style.setProperty("--art", `url("/images/cc/gate-tall.webp${ver}"), url("/images/gw/key-cc.webp${ver}")`);
    el.innerHTML = `<div class="wsg-art" aria-hidden="true"></div><div class="wsg-glow" aria-hidden="true"></div>
      <div class="wsg-top"><small>ARCIRCLE STUDIO BETA</small><span>${esc(T("Creator City"))}</span></div>
      <div class="wsg-in">
        <div class="wsg-ph" aria-hidden="true"><i class="wsg-phone"><em></em></i><svg viewBox="0 0 120 120"><path d="M20 70 A44 44 0 0 1 86 26" /><path class="hd" d="M78 16 L90 26 L76 34" /></svg></div>
        <b>${esc(T("Turn your phone sideways"))}</b>
        <p>${esc(T("Creator City and the Studio are made for landscape — building, testing and playing all fit on one screen."))}</p>
        <button type="button" class="wsg-go"><span>⟳</span>${esc(T("Turn sideways"))}</button>
        <p class="wsg-man">${esc(T("Is auto-rotate off? Swipe down from the top and turn on Auto rotate, then turn your phone."))}</p>
        <button type="button" class="wsg-back">← ${esc(T("Back to Game World"))}</button>
      </div>`;
    el.querySelector(".wsg-go").addEventListener("click", (e) => lockIt(e.currentTarget));
    el.querySelector(".wsg-back").addEventListener("click", () => { hide(); if (onBack) onBack([...want]); });
    for (const k of ["pointerdown", "touchstart", "keydown", "wheel"]) el.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(el); requestAnimationFrame(() => el && el.classList.add("in"));
  }
  function hide() { if (!el) return; const e = el; el = null; e.classList.remove("in"); e.classList.add("out"); setTimeout(() => e.remove(), 320); }
  function showHint() {
    if (hint) return; hint = document.createElement("div"); hint.className = "wsg-hint"; hint.setAttribute("role", "status");
    hint.innerHTML = `<i class="wsg-phone up"><em></em></i><span><b>${esc(T("Back in the Game World"))}</b><small>${esc(T("Turn your phone upright again."))}</small></span><button type="button" aria-label="${esc(T("Close"))}">✕</button>`;
    hint.querySelector("button").addEventListener("click", hideHint); document.body.appendChild(hint); clearTimeout(hintT); hintT = setTimeout(hideHint, 9000);
  }
  function hideHint() { clearTimeout(hintT); if (hint) { hint.remove(); hint = null; } }
  function release() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch { /* nothing held */ }
    if (mine) { mine = false; try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* already out */ } }
  }
  function check() {
    if (!coarse) return;
    if (want.size) { was = true; hideHint(); if (isLand()) hide(); else show(); return; }
    hide(); if (was) { was = false; release(); if (isLand()) setTimeout(() => { if (!want.size && isLand()) showHint(); }, 450); } // (exiting full screen settles first)
    else if (hint && !isLand()) hideHint();
  }
  return {
    landscape: isLand,
    shown: () => !!el,
    on(kind, yes) {
      if (!coarse) return;
      if (!listening) { listening = true; const f = () => setTimeout(check, 220); addEventListener("orientationchange", f); addEventListener("resize", f); }
      const had = want.has(kind); if (yes) want.add(kind); else want.delete(kind); if (had !== !!yes) check();
    },
  };
}
export function makeLand(o = {}) { const g = makeGate(o); return { landscape: g.landscape, enter() { g.on("studio", true); }, exit() { g.on("studio", false); } }; }

export function makePad(hud, { mode = "stick", T = (s) => s, onLane = null, onJump = null, onSlide = null, onJumpUp = null, onAct = null } = {}) {
  const P = { x: 0, y: 0, on: false, hide() { el.hidden = true; P.on = false; P.x = P.y = 0; } };
  const el = document.createElement("div"); el.className = "wsp wsp-" + mode;
  el.innerHTML = `<div class="wsp-zone"></div><div class="wsp-base"><i class="wsp-knob"></i></div>${mode === "lanes" ? `<div class="wsp-btns"><button type="button" class="wsp-b wsp-slide" aria-label="${T("Slide")}">⤓</button><button type="button" class="wsp-b wsp-jump" aria-label="${T("Jump")}">⤒</button></div>` : mode === "side" ? `<div class="wsp-btns">${onAct ? `<button type="button" class="wsp-b wsp-act" aria-label="${T("Dig")}">⛏</button>` : ""}<button type="button" class="wsp-b wsp-jump" aria-label="${T("Jump")}">⤒</button></div>` : ""}`;
  hud.appendChild(el);
  const zone = el.querySelector(".wsp-zone"), base = el.querySelector(".wsp-base"), knob = el.querySelector(".wsp-knob");
  let id = null, cx = 0, cy = 0, ex = 0, ey = 0; // (ex / ey: which way a lane push has already gone, so one push = one lane)
  const home = () => { base.style.left = ""; base.style.top = ""; base.classList.remove("on"); knob.style.transform = ""; };
  const move = (e) => {
    const R = base.offsetWidth * 0.42 || 50; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; P.x = dx / R; P.y = mode === "steer" || mode === "side" ? 0 : dy / R;
    if (mode === "lanes") {
      if (ex === 0 && Math.abs(P.x) > 0.55) { ex = Math.sign(P.x); if (onLane) onLane(ex); } else if (Math.abs(P.x) < 0.3) ex = 0;
      if (ey === 0 && Math.abs(P.y) > 0.6) { ey = Math.sign(P.y); if (ey < 0 && onJump) onJump(); if (ey > 0 && onSlide) onSlide(); } else if (Math.abs(P.y) < 0.3) ey = 0;
    }
  };
  zone.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault(); if (id !== null) return; id = e.pointerId; try { zone.setPointerCapture(id); } catch { /* fine */ }
    const s = base.offsetWidth; cx = e.clientX; cy = e.clientY; base.style.left = cx - s / 2 + "px"; base.style.top = cy - s / 2 + "px"; base.classList.add("on"); P.on = true; ex = ey = 0; move(e);
  });
  zone.addEventListener("pointermove", (e) => { if (e.pointerId === id) { e.stopPropagation(); move(e); } });
  const up = (e) => { if (e.pointerId !== id) return; e.stopPropagation(); id = null; P.on = false; P.x = P.y = 0; ex = ey = 0; home(); };
  zone.addEventListener("pointerup", up); zone.addEventListener("pointercancel", up);
  { const jb = el.querySelector(".wsp-jump"); if (jb && onJumpUp) for (const k of ["pointerup", "pointercancel", "pointerleave"]) jb.addEventListener(k, () => onJumpUp()); } // (SB-2: let go early for a short hop)
  for (const [q, f] of [[".wsp-jump", () => onJump && onJump()], [".wsp-slide", () => onSlide && onSlide()], [".wsp-act", () => onAct && onAct()]]) { const b = el.querySelector(q); if (b) b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); b.classList.remove("hit"); void b.offsetWidth; b.classList.add("hit"); f(); }); }
  // (the runs listen for swipes on the whole window: a touch that starts on the pad is the pad's)
  for (const k of ["touchstart", "touchend"]) el.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
  return P;
}
