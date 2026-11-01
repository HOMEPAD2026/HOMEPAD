// world-kart-shop.js — ARCIRCLE KART's SHOP window (2026-11-01, the owner): five departments (world-kart-shop-data.js KSHOP.DEPTS)
// — CARS open, Paint & Wraps / Boost Trails / Racer Outfits / Item Skins "coming soon". A car is bought with $ARCIRCLE from the
// player's own wallet: a transfer of its price to FeeBurn (half burned, half to the treasury), then the server reads the receipt
// back (api/_world-kart.mjs world-kart-car-buy). The transaction waits on the device (arc.kart.carPend) until it's checked, so a
// closed window or a slow block never loses a purchase. The car you use is arc.kart.car (only one you own counts in a race).
// Loaded by world-kart.js the first time the 🛒 button is pressed.
import { KSHOP, carOf, priceOf, barOf } from "./world-kart-shop-data.js";
import { ask } from "./world-ask.js";

const PEND = "arc.kart.carPend", USE = "arc.kart.car";
const STATS = [["top", "Speed"], ["acc", "Acceleration"], ["turn", "Handling"], ["drift", "Drift"], ["boost", "Boost"], ["mass", "Toughness"]];
const DEPT_EMOJI = { cars: "🏎️", paint: "🎨", trails: "🔥", outfits: "🧥", items: "📦" };

export function carInUse(owned) { let id = ""; try { id = localStorage.getItem(USE) || ""; } catch { id = ""; } return id && (owned || []).includes(id) ? id : ""; }

