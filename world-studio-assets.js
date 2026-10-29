// world-studio-assets.js — the Studio's ASSET STORE tab, under the 3D Builder (2026-10-29, the owner): Meshy's models in five
// kinds — characters, buildings, nature, backgrounds, structures — one free and two premium in each (world-store-data.js).
// Free ones: use them in the 3D Builder or download the .glb. Premium ones: 30,000 $ARCIRCLE each from your own wallet to
// FeeBurn (half burned, half to the treasury); the server reads the receipt back (api/_world-store.mjs), then they're yours to
// build with and download. Under the store, Arc Studio+ — the onchain tools we're building with Arc — shows "coming soon"
// while the owner talks with the @Arc team.
import { STORE, storeItem, storeImg } from "./world-store-data.js";

export function makeAssets(ctx, { T, esc, act, ask, wallet, pi, repaint, use3d }) {
  let data = null, cat = "", busy = "", at = 0;
  const PEND = "arc.studio.storeTx";
  async function load(force) {
    if (!force && data && Date.now() - at < 15000) return; at = Date.now(); const w = wallet();
    try { const r = await fetch("/api/social?world=studio-store" + (w ? "&wallet=" + w : ""), { cache: "no-store" }); if (r.ok) data = await r.json(); } catch { /* the catalogue below still shows */ }
    if (!data) data = { owned: [], pay: null };
    repaint(); resume();
  }
  const owned = (id) => !!(data && (data.owned || []).includes(id));
  const usable = () => STORE.ITEMS.filter((it) => it.free || owned(it.id));
  const price = STORE.PRICE.toLocaleString("en-US");
  function card(it) {
    const mine = it.free || owned(it.id), k = STORE.CATS.find((c) => c[0] === it.cat) || ["", "", ""];
    return `<article class="wsa-c${it.free ? " free" : " prem"}${mine ? " own" : ""}" data-sa="${it.id}">
      <div class="wsa-img" data-saview="${it.id}" role="button" tabindex="0" aria-label="${esc(T("Preview in 3D"))}"><span class="wsa-3d">⟳ 3D</span><img src="${storeImg(it, ctx.ver || "")}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'${k[1]}'}))"><em class="wsa-tag">${it.free ? esc(T("Free")) : mine ? esc(T("Owned")) : "★ " + esc(T("Premium"))}</em></div>
      <b>${esc(T(it.name))}</b><small>${esc(T(it.line))}</small>
      <div class="wsa-act">${mine ? `<button type="button" class="wst-go" data-sause="${it.id}">${pi("cube")} ${esc(T("Use in 3D Builder"))}</button><button type="button" class="wst-go alt" data-sadl="${it.id}" aria-label="${esc(T("Download"))}" title="${esc(T("Download .glb"))}">⬇ .glb</button>`
        : `<button type="button" class="wst-go gold" data-sabuy="${it.id}"${busy === it.id ? " disabled" : ""}>${busy === it.id ? "⏳ " + esc(T("Checking on Arc…")) : `${esc(T("Buy"))} · ${price} $ARCIRCLE`}</button>`}</div></article>`;
  }
  function paint(o = {}) {
    if (!data) load();
    const list = STORE.ITEMS.filter((it) => !cat || it.cat === cat);
    return `<div class="wsa"><div class="wsa-ban"><div><small>${esc(T("3D Builder"))} · ${esc(T("Assets"))}</small><b>${esc(T("Asset Store"))}</b><p>${esc(T("3D models made with Meshy, packed light for phones. One free model in every kind; premium models are {p} $ARCIRCLE each — half is burned, half goes to the treasury.", { p: price }))}</p></div></div>
      ${o.chips === false ? "" : `<div class="wst-chips wsa-cats"><button type="button" data-sacat="" class="${cat ? "" : "on"}">${esc(T("All"))}</button>${STORE.CATS.map(([id, ic, n]) => `<button type="button" data-sacat="${id}" class="${cat === id ? "on" : ""}">${ic} ${esc(T(n))}</button>`).join("")}</div>`}
      <div class="wsa-grid">${list.map(card).join("")}</div>
      <p class="wst-3dnote">${esc(T("A model you place in a game is drawn for everyone who plays it. Premium models are for their buyers to build with and download."))}</p>
      <h4 class="wst-sec">${pi("cube")} Arc Studio+</h4>
      <button type="button" class="wsa-arc" data-arcplus><span class="wsa-arcmark" aria-hidden="true">◆</span><div><b>Arc Studio+</b><small>${esc(T("Onchain tools for your games, built with Arc Studio — powered by Circle"))}</small></div><em>${esc(T("Coming soon"))}</em></button></div>`;
  }
  function arcPlus() {
    const g = document.createElement("div"); g.className = "wak wsa-pop"; g.setAttribute("role", "alertdialog"); g.setAttribute("aria-modal", "true");
    g.innerHTML = `<div class="wak-in"><span class="wsa-arcmark big" aria-hidden="true">◆</span><h3>Arc Studio+</h3><p><b>🚧 ${esc(T("Under construction"))}</b></p>
      <p>${esc(T("We're building Arc Studio+ into the Studio: onchain items, rewards and contracts for your games, made with Arc Studio and powered by Circle. We're talking with the Arc team now — it opens here as soon as it's ready."))}</p>
      <div class="wak-b"><button type="button" class="wak-yes">${esc(T("OK"))}</button></div></div>`;
    const end = () => { g.classList.add("out"); setTimeout(() => g.remove(), 160); };
    g.addEventListener("click", (e) => { if (e.target === g || e.target.closest(".wak-yes")) end(); }); document.body.appendChild(g);
  }
  async function download(id) {
    const it = storeItem(id); if (!it) return; const r = await act({ action: "world-studio-store-dl", id }); if (!r) return;
    if (!r.ok) { ctx.toast(esc(T((r.j && r.j.error) || "Couldn't download it — try again"))); return; }
    try { const b = await (await fetch(r.j.url)).blob(), u = URL.createObjectURL(b), a = Object.assign(document.createElement("a"), { href: u, download: r.j.name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); ctx.toast("⬇ " + esc(T("Downloading {n}", { n: r.j.name }))); }
    catch { ctx.toast(esc(T("Couldn't download it — try again"))); }
  }
  // a premium buy: your wallet sends the $ARCIRCLE to FeeBurn, then the server checks the transfer (kept on the device until it's checked)
  async function buy(id) {
    const it = storeItem(id); if (!it || it.free || busy) return;
    if (!ctx.tx) { ctx.toast(esc(T("Wallet connect isn't available here."))); return; }
    if (!wallet()) { const r = await act({ action: "world-studio-store-buy", id }); if (!r) return; await load(true); if (owned(id)) return; } // (signs you in first; the reply carries the payment's details)
    if (!data || !data.pay) await load(true);
    const pay = data && data.pay; if (!pay) { ctx.toast(esc(T("No connection — try again"))); return; }
    if (!(await ask(T, T("Buy “{n}” for {p} $ARCIRCLE from your wallet? Half is burned and half goes to the treasury.", { n: T(it.name), p: price }), { ok: T("Buy"), cancel: T("Not now") }))) return;
    busy = id; repaint(); let tx = "";
    const pad = (x) => String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0");
    try { tx = await ctx.tx(pay.token, "0xa9059cbb" + pad(pay.to) + pad(BigInt(pay.amount).toString(16))); try { localStorage.setItem(PEND, JSON.stringify({ id, tx })); } catch { /* the server keeps it */ } }
    catch (e) { busy = ""; repaint(); ctx.toast(esc(e && e.code === 4001 ? T("Cancelled") : (e && e.message) || T("The wallet didn't send it"))); return; }
    await confirm(id, tx);
  }
  async function confirm(id, tx) {
    busy = id; repaint();
    for (let i = 0; i < 20; i++) { const r = await act({ action: "world-studio-store-buy", id, tx }); if (r && r.status === 202) { await new Promise((ok) => setTimeout(ok, 4000)); continue; }
      busy = ""; if (r && r.ok) { try { localStorage.removeItem(PEND); } catch { /* fine */ } data = { ...(data || {}), owned: r.j.owned || [] }; repaint(); ctx.toast("★ " + esc(T("“{n}” is yours — use it in the 3D Builder", { n: T((storeItem(id) || {}).name || "") }))); return; }
      repaint(); if (r && r.j && /already used/.test(r.j.error || "")) { try { localStorage.removeItem(PEND); } catch { /* fine */ } } ctx.toast(esc(T((r && r.j && r.j.error) || "Couldn't change it — try again"))); return; }
    busy = ""; repaint(); ctx.toast(esc(T("The transaction is still not confirmed — it will be checked when you try again.")));
  }
  let resumed = false;
  function resume() { if (resumed || !wallet()) return; resumed = true; let p = null; try { p = JSON.parse(localStorage.getItem(PEND) || "null"); } catch { p = null; } if (p && p.id && p.tx && !owned(p.id)) confirm(p.id, p.tx); }
  function click(e) {
    const v = e.target.closest("[data-saview]"); if (v) { const it = storeItem(v.dataset.saview); if (it) import("./world-store-view.js").then((m) => m.openPreview(it, { T, esc, ver: ctx.ver || "" })).catch(() => ctx.toast(esc(T("Couldn't load the model — try again")))); return true; }
    const b = e.target.closest("button"); if (!b) return false;
    if (b.dataset.sacat != null) { cat = b.dataset.sacat; repaint(); return true; }
    if (b.dataset.sabuy) { buy(b.dataset.sabuy); return true; }
    if (b.dataset.sadl) { download(b.dataset.sadl); return true; }
    if (b.dataset.sause) { use3d(b.dataset.sause); return true; }
    if (b.hasAttribute("data-arcplus")) { arcPlus(); return true; }
    return false;
  }
  return { paint, click, load, usable, owned, arcPlus, setCat: (c) => { cat = c || ""; } };
}
