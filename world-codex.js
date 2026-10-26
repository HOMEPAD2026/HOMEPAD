// world-codex.js — the item codex window (the owner's mock-up, 2026-10-24): every gear kind — 7 slots × 5 tiers (the sets)
// × 5 grades = 175 — and the one-of-a-kind pieces. What's been held is the server's (api/_world-codex.mjs, marked when a
// save arrives) plus what you hold right now; a tap shows a kind's stats, set, level, where it drops and when you first
// found it. Milestones (10 / 25 / 50 / 100 / 175) pay ARCL and supplies or a title, once each; a full column (one slot's
// tier in every grade) gives a small stat bonus for good. Art: images/ui/codex (cut from the mock-up), item pictures
// images/ui/codex/items/<slot>-<tier>-<grade>.webp where there is one (the drawn icon otherwise).
// ctx: { T, esc, toast, sess, post, signIn, level, items(), addSupply(kind, n), onBonus(bonus, titles), wearTitle(id), worn(),
//        openMonsters(), openMap(), onOpen, onClose, ver }
import { SLOTS, SLOT_NAME, RARITY, TIERS, BASES, UNIQUE, itemStats, STAT_NAME, ZONES } from "./world-rpg-data.js";
import { iconSvg } from "./world-rpg.js";
import { weaponThumb, gearThumb } from "./world-gear3d.js";
import { art } from "./world-itemart.js";

const GRADES = RARITY.length, ALL = SLOTS.length * TIERS.length * GRADES;
const LOCKED = [["craft", "🔨", "Crafting codex"], ["mat", "🪨", "Materials codex"], ["pet", "🐾", "Pet codex"], ["card", "🃏", "Card codex"], ["look", "🎀", "Cosmetics codex"]];
const UNIQ = { jack: { slot: "weapon", tier: 4, r: 4, line: "The Pumpkin King's blade. Its fire never goes out.", from: "Inferno Jack, Lv 95 (Halloween nights): the top hitter", lv: 20 } };
// where a tier drops: the hunting grounds whose levels fall in that tier's band (Legendary: their bosses)
const zonesOf = (tier) => { const a = TIERS[tier].lv, b = tier < TIERS.length - 1 ? TIERS[tier + 1].lv : 101; return ZONES.filter((z) => z.lv[0] < b && z.lv[1] > a); };

