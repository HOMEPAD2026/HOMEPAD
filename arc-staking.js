/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-staking.js — ARCIRCLE Staking (arcpad.html#staking; api/_stake.mjs; contracts/ArcircleStaking.sol): veARCIRCLE.
//   · lock $ARCIRCLE for 1 week to 1 year → veARCIRCLE, largest when the lock is new and long, running down to zero at
//     the unlock date; or a max lock: always worth a full year, never runs down, never unlocks until it's turned off
//     (then it runs a normal year). Add to a lock or extend it any time; withdraw only after it ends
//   · weekly USDC: the treasury funds each week with half of its share of the ARCIRCLE Orders and Predict fees; a week
//     is paid to whoever held veARCIRCLE when it began, pro rata, and is claimable once it's over. "Claim and add to my
//     lock" swaps the USDC for $ARCIRCLE through ARCIRCLE Orders and adds it to the lock
//   · weekly pool votes: veARCIRCLE holders split their power across the pools ARCIRCLE PAD should back; the week's #1
//     pool gets the perks in CONFIG.STAKING_PERKS
// Until the contract is live (no address from the API) the page explains it and the buttons stay off.
// v2 (5 Oct 2026): the page loads even when old logs can't be read (and says so), an empty pot explains where it fills
// from, the rate is estimated before the first paid week, a lock reads as one sentence with your tier's next step, a
// "keep 100K for Orders' fee-free" helper, approve-once, ending-soon and lock-again, the claim-and-add preview and
// resume, more than 52 weeks to claim, earnings by week, a simulator, browser alerts, the vote with a leader card, a
// donut of your split, steppers, top 8 + more, any token's pool, ARCIA's pick and past winners, where the USDC flows,
// the biggest locks with your rank and filters, your veARCIA on Robinhood Chain, a phone action bar, ARCIA's chat
// lines ("lock 10k arcircle for 6 months"), and motion: the lock line morphs, numbers roll, tier-ups, the week turning.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-staking");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const body = $("stk-body");
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const API = "/api/desk";
  const WEEK = 7 * 86400, YEAR = 365 * 86400;
  const MARKS = [[1, "1w"], [4, "1m"], [13, "3m"], [26, "6m"], [52, "1y"]];
  const CF = (k, d) => (typeof CONFIG !== "undefined" && CONFIG[k]) || d;
  const ARCIRCLE = () => lc(CF("ARCIRCLE_TOKEN", "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7"));
  const USDC = () => lc(CF("USDC_ADDRESS", "0x3600000000000000000000000000000000000000"));
  const ORDERS = () => CF("ORDERS_ADDRESS", "");
  const SITE = () => (location && location.origin && /^https?:/.test(location.origin) ? location.origin : "https://arcircle.app");
  const PERKS = () => CF("STAKING_PERKS", ["An ARCIRCLE Predict market", "A feature post from ARCIA on X and Telegram", "First in line for a Builder Mine"]);
  const EXPL = (k, x) => `${CF("BLOCK_EXPLORER", "https://arc.etherscan.io")}/${k}/${x}`;
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e3 ? fmt(n / 1e3, 1) + "K" : fmt(n, 2));
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + fmt(n, n > 0 && n < 1 ? 4 : 2));
  const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
  const wkName = (w) => new Date(w * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const left = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ABI = [
    "function createLock(uint256 amount, uint256 unlockTime)", "function createMaxLock(uint256 amount)", "function increaseAmount(uint256 amount)", "function increaseUnlockTime(uint256 unlockTime)",
    "function lockMax()", "function unlockMax()", "function withdraw()", "function claim() returns (uint256)", "function fund(uint256 amount)", "function vote(bytes32[] pools, uint256[] weights)",
    "error ZeroAmount()", "error NoLock()", "error LockExists()", "error LockExpired()", "error LockNotOver()", "error BadUnlock()", "error NotLonger()", "error NoStakers()", "error TooEarly()", "error BadVote()",
    "error MaxLocked()", "error NotMaxLocked()",
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
  const ORDERS_ABI = [`function swapMarket(${KEY_T},address,address,uint256,uint256) returns (uint256)`, `function quote(${KEY_T},address,uint256)`, "error QuoteResult(uint256 out)", "error PriceNotMet(uint256 received, uint256 needed)"];
  const COLORS = ["#b58bff", "#4dd4ff", "#39ff88", "#ffd36b", "#ff8bd8", "#7aa2ff"], OTHER = "#5d6878";
  const S = { st: null, me: null, bal: {}, dur: 52, max: false, ext: 52, amt: "", add: "", fundAmt: "", q: "", tab: "all", w: {}, busy: false, msg: {}, skew: 0, loaded: false, steps: null, open: {},
    // v2
    err: null, burns: null, mk: null, vea: null, more: 0, lb: 10, lbF: "all", sim: { amt: "", w: 52, max: false, pot: "" }, extra: [], resume: null, cq: null, hd: false, prevTier: null };
  const FREE_HOLD = () => Number(CF("ORDERS_FREE_HOLD", 100000));
  const LS = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private */ } } };
  S.extra = LS.get("arcircle.stake.pools", []).filter((x) => x && /^0x[0-9a-f]{64}$/.test(x.poolId));
  const L3 = (en, ko, zh) => { const l = (window.arcI18n && window.arcI18n.get()) || "en"; return l === "ko" ? ko : l === "zh" ? zh : en; };

  // ---------------- data ----------------
  async function loadState() {
    // v2: a failed read keeps what the page had and says so (it no longer reads as "opens soon")
    try {
      const r = await fetch(`${API}?stake=state`, { cache: "no-store" }); const j = await r.json().catch(() => null);
      if (r.ok && j) { S.st = j; S.err = null; if (j.now) S.skew = j.now - Math.floor(Date.now() / 1000); } else S.err = (j && j.error) || `HTTP ${r.status}`;
    } catch (e) { S.err = String((e && e.message) || e); }
    S.loaded = true;
  }
  /// v2: the fee burn's pending USDC (an empty pot explains itself), Orders' markets (ARCIA's pick), my veARCIA
  async function loadExtra() {
    const u = me();
    const [b, mk, vea] = await Promise.all([
      fetch("/api/social?orders=burns", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/social?orders=markets", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      u ? fetch(`${API}?vearcia=card&u=${u}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
    ]);
    if (b && b.live) S.burns = b;
    if (mk && mk.markets) S.mk = mk.markets;
    S.vea = vea && vea.position ? vea : null;
  }
  async function loadMe() {
    const u = me();
    if (!u || !S.st || !S.st.live) { S.me = null; return; }
    try { const r = await fetch(`${API}?stake=me&u=${u}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.live) S.me = j; } catch { /* keep */ }
    try {
      const rp = typeof readProvider === "function" ? readProvider() : null;
      if (!rp) return;
      const a = new ethers.Contract(ARCIRCLE(), ERC20, rp), c = new ethers.Contract(USDC(), ERC20, rp);
      const [ab, aa, ub, ua] = await Promise.all([a.balanceOf(u), a.allowance(u, S.st.address), c.balanceOf(u), c.allowance(u, S.st.address)]);
      S.bal = { arc: ab, arcAllow: aa, usdc: ub, usdcAllow: ua };
    } catch { /* keep */ }
    // this week's vote, as the form's starting point
    if (S.me && S.me.vote && S.me.vote.length && !S.wTouched) S.w = splitOf(S.me.vote);
  }
  /// a vote (poolId → veARCIRCLE) as whole percentages that add up to 100
  function splitOf(v) {
    const tot = v.reduce((a, x) => a + (x.ve || 0), 0), w = {};
    if (!(tot > 0)) return w;
    let sum = 0;
    for (const x of v) { w[x.poolId] = Math.round((x.ve / tot) * 100); sum += w[x.poolId]; }
    const top = v.slice().sort((a, b) => b.ve - a.ve)[0];
    if (top && sum !== 100) w[top.poolId] += 100 - sum;
    return w;
  }
  async function refresh() {
    const prev = { week: S.st && S.st.week, pot: S.st && S.st.pot, ve: S.me && S.me.ve };
    await loadState(); await loadMe();
    if (!S.xAt || Date.now() - S.xAt > 60e3 || S.xFor !== me()) { S.xAt = Date.now(); S.xFor = me(); await loadExtra(); }
    if (S.prevTier == null && S.me && S.me.tier) S.prevTier = lc(S.me.tier.name);
    render({ flip: true }); after(prev); loadQuote(); actWatch();
  }
  /// v2: the phone's action bar shows while the staking page itself is on screen
  let actObs = null, bodyIn = false, guideIn = false;
  function actWatch() {
    const show = () => { S.barShow = bodyIn && !guideIn && panel.classList.contains("active"); const b0 = $("stk-actbar"); if (b0) b0.hidden = !S.barShow; };
    show();
    if (actObs || !("IntersectionObserver" in window)) return;
    // the bar shows while the staking cards fill the screen, and steps aside once the guide comes up past the middle
    actObs = new IntersectionObserver((es) => { for (const x of es) bodyIn = x.isIntersecting; show(); }, { rootMargin: "0px 0px -30% 0px" });
    actObs.observe(body);
    const g = document.querySelector(".stk-guide");
    if (g) new IntersectionObserver((es) => { for (const x of es) guideIn = x.isIntersecting; show(); }, { rootMargin: "0px 0px -45% 0px" }).observe(g);
  }
  /// v2: a lock from ARCIA's chat — #staking?a=10000&w=26 (or &max=1) fills the form (nothing is signed)
  function fromHash() {
    const h = String(location.hash || "");
    if (!/^#staking\?/.test(h)) return;
    const q = new URLSearchParams(h.split("?")[1] || "");
    const a = num(q.get("a")), w0 = Math.round(num(q.get("w"))), mx = q.get("max") === "1";
    if (!(a > 0)) return;
    S.amt = String(a); S.max = mx; if (w0 >= 1 && w0 <= 52) S.dur = w0;
    try { history.replaceState(null, "", location.pathname + location.search + "#staking"); } catch { /* fine */ }
    render();
    const c = body.querySelector(".stk-lock"); if (c) c.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
    toast(`<b>${T("ARCIA filled this in from your chat")}</b><span>${T("Check it, then lock — nothing is signed yet.")}</span>`);
  }
  window.addEventListener("hashchange", () => { if (S.booted) fromHash(); });

  // ---------------- maths ----------------
  const live = () => !!(S.st && S.st.live);
  // the contract rounds an unlock date down to a week: a "1 week" lock made late in a week would end in minutes, so
  // when rounding loses more than half a week (and there's room under the one-year cap) it goes to the next week
  const endFor = (weeks) => { const n = nowS(), e = Math.floor((n + weeks * WEEK) / WEEK) * WEEK; return e < n + weeks * WEEK - WEEK / 2 && e + WEEK <= n + YEAR ? e + WEEK : e; };
  const veFor = (amount, end, max) => (amount > 0 ? (max ? amount : end > nowS() ? (amount * (end - nowS())) / YEAR : 0) : 0);
  const lastW = () => (S.st && S.st.last) || null;
  /// a full week's USDC for `ve` more veARCIRCLE, at last week's pay and supply (an estimate)
  const estWeek = (ve) => { const L = lastW(); return L && L.ve >= 0 && L.usdc > 0 && ve > 0 ? (L.usdc * ve) / (L.ve + ve) : null; };
  const lockOf = () => (S.me && S.me.lock && S.me.lock.amount > 0 ? S.me.lock : null);
  const num = (v) => Number(String(v || "").replace(/,/g, "")) || 0;
  // an amount in wei; never String(number), which turns tiny or huge numbers into "9.5e-12" that ethers rejects
  const toWei = (v) => { const n = num(v); if (!(n > 0)) return 0n; try { return ethers.parseEther(n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 })); } catch { return 0n; } };
  const arcBal = () => (S.bal.arc != null ? Number(ethers.formatEther(S.bal.arc)) : null);

  // ---------------- pieces ----------------
  function badge(t) {
    if (!t) return "";
    return `<span class="stk-tier t-${lc(t.name)}" title="${T("Tier by veARCIRCLE")}">${T(t.name)}${t.max ? ` <i>${T("Max")}</i>` : ""}</span>`;
  }
  function avatar(p) {
    const n = (p.sym && p.sym !== "?" ? p.sym : p.token || "?").replace(/^0x/, "").slice(0, 2).toUpperCase();
    return p.logo ? `<img class="stk-logo" src="${esc(p.logo)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'stk-logo',textContent:'${esc(n)}'}))">` : `<span class="stk-logo" data-no-i18n>${esc(n)}</span>`;
  }
  const pname = (p) => (p.sym && p.sym !== "?" ? "$" + p.sym : short(p.token || p.poolId));
  /// veARCIRCLE over the next year for a lock: a line running down to the unlock date (flat for a max lock), and an
  /// optional dashed "what if" line
  function decaySvg(amount, end, max, alt) {
    const W_ = 320, H = 92, P = 6, t0 = nowS(), top = Math.max(amount, alt ? alt.amount : 0) || 1;
    const X = (t) => P + ((Math.min(t, t0 + YEAR) - t0) / YEAR) * (W_ - P * 2), Y = (v) => H - 18 - (v / top) * (H - 30);
    const path = (a, e, m) => (m ? `M${X(t0)},${Y(a)} L${X(t0 + YEAR)},${Y(a)}` : `M${X(t0)},${Y(veFor(a, e, false))} L${X(e)},${Y(0)} L${X(t0 + YEAR)},${Y(0)}`);
    const fill = (a, e, m) => `${path(a, e, m)} L${X(t0 + YEAR)},${Y(0)} L${X(t0)},${Y(0)} Z`;
    const ticks = [0, 13, 26, 39, 52].map((w) => `<line x1="${X(t0 + w * WEEK)}" x2="${X(t0 + w * WEEK)}" y1="${H - 18}" y2="${H - 14}"/>`).join("");
    return `<svg class="stk-decay" viewBox="0 0 ${W_} ${H}" role="img" aria-label="${T("veARCIRCLE over the next year")}" data-a="${amount}" data-e="${end}" data-m="${max ? 1 : 0}" data-top="${top}">
      <defs><linearGradient id="stkdg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b58bff" stop-opacity=".45"/><stop offset="1" stop-color="#b58bff" stop-opacity="0"/></linearGradient></defs>
      <line class="ax" x1="${P}" x2="${W_ - P}" y1="${H - 18}" y2="${H - 18}"/><g class="tk">${ticks}</g>
      ${amount > 0 ? `<path class="ar" d="${fill(amount, end, max)}"/><path class="ln" d="${path(amount, end, max)}"/>` : ""}
      ${alt ? `<path class="alt" d="${path(alt.amount, alt.end, alt.max)}"/>` : ""}
      ${amount > 0 && !max && end > t0 && end < t0 + YEAR ? `<circle class="dot" cx="${X(end)}" cy="${Y(0)}" r="3.5"/>` : ""}
      <text x="${P}" y="${H - 3}">${T("Now")}</text><text x="${X(t0 + 26 * WEEK)}" y="${H - 3}" text-anchor="middle">${T("6 months")}</text><text x="${W_ - P}" y="${H - 3}" text-anchor="end">${T("1 year")}</text>
    </svg>`;
  }
  function slider(id, val, min) {
    const marks = MARKS.map(([w, l]) => `<button type="button" data-stk-wk="${id}" data-w="${w}" class="${val === w ? "on" : ""}"${min && w < min ? " disabled" : ""}>${T(l)}</button>`).join("");
    return `<div class="stk-slide"><input id="${id}" type="range" min="${min || 1}" max="52" step="1" value="${Math.max(val, min || 1)}" aria-label="${T("Lock length in weeks")}"><b data-no-i18n>${val} ${val === 1 ? tr("week") : tr("weeks")}</b></div><div class="stk-marks">${marks}</div>`;
  }

  // ---------------- view ----------------
  function head() {
    const st = S.st || {}, t = st.totals || {}, L = lastW(), pot = st.pot || 0;
    const goal = Math.max(L ? L.usdc : 0, pot + ((st.treasury && st.treasury.owed) || 0), pot) || 0;
    const g = goal > 0 ? Math.min(1, pot / goal) : 0;
    const remain = live() ? Math.max(0, st.nextWeek - nowS()) : 0, C = 2 * Math.PI * 26;
    const chip = (k, v, x = "") => `<div class="stk-chip"${x}><small>${T(k)}</small><b data-no-i18n>${v}</b></div>`;
    return `<section class="stk-hd${S.hd ? " more" : ""}">
      <div class="stk-pot${S.potGrew ? " grew" : ""}"><small>${T("This week's pot")}</small><b data-stk-pot data-no-i18n>${live() ? usd(pot) : "—"}</b>
        <div class="stk-gauge" title="${T("Funded so far this week, against last week's pay and what's still due")}"><i style="width:${(g * 100).toFixed(1)}%"></i></div>
        <span>${L ? `${T("Last week paid")} <b data-no-i18n>${usd(L.usdc)}</b>` : T("Paid to everyone holding veARCIRCLE when the week began")}</span>${live() && !(pot > 0) ? potWhy() : ""}</div>
      <div class="stk-clock" title="${T("Weeks start Thursday 00:00 UTC")}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - remain / WEEK)).toFixed(2)}"/></svg>
        <div><small>${T("Next week in")}</small><b data-stk-left data-no-i18n>${live() ? left(remain) : "—"}</b></div></div>
      <div class="stk-chips">${[
        chip("$ARCIRCLE locked", live() ? big(t.locked) : "—"),
        chip("veARCIRCLE", live() ? big(t.ve) : "—"),
        chip("Stakers", live() ? fmt(t.stakers, 0) : "—"),
        chip("Yearly rate, max lock", st.apr != null ? fmt(st.apr, 1) + "%" : st.aprEst != null ? "~" + fmt(st.aprEst, 1) + "%" : "—", ` title="${T(st.apr == null && st.aprEst != null ? "An estimate from this week's pot so far — no week has been paid yet" : "Last week's USDC per veARCIRCLE × 52, against the $ARCIRCLE price — it changes every week")}"`),
        chip("USDC paid", live() ? usd(t.funded) : "—"),
      ].join("")}</div><button type="button" class="stk-hdmore" data-stk-act="hdmore" aria-expanded="${!!S.hd}">${T(S.hd ? "Less" : "More")}</button></section>`;
  }
  /// v2: an empty pot says where it fills from — Orders and Predict fees reach the fee burn, which burns half and sends
  /// half to the treasury; half of that is funded to stakers week by week
  function potWhy() {
    const b = S.burns && S.burns.pending, tr0 = S.st && S.st.treasury;
    return `<div class="stk-why"><b>${T("Why it's empty")}</b><span>${T("The pot fills from ARCIRCLE Orders and Predict fees, through the fee burn and the treasury — the more they trade, the more there is.")}</span>${b ? `<span class="stk-whyb"><i style="--p:${Math.max(2, Math.min(100, b.pct || 0)).toFixed(1)}%"></i></span><small data-no-i18n>${esc(L3(`Next fee burn: ${usd(b.quote)} of ${usd(b.min)} collected`, `다음 수수료 소각: ${usd(b.min)} 중 ${usd(b.quote)} 모임`, `下次手续费销毁:已收 ${usd(b.quote)} / ${usd(b.min)}`))}</small>` : ""}${tr0 && tr0.owed > 0.01 ? `<small data-no-i18n>${esc(L3(`${usd(tr0.owed)} due to stakers, waiting to be funded`, `스테이커 몫 ${usd(tr0.owed)} 펀딩 대기 중`, `应付质押者 ${usd(tr0.owed)},等待注入`))}</small>` : ""}<a href="/arc#orders">${T("Trade on ARCIRCLE Orders")} →</a></div>`;
  }
  /// v2: the tier you're at and how far the next one is
  function tierBar(m) {
    if (!m || !m.next) return m && m.tier ? "" : "";
    const p = Math.max(2, Math.min(100, ((m.ve || 0) / m.next.at) * 100));
    return `<div class="stk-next"><span class="stk-next-t">${m.tier ? badge(m.tier) : `<em>${T("No tier yet")}</em>`}</span><span class="stk-next-b"><i style="--p:${p.toFixed(1)}%"></i></span><small data-no-i18n>${esc(L3(`+${big(m.next.need)} veARCIRCLE to ${m.next.name}`, `${tr(m.next.name)}까지 +${big(m.next.need)} veARCIRCLE`, `距 ${tr(m.next.name)} 还差 ${big(m.next.need)} veARCIRCLE`))}</small></div>`;
  }
  /// v2: ARCIRCLE Orders is fee-free for wallets holding 100K $ARCIRCLE — locked $ARCIRCLE isn't in the wallet any more
  function feeKeep(amt, k) {
    const ab = arcBal(), keep = FREE_HOLD();
    if (ab == null || !(ab > keep)) return "";
    const after = ab - (amt || 0);
    return `<div class="stk-keep${after < keep && amt > 0 ? " warn" : ""}"><span>${after < keep && amt > 0 ? T("This takes your wallet under 100K $ARCIRCLE — ARCIRCLE Orders' fee-free trading counts what's in your wallet, not what's locked.") : T("ARCIRCLE Orders is fee-free while your wallet holds 100K $ARCIRCLE — locked $ARCIRCLE doesn't count.")}</span><button type="button" class="stk-btn sm" data-stk-keep="${k}">${esc(L3(`Lock all but ${big(keep)}`, `${big(keep)}만 남기고 락업`, `保留 ${big(keep)},其余锁仓`))}</button></div>`;
  }
  const apMax = () => LS.get("arcircle.stake.approvemax", false) === true;
  const apBox = () => `<label class="stk-apmax"><input type="checkbox" data-stk-apmax${apMax() ? " checked" : ""}> <span>${T("Approve once for later locks and adds (skips the approval next time)")}</span></label>`;
  const stepsOf = (k) => (S.steps && S.steps.k === k ? `<ol class="stk-steps" style="--sp:${((S.steps.at / S.steps.list.length) * 100).toFixed(0)}%">${S.steps.list.map((x, i) => `<li class="${i < S.steps.at ? "done" : i === S.steps.at ? "now" : ""}">${T(x)}</li>`).join("")}</ol>` : "");
  function lockCard() {
    const m = S.me, lock = lockOf(), t = nowS();
    const ab = arcBal();
    const balRow = ab != null ? `<div class="stk-avail"><span>${T("In your wallet")}</span><b data-no-i18n>${fmt(ab, 2)} $ARCIRCLE</b></div>` : "";
    const pct = (k) => `<div class="stk-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-stk-pct="${k}" data-p="${p}">${p}%</button>`).join("")}</div>`;
    const btn = (act, label, dis, cls = "go") => `<button type="button" class="stk-btn ${cls}" data-stk-act="${act}"${dis || !live() ? " disabled" : ""}>${T(label)}</button>`;
    const gain = (ve) => { const e = estWeek(ve); return e != null ? `<div class="stk-gain"><span>${T("At last week's pay, about")}</span><b data-no-i18n>${usd(e)}</b><span>${T("a week")}</span></div>` : ""; };
    const ending = lock && !lock.max && lock.end > t && lock.end - t < 30 * 86400;
    let h = `<section class="ams-card stk-card stk-lock${ending && lock.end - t < 7 * 86400 ? " ending" : ""}"><div class="stk-ch"><h3>${T(lock ? "Your lock" : "Lock $ARCIRCLE")}</h3>${m && m.tier ? badge(m.tier) : ""}${m && m.rank ? `<span class="stk-rank" data-no-i18n>#${m.rank}</span>` : ""}</div>`;
    if (me() && m) h += tierBar(m);
    if (!me()) h += `<div class="stk-empty arcia"><img class="stk-arcia" src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40" loading="lazy"><span>${T("Connect a wallet to lock $ARCIRCLE.")}</span></div><button type="button" class="stk-btn go" data-stk-act="connect">${T("Connect wallet")}</button>`;
    else if (!lock) {
      const amt = num(S.amt), end = endFor(S.dur), ve = veFor(amt, end, S.max);
      const need = toWei(amt);
      // v2: the lock in one sentence
      const sayIt = amt > 0 ? `<p class="stk-say" data-no-i18n>${S.max ? esc(L3("Max lock", "맥스 락업", "最长锁仓")) + " " : ""}<b>${esc(fmt(amt, 2))} $ARCIRCLE</b> ${esc(S.max ? L3("— never runs down", "— 줄어들지 않아요", "— 不会递减") : L3(`until ${day(end)}`, `${day(end)}까지`, `至 ${day(end)}`))} → <b class="stk-say-ve">${esc(fmt(ve, 2))} veARCIRCLE</b></p>` : "";
      h += `${balRow}<label class="stk-f"><small>${T("Amount")}</small><span class="stk-in"><input id="stk-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.amt)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("amt")}${feeKeep(amt, "amt")}
        <label class="stk-toggle"><input type="checkbox" data-stk-max${S.max ? " checked" : ""}><span class="sw" aria-hidden="true"></span><span><b>${T("Max lock")}</b> ${T("— always a full year, never runs down. Turn it off any time to start a one-year countdown.")}</span></label>
        ${S.max ? "" : `<label class="stk-f"><small>${T("Lock for")}</small></label>${slider("stk-weeks", S.dur)}`}
        ${decaySvg(amt, end, S.max)}
        ${sayIt}
        <div class="stk-sum"><div><span>${T("Unlocks")}</span><b data-no-i18n>${S.max ? tr("When you turn max off, plus a year") : day(end)}</b></div><div><span>${T("Your veARCIRCLE now")}</span><b data-no-i18n data-stk-vepre>${fmt(ve, 2)}</b></div><div><span>${T("Early exit")}</span><b>${T("None — locked until then")}</b></div></div>
        ${gain(ve)}${apBox()}
        ${btn("lock", S.bal.arcAllow != null && amt > 0 && S.bal.arcAllow < need ? "Approve and lock" : S.max ? "Max lock" : "Lock", !(amt > 0))}`;
    } else {
      const ended = !lock.max && lock.end <= t;
      h += `<div class="stk-mine"><div><small>${T("Locked")}</small><b data-no-i18n>${fmt(lock.amount, 2)} $ARCIRCLE</b>${S.st && S.st.price ? `<span data-no-i18n>≈ ${usd(lock.amount * S.st.price)}</span>` : ""}</div>
        <div><small>${T("Unlocks")}</small>${lock.max ? `<b class="stk-inf">${T("Max lock")}</b><span>${T("never runs down")}</span>` : `<b data-no-i18n>${day(lock.end)}</b><span>${ended ? T("ended — withdraw it") : `${T("in")} <span data-no-i18n data-stk-until="${lock.end}">${left(lock.end - t)}</span>`}</span>`}</div>
        <div><small>veARCIRCLE</small><b data-stk-ve data-no-i18n>${fmt(m.ve, 2)}</b><span>${T(lock.max ? "stays at the amount locked" : "runs down to 0 at unlock")}</span></div></div>`;
      // v2: ending within 30 days — one tap to a full year again
      if (ending) h += `<div class="stk-ending"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" class="bg"/><circle cx="12" cy="12" r="9" class="fg" style="stroke-dasharray:${((Math.max(0, lock.end - t) / (30 * 86400)) * 56.5).toFixed(1)} 56.5"/></svg><div><b data-no-i18n>${esc(L3(`Ends in ${left(lock.end - t)}`, `${left(lock.end - t)} 후 종료`, `${left(lock.end - t)} 后到期`))}</b><span>${T("Extend it to keep your veARCIRCLE and your share of the weekly USDC.")}</span></div>${btn("ext52", "Extend to a year", false, "go sm")}</div>`;
      const ext = !lock.max && S.open.ext ? { amount: lock.amount, end: Math.max(endFor(S.ext), lock.end), max: false } : null;
      const add = num(S.add);
      const altAdd = S.open.add && add > 0 ? { amount: lock.amount + add, end: lock.end, max: lock.max } : null;
      h += decaySvg(lock.amount, lock.end, lock.max, ext || altAdd);
      h += gain(m.ve);
      if (ended) h += `<div class="stk-relock">${btn("withdraw", "Withdraw $ARCIRCLE")}${btn("relock", "Withdraw and lock again for a year", false, "")}</div>${stepsOf("lock")}`;
      else {
        const need = toWei(add);
        h += `<details class="stk-more"${S.open.add ? " open" : ""} data-stk-det="add"><summary>${T("Add more")}</summary>${balRow}<label class="stk-f"><span class="stk-in"><input id="stk-add" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.add)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("add")}${feeKeep(add, "add")}
          <p class="stk-note">${T(lock.max ? "Stays a max lock." : "Same unlock date.")} ${T("Your veARCIRCLE grows by")} <b data-no-i18n>${fmt(veFor(add, lock.end, lock.max), 2)}</b>.</p>${apBox()}${btn("add", S.bal.arcAllow != null && add > 0 && S.bal.arcAllow < need ? "Approve and add" : "Add to lock", !(add > 0))}</details>`;
        if (!lock.max) {
          const minW = Math.min(52, Math.max(1, Math.ceil((lock.end - t) / WEEK) + 1));
          const newEnd = endFor(Math.max(S.ext, minW)), plus = Math.round((newEnd - lock.end) / WEEK);
          h += `<details class="stk-more"${S.open.ext ? " open" : ""} data-stk-det="ext"><summary>${T("Extend")}</summary>${slider("stk-ext", Math.max(S.ext, minW), minW)}
            <p class="stk-note">${T("New unlock date")}: <b data-no-i18n>${day(newEnd)}</b> · <b class="stk-plus" data-no-i18n>+${plus} ${plus === 1 ? tr("week") : tr("weeks")}</b> · veARCIRCLE <b data-no-i18n>${fmt(veFor(lock.amount, newEnd), 2)}</b></p><button type="button" class="stk-btn go" data-stk-act="extend"${newEnd <= lock.end || !live() ? " disabled" : ""}>${T("Extend")} <span data-no-i18n>+${plus}</span> ${T(plus === 1 ? "week" : "weeks")}</button></details>
            <details class="stk-more"${S.open.max ? " open" : ""} data-stk-det="max"><summary>${T("Make it a max lock")}</summary><p class="stk-note">${T("Your veARCIRCLE goes to the full amount and stays there. To get your $ARCIRCLE back later, turn max off: it then unlocks a year after that.")}</p>${btn("max", "Make it a max lock")}</details>`;
        } else {
          h += `<details class="stk-more"${S.open.max ? " open" : ""} data-stk-det="max"><summary>${T("Turn max lock off")}</summary><p class="stk-note">${T("Starts a one-year countdown: it unlocks on")} <b data-no-i18n>${day(endFor(52))}</b> ${T("and your veARCIRCLE starts running down. You can make it a max lock again any time before then.")}</p>${btn("unmax", "Turn max lock off", false, "")}</details>`;
        }
      }
      h += `<div class="stk-share"><button type="button" class="stk-btn sm" data-stk-act="share">${T("Share on X")}</button><button type="button" class="stk-btn sm" data-stk-act="tgshare">${T("Share on Telegram")}</button><button type="button" class="stk-btn sm" data-stk-act="copy">${T("Copy my staking card link")}</button></div>`;
    }
    // v2: my veARCIA on Robinhood Chain, beside it
    if (S.vea && S.vea.position) h += `<a class="stk-vea" href="/arc#vearcia" data-arc-tab="vearcia"><img src="/images/arcia-avatar-96.jpg" alt="" width="28" height="28" loading="lazy"><span>${T("Your veARCIA on Robinhood Chain")}</span><b data-no-i18n>${big(S.vea.position.ve != null ? S.vea.position.ve : S.vea.position.amount)}${S.vea.rank ? ` · #${S.vea.rank}` : ""}</b><i aria-hidden="true">→</i></a>`;
    return h + `<p class="stk-msg ${S.msg.lock ? S.msg.lock.cls : ""}" aria-live="polite">${S.msg.lock ? S.msg.lock.h : ""}</p></section>`;
  }
  function rewardsCard() {
    const m = S.me, wk = (S.st && S.st.weeks) || [], lock = lockOf();
    const canCompound = !!(m && m.claimable > 0 && lock && (lock.max || lock.end > nowS() + WEEK) && ORDERS() && S.st && S.st.arcPool && live());
    let h = `<section class="ams-card stk-card stk-rew"><h3>${T("USDC rewards")}</h3>`;
    h += `<div class="stk-claim"><div><small>${T("Ready to claim")}</small><b data-stk-claim data-no-i18n>${m ? usd(m.claimable) : "—"}</b></div><div class="stk-cbtns"><button type="button" class="stk-btn go" data-stk-act="claim"${m && m.claimable > 0 && live() ? "" : " disabled"}>${T("Claim")}</button>
      <button type="button" class="stk-btn" data-stk-act="compound"${canCompound ? "" : " disabled"} title="${T("Swaps the USDC for $ARCIRCLE through ARCIRCLE Orders and adds it to your lock")}">${T("Claim and add to my lock")}</button></div></div>`;
    // v2: what claim-and-add would add, before it starts; a run that stopped half-way can carry on from where it was
    if (canCompound && S.cq && S.cq.for === m.claimable && S.cq.out > 0) h += `<p class="stk-cq" data-no-i18n>${esc(L3(`Claim and add ≈ ${big(S.cq.out)} $ARCIRCLE to your lock (at most 3% less)`, `클레임 후 락업에 약 ${big(S.cq.out)} $ARCIRCLE 추가 (최대 3% 적게)`, `领取并加入锁仓约 ${big(S.cq.out)} $ARCIRCLE(最多少 3%)`))}</p>`;
    if (S.resume) h += `<div class="stk-resume"><span>${T(S.resume.bought ? "The swap went through — your $ARCIRCLE is in your wallet, not yet in the lock." : "The claim went through — your USDC is in your wallet, not yet swapped.")}</span><button type="button" class="stk-btn sm go" data-stk-act="resume">${T("Carry on")}</button><button type="button" class="stk-btn sm" data-stk-act="noresume">${T("Leave it")}</button></div>`;
    if (m && m.moreWeeks) h += `<p class="stk-note warn">${T("More than 52 weeks are waiting: a claim covers 52 at a time — claim again afterwards for the rest.")}</p>`;
    h += stepsOf("rew");
    h += `<p class="stk-note">${T("Each week is paid to whoever held veARCIRCLE when it began, in proportion to their veARCIRCLE — claimable once the week is over. Rewards never expire.")}</p>`;
    const hist = ((m && m.history) || []).filter((x) => x.ve > 0);
    if (hist.length) {
      const tot = hist.reduce((a, x) => a + x.earned, 0);
      h += `<div class="stk-hh"><b>${T("Your last weeks")}</b><span>${T("earned")} <b data-no-i18n data-stk-earned="${tot}">${usd(tot)}</b>${lock && S.st && S.st.price ? `<em data-no-i18n>${esc(L3(`${fmt((tot / (lock.amount * S.st.price)) * 100, 2)}% of your lock's value`, `락업 가치의 ${fmt((tot / (lock.amount * S.st.price)) * 100, 2)}%`, `占锁仓价值 ${fmt((tot / (lock.amount * S.st.price)) * 100, 2)}%`))}</em>` : ""}</span><button type="button" class="stk-btn sm" data-stk-act="csv">CSV</button></div>${earnSvg(hist)}
        <table class="stk-wk"><thead><tr><th>${T("Week of")}</th><th>${T("Week's USDC")}</th><th>${T("Your share")}</th><th>${T("You earned")}</th></tr></thead><tbody>${hist.map((x) => `<tr><td data-no-i18n>${esc(wkName(x.week))}</td><td data-no-i18n>${usd(x.paid)}</td><td data-no-i18n>${fmt(x.share, 2)}%</td><td data-no-i18n>${usd(x.earned)}</td></tr>`).join("")}</tbody></table>`;
    } else if (wk.length) h += `<table class="stk-wk"><thead><tr><th>${T("Week of")}</th><th>USDC</th><th>${T("veARCIRCLE at its start")}</th><th>${T("Per 1M")}</th></tr></thead><tbody>${wk.map((w) => `<tr${w.open ? ' class="open"' : ""}><td data-no-i18n>${esc(wkName(w.week))}${w.open ? ` <em>${T("now")}</em>` : ""}</td><td data-no-i18n>${usd(w.usdc)}</td><td data-no-i18n>${big(w.ve)}</td><td data-no-i18n>${w.ve > 0 && w.usdc > 0 ? usd((w.usdc / w.ve) * 1e6) : "—"}</td></tr>`).join("")}</tbody></table>`;
    // v2: alerts — this browser (no signature needed) or the ARCIA bot
    if (me()) h += `<div class="stk-alerts"><span>${T("A new week's USDC, your lock ending, the vote's last day:")}</span><button type="button" class="stk-btn sm${LS.get("arcircle.stake.push", "") === me() ? " on" : ""}" data-stk-act="push">${T(LS.get("arcircle.stake.push", "") === me() ? "This browser is on" : "Notify this browser")}</button><a class="stk-btn sm" href="https://t.me/ARCIAonArc_bot?start=stake" target="_blank" rel="noopener">${T("On Telegram")}</a></div>`;
    return h + `<p class="stk-msg ${S.msg.rew ? S.msg.rew.cls : ""}" aria-live="polite">${S.msg.rew ? S.msg.rew.h : ""}</p></section>`;
  }
  /// v2: what each of the last weeks paid this wallet, as bars (oldest first)
  function earnSvg(hist) {
    const list = hist.slice().reverse(), max = Math.max(1e-9, ...list.map((x) => x.earned)), W_ = 320, H = 70, bw = W_ / Math.max(8, list.length);
    return `<svg class="stk-earn" viewBox="0 0 ${W_} ${H}" role="img" aria-label="${T("You earned")}">${list.map((x, i) => { const hh = Math.max(2, (x.earned / max) * (H - 18)); return `<g><rect x="${(i * bw + 3).toFixed(1)}" y="${(H - 14 - hh).toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${hh.toFixed(1)}" rx="3" style="animation-delay:${i * 50}ms"><title>${esc(wkName(x.week))} · ${esc(usd(x.earned))}</title></rect><text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle">${esc(wkName(x.week))}</text></g>`; }).join("")}</svg>`;
  }
  /// v2: the pools you can vote for — the server's list plus any you've added by token
  const poolsAll = () => { const base = (S.st && S.st.pools) || [], seen = new Set(base.map((p) => p.poolId)); return base.concat(S.extra.filter((p) => !seen.has(p.poolId))); };
  /// v2: my split as a donut
  function donut(w) {
    const e = Object.entries(w).filter(([, v]) => Number(v) > 0), tot = e.reduce((a, [, v]) => a + Number(v), 0);
    const R = 22, C = 2 * Math.PI * R;
    let off = 0;
    const byId = new Map(poolsAll().map((p) => [p.poolId, p]));
    const segs = e.map(([id, v], i) => { const len = (Number(v) / 100) * C, sg = `<circle cx="28" cy="28" r="${R}" style="stroke:${COLORS[i % COLORS.length]};stroke-dasharray:${len.toFixed(2)} ${(C - len).toFixed(2)};stroke-dashoffset:${(-off).toFixed(2)}"><title>${esc(pname(byId.get(id) || { poolId: id }))} ${v}%</title></circle>`; off += len; return sg; }).join("");
    return `<svg class="stk-donut" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="${R}" class="bg"/>${segs}<text x="28" y="32" text-anchor="middle">${tot}%</text></svg>`;
  }
  /// v2: ARCIA's pick — the pools with the most ARCIRCLE Orders volume in the last day (else this week's votes),
  /// up to four, weighted by it, in 5% steps that add up to 100. A suggestion; you vote.
  function arciaPick() {
    const pools = poolsAll(), vol = new Map(((S.mk || [])).map((m) => [lc(m.poolId || ""), m.vol24 || 0]));
    const cur = S.st && S.st.votes && S.st.votes[0], cv = new Map(((cur && cur.pools) || []).map((p) => [p.poolId, p.ve]));
    let sc = pools.map((p) => ({ id: p.poolId, v: vol.get(p.poolId) || 0 })).filter((x) => x.v > 0);
    if (!sc.length) sc = pools.map((p) => ({ id: p.poolId, v: cv.get(p.poolId) || 0 })).filter((x) => x.v > 0);
    if (!sc.length) sc = pools.filter((p) => (p.src || []).includes("arcircle") || (p.src || []).includes("predict")).map((p) => ({ id: p.poolId, v: 1 }));
    sc = sc.sort((a, b) => b.v - a.v).slice(0, 4);
    const tot = sc.reduce((a, x) => a + x.v, 0);
    if (!tot) return null;
    const w = {}; let sum = 0;
    for (const x of sc) { w[x.id] = Math.max(5, Math.round(((x.v / tot) * 100) / 5) * 5); sum += w[x.id]; }
    w[sc[0].id] += 100 - sum;
    return w;
  }
  function voteCard() {
    const st = S.st, pools = poolsAll(), cur = st && st.votes ? st.votes[0] : null, prev = st && st.votes ? st.votes[1] : null;
    const res = new Map(((cur && cur.pools) || []).map((p) => [p.poolId, p.ve]));
    const tot = (cur && cur.total) || 0;
    const lead = cur && cur.pools && cur.pools[0] ? cur.pools[0].poolId : null;
    const q = lc(S.q), mine = new Set(Object.keys(S.w).filter((k) => S.w[k] > 0).concat(((S.me && S.me.vote) || []).map((v) => v.poolId)));
    const shownAll = pools.filter((p) => (S.tab === "all" || (S.tab === "mine" ? mine.has(p.poolId) : (p.src || []).includes(S.tab)))
        && (!q || lc(p.sym).includes(q) || lc(p.name).includes(q) || lc(p.token).includes(q) || p.poolId.includes(q)))
      .sort((a, b) => (res.get(b.poolId) || 0) - (res.get(a.poolId) || 0) || (S.w[b.poolId] || 0) - (S.w[a.poolId] || 0));
    // v2: the top 8 (and anything you've picked); the rest one tap away
    const cap = 8 + S.more, shown = shownAll.filter((p, i) => i < cap || (S.w[p.poolId] || 0) > 0);
    const hiddenN = shownAll.length - shown.length;
    const sum = Object.values(S.w).reduce((a, b) => a + (Number(b) || 0), 0), picked = Object.values(S.w).filter((v) => Number(v) > 0).length;
    const tag = (s) => s.map((x) => `<em class="stk-src ${x}">${T(x === "arcircle" ? "Core coin" : x === "predict" ? "Predict" : x === "arcpad" ? "ArcPad" : x === "orders" ? "Orders" : x === "custom" ? "Added" : x)}</em>`).join("");
    let h = `<section class="ams-card stk-card stk-vote"><div class="stk-vh"><h3>${T("This week's pool vote")}</h3><span>${T("Resets every Thursday 00:00 UTC")}</span></div>
      <p class="stk-note">${T("Split your veARCIRCLE across up to 8 pools ARCIRCLE PAD should back this week. Voting again replaces your vote. It costs nothing but gas.")}</p>`;
    // v2: the leader as a card, with what it gets
    const L0 = cur && cur.pools && cur.pools[0] ? cur.pools[0] : null;
    h += `<div class="stk-leadc${L0 ? "" : " none"}">${L0 ? `<div class="stk-leadp">${avatar(L0)}<div><small>${T("Leading this week")}</small><b data-no-i18n><i class="stk-crown" aria-hidden="true">♛</i>${esc(pname(L0))}</b><span data-no-i18n>${tot > 0 ? fmt((L0.ve / tot) * 100, 1) : 0}% · ${big(L0.ve)} veARCIRCLE</span></div></div>` : `<div class="stk-leadp"><div><small>${T("Leading this week")}</small><b>${T("No votes yet — yours can decide it")}</b></div></div>`}
      <div class="stk-perks"><b>${T("The week's #1 pool gets")}</b><ul>${PERKS().map((p) => `<li>${T(p)}</li>`).join("")}</ul></div></div>`;
    // the distribution so far: the top six and the rest
    if (cur && cur.pools && cur.pools.length && tot > 0) {
      const top = cur.pools.slice(0, 6), rest = cur.pools.slice(6).reduce((a, p) => a + p.ve, 0);
      const seg = top.map((p, i) => ({ c: COLORS[i], n: pname(p), v: p.ve })).concat(rest > 0 ? [{ c: OTHER, n: tr("Others"), v: rest }] : []);
      h += `<div class="stk-dist"><div class="stk-dbar" role="img" aria-label="${T("This week's vote so far")}">${seg.map((s0) => `<i style="flex:${s0.v};background:${s0.c}" title="${esc(s0.n)} ${fmt((s0.v / tot) * 100, 1)}%"></i>`).join("")}</div>
        <ul class="stk-dleg">${seg.map((s0) => `<li><i style="background:${s0.c}"></i><span data-no-i18n>${esc(s0.n)}</span><b data-no-i18n>${fmt((s0.v / tot) * 100, 1)}%</b></li>`).join("")}</ul></div>`;
    }
    if (prev && prev.pools.length) h += `<div class="stk-prev"><small>${T("Last week's result")}</small>${prev.pools.slice(0, 3).map((p, i) => `<span>${i === 0 ? '<i class="stk-crown" aria-hidden="true">♛</i>' : ""}<b data-no-i18n>#${i + 1} ${esc(pname(p))}</b> <i data-no-i18n>${prev.total > 0 ? fmt((p.ve / prev.total) * 100, 1) : 0}%</i></span>`).join("")}</div>`;
    // v2: the weeks before that
    const older = ((st && st.results) || []).filter((r) => r.top && r.top.length && (!prev || r.week !== prev.week)).slice(0, 4);
    if (older.length) h += `<div class="stk-past"><small>${T("Past winners")}</small>${older.map((r) => `<span><em data-no-i18n>${esc(wkName(r.week))}</em><b data-no-i18n>${esc(pname(r.top[0]))}</b><i data-no-i18n>${r.total > 0 ? fmt((r.top[0].ve / r.total) * 100, 0) : 0}%</i></span>`).join("")}</div>`;
    const tabs = [["all", "All"], ["mine", "My picks"], ["arcpad", "ArcPad"], ["predict", "Predict"], ["orders", "Orders"]];
    h += `<div class="stk-vtools"><div class="stk-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-stk-tab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}</div>
      <input id="stk-q" class="stk-search" type="search" placeholder="${T("Search a token")}" value="${esc(S.q)}" autocomplete="off"></div>
      <div class="stk-vtools2"><span class="stk-in sm"><input id="stk-addpool" type="text" spellcheck="false" autocomplete="off" placeholder="${T("Add a token's pool — paste 0x…")}" value="${esc(S.addPool || "")}"></span><button type="button" class="stk-btn sm" data-stk-act="addpool">${T("Add")}</button><button type="button" class="stk-btn sm stk-pick" data-stk-act="pick"${me() ? "" : " disabled"} title="${T("A suggestion from the pools' trading — not advice. You still vote.")}"><img src="/images/arcia-avatar-96.jpg" alt="" width="18" height="18">${T("ARCIA's pick")}</button></div>`;
    h += `<div class="stk-pools">${shown.map((p) => { const v = res.get(p.poolId) || 0, share = tot > 0 ? (v / tot) * 100 : 0, w = S.w[p.poolId] || 0, isLead = p.poolId === lead;
      return `<div class="stk-pool${isLead ? " lead" : ""}${w > 0 ? " picked" : ""}" data-pool="${p.poolId}">${avatar(p)}<div class="stk-pn"><b data-no-i18n>${esc(pname(p))}</b>${isLead ? `<i class="stk-crown" title="${T("Leading this week")}">♛</i>` : ""}${tag(p.src || [])}<a href="${EXPL("token", p.token)}" target="_blank" rel="noopener" data-no-i18n>${short(p.token)} ↗</a></div>
      <div class="stk-pr"><span class="stk-pbar"><i style="width:${share.toFixed(1)}%"></i></span><span data-no-i18n>${fmt(share, 1)}%</span></div>
      <div class="stk-pw"><button type="button" class="stk-stp" data-stk-step="${p.poolId}" data-d="-5" aria-label="−5%"${me() ? "" : " disabled"}>−</button><input type="range" min="0" max="100" step="5" data-stk-w="${p.poolId}" value="${w}" aria-label="${T("Your weight")} ${esc(pname(p))}"${me() ? "" : " disabled"}><button type="button" class="stk-stp" data-stk-step="${p.poolId}" data-d="5" aria-label="+5%"${me() ? "" : " disabled"}>+</button><b data-no-i18n data-stk-wv="${p.poolId}">${w}%</b></div></div>`; }).join("") || `<div class="stk-empty arcia"><img class="stk-arcia" src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40" loading="lazy"><span>${T(pools.length ? "No pool matches that." : "Pools show up here once staking is live.")}</span></div>`}</div>
      ${hiddenN > 0 ? `<button type="button" class="stk-btn sm stk-morep" data-stk-act="morepools">${esc(L3(`Show ${Math.min(8, hiddenN)} more of ${hiddenN}`, `${hiddenN}개 중 ${Math.min(8, hiddenN)}개 더 보기`, `再显示 ${Math.min(8, hiddenN)} 个(共 ${hiddenN} 个)`))}</button>` : ""}`;
    const ok = me() && S.me && S.me.ve > 0 && sum > 0 && sum <= 100 && picked <= 8;
    const canRepeat = S.me && S.me.lastVote && S.me.lastVote.length;
    h += `<div class="stk-vfoot">${picked ? donut(S.w) : ""}<span class="stk-vsum ${sum > 100 || picked > 8 ? "bad" : ""}">${T("Your split")}: <b data-no-i18n>${sum}%</b> · <b data-no-i18n>${picked}</b>/8 ${T("pools")}${S.me && S.me.ve > 0 ? ` · <b data-no-i18n>${fmt(S.me.ve, 0)}</b> veARCIRCLE` : ""}</span>
      <div class="stk-vbtns"><button type="button" class="stk-btn sm" data-stk-act="equal"${picked ? "" : " disabled"}>${T("Equal split")}</button><button type="button" class="stk-btn sm" data-stk-act="repeat"${canRepeat ? "" : " disabled"}>${T("Repeat last week")}</button><button type="button" class="stk-btn sm" data-stk-act="clear"${picked ? "" : " disabled"}>${T("Clear")}</button>
      <button type="button" class="stk-btn go" data-stk-act="vote"${ok && live() ? "" : " disabled"}>${T("Vote")}</button></div></div>`;
    if (me() && S.me && !(S.me.ve > 0)) h += `<p class="stk-note">${T("Lock $ARCIRCLE first: your veARCIRCLE is your vote.")}</p>`;
    return h + `<p class="stk-msg ${S.msg.vote ? S.msg.vote.cls : ""}" aria-live="polite">${S.msg.vote ? S.msg.vote.h : ""}</p></section>`;
  }
  function treasuryCard() {
    const tr_ = (S.st && S.st.treasury) || null, f = (S.st && S.st.funded) || [];
    let h = `<section class="ams-card stk-card stk-tre"><h3>${T("Where the USDC comes from")}</h3>
      <p class="stk-note">${T("ARCIRCLE Orders and Predict fees go to the ARCIRCLE fee burn: half buys $ARCIRCLE and burns it, half goes to the treasury. Half of the treasury's half is promised to stakers, funded week by week from the treasury wallet — every step is on-chain.")}</p>`;
    h += flowSvg(tr_);
    h += `<div class="stk-flow"><div><small>${T("Treasury's fee share since staking opened")}</small><b data-no-i18n>${tr_ ? usd(tr_.feesIn) : "—"}</b></div><div><small>${T("Half of it, for stakers")}</small><b data-no-i18n>${tr_ ? usd(tr_.due) : "—"}</b></div><div><small>${T("Funded so far")}</small><b data-no-i18n>${tr_ ? usd(tr_.funded) : "—"}</b></div><div class="${tr_ && tr_.owed > 0.01 ? "due" : ""}"><small>${T("Still to fund")}</small><b data-no-i18n>${tr_ ? usd(tr_.owed) : "—"}</b></div></div>`;
    if (f.length) h += `<ul class="stk-fl">${f.slice(0, 6).map((x) => `<li><span data-no-i18n>${esc(wkName(x.w))}</span><b data-no-i18n>${usd(x.a)}</b><a href="${EXPL("tx", x.tx)}" target="_blank" rel="noopener" data-no-i18n>${short(x.by)} ↗</a></li>`).join("")}</ul>`;
    const usdcBal = S.bal.usdc != null ? Number(ethers.formatUnits(S.bal.usdc, 6)) : null;
    h += `<details class="stk-more"${S.open.fund ? " open" : ""} data-stk-det="fund"><summary>${T("Fund this week")}</summary>
      <p class="stk-note">${T("Anyone can add USDC to this week's rewards — the treasury does it every week. It goes to whoever held veARCIRCLE when this week began.")}</p>
      ${usdcBal != null ? `<div class="stk-avail"><span>${T("In your wallet")}</span><b data-no-i18n>${fmt(usdcBal, 2)} USDC</b></div>` : ""}
      <label class="stk-f"><span class="stk-in"><input id="stk-fund" type="text" inputmode="decimal" autocomplete="off" placeholder="${tr_ && tr_.owed > 0 ? fmt(tr_.owed, 2) : "0"}" value="${esc(S.fundAmt)}"><em data-no-i18n>USDC</em></span></label>
      <button type="button" class="stk-btn go" data-stk-act="fund"${live() && me() ? "" : " disabled"}>${T("Fund")}</button></details>`;
    return h + `<p class="stk-msg ${S.msg.fund ? S.msg.fund.cls : ""}" aria-live="polite">${S.msg.fund ? S.msg.fund.h : ""}</p></section>`;
  }
  /// v2: where the USDC goes — fees → the fee burn (half burned) → the treasury → half of it to stakers → funded
  function flowSvg(t) {
    if (!t) return "";
    const fees = (t.feesIn || 0) * 2, burn = t.feesIn || 0, due = t.due || 0, fund = t.funded || 0, owed = t.owed || 0;
    const box = (x, y, w, k, v, cls = "") => `<g class="nd ${cls}" transform="translate(${x},${y})"><rect width="${w}" height="46" rx="10"/><text x="${w / 2}" y="18" text-anchor="middle" class="k">${esc(k)}</text><text x="${w / 2}" y="36" text-anchor="middle" class="v">${esc(v)}</text></g>`;
    const ln = (x1, y1, x2, y2, live0) => `<path class="ed${live0 ? " on" : ""}" d="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}"/>${live0 && !reduce() ? `<circle class="pt" r="3"><animateMotion dur="2.4s" repeatCount="indefinite" path="M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}"/></circle>` : ""}`;
    return `<svg class="stk-flowsvg" viewBox="0 0 520 150" role="img" aria-label="${T("Where the USDC comes from")}">
      ${ln(100, 40, 140, 40, fees > 0)}${ln(240, 40, 280, 22, burn > 0)}${ln(240, 40, 280, 98, burn > 0)}${ln(380, 98, 410, 98, fund > 0)}
      ${box(4, 17, 96, tr("Orders + Predict fees"), usd(fees))}${box(140, 17, 100, tr("Fee burn"), usd(fees))}
      ${box(280, 0, 116, tr("Half: buys and burns"), "$ARCIRCLE", "burn")}${box(280, 75, 100, tr("Half: treasury"), usd(burn))}
      ${box(410, 75, 106, tr("Stakers' half"), `${usd(fund)} / ${usd(due)}`, owed > 0.01 ? "due" : "ok")}
      ${owed > 0.01 ? `<text class="dueT" x="463" y="140" text-anchor="middle">${esc(L3(`${usd(owed)} waiting to be funded`, `${usd(owed)} 펀딩 대기`, `${usd(owed)} 待注入`))}</text>` : ""}
    </svg>`;
  }
  /// the biggest locks — v2: 200 of them a page at a time, filters by tier and max lock, my rank, badges
  function stakersCard() {
    const all = (S.st && S.st.stakers) || [];
    if (!all.length) return "";
    const f = S.lbF, list = all.map((x, i) => ({ ...x, rank: i + 1 })).filter((x) => f === "all" || (f === "max" ? x.max : x.tier && lc(x.tier.name) === f));
    const longest = all.filter((x) => !x.max && x.end).sort((a, b) => b.end - a.end)[0];
    const mine0 = me() ? all.findIndex((x) => lc(x.a) === me()) : -1;
    const fl = [["all", "All"], ["max", "Max lock"], ["diamond", "Diamond"], ["gold", "Gold"], ["silver", "Silver"], ["bronze", "Bronze"]];
    const row = (x) => `<li${lc(x.a) === me() ? ' class="you"' : ""}><span data-no-i18n>#${x.rank}</span><a href="${EXPL("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${short(x.a)}${lc(x.a) === me() ? ` (${esc(tr("you"))})` : ""}</a>${badge(x.tier)}${longest && x.a === longest.a ? `<i class="stk-bdg" title="${T("Longest running lock")}">⏳</i>` : ""}<b data-no-i18n>${big(x.ve != null ? x.ve : x.amount)}</b><em data-no-i18n>${x.max ? esc(tr("Max lock")) : day(x.end)}</em></li>`;
    return `<section class="ams-card stk-card stk-topl"><h3>${T("Biggest locks")}</h3>${mine0 >= 0 ? `<p class="stk-yourank" data-no-i18n>${esc(L3(`You're #${mine0 + 1} of ${all.length}`, `${all.length}명 중 ${mine0 + 1}위`, `第 ${mine0 + 1} 名,共 ${all.length} 名`))}</p>` : ""}
      <div class="stk-lbf" role="radiogroup">${fl.map(([k, l]) => `<button type="button" role="radio" data-stk-lbf="${k}" aria-checked="${f === k}">${T(l)}</button>`).join("")}</div>
      <ol>${list.slice(0, S.lb).map(row).join("")}</ol>${list.length > S.lb ? `<button type="button" class="stk-btn sm stk-morep" data-stk-act="morelb">${T("Show more")}</button>` : ""}${S.st && S.st.partial ? `<p class="stk-note">${T("Some older locks may be missing here: the node no longer keeps their history. Totals come from the contract.")}</p>` : ""}<p class="stk-note">${T("Ranked by veARCIRCLE. Badges: Bronze 1K, Silver 10K, Gold 100K, Diamond 1M veARCIRCLE.")}</p></section>`;
  }
  /// v2: a rough week and year at a pot you pick — an estimate, not a promise
  function simCard() {
    const st = S.st || {}, t = st.totals || {}, L = lastW();
    const amt = num(S.sim.amt) || arcBal() || 10000, wks = S.sim.w, mx = S.sim.max;
    const ve = mx ? amt : (amt * Math.min(YEAR, wks * WEEK)) / YEAR;
    const pot = num(S.sim.pot) || (L && L.usdc) || st.pot || 25;
    const share = ve / ((t.ve || 0) + ve), wk = pot * share, yr = wk * 52, val = st.price ? amt * st.price : null;
    return `<section class="ams-card stk-card stk-sim"><h3>${T("What could it earn?")}</h3>
      <div class="stk-simg"><label class="stk-f"><small>${T("Amount")}</small><span class="stk-in"><input id="stk-sima" type="text" inputmode="decimal" placeholder="${esc(fmt(amt, 0))}" value="${esc(S.sim.amt)}"><em data-no-i18n>$ARCIRCLE</em></span></label>
      <label class="stk-f"><small>${T("A week's pot")}</small><span class="stk-in"><input id="stk-simp" type="text" inputmode="decimal" placeholder="${esc(fmt(pot, 2))}" value="${esc(S.sim.pot)}"><em data-no-i18n>USDC</em></span></label></div>
      <div class="stk-simw"><input id="stk-simw" type="range" min="1" max="52" value="${wks}"${mx ? " disabled" : ""} aria-label="${T("Lock length in weeks")}"><label class="stk-apmax"><input type="checkbox" data-stk-simmax${mx ? " checked" : ""}> <span>${T("Max lock")}</span></label></div>
      <div class="stk-simr"><div><small>veARCIRCLE</small><b data-no-i18n>${big(ve)}</b><span data-no-i18n>${fmt(share * 100, 2)}%</span></div><div><small>${T("A week")}</small><b data-no-i18n>${usd(wk)}</b></div><div><small>${T("A year at that pot")}</small><b data-no-i18n>${usd(yr)}</b>${val ? `<span data-no-i18n>${fmt((yr / val) * 100, 1)}%</span>` : ""}</div></div>
      <p class="stk-note">${T("An estimate: it assumes the pot and everyone else's veARCIRCLE stay as they are, and a normal lock's veARCIRCLE runs down week by week. Not advice.")}</p></section>`;
  }
  /// v2: the phone's action bar — the one thing to do next (claim, lock, vote, withdraw), shown while the page is on screen
  function actBar() {
    if (!live() || !me() || !S.me) return "";
    const m = S.me, lock = lockOf(), t = nowS();
    const [k, label] = m.claimable > 0.0001 ? ["claim", L3(`Claim ${usd(m.claimable)}`, `${usd(m.claimable)} 클레임`, `领取 ${usd(m.claimable)}`)]
      : !lock ? ["golock", tr("Lock $ARCIRCLE")]
      : !lock.max && lock.end <= t ? ["withdraw", tr("Withdraw $ARCIRCLE")]
      : m.ve > 0 && !(m.vote && m.vote.length) ? ["govote", tr("Vote this week")] : [null, null];
    return k ? `<div class="stk-actbar" id="stk-actbar"><button type="button" class="stk-btn go" data-stk-act="${k}" data-no-i18n>${esc(label)}</button></div>` : "";
  }
  /// v2: redraw one card instead of the page (typing and sliders stay smooth); the lock's line morphs to its new shape
  /// and its veARCIRCLE rolls to the new number
  function part(sel, html) {
    const el = body.querySelector(sel);
    if (!el) { render(); return; }
    const ae = document.activeElement, focus = ae && ae.id && el.contains(ae) ? { id: ae.id, s: ae.selectionStart } : null;
    const oldD = [...el.querySelectorAll("svg.stk-decay path.ar, svg.stk-decay path.ln")].map((x) => x.getAttribute("d"));
    const vEl = el.querySelector("[data-stk-vepre]"), oldVe = vEl ? num(vEl.textContent) : null;
    const t = document.createElement("div"); t.innerHTML = html.trim();
    const n = t.firstElementChild; if (!n) return;
    el.replaceWith(n);
    if (focus) { const f = $(focus.id); if (f) { f.focus(); try { f.setSelectionRange(focus.s, focus.s); } catch { /* range */ } } }
    if (reduce()) return;
    [...n.querySelectorAll("svg.stk-decay path.ar, svg.stk-decay path.ln")].forEach((x, i) => { const a = oldD[i], b = x.getAttribute("d"); if (a && b && a !== b && a.split(/[ML]/).length === b.split(/[ML]/).length) { try { x.animate([{ d: `path("${a}")` }, { d: `path("${b}")` }], { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }); } catch { /* no d animation */ } } });
    const v2 = n.querySelector("[data-stk-vepre]");
    if (v2 && oldVe != null) { const to = num(v2.textContent); if (to !== oldVe) roll(v2, oldVe, to, 320); }
  }
  const lockPart = () => part(".stk-lock", lockCard());
  const votePart = () => part(".stk-vote", voteCard());
  // ---- FLIP: pool rows glide to their new places when the vote moves
  function flipBefore() { const m = new Map(); body.querySelectorAll(".stk-pool[data-pool]").forEach((el) => m.set(el.dataset.pool, el.getBoundingClientRect().top)); return m; }
  function flipAfter(m) {
    if (!m || !m.size || reduce()) return;
    body.querySelectorAll(".stk-pool[data-pool]").forEach((el) => {
      const was = m.get(el.dataset.pool); if (was == null) return;
      const dy = was - el.getBoundingClientRect().top; if (Math.abs(dy) < 2) return;
      el.style.transform = `translateY(${dy}px)`; el.style.transition = "none";
      requestAnimationFrame(() => { el.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)"; el.style.transform = ""; });
    });
  }
  function render(o = {}) {
    if (!body) return;
    const ae = document.activeElement;
    const focus = ae && ae.id && body.contains(ae) ? { id: ae.id, s: ae.selectionStart } : null;
    const wFocus = ae && ae.dataset && ae.dataset.stkW;
    const pos = o.flip ? flipBefore() : null;
    // v2: a failed read is a failed read (with a retry), not "opens soon"; partial history is said once
    const pre = !S.loaded ? `<div class="stk-empty">…</div>` : !S.st && S.err ? `<div class="stk-soon err"><b>${T("Couldn't read ARCIRCLE Staking right now")}</b><span>${T("Arc's node didn't answer in time. Your lock and rewards are safe on-chain — try again in a moment.")}</span><button type="button" class="stk-btn sm" data-stk-act="retry">${T("Try again")}</button></div>` : !live() ? `<div class="stk-soon"><b>${T("Opens soon")}</b><span>${T("The veARCIRCLE contract is being deployed. Everything below shows how it will work — the buttons switch on when it's live.")}</span></div>` : "";
    body.innerHTML = `${pre}${head()}<div class="stk-grid">${lockCard()}${rewardsCard()}</div>${voteCard()}<div class="stk-grid">${treasuryCard()}${simCard()}</div>${stakersCard()}${actBar()}`;
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.s); } catch { /* range */ } } }
    if (wFocus) { const el = body.querySelector(`[data-stk-w="${wFocus}"]`); if (el) el.focus(); }
    flipAfter(pos);
    // v2: one-shot entrances (earn bars growing, the phone bar sliding in) play on the first draw only, not every refresh
    if (S.loaded && !S.drawn) { S.drawn = true; body.classList.add("stk-first"); setTimeout(() => body.classList.remove("stk-first"), 1500); }
    // the phone's bar lives on <body> (a fixed bar inside the panel would be placed against the panel, not the screen)
    document.querySelectorAll("body > .stk-actbar").forEach((x) => x.remove());
    const ab = body.querySelector(".stk-actbar");
    body.classList.toggle("has-bar", !!ab);
    if (ab) {
      if (body.classList.contains("stk-first")) ab.classList.add("enter");
      ab.hidden = !(S.barShow);
      ab.addEventListener("click", (e) => { const b0 = e.target.closest("[data-stk-act]"); if (b0 && !b0.disabled) act(b0.dataset.stkAct, b0); });
      document.body.appendChild(ab);
    }
    // a new leader this week
    const cur = S.st && S.st.votes && S.st.votes[0], lead = cur && cur.pools && cur.pools[0] ? cur.pools[0].poolId : null;
    if (lead && S.lead && S.lead.week === cur.week && S.lead.id !== lead && o.flip) {
      const row = body.querySelector(`.stk-pool[data-pool="${lead}"]`);
      if (row) { row.classList.add("newlead"); const f = document.createElement("span"); f.className = "stk-flip"; f.textContent = tr("Takes the lead!"); row.appendChild(f); setTimeout(() => { row.classList.remove("newlead"); f.remove(); }, 2600); }
    }
    if (lead) S.lead = { week: cur.week, id: lead };
  }

  // ---------------- motion ----------------
  function roll(el, from, to, ms = 600, f = (v) => fmt(v, 2)) {
    if (!el || reduce() || from === to) { if (el) el.textContent = f(to); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); if (el.isConnected) el.textContent = f(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function countUp(el, from, to, ms = 900) {
    if (!el || reduce() || !(to > from)) { if (el) el.textContent = fmt(to, 2); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e, 2); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function lockFx(fromVe, open) {
    const card = body.querySelector(".stk-lock");
    if (card && !reduce()) {
      const fx = document.createElement("div"); fx.className = "stk-lockfx" + (open ? " open" : ""); fx.setAttribute("aria-hidden", "true");
      fx.innerHTML = `<svg class="stk-padlock" viewBox="0 0 48 56"><path class="sh" d="M14 24 V16 a10 10 0 0 1 20 0 V24"/><rect x="8" y="24" width="32" height="26" rx="6"/><circle cx="24" cy="36" r="3.4"/><path d="M24 39 v5"/></svg>`;
      card.appendChild(fx); setTimeout(() => fx.remove(), 1600);
    }
    countUp(body.querySelector("[data-stk-ve]"), fromVe || 0, (S.me && S.me.ve) || 0);
    tierFx();
  }
  /// v2: a tier up — the badge flares and says so
  const TIERS = ["member", "bronze", "silver", "gold", "diamond"];
  function tierFx() {
    const t = S.me && S.me.tier ? lc(S.me.tier.name) : null, was = S.prevTier;
    S.prevTier = t;
    if (!t || !was || TIERS.indexOf(t) <= TIERS.indexOf(was)) return;
    const b = body.querySelector(".stk-lock .stk-ch .stk-tier");
    if (b && !reduce()) { b.classList.add("up"); setTimeout(() => b.classList.remove("up"), 1800); }
    toast(`<b>${esc(L3(`${S.me.tier.name} tier`, `${tr(S.me.tier.name)} 티어 달성`, `达到 ${tr(S.me.tier.name)} 等级`))}</b><span>${T("Your veARCIRCLE moved you up a tier.")}</span>`);
  }
  function coinFx(from) {
    if (!from || reduce()) return;
    const a = from.getBoundingClientRect();
    const target = document.querySelector("#wallet-slot button, #wallet-slot") || body.querySelector(".stk-hh, .stk-claim b");
    const b = target ? target.getBoundingClientRect() : { left: a.left, top: a.top - 200, width: 0, height: 0 };
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("i"); c.className = "stk-coin"; c.textContent = "$";
      c.style.left = `${a.left + a.width / 2 + (Math.random() - 0.5) * 40}px`; c.style.top = `${a.top + a.height / 2}px`;
      c.style.setProperty("--dx", `${b.left + b.width / 2 - a.left - a.width / 2}px`); c.style.setProperty("--dy", `${b.top + b.height / 2 - a.top - a.height / 2}px`);
      c.style.animationDelay = `${i * 60}ms`;
      document.body.appendChild(c); setTimeout(() => c.remove(), 1400 + i * 60);
    }
  }
  function toast(h) {
    const t = document.createElement("div"); t.className = "stk-toast"; t.setAttribute("role", "status"); t.innerHTML = h;
    document.body.appendChild(t); requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 400); }, 6000);
  }
  /// after a refresh: a new week, a bigger pot
  function after(prev) {
    const st = S.st;
    if (!st || !st.live) return;
    let seen = 0;
    try { seen = Number(localStorage.getItem("arcircle.stake.week")) || 0; } catch { /* private mode */ }
    if (seen && st.week > seen) toast(`<b>${T("A new week has started")}</b><span>${S.me && S.me.claimable > 0 ? `${T("Ready to claim")}: <b data-no-i18n>${usd(S.me.claimable)}</b>` : T("Last week's USDC is now claimable, and the pool vote has reset.")}</span>`);
    try { localStorage.setItem("arcircle.stake.week", String(st.week)); } catch { /* private mode */ }
    if (prev.week === st.week && prev.pot != null && st.pot > prev.pot + 1e-6) {
      const el = body.querySelector("[data-stk-pot]"), box = body.querySelector(".stk-pot");
      if (box) { box.classList.add("grew"); setTimeout(() => box.classList.remove("grew"), 1800); }
      if (el && !reduce()) { const t0 = performance.now(), a = prev.pot, b = st.pot; const step = (t) => { const k = Math.min(1, (t - t0) / 1000); el.textContent = usd(a + (b - a) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    }
  }
  function tickClocks() {
    if (!live()) return;
    const t = nowS(), remain = Math.max(0, S.st.nextWeek - t);
    const l = body.querySelector("[data-stk-left]"); if (l) l.textContent = left(remain);
    const fg = body.querySelector(".stk-clock .fg"); if (fg) { const C = 2 * Math.PI * 26; fg.setAttribute("stroke-dashoffset", (C * (1 - remain / WEEK)).toFixed(2)); }
    body.querySelectorAll("[data-stk-until]").forEach((el) => { el.textContent = left(Number(el.dataset.stkUntil) - t); });
    if (remain === 0 && !S.rolling) {
      S.rolling = true;
      // v2: the week turns — the ring flashes full and bursts
      const ck = body.querySelector(".stk-clock"); if (ck && !reduce()) { ck.classList.add("turn"); setTimeout(() => ck.classList.remove("turn"), 2400); }
      setTimeout(() => { S.rolling = false; refresh(); }, 4000);
    }
  }

  // ---------------- writes ----------------
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const name = e && e.revert && e.revert.name;
    const s = String(name || (e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NoStakers: "Nobody held veARCIRCLE when this week began, so this week can't be funded yet — try next week.", LockExists: "You already have a lock — add to it or extend it instead.",
      LockExpired: "Your lock has ended — withdraw it first, then lock again.", LockNotOver: "Your lock hasn't ended yet.", BadUnlock: "Pick an unlock date between a week and a year from now.",
      NotLonger: "The new unlock date has to be later than the current one.", NoLock: "You need a running lock (veARCIRCLE) for that.", BadVote: "Check your split: up to 8 pools, 100% at most.", ZeroAmount: "Enter an amount.",
      MaxLocked: "That's a max lock — turn max off first.", NotMaxLocked: "That lock isn't a max lock.", PriceNotMet: "The price moved past the 3% limit — nothing was swapped. Your USDC is in your wallet." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const CARD = { lock: ".stk-lock", rew: ".stk-rew", vote: ".stk-vote", fund: ".stk-tre" };
  const say = (k, h, cls = "") => { S.msg[k] = { h, cls }; const p = body.querySelector(`${CARD[k]} .stk-msg`); if (p) { p.className = "stk-msg " + cls; p.innerHTML = h; } };
  const txLink = (h) => `<a href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>`;
  async function run(k, fn, fx) {
    if (S.busy) { say(k, T("One moment — your last transaction is still confirming."), "err"); return; }
    S.busy = true;
    const was = { ve: (S.me && S.me.ve) || 0 };
    try {
      const sg = await signer();
      const c = new ethers.Contract(S.st.address, ABI, sg);
      const h = await fn(c, sg);
      if (h) say(k, `${T("Done")} · ${txLink(h)}`, "ok");
      if (fx === "coin") coinFx(body.querySelector(".stk-claim .stk-btn.go"));
      await loadState(); await loadMe(); render();
      if (fx === "lock") lockFx(was.ve);
      if (fx === "open") lockFx(was.ve, true);
      if (fx === "coin") { const e0 = body.querySelector("[data-stk-earned]"); if (e0) roll(e0, 0, Number(e0.dataset.stkEarned) || 0, 900, usd); }
    } catch (e) { say(k, esc(errText(e)), "err"); }
    finally { S.busy = false; if (S.steps && S.steps.at < S.steps.list.length) { S.steps = null; render(); } else if (S.resume) render(); }
  }
  async function approve(sg, token, spender, need, label, k, { max = false } = {}) {
    const t = new ethers.Contract(token, ERC20, sg);
    const have = await t.allowance(await sg.getAddress(), spender);
    if (have >= need) return;
    say(k, T(label));
    // v2: "approve once" — a large allowance to the staking contract, so later locks and adds skip this step
    await (await t.approve(spender, max ? ethers.MaxUint256 : need)).wait();
  }
  const step = (i) => { if (S.steps) { S.steps.at = i; const ol = body.querySelector(".stk-steps"); if (ol) { ol.style.setProperty("--sp", ((i / S.steps.list.length) * 100).toFixed(0) + "%"); ol.querySelectorAll("li").forEach((li, j) => { li.className = j < i ? "done" : j === i ? "now" : ""; }); } } };
  /// claim, swap the USDC for $ARCIRCLE through ARCIRCLE Orders ($ARCIRCLE's own pool), add it to the lock — v2: in
  /// stages that can be picked up again (S.resume) when one of them doesn't go through
  async function compound(c, sg, from = null) {
    const u = await sg.getAddress(), key = S.st.arcPool, orders = ORDERS();
    const usdc = new ethers.Contract(USDC(), ERC20, sg), arc = new ethers.Contract(ARCIRCLE(), ERC20, sg);
    S.steps = { k: "rew", list: ["Claim the USDC", "Approve the USDC for ARCIRCLE Orders", "Swap it for $ARCIRCLE", "Approve the $ARCIRCLE", "Add it to your lock"], at: 0 }; render();
    let got = from && from.got ? BigInt(from.got) : 0n, bought = from && from.bought ? BigInt(from.bought) : 0n;
    try {
      if (!got && !bought) {
        const b0 = await usdc.balanceOf(u);
        say("rew", T("Confirm the claim in your wallet…"));
        await (await c.claim()).wait();
        got = (await usdc.balanceOf(u)) - b0;
        if (!(got > 0n)) throw new Error(tr("Nothing came in to swap."));
      }
      if (!bought) {
        const have = await usdc.balanceOf(u); if (have < got) got = have;
        step(1); await approve(sg, USDC(), orders, got, "Approve the USDC for ARCIRCLE Orders…", "rew");
        step(2);
        const out = await quoteArc(got, sg.provider);
        if (out == null) throw new Error(tr("Couldn't read a price from the pool right now. Your USDC is in your wallet."));
        const minNet = (out * 999n * 97n) / 100000n; // after the 0.1% fee, at most 3% worse
        const a0 = await arc.balanceOf(u);
        say("rew", T("Confirm the swap in your wallet…"));
        await (await new ethers.Contract(orders, ORDERS_ABI, sg).swapMarket(key, USDC(), ARCIRCLE(), got, minNet)).wait();
        bought = (await arc.balanceOf(u)) - a0;
        if (!(bought > 0n)) throw new Error(tr("The swap brought no $ARCIRCLE."));
      } else step(3);
      step(3); await approve(sg, ARCIRCLE(), S.st.address, bought, "Approve the $ARCIRCLE in your wallet…", "lock", { max: apMax() });
      step(4); say("rew", T("Confirm adding it to your lock…"));
      const tx = await c.increaseAmount(bought); await tx.wait();
      S.resume = null;
      step(5); setTimeout(() => { S.steps = null; render(); }, 2500);
      return tx.hash;
    } catch (e) {
      if (got > 0n || bought > 0n) S.resume = { got: got.toString(), bought: bought > 0n ? bought.toString() : null };
      throw e;
    }
  }
  /// what `usdcIn` (raw) of USDC brings in $ARCIRCLE (raw) through ARCIRCLE Orders before the fee — null if it can't tell
  async function quoteArc(usdcIn, prov) {
    const orders = ORDERS(), key = S.st && S.st.arcPool;
    if (!orders || !key || !(usdcIn > 0n)) return null;
    const oc = new ethers.Contract(orders, ORDERS_ABI, prov);
    try { await prov.call({ to: orders, data: oc.interface.encodeFunctionData("quote", [key, USDC(), usdcIn]) }); } catch (e) {
      const d = (e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data))) || null;
      const hex = typeof d === "string" ? d : d && d.data;
      try { return oc.interface.decodeErrorResult("QuoteResult", hex)[0]; } catch { return null; }
    }
    return null;
  }
  /// v2: the claim-and-add preview (re-read when the claimable amount changes)
  async function loadQuote() {
    const m = S.me, rp = typeof readProvider === "function" ? readProvider() : null;
    if (!m || !(m.claimable > 0) || !rp || (S.cq && S.cq.for === m.claimable)) return;
    const out = await quoteArc(ethers.parseUnits(m.claimable.toFixed(6), 6), rp).catch(() => null);
    S.cq = { for: m.claimable, out: out != null ? Number(ethers.formatEther((out * 999n) / 1000n)) : 0 };
    if (S.cq.out > 0) part(".stk-rew", rewardsCard());
  }
  /// v2: this browser on a Web Push topic (stake-0x…): no signature — it's news about a public lock
  const b64b = (x) => { const t = String(x).replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function pushTopic(topic, remove) {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
      const k = await fetch("/api/social?orders=pushkey").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!k || !k.key) return false;
      if (!remove && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return false;
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
      if (!reg || !reg.pushManager) return false;
      const sub = (await reg.pushManager.getSubscription()) || (remove ? null : await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(k.key) }));
      if (!sub) return !!remove;
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic, sub: sub.toJSON(), lang: (window.arcI18n && window.arcI18n.get()) || "en", ...(remove ? { remove: true } : {}) }) });
      return r.ok;
    } catch { return false; }
  }
  function csv() {
    const h = (S.me && S.me.history) || [];
    const rows = [["week_start_utc", "week_usdc", "your_veARCIRCLE", "your_share_pct", "you_earned_usdc"], ...h.map((x) => [new Date(x.week * 1000).toISOString().slice(0, 10), x.paid, x.ve, x.share, x.earned])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `arcircle-staking-${(me() || "wallet").slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function shareText() {
    const m = S.me, l = lockOf();
    const what = l && l.max ? "a max lock" : l ? `a lock until ${day(l.end)}` : "a lock";
    return `I'm staking ${big(l ? l.amount : 0)} $ARCIRCLE in ${what} — ${big(m ? m.ve : 0)} veARCIRCLE, earning USDC every week and voting on the pools @ARCIRCLEonArc backs.`;
  }
  async function act(a, el) {
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(refresh).catch(() => {}); return; }
    if (a === "equal" || a === "clear" || a === "repeat") {
      const ids = Object.keys(S.w).filter((k) => S.w[k] > 0);
      if (a === "clear") S.w = {};
      else if (a === "repeat") S.w = splitOf((S.me && S.me.lastVote) || []);
      else if (ids.length) { const each = Math.floor(100 / ids.length / 5) * 5 || 1; S.w = {}; ids.forEach((k) => { S.w[k] = each; }); }
      S.wTouched = true; render(); return;
    }
    if (a === "csv") return csv();
    if (a === "retry") { S.loaded = false; render(); return refresh(); }
    if (a === "hdmore") { S.hd = !S.hd; part(".stk-hd", head()); return; }
    if (a === "morepools") { S.more += 8; votePart(); return; }
    if (a === "morelb") { S.lb += 20; part(".stk-topl", stakersCard()); return; }
    if (a === "golock" || a === "govote") { const c = body.querySelector(a === "golock" ? ".stk-lock" : ".stk-vote"); if (c) c.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); return; }
    if (a === "pick") {
      const w = arciaPick();
      if (!w) { say("vote", T("Nothing to go on yet — no trading or votes this week."), "err"); return; }
      S.w = w; S.wTouched = true; S.more = Math.max(S.more, 0); votePart();
      toast(`<b>${T("ARCIA's pick")}</b><span>${T("Filled in from the pools' trading — change it, then vote. Not advice.")}</span>`);
      return;
    }
    if (a === "addpool") {
      const t = String(S.addPool || "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(t)) { say("vote", T("Paste a token address (0x…)."), "err"); return; }
      try {
        const r = await fetch(`${API}?stake=pool&token=${t}`); const j = await r.json().catch(() => null);
        if (!r.ok || !j || !j.poolId) throw new Error((j && j.error) || "");
        if (!poolsAll().some((p) => p.poolId === j.poolId)) { S.extra = [j, ...S.extra].slice(0, 12); LS.set("arcircle.stake.pools", S.extra); }
        S.addPool = ""; S.q = ""; S.tab = "all"; votePart(); say("vote", `${T("Added")} <b data-no-i18n>${esc(pname(j))}</b>`, "ok");
      } catch { say("vote", T("No Uniswap v4 pool found for that token on Arc."), "err"); }
      return;
    }
    if (a === "push") {
      const on = LS.get("arcircle.stake.push", "") === me();
      const ok0 = await pushTopic(`stake-${me()}`, on);
      if (ok0) { LS.set("arcircle.stake.push", on ? "" : me()); part(".stk-rew", rewardsCard()); toast(`<b>${T(on ? "Browser alerts off" : "Browser alerts on")}</b><span>${T(on ? "This browser won't hear about your staking any more." : "A new week's USDC, your lock ending and the vote's last day reach this browser.")}</span>`); }
      else say("rew", T("This browser can't take notifications here — try Telegram."), "err");
      return;
    }
    if (a === "noresume") { S.resume = null; part(".stk-rew", rewardsCard()); return; }
    if (a === "tgshare") { window.open(`https://t.me/share/url?url=${encodeURIComponent(`${SITE()}/stake/${me()}`)}&text=${encodeURIComponent(shareText())}`, "_blank", "noopener"); return; }
    if (a === "share" || a === "copy") {
      const link = `${SITE()}/stake/${me()}`;
      if (a === "share") window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(link)}`, "_blank", "noopener");
      else { try { await navigator.clipboard.writeText(link); if (el) { const t = el.textContent; el.textContent = tr("Copied"); setTimeout(() => { el.textContent = t; }, 1500); } } catch { say("lock", esc(link)); } }
      return;
    }
    if (!live()) return;
    if (a === "lock") return run("lock", async (c, sg) => {
      const amt = toWei(S.amt);
      await approve(sg, ARCIRCLE(), S.st.address, amt, "Approve the $ARCIRCLE in your wallet…", "lock", { max: apMax() });
      say("lock", T("Confirm the lock in your wallet…"));
      const tx = S.max ? await c.createMaxLock(amt) : await c.createLock(amt, endFor(S.dur)); await tx.wait(); S.amt = ""; return tx.hash;
    }, "lock");
    if (a === "add") return run("lock", async (c, sg) => {
      const amt = toWei(S.add);
      await approve(sg, ARCIRCLE(), S.st.address, amt, "Approve the $ARCIRCLE in your wallet…", "lock", { max: apMax() });
      say("lock", T("Confirm in your wallet…"));
      const tx = await c.increaseAmount(amt); await tx.wait(); S.add = ""; return tx.hash;
    }, "lock");
    if (a === "extend") return run("lock", async (c) => { const l = lockOf(); const minW = Math.ceil((l.end - nowS()) / WEEK) + 1; say("lock", T("Confirm in your wallet…")); const tx = await c.increaseUnlockTime(endFor(Math.min(52, Math.max(S.ext, minW)))); await tx.wait(); return tx.hash; }, "lock");
    if (a === "max") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.lockMax(); await tx.wait(); S.open.max = false; return tx.hash; }, "lock");
    if (a === "unmax") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.unlockMax(); await tx.wait(); S.open.max = false; return tx.hash; });
    if (a === "withdraw") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.withdraw(); await tx.wait(); return tx.hash; }, "open");
    if (a === "claim") return run("rew", async (c) => { say("rew", T("Confirm in your wallet…")); const tx = await c.claim(); await tx.wait(); return tx.hash; }, "coin");
    if (a === "compound") return run("rew", compound, "lock");
    if (a === "resume") { const r0 = S.resume; return run("rew", (c, sg) => compound(c, sg, r0), "lock"); }
    if (a === "ext52") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.increaseUnlockTime(endFor(52)); await tx.wait(); return tx.hash; }, "lock");
    if (a === "relock") return run("lock", async (c, sg) => {
      const l = lockOf(); if (!l) throw new Error("NoLock");
      const amt = toWei(l.amount);
      S.steps = { k: "lock", list: ["Withdraw", "Approve the $ARCIRCLE", "Lock for a year"], at: 0 }; render();
      say("lock", T("Confirm the withdrawal in your wallet…"));
      await (await c.withdraw()).wait();
      step(1); await approve(sg, ARCIRCLE(), S.st.address, amt, "Approve the $ARCIRCLE in your wallet…", "lock", { max: apMax() });
      step(2); say("lock", T("Confirm the lock in your wallet…"));
      const tx = await c.createLock(amt, endFor(52)); await tx.wait();
      step(3); setTimeout(() => { S.steps = null; render(); }, 2500);
      return tx.hash;
    }, "lock");
    if (a === "vote") return run("vote", async (c) => {
      const e = Object.entries(S.w).filter(([, v]) => Number(v) > 0);
      say("vote", T("Confirm your vote in your wallet…"));
      const tx = await c.vote(e.map(([p]) => p), e.map(([, v]) => Math.round(Number(v) * 100))); await tx.wait(); S.wTouched = false; return tx.hash;
    });
    if (a === "fund") return run("fund", async (c, sg) => {
      const v = num(S.fundAmt) || (S.st.treasury && S.st.treasury.owed) || 0;
      if (!(v > 0)) throw new Error("ZeroAmount");
      const amt = ethers.parseUnits(v.toFixed(6), 6);
      await approve(sg, USDC(), S.st.address, amt, "Approve the USDC in your wallet…", "fund");
      say("fund", T("Confirm in your wallet…"));
      const tx = await c.fund(amt); await tx.wait(); S.fundAmt = ""; return tx.hash;
    });
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.stkAct) { act(b.dataset.stkAct, b); return; }
    if (b.dataset.stkTab) { S.tab = b.dataset.stkTab; S.more = 0; votePart(); return; }
    if (b.dataset.stkWk) { const w = Number(b.dataset.w); if (b.dataset.stkWk === "stk-weeks") S.dur = w; else S.ext = w; lockPart(); return; }
    if (b.dataset.stkPct && S.bal.arc != null) { const v = (S.bal.arc * BigInt(b.dataset.p)) / 100n; const s = ethers.formatEther(v); if (b.dataset.stkPct === "amt") S.amt = s; else S.add = s; lockPart(); return; }
    // v2: lock all but what keeps Orders fee-free
    if (b.dataset.stkKeep && S.bal.arc != null) { const keep = ethers.parseEther(String(FREE_HOLD())); const v = S.bal.arc > keep ? S.bal.arc - keep : 0n; const s = ethers.formatEther(v); if (b.dataset.stkKeep === "amt") S.amt = s; else S.add = s; lockPart(); return; }
    if (b.dataset.stkLbf) { S.lbF = b.dataset.stkLbf; S.lb = 10; part(".stk-topl", stakersCard()); return; }
    // v2: a pool's weight in 5% steps
    if (b.dataset.stkStep) { const id = b.dataset.stkStep; S.w[id] = Math.max(0, Math.min(100, (Number(S.w[id]) || 0) + Number(b.dataset.d))); S.wTouched = true; votePart(); const r = body.querySelector(`.stk-pool[data-pool="${id}"] [data-stk-wv]`); if (r && !reduce()) { r.classList.remove("bump"); void r.offsetWidth; r.classList.add("bump"); } return; }
  });
  body.addEventListener("toggle", (e) => { const d = e.target.closest && e.target.closest("[data-stk-det]"); if (!d) return; const k = d.dataset.stkDet; if (!!S.open[k] !== d.open) { S.open[k] = d.open; if (k === "ext" || k === "add") lockPart(); } }, true);
  // v2: the lock line under the pointer — veARCIRCLE on that date
  body.addEventListener("pointermove", (e) => {
    const sv = e.target.closest && e.target.closest("svg.stk-decay");
    if (!sv) return;
    const a = Number(sv.dataset.a), en = Number(sv.dataset.e), mx = sv.dataset.m === "1", top = Number(sv.dataset.top) || 1;
    if (!(a > 0)) return;
    const r = sv.getBoundingClientRect(), W_ = 320, H = 92, P = 6, x = ((e.clientX - r.left) / r.width) * W_;
    const k = Math.max(0, Math.min(1, (x - P) / (W_ - P * 2))), t0 = nowS(), t = t0 + k * YEAR;
    const v = mx ? a : en > t ? (a * (en - t)) / YEAR : 0, X = P + k * (W_ - P * 2), Y = H - 18 - (v / top) * (H - 30);
    let g = sv.querySelector("g.hv");
    if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("class", "hv"); sv.appendChild(g); }
    const lbl = `${new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${big(v)}`;
    g.innerHTML = `<line x1="${X}" x2="${X}" y1="4" y2="${H - 18}"/><circle cx="${X}" cy="${Y}" r="3.5"/><text x="${Math.min(W_ - 4, Math.max(4, X))}" y="11" text-anchor="${X > W_ * 0.7 ? "end" : X < W_ * 0.3 ? "start" : "middle"}">${esc(lbl)}</text>`;
  });
  body.addEventListener("pointerleave", (e) => { const g = e.target.querySelector && e.target.querySelector("svg.stk-decay g.hv"); if (g) g.remove(); }, true);
  body.addEventListener("change", (e) => {
    if (e.target.matches("[data-stk-max]")) { S.max = e.target.checked; lockPart(); }
    else if (e.target.matches("[data-stk-apmax]")) LS.set("arcircle.stake.approvemax", e.target.checked);
    else if (e.target.matches("[data-stk-simmax]")) { S.sim.max = e.target.checked; part(".stk-sim", simCard()); }
  });
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "stk-amt") { S.amt = t.value; lockPart(); }
    else if (t.id === "stk-add") { S.add = t.value; lockPart(); }
    else if (t.id === "stk-fund") S.fundAmt = t.value;
    else if (t.id === "stk-q") { S.q = t.value; S.more = 0; votePart(); }
    else if (t.id === "stk-addpool") S.addPool = t.value;
    else if (t.id === "stk-weeks") { S.dur = Number(t.value); lockPart(); }
    else if (t.id === "stk-ext") { S.ext = Number(t.value); lockPart(); }
    else if (t.id === "stk-sima" || t.id === "stk-simp" || t.id === "stk-simw") { if (t.id === "stk-simw") S.sim.w = Number(t.value); else S.sim[t.id === "stk-sima" ? "amt" : "pot"] = t.value; part(".stk-sim", simCard()); }
    else if (t.dataset.stkW) {
      // a slider moves only its own row and the totals, so dragging stays smooth
      const id = t.dataset.stkW; S.w[id] = Math.max(0, Math.min(100, Number(t.value) || 0)); S.wTouched = true;
      const v = body.querySelector(`[data-stk-wv="${id}"]`); if (v) v.textContent = S.w[id] + "%";
      const row = t.closest(".stk-pool"); if (row) row.classList.toggle("picked", S.w[id] > 0);
      const sum = Object.values(S.w).reduce((a, b) => a + (Number(b) || 0), 0), picked = Object.values(S.w).filter((x) => Number(x) > 0).length;
      const f = body.querySelector(".stk-vsum"); if (f) { f.classList.toggle("bad", sum > 100 || picked > 8); const bs = f.querySelectorAll("b"); if (bs[0]) bs[0].textContent = sum + "%"; if (bs[1]) bs[1].textContent = picked; }
      const go = body.querySelector('[data-stk-act="vote"]'); if (go) go.disabled = !(live() && me() && S.me && S.me.ve > 0 && sum > 0 && sum <= 100 && picked <= 8);
    }
  });

  // ---------------- life ----------------
  let timer = null, clock = null, acct = null;
  async function tick() {
    if (S.busy) return;
    const ae = document.activeElement;
    const typing = ae && body.contains(ae) && /INPUT|SELECT/.test(ae.tagName);
    if (me() !== acct) { acct = me(); S.wTouched = false; S.w = {}; await loadMe(); if (!typing) render(); return; }
    if (!typing) await refresh();
  }
  function show() {
    if (!S.booted) { S.booted = true; render(); acct = me(); refresh().then(fromHash); }
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(tick, 15000);
    clock = setInterval(tickClocks, 1000);
    setTimeout(tick, 2500);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "staking") show(); else { clearInterval(timer); clearInterval(clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) render(); });
  const lede = panel.querySelector(".stk-hero .bp-lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("open"));
  // the guide starts folded on phones
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) panel.querySelectorAll(".stk-guide details[open]").forEach((d) => d.removeAttribute("open"));
  if (panel.classList.contains("active")) show();
  window.arcStaking = { get state() { return S; }, refresh };
})();
