// world-shop.js — ARCL in ARCIRCLE World: the HUD counter, the daily check-in, the ARCL Shop and the ARCL Exchange.
//
// ARCL is the game's own points (api/_world-shop.mjs keeps the ledger): earned for things the server can check,
// spent on cosmetics, never bought. The Exchange shows it and stays locked: "not open yet, rate not set" until the
// rules are announced — EXCHANGE in the API is the one switch.
// The shop sells each item for ARCL, or for $ARCIRCLE: the player's own wallet sends $ARCIRCLE to ArcircleFeeBurn
// (they sign it; nothing is sent for them), the server checks the receipt, and the hourly flush burns half and sends
// half to the ARCIRCLE PAD treasury.
const ARC_HEX = "0x13b2"; // Arc mainnet (5042)
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const lc = (a) => String(a || "").toLowerCase();
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const seoulDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
// the shop's tabs: [id, name, line under the name, icon]
const CATS = [["island", "Island", "Choose a style for your island.", "icon-island"], ["bricks", "Bricks", "Build and decorate your island.", "icon-bricks"], ["style", "Style", "Stand out in the world.", "icon-style"], ["plaza", "Plaza", "Be seen in the hub.", "icon-plaza"]];
// each item's picture (images/shop/)
const artOf = (id) => "/images/shop/" + (id.startsWith("style-") ? "isle-" + id.slice(6) : id.startsWith("brick-") || id.startsWith("pack-") || id.startsWith("isle") ? id : id.startsWith("plate-") || id.startsWith("trail-") || id === "rename" ? "style-" + id : "plaza-" + id) + ".webp";
const usableId = (id) => /^(plate|trail|style)-/.test(id);
const QKEY = "arc.world.arclq";

// The exchange screen, shared with the /arcl page. d: GET ?world=arcl (or null for a guest), top: GET ?world=arcl-top
export function exchangeHTML(d, top, { T, esc, signedIn }) {
  const ex = (d && d.exchange) || {};
  const earn = (d && d.earn) || [];
  const got = new Set((d && d.got) || []);
  const label = (k) => { const e = earn.find((x) => x.kind === k); return e ? T(e.label) : String(k).startsWith("support:") ? T("Support reward") : k; };
  const log = ((d && d.log) || []).map((x) => `<tr><td>${esc(new Date(x.at).toLocaleDateString())}</td><td>${esc(x.t === "earn" ? label(x.k) : String(x.k).startsWith("forge:") ? T("Forge: {x}", { x: x.k.slice(6) }) : T("Bought: {x}", { x: x.k }))}</td><td class="${x.n >= 0 ? "up" : "down"}">${x.n >= 0 ? "+" : ""}${fmt(x.n)}</td></tr>`).join("");
  return `
  <div class="wa-ex-grid">
    <section class="wa-ex-bal"><img src="/images/arcl-128.png" alt="" width="64" height="64"><div><small>${esc(T("Your ARCL"))}</small><b>${d ? fmt(d.bal) : "—"}</b>
      <span>${d ? esc(T("Today {n} / {cap}", { n: fmt(d.today), cap: fmt(d.cap) })) : esc(T("Sign in with your wallet to keep ARCL"))}</span></div></section>
    <section class="wa-ex-rate"><small>${esc(T("Exchange rate"))}</small><b>${ex.rate ? esc(String(ex.rate)) : esc(T("Not set yet"))}</b>
      <div class="wa-ex-lock"><label><span>${esc(T("ARCL to exchange"))}</span><input disabled placeholder="0"></label><span class="wa-ex-arrow">→</span><label><span>$ARCIRCLE</span><input disabled placeholder="—"></label></div>
      <button type="button" class="wa-ex-btn" disabled><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>${esc(T("Exchange isn't open yet"))}</button></section>
  </div>
  <p class="wa-ex-note">${esc(T("ARCL is in-game points. It can't be exchanged for $ARCIRCLE yet. An exchange is being prepared; the rate and the start date will be announced once they're decided."))}</p>
  <ol class="wa-ex-steps"><li class="done"><b>${esc(T("Now"))}</b>${esc(T("Earn ARCL by playing and spend it in the ARCL Shop."))}</li><li><b>${esc(T("Next"))}</b>${esc(T("The exchange rate and rules are announced."))}</li><li><b>${esc(T("Then"))}</b>${esc(T("The exchange opens here."))}</li></ol>
  ${signedIn ? `<label class="wa-ex-notify"><input type="checkbox" id="wa-notify" ${d && d.notify ? "checked" : ""}> ${esc(T("Tell me when the exchange opens"))}</label>` : ""}
  <h3>${esc(T("How to earn ARCL"))}</h3>
  <ul class="wa-earn">${earn.map((e) => `<li class="${got.has(e.kind) ? "ok" : ""}"><i></i><span>${esc(T(e.label))}${e.more ? `<small>${esc(T(e.more))}</small>` : ""}</span><b>+${e.n}</b></li>`).join("") || `<li class="wa-empty">${esc(T("Sign in with your wallet to see your progress."))}</li>`}</ul>
  <div class="wa-ex-two">
    <section><h3>${esc(T("History"))}</h3>${log ? `<table class="wa-log"><tbody>${log}</tbody></table>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`}</section>
    <section><h3>${esc(T("This week's top"))}</h3>${top && top.top && top.top.length ? `<ol class="wa-top">${top.top.slice(0, 10).map((x) => `<li><span>${esc(x.w)}</span><b>${fmt(x.n)}</b></li>`).join("")}</ol>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`}</section>
  </div>`;
}

