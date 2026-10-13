// world-crew.js — the Crew window (the menu → Crew): found a crew or join one with its invite code, see your crew's
// members, their levels and this week's hunting points, share the code, and this week's crews by points.
// The server keeps it all (api/_world-crew.mjs); your crew's tag shows before your name over your head.
export function createCrew({ T, esc, toast, post, sess, openProfile = null, onTag = () => {}, freeze = () => {} }) {
  const el = document.createElement("aside"); el.className = "wp-mapsheet wp-crewsheet"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  document.body.appendChild(el);
  let crew = null, top = [], busy = false;
  const me = () => { const s = sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  async function load() {
    const s = sess();
    try {
      const [a, b] = await Promise.all([s ? post({ action: "world-crew-me", ...s }) : null, fetch("/api/social?world=crew-top").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      crew = a && a.ok ? a.j.crew : null; top = (b && b.top) || [];
    } catch { /* offline: keep what we had */ }
    onTag(crew ? crew.tag : "");
  }
  const row = (m) => `<li${m.cap ? ' class="cap"' : ""}>${openProfile ? `<button type="button" class="wp-crew-who" data-prof="${esc(m.wallet)}">${esc(m.name || m.w)}</button>` : `<b>${esc(m.name || m.w)}</b>`}<small>Lv ${m.lv}</small><em>${m.pts.toLocaleString("en-US")}</em>${crew && crew.owner === me() && m.wallet !== me() ? `<button type="button" class="wp-link" data-kick="${esc(m.wallet)}">${esc(T("Remove"))}</button>` : m.cap ? `<i>${esc(T("Captain"))}</i>` : ""}</li>`;
  function paint() {
    const signed = !!sess();
    let body;
    if (!signed) body = `<p class="wp-crew-note">${esc(T("Sign in with your wallet to found or join a crew."))}</p>`;
    else if (!crew) body = `<div class="wp-crew-forms">
        <form data-f="make"><h3>${esc(T("Found a crew"))}</h3><label>${esc(T("Name"))}<input name="name" maxlength="20" autocomplete="off" required></label><label>${esc(T("Tag (2–4 letters)"))}<input name="tag" maxlength="4" autocomplete="off" required style="text-transform:uppercase"></label><button type="submit" class="wp-btn go">${esc(T("Found it"))}</button><small>${esc(T("Free. You'll be its captain."))}</small></form>
        <form data-f="join"><h3>${esc(T("Join a crew"))}</h3><label>${esc(T("Invite code"))}<input name="code" maxlength="6" autocomplete="off" required style="text-transform:uppercase"></label><button type="submit" class="wp-btn">${esc(T("Join"))}</button><small>${esc(T("Ask a member for their crew's code."))}</small></form></div>`;
    else body = `<div class="wp-crew-h"><span class="wp-crew-tag">${esc(crew.tag)}</span><div><h3>${esc(crew.name)}</h3><small>${esc(T("{n}/{m} members · {p} hunting points this week", { n: crew.members.length, m: crew.max, p: crew.total.toLocaleString("en-US") }))}</small></div></div>
        <ol class="wp-crew-list">${crew.members.map(row).join("")}</ol>
        <div class="wp-crew-code"><span>${esc(T("Invite code"))}</span><b>${esc(crew.code || "")}</b><button type="button" class="wp-btn" data-copy>${esc(T("Copy"))}</button>${crew.owner === me() ? `<button type="button" class="wp-btn" data-newcode>${esc(T("New code"))}</button>` : ""}</div>
        <button type="button" class="wp-btn wp-danger" data-leave>${esc(T("Leave the crew"))}</button>`;
    el.innerHTML = `<div class="wp-card"><div class="wp-sheet-head"><h2>${esc(T("Crew"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      ${body}
      <h3 class="wp-crew-toph">${esc(T("This week's crews"))}</h3>
      ${top.length ? `<ol class="wp-crew-top">${top.map((c, i) => `<li><i>${i + 1}</i><span class="wp-crew-tag sm">${esc(c.tag)}</span><b>${esc(c.name)}</b><small>${esc(T("{n} members", { n: c.m }))}</small><em>${(c.n || 0).toLocaleString("en-US")}</em></li>`).join("")}</ol>` : `<p class="wp-crew-note">${esc(T("No crews on the board yet this week."))}</p>`}
      <p class="wp-crew-note">${esc(T("Hunting points come from knocking out scammers and bosses; a crew's total is its members' points this week."))}</p></div>`;
  }
  async function act(body, okMsg) {
    if (busy) return; const s = sess(); if (!s) return; busy = true;
    try { const r = await post({ ...body, ...s }); if (!r.ok) toast(T(r.j.error || "That didn't work")); else { if (okMsg) toast(okMsg); await load(); paint(); } } finally { busy = false; }
  }
  el.addEventListener("submit", (e) => {
    e.preventDefault(); const f = e.target.closest("form"); if (!f) return; const d = new FormData(f);
    if (f.dataset.f === "make") act({ action: "world-crew-create", name: d.get("name"), tag: d.get("tag") }, T("Your crew is founded"));
    else act({ action: "world-crew-join", code: d.get("code") }, T("You joined the crew"));
  });
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-x]")) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-copy") && crew && crew.code) { try { navigator.clipboard.writeText(crew.code); toast(T("Code copied")); } catch { toast(crew.code); } }
    if (b.hasAttribute("data-newcode")) act({ action: "world-crew-code" }, T("A new code; the old one stops working"));
    if (b.hasAttribute("data-leave")) { if (b.dataset.sure) act({ action: "world-crew-leave" }, T("You left the crew")); else { b.dataset.sure = "1"; b.textContent = T("Tap again to leave"); } }
    if (b.dataset.prof && openProfile) { openProfile(b.dataset.prof); return; }
    if (b.dataset.kick) act({ action: "world-crew-kick", wallet: b.dataset.kick }, T("Removed from the crew"));
  });
  function hide() { if (el.hidden) return; el.hidden = true; freeze(false); }
  async function show() { el.hidden = false; freeze(true); paint(); await load(); if (!el.hidden) paint(); }
  return { show, hide, isOpen: () => !el.hidden, load };
}
