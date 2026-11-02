// world-swap.js — the Exchange window (EX, 2026-11-02, the owner): $ARCL ⇄ $ARCIRCLE at the rate the TREASURY posts,
// settled by the treasury wallet (api/_world-swap.mjs). Four tabs:
//   Exchange       give / get cards, the live rate, the quote locked into the request, "how it works", the token loop
//                  (play → $ARCL → exchange → $ARCIRCLE → spent in the game: 50 % burned, 50 % back to the treasury)
//   My requests    your requests, their state, the transaction (open on the explorer / copy its link)
//   Public record  every settled exchange: who (short), how much, the rate, the transaction — and the totals
//   Treasury       only for the treasury wallet: the rate (and pause), the reserve, the queue — Send pays a request from
//                  the treasury's own wallet (a plain $ARCIRCLE transfer) and the server checks it on Arc
// $ARCIRCLE → $ARCL: the player's wallet sends the tokens to the treasury from here, then the request goes in with that
// transaction. A payment waiting for its block is kept on the device (arc.swap.pend / arc.swap.pay) and checked again on open.
// Loaded the first time the dock's Exchange is pressed.
const UIX = "/images/ui/exchange/"; // (Meshy art, raw/ex on claude/meshy-exchange: coins, icons, header, vault, sparkle)
const IMG = { arcl: UIX + "coin-arcl.webp?v=1", arc: UIX + "coin-arc.webp?v=1" };
const ic = (n, cls = "") => `<img class="wx-mi ${cls}" src="${UIX}ic-${n}.webp?v=1" alt="" draggable="false">`;
const ICON = {
  arcl: `<i class="wx-coin arcl"><img src="${IMG.arcl}" alt="" draggable="false"></i>`,
  arc: `<i class="wx-coin arc"><img src="${IMG.arc}" alt="" draggable="false"></i>`,
};
const NAME = { arcl: "$ARCL", arc: "$ARCIRCLE" };
const DIRS = { arcl2arc: ["arcl", "arc"], arc2arcl: ["arc", "arcl"] };
const WEI = 10n ** 18n;
const fmt = (n) => (n == null ? "—" : Math.floor(n).toLocaleString("en-US"));
const fmtR = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 }));
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const pad = (x) => String(x).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const arcFor = (arcl, rate) => (rate > 0 ? Math.floor(arcl / rate + 1e-9) : 0);
const arclFor = (arc, rate) => (rate > 0 ? Math.floor(arc * rate + 1e-9) : 0);
const ARROWS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3"/></svg>';
const LINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>';
const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';

