// world-market.js — the Creator Market window (b-ec5, api/_world-market.mjs): blueprints people built on My Island, for ARCL.
//   Market      browse (new / best-selling), buy (the price you saw; not your own; once)
//   Mine        the blueprints you own: Build sends you to your island with it ready to place
//   Sell        your island as a blueprint: a name and a price; 80 % to you after 14 days, 20 % to the platform
//   Creator     your sales: on hold, settleable (cavail) and game-only (cplay); ask to settle (a GM sends $ARCIRCLE)
//   Wallet      your ARCL by bucket and every movement, newest first (the ledger: api/_world-ledger.mjs)
//   Team        (GM) the overview, the settlement queue (quote → pay from your own wallet → closed by the chain), a
//               wallet's ledger, refunds, listings
// Loaded the first time it's opened (world-play.js openMarket).
const fmt = (n) => (n == null ? "—" : Math.floor(n).toLocaleString("en-US"));
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const ARCL = '<img class="wmk-ic" src="/images/arcl2-64.png" alt="" aria-hidden="true" draggable="false">';

export function createMarket(ctx) {
  const { T, esc, toast } = ctx, Snd = ctx.Snd || {};
  let el = null, tab = "market", sort = "new", items = null, me = null, ledger = null, admin = null, busy = false, gm = false;
  const api = async (action, extra = {}) => { const s = ctx.sess(); if (!s) return { ok: false, j: { error: T("Connect your wallet first") } }; try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, j: { error: String((e && e.message) || e) } }; } };
  const get = async (q) => { try { const r = await fetch("/api/social?world=" + q, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const when = (t) => { try { return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const days = (ms) => Math.max(0, Math.ceil(ms / 864e5));
  async function load(all) {
    const s = ctx.sess();
    const jobs = [get("market&q=" + sort).then((j) => { items = j ? j.items : []; })];
    if (s && (all || tab !== "market")) jobs.push(get("market-me&wallet=" + s.wallet).then((j) => { me = j; }));
    if (s && tab === "wallet") jobs.push(get("arcl-tx&wallet=" + s.wallet).then((j) => { ledger = j; }));
    await Promise.all(jobs);
    gm = !!(ctx.isGM && ctx.isGM());
  }
  function build() {
    el = document.createElement("div"); el.className = "wmk"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("Creator Market"));
    el.innerHTML = `<div class="wmk-in"><header class="wmk-hd"><span class="wmk-logo">🏗️</span><div><b>${esc(T("Creator Market"))}</b><small>${esc(T("Blueprints built by players, for ARCL"))}</small></div><button type="button" class="wmk-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <nav class="wmk-tabs" role="tablist"></nav><section class="wmk-body"></section></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", onClick);
  }
  function tabs() {
    const list = [["market", T("Market")], ["mine", T("Mine")], ["sell", T("Sell")], ["creator", T("Creator")], ["wallet", T("Wallet")], ...(gm ? [["team", T("Team")]] : [])];
    el.querySelector(".wmk-tabs").innerHTML = list.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" class="${tab === k ? "on" : ""}" aria-selected="${tab === k}">${esc(n)}</button>`).join("");
  }
  const signedOut = () => `<div class="wmk-empty"><p>${esc(T("Sign in with your wallet to buy, sell and see your ARCL."))}</p></div>`;
  function paint() {
    if (!el) return; tabs(); const B = el.querySelector(".wmk-body"), s = ctx.sess();
    if (tab === "market") {
      B.innerHTML = `<div class="wmk-sort"><button type="button" data-sort="new" class="${sort === "new" ? "on" : ""}">${esc(T("Newest"))}</button><button type="button" data-sort="top" class="${sort === "top" ? "on" : ""}">${esc(T("Best-selling"))}</button></div>
        ${!items ? `<p class="wmk-load">…</p>` : items.length ? `<ul class="wmk-grid">${items.map((x) => { const own = me && me.owned && me.owned.some((o) => o.id === x.id), mineL = me && me.listings && me.listings.some((o) => o.id === x.id);
          return `<li><div class="wmk-art" style="--h:${(parseInt(x.id.slice(0, 4), 36) % 360)}"><b>${fmt(x.bricks)}</b><small>${esc(T("bricks"))}</small></div><div class="wmk-meta"><b>${esc(x.title)}</b><small>${esc(T("by {n}", { n: x.name || x.creator }))} · ${esc(T("{n} sold", { n: fmt(x.sold) }))}</small></div>
            <button type="button" class="wmk-buy" data-buy="${esc(x.id)}" data-price="${x.price}" ${own || mineL ? "disabled" : ""}>${own ? esc(T("Owned")) : mineL ? esc(T("Yours")) : `${ARCL} ${fmt(x.price)}`}</button></li>`; }).join("")}</ul>` : `<div class="wmk-empty"><p>${esc(T("No blueprints for sale yet — build something on your island and be the first to sell one!"))}</p></div>`}`;
    } else if (!s) B.innerHTML = signedOut();
    else if (tab === "mine") {
      const o = (me && me.owned) || [];
      B.innerHTML = o.length ? `<ul class="wmk-list">${o.map((x) => `<li><div><b>${esc(x.title)}</b><small>${esc(T("by {n}", { n: x.name || "" }))}</small></div><button type="button" class="go" data-build="${esc(x.id)}">${esc(T("Build on my island"))}</button></li>`).join("")}</ul>` : `<div class="wmk-empty"><p>${esc(T("Blueprints you buy are kept here for good. Build them on your island as often as you like."))}</p></div>`;
    } else if (tab === "sell") {
      B.innerHTML = `<div class="wmk-form"><p>${esc(T("Sell your island as a blueprint. Buyers build a copy on their own island; yours stays as it is."))}</p>
        <label>${esc(T("Name"))}<input class="wmk-title" maxlength="40" placeholder="${esc(T("e.g. Sky Castle"))}"></label>
        <label>${esc(T("Price (ARCL)"))}<input class="wmk-price" inputmode="numeric" placeholder="5,000"></label>
        <ul class="wmk-split"><li><b>80%</b> ${esc(T("to you, 14 days after each sale"))}</li><li><b>20%</b> ${esc(T("to the platform"))}</li><li>${esc(T("The part a buyer paid with ARCL bought through the Exchange can be settled to $ARCIRCLE; the rest you spend in the game."))}</li></ul>
        <button type="button" class="go wmk-sell">${esc(T("List my island"))}</button>
        ${me && me.listings && me.listings.length ? `<h4>${esc(T("Your listings"))}</h4><ul class="wmk-list">${me.listings.map((x) => `<li><div><b>${esc(x.title)}</b><small>${ARCL} ${fmt(x.price)} · ${esc(T("{n} sold", { n: fmt(x.sold) }))} · ${esc(T(x.status === "live" ? "on sale" : "off"))}</small></div>${x.status === "live" ? `<button type="button" data-unlist="${esc(x.id)}">${esc(T("Take down"))}</button>` : ""}</li>`).join("")}</ul>` : ""}</div>`;
    } else if (tab === "creator") {
      const E = (me && me.earnings) || {}, b = (me && me.buckets) || {}, S = (me && me.settles) || [];
      B.innerHTML = `<div class="wmk-cards"><div><small>${esc(T("On hold"))}</small><b>${fmt((E.pendingElig || 0) + (E.pendingPlay || 0))}</b><em>${E.nextAt ? esc(T("next in {d} days", { d: days(E.nextAt - Date.now()) })) : esc(T("nothing waiting"))}</em></div>
        <div class="hot"><small>${esc(T("Settleable"))}</small><b>${fmt(b.cavail)}</b><em>${esc(T("to $ARCIRCLE"))}</em></div><div><small>${esc(T("Game only"))}</small><b>${fmt(b.cplay)}</b><em>${esc(T("spend in the game"))}</em></div></div>
        <p class="wmk-note">${esc(T("{n} sales so far · {g} ARCL in total", { n: fmt(E.soldN), g: fmt(E.gross) }))}</p>
        <div class="wmk-form"><label>${esc(T("Settle to $ARCIRCLE (at least {m} ARCL)", { m: fmt(me && me.min) }))}<input class="wmk-amt" inputmode="numeric" placeholder="${fmt(me && me.min)}"></label><button type="button" class="go wmk-settle" ${(b.cavail || 0) < ((me && me.min) || 30000) ? "disabled" : ""}>${esc(T("Ask to settle"))}</button>
        <p class="wmk-note">${esc(T("The ARCL is held at once. The team sets the $ARCIRCLE amount and sends it from the team's wallet on Arc; it's closed when the chain shows the transfer."))}</p></div>
        ${S.length ? `<h4>${esc(T("Your settlements"))}</h4><ul class="wmk-list">${S.map((x) => `<li><div><b>${fmt(x.amount)} ARCL${x.quote ? ` → ${fmt(x.quote.arc)} $ARCIRCLE` : ""}</b><small>${esc(when(x.at))}${x.tx ? ` · <a href="https://arc.etherscan.io/tx/${esc(x.tx)}" target="_blank" rel="noopener">tx</a>` : ""}${x.reason ? " · " + esc(x.reason) : ""}</small></div><span class="wmk-st ${esc(x.status)}">${esc(T({ requested: "Waiting", approved: "Approved", completed: "Paid", rejected: "Turned down" }[x.status] || x.status))}</span></li>`).join("")}</ul>` : ""}`;
    } else if (tab === "wallet") {
      const b = (ledger && ledger.buckets) || (me && me.buckets) || {}, L = (ledger && ledger.list) || null;
      const NAME = { earn: "Earned", spend: "Spent", hold: "Held", unhold: "Returned", settle: "Settled", sale: "Sale", fee: "Platform fee" };
      B.innerHTML = `<div class="wmk-cards"><div><small>${esc(T("Balance"))}</small><b>${fmt(b.bal)}</b><em>${esc(T("held {n}", { n: fmt(b.held) }))}</em></div><div><small>${esc(T("From play"))}</small><b>${fmt(b.play)}</b></div><div><small>${esc(T("Bought"))}</small><b>${fmt(b.purchased)}</b></div><div class="hot"><small>${esc(T("Creator"))}</small><b>${fmt((b.cavail || 0) + (b.cplay || 0))}</b></div></div>
        <p class="wmk-note wmk-fee">🔥 ${esc(T("Planned $ARCL token fee: 2% a transaction (1% $ARCIRCLE buyback & burn, 1% ARCIRCLE WORLD development). In-game ARCL has no fee today."))}</p><h4>${esc(T("Every movement"))}</h4>${!L ? `<p class="wmk-load">…</p>` : L.length ? `<ul class="wmk-tx">${L.map((x) => `<li class="${x.n >= 0 ? "in" : "out"}"><div><b>${esc(T(NAME[x.t] || x.t))} · ${esc(x.k)}</b><small>${esc(when(x.at))}${x.b ? " · " + esc(Object.entries(x.b).map(([k, v]) => `${k} ${fmt(v)}`).join(", ")) : ""}</small></div><em>${x.n >= 0 ? "+" : ""}${fmt(x.n)}</em></li>`).join("")}</ul>` : `<div class="wmk-empty"><p>${esc(T("Nothing yet — your ARCL movements are written down here from now on."))}</p></div>`}`;
    } else if (tab === "team") paintTeam(B);
  }
  // ---------------- the team's tab ----------------
  function paintTeam(B) {
    const A = admin || {}, O = A.overview, S = A.settles || [];
    B.innerHTML = `${O ? `<div class="wmk-cards"><div><small>${esc(T("Earned (all)"))}</small><b>${fmt(O.all.earned)}</b></div><div><small>${esc(T("Spent (all)"))}</small><b>${fmt(O.all.spent)}</b></div><div><small>${esc(T("Market sales"))}</small><b>${fmt(O.all.sales)}</b></div><div class="hot"><small>${esc(T("Platform"))}</small><b>${fmt(O.platform)}</b></div></div>
      <p class="wmk-note">${esc(T("Settlements: {a} waiting · {b} approved · {c} paid (ARCL) · {n} listings", { a: fmt(O.settle.requested), b: fmt(O.settle.approved), c: fmt(O.settle.completed), n: fmt(O.listings) }))}</p>
      <div class="wmk-days">${(O.days || []).slice(0, 7).map((d) => `<span><small>${esc(d.day.slice(5))}</small><b>+${fmt(d.earn)}</b><em>−${fmt(d.spend)}</em></span>`).join("")}</div>` : `<p class="wmk-load">…</p>`}
      <h4>${esc(T("Settlement queue"))}</h4>${S.length ? `<ul class="wmk-list">${S.map((x) => `<li><div><b>${fmt(x.amount)} ARCL · ${esc(short(x.w))}</b><small>${esc(when(x.at))}${x.quote ? ` · ${fmt(x.quote.arc)} $ARCIRCLE` : ""}${x.tx ? ` · tx` : ""}</small></div><span class="wmk-acts">${x.status === "requested" ? `<button type="button" data-quote="${esc(x.id)}">${esc(T("Quote"))}</button><button type="button" data-reject="${esc(x.id)}">✕</button>` : x.status === "approved" ? `<button type="button" class="go" data-pay="${esc(x.id)}" data-to="${esc(x.w)}" data-arc="${x.quote.arc}">${esc(T("Pay from my wallet"))}</button><button type="button" data-reject="${esc(x.id)}">✕</button>` : `<span class="wmk-st ${esc(x.status)}">${esc(x.status)}</span>`}</span></li>`).join("")}</ul>` : `<p class="wmk-note">${esc(T("Nothing waiting."))}</p>`}
      <h4>${esc(T("Player logs"))}</h4><div class="wmk-form wmk-row"><input class="wmk-logq" placeholder="${esc(T("name or 0x…"))}"><button type="button" data-plog>${esc(T("Look up"))}</button></div>${plogHtml(A.plog)}
      <h4>${esc(T("A wallet's ledger"))}</h4><div class="wmk-form wmk-row"><input class="wmk-who" placeholder="0x…"><button type="button" data-who>${esc(T("Look up"))}</button></div>
      ${A.wallet ? `<p class="wmk-note">${esc(short(A.wallet.w))}: ${fmt(A.wallet.buckets.bal)} ARCL · ${esc(T("bought"))} ${fmt(A.wallet.buckets.purchased)} · ${esc(T("creator"))} ${fmt(A.wallet.buckets.cavail)}/${fmt(A.wallet.buckets.cplay)} · ${esc(T("held"))} ${fmt(A.wallet.buckets.held)}</p><ul class="wmk-tx">${A.wallet.list.slice(0, 80).map((x) => `<li class="${x.n >= 0 ? "in" : "out"}"><div><b>${esc(x.t)} · ${esc(x.k)}</b><small>${esc(when(x.at))}${x.ref ? " · " + esc(x.ref) : ""}</small></div><em>${x.n >= 0 ? "+" : ""}${fmt(x.n)}</em></li>`).join("")}</ul>` : ""}
      <h4>${esc(T("Refund a sale on hold"))}</h4><div class="wmk-form wmk-row"><input class="wmk-sale" placeholder="${esc(T("sale id (item_buyer)"))}"><button type="button" data-refund>${esc(T("Refund"))}</button></div>`;
  }
  /// the per-player log (the owner, 2026-10-25): who reported what — errors, slow or stuck loads, the times they got in
  function plogHtml(L) {
    if (!L) return `<p class="wmk-note">${esc(T("Search a player by name or wallet: their errors and loads, newest first."))}</p>`;
    const line = (e) => `<li class="${/^ready in/.test(e.m) ? "ok" : "bad"}"><div><b>${esc(e.m)}</b><small>${esc(when(e.at))} · ${esc(e.ua || "?")} · ${esc(e.d || "")} · ${esc(e.q || "")} · ${esc(e.g || "")}${e.v ? " · " + esc(e.v) : ""}${e.s ? " · " + esc(e.s) : ""}</small></div></li>`;
    const found = (L.found || []).map((u) => `<h5>${esc(u.name || "?")} · ${esc(short(u.w))}</h5><ul class="wmk-list wmk-plog">${(u.list || []).map(line).join("") || `<li><small>${esc(T("Nothing reported yet"))}</small></li>`}</ul>`).join("");
    const recent = `<h5>${esc(T("Recent players with reports"))}</h5><ul class="wmk-list wmk-plog">${(L.recent || []).slice(0, 30).map((u) => `<li class="${u.err ? "bad" : "ok"}"><div><b>${esc(u.name || "?")} · ${esc(short(u.w))}</b><small>${esc(when(u.at))} · ${esc(u.ua || "")} · ${esc(T("{n} errors", { n: u.err || 0 }))} · ${esc(u.last || "")}</small></div></li>`).join("")}</ul>`;
    return found + recent;
  }
  async function loadAdmin() {
    const [o, s] = await Promise.all([api("world-econ-admin", { op: "overview" }), api("world-econ-admin", { op: "settles" })]);
    admin = { ...(admin || {}), overview: o.ok ? o.j : null, settles: s.ok ? s.j.list : [] }; if (tab === "team") paint();
  }
  // ---------------- actions ----------------
  async function onClick(e) {
    if (e.target === el || e.target.closest(".wmk-x")) { close(); return; }
    const b = e.target.closest("button"); if (!b || busy) return;
    if (b.dataset.tab) { tab = b.dataset.tab; (Snd.tab || (() => {}))(); paint(); if (tab === "team") loadAdmin(); else { await load(true); paint(); } return; }
    if (b.dataset.sort) { sort = b.dataset.sort; items = null; paint(); await load(); paint(); return; }
    // a purchase takes a second tap (the button says the price, then "Tap again to buy")
    if (b.dataset.buy && !b.classList.contains("sure")) { el.querySelectorAll(".wmk-buy.sure").forEach((x) => { x.classList.remove("sure"); x.innerHTML = x.dataset.was; }); b.dataset.was = b.innerHTML; b.classList.add("sure"); b.textContent = T("Tap again to buy"); setTimeout(() => { if (b.isConnected && b.classList.contains("sure")) { b.classList.remove("sure"); b.innerHTML = b.dataset.was; } }, 3500); return; }
    busy = true; try {
      if (b.dataset.buy) { const r = await api("world-market-buy", { id: b.dataset.buy, expectedPrice: Number(b.dataset.price) });
        if (!r.ok) toast(T("Couldn't buy it: {e}", { e: String((r.j && r.j.error) || "").slice(0, 80) })); else { (Snd.coin || Snd.buy || (() => {}))(); toast(`🏗️ <b>${esc(T("It's yours: {t}", { t: r.j.title }))}</b> ${esc(T("Find it under Mine and build it on your island."))}`); if (ctx.refresh) ctx.refresh(); await load(true); paint(); } }
      else if (b.dataset.build) { const o = ((me && me.owned) || []).find((x) => x.id === b.dataset.build); if (o && ctx.build) { close(); ctx.build(o.code, o.title); } }
      else if (b.classList.contains("wmk-sell")) { const title = el.querySelector(".wmk-title").value.trim(), price = Number(String(el.querySelector(".wmk-price").value).replace(/[^0-9]/g, "")), code = ctx.myCode ? await ctx.myCode() : "";
        if (code === null) { toast(T("Go to your island first (Menu → Island), then sell it from here")); return; } if (!code) { toast(T("Build something on your island first")); return; }
        const r = await api("world-market-list", { title, price, code }); if (!r.ok) toast(T("Couldn't list it: {e}", { e: String((r.j && r.j.error) || "").slice(0, 80) })); else { toast(`🏗️ <b>${esc(T("On sale: {t}", { t: r.j.item.title }))}</b>`); (Snd.place || Snd.coin || (() => {}))(); await load(true); paint(); } }
      else if (b.dataset.unlist) { const r = await api("world-market-unlist", { id: b.dataset.unlist }); if (!r.ok) toast(String((r.j && r.j.error) || "")); await load(true); paint(); }
      else if (b.classList.contains("wmk-settle")) { const amount = Number(String(el.querySelector(".wmk-amt").value).replace(/[^0-9]/g, "")); const r = await api("world-settle-ask", { amount });
        if (!r.ok) toast(T("Couldn't ask: {e}", { e: String((r.j && r.j.error) || "").slice(0, 80) })); else { toast(`💠 <b>${esc(T("Settlement asked: {n} ARCL", { n: fmt(amount) }))}</b> ${esc(T("The team will look at it."))}`); if (ctx.refresh) ctx.refresh(); await load(true); paint(); } }
      else if (b.dataset.quote) { const v = prompt(T("How much $ARCIRCLE for this settlement?")); const arc = Number(String(v || "").replace(/[^0-9]/g, "")); if (!arc) return; const r = await api("world-econ-admin", { op: "quote", id: b.dataset.quote, arc, src: "manual" }); if (!r.ok) toast(String((r.j && r.j.error) || "")); await loadAdmin(); }
      else if (b.dataset.reject) { const note = prompt(T("Why is it turned down?")) || "turned down"; const r = await api("world-econ-admin", { op: "reject", id: b.dataset.reject, note }); if (!r.ok) toast(String((r.j && r.j.error) || "")); await loadAdmin(); }
      else if (b.dataset.pay) { await pay(b.dataset.pay, b.dataset.to, Number(b.dataset.arc)); }
      else if (b.dataset.plog != null) { const q = el.querySelector(".wmk-logq").value.trim(); const r = await api("world-diag-user", { q }); if (r.ok) admin = { ...(admin || {}), plog: r.j }; else toast(String((r.j && r.j.error) || "")); paint(); }
      else if (b.dataset.who != null) { const w = el.querySelector(".wmk-who").value.trim().toLowerCase(); const r = await api("world-econ-admin", { op: "wallet", who: w }); if (r.ok) admin = { ...(admin || {}), wallet: r.j }; else toast(String((r.j && r.j.error) || "")); paint(); }
      else if (b.dataset.refund != null) { const sale = el.querySelector(".wmk-sale").value.trim(); const r = await api("world-econ-admin", { op: "refund", sale }); toast(r.ok ? T("Refunded") : String((r.j && r.j.error) || "")); }
    } finally { busy = false; }
  }
  // the GM pays from their own wallet; the server then reads the transfer back from the chain
  async function pay(id, to, arc) {
    if (!ctx.sendArc) { toast(T("Wallet connect isn't available here.")); return; }
    let tx = null; try { tx = await ctx.sendArc(to, arc); } catch (e) { toast(e && e.code === 4001 ? T("Cancelled in the wallet") : T("The transfer didn't go through: {e}", { e: String((e && e.message) || e).slice(0, 90) })); return; }
    toast(T("Sent. Waiting for the transaction to confirm…"));
    for (let i = 0; i < 40; i++) { await new Promise((ok) => setTimeout(ok, i ? 3000 : 2000)); const r = await api("world-econ-admin", { op: "paid", id, tx }); if (r.ok) { toast(`✅ <b>${esc(T("Settlement paid"))}</b>`); (Snd.coin || (() => {}))(); break; } if (r.status !== 202 && r.status < 500) { toast(T("Sent, but it couldn't be closed: {e}", { e: String((r.j && r.j.error) || "").slice(0, 90) })); break; } }
    await loadAdmin();
  }
  async function open(t) {
    if (!el) build(); if (t) tab = t; el.hidden = false; requestAnimationFrame(() => el.classList.add("on")); paint(); await load(true); paint(); if (tab === "team") loadAdmin();
  }
  function close() { if (!el) return; el.classList.remove("on"); el.hidden = true; if (ctx.onClose) ctx.onClose(); }
  return { open, close, isOpen: () => !!(el && !el.hidden) };
}
