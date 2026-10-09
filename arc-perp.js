/* global ethers, state, connectWallet, ensureArcForWrite */
// arc-perp.js — ARCIRCLE Perps (arcpad.html#perp; contracts/ArcPerp.sol, api/_perp.mjs).
// Until the contract is audited and deployed the tab says so, explains how it will work and points to Paper Trading.
// Live: BTC / ETH / SOL long or short with USDC collateral and low leverage; orders are two-step (you request, the
// keeper fills at a price from after your request, inside a band around Chainlink), so every fill has a worst price you
// set. Positions with live PnL and liquidation price, pending orders (cancel after 3 minutes), and the pool (LPs).
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-perp");
  const host = document.getElementById("pr-body");
  if (!panel || !host) return;
  const API = "/api/desk";
  const USDC = "0x3600000000000000000000000000000000000000";
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const L3 = (o) => { const l = window.arcI18n ? window.arcI18n.get() : "en"; return esc(o[l] || o.en); };
  const lc = (a) => String(a || "").toLowerCase();
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (n) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pxS = (n) => (n == null || !isFinite(n) ? "—" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 1 : 2 }));
  const left = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const S = { st: null, m: 0, side: "long", lev: 5, coll: "50", slip: 0.5, busy: false, msg: "", kind: "", timer: 0 };

  async function load() {
    try { const r = await fetch(`${API}?perp=state${me() ? `&u=${me()}` : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j) S.st = j; } catch { /* keep */ }
    paint();
  }
  const say = (m, k) => { S.msg = m; S.kind = k || ""; const el = $("pr-msg"); if (el) { el.textContent = m; el.className = "pp-msg " + S.kind; } };

  // ---------------------------------------------------------------- not live yet
  function soonHtml() {
    return `<div class="pr-soon"><div class="pr-soon-h"><span class="pr-badge">${T("Not live — waiting for an audit")}</span><h3>${T("A small perps market on Arc, done carefully")}</h3>
      <p>${T("ARCIRCLE Perps opens only after an external audit of its contract. Until then nothing is deployed and no money can go in. Here's how it will work:")}</p></div>
      <ul class="pr-points">
        <li><b>${T("Majors only, low leverage")}</b><span>${T("BTC, ETH and SOL with USDC collateral, 20–25x at most to start, small position and open-interest caps that grow with the pool.")}</span></li>
        <li><b>${T("Fair fills")}</b><span>${T("You request, a keeper fills at a price from after your request — inside a band around Chainlink's price on Arc — and never worse than the price you set. Unfilled in 3 minutes: cancel for a full refund.")}</span></li>
        <li><b>${T("The pool can always pay")}</b><span>${T("Each position's profit is capped at 9× its collateral, and the sum of those caps can never pass 80% of the pool. A payout that ever can't be made in full waits in a first-in-first-out queue that's paid first.")}</span></li>
        <li><b>${T("Gains shared with $ARCIRCLE")}</b><span>${T("The treasury seeds the pool. Half of its gains above its high-water mark goes to the $ARCIRCLE fee burn and to veARCIRCLE holders' weekly USDC.")}</span></li>
      </ul>
      <div class="pr-soon-a"><a class="bp-btn-primary" href="/arc#paper" data-arc-tab="paper">${T("Practice in Paper Trading")}</a><a class="bp-btn-ghost" href="/arc#staking">${T("Lock $ARCIRCLE")}</a></div>
      <p class="pp-foot">${T("Leveraged trading can lose everything you put in, and it's restricted in some countries.")}</p></div>`;
  }

  // ---------------------------------------------------------------- live
  const mk = () => (S.st.markets || [])[S.m] || S.st.markets[0];
  function ticketHtml() {
    const m = mk(), mx = m.maxLev, coll = Number(S.coll) || 0, lev = Math.min(S.lev, mx), size = coll * lev, p = m.price;
    const fee = (size * S.st.fees.openBps) / 10000, mm = (size * S.st.risk.maintBps) / 10000;
    const s = S.side === "long" ? 1 : -1, c = coll - fee;
    const liq = p && size ? p * (1 - (s * (c - mm - (size * S.st.fees.closeBps) / 10000)) / size) : null;
    const worst = p ? p * (1 + (s * S.slip) / 100) : null;
    return `<div class="pp-ticket ${S.side}">
      <div class="pp-sides"><button type="button" role="radio" aria-checked="${S.side === "long"}" data-pr-side="long">${L3({ en: "Long", ko: "롱", zh: "做多" })}</button><button type="button" role="radio" aria-checked="${S.side === "short"}" data-pr-side="short">${L3({ en: "Short", ko: "숏", zh: "做空" })}</button></div>
      <label class="pp-in"><span>${T("Collateral")}</span><input id="pr-coll" type="text" inputmode="decimal" autocomplete="off" value="${esc(S.coll)}"><em data-no-i18n>USDC</em></label>
      <div class="pp-lev"><div class="pp-lev-h"><span>${T("Leverage")}</span><b data-no-i18n>${lev}x</b></div><input id="pr-lev" type="range" min="1" max="${mx}" value="${lev}" aria-label="${T("Leverage")}">
        <div class="pp-chips">${[2, 5, 10, 20, 25].filter((v) => v <= mx).map((v) => `<button type="button" data-pr-lev="${v}" class="${v === lev ? "on" : ""}" data-no-i18n>${v}x</button>`).join("")}</div></div>
      <div class="pp-chips"><span class="pr-k">${T("Worst price")}</span>${[0.2, 0.5, 1].map((v) => `<button type="button" data-pr-slip="${v}" class="${v === S.slip ? "on" : ""}" data-no-i18n>${v}%</button>`).join("")}</div>
      <div class="pp-pre"><div><span>${T("Size")}</span><b data-no-i18n>${usd(size, 0)}</b></div><div><span>${T("Liquidation")}</span><b class="pp-liq" data-no-i18n>${pxS(liq)}</b></div><div><span>${T("Fill no worse than")}</span><b data-no-i18n>${pxS(worst)}</b></div></div>
      <button type="button" class="bp-btn-primary pp-go" data-pr-go${S.busy || S.st.paused || !m.enabled ? " disabled" : ""}>${S.st.paused ? T("Paused") : `${tr(S.side === "long" ? "Open long" : "Open short")} ${esc(m.name)} · ${lev}x`}</button>
      <p class="pp-msg ${esc(S.kind)}" id="pr-msg" role="status">${esc(S.msg)}</p>
      <small class="pr-small">${T("Fee")} ${S.st.fees.openBps / 100}% ${T("to open and close")} · ${S.st.fees.borrowBpsH / 100}% ${T("an hour")} · ${usd(S.st.fees.exec)} ${T("keeper fee per order")}</small></div>`;
  }
  function posHtml() {
    const M = S.st.me;
    if (!M) return `<div class="pp-pos"><button type="button" class="bp-btn-ghost" data-pr-connect>${T("Connect wallet")}</button></div>`;
    const ord = M.orders.length ? `<ul class="pp-list">${M.orders.map((o) => { const t = Date.now() / 1000; return `<li><span class="pp-tag ${o.isLong ? "long" : "short"}" data-no-i18n>${esc(o.name)} ${o.kind === "open" ? (o.isLong ? "↑" : "↓") : "×"}</span><span>${T(o.kind === "open" ? "Opening" : "Closing")} · ${T("waiting for the keeper")}</span>${t >= o.cancelAt ? `<button type="button" class="pp-x" data-pr-cancel="${o.id}">${T("Cancel")}</button>` : `<small data-pr-t="${o.cancelAt}" data-no-i18n>${left(o.cancelAt - t)}</small>`}</li>`; }).join("")}</ul>` : "";
    const pos = M.positions.length ? `<ul class="pp-list pp-open">${M.positions.map((p) => `<li>
      <span class="pp-tag ${p.isLong ? "long" : "short"}" data-no-i18n>${esc(p.name)} ${p.isLong ? "Long" : "Short"} ${Math.round(p.size / p.collateral)}x</span>
      <span class="pp-cell"><small>${T("Size")}</small><b data-no-i18n>${usd(p.size, 0)}</b></span><span class="pp-cell"><small>${T("Entry")}</small><b data-no-i18n>${pxS(p.entry)}</b></span>
      <span class="pp-cell"><small>${T("Liquidation")}</small><b class="pp-liq" data-no-i18n>${pxS(p.liq)}</b></span>
      <span class="pp-cell pp-r"><small>PnL</small><b class="${p.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${sgn(p.pnl)} <i>${p.roe == null ? "" : (p.roe >= 0 ? "+" : "") + p.roe.toFixed(1) + "%"}</i></b></span>
      <button type="button" class="pp-x" data-pr-close="${p.id}"${S.busy ? " disabled" : ""}>${T("Close")}</button></li>`).join("")}</ul>` : `<p class="pp-none">${T("No open positions.")}</p>`;
    return `<div class="pp-pos"><div class="pp-tabs"><button type="button" aria-selected="true">${T("Positions")} <i data-no-i18n>${M.positions.length}</i></button></div>${ord}${pos}</div>`;
  }
  function poolHtml() {
    const P = S.st.pool, M = S.st.me;
    return `<div class="pp-acct pr-pool"><div class="pp-acct-h"><span>${T("The pool")}</span><em data-no-i18n>${P.util.toFixed(1)}% ${T("used")}</em></div>
      <b class="pp-eq" data-no-i18n>${usd(P.amount, 0)}</b><span class="pp-pnl" data-no-i18n>${T("share")} ${usd(P.sharePrice, 4)}${P.queue ? ` · ${T("queue")} ${usd(P.owed)}` : ""}</span>
      <dl><div><dt>${T("Reserved")}</dt><dd data-no-i18n>${usd(P.reserved, 0)}</dd></div><div><dt>${T("Your share")}</dt><dd data-no-i18n>${M ? usd(M.lpValue) : "—"}</dd></div><div><dt>${T("Open to LPs")}</dt><dd>${T(S.st.lpOpen ? "Yes" : "Treasury only")}</dd></div></dl></div>`;
  }
  function paint() {
    if (!S.st) { host.innerHTML = `<div class="pp-wrap"><p class="pp-none">${T("Loading…")}</p></div>`; return; }
    if (!S.st.live) { host.innerHTML = `<div class="pp-wrap">${soonHtml()}</div>`; return; }
    const keep = document.activeElement && document.activeElement.id === "pr-coll";
    const ms = S.st.markets;
    host.innerHTML = `<div class="pp-wrap"><div class="pp-mkts" role="tablist">${ms.map((m, i) => `<button type="button" role="tab" aria-selected="${i === S.m}" data-pr-m="${i}"><b data-no-i18n>${esc(m.name)}</b><span class="pp-tick" data-no-i18n>${pxS(m.price)}</span></button>`).join("")}
      <span class="pp-src" data-no-i18n>Chainlink ${pxS(mk().chainlink)}</span></div>
      <div class="pp-grid"><div class="pp-main">${posHtml()}${poolHtml()}</div><div class="pp-side">${ticketHtml()}</div></div></div>`;
    if (keep) { const i = $("pr-coll"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  // ---------------------------------------------------------------- writes
  const ABI = ["function requestOpen(uint8 m, bool isLong, uint128 collateral, uint16 leverage, uint128 acceptable) returns (uint256)", "function requestClose(uint32 pid, uint128 acceptable) returns (uint256)", "function cancel(uint256 id)",
    ...["NotOwner", "NotKeeper", "IsPaused", "Bad", "TooSmall", "TooBig", "OverOi", "OverUtil", "NotYours", "TooEarly", "Done", "StalePrice", "PriceOff", "QueueFirst", "Cooldown"].map((e) => `error ${e}()`)];
  const ERR = { IsPaused: "New positions are paused.", TooSmall: "That's under the smallest collateral.", TooBig: "That's over the largest position for this market.", Bad: "Check the leverage.", NotYours: "That isn't your position.", TooEarly: "You can cancel 3 minutes after the request.", Done: "Already done." };
  function errText(e) {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    let name = (e && e.revert && e.revert.name) || "";
    const data = e && (e.data || (e.info && e.info.error && (e.info.error.data && (e.info.error.data.data || e.info.error.data))));
    if (!name && typeof data === "string" && data.length >= 10) { try { name = new ethers.Interface(ABI).parseError(data).name; } catch { /* other */ } }
    if (ERR[name]) return tr(ERR[name]);
    const s = String((e && (e.shortMessage || e.message)) || "");
    return /insufficient funds/i.test(s) ? tr("Not enough USDC for this and its gas.") : (s || tr("The transaction didn't go through.")).slice(0, 180);
  }
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  async function run(fn) {
    if (S.busy) return;
    S.busy = true; paint();
    try { await fn(await signer()); } catch (e) { say(errText(e), "bad"); }
    S.busy = false; await load();
  }
  const openPos = () => run(async (sg) => {
    const m = mk(), coll = Number(S.coll), lev = Math.min(S.lev, m.maxLev);
    if (!(coll >= S.st.risk.minCollateral)) throw new Error(tr("The smallest collateral is {n} USDC.").replace("{n}", S.st.risk.minCollateral));
    if (!m.price) throw new Error(tr("No live price right now — try again in a moment."));
    const raw = ethers.parseUnits(String(coll), 6), need = raw + ethers.parseUnits(String(S.st.fees.exec), 6);
    const u = new ethers.Contract(USDC, ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], sg);
    if ((await u.allowance(me(), S.st.address)) < need) { say(tr("Approve USDC — confirm in your wallet…")); await (await u.approve(S.st.address, need)).wait(); }
    const acc = BigInt(Math.round(m.price * (1 + ((S.side === "long" ? 1 : -1) * S.slip) / 100) * 1e8));
    say(tr("Confirm in your wallet…"));
    await (await new ethers.Contract(S.st.address, ABI, sg).requestOpen(S.m, S.side === "long", raw, lev, acc)).wait();
    say(tr("Requested — the keeper fills it within a minute."), "ok");
  });
  const closePos = (id) => run(async (sg) => {
    const p = S.st.me.positions.find((x) => x.id === id); if (!p) return;
    const acc = BigInt(Math.round(p.mark * (1 - ((p.isLong ? 1 : -1) * S.slip) / 100) * 1e8));
    say(tr("Confirm in your wallet…"));
    await (await new ethers.Contract(S.st.address, ABI, sg).requestClose(id, acc)).wait();
    say(tr("Close requested — the keeper fills it within a minute."), "ok");
  });
  const cancelOrder = (id) => run(async (sg) => { await (await new ethers.Contract(S.st.address, ABI, sg).cancel(id)).wait(); say(tr("Cancelled — refunded."), "ok"); });

  host.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.prM != null) { S.m = Number(b.dataset.prM); paint(); return; }
    if (b.dataset.prSide) { S.side = b.dataset.prSide; paint(); return; }
    if (b.dataset.prLev) { S.lev = Number(b.dataset.prLev); paint(); return; }
    if (b.dataset.prSlip) { S.slip = Number(b.dataset.prSlip); paint(); return; }
    if (b.hasAttribute("data-pr-go")) { openPos(); return; }
    if (b.dataset.prClose) { closePos(Number(b.dataset.prClose)); return; }
    if (b.dataset.prCancel) { cancelOrder(Number(b.dataset.prCancel)); return; }
    if (b.hasAttribute("data-pr-connect") && typeof connectWallet === "function") connectWallet().then(load);
  });
  host.addEventListener("input", (e) => {
    if (e.target.id === "pr-coll") { S.coll = e.target.value; clearTimeout(S.it); S.it = setTimeout(paint, 400); }
    if (e.target.id === "pr-lev") { S.lev = Number(e.target.value); clearTimeout(S.it); S.it = setTimeout(paint, 120); }
  });
  function show() {
    load();
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (document.hidden || !panel.classList.contains("active") || !(S.st && S.st.live)) return; const a = document.activeElement; if (a && host.contains(a) && a.tagName === "INPUT") return; load(); }, 3000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "perp") show(); else clearInterval(S.timer); });
  document.addEventListener("arc:lang", () => paint());
  if (panel.classList.contains("active")) show();
  window.arcPerp = { state: () => S.st, load, _S: S };
})();