export function createShop(ctx) {
  const { esc, toast, post, sess, Snd, P, coarse } = ctx;
  // single words stay out of the site-wide dictionary
  const LW = { ko: { Island: "섬", Style: "스타일", Plaza: "광장", Later: "나중에", Then: "그다음", Bricks: "브릭" }, zh: { Island: "岛屿", Style: "外观", Plaza: "广场", Later: "稍后", Then: "然后", Bricks: "积木" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const $ = (id) => document.getElementById(id);
  let arcl = null, cat = null, own = null, top = null, shown = 0;
  const owns = (id) => !!(own && (own.items || []).includes(id));

  // ---------------- the HUD counter ----------------
  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "wp-chip wa-chip"; chip.id = "wa-chip"; chip.title = "ARCL"; chip.setAttribute("data-no-i18n", "");
  chip.innerHTML = `<img src="/images/arcl-64.png" alt="" width="18" height="18"><b id="wa-chip-n">0</b><small>ARCL</small>`;
  const chips = document.querySelector(".wp-chips"); if (chips) chips.insertBefore(chip, chips.children[1] || null);
  chip.addEventListener("click", () => openExchange());
  function paintChip(roll) {
    const n = arcl ? arcl.bal : 0;
    if (!roll || ctx.reduce) { shown = n; $("wa-chip-n").textContent = fmt(n); return; }
    const from = shown, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); shown = from + (n - from) * (1 - Math.pow(1 - k, 3)); $("wa-chip-n").textContent = fmt(shown); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step); chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
  }

  // ---------------- data ----------------
  async function refresh() {
    const s = sess();
    try {
      const [a, c] = await Promise.all([
        s ? fetch("/api/social?world=arcl&wallet=" + s.wallet).then((r) => (r.ok ? r.json() : null)) : null,
        fetch("/api/social?world=shop" + (s ? "&wallet=" + s.wallet : "")).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (a && !a.error) arcl = a;
      if (c && !c.error) { cat = c; own = c.own || own; ctx.onOwn(own); }
    } catch { /* offline: keep what we have */ }
    paintChip(false);
    return arcl;
  }

  // coins fly from a point on screen to the counter
  function flyCoins(n, from) {
    if (ctx.reduce) return;
    const r = chip.getBoundingClientRect(), x0 = from ? from.x : innerWidth / 2, y0 = from ? from.y : innerHeight / 2;
    for (let i = 0; i < Math.min(8, 2 + Math.floor(n / 15)); i++) {
      const img = document.createElement("img"); img.src = "/images/arcl-64.png"; img.className = "wa-fly"; img.alt = "";
      img.style.transform = `translate(${x0 + (Math.random() - 0.5) * 60}px,${y0 + (Math.random() - 0.5) * 40}px) scale(1.2)`; document.body.appendChild(img);
      setTimeout(() => { img.style.transform = `translate(${r.left + 6}px,${r.top + 4}px) scale(.45)`; img.style.opacity = "0.4"; }, 40 + i * 70);
      setTimeout(() => img.remove(), 900 + i * 70);
    }
  }

  // ---------------- earning: the server checks every claim; a guest's wait here until they sign in ----------------
  const queue = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; } };
  const setQueue = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-20))); } catch { /* private */ } };
  let guestHint = 0;
  async function claim(kind, extra = {}, from = null) {
    const s = sess();
    if (!s) {
      const q = queue(); if (!q.some((x) => x.kind === kind)) { q.push({ kind, ...extra }); setQueue(q); }
      if (Date.now() - guestHint > 120e3) { guestHint = Date.now(); toast(T("Sign in with your wallet to collect ARCL")); }
      return 0;
    }
    try {
      const r = await post({ action: "world-arcl-claim", ...s, kind, ...extra });
      if (r.ok && r.j.credited > 0) {
        arcl = { ...(arcl || {}), ...r.j }; paintChip(true); flyCoins(r.j.credited, from); Snd.coin();
        const e = (r.j.earn || (arcl && arcl.earn) || []).find((x) => x.kind === kind);
        toast(T("+{n} ARCL · {why}", { n: r.j.credited, why: e ? T(e.label) : kind === "daily" ? T("Daily check-in") : "" }));
        return r.j.credited;
      }
      if (r.ok && r.j.capped) toast(T("Today's ARCL limit is reached. More tomorrow."));
    } catch { /* next time */ }
    return 0;
  }
  async function flushQueue() {
    if (!sess()) return;
    const q = queue(); setQueue([]);
    for (const x of q) { const { kind, ...extra } = x; await claim(kind, extra); }
  }

  // ---------------- the daily check-in ----------------
  const daily = document.createElement("div");
  daily.className = "wa-daily"; daily.id = "wa-daily"; daily.hidden = true; daily.setAttribute("role", "dialog"); daily.setAttribute("aria-modal", "true"); daily.setAttribute("data-no-i18n", "");
  document.body.appendChild(daily);
  function openDaily() {
    const streak = arcl && arcl.lastDay ? arcl.streak : 0, next = arcl && arcl.lastDay === seoulDay(Date.now() - 864e5) ? streak + 1 : 1;
    const amt = 20 + Math.min(30, 5 * (next - 1));
    daily.innerHTML = `<div class="wa-daily-card"><h2>${esc(T("Daily check-in"))}</h2><p>${esc(T("Come back every day: the streak adds more ARCL."))}</p>
      <div class="wa-chest" id="wa-chest"><span class="wa-chest-lid"></span><span class="wa-chest-box"></span><img src="/images/arcl-128.png" alt="" class="wa-chest-coin"></div>
      <ol class="wa-streak">${Array.from({ length: 7 }, (_, i) => `<li class="${i < next ? "on" : ""}"><i></i><small>${i + 1}</small></li>`).join("")}</ol>
      <button type="button" class="wp-cta" id="wa-daily-go">${esc(T("Open: +{n} ARCL", { n: amt }))}</button><button type="button" class="wp-link" id="wa-daily-x">${esc(T("Later"))}</button></div>`;
    daily.hidden = false; ctx.freeze(true);
  }
  function closeDaily() { if (daily.hidden) return; daily.hidden = true; ctx.freeze(false); }
  daily.addEventListener("click", async (e) => {
    if (e.target.id === "wa-daily-x" || e.target === daily) { closeDaily(); return; }
    if (e.target.id !== "wa-daily-go") return;
    e.target.disabled = true; $("wa-chest").classList.add("open"); Snd.chest();
    const r = $("wa-chest").getBoundingClientRect();
    const got = await claim("daily", {}, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setTimeout(closeDaily, got ? 1300 : 600);
  });
  function maybeDaily() {
    const s = sess(); if (!s || !arcl) return;
    if (arcl.lastDay === seoulDay()) return;
    try { if (localStorage.getItem("arc.world.dailyAsk") === seoulDay()) return; localStorage.setItem("arc.world.dailyAsk", seoulDay()); } catch { /* private */ }
    openDaily();
  }

  // ---------------- sheets: the shop and the exchange ----------------
  const sheet = document.createElement("div");
  sheet.className = "wa-sheet"; sheet.id = "wa-sheet"; sheet.hidden = true; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("data-no-i18n", "");
  document.body.appendChild(sheet);
  let view = "", tab = "island", busy = false;
  const close = () => { if (sheet.hidden) return; sheet.hidden = true; ctx.freeze(false); };
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest("[data-x]")) close(); });
  const head = (title, sub) => `<div class="wa-shop-head"><img class="wa-shop-ico round" src="/images/arcl-128.png" alt="" width="60" height="60"><div class="wa-shop-title"><h2>${esc(title)}</h2><p>${esc(sub)}</p></div><button type="button" class="wa-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`;

  async function openExchange() {
    view = "ex"; sheet.hidden = false; ctx.freeze(true);
    sheet.innerHTML = `<div class="wa-card wa-ex">${head(T("ARCL Exchange"), T("Your ARCL, how to earn it, and the exchange to $ARCIRCLE (not open yet)."))}<div class="wa-body" id="wa-body"><p class="wa-empty">${esc(T("Loading…"))}</p></div></div>`;
    await refresh();
    try { const r = await fetch("/api/social?world=arcl-top"); top = r.ok ? await r.json() : null; } catch { top = null; }
    if (view !== "ex" || sheet.hidden) return;
    $("wa-body").innerHTML = exchangeHTML(arcl, top, { T, esc, signedIn: !!sess() }) + (sess() ? "" : `<button type="button" class="wp-cta wa-signin" id="wa-signin">${esc(T("Sign in with wallet"))}</button>`) + `<p class="wa-empty"><a class="wp-link" href="/arcl" target="_blank" rel="noopener">${esc(T("The ARCL page on the site"))}</a></p>`;
    const nt = $("wa-notify"); if (nt) nt.addEventListener("change", async () => { const r = await post({ action: "world-arcl-notify", ...sess(), on: nt.checked }); toast(r.ok ? (nt.checked ? T("We'll let you know when it opens.") : T("Notifications off.")) : r.j.error || T("Couldn't save that")); });
    const si = $("wa-signin"); if (si) si.addEventListener("click", () => { close(); ctx.openAuth(); });
  }

  async function openShop(t) {
    view = "shop"; if (t) tab = t; sheet.hidden = false; ctx.freeze(true);
    sheet.innerHTML = `<div class="wa-card wa-shop"><div class="wa-shop-head" id="wa-shop-head"></div><nav class="wa-tabs" id="wa-tabs" role="tablist"></nav><div class="wa-body" id="wa-body"><p class="wa-empty">${esc(T("Loading…"))}</p></div>
      <div class="wa-shop-foot"><span>${esc(T("Pay with ARCL, or with $ARCIRCLE: half of every $ARCIRCLE payment is burned, half goes to the treasury."))}</span><button type="button" class="wp-link" data-ex>${esc(T("ARCL Exchange"))}</button></div></div>`;
    if (!cat) await refresh();
    paintShop();
  }
  function paintShop() {
    if (view !== "shop" || sheet.hidden) return;
    const c = CATS.find((x) => x[0] === tab) || CATS[0];
    $("wa-shop-head").innerHTML = `<img class="wa-shop-ico" src="/images/shop/${c[3]}.webp" alt="" width="72" height="66"><div class="wa-shop-title"><h2>${esc(T(c[1]))}</h2><p>${esc(T(c[2]))}</p></div>
      <span class="wa-bal" title="ARCL"><img src="/images/arcl-64.png" alt="" width="28" height="28"><b>${fmt(arcl ? arcl.bal : 0)}</b></span><button type="button" class="wa-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    $("wa-tabs").innerHTML = CATS.map(([id, name]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === tab}" aria-pressed="${id === tab}">${esc(T(name))}</button>`).join("");
    if (!cat) { $("wa-body").innerHTML = `<p class="wa-empty">${esc(T("The shop opens once cloud saving is switched on."))}</p>`; return; }
    const items = (cat.items || []).filter((x) => x.cat === tab);
    $("wa-body").innerHTML = `<div class="wa-items">${items.map(itemCard).join("")}</div>`;
  }
  function itemCard(it) {
    const have = owns(it.id), locked = it.needs && !owns(it.needs);
    const usable = have && usableId(it.id);
    const using = usable && ctx.using(it.id);
    const pickCoin = it.target === "coin" || it.target === "mycoin";
    const coins = pickCoin ? (it.target === "mycoin" ? ctx.myCoins() : ctx.coins()) : [];
    const arclBtn = it.arcl != null ? `<button type="button" class="wa-pay-arcl" data-arcl="${it.id}" aria-label="${esc(T("Buy for {n} ARCL", { n: fmt(it.arcl) }))}"><img src="/images/arcl-64.png" alt="" width="22" height="22">${fmt(it.arcl)}</button>` : `<span class="wa-pay-only">${esc(T("$ARCIRCLE only"))}</span>`;
    const buy = have && !it.use ? (usable ? `<button type="button" class="wa-use" data-use="${it.id}" aria-pressed="${using}">${esc(using ? T("In use") : T("Use"))}</button>` : `<span class="wa-owned">${esc(/^(brick|pack)-/.test(it.id) ? T("In your builder") : T("Owned"))}</span>`)
      : locked ? `<span class="wa-need">${esc(T("Needs the 48×48 expansion"))}</span>`
      : (pickCoin && !coins.length) ? `<span class="wa-need">${esc(it.target === "mycoin" ? T("Launch a coin on ArcPad first") : T("No coins to show yet"))}</span>`
      : `${arclBtn}<button type="button" class="wa-pay-arc" data-arc="${it.id}">$${it.usd} ${esc(T("in $ARCIRCLE"))}</button>`;
    return `<article class="wa-item${have && !it.use ? " have" : ""}${using ? " using" : ""}" data-id="${it.id}"><div class="wa-item-art"><img src="${artOf(it.id)}" alt="" loading="lazy" decoding="async">${have && !it.use ? `<span class="wa-tag">${esc(using ? T("In use") : T("Owned"))}</span>` : ""}</div>
      <div class="wa-item-body"><h3>${esc(T(it.name))}</h3><p>${esc(T(it.line))}</p>
      ${pickCoin && coins.length && (!have || it.use) ? `<select class="wa-coin" aria-label="${esc(T("Coin"))}">${coins.map((c) => `<option value="${esc(lc(c.token))}">$${esc(c.symbol)}</option>`).join("")}</select>` : ""}
      <div class="wa-buy">${buy}</div></div></article>`;
  }
  sheet.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || busy) return;
    if (b.dataset.tab) { tab = b.dataset.tab; paintShop(); return; }
    if (b.hasAttribute("data-ex")) { openExchange(); return; }
    if (b.dataset.use) { ctx.use(b.dataset.use); paintShop(); return; }
    const card = b.closest(".wa-item"), sel = card && card.querySelector(".wa-coin"), target = sel ? sel.value : "";
    if (b.dataset.arcl) await buyArcl(b.dataset.arcl, target, card);
    else if (b.dataset.arc) await payArc(b.dataset.arc, target, card);
  });
  function needSignIn() { if (sess()) return false; toast(T("Sign in with your wallet first")); close(); ctx.openAuth(); return true; }
  async function buyArcl(id, target, card) {
    if (needSignIn()) return;
    busy = true;
    try {
      const r = await post({ action: "world-arcl-spend", ...sess(), item: id, target });
      if (!r.ok) { toast(r.j.error || T("Couldn't buy that")); Snd.bad(); return; }
      arcl = { ...(arcl || {}), ...r.j }; own = r.j.own; ctx.onOwn(own); paintChip(true);
      bought(id, card);
    } finally { busy = false; }
  }
  async function payArc(id, target, card, onStatus) {
    if (!card && !sess()) { toast(T("Sign in with your wallet first")); return false; }
    if (needSignIn()) return;
    const s = sess(), AC = ctx.AC;
    if (!AC) { toast(T("Wallet connect isn't available here.")); return; }
    busy = true;
    const status = (t) => { if (!card) { if (t) (onStatus || toast)(t); return; } let el = card.querySelector(".wa-status"); if (!el) { el = document.createElement("p"); el.className = "wa-status"; card.appendChild(el); } el.textContent = t; };
    try {
      if (!AC.live || !AC.live()) await AC.connect();
      if (lc(ctx.addr()) !== s.wallet) { toast(T("Switch your wallet to the one you signed in with ({w})", { w: s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4) })); return; }
      status(T("Getting the price…"));
      const q = await post({ action: "world-pay-quote", ...s, item: id, target });
      if (!q.ok) { status(""); toast(q.j.error || T("Couldn't price that")); return; }
      status(T("Confirm sending {n} $ARCIRCLE in your wallet. Half is burned, half goes to the treasury.", { n: fmt(q.j.tokens) }));
      const prov = await AC.provider();
      try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_HEX }] }); } catch { /* the wallet will say if it's on another chain */ }
      const data = "0xa9059cbb" + pad(q.j.to) + pad(BigInt(q.j.amount).toString(16));
      const tx = await prov.request({ method: "eth_sendTransaction", params: [{ from: ctx.addr(), to: q.j.token, data }] });
      status(T("Sent. Waiting for the transaction to confirm…"));
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, i ? 3000 : 1500));
        const r = await post({ action: "world-pay-confirm", ...s, quote: q.j.quote, tx });
        if (r.status === 202) continue;
        if (!r.ok) { status(r.j.error || T("Couldn't confirm the payment")); return; }
        own = r.j.own; ctx.onOwn(own); status(""); payAnim(q.j.tokens); if (card) bought(id, card); return true;
      }
      status(T("Still waiting. It'll be added when it confirms: open the shop again in a minute."));
    } catch (err) {
      status(err && (err.code === 4001 || /reject|denied|cancel/i.test(err.message || "")) ? T("You cancelled it in your wallet. Nothing was sent.") : (err && err.message) || T("Payment failed."));
    } finally { busy = false; }
  }
  function bought(id, card) {
    Snd.win(); ctx.onBought(id);
    const it = ((cat && cat.items) || []).find((x) => x.id === id);
    toast(T("Bought: {x}", { x: it ? T(it.name) : id }));
    if (card) { card.classList.add("just"); }
    setTimeout(paintShop, 500);
  }
  // the payment, shown: the coin splits — half into the fire, half into the treasury vault
  function payAnim(tokens) {
    ctx.furnace();
    if (ctx.reduce) return;
    const el = document.createElement("div"); el.className = "wa-pay-anim"; el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<img src="/images/arcircle-mark-sm.png" alt=""><div class="wa-split"><span class="burn">${esc(T("{n} burned", { n: fmt(tokens / 2) }))}</span><span class="tre">${esc(T("{n} to the treasury", { n: fmt(tokens / 2) }))}</span></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
  }

  return {
    refresh, claim, flushQueue, maybeDaily, openShop, openExchange, owns, close: () => { close(); closeDaily(); },
    pay: async (id, target = "", onStatus = null) => !!(await payArc(id, target, null, onStatus)), // the game's own purchases (a revive)
    arcl: () => arcl, own: () => own, open: () => !sheet.hidden || !daily.hidden,
  };
}
