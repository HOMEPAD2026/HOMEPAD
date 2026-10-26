// world-studio-pad.js — the Studio on phones (2026-10-26, the owner: "가로모드로 게임 만들고 수정하고 플레이 편하게", "이동 있는 게임은 조이스틱"):
//   makeLand({ T, esc, coarse }) → { enter(), exit(), landscape() } — while the Studio is open a phone goes full screen and holds
//     itself sideways (screen.orientation.lock; Android browsers allow it in full screen). Where it can't (iPhone Safari, a
//     browser that says no) a card asks you to turn the phone, and goes by itself once you do; "Keep portrait" stops asking
//     for this visit. exit() lets go of the lock and the full screen it took, and nothing else.
//   makePad(hud, { mode, T, onLane, onJump, onSlide }) → { x, y, on, hide() } — a thumb stick on the left (it comes to where
//     your thumb lands, in the left part of the screen) and, for the runs, jump / slide buttons on the right.
//     mode "stick": x, y in −1…1 (the arena: y down the screen = toward the camera); "steer": x only (Sky Climb);
//     "lanes": a push left / right changes lane once, up jumps, down slides (Sky Runner, Infinity Dash).
let asked = false, mine = false, card = null, onTurn = null;
const isLand = () => { try { if (screen.orientation && screen.orientation.type) return /landscape/.test(screen.orientation.type); } catch { /* old browser */ } return innerWidth > innerHeight; };
export function makeLand({ T = (s) => s, esc = (s) => s, coarse = false } = {}) {
  function hideCard() { if (card) { card.remove(); card = null; } }
  function showCard() {
    if (card || asked || isLand()) return;
    card = document.createElement("div"); card.className = "wsp-turn"; card.setAttribute("role", "dialog");
    card.innerHTML = `<div class="wsp-turn-in"><i class="wsp-phone" aria-hidden="true"></i><b>${esc(T("Turn your phone sideways"))}</b><p>${esc(T("The Studio is easier to make and play in landscape."))}</p><button type="button" class="wsp-keep">${esc(T("Keep portrait"))}</button></div>`;
    card.querySelector(".wsp-keep").addEventListener("click", () => { asked = true; hideCard(); });
    document.body.appendChild(card);
  }
  const turned = () => { if (isLand()) hideCard(); };
  return {
    landscape: isLand,
    async enter() {
      if (!coarse) return;
      if (!onTurn) { onTurn = () => setTimeout(turned, 200); addEventListener("orientationchange", onTurn); addEventListener("resize", onTurn); }
      if (isLand()) return;
      setTimeout(() => { if (!isLand()) showCard(); }, 700); // (asked whatever the browser does with the requests below — one can hang)
      try {
        const de = document.documentElement;
        if (!document.fullscreenElement && de.requestFullscreen) { await de.requestFullscreen({ navigationUI: "hide" }); mine = true; }
        if (screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
      } catch { /* not allowed here: the card asks instead */ }
    },
    exit() {
      hideCard();
      if (onTurn) { removeEventListener("orientationchange", onTurn); removeEventListener("resize", onTurn); onTurn = null; }
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch { /* nothing held */ }
      if (mine) { mine = false; try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch { /* already out */ } }
    },
  };
}

export function makePad(hud, { mode = "stick", T = (s) => s, onLane = null, onJump = null, onSlide = null } = {}) {
  const P = { x: 0, y: 0, on: false, hide() { el.hidden = true; P.on = false; P.x = P.y = 0; } };
  const el = document.createElement("div"); el.className = "wsp wsp-" + mode;
  el.innerHTML = `<div class="wsp-zone"></div><div class="wsp-base"><i class="wsp-knob"></i></div>${mode === "lanes" ? `<div class="wsp-btns"><button type="button" class="wsp-b wsp-slide" aria-label="${T("Slide")}">⤓</button><button type="button" class="wsp-b wsp-jump" aria-label="${T("Jump")}">⤒</button></div>` : ""}`;
  hud.appendChild(el);
  const zone = el.querySelector(".wsp-zone"), base = el.querySelector(".wsp-base"), knob = el.querySelector(".wsp-knob");
  let id = null, cx = 0, cy = 0, ex = 0, ey = 0; // (ex / ey: which way a lane push has already gone, so one push = one lane)
  const home = () => { base.style.left = ""; base.style.top = ""; base.classList.remove("on"); knob.style.transform = ""; };
  const move = (e) => {
    const R = base.offsetWidth * 0.42 || 50; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; P.x = dx / R; P.y = mode === "steer" ? 0 : dy / R;
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
  for (const [q, f] of [[".wsp-jump", () => onJump && onJump()], [".wsp-slide", () => onSlide && onSlide()]]) { const b = el.querySelector(q); if (b) b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); b.classList.remove("hit"); void b.offsetWidth; b.classList.add("hit"); f(); }); }
  // (the runs listen for swipes on the whole window: a touch that starts on the pad is the pad's)
  for (const k of ["touchstart", "touchend"]) el.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
  return P;
}
