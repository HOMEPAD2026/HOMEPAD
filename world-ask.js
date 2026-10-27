// ARCIRCLE World — the game's own yes / no card (STB7, 2026-10-27: the browser's confirm() looked out of place and
// stopped the page on phones). ask(T, text, { ok, cancel, danger }) → Promise<boolean>; Escape / a tap outside = no.
export function ask(T, text, o = {}) {
  return new Promise((done) => {
    const el = document.createElement("div"); el.className = "wak"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    el.innerHTML = `<div class="wak-in"><p>${esc(text)}</p><div class="wak-b"><button type="button" class="wak-no">${esc(o.cancel || T("Cancel"))}</button><button type="button" class="wak-yes${o.danger ? " danger" : ""}">${esc(o.ok || T("OK"))}</button></div></div>`;
    const end = (v) => { removeEventListener("keydown", key, true); el.classList.add("out"); setTimeout(() => el.remove(), 160); done(v); };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); } if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); end(true); } };
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest(".wak-no")) end(false); else if (e.target.closest(".wak-yes")) end(true); });
    addEventListener("keydown", key, true); document.body.appendChild(el); setTimeout(() => { const y = el.querySelector(".wak-yes"); if (y) y.focus(); }, 30);
  });
}