export function createCodex(ctx) {
  const { T, esc } = ctx;
  let el = null, slot = "weapon", pick = null, data = null, busy = false;
  const key = (s, t, r) => `${s}-${t}:${r}`;
  async function load() {
    const s = ctx.sess && ctx.sess(); // (a guest gets the milestones only)
    try { const r = await fetch("/api/social?world=codex" + (s ? "&wallet=" + encodeURIComponent(s.wallet.toLowerCase()) : ""), { cache: "no-store" }); if (r.ok) data = await r.json(); } catch { /* the local view below */ }
    if (!s) return;
    if (data && ctx.onBonus) ctx.onBonus(data.bonus || null, titles());
  }
  const titles = () => (data ? (data.steps || []).filter((x) => x.title && (data.got || []).includes(x.n)).map((x) => x.title) : []);
  /// what counts as found: the server's marks plus what you hold now (only what your level can wear, as the server counts)
  function marks() {
    const m = {}; for (const [k, v] of Object.entries((data && data.marks) || {})) m[k] = { at: v.at, p: v.p, srv: 1 };
    const lv = ctx.level(), u = { ...((data && data.uniq) || {}) };
    for (const it of ctx.items()) { const mm = /^([a-z]+)-([0-4])$/.exec(String(it && it.b)); if (!mm || TIERS[+mm[2]].lv > lv) continue; const k = `${it.b}:${it.r || 0}`; if (!m[k]) m[k] = { at: 0, p: it.p || 0 }; else m[k].p = Math.max(m[k].p || 0, it.p || 0); if (it.u && UNIQ[it.u] && !u[it.u]) u[it.u] = 1; }
    return { m, u };
  }
  const pic = (s, t, r) => (s === "weapon" ? `/images/ui/codex/items/${s}-${t}-${r}.webp${ctx.ver || ""}` : `/images/ui/codex/items/${s}-${t}.webp${ctx.ver || ""}`); // (b-nx3: the other six slots one Meshy picture a tier — the grade is the cell's colour)
  // the bag's own 3D thumbnails under the drawn picture (where the mock-up has one: the weapons)
  const thumb = (s, t, c) => { try { const u = s === "weapon" ? weaponThumb(0, t, c) : gearThumb(s, t, c); if (u) return `<img class="cx-3d" src="${u}" alt="">`; } catch { /* the drawn icon */ } return iconSvg(s, c); };
  function cell(s, t, r, M) {
    const got = M.m[key(s, t, r)], c = RARITY[r].color, sel = pick && pick.s === s && pick.t === t && pick.r === r && !pick.u;
    return `<button type="button" class="cx-c${got ? " got" : ""}${sel ? " on" : ""}" style="--rc:${c}" data-cx="${s}:${t}:${r}" aria-label="${esc(got ? T(BASES[s][t]) + " · " + T(RARITY[r].name) : "?")}">${got ? `${thumb(s, t, c)}<img class="cx-pic" src="${pic(s, t, r)}" alt="" onerror="this.remove()">${got.p ? `<em>+${got.p}</em>` : ""}` : `<i aria-hidden="true">?</i>`}</button>`;
  }
  function detail(M) {
    if (!pick) return `<div class="cx-d cx-empty"><p>${esc(T("Tap a piece to see it."))}</p></div>`;
    const u = pick.u ? UNIQ[pick.u] : null, s = u ? u.slot : pick.s, t = u ? u.tier : pick.t, r = u ? u.r : pick.r, got = u ? M.u[pick.u] : M.m[key(s, t, r)];
    const name = u ? T(UNIQUE[pick.u]) : T(BASES[s][t]), st = itemStats({ b: `${s}-${t}`, r, lv: TIERS[t].lv, p: 0 });
    const zs = zonesOf(t), from = u ? T(u.from) : r >= 4 ? T("Bosses of {x}", { x: zs.map((z) => T(z.name)).join(" · ") }) : zs.map((z) => `${T(z.name)} (Lv ${z.lv[0]}–${z.lv[1]})`).join(" · ") + (t <= 3 ? " · " + T("the Magic Forge") : "");
    const when = got && got.at ? new Date(got.at).toLocaleDateString() : got ? T("held now — saved on your next save") : "";
    const art = u && pick.u === "jack" ? `<img class="cx-dart" src="/images/ui/codex/jack.webp${ctx.ver || ""}" alt="">` : got ? `<span class="cx-dic" style="--rc:${RARITY[r].color}">${thumb(s, t, RARITY[r].color)}<img class="cx-pic" src="${pic(s, t, r)}" alt="" onerror="this.remove()"></span>` : `<span class="cx-dic q">?</span>`;
    return `<div class="cx-d${u ? " uniq" : ""}" style="--rc:${RARITY[r].color}"><div class="cx-dh"><h3>${esc(got ? name : "???")}</h3><span class="cx-badge">${esc(u ? T("Unique") : T(RARITY[r].name))}</span></div>
      <p class="cx-dl">${esc(u ? T(u.line) : T("{set} set · {slot}", { set: T(TIERS[t].set), slot: T(SLOT_NAME[s]) }))}</p>${art}
      <dl class="cx-st">${Object.entries(st).map(([k, v]) => `<div><dt>${esc(T(STAT_NAME[k] || k))}</dt><dd>+${v}</dd></div>`).join("")}</dl>
      <dl class="cx-inf"><div><dt>${esc(T("Set"))}</dt><dd>${esc(T(TIERS[t].set))}</dd></div><div><dt>${esc(T("Needs level"))}</dt><dd>Lv ${u ? u.lv : TIERS[t].lv}</dd></div><div><dt>${esc(T("Where it drops"))}</dt><dd>${esc(from)}</dd></div><div><dt>${esc(T("First found"))}</dt><dd>${esc(when || "—")}</dd></div>${got && got.p ? `<div><dt>${esc(T("Your best"))}</dt><dd>+${got.p}</dd></div>` : ""}</dl>
      <button type="button" class="cx-btn" data-cxmap>📍 ${esc(T("Show on the map"))}</button></div>`;
  }
  function steps(n) {
    const got = (data && data.got) || [], st = (data && data.steps) || [];
    return `<section class="cx-rew"><h4>${esc(T("Collection rewards"))} <small>${esc(T("The more you collect, the more you get."))}</small></h4><ol>${st.map((x) => { const done = got.includes(x.n), can = !done && n >= x.n;
      return `<li class="${done ? "done" : can ? "can" : ""}"><b>${esc(T("{n} kinds", { n: x.n }))}</b><span class="cx-ri">${x.title ? "🏅" : art(x.n >= 50 ? "chest" : x.n >= 25 ? "box" : "hp", 40)}</span><small>${esc(T(x.name))}</small><em>+${x.arcl.toLocaleString()} ARCL</em>${done ? `<i class="cx-ok">✓</i>` : can ? `<button type="button" class="cx-claim" data-cxclaim="${x.n}" ${busy ? "disabled" : ""}>${esc(T("Claim"))}</button>` : ""}</li>`; }).join("")}</ol></section>`;
  }
  function sets(M) {
    const done = []; for (const s of SLOTS) for (let t = 0; t < TIERS.length; t++) { let all = true; for (let r = 0; r < GRADES; r++) if (!M.m[key(s, t, r)]) { all = false; break; } if (all) done.push([s, t]); }
    const cur = SLOTS.indexOf(slot) >= 0 ? Array.from({ length: TIERS.length }, (_, t) => [t, Array.from({ length: GRADES }, (_, r) => (M.m[key(slot, t, r)] ? 1 : 0)).reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1])[0] : null;
    const BON = { weapon: "Attack +1%", shield: "Defense +1%", armor: "Max HP +1%", helm: "Defense +1%", ring: "Critical +0.5", boots: "Speed +1", necklace: "Attack +1%" };
    return `<section class="cx-set"><h4>${esc(T("Set collection bonus"))}</h4><p>${esc(T("Collect all five grades of one slot's tier for a bonus that lasts."))}</p>
      ${done.length ? done.map(([s, t]) => `<div class="cx-sb done"><span>${esc(T("{set} {slot} (5/5)", { set: T(TIERS[t].set), slot: T(SLOT_NAME[s]) }))}</span><b>✓ ${esc(T(BON[s]))}</b></div>`).join("") : ""}
      ${cur && cur[1] < GRADES ? `<div class="cx-sb"><span>${esc(T("{set} {slot} ({n}/5)", { set: T(TIERS[cur[0]].set), slot: T(SLOT_NAME[slot]), n: cur[1] }))}</span><i style="--k:${cur[1] / GRADES}"></i><b>${esc(T(BON[slot]))}</b></div>` : ""}</section>`;
  }
  function paint() {
    if (!el) return; const M = marks(), n = Object.keys(M.m).length, pct = Math.round((n / ALL) * 100);
    el.innerHTML = `<div class="cx-in" role="document"><button type="button" class="cx-x" data-x aria-label="${esc(T("Close"))}">×</button>
      <aside class="cx-nav"><b class="cx-navh">📖 ${esc(T("Adventure log"))}</b><button type="button" class="on">🧰 ${esc(T("Item codex"))}</button><button type="button" data-cxnav="jur">🦖 ${esc(T("Jurassic codex"))}</button><button type="button" data-cxnav="scam">🦹 ${esc(T("Scammer codex"))}</button>
        ${LOCKED.map(([id, ic, nm]) => `<button type="button" class="lock" disabled>🔒 ${esc(T(nm))}<small>${esc(T("Coming soon"))}</small></button>`).join("")}<img class="cx-hero" src="/images/ui/codex/hero.webp${ctx.ver || ""}" alt=""></aside>
      <main class="cx-main"><header class="cx-h"><img class="cx-chest" src="/images/ui/codex/chest.webp${ctx.ver || ""}" alt=""><div><h2>${esc(T("Item codex"))}</h2><p>${esc(T("Collect every piece of gear in the world and earn special rewards!"))}</p></div><img class="cx-knight" src="/images/ui/codex/knight.webp${ctx.ver || ""}" alt="">
        <div class="cx-prog"><span>${esc(T("Collected"))}</span><b>${n} <small>/ ${ALL}</small></b><i style="--k:${n / ALL}"></i><em>${pct}%</em></div></header>
        ${ctx.sess && ctx.sess() ? "" : `<p class="cx-note">👛 ${esc(T("Sign in with a wallet to keep your codex and claim its rewards."))} <button type="button" class="cx-btn sm" data-cxsign>${esc(T("Sign in"))}</button></p>`}
        <nav class="cx-tabs">${SLOTS.map((s) => `<button type="button" data-cxslot="${s}" class="${s === slot ? "on" : ""}">${iconSvg(s, "#cfe0f5")}<span>${esc(T(SLOT_NAME[s]))}</span></button>`).join("")}</nav>
        <div class="cx-body"><div class="cx-grid"><span class="cx-corner"></span>${TIERS.map((t, i) => `<span class="cx-th t${i}"><b>T${i + 1}</b>${esc(T(t.set))}</span>`).join("")}
          ${RARITY.map((g, r) => `<span class="cx-rh" style="--rc:${g.color}"><i></i>${esc(T(g.name))}</span>${TIERS.map((_, t) => cell(slot, t, r, M)).join("")}`).join("")}</div>
          ${detail(M)}</div>
        ${slot === "weapon" ? `<div class="cx-uq"><b>✨ ${esc(T("One of a kind"))}</b>${Object.keys(UNIQ).map((u) => `<button type="button" class="cx-c uq${M.u[u] ? " got" : ""}${pick && pick.u === u ? " on" : ""}" data-cxu="${u}" style="--rc:#ff7a2e">${M.u[u] ? `<img src="/images/ui/codex/jack.webp${ctx.ver || ""}" alt="">` : "<i>?</i>"}</button>`).join("")}</div>` : ""}
        <div class="cx-foot">${steps(n)}${sets(M)}</div></main></div>`;
  }
  async function claim(n) {
    if (busy) return; if (!ctx.sess()) { try { await ctx.signIn(); } catch { return; } } const s = ctx.sess(); if (!s) return;
    busy = true; paint(); let r = null; try { r = await ctx.post({ action: "world-codex-claim", n, wallet: s.wallet, issued: s.issued, signature: s.signature }); } catch { r = null; } busy = false;
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) || T("No connection — try again"))); paint(); return; }
    if (r.j.supply && ctx.addSupply) ctx.addSupply(r.j.supply.kind, r.j.supply.n);
    if (data) data.got = r.j.got;
    ctx.toast(`🎁 +${(r.j.arcl || 0).toLocaleString()} ARCL${r.j.title ? " · 🏅 " + esc(T("New title")) : ""}`);
    if (r.j.title && ctx.wearTitle) ctx.wearTitle(r.j.title);
    if (ctx.onBonus) ctx.onBonus((data && data.bonus) || null, titles()); if (ctx.onClaim) ctx.onClaim(r.j);
    paint();
  }
  async function open() {
    if (!el) { el = document.createElement("div"); el.className = "cx"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el);
      el.addEventListener("click", (e) => { const b = e.target.closest("button"); if (e.target === el) return close(); if (!b || b.disabled) return;
        if (b.hasAttribute("data-x")) return close();
        if (b.dataset.cxslot) { slot = b.dataset.cxslot; pick = null; return paint(); }
        if (b.dataset.cx) { const [s, t, r] = b.dataset.cx.split(":"); pick = { s, t: +t, r: +r }; return paint(); }
        if (b.dataset.cxu) { pick = { u: b.dataset.cxu }; return paint(); }
        if (b.dataset.cxclaim) return claim(Number(b.dataset.cxclaim));
        if (b.hasAttribute("data-cxmap")) { close(); if (ctx.openMap) ctx.openMap(); return; }
        if (b.hasAttribute("data-cxsign")) { Promise.resolve(ctx.signIn && ctx.signIn()).then(() => load()).then(paint, paint); return; }
        if (b.dataset.cxnav) { const k = b.dataset.cxnav; if (k === "jur") { ctx.toast(esc(T("Open it in Jurassic World: Pack → Codex"))); return; } close(); if (ctx.openMonsters) ctx.openMonsters(k); } }); }
    el.hidden = false; if (ctx.onOpen) ctx.onOpen(); paint(); await load(); paint();
  }
  function close() { if (el && !el.hidden) { el.hidden = true; if (ctx.onClose) ctx.onClose(); } }
  return { open, close, shown: () => !!(el && !el.hidden), load, state: () => ({ data, slot, pick, marks: marks() }), pick: (s, t, r) => { slot = s; pick = { s, t, r }; paint(); } };
}
