// world-mythic.js — the Crimson Celestial set's window (world-mythic-data.js; the pieces are the server's: api/_world-mythic.mjs):
// the six slots with the art cut from the owner's set sheet (images/mythic), the pieces you hold in each (wear / take off),
// the five set bonuses lit as you reach them, where they drop and how often. And the reveal when a run drops one.
//   ctx: { T, esc, post(b), sess(), level(), state() → { pieces, eq } | null, refresh() → Promise, toast(html), freeze(on), ver, Snd }
import { CC, pieceOf, mythicStats, setBonus, enhCost, essOf } from "./world-mythic-data.js";

const STAT = { atk: "ATK", def: "DEF", hp: "HP", sp: "SP", crit: "Crit %", spd: "Speed", critDmg: "Crit DMG %", skillPct: "Skill DMG %", dr: "DMG taken −%", atkPct: "ATK %", defPct: "DEF %", hpPct: "HP %" };
const SRC = { lysitha: "Lv 100 · Lysitha", solvira: "Lv 200 · Solvira", nyxara: "Lv 300 · Nyxara", throne: "Lv 400 · Throne of Three", secret: "SECRET" };
const img = (P, ver) => `/images/mythic/${P.glb}.webp${ver || ""}`;

// the pieces in 3D (the owner's Meshy models, packed to ~7 k triangles and 512 px KTX2 textures: models/world/mythic):
// one small renderer of its own, made when a piece is shown and let go when the window closes, a slow turn and a red rim
function makeViewer(THREE, K) {
  let R = null, scene = null, cam = null, raf = 0, obj = null, host = null, t0 = 0;
  const cache = {};
  function ensure() {
    if (R) return; R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50); cam.position.set(0, 0.25, 3.2);
    scene.add(new THREE.HemisphereLight(0xffe6ee, 0x200810, 1.6)); const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(2, 3, 2); scene.add(k);
    const rim = new THREE.DirectionalLight(0xff3d6e, 3); rim.position.set(-2.5, 1, -2); scene.add(rim);
  }
  const load = (glb, ver) => cache[glb] || (cache[glb] = new Promise((ok, no) => K.gltfLoader().load(`/models/world/mythic/${glb}.glb${ver || ""}`, (g) => ok(g.scene), undefined, no)).catch((e) => { delete cache[glb]; throw e; }));
  function loop(t) { raf = requestAnimationFrame(loop); if (!host || !host.isConnected) { stop(); return; } const w = host.clientWidth, h = host.clientHeight; if (R.domElement.width !== Math.round(w * R.getPixelRatio())) { R.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
    if (obj) { obj.rotation.y = (t - t0) / 2400; obj.position.y = Math.sin((t - t0) / 900) * 0.04; } R.render(scene, cam); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  async function show(el, P, ver) {
    if (!P || !THREE || !K) return; ensure(); host = el; el.appendChild(R.domElement); R.domElement.className = "my-3dc";
    let src; try { src = await load(P.glb, ver); } catch { el.classList.add("off"); return; } if (host !== el) return;
    if (obj) scene.remove(obj); obj = new THREE.Group(); const o = src.clone(true), box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = 1.7 / Math.max(sz.x, sz.y, sz.z, 1e-3);
    o.position.copy(c).multiplyScalar(-k); o.scale.setScalar(k); obj.add(o); scene.add(obj); t0 = performance.now(); el.classList.add("on"); if (!raf) raf = requestAnimationFrame(loop);
  }
  function dispose() { stop(); host = null; if (R) { R.dispose(); R.forceContextLoss(); R.domElement.remove(); R = null; } scene = null; obj = null; }
  return { show, dispose };
}

export function makeMythicUI(ctx) {
  const { T, esc } = ctx; const viewer = makeViewer(ctx.THREE, ctx.K);
  let el = null, pick = "", tab = "set", mkt = null, sellId = "";
  const statLine = (o) => Object.entries(o).filter(([k, v]) => v && STAT[k]).map(([k, v]) => `${T(STAT[k])} +${v}`).join(" · ");
  function paint() {
    if (!el) return; const st = ctx.state() || { pieces: [], eq: {} }, lv = ctx.level(), pcs = st.pieces || [], eq = st.eq || {};
    const worn = Object.values(eq).map((id) => pcs.find((p) => p.id === id)).filter((p) => p && p.req <= lv), sb = setBonus(worn);
    const slotCard = (P) => { const mine = pcs.filter((p) => p.def === P.id), w = mine.find((p) => p.id === eq[P.slot]);
      return `<button type="button" class="my-slot${w ? " on" : ""}${mine.length ? (w ? "" : " held") : " none"}${pick === P.slot ? " sel" : ""}" data-slot="${P.slot}"><img src="${img(P, ctx.ver)}" alt=""><b>${esc(T(P.name))}</b><small>${esc(T(P.line))}</small><i>${w ? "✓ " + esc(T("Worn")) : mine.length ? esc(T("{n} held", { n: mine.length })) + " · " + esc(T("Tap to wear")) : "—"}</i></button>`; };
    const P0 = pick && CC.PIECES.find((p) => p.slot === pick), list = P0 ? pcs.filter((p) => p.def === P0.id) : [];
    const detail = P0 ? `<div class="my-list"><div class="my-3d" data-3d="${P0.id}"><img src="${img(P0, ctx.ver)}" alt=""></div><h4>${esc(T(P0.name))}</h4>${list.length ? list.map((p) => { const on = eq[P0.slot] === p.id, low = p.req > lv;
        const listed = p.state === "GAME_LISTED", c = enhCost(p.plus || 0), top = (p.plus || 0) >= CC.MAX_PLUS;
        return `<div class="my-pc${on ? " on" : ""}${listed ? " listed" : ""}"><span><b>${esc(T(SRC[p.src] || p.src))}</b><small>${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult} · +${p.plus || 0}${listed ? ` · 🏷 ${Number(p.price).toLocaleString("en-US")} ARCL` : ""}</small><em>${esc(statLine(mythicStats(p)))}</em></span>
          <div class="my-acts">${listed ? `<button type="button" data-unlist="${p.id}">${esc(T("Take back"))}</button>` : `<button type="button" data-eq="${p.id}" ${low && !on ? "disabled" : ""}>${on ? esc(T("Take off")) : low ? "🔒 Lv " + p.req : esc(T("Wear"))}</button>
            <button type="button" class="enh" data-enh="${p.id}" ${top ? "disabled" : ""}>${top ? "+" + CC.MAX_PLUS : `⬆ +${(p.plus || 0) + 1} · ${c.ess}💠 ${c.arcl.toLocaleString("en-US")} ARCL · ${Math.round(c.rate * 100)}%`}</button>
            <button type="button" data-sell="${p.id}">🏷 ${esc(T("Sell"))}</button><button type="button" class="salv" data-salv="${p.id}">♻ ${esc(T("Salvage"))} +${essOf(p)}💠</button>`}</div>
          ${sellId === p.id ? `<form class="my-sellf" data-sellf="${p.id}"><input type="number" min="${CC.MARKET.MIN}" max="${CC.MARKET.MAX}" step="100" value="${CC.MARKET.MIN * 10}" aria-label="${esc(T("Price in ARCL"))}"><button type="submit">${esc(T("List for sale"))}</button><small>${esc(T("2% goes to the platform when it sells."))}</small></form>` : ""}</div>`; }).join("")
      : `<p class="my-empty">${esc(T("Not found yet. It drops from RAID QUEENS runs."))}</p>`}</div>` : "";
    el.innerHTML = `<div class="my-card"><header><div><small>MYTHIC · ${esc(T("SET"))}</small><h3>${esc(T("Crimson Celestial"))}</h3><p>${esc(T("{a} / 6 worn · {b} / 5 bonuses", { a: sb.n, b: sb.active.length }))} · 💠 ${esc(T("Crimson Essence {n}", { n: st.ess || 0 }))}</p></div><button type="button" class="my-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="my-tabs"><button type="button" data-tab="set" class="${tab === "set" ? "on" : ""}">${esc(T("My set"))}</button><button type="button" data-tab="mkt" class="${tab === "mkt" ? "on" : ""}">${esc(T("Market"))}</button></div>
      ${tab === "mkt" ? marketHtml() : `<div class="my-body"><div class="my-slots">${CC.PIECES.map(slotCard).join("")}</div>${detail}
      <div class="my-bon">${CC.BONUS.map(([n, name, b]) => `<div class="${sb.n >= n ? "on" : ""}"><i>${n}</i><span><b>${esc(T(name))}</b><small>${esc(statLine(b))}${b.aura ? " · " + esc(T("Crimson aura")) : ""}</small></span></div>`).join("")}</div>
      <div class="my-drop"><h4>${esc(T("Where it drops"))}</h4>${Object.entries(CC.DROP).map(([k, d]) => `<span><b>${esc(T(SRC[k]))}</b>${+(d.rate * 100).toFixed(2)}% · ${esc(T("worn from Lv {n}", { n: d.req }))} · ×${d.mult}</span>`).join("")}
      <p>${esc(T("One of the six at equal odds on a won run. Kept on the server, never in your device's save."))}</p></div></div>`}</div>`;
    mount3d(el);
  }
  function marketHtml() {
    if (!mkt) { loadMarket(); return `<div class="my-body"><p class="my-empty">…</p></div>`; }
    const me = ((ctx.sess && ctx.sess()) || {}).wallet || "", mine = (x) => me && x.seller && me.toLowerCase().startsWith(x.seller.slice(0, 6).toLowerCase()) && me.toLowerCase().endsWith(x.seller.slice(-4).toLowerCase());
    return `<div class="my-body"><div class="my-mkt">${mkt.length ? mkt.map((x) => { const P = pieceOf(x.def); return P ? `<div class="my-li"><img src="${img(P, ctx.ver)}" alt=""><span><b>${esc(T(P.name))} +${x.plus || 0}</b><small>${esc(T(SRC[x.src] || x.src))} · ${esc(T("Worn from Lv {n}", { n: x.req }))} · ×${x.mult}</small><em>${esc(statLine(mythicStats(x)))}</em><small>${esc(T("Seller {w}", { w: x.seller }))}</small></span>
      <button type="button" class="go" data-buy="${x.id}" ${mine(x) ? "disabled" : ""}>${Number(x.price).toLocaleString("en-US")} ARCL</button></div>` : ""; }).join("") : `<p class="my-empty">${esc(T("Nothing for sale right now."))}</p>`}</div>
      <p class="my-fine">${esc(T("Pieces change hands with their + and where they came from. 2% of the price goes to the platform."))}</p></div>`;
  }
  async function loadMarket() { try { const r = await fetch("/api/social?world=mythic-market", { cache: "no-store" }); mkt = r.ok ? (await r.json()).items || [] : []; } catch { mkt = []; } paint(); }
  async function act(action, extra, okMsg) {
    const r = await ctx.post({ action, ...ctx.sess(), ...extra });
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); return null; }
    await ctx.refresh(); if (ctx.purse) ctx.purse(); if (okMsg) ctx.toast(okMsg(r.j)); paint(); return r.j;
  }
  function mount3d(root) { const b = root && root.querySelector("[data-3d]"); if (b) viewer.show(b, pieceOf(b.dataset["3d"]), ctx.ver); }
  async function wear(id) {
    const st = ctx.state() || { pieces: [], eq: {} }, p = (st.pieces || []).find((x) => x.id === id), P = p && pieceOf(p.def); if (!P) return;
    const on = (st.eq || {})[P.slot] === id, r = await ctx.post({ action: "world-mythic-equip", ...ctx.sess(), slot: P.slot, id: on ? null : id });
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); return; }
    await ctx.refresh(); paint(); try { if (ctx.Snd && ctx.Snd.equip) ctx.Snd.equip(); } catch { /* no sound */ }
  }
  /// the drop card's Wear now: the new piece may not be in the set we hold yet, so fetch it first
  async function wearNow(id) { try { await ctx.refresh(); } catch { /* try with what we have */ } const st = ctx.state() || { pieces: [] }; if (!(st.pieces || []).some((x) => x.id === id)) { ctx.toast(esc(T("Couldn't change it — try again"))); return; }
    await wear(id); const eq = (ctx.state() || {}).eq || {}; if (Object.values(eq).includes(id)) ctx.toast(esc(T("Worn — the set's bonuses count it now"))); }
  function open(slot) {
    if (typeof document === "undefined" || el) return; pick = slot || "";
    el = document.createElement("div"); el.className = "my-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); document.body.appendChild(el); ctx.freeze(true);
    el.addEventListener("submit", async (e) => { const f = e.target.closest("[data-sellf]"); if (!f) return; e.preventDefault(); const price = Math.floor(Number(f.querySelector("input").value) || 0);
      sellId = ""; await act("world-mythic-list", { id: f.dataset.sellf, price }, () => esc(T("Listed for {p} ARCL", { p: price.toLocaleString("en-US") }))); mkt = null; });
    el.addEventListener("click", async (e) => { const s = e.target.closest("[data-slot]"), q = e.target.closest("[data-eq]"), tb = e.target.closest("[data-tab]");
      if (tb) { tab = tb.dataset.tab; if (tab === "mkt") mkt = null; paint(); return; }
      const en = e.target.closest("[data-enh]"); if (en && !en.disabled) { en.disabled = true; const j = await act("world-mythic-enhance", { id: en.dataset.enh }); if (j) { ctx.toast(esc(j.hit ? T("Success! Now +{n}", { n: j.plus }) : T("It didn't take — still +{n}", { n: j.plus }))); try { if (j.hit && ctx.Snd && ctx.Snd.perfect) ctx.Snd.perfect(); } catch { /* no sound */ } } return; }
      const sv = e.target.closest("[data-salv]"); if (sv) { if (typeof confirm === "function" && !confirm(T("Salvage this piece into Crimson Essence? It's gone for good."))) return; await act("world-mythic-salvage", { id: sv.dataset.salv }, (j) => esc(T("+{n} Crimson Essence", { n: j.gain }))); return; }
      const se = e.target.closest("[data-sell]"); if (se) { sellId = sellId === se.dataset.sell ? "" : se.dataset.sell; paint(); return; }
      const ul = e.target.closest("[data-unlist]"); if (ul) { await act("world-mythic-unlist", { id: ul.dataset.unlist }, () => esc(T("Taken back"))); mkt = null; return; }
      const by = e.target.closest("[data-buy]"); if (by && !by.disabled) { if (typeof confirm === "function" && !confirm(T("Buy it for {p} ARCL?", { p: by.textContent }))) return; by.disabled = true; await act("world-mythic-buy", { id: by.dataset.buy }, () => esc(T("It's yours — in your set now"))); mkt = null; tab = "set"; paint(); return; }
      if (e.target.closest(".my-sellf")) return;
      if (q && !q.disabled) { wear(q.dataset.eq); return; } if (s) { pick = pick === s.dataset.slot ? "" : s.dataset.slot; paint(); return; }
      if (e.target === el || e.target.closest(".my-x")) close(); });
    paint(); ctx.refresh().then(paint);
  }
  function close() { if (el) { el.remove(); el = null; ctx.freeze(false); viewer.dispose(); } }
  /// the drop's moment: a dark card, the piece rising in red light, its name, where to wear it
  function reveal(p) {
    const P = pieceOf(p && p.def); if (!P || typeof document === "undefined") return;
    const r = document.createElement("div"); r.className = "my-rev"; r.setAttribute("role", "dialog"); r.setAttribute("data-no-i18n", "");
    r.innerHTML = `<div class="my-rev-in"><small>MYTHIC · ${esc(T("Crimson Celestial"))}</small><div class="my-rev-art my-3d" data-3d="${P.id}"><img src="${img(P, ctx.ver)}" alt=""></div><b>${esc(T(P.name))}</b><p>${esc(T(SRC[p.src] || p.src))} · ${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult}</p><em>${esc(statLine(mythicStats(p)))}</em>
      <div class="my-rev-acts"><button type="button" data-k="ok">${esc(T("OK"))}</button><button type="button" class="go" data-k="set">${esc(T("Open the set"))}</button>${p.id && ctx.level() >= p.req ? `<button type="button" class="go" data-k="wear">${esc(T("Wear now"))}</button>` : ""}</div></div>`;
    document.body.appendChild(r); mount3d(r);
    r.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; r.remove(); viewer.dispose(); if (b.dataset.k === "set") open(P.slot); if (b.dataset.k === "wear") wearNow(p.id); });
    try { if (ctx.Snd && ctx.Snd.perfect) ctx.Snd.perfect(); } catch { /* no sound */ }
  }
  return { open, close, reveal, shown: () => !!el };
}
