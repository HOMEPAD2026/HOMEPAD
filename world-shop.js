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
const CATS = [["island", "Island", "Choose a style for your island.", "icon-island"], ["bricks", "Bricks", "Build and decorate your island.", "icon-bricks"], ["style", "Style", "Stand out in the world.", "icon-style"], ["plaza", "Plaza", "Be seen in the hub.", "icon-plaza"], ["items", "Items", "Gear and potions: buy and sell at the Forge.", "icon-style"]];
// each item's picture (images/shop/)
const artOf = (id) => "/images/shop/" + (id.startsWith("style-") ? "isle-" + id.slice(6) : id.startsWith("brick-") || id.startsWith("pack-") || id.startsWith("isle") ? id : id.startsWith("plate-") || id.startsWith("trail-") || id === "rename" ? "style-" + id : "plaza-" + id) + ".webp";
const usableId = (id) => /^(plate|trail|style)-/.test(id);
const QKEY = "arc.world.arclq";
const PKEY = "arc.world.payq"; // $ARCIRCLE payments sent but not confirmed yet: finished on the next load

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
  <ul class="wa-earn">${earn.map((e) => `<li class="${got.has(e.kind) ? "ok" : ""}"><i></i><span>${esc(T(e.label))}${e.more ? `<small>${esc(T(e.more))}</small>` : ""}</span><b>${e.n ? "+" + e.n : ""}</b></li>`).join("") || `<li class="wa-empty">${esc(T("Sign in with your wallet to see your progress."))}</li>`}</ul>
  <div class="wa-ex-two">
    <section><h3>${esc(T("History"))}</h3>${log ? `<table class="wa-log"><tbody>${log}</tbody></table>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`}</section>
    <section><h3>${esc(T("This week's top"))}</h3>${top && top.top && top.top.length ? `<ol class="wa-top">${top.top.slice(0, 10).map((x) => `<li><span>${esc(x.w)}</span><b>${fmt(x.n)}</b></li>`).join("")}</ol>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`}</section>
  </div>`;
}

export function createShop(ctx) {
  const { esc, toast, post, sess, Snd, P, coarse } = ctx;
  // single words stay out of the site-wide dictionary
  const LW = { ko: { Close: "닫기",  Items: "아이템",  Island: "섬", Style: "스타일", Plaza: "광장", Later: "나중에", Then: "그다음", Bricks: "브릭" }, zh: { Close: "关闭",  Items: "道具",  Island: "岛屿", Style: "外观", Plaza: "广场", Later: "稍后", Then: "然后", Bricks: "积木" }, tr: { Close: "Kapat", Items: "Eşyalar", Island: "Ada", Style: "Stil", Plaza: "Meydan", Later: "Sonra", Then: "Ardından", Bricks: "Brick'ler" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const $ = (id) => document.getElementById(id);
  let arcl = null, cat = null, own = null, top = null, shown = 0;
  const owns = (id) => !!(own && (own.items || []).includes(id));

  // ---------------- the HUD counter ----------------
  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "wp-chip wa-chip"; chip.id = "wa-chip"; chip.title = "ARCL"; chip.setAttribute("data-no-i18n", "");
  chip.innerHTML = `<img src="/images/arcl-64.png" alt="" width="18" height="18"><b id="wa-chip-n">0</b><small>ARCL</small><u class="wa-chip-day" aria-hidden="true"><i id="wa-chip-day"></i></u>`;
  const chips = document.querySelector(".wp-chips"); if (chips) chips.insertBefore(chip, chips.children[1] || null);
  chip.addEventListener("click", () => openExchange());
  function paintChip(roll) {
    const n = arcl ? arcl.bal : 0;
    // today's earnings against the daily limit, as a thin line under the number (full: gold, with a note on hover)
    const cap = (arcl && arcl.cap) || 0, today = (arcl && arcl.today) || 0, day = $("wa-chip-day");
    if (day) day.style.width = cap ? Math.min(100, (100 * today) / cap) + "%" : "0%";
    chip.classList.toggle("full", !!cap && today >= cap);
    chip.title = cap ? T("ARCL earned today: {n} / {cap}", { n: fmt(today), cap: fmt(cap) }) + (today >= cap ? " · " + T("Today's limit is reached. More tomorrow.") : "") : "ARCL";
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
    resumePending();
  }

  // ---------------- $ARCIRCLE payments sent but not confirmed yet: kept, and finished on their own ----------------
  const pend = () => { try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch { return []; } };
  const setPend = (q) => { try { localStorage.setItem(PKEY, JSON.stringify(q.slice(-10))); } catch { /* private */ } };
  const unpend = (tx) => setPend(pend().filter((x) => x.tx !== tx));
  const inflight = new Set();
  async function resumePending() {
    const s = sess(); if (!s) return;
    for (const x of pend()) {
      if (x.wallet !== s.wallet || inflight.has(x.tx)) continue;
      if (Date.now() - x.at > 45 * 60e3) { unpend(x.tx); continue; } // the server keeps a quote 40 minutes
      inflight.add(x.tx);
      try {
        const r = await post({ action: "world-pay-confirm", ...s, quote: x.quote, tx: x.tx });
        if (r.status === 202) continue;
        unpend(x.tx);
        if (!r.ok) { refresh(); continue; } // 409: already granted (the answer was lost) — sync what we own
        own = r.j.own; ctx.onOwn(own); ctx.onBought(x.item); Snd.win();
        const it = ((cat && cat.items) || []).find((y) => y.id === x.item);
        toast(T("Your purchase arrived: {x}", { x: it ? T(it.name) : x.item }));
      } catch { /* offline: try again next time */ } finally { inflight.delete(x.tx); }
    }
  }

  // ---------------- the daily check-in ----------------
  const daily = document.createElement("div");
  daily.className = "wa-daily"; daily.id = "wa-daily"; daily.hidden = true; daily.setAttribute("role", "dialog"); daily.setAttribute("aria-modal", "true"); daily.setAttribute("data-no-i18n", "");
  document.body.appendChild(daily);
  // the 7-day calendar: ARCL from the server (20, +5 a day of streak, up to 50) and a bonus from the game each day
  const DAYS = [
    { bonus: "hp2", line: "2 health potions" }, { bonus: "scrap60", line: "60 scrap" }, { bonus: "mix", line: "2 mana potions and a recall scroll" },
    { bonus: "scrap120", line: "120 scrap" }, { bonus: "xp150", line: "+150 XP" }, { bonus: "pots6", line: "3 health and 3 mana potions" },
    { bonus: "gear", line: "A gear chest: Rare or Epic, and a pet egg" },
  ];
  const arclFor = (streak) => 20 + Math.min(30, 5 * (Math.max(1, streak) - 1));
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c4.4 0 7-2.9 7-6.8 0-3.8-2.8-6.3-4.2-9.7-.4 2.4-1.6 3.6-2.8 4.3.2-3.5-1.6-6.4-4.4-7.8.4 3.3-2.6 6-2.6 10.8C5 19.1 7.6 22 12 22z"/></svg>';
  const BICON = { hp2: "pot hp", scrap60: "scrap", mix: "pot sp", scrap120: "scrap", xp150: "xp", pots6: "pot both", gear: "gear" };
  let dState = null;
  function openDaily() {
    const last = arcl && arcl.lastDay, streak = last ? arcl.streak || 0 : 0, done = last === seoulDay();
    const next = done ? streak : last === seoulDay(Date.now() - 864e5) ? streak + 1 : 1; // the streak today's chest makes
    const day = ((next - 1) % 7) + 1, start = next - day + 1;                       // where today sits in its week of 7
    dState = { next, day, done };
    const tile = (i) => {
      const d = i + 1, st = d < day || (d === day && done) ? "done" : d === day ? "today" : "next";
      return `<li class="wd-day ${st}${d === 7 ? " big" : ""}" data-d="${d}"><span class="wd-n">${esc(T("Day {n}", { n: d }))}</span>
        <span class="wd-ico"><img src="/images/arcl-64.png" alt="" width="34" height="34"><i class="wd-b ${BICON[DAYS[i].bonus]}"></i></span>
        <b>+${arclFor(start + i)}</b><small>${esc(T(DAYS[i].line))}</small>
        <em class="wd-stamp" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></em></li>`;
    };
    daily.innerHTML = `<div class="wd-card" role="document">
      <div class="wd-rays" aria-hidden="true"></div>
      <div class="wd-head"><span class="wd-flame${next > 1 ? " hot" : ""}">${FLAME}<b>${next}</b></span>
        <div><h2>${esc(T("Daily reward"))}</h2><p>${esc(done ? T("Today's chest is open. Come back tomorrow for day {n}.", { n: (day % 7) + 1 }) : next > 1 ? T("{n}-day streak — keep it going.", { n: next }) : T("Open a chest every day; the seventh holds gear."))}</p></div></div>
      <ol class="wd-days">${DAYS.map((_, i) => tile(i)).join("")}</ol>
      <div class="wd-stage"><div class="wa-chest wd-chest${day === 7 ? " gold" : ""}" id="wa-chest"><span class="wa-chest-lid"></span><span class="wa-chest-box"></span><img src="/images/arcl-128.png" alt="" class="wa-chest-coin"></div><ul class="wd-got" id="wd-got"></ul></div>
      ${done ? `<button type="button" class="wp-cta" id="wa-daily-x2">${esc(T("Close"))}</button>` : `<button type="button" class="wp-cta wd-go" id="wa-daily-go">${esc(T("Open day {n}: +{a} ARCL and {b}", { n: day, a: arclFor(next), b: T(DAYS[day - 1].line) }))}</button><button type="button" class="wp-link" id="wa-daily-x">${esc(T("Later"))}</button>`}
      <p class="wd-note">${esc(T("Miss a day and the streak starts again at day 1. ARCL is the game's points; the exchange isn't open."))}</p></div>`;
    daily.hidden = false; ctx.freeze(true);
  }
  function closeDaily() { if (daily.hidden) return; daily.hidden = true; ctx.freeze(false); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  daily.addEventListener("click", async (e) => {
    const id = e.target.closest("button") ? e.target.closest("button").id : "";
    if (id === "wa-daily-x" || id === "wa-daily-x2" || id === "wa-daily-done" || e.target === daily) { closeDaily(); return; }
    if (id !== "wa-daily-go") return;
    const go = $("wa-daily-go"), chest = $("wa-chest"), card = daily.querySelector(".wd-card"), s = sess();
    if (!s) { toast(T("Sign in with your wallet to collect ARCL")); return; }
    go.disabled = true; go.textContent = T("Opening…"); chest.classList.add("shake"); Snd.chest && Snd.chest();
    let r = null; try { r = await post({ action: "world-arcl-claim", ...s, kind: "daily" }); } catch { r = null; }
    await wait(500);
    chest.classList.remove("shake");
    if (!r || !r.ok) {
      const msg = r && r.status === 409 ? T("Today's chest is already open.") : (r && r.j && r.j.error) || T("Couldn't open it. Try again.");
      toast(msg); if (r && r.status === 409) { await refresh(); openDaily(); } else { go.disabled = false; go.textContent = T("Try again"); }
      return;
    }
    arcl = { ...(arcl || {}), ...r.j, lastDay: seoulDay() }; paintChip(true);
    const day = ((Math.max(1, r.j.streak || 1) - 1) % 7) + 1;
    chest.classList.add("open"); card.classList.add("burst"); Snd.coin && Snd.coin();
    const rc = chest.getBoundingClientRect();
    if (r.j.credited > 0) flyCoins(r.j.credited, { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 });
    const t = daily.querySelector(`.wd-day[data-d="${day}"]`); if (t) { t.classList.remove("today"); t.classList.add("done", "stamp"); }
    const lines = [{ k: "arcl", text: r.j.credited > 0 ? T("+{n} ARCL", { n: r.j.credited }) : T("ARCL: today's limit is already reached") }];
    try { const got = ctx.dailyBonus ? ctx.dailyBonus(DAYS[day - 1].bonus) : null; if (got) lines.push(...got); } catch { /* the ARCL stands */ }
    if (r.j.petegg && r.j.own) { own = r.j.own; ctx.onOwn(own); lines.push({ k: "pet", text: T("A free pet egg hatched!") }); } // day 7 (the server rolls it; the game shows the card)
    const ul = $("wd-got");
    for (const [i, x] of lines.entries()) { await wait(i ? 380 : 650); const li = document.createElement("li"); li.className = "wd-g " + (x.k || ""); if (x.color) li.style.setProperty("--rc", x.color); li.textContent = x.text; ul.appendChild(li); requestAnimationFrame(() => li.classList.add("in")); }
    go.disabled = false; go.id = "wa-daily-done"; go.textContent = T("Got it");
    const later = $("wa-daily-x"); if (later) later.remove();
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
    view = "shop"; if (t) tab = t; sheet.hidden = false; ctx.freeze(true); resumePending();
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
    const buy = have && !it.use ? (usable ? `<button type="button" class="wa-use" data-use="${it.id}" aria-pressed="${using}">${esc(using ? T("In use") : T("Use"))}</button>` : /^(brick|pack)-|^isle(48|64)$/.test(it.id) && ctx.buildWith ? `<button type="button" class="wa-use" data-build="${it.id}">${esc(T("Build with it"))}</button>` : `<span class="wa-owned">${esc(T("Owned"))}</span>`)
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
    if (b.dataset.tab === "items" && ctx.openForge) { close(); ctx.openForge(); return; } // gear lives at the Forge (world-rpg.js)
    if (b.dataset.tab) { tab = b.dataset.tab; paintShop(); return; }
    if (b.hasAttribute("data-ex")) { openExchange(); return; }
    if (b.dataset.use) { ctx.use(b.dataset.use); paintShop(); return; }
    if (b.dataset.build) { close(); ctx.buildWith(b.dataset.build); return; } // straight to your island's builder, the piece in hand
    const card = b.closest(".wa-item"), sel = card && card.querySelector(".wa-coin"), target = sel ? sel.value : "";
    if (b.dataset.arcl) { b.classList.add("wa-busy"); b.setAttribute("aria-busy", "true"); try { await buyArcl(b.dataset.arcl, target, card); } finally { b.classList.remove("wa-busy"); b.removeAttribute("aria-busy"); } }
    else if (b.dataset.arc) await payArc(b.dataset.arc, target, card);
  });
  function needSignIn() { if (sess()) return false; toast(T("Sign in with your wallet first")); close(); ctx.openAuth(); return true; }
  async function buyArcl(id, target, card) {
    if (needSignIn()) return;
    busy = true;
    try {
      // the counter moves at once (the price is known); the server's answer then settles it, or puts it back
      const it = cat && (cat.items || []).find((x) => x.id === id), price = it && it.arcl != null ? Number(it.arcl) : 0;
      if (price) delta(-price);
      const r = await post({ action: "world-arcl-spend", ...sess(), item: id, target }).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) { if (price) delta(price); toast(r.j.error || T("Couldn't buy that")); Snd.bad(); return; }
      arcl = { ...(arcl || {}), ...r.j }; own = r.j.own; ctx.onOwn(own); paintChip(true);
      bought(id, card);
    } finally { busy = false; }
  }
  // a wallet's error, in plain words (never raw RPC text)
  const nice = (err) => { const m = String((err && err.message) || ""); return err && (err.code === 4001 || /reject|denied|cancel/i.test(m)) ? T("You cancelled it in your wallet. Nothing was sent.") : /insufficient funds|gas/i.test(m) ? T("Not enough USDC for the network fee.") : /chain|network/i.test(m) ? T("Switch your wallet to the Arc network and try again.") : /timeout|timed out/i.test(m) ? T("Your wallet didn't answer — try again.") : T("Payment failed."); };
  async function payArc(id, target, card, onStatus) {
    if (!card && !sess()) { toast(T("Sign in with your wallet first")); return false; }
    if (needSignIn()) return;
    const s = sess(), AC = ctx.AC;
    const status = (t) => { if (!card) { if (t) (onStatus || toast)(t); return; } let el = card.querySelector(".wa-status"); if (!el) { el = document.createElement("p"); el.className = "wa-status"; card.appendChild(el); } el.textContent = t; };
    if (!AC) { status(T("Wallet connect isn't available here.")); return; }
    busy = true;
    let tx = null;
    try {
      if (!AC.live || !AC.live()) await AC.connect();
      if (lc(ctx.addr()) !== s.wallet) { status(T("Switch your wallet to the one you signed in with ({w})", { w: s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4) })); return; }
      status(T("Getting the price…"));
      const q = await post({ action: "world-pay-quote", ...s, item: id, target });
      if (!q.ok) { status(q.j.error || T("Couldn't price that")); return; }
      const prov = await AC.provider();
      try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_HEX }] }); } catch (e) {
        if (e && e.code === 4001) throw e;
        if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ""))) { const C = (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG) || {}; await prov.request({ method: "wallet_addEthereumChain", params: [{ chainId: ARC_HEX, chainName: C.CHAIN_NAME || "Arc", rpcUrls: [C.RPC_URL || "https://rpc.mainnet.arc.io"], blockExplorerUrls: [C.BLOCK_EXPLORER || "https://arc.etherscan.io"], nativeCurrency: C.NATIVE_CURRENCY || { name: "USDC", symbol: "USDC", decimals: 18 } }] }); }
      }
      // enough $ARCIRCLE? read through the wallet's own node; if the read fails, go on (the wallet still checks)
      let have = null;
      try { have = BigInt(await prov.request({ method: "eth_call", params: [{ to: q.j.token, data: "0x70a08231" + pad(ctx.addr()) }, "latest"] })); } catch { /* fail open */ }
      if (have !== null && have < BigInt(q.j.amount)) { status(T("You need {n} $ARCIRCLE; you have {m}.", { n: fmt(q.j.tokens), m: fmt(Number(have / 10n ** 14n) / 1e4) })); Snd.bad(); return; }
      status(T("Confirm sending {n} $ARCIRCLE in your wallet. Half is burned, half goes to the treasury.", { n: fmt(q.j.tokens) }));
      const data = "0xa9059cbb" + pad(q.j.to) + pad(BigInt(q.j.amount).toString(16));
      tx = await prov.request({ method: "eth_sendTransaction", params: [{ from: ctx.addr(), to: q.j.token, data }] });
      // kept until the server answers, so a closed tab or a slow block still ends in the item (resumePending)
      setPend([...pend().filter((x) => x.tx !== tx), { quote: q.j.quote, tx, item: id, target, wallet: s.wallet, at: Date.now() }]); inflight.add(tx);
      status(T("Sent. Waiting for the transaction to confirm…"));
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, i ? 3000 : 1500));
        const r = await post({ action: "world-pay-confirm", ...s, quote: q.j.quote, tx });
        if (r.status === 202) continue;
        unpend(tx);
        if (!r.ok) { status(r.j.error || T("Couldn't confirm the payment")); return; }
        own = r.j.own; ctx.onOwn(own); status(""); payAnim(q.j.tokens); if (card) bought(id, card); return true;
      }
      status(T("Still waiting. We'll finish it for you when it confirms, even after a reload."));
    } catch (err) {
      status(tx ? T("Still waiting. We'll finish it for you when it confirms, even after a reload.") : nice(err));
    } finally { busy = false; if (tx) inflight.delete(tx); }
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

  // a sale or a Forge buy answers with the new balance: shown at once, without another round trip. `delta` moves the
  // counter before the answer arrives (the Forge's instant feedback); the server's numbers then settle it.
  function apply(j, roll = true) { if (!j) return; arcl = { ...(arcl || {}), ...j }; paintChip(roll); }
  function delta(n, d = {}) { if (!arcl) return; arcl = { ...arcl, bal: Math.max(0, (arcl.bal || 0) + n), today: Math.max(0, (arcl.today || 0) + (d.today || 0)), sold: Math.max(0, (arcl.sold || 0) + (d.sold || 0)) }; paintChip(true); }
  return {
    apply, delta,
    refresh, claim, flushQueue, resumePending, maybeDaily, openDaily: () => { if (arcl) openDaily(); else refresh().then(() => openDaily()); }, dailyDone: () => !!(arcl && arcl.lastDay === seoulDay()), openShop, openExchange, owns, close: () => { close(); closeDaily(); },
    pay: async (id, target = "", onStatus = null) => !!(await payArc(id, target, null, onStatus)), // the game's own purchases (a revive)
    /// knocked out (world-combat.js): "down" records it and says whether today's free get-up is left; "rest" starts the
    /// 24-hour rest; "view" reads the state. null when signed out or offline (the game then keeps its own count).
    ko: async (what) => {
      const s = sess(); if (!s) return null;
      try {
        if (what === "view") { const r = await fetch("/api/social?world=ko&wallet=" + s.wallet, { cache: "no-store" }); return r.ok ? await r.json() : null; }
        const r = await post({ action: what === "rest" ? "world-ko-rest" : "world-ko", ...s }); return r.ok ? r.j : null;
      } catch { return null; }
    },
    /// the Magic Forge's free repairs (3 a day, at your own island): the server counts them and hands back a credit for the piece
    repairFree: async (id) => { const sv = sess(); if (!sv) return { error: T("Sign in with your wallet first") }; const r = await post({ action: "world-repair-free", ...sv, id, base: true }).catch(() => ({ ok: false, j: {} })); if (r.ok && r.j.own) { own = r.j.own; ctx.onOwn(own); } return r.ok ? r.j : { error: r.j.error || T("Couldn't repair that") }; },
    repairLeft: async () => { const sv = sess(); if (!sv) return null; try { const r = await fetch("/api/social?world=repair&wallet=" + sv.wallet, { cache: "no-store" }); return r.ok ? (await r.json()).left : null; } catch { return null; } },
    arcl: () => arcl, own: () => own, open: () => !sheet.hidden || !daily.hidden, fly: (n, from) => flyCoins(n, from),
  };
}
