// world-mythic.js — the Crimson Celestial set's window (world-mythic-data.js; the pieces are the server's: api/_world-mythic.mjs):
// the six slots with the art cut from the owner's set sheet (images/mythic), the pieces you hold in each (wear / take off),
// the five set bonuses lit as you reach them, where they drop and how often. And the reveal when a run drops one.
//   ctx: { T, esc, post(b), sess(), level(), state() → { pieces, eq } | null, refresh() → Promise, toast(html), freeze(on), ver, Snd }
import { CC, pieceOf, mythicStats, setBonus } from "./world-mythic-data.js";

const STAT = { atk: "ATK", def: "DEF", hp: "HP", sp: "SP", crit: "Crit %", spd: "Speed", critDmg: "Crit DMG %", skillPct: "Skill DMG %", dr: "DMG taken −%", atkPct: "ATK %", defPct: "DEF %", hpPct: "HP %" };
const SRC = { lysitha: "Lv 100 · Lysitha", solvira: "Lv 200 · Solvira", nyxara: "Lv 300 · Nyxara", throne: "Lv 400 · Throne of Three", secret: "SECRET" };
const img = (P, ver) => `/images/mythic/${P.glb}.webp${ver || ""}`;

export function makeMythicUI(ctx) {
  const { T, esc } = ctx;
  let el = null, pick = "";
  const statLine = (o) => Object.entries(o).filter(([k, v]) => v && STAT[k]).map(([k, v]) => `${T(STAT[k])} +${v}`).join(" · ");
  function paint() {
    if (!el) return; const st = ctx.state() || { pieces: [], eq: {} }, lv = ctx.level(), pcs = st.pieces || [], eq = st.eq || {};
    const worn = Object.values(eq).map((id) => pcs.find((p) => p.id === id)).filter((p) => p && p.req <= lv), sb = setBonus(worn);
    const slotCard = (P) => { const mine = pcs.filter((p) => p.def === P.id), w = mine.find((p) => p.id === eq[P.slot]);
      return `<button type="button" class="my-slot${w ? " on" : ""}${mine.length ? "" : " none"}${pick === P.slot ? " sel" : ""}" data-slot="${P.slot}"><img src="${img(P, ctx.ver)}" alt=""><b>${esc(T(P.name))}</b><small>${esc(T(P.line))}</small><i>${w ? "✓ " + esc(T("Worn")) : mine.length ? esc(T("{n} held", { n: mine.length })) : "—"}</i></button>`; };
    const P0 = pick && CC.PIECES.find((p) => p.slot === pick), list = P0 ? pcs.filter((p) => p.def === P0.id) : [];
    const detail = P0 ? `<div class="my-list"><h4>${esc(T(P0.name))}</h4>${list.length ? list.map((p) => { const on = eq[P0.slot] === p.id, low = p.req > lv;
        return `<div class="my-pc${on ? " on" : ""}"><span><b>${esc(T(SRC[p.src] || p.src))}</b><small>${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult} · +${p.plus || 0}</small><em>${esc(statLine(mythicStats(p)))}</em></span>
          <button type="button" data-eq="${p.id}" ${low && !on ? "disabled" : ""}>${on ? esc(T("Take off")) : low ? "🔒 Lv " + p.req : esc(T("Wear"))}</button></div>`; }).join("")
      : `<p class="my-empty">${esc(T("Not found yet. It drops from RAID QUEENS runs."))}</p>`}</div>` : "";
    el.innerHTML = `<div class="my-card"><header><div><small>MYTHIC · ${esc(T("SET"))}</small><h3>${esc(T("Crimson Celestial"))}</h3><p>${esc(T("{a} / 6 worn · {b} / 5 bonuses", { a: sb.n, b: sb.active.length }))}</p></div><button type="button" class="my-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="my-body"><div class="my-slots">${CC.PIECES.map(slotCard).join("")}</div>${detail}
      <div class="my-bon">${CC.BONUS.map(([n, name, b]) => `<div class="${sb.n >= n ? "on" : ""}"><i>${n}</i><span><b>${esc(T(name))}</b><small>${esc(statLine(b))}${b.aura ? " · " + esc(T("Crimson aura")) : ""}</small></span></div>`).join("")}</div>
      <div class="my-drop"><h4>${esc(T("Where it drops"))}</h4>${Object.entries(CC.DROP).map(([k, d]) => `<span><b>${esc(T(SRC[k]))}</b>${+(d.rate * 100).toFixed(2)}% · ${esc(T("worn from Lv {n}", { n: d.req }))} · ×${d.mult}</span>`).join("")}
      <p>${esc(T("One of the six at equal odds on a won run. Kept on the server, never in your device's save."))}</p></div></div></div>`;
  }
  async function wear(id) {
    const st = ctx.state() || { pieces: [], eq: {} }, p = (st.pieces || []).find((x) => x.id === id), P = p && pieceOf(p.def); if (!P) return;
    const on = (st.eq || {})[P.slot] === id, r = await ctx.post({ action: "world-mythic-equip", ...ctx.sess(), slot: P.slot, id: on ? null : id });
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); return; }
    await ctx.refresh(); paint(); try { if (ctx.Snd && ctx.Snd.equip) ctx.Snd.equip(); } catch { /* no sound */ }
  }
  function open(slot) {
    if (typeof document === "undefined" || el) return; pick = slot || "";
    el = document.createElement("div"); el.className = "my-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); document.body.appendChild(el); ctx.freeze(true);
    el.addEventListener("click", (e) => { const s = e.target.closest("[data-slot]"), q = e.target.closest("[data-eq]");
      if (q && !q.disabled) { wear(q.dataset.eq); return; } if (s) { pick = pick === s.dataset.slot ? "" : s.dataset.slot; paint(); return; }
      if (e.target === el || e.target.closest(".my-x")) close(); });
    paint(); ctx.refresh().then(paint);
  }
  function close() { if (el) { el.remove(); el = null; ctx.freeze(false); } }
  /// the drop's moment: a dark card, the piece rising in red light, its name, where to wear it
  function reveal(p) {
    const P = pieceOf(p && p.def); if (!P || typeof document === "undefined") return;
    const r = document.createElement("div"); r.className = "my-rev"; r.setAttribute("role", "dialog"); r.setAttribute("data-no-i18n", "");
    r.innerHTML = `<div class="my-rev-in"><small>MYTHIC · ${esc(T("Crimson Celestial"))}</small><div class="my-rev-art"><img src="${img(P, ctx.ver)}" alt=""></div><b>${esc(T(P.name))}</b><p>${esc(T(SRC[p.src] || p.src))} · ${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult}</p><em>${esc(statLine(mythicStats(p)))}</em>
      <div class="my-rev-acts"><button type="button" data-k="ok">${esc(T("OK"))}</button><button type="button" class="go" data-k="set">${esc(T("Open the set"))}</button></div></div>`;
    document.body.appendChild(r);
    r.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; r.remove(); if (b.dataset.k === "set") open(P.slot); });
    try { if (ctx.Snd && ctx.Snd.perfect) ctx.Snd.perfect(); } catch { /* no sound */ }
  }
  return { open, close, reveal, shown: () => !!el };
}