export function createSwap(ctx) {
  const { T, esc, toast } = ctx, Snd = ctx.Snd || {};
  const EXP = String(ctx.explorer || "https://arc.etherscan.io").replace(/\/$/, ""), txUrl = (h) => EXP + "/tx/" + h;
  let el = null, data = null, dir = "arcl2arc", tab = "ex", busy = "", queue = null, cfgT = null;
  const S = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* this visit only */ } } };
  // the signed-in wallet — or, with no session (it lasts 23.5 h), the wallet that's connected: the treasury then still sees its tab
  // and is asked to sign in there (the owner, 2026-11-02: connected as the treasury, the tab wasn't there — the session had run out)
  // …and when the wallet app has switched to another account than the session's (the owner, 2026-11-02: the treasury connected,
  // the session still the GM wallet's — the window showed the GM's requests), the connected one wins and is asked to sign in
  const conn = () => { const a = ctx.addr && ctx.addr(); return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : ""; };
  const sessW = () => { const s = ctx.sess && ctx.sess(); return s && s.wallet ? String(s.wallet).toLowerCase() : ""; };
  const wallet = () => conn() || sessW();
  const signedIn = () => !!sessW() && (!conn() || conn() === sessW());
  const api = async (action, extra = {}) => { const s = ctx.sess(); if (!s || !signedIn()) return { ok: false, j: { error: T("Connect your wallet to exchange") } }; try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, j: { error: String((e && e.message) || e) } }; } };
  const errOf = (r) => String((r && r.j && r.j.error) || T("No connection — try again")).slice(0, 120);
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast(t); } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function load() {
    try { const w = wallet(); const r = await fetch("/api/social?world=swap" + (w ? "&wallet=" + w : ""), { cache: "no-store" }); data = r.ok ? await r.json() : data; } catch { /* the last read stays */ }
  }
  const rate = () => (data && data.rate) || 0, isOpen = () => !!(data && data.open);
  // the day's allowance ($ARCIRCLE a wallet can ask for in a Seoul day; the server refuses more)
  const dayLeft = () => (data && data.daily ? Math.max(0, data.daily.cap - data.daily.used) : null);
  const have = (k) => (!data ? null : k === "arcl" ? (data.arcl ? data.arcl.bal : null) : data.arcircle);
  const statusChip = (st) => `<span class="wx-st ${esc(st)}">${esc(T({ pending: "Waiting", done: "Done", rejected: "Turned down", cancelled: "Cancelled", refunded: "Refunded", returning: "Returning", returned: "Returned" }[st] || st))}</span>`;
  const when = (t) => { try { return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const txBtns = (h) => (h ? `<span class="wx-txb"><a href="${esc(txUrl(h))}" target="_blank" rel="noopener" title="${esc(T("Explorer"))}">${LINK}<em>${esc(short(h))}</em></a><button type="button" data-copytx="${esc(h)}" title="${esc(T("Copy transaction link"))}" aria-label="${esc(T("Copy transaction link"))}">${COPY}</button></span>` : "");

  function build() {
    el = document.createElement("div"); el.className = "wx"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("ARCIRCLE Exchange"));
    el.innerHTML = `<div class="wx-in"><div class="wx-aura" aria-hidden="true"></div><header class="wx-hd"><span class="wx-logos">${ICON.arcl}${ICON.arc}</span><div class="wx-tt"><small>ARCIRCLE</small><b>${esc(T("Exchange"))}</b></div><div class="wx-rate" data-rate></div><button type="button" class="wx-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <nav class="wx-tabs" role="tablist"></nav><section class="wx-body"></section></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest(".wx-x")) { close(); return; }
      const c = e.target.closest("[data-copytx]"); if (c) { copy(txUrl(c.dataset.copytx), T("Transaction link copied")); return; }
      const cw = e.target.closest("[data-copyw]"); if (cw) { copy(cw.dataset.copyw, T("Wallet address copied")); return; }
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; if (tab === "tr") loadQueue(); if (tab === "log") load().then(paint); paint(); (Snd.tab || (() => {}))(); }
      else if (b.classList.contains("wx-flip")) { dir = dir === "arcl2arc" ? "arc2arcl" : "arcl2arc"; b.classList.add("spin"); paint(); (Snd.tab || (() => {}))(); }
      else if (b.dataset.pct) { const i = el.querySelector(".wx-amt"); const [from] = DIRS[dir]; const h = have(from); if (i && h != null) { let L = data.limits.max[from]; if (dir === "arcl2arc" && dayLeft() != null && rate()) L = Math.min(L, Math.floor(dayLeft() * rate())); i.value = fmt(Math.min(L, Math.floor((h * Number(b.dataset.pct)) / 100))); live(); } }
      else if (b.classList.contains("wx-go")) ask();
      else if (b.dataset.trsign) { Promise.resolve(ctx.signIn && ctx.signIn()).then(load).then(() => { paint(); if (signedIn()) loadQueue(); }).catch(() => {}); }
      else if (b.dataset.sign) { Promise.resolve(ctx.signIn && ctx.signIn()).then(load).then(paint).catch(() => {}); }
      else if (b.dataset.cancel) cancel(b.dataset.cancel);
      else if (b.dataset.pay) pay(b.dataset.pay);
      else if (b.dataset.credit) credit(b.dataset.credit);
      else if (b.dataset.reject) reject(b.dataset.reject);
      else if (b.dataset.sendback) sendBack(b.dataset.sendback);
      else if (b.dataset.retmark) retMark(b.dataset.retmark);
      else if (b.dataset.saverate != null) saveRate();
      else if (b.dataset.toggle != null) toggleOpen();
    });
    el.addEventListener("input", (e) => { if (e.target.classList.contains("wx-amt")) { const v = e.target.value.replace(/[^0-9]/g, ""); e.target.value = v ? Number(v).toLocaleString("en-US") : ""; live(); } else if (e.target.classList.contains("wx-ratein")) paintRatePreview(); });
    addEventListener("keydown", (e) => { if (el && !el.hidden && e.key === "Escape") { e.stopPropagation(); close(); } }, true);
  }
  const amtNow = () => { const i = el && el.querySelector(".wx-amt"); return i ? Number(i.value.replace(/[^0-9]/g, "")) || 0 : 0; };
  const quoteOf = (a) => (dir === "arcl2arc" ? arcFor(a, rate()) : arclFor(a, rate()));
  // the button, the quote and the warning follow what's typed
  function live() {
    const [from, to] = DIRS[dir], a = amtNow(), h = have(from), L = data && data.limits, go = el.querySelector(".wx-go"), w = el.querySelector(".wx-warn"), q = el.querySelector(".wx-quote"); if (!go) return;
    const qt = a ? quoteOf(a) : 0; if (q) { q.textContent = a ? fmt(qt) : "0"; q.classList.toggle("on", !!qt); }
    let why = ""; if (!wallet()) why = ""; else if (!isOpen()) why = rate() ? T("The exchange is paused for a moment") : T("The treasury hasn't set the rate yet"); else if (!a) why = ""; else if (L && a < L.min[from]) why = T("The least is {n}", { n: fmt(L.min[from]) + " " + NAME[from] }); else if (L && a > L.max[from]) why = T("The most at once is {n}", { n: fmt(L.max[from]) + " " + NAME[from] }); else if (h != null && a > h) why = T("More than your balance"); else if (!qt) why = T("Too little for one {x} at this rate", { x: NAME[to] }); else if (dir === "arcl2arc" && dayLeft() != null && qt > dayLeft()) why = T("Over today's limit: {n} $ARCIRCLE left today (300,000 a day)", { n: fmt(dayLeft()) });
    w.textContent = why; w.hidden = !why; go.disabled = !wallet() ? false : !a || !!why || !!busy;
    go.innerHTML = !wallet() ? esc(T("Connect wallet")) : busy === "ask" ? `<i class="wx-spin"></i>${esc(T("Checking…"))}` : dir === "arc2arcl" ? esc(T("Send {x} to the treasury & request", { x: NAME.arc })) : esc(T("Request exchange"));
    if (!wallet()) go.dataset.sign = "1"; else delete go.dataset.sign;
  }
  function paintHead() {
    const r = el.querySelector("[data-rate]"); if (!r) return;
    r.innerHTML = rate() ? `${ic("rate", "wx-rateic")}<span class="wx-dot${isOpen() ? "" : " off"}"></span><b>1 ${NAME.arc} = ${fmtR(rate())} ${NAME.arcl}</b><small>${esc(isOpen() ? T("Rate set by the treasury") : T("Paused"))}</small>` : `${ic("rate", "wx-rateic")}<span class="wx-dot off"></span><b>${esc(T("Rate coming soon"))}</b><small>${esc(T("Set by the treasury"))}</small>`;
  }
  function paintTabs() {
    const pend = data && data.mine ? data.mine.filter((r) => r.status === "pending").length : 0, tq = queue ? queue.filter((r) => r.status === "pending" || r.status === "returning").length : 0;
    const tb = (id, label, n) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}">${esc(T(label))}${n ? `<i>${n}</i>` : ""}</button>`;
    el.querySelector(".wx-tabs").innerHTML = tb("ex", "Exchange") + tb("mine", "My requests", pend) + tb("log", "Public record") + (data && data.isTreasury ? tb("tr", "Treasury", tq) : "");
  }
  function paintEx() {
    const [from, to] = DIRS[dir], h = have(from), hTo = have(to), L = data && data.limits;
    const card = (k, give) => `<div class="wx-card ${give ? "give" : "get"} ${k}"><div class="wx-row"><small>${esc(T(give ? "You give" : "You get"))}</small><small class="wx-bal">${esc(T("Balance"))} <b>${fmt(give ? h : hTo)}</b></small></div>
      <div class="wx-row big"><span class="wx-tok">${ICON[k]}<b>${NAME[k]}</b></span>${give ? `<input class="wx-amt" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="${esc(T("Amount"))}">` : `<output class="wx-quote">0</output>`}</div>
      ${give ? `<div class="wx-pcts">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}"${h == null ? " disabled" : ""}>${p === 100 ? "MAX" : p + "%"}</button>`).join("")}${L ? `<small>${esc(T("Min {n}", { n: fmt(L.min[from]) }))}</small>` : ""}</div>` : `<div class="wx-pcts"><small>${esc(T("At the rate locked into your request"))}</small></div>${k === "arc" && data && data.daily ? `<div class="wx-daily"><span>${esc(T("Today's limit"))}</span><i><b style="width:${Math.min(100, (100 * data.daily.used) / data.daily.cap).toFixed(1)}%"></b></i><em>${fmt(data.daily.used)} / ${fmt(data.daily.cap)} $ARCIRCLE</em></div>` : ""}`}</div>`;
    const steps = dir === "arcl2arc" ? [[ic("lock"), T("Request: your $ARCL is held right away, and the rate is locked in.")], [ic("bank"), T("The treasury sends you $ARCIRCLE on Arc from its wallet.")], [ic("receipt"), T("It goes on the public record with its transaction.")]]
      : [[ic("swap"), T("Your wallet sends $ARCIRCLE to the treasury (one tap).")], [ic("lock"), T("The request goes in with that transaction; the rate is locked in.")], [ic("treasury"), T("The treasury credits your $ARCL.")]];
    const tot = (data && data.totals) || { n: 0, arcl: 0, arc: 0 };
    return `<div class="wx-swap">${card(from, true)}<button type="button" class="wx-flip" aria-label="${esc(T("Switch direction"))}">${ARROWS}</button>${card(to, false)}</div>
      <p class="wx-warn" hidden></p>
      <button type="button" class="wx-go">${esc(T("Request exchange"))}</button>
      <ol class="wx-steps">${steps.map(([i, s], k) => `<li><i>${i}</i><span><small>${k + 1}</small>${esc(s)}</span></li>`).join("")}</ol>
      <div class="wx-loop"><b>${esc(T("The $ARCIRCLE loop"))}</b>
        <div class="wx-loop-row"><div><i>${ic("play")}</i><span>${esc(T("Play and earn $ARCL"))}</span></div><u></u><div><i>${ic("swap")}</i><span>${esc(T("Exchange for $ARCIRCLE"))}</span></div><u></u><div><i>${ic("shop")}</i><span>${esc(T("Spend $ARCIRCLE in the game"))}</span></div></div>
        <div class="wx-split"><span class="burn">${ic("burn")}<b>50%</b> ${esc(T("burned forever"))}</span><span class="tre">${ic("treasury")}<b>50%</b> ${esc(T("to the treasury — it funds the exchange"))}</span></div>
        <div class="wx-nums"><span><small>${esc(T("Treasury reserve"))}</small><b>${data && data.reserve != null ? fmt(data.reserve) : "—"}</b><em>$ARCIRCLE</em></span><span><small>${esc(T("Exchanges settled"))}</small><b>${fmt(tot.n)}</b></span><span><small>${esc(T("Paid out"))}</small><b>${fmt(tot.arc)}</b><em>$ARCIRCLE</em></span></div></div>`;
  }
  function paintMine() {
    if (!signedIn()) return `<div class="wx-empty"><p>${esc(T("Connect your wallet to exchange"))}</p><button type="button" class="wx-go sm" data-sign="1">${esc(T("Connect wallet"))}</button></div>`;
    const L = (data && data.mine) || []; if (!L.length) return `<p class="wx-empty">${esc(T("No requests yet"))}</p>`;
    return `<ul class="wx-list">${L.map((r) => { const [f, t] = DIRS[r.dir] || ["arcl", "arc"], got = r.status === "done" ? r.give : r.quote;
      return `<li class="${esc(r.status)}"><div class="wx-pair">${ICON[f]}${ICON[t]}</div><div class="wx-li"><b>${fmt(r.amount)} ${NAME[f]}${got ? ` <s>→</s> ${fmt(got)} ${NAME[t]}` : ""}</b><small>${esc(when(r.at))}${r.rate ? ` · 1 ${NAME.arc} = ${fmtR(r.rate)} ${NAME.arcl}` : ""}${r.reason ? ` · ${esc(T(r.reason))}` : ""}</small>${txBtns(r.dir === "arcl2arc" ? r.gmTx : r.retTx || r.tx)}</div><div class="wx-side">${statusChip(r.status)}${r.status === "pending" && r.dir === "arcl2arc" ? `<button type="button" class="wx-cancel" data-cancel="${esc(r.id)}">${esc(T("Cancel"))}</button>` : ""}</div></li>`; }).join("")}</ul>`;
  }
  function paintLog() {
    const tot = (data && data.totals) || { n: 0, arcl: 0, arc: 0 }, L = (data && data.log) || [];
    const stat = (label, v, unit) => `<div><small>${esc(T(label))}</small><b>${fmt(v)}</b>${unit ? `<em>${unit}</em>` : ""}</div>`;
    return `<div class="wx-stats">${stat("Exchanges", tot.n)}${stat("$ARCL exchanged", tot.arcl, "$ARCL")}${stat("Paid out", tot.arc, "$ARCIRCLE")}</div>
      <p class="wx-note wx-noteic">${ic("record")}<span>${esc(T("Every exchange the treasury settles is listed here with its transaction on Arc — open it on the explorer or copy its link."))}</span></p>
      ${L.length ? `<ul class="wx-list log">${L.map((r) => { const [f, t] = DIRS[r.dir] || ["arcl", "arc"]; return `<li><div class="wx-pair">${ICON[f]}${ICON[t]}</div><div class="wx-li"><b>${fmt(r.amount)} ${NAME[f]} <s>→</s> ${fmt(r.give)} ${NAME[t]}</b><small><code>${esc(r.who)}</code> · ${esc(when(r.at))}${r.rate ? ` · @ ${fmtR(r.rate)}` : ""}</small>${txBtns(r.tx)}</div></li>`; }).join("")}</ul>` : `<p class="wx-empty">${esc(T("No exchanges settled yet"))}</p>`}`;
  }
  function paintTr() {
    const c = (queue && cfgT) || { rate: rate(), open: isOpen(), hist: [] };
    const head = `<div class="wx-tr"><img class="wx-vault" src="${UIX}vault.webp?v=1" alt="" draggable="false"><div class="wx-tr-rate"><small>${esc(T("Exchange rate"))}</small><div class="wx-row"><span>1 ${NAME.arc} =</span><input class="wx-ratein" inputmode="decimal" value="${c.rate ? esc(String(c.rate)) : ""}" placeholder="0" aria-label="${esc(T("Exchange rate"))}"><span>${NAME.arcl}</span><button type="button" class="wx-btn gold" data-saverate>${esc(T("Save rate"))}</button></div>
        <p class="wx-ratepv" data-ratepv></p><div class="wx-row"><button type="button" class="wx-switch${c.open ? " on" : ""}" data-toggle role="switch" aria-checked="${!!c.open}"><i></i>${esc(c.open ? T("Open for requests") : T("Paused"))}</button><small>${esc(T("Treasury reserve"))} <b>${data && data.reserve != null ? fmt(data.reserve) : "—"} $ARCIRCLE</b></small></div>
        ${c.hist && c.hist.length ? `<small class="wx-hist">${esc(T("Recent rates"))}: ${c.hist.slice(0, 5).map((h) => `${fmtR(h.rate)} <i>${esc(when(h.at))}</i>`).join(" · ")}</small>` : ""}</div></div>`;
    if (!signedIn()) return `<div class="wx-trsign"><img src="${UIX}ic-treasury.webp?v=1" alt="" width="72" height="72"><b>${esc(T("Treasury wallet connected"))}</b><p>${esc(T("Sign in with it to see the requests, send payouts and set the rate."))}</p><button type="button" class="wx-go" data-trsign>${esc(T("Sign in"))}</button></div>`;
    if (!queue) return head + `<p class="wx-empty">${esc(T("Loading…"))}</p>`;
    const open = queue.filter((r) => r.status === "pending" || r.status === "returning").sort((a, b) => a.at - b.at), rest = queue.filter((r) => !open.includes(r)).sort((a, b) => (b.doneAt || b.at) - (a.doneAt || a.at)).slice(0, 30);
    const row = (r) => { const [f, t] = DIRS[r.dir] || ["arcl", "arc"], q = r.quote || (r.dir === "arcl2arc" ? arcFor(r.amount, r.rate || rate()) : arclFor(r.amount, r.rate || rate())), wb = busy === r.id;
      const acts = r.status === "pending" ? (r.dir === "arcl2arc" ? `<button type="button" class="wx-btn gold" data-pay="${esc(r.id)}"${wb ? " disabled" : ""}>${wb ? `<i class="wx-spin"></i>` : ""}${esc(T("Send {n} {x}", { n: fmt(q), x: NAME.arc }))}</button>` : `<button type="button" class="wx-btn gold" data-credit="${esc(r.id)}"${wb ? " disabled" : ""}>${esc(T("Credit {n} {x}", { n: fmt(q), x: NAME.arcl }))}</button>`) + `<button type="button" class="wx-btn ghost" data-reject="${esc(r.id)}"${wb ? " disabled" : ""}>${esc(T("Turn down"))}</button>`
        : r.status === "returning" ? `<button type="button" class="wx-btn gold" data-sendback="${esc(r.id)}"${wb ? " disabled" : ""}>${wb ? `<i class="wx-spin"></i>` : ""}${esc(T("Send back {n} {x}", { n: fmt(r.amount), x: NAME.arc }))}</button><span class="wx-retin"><input class="wx-rettx" data-for="${esc(r.id)}" placeholder="${esc(T("or paste the return tx 0x…"))}" spellcheck="false"><button type="button" class="wx-btn ghost" data-retmark="${esc(r.id)}">${esc(T("Mark returned"))}</button></span>` : "";
      return `<li class="${esc(r.status)}"><div class="wx-pair">${ICON[f]}${ICON[t]}</div><div class="wx-li"><b>${fmt(r.amount)} ${NAME[f]} <s>→</s> ${fmt(r.status === "done" ? r.give : q)} ${NAME[t]}</b><small><code>${esc(short(r.w))}</code><button type="button" class="wx-mini" data-copyw="${esc(r.w)}" aria-label="${esc(T("Copy"))}">${COPY}</button> · ${esc(when(r.at))}${r.rate ? ` · @ ${fmtR(r.rate)}` : ""}${r.reason ? ` · ${esc(T(r.reason))}` : ""}</small>${txBtns(r.dir === "arcl2arc" ? r.gmTx : r.retTx || r.tx)}${acts ? `<div class="wx-acts">${acts}</div>` : ""}</div>${statusChip(r.status)}</li>`; };
    return head + `<h4 class="wx-h4">${esc(T("Queue"))} <i>${open.length}</i></h4>${open.length ? `<ul class="wx-list tr">${open.map(row).join("")}</ul>` : `<p class="wx-empty">${esc(T("Nothing waiting"))}</p>`}${rest.length ? `<h4 class="wx-h4">${esc(T("Recent"))}</h4><ul class="wx-list tr">${rest.map(row).join("")}</ul>` : ""}`;
  }
  function paintRatePreview() {
    const i = el.querySelector(".wx-ratein"), p = el.querySelector("[data-ratepv]"); if (!i || !p) return;
    const v = Number(String(i.value).replace(/[^0-9.]/g, "")); p.textContent = v > 0 ? T("1,000 $ARCL → {a} $ARCIRCLE · 1,000 $ARCIRCLE → {b} $ARCL", { a: fmtR(1000 / v), b: fmt(1000 * v) }) : "";
  }
  function paint() {
    if (!el) return; paintHead(); paintTabs();
    const body = el.querySelector(".wx-body"); body.innerHTML = tab === "mine" ? paintMine() : tab === "log" ? paintLog() : tab === "tr" ? paintTr() : paintEx();
    body.dataset.tab = tab; if (tab === "ex") live(); if (tab === "tr") paintRatePreview();
  }
  async function loadQueue() { if (!signedIn()) { paint(); return; } const r = await api("world-swap-admin", { op: "list" }); queue = r.ok ? r.j.list : []; cfgT = r.ok ? r.j.cfg : null; if (tab === "tr") paint(); }
  // a request (and for $ARCIRCLE → $ARCL the wallet's transfer to the treasury first)
  async function ask() {
    if (busy) return; if (!signedIn()) { if (ctx.signIn) { await ctx.signIn(); await load(); paint(); } return; }
    const a = amtNow(); if (!a) return;
    const extra = { dir, amount: a };
    if (dir === "arc2arcl") {
      if (!ctx.tx) { toast(T("Wallet connect isn't available here.")); return; }
      busy = "ask"; live(); let tx = "";
      try { tx = await ctx.tx(data.token, "0xa9059cbb" + pad(data.treasury) + pad((BigInt(a) * WEI).toString(16))); S.set("arc.swap.pend", { w: wallet(), dir, amount: a, tx }); }
      catch (e) { busy = ""; live(); toast(e && e.code === 4001 ? T("Cancelled") : String((e && e.message) || T("The wallet didn't send it")).slice(0, 120)); return; }
      extra.tx = tx;
    }
    busy = "ask"; live(); const r = await askLoop(extra); busy = "";
    if (!r || !r.ok) { toast(T("Couldn't send the request: {e}", { e: r ? errOf(r) : T("still not confirmed — it's checked again when you open the exchange") })); live(); return; }
    S.set("arc.swap.pend", null); (Snd.buy || Snd.equip || (() => {}))(); celebrate(T("Request sent — the rate is locked in. The treasury settles it soon."));
    await load(); tab = "mine"; paint(); if (ctx.refresh) ctx.refresh();
  }
  async function askLoop(extra) { for (let i = 0; i < 30; i++) { const r = await api("world-swap-ask", extra); if (r && r.status === 202) { await wait(4000); continue; } return r; } return null; }
  async function cancel(id) {
    if (busy) return; busy = id; const r = await api("world-swap-cancel", { id }); busy = "";
    if (!r.ok) { toast(T("Couldn't cancel: {e}", { e: errOf(r) })); return; }
    toast(T("Cancelled: your $ARCL is back")); await load(); paint(); if (ctx.refresh) ctx.refresh();
  }
  // ---- the treasury
  const reqOf = (id) => (queue || []).find((r) => r.id === id);
  async function adminLoop(extra) { for (let i = 0; i < 30; i++) { const r = await api("world-swap-admin", extra); if (r && r.status === 202) { await wait(4000); continue; } return r; } return null; }
  async function pay(id) {
    const r = reqOf(id); if (!r || busy) return; if (!ctx.tx) { toast(T("Wallet connect isn't available here.")); return; }
    const q = r.quote || arcFor(r.amount, r.rate || rate()); if (!(q > 0)) return;
    busy = id; paint(); let tx = "";
    try { tx = await ctx.tx(data.token, "0xa9059cbb" + pad(r.w) + pad((BigInt(q) * WEI).toString(16))); S.set("arc.swap.pay", { id, tx, op: "done" }); }
    catch (e) { busy = ""; paint(); toast(e && e.code === 4001 ? T("Cancelled") : String((e && e.message) || T("The wallet didn't send it")).slice(0, 120)); return; }
    const res = await adminLoop({ op: "done", id, gmTx: tx }); busy = "";
    if (!res || !res.ok) { toast(res ? errOf(res) : T("Still not confirmed — it's checked again when you open the exchange")); await loadQueue(); return; }
    S.set("arc.swap.pay", null); celebrate(T("Sent {n} $ARCIRCLE — it's on the public record", { n: fmt(res.j.request.give) })); await load(); await loadQueue();
  }
  async function credit(id) { if (busy) return; busy = id; paint(); const r = await api("world-swap-admin", { op: "done", id }); busy = ""; if (!r.ok) toast(errOf(r)); else celebrate(T("Credited")); await load(); await loadQueue(); }
  async function reject(id) { if (busy) return; busy = id; paint(); const r = await api("world-swap-admin", { op: "reject", id }); busy = ""; toast(r.ok ? T("Turned down") : errOf(r)); await loadQueue(); }
  async function sendBack(id) {
    const r = reqOf(id); if (!r || busy) return; if (!ctx.tx) { toast(T("Wallet connect isn't available here.")); return; }
    busy = id; paint(); let tx = "";
    try { tx = await ctx.tx(data.token, "0xa9059cbb" + pad(r.w) + pad((BigInt(r.amount) * WEI).toString(16))); S.set("arc.swap.pay", { id, tx, op: "return" }); }
    catch (e) { busy = ""; paint(); toast(e && e.code === 4001 ? T("Cancelled") : String((e && e.message) || T("The wallet didn't send it")).slice(0, 120)); return; }
    const res = await adminLoop({ op: "return", id, tx }); busy = ""; if (res && res.ok) { S.set("arc.swap.pay", null); toast(T("Returned")); } else toast(res ? errOf(res) : T("Still not confirmed — it's checked again when you open the exchange")); await loadQueue();
  }
  async function retMark(id) { const i = el.querySelector(`.wx-rettx[data-for="${CSS.escape(id)}"]`), tx = ((i && i.value) || "").trim(); if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) { toast(T("Paste the transaction hash")); return; } busy = id; const r = await adminLoop({ op: "return", id, tx }); busy = ""; toast(r && r.ok ? T("Returned") : r ? errOf(r) : T("Still not confirmed")); await loadQueue(); }
  async function saveRate() { const i = el.querySelector(".wx-ratein"), v = Number(String((i && i.value) || "").replace(/[^0-9.]/g, "")); if (!(v > 0)) { toast(T("Enter the rate")); return; } const r = await api("world-swap-admin", { op: "rate", rate: v }); if (!r.ok) { toast(errOf(r)); return; } cfgT = r.j.cfg; toast(T("Rate saved: 1 $ARCIRCLE = {r} $ARCL", { r: fmtR(cfgT.rate) })); await load(); await loadQueue(); }
  async function toggleOpen() { const c = cfgT || { open: isOpen() }; const r = await api("world-swap-admin", { op: "open", open: !c.open }); if (!r.ok) { toast(errOf(r)); return; } cfgT = r.j.cfg; await load(); paint(); }
  // a payment that was waiting for its block when the window closed: checked again
  async function resume() {
    const p = S.get("arc.swap.pend"); if (p && p.w === wallet() && p.tx && !busy) { const r = await askLoop({ dir: p.dir, amount: p.amount, tx: p.tx }); if (r && (r.ok || r.status === 409 || r.status === 400)) { S.set("arc.swap.pend", null); if (r.ok) { toast(T("Request sent — the rate is locked in. The treasury settles it soon.")); await load(); paint(); } } }
    const q = S.get("arc.swap.pay"); if (q && data && data.isTreasury && q.tx && !busy) { const r = await adminLoop({ op: q.op || "done", id: q.id, ...(q.op === "return" ? { tx: q.tx } : { gmTx: q.tx }) }); if (r && (r.ok || r.status === 409 || r.status === 400)) { S.set("arc.swap.pay", null); if (r.ok) { await load(); await loadQueue(); } } }
  }
  function celebrate(msg) {
    toast(msg); const fx = document.createElement("div"); fx.className = "wx-burst"; fx.innerHTML = `<img class="wx-spark" src="${UIX}fx-sparkle.webp?v=1" alt="">${ICON.arcl}${ICON.arc}`; el.querySelector(".wx-in").appendChild(fx); setTimeout(() => fx.remove(), 1400);
  }
  async function open() {
    if (!el) build(); el.hidden = false; requestAnimationFrame(() => el.classList.add("on")); tab = "ex"; paint();
    await load(); paint(); if (data && data.isTreasury) { tab = "tr"; paint(); loadQueue(); } resume().catch(() => {});
  }
  function close() { if (!el) return; el.classList.remove("on"); el.hidden = true; if (ctx.onClose) ctx.onClose(); }
  return { open, close, isOpen: () => !!(el && !el.hidden), _data: () => data, _queue: () => queue };
}
