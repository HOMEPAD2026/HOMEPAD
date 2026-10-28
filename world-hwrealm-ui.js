// world-hwrealm-ui.js — the HALLOWEEN REALM's screens (world-hwrealm.js is the land): the strip at the top while you're in the
// realm (the clock — day 20 min / the Cursed Night 10 —, the night's ×1.5 / ×2 when it's on, the ground you're in and its
// levels, your Inferno Jack set n/6), the night's cut-in ("THE CURSE HAS AWAKENED!"), a minute's warning before it, and
// the set's window: the six slots with what you wear, what you hold, the bonuses lit by how many are worn, Crimson
// Celestial compared, enhance (fragments, a miss keeps the +), salvage, craft a piece of the slot you pick (100 fragments).
// The pieces are the server's (api/_world-hwrealm.mjs); nothing here changes them on its own.
//   makeHwUI({ T, esc, M (world-hwrealm.js), post, sess, toast, signIn, buzz, itemStats, onSet, mythicSlot }) →
//     { hud(clock, zone, on), open(tab), reveal(piece), night(on), warn(), refresh(), set(), worn(), kill(m) }
const SLOT_IC = { weapon: "blade", armor: "armor", helm: "crown", ring: "ring", necklace: "pendant", boots: "boots" };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function makeHwUI({ T, esc, M, post, sess, toast, signIn, buzz = () => {}, itemStats, onSet = () => {}, mythicSlot = () => null, ver = "" }) {
  const { HW, SET, pieceOf, pieceStats, setBonus } = M;
  let S = { pieces: [], eq: {}, frag: 0 }, gotAt = 0, busy = false, win = null, tab = "set", pick = "";
  const icon = (k) => `/images/hwrealm/ic-${k}.webp${ver}`;
  // ---- the strip at the top ----
  const strip = document.createElement("div"); strip.className = "hwr-strip"; strip.hidden = true; document.body.appendChild(strip);
  strip.addEventListener("click", (e) => { if (e.target.closest("[data-hwset]")) open("set"); });
  let last = "";
  function hud(clk, zone, on) {
    strip.hidden = !on; document.body.classList.toggle("wp-in-hw", !!on); document.body.classList.toggle("wp-hw-night", !!(on && clk.night)); if (!on) return;
    const n = worn().length, key = `${clk.night}|${clk.left}|${zone ? zone.id : ""}|${n}`; if (key === last) return; last = key;
    strip.innerHTML = `<b class="hwr-time${clk.night ? " night" : clk.warn ? " warn" : ""}">${clk.night ? "🌕 " + esc(T("Cursed Night")) : "🎃 " + esc(T("Day"))} <i>${fmt(clk.left)}</i></b>`
      + (clk.night ? `<span class="hwr-k">${esc(T("Monsters ×1.5 · EXP ×2 · ARCL ×1.5 · drops ×1.5"))}</span>` : clk.warn ? `<span class="hwr-k warn">${esc(T("The night falls in {t}", { t: fmt(clk.left) }))}</span>` : "")
      + (zone ? `<span class="hwr-z">${esc(T(zone.name))} · ${esc(T("Lv {a}–{b}", { a: zone.lv[0], b: zone.lv[1] }))}</span>` : `<span class="hwr-z">${esc(T("Pumpkin Village"))} · ${esc(T("safe"))}</span>`)
      + `<button type="button" class="hwr-set" data-hwset><img src="${icon("blade")}" alt="" width="22" height="22">${n}/6</button>`;
  }
  // ---- the night's cut-in and the warning ----
  function cut(big, small, cls) {
    const c = document.createElement("div"); c.className = "hwr-cut " + (cls || ""); c.innerHTML = `<b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ""}`; document.body.appendChild(c);
    requestAnimationFrame(() => c.classList.add("on")); setTimeout(() => { c.classList.remove("on"); setTimeout(() => c.remove(), 600); }, 2600);
  }
  const night = (on) => { if (on) { cut(T("THE CURSE HAS AWAKENED!"), T("Monsters ×1.5 · EXP ×2 · ARCL ×1.5 · drops ×1.5"), "night"); buzz([40, 60, 120]); } else cut(T("Dawn breaks"), T("The monsters are back to their day strength"), "day"); };
  const warn = () => toast(T("The Cursed Night falls in a minute — the monsters will grow stronger"));
  // ---- the server's set ----
  async function refresh(force) {
    const s0 = sess(); if (!s0) return S; if (!force && Date.now() - gotAt < 30e3) return S;
    try { const r = await fetch(`/api/social?world=hw&wallet=${s0.wallet}`, { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j.set) { S = j.set; gotAt = Date.now(); onSet(S); } } } catch { /* what we had stays */ }
    return S;
  }
  const worn = () => Object.entries(S.eq || {}).map(([sl, id]) => (S.pieces || []).find((p) => p.id === id && pieceOf(p.k) && pieceOf(p.k).slot === sl)).filter(Boolean);
  async function act(action, extra) {
    if (busy) return null; const s0 = sess(); if (!s0) { toast(T("Sign in to keep the Inferno Jack set")); signIn && signIn(); return null; }
    busy = true; try { const r = await post({ action, ...s0, ...extra }); const j = r && r.j; if (j && j.set) { S = j.set; gotAt = Date.now(); onSet(S); } if (r && !r.ok) toast((j && j.error) || T("Couldn't do that — try again")); return r; } finally { busy = false; paint(); }
  }
  // a knock-out in a realm ground: the server rolls the drop and the fragments
  const queue = []; let flushing = false;
  function kill(m) { const s0 = sess(); if (!s0 || !m.zone) return; queue.push({ zone: m.zone.id, rank: m.rank === "boss" ? (m.zone.jack ? "jack" : "boss") : m.rank === "elite" ? "elite" : "" }); if (queue.length > 6) queue.splice(0, queue.length - 6); flush(); }
  async function flush() {
    if (flushing) return; flushing = true;
    try { while (queue.length) { const q = queue.shift(), s0 = sess(); if (!s0) break; const r = await post({ action: "world-hw-kill", ...s0, ...q }); const j = r && r.j;
      if (r && r.status === 429) { queue.unshift(q); await new Promise((ok) => setTimeout(ok, 800)); continue; }
      if (j && j.set) { S = j.set; gotAt = Date.now(); onSet(S); } if (j && j.frag) toast(T("+{n} Pumpkin Soul Fragments", { n: j.frag })); if (j && j.drop) reveal(j.drop);
      await new Promise((ok) => setTimeout(ok, HW.KILL_GAP + 50)); } } catch { /* the next one tries again */ } finally { flushing = false; }
  }
  // ---- a piece dropped: its card ----
  function reveal(p) {
    const P = pieceOf(p.k); if (!P) return; buzz([30, 40, 90]);
    const c = document.createElement("div"); c.className = "hwr-drop"; c.innerHTML = `<div class="hwr-dropin"><i class="hwr-beam"></i><img src="${icon(P.id)}" alt="" width="160" height="160"><small>LEGENDARY · ${esc(T("Inferno Jack set"))}</small><b>${esc(T(P.name))}</b><em>${esc(T("A new piece! Wear it at the Pumpkin Merchant or from the strip at the top."))}</em><button type="button" data-x>${esc(T("Open the set"))}</button></div>`;
    document.body.appendChild(c); requestAnimationFrame(() => c.classList.add("on"));
    c.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) open("set"); c.classList.remove("on"); setTimeout(() => c.remove(), 400); });
    setTimeout(() => { if (c.isConnected) { c.classList.remove("on"); setTimeout(() => c.remove(), 400); } }, 7000);
  }
  // ---- the set's window ----
  const statLine = (o) => Object.entries(o).filter(([k]) => ["atk", "def", "hp", "sp", "crit", "spd", "hwXp"].includes(k)).map(([k, v]) => `${{ atk: T("Attack"), def: T("Defense"), hp: T("Max HP"), sp: T("Max SP"), crit: T("Critical"), spd: T("Speed"), hwXp: T("Realm EXP %") }[k]} +${v}`).join(" · ");
  function paint() {
    if (!win) return; const w = worn(), b = setBonus(w), my = Object.keys(SLOT_IC).filter((sl) => mythicSlot(sl));
    const slots = SET.PIECES.map((P) => { const on = (S.pieces || []).find((p) => p.id === (S.eq || {})[P.slot]), held = (S.pieces || []).filter((p) => p.k === P.id), cr = mythicSlot(P.slot);
      return `<button type="button" class="hwr-slot${on ? " on" : ""}${pick === P.slot ? " pick" : ""}" data-slot="${P.slot}"><img src="${icon(P.id)}" alt="" width="64" height="64"><b>${esc(T(P.name))}</b><small>${on ? "+" + (on.p || 0) + " · " + esc(T("worn")) : held.length ? esc(T("{n} held", { n: held.length })) : esc(T("not found yet"))}</small>${cr ? `<i class="hwr-cc" title="${esc(T("A Crimson Celestial piece is worn in this slot: it comes first"))}">CC</i>` : ""}</button>`; }).join("");
    const bonus = SET.BONUS.map(([need, name]) => `<li class="${b.n >= need ? "on" : ""}"><b>${need}</b>${esc(T(name))}${need === 6 ? `<small>${esc(T("5 % a hit: a pumpkin blast of 180 % attack round it, once in 8 s — the realm's monsters only"))}</small>` : ""}</li>`).join("");
    const P = pick && SET.PIECES.find((q) => q.slot === pick), list = P ? (S.pieces || []).filter((p) => p.k === P.id).sort((a, c) => (c.p || 0) - (a.p || 0)) : [];
    const detail = P ? `<div class="hwr-detail"><h4><img src="${icon(P.id)}" alt="" width="40" height="40">${esc(T(P.name))}</h4>
      ${list.length ? list.map((p) => { const st = pieceStats(p, itemStats), isOn = (S.eq || {})[P.slot] === p.id, c = HW.ENH.cost(p.p || 0);
        return `<div class="hwr-row"><b>+${p.p || 0}</b><span>${esc(statLine(st))}</span><div>${isOn ? `<button type="button" data-off="${P.slot}">${esc(T("Take off"))}</button>` : `<button type="button" class="go" data-wear="${p.id}" data-s="${P.slot}">${esc(T("Wear"))}</button>`}${(p.p || 0) < HW.ENH.MAX ? `<button type="button" data-enh="${p.id}" ${S.frag < c ? "disabled" : ""}>${esc(T("Enhance"))} · ${c} 🎃 · ${Math.round(HW.ENH.rate(p.p || 0) * 100)}%</button>` : ""}<button type="button" data-salv="${p.id}">${esc(T("Salvage"))} → ${HW.FRAG.SALVAGE + (p.p || 0) * 2} 🎃</button></div></div>`; }).join("")
        : `<p class="hwr-none">${esc(T("You don't hold this piece yet. It drops in the realm's grounds — more at night — or craft it below."))}</p>`}
      <button type="button" class="hwr-craft" data-craft="${P.slot}" ${S.frag < HW.FRAG.CRAFT ? "disabled" : ""}>${esc(T("Craft {x}", { x: T(P.name) }))} · ${HW.FRAG.CRAFT} 🎃</button></div>` : `<p class="hwr-tip">${esc(T("Pick a slot to see its pieces."))}</p>`;
    win.querySelector(".hwr-body").innerHTML = `<div class="hwr-top"><span class="hwr-frag">🎃 ${S.frag} <small>${esc(T("Pumpkin Soul Fragments"))}</small></span><span class="hwr-n">${b.n}/6 ${esc(T("worn"))}</span></div>
      <div class="hwr-slots">${slots}</div><ul class="hwr-bonus">${bonus}</ul>${detail}
      <p class="hwr-note">${esc(T("Legendary: below the Crimson Celestial set (Mythic) — you can wear both, one piece a slot; a Crimson piece in a slot comes first."))}${my.length ? " " + esc(T("Crimson worn now: {n}", { n: my.length })) : ""} ${esc(T("These pieces can't be traded for now."))}</p>`;
  }
  function open(t) {
    tab = t || "set"; if (!win) { win = document.createElement("div"); win.className = "hwr-win"; win.innerHTML = `<div class="hwr-card"><header><img src="${icon("crown")}" alt="" width="36" height="36"><b>${esc(T("Inferno Jack set"))}</b><small>LEGENDARY</small><button type="button" class="hwr-x" data-close aria-label="${esc(T("Close"))}">×</button></header><div class="hwr-body"></div></div>`; document.body.appendChild(win);
      win.addEventListener("click", async (e) => { const q = (s) => e.target.closest(s);
        if (q("[data-close]") || e.target === win) { win.classList.remove("on"); return; }
        const sl = q("[data-slot]"); if (sl) { pick = sl.dataset.slot; paint(); return; }
        const we = q("[data-wear]"); if (we) { const r = await act("world-hw-equip", { slot: we.dataset.s, id: we.dataset.wear }); if (r && r.ok) { buzz(20); toast(T("Worn: {x}", { x: T(pieceOf((S.pieces.find((p) => p.id === we.dataset.wear) || {}).k).name) })); } return; }
        const of = q("[data-off]"); if (of) { await act("world-hw-equip", { slot: of.dataset.off, id: null }); return; }
        const en = q("[data-enh]"); if (en) { const r = await act("world-hw-enhance", { id: en.dataset.enh }); if (r && r.ok && r.j) toast(r.j.up ? T("Enhanced to +{n}!", { n: r.j.plus }) : T("The enhance missed — the + stays")); return; }
        const sv = q("[data-salv]"); if (sv) { const r = await act("world-hw-salvage", { id: sv.dataset.salv }); if (r && r.ok && r.j) toast(T("+{n} Pumpkin Soul Fragments", { n: r.j.frag })); return; }
        const cr = q("[data-craft]"); if (cr) { const r = await act("world-hw-craft", { slot: cr.dataset.craft }); if (r && r.ok && r.j && r.j.drop) reveal(r.j.drop); return; }
      }); }
    paint(); requestAnimationFrame(() => win.classList.add("on")); refresh(true).then(paint);
  }
  return { hud, open, reveal, night, warn, refresh, kill, set: () => S, worn, isOpen: () => !!(win && win.classList.contains("on")), close: () => win && win.classList.remove("on"), cutIn: cut };
}