/// ctx: { T, esc, post, sess, tx(to, data), toast, signIn, root (element), ver, onChange(carId), owned → [ids] }
export function openShop(ctx) {
  const { T, esc } = ctx, ver = ctx.ver || "";
  let dept = "cars", data = null, busy = "", closed = false;
  const el = document.createElement("div"); el.className = "wks"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", T("KART SHOP"));
  ctx.root.appendChild(el);
  const wallet = () => { const s = ctx.sess && ctx.sess(); return s && s.wallet ? String(s.wallet).toLowerCase() : ""; };
  const owned = () => (data && data.owned) || [];
  const fmt = (n) => Number(n).toLocaleString("en-US");
  async function load() {
    try { const r = await fetch("/api/social?world=kart-shop" + (wallet() ? "&wallet=" + wallet() : ""), { cache: "no-store" }); data = r.ok ? await r.json() : data; }
    catch { /* shown without ownership; buying asks again */ }
    if (ctx.onOwned) ctx.onOwned(owned());
    paint(); resume();
  }
  function use(id) { try { if (id) localStorage.setItem(USE, id); else localStorage.removeItem(USE); } catch { /* this visit only */ } if (ctx.onChange) ctx.onChange(id); paint(); }
  const icon = (d) => `<img src="/images/kart/shop/ic-${d.icon}.webp${ver}" alt="" width="40" height="40" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${DEPT_EMOJI[d.id]}'}))">`;
  function carCard(c) {
    const own = owned().includes(c.id), inUse = carInUse(owned()) === c.id, leg = c.grade === "legendary", wait = busy === c.id;
    const btn = !own ? `<button type="button" class="wks-buy" data-buy="${c.id}"${wait ? " disabled" : ""}>${wait ? esc(T("Checking…")) : `${esc(T("Buy"))} · ${fmt(priceOf(c))} <i class="wks-arc"></i>`}</button>`
      : inUse ? `<button type="button" class="wks-use on" disabled>✓ ${esc(T("In use"))}</button>` : `<button type="button" class="wks-use" data-use="${c.id}">${esc(T("Use this car"))}</button>`;
    return `<article class="wks-car${leg ? " leg" : ""}${own ? " own" : ""}" style="--c:${c.color}">
      <div class="wks-pic"><img src="/images/kart/shop/car-${c.id}.webp${ver}" alt="" width="320" height="200" loading="lazy" onerror="this.src='/images/kart/shop/logo-${c.id}.webp${ver}';this.classList.add('logo');this.onerror=null"><em class="wks-grade">${esc(T(leg ? "LEGENDARY" : "EPIC"))}</em>${own ? `<em class="wks-own">${esc(T("OWNED"))}</em>` : ""}</div>
      <h4><img class="wks-brand" src="/images/kart/shop/logo-${c.id}.webp${ver}" alt="" width="22" height="22">${esc(c.name)}</h4><p class="wks-line">${esc(T(c.line))}</p>
      <ul class="wks-stats">${STATS.map(([k, n]) => { const v = barOf(c.id, k); return `<li><span>${esc(T(n))}</span><b style="--v:${v}%" class="${v > 52 ? "up" : v < 48 ? "dn" : ""}"></b></li>`; }).join("")}</ul>
      <p class="wks-pc"><span class="pro">▲ ${esc(T(c.pro))}</span><span class="con">▼ ${esc(T(c.con))}</span></p>${btn}</article>`;
  }
  function paint() {
    if (closed) return; const d = KSHOP.DEPTS.find((x) => x.id === dept) || KSHOP.DEPTS[0], std = !carInUse(owned());
    el.innerHTML = `<div class="wks-in"><header class="wks-head"><div><h3>${esc(T("KART SHOP"))}</h3><p>🔥 ${esc(T("Every $ARCIRCLE you spend here: {b}% burned forever, the rest to the treasury.", { b: KSHOP.BURN_PCT }))}</p></div><button type="button" class="wks-x" data-x aria-label="${esc(T("Close"))}">✕</button></header>
      <nav class="wks-tabs">${KSHOP.DEPTS.map((x) => `<button type="button" class="${x.id === dept ? "on" : ""}${x.open ? "" : " soon"}" data-dept="${x.id}">${icon(x)}<b>${esc(T(x.name))}</b>${x.open ? "" : `<small>${esc(T("Soon"))}</small>`}</button>`).join("")}</nav>
      <div class="wks-body">${!d.open ? `<div class="wks-soon">${icon(d)}<h4>${esc(T(d.name))}</h4><p>${esc(T("Coming soon — the garage opens first."))}</p></div>`
        : `<div class="wks-std${std ? " on" : ""}"><span>🏁 ${esc(T("Your racer's own kart"))}<small>${esc(T("Free · even numbers everywhere"))}</small></span>${std ? `<b>✓ ${esc(T("In use"))}</b>` : `<button type="button" data-use="">${esc(T("Use"))}</button>`}</div>
          ${wallet() ? "" : `<p class="wks-sign">${esc(T("Sign in with your wallet to buy a car. Guests race their racer's own kart."))} <button type="button" data-sign>${esc(T("Sign in"))}</button></p>`}
          <div class="wks-grid">${KSHOP.CARS.map(carCard).join("")}</div><p class="wks-note">${esc(T("A car changes a few numbers a little — each has a strength and a weakness. ARC and CIRCLE are the top grade."))}</p>`}</div></div>`;
  }
  function close() { closed = true; el.remove(); if (ctx.onClose) ctx.onClose(); }
  async function buy(id) {
    const c = carOf(id); if (!c || busy) return;
    if (!ctx.tx) { ctx.toast(esc(T("Wallet connect isn't available here."))); return; }
    if (!wallet()) { await ctx.signIn(); await load(); if (!wallet()) return; if (owned().includes(id)) return; }
    const price = priceOf(c);
    if (!(await ask(T, T("Buy {n} for {p} $ARCIRCLE from your wallet? {b}% is burned and the rest goes to the treasury.", { n: c.name, p: fmt(price), b: KSHOP.BURN_PCT }), { ok: T("Buy"), cancel: T("Not now") }))) return;
    const pay = (data && data.pay) || null; if (!pay || !pay.token || !pay.to) { ctx.toast(esc(T("No connection — try again"))); return; }
    busy = id; paint(); let tx = "";
    const pad = (x) => String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0");
    try { tx = await ctx.tx(pay.token, "0xa9059cbb" + pad(pay.to) + pad((BigInt(price) * 10n ** 18n).toString(16))); try { localStorage.setItem(PEND, JSON.stringify({ id, tx, w: wallet() })); } catch { /* the server keeps nothing until checked */ } }
    catch (e) { busy = ""; paint(); ctx.toast(esc(e && e.code === 4001 ? T("Cancelled") : (e && e.message) || T("The wallet didn't send it"))); return; }
    await confirm(id, tx);
  }
  async function confirm(id, tx) {
    busy = id; paint();
    for (let i = 0; i < 24 && !closed; i++) {
      const s = ctx.sess && ctx.sess(); if (!s) break;
      const r = await ctx.post({ action: "world-kart-car-buy", ...s, id, tx });
      if (r && r.status === 202) { await new Promise((ok) => setTimeout(ok, 4000)); continue; }
      busy = "";
      if (r && r.ok) { try { localStorage.removeItem(PEND); } catch { /* fine */ } data = { ...(data || {}), owned: r.j.owned || [] }; if (ctx.onOwned) ctx.onOwned(owned()); use(id); celebrate(id); return; }
      if (r && r.j && /already used/.test(r.j.error || "")) { try { localStorage.removeItem(PEND); } catch { /* fine */ } }
      paint(); ctx.toast(esc(T((r && r.j && r.j.error) || "Couldn't change it — try again"))); return;
    }
    busy = ""; paint(); if (!closed) ctx.toast(esc(T("The transaction is still not confirmed — it will be checked when you open the shop again.")));
  }
  function resume() { let p = null; try { p = JSON.parse(localStorage.getItem(PEND) || "null"); } catch { p = null; } if (p && p.id && p.tx && p.w === wallet() && !owned().includes(p.id) && !busy) confirm(p.id, p.tx); }
  function celebrate(id) {
    const c = carOf(id); if (!c) return; ctx.toast("🏎️ " + esc(T("{n} is yours — it's in your garage and ready to race!", { n: c.name })));
    const card = el.querySelector(`[data-use="${id}"], .wks-car.own .wks-use.on`); const host = (card && card.closest(".wks-car")) || el;
    host.classList.add("wks-new"); setTimeout(() => host.classList.remove("wks-new"), 1600); if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* quiet */ }
  }
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-x]")) return close();
    const t = e.target.closest("[data-dept]"); if (t) { dept = t.dataset.dept; paint(); return; }
    const b = e.target.closest("[data-buy]"); if (b) return buy(b.dataset.buy);
    const u = e.target.closest("[data-use]"); if (u) return use(u.dataset.use);
    if (e.target.closest("[data-sign]")) { Promise.resolve(ctx.signIn()).then(load).catch(() => {}); }
  });
  const kd = (e) => { if (e.key === "Escape" && !closed) { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", kd, true); const off = ctx.onClose; ctx.onClose = () => { document.removeEventListener("keydown", kd, true); if (off) off(); };
  paint(); load();
  return { close, repaint: paint };
}
