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
  const S = { st: null, me: null, bal: {}, dur: 52, max: false, ext: 52, amt: "", add: "", fundAmt: "", q: "", tab: "all", w: {}, busy: false, msg: {}, skew: 0, loaded: false, steps: null, open: {} };

  // ---------------- data ----------------
  async function loadState() {
    try { const r = await fetch(`${API}?stake=state`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j) { S.st = j; if (j.now) S.skew = j.now - Math.floor(Date.now() / 1000); } } catch { /* keep */ }
    S.loaded = true;
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
    await loadState(); await loadMe(); render({ flip: true }); after(prev);
  }

  // ---------------- maths ----------------
  const live = () => !!(S.st && S.st.live);
  const endFor = (weeks) => Math.floor((nowS() + weeks * WEEK) / WEEK) * WEEK;
  const veFor = (amount, end, max) => (amount > 0 ? (max ? amount : end > nowS() ? (amount * (end - nowS())) / YEAR : 0) : 0);
  const lastW = () => (S.st && S.st.last) || null;
  /// a full week's USDC for `ve` more veARCIRCLE, at last week's pay and supply (an estimate)
  const estWeek = (ve) => { const L = lastW(); return L && L.ve >= 0 && L.usdc > 0 && ve > 0 ? (L.usdc * ve) / (L.ve + ve) : null; };
  const lockOf = () => (S.me && S.me.lock && S.me.lock.amount > 0 ? S.me.lock : null);
  const num = (v) => Number(String(v || "").replace(/,/g, "")) || 0;
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
    return `<svg class="stk-decay" viewBox="0 0 ${W_} ${H}" role="img" aria-label="${T("veARCIRCLE over the next year")}">
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
    return `<section class="stk-hd">
      <div class="stk-pot${S.potGrew ? " grew" : ""}"><small>${T("This week's pot")}</small><b data-stk-pot data-no-i18n>${live() ? usd(pot) : "—"}</b>
        <div class="stk-gauge" title="${T("Funded so far this week, against last week's pay and what's still due")}"><i style="width:${(g * 100).toFixed(1)}%"></i></div>
        <span>${L ? `${T("Last week paid")} <b data-no-i18n>${usd(L.usdc)}</b>` : T("Paid to everyone holding veARCIRCLE when the week began")}</span></div>
      <div class="stk-clock" title="${T("Weeks start Thursday 00:00 UTC")}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - remain / WEEK)).toFixed(2)}"/></svg>
        <div><small>${T("Next week in")}</small><b data-stk-left data-no-i18n>${live() ? left(remain) : "—"}</b></div></div>
      <div class="stk-chips">${[
        chip("$ARCIRCLE locked", live() ? big(t.locked) : "—"),
        chip("veARCIRCLE", live() ? big(t.ve) : "—"),
        chip("Stakers", live() ? fmt(t.stakers, 0) : "—"),
        chip("Yearly rate, max lock", st.apr != null ? fmt(st.apr, 1) + "%" : "—", ` title="${T("Last week's USDC per veARCIRCLE × 52, against the $ARCIRCLE price — it changes every week")}"`),
        chip("USDC paid", live() ? usd(t.funded) : "—"),
      ].join("")}</div></section>`;
  }
  function lockCard() {
    const m = S.me, lock = lockOf(), t = nowS();
    const ab = arcBal();
    const balRow = ab != null ? `<div class="stk-avail"><span>${T("In your wallet")}</span><b data-no-i18n>${fmt(ab, 2)} $ARCIRCLE</b></div>` : "";
    const pct = (k) => `<div class="stk-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-stk-pct="${k}" data-p="${p}">${p}%</button>`).join("")}</div>`;
    const btn = (act, label, dis, cls = "go") => `<button type="button" class="stk-btn ${cls}" data-stk-act="${act}"${dis || !live() ? " disabled" : ""}>${T(label)}</button>`;
    const gain = (ve) => { const e = estWeek(ve); return e != null ? `<div class="stk-gain"><span>${T("At last week's pay, about")}</span><b data-no-i18n>${usd(e)}</b><span>${T("a week")}</span></div>` : ""; };
    let h = `<section class="ams-card stk-card stk-lock"><div class="stk-ch"><h3>${T(lock ? "Your lock" : "Lock $ARCIRCLE")}</h3>${m && m.tier ? badge(m.tier) : ""}</div>`;
    if (!me()) h += `<p class="stk-note">${T("Connect a wallet to lock $ARCIRCLE.")}</p><button type="button" class="stk-btn go" data-stk-act="connect">${T("Connect wallet")}</button>`;
    else if (!lock) {
      const amt = num(S.amt), end = endFor(S.dur), ve = veFor(amt, end, S.max);
      const need = amt > 0 ? ethers.parseEther(String(amt)) : 0n;
      h += `${balRow}<label class="stk-f"><small>${T("Amount")}</small><span class="stk-in"><input id="stk-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.amt)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("amt")}
        <label class="stk-toggle"><input type="checkbox" data-stk-max${S.max ? " checked" : ""}><span class="sw" aria-hidden="true"></span><span><b>${T("Max lock")}</b> ${T("— always a full year, never runs down. Turn it off any time to start a one-year countdown.")}</span></label>
        ${S.max ? "" : `<label class="stk-f"><small>${T("Lock for")}</small></label>${slider("stk-weeks", S.dur)}`}
        ${decaySvg(amt, end, S.max)}
        <div class="stk-sum"><div><span>${T("Unlocks")}</span><b data-no-i18n>${S.max ? tr("When you turn max off, plus a year") : day(end)}</b></div><div><span>${T("Your veARCIRCLE now")}</span><b data-no-i18n>${fmt(ve, 2)}</b></div><div><span>${T("Early exit")}</span><b>${T("None — locked until then")}</b></div></div>
        ${gain(ve)}
        ${btn("lock", S.bal.arcAllow != null && amt > 0 && S.bal.arcAllow < need ? "Approve and lock" : S.max ? "Max lock" : "Lock", !(amt > 0))}`;
    } else {
      const ended = !lock.max && lock.end <= t;
      h += `<div class="stk-mine"><div><small>${T("Locked")}</small><b data-no-i18n>${fmt(lock.amount, 2)} $ARCIRCLE</b></div>
        <div><small>${T("Unlocks")}</small>${lock.max ? `<b>${T("Max lock")}</b><span>${T("never runs down")}</span>` : `<b data-no-i18n>${day(lock.end)}</b><span>${ended ? T("ended — withdraw it") : `${T("in")} <span data-no-i18n data-stk-until="${lock.end}">${left(lock.end - t)}</span>`}</span>`}</div>
        <div><small>veARCIRCLE</small><b data-stk-ve data-no-i18n>${fmt(m.ve, 2)}</b><span>${T(lock.max ? "stays at the amount locked" : "runs down to 0 at unlock")}</span></div></div>`;
      const ext = !lock.max && S.open.ext ? { amount: lock.amount, end: Math.max(endFor(S.ext), lock.end), max: false } : null;
      const add = num(S.add);
      const altAdd = S.open.add && add > 0 ? { amount: lock.amount + add, end: lock.end, max: lock.max } : null;
      h += decaySvg(lock.amount, lock.end, lock.max, ext || altAdd);
      h += gain(m.ve);
      if (ended) h += btn("withdraw", "Withdraw $ARCIRCLE");
      else {
        const need = add > 0 ? ethers.parseEther(String(add)) : 0n;
        h += `<details class="stk-more"${S.open.add ? " open" : ""} data-stk-det="add"><summary>${T("Add more")}</summary>${balRow}<label class="stk-f"><span class="stk-in"><input id="stk-add" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.add)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("add")}
          <p class="stk-note">${T(lock.max ? "Stays a max lock." : "Same unlock date.")} ${T("Your veARCIRCLE grows by")} <b data-no-i18n>${fmt(veFor(add, lock.end, lock.max), 2)}</b>.</p>${btn("add", S.bal.arcAllow != null && add > 0 && S.bal.arcAllow < need ? "Approve and add" : "Add to lock", !(add > 0))}</details>`;
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
      h += `<div class="stk-share"><button type="button" class="stk-btn sm" data-stk-act="share">${T("Share on X")}</button><button type="button" class="stk-btn sm" data-stk-act="copy">${T("Copy my staking card link")}</button></div>`;
    }
    return h + `<p class="stk-msg ${S.msg.lock ? S.msg.lock.cls : ""}" aria-live="polite">${S.msg.lock ? S.msg.lock.h : ""}</p></section>`;
  }
  function rewardsCard() {
    const m = S.me, wk = (S.st && S.st.weeks) || [], lock = lockOf();
    const canCompound = !!(m && m.claimable > 0 && lock && (lock.max || lock.end > nowS() + WEEK) && ORDERS() && S.st && S.st.arcPool && live());
    let h = `<section class="ams-card stk-card stk-rew"><h3>${T("USDC rewards")}</h3>`;
    h += `<div class="stk-claim"><div><small>${T("Ready to claim")}</small><b data-stk-claim data-no-i18n>${m ? usd(m.claimable) : "—"}</b></div><div class="stk-cbtns"><button type="button" class="stk-btn go" data-stk-act="claim"${m && m.claimable > 0 && live() ? "" : " disabled"}>${T("Claim")}</button>
      <button type="button" class="stk-btn" data-stk-act="compound"${canCompound ? "" : " disabled"} title="${T("Swaps the USDC for $ARCIRCLE through ARCIRCLE Orders and adds it to your lock")}">${T("Claim and add to my lock")}</button></div></div>`;
    if (S.steps) h += `<ol class="stk-steps">${S.steps.list.map((s, i) => `<li class="${i < S.steps.at ? "done" : i === S.steps.at ? "now" : ""}">${T(s)}</li>`).join("")}</ol>`;
    h += `<p class="stk-note">${T("Each week is paid to whoever held veARCIRCLE when it began, in proportion to their veARCIRCLE — claimable once the week is over. Rewards never expire.")}</p>`;
    const hist = ((m && m.history) || []).filter((x) => x.ve > 0);
    if (hist.length) {
      const tot = hist.reduce((a, x) => a + x.earned, 0);
      h += `<div class="stk-hh"><b>${T("Your last weeks")}</b><span>${T("earned")} <b data-no-i18n>${usd(tot)}</b></span><button type="button" class="stk-btn sm" data-stk-act="csv">CSV</button></div>
        <table class="stk-wk"><thead><tr><th>${T("Week of")}</th><th>${T("Week's USDC")}</th><th>${T("Your share")}</th><th>${T("You earned")}</th></tr></thead><tbody>${hist.map((x) => `<tr><td data-no-i18n>${esc(wkName(x.week))}</td><td data-no-i18n>${usd(x.paid)}</td><td data-no-i18n>${fmt(x.share, 2)}%</td><td data-no-i18n>${usd(x.earned)}</td></tr>`).join("")}</tbody></table>`;
    } else if (wk.length) h += `<table class="stk-wk"><thead><tr><th>${T("Week of")}</th><th>USDC</th><th>${T("veARCIRCLE at its start")}</th><th>${T("Per 1M")}</th></tr></thead><tbody>${wk.map((w) => `<tr${w.open ? ' class="open"' : ""}><td data-no-i18n>${esc(wkName(w.week))}${w.open ? ` <em>${T("now")}</em>` : ""}</td><td data-no-i18n>${usd(w.usdc)}</td><td data-no-i18n>${big(w.ve)}</td><td data-no-i18n>${w.ve > 0 && w.usdc > 0 ? usd((w.usdc / w.ve) * 1e6) : "—"}</td></tr>`).join("")}</tbody></table>`;
    return h + `<p class="stk-msg ${S.msg.rew ? S.msg.rew.cls : ""}" aria-live="polite">${S.msg.rew ? S.msg.rew.h : ""}</p></section>`;
  }
  function voteCard() {
    const st = S.st, pools = (st && st.pools) || [], cur = st && st.votes ? st.votes[0] : null, prev = st && st.votes ? st.votes[1] : null;
    const res = new Map(((cur && cur.pools) || []).map((p) => [p.poolId, p.ve]));
    const tot = (cur && cur.total) || 0;
    const lead = cur && cur.pools && cur.pools[0] ? cur.pools[0].poolId : null;
    const q = lc(S.q), mine = new Set(Object.keys(S.w).filter((k) => S.w[k] > 0).concat(((S.me && S.me.vote) || []).map((v) => v.poolId)));
    const shown = pools.filter((p) => (S.tab === "all" || (S.tab === "mine" ? mine.has(p.poolId) : (p.src || []).includes(S.tab)))
        && (!q || lc(p.sym).includes(q) || lc(p.name).includes(q) || lc(p.token).includes(q) || p.poolId.includes(q)))
      .sort((a, b) => (res.get(b.poolId) || 0) - (res.get(a.poolId) || 0) || (S.w[b.poolId] || 0) - (S.w[a.poolId] || 0));
    const sum = Object.values(S.w).reduce((a, b) => a + (Number(b) || 0), 0), picked = Object.values(S.w).filter((v) => Number(v) > 0).length;
    const tag = (s) => s.map((x) => `<em class="stk-src ${x}">${T(x === "arcircle" ? "Core coin" : x === "predict" ? "Predict" : x === "arcpad" ? "ArcPad" : x)}</em>`).join("");
    let h = `<section class="ams-card stk-card stk-vote"><div class="stk-vh"><h3>${T("This week's pool vote")}</h3><span>${T("Resets every Thursday 00:00 UTC")}</span></div>
      <p class="stk-note">${T("Split your veARCIRCLE across up to 8 pools ARCIRCLE PAD should back this week. Voting again replaces your vote. It costs nothing but gas.")}</p>
      <div class="stk-perks"><b>${T("The week's #1 pool gets")}</b><ul>${PERKS().map((p) => `<li>${T(p)}</li>`).join("")}</ul></div>`;
    // the distribution so far: the top six and the rest
    if (cur && cur.pools && cur.pools.length && tot > 0) {
      const top = cur.pools.slice(0, 6), rest = cur.pools.slice(6).reduce((a, p) => a + p.ve, 0);
      const seg = top.map((p, i) => ({ c: COLORS[i], n: pname(p), v: p.ve })).concat(rest > 0 ? [{ c: OTHER, n: tr("Others"), v: rest }] : []);
      h += `<div class="stk-dist"><div class="stk-dbar" role="img" aria-label="${T("This week's vote so far")}">${seg.map((s) => `<i style="flex:${s.v};background:${s.c}" title="${esc(s.n)} ${fmt((s.v / tot) * 100, 1)}%"></i>`).join("")}</div>
        <ul class="stk-dleg">${seg.map((s) => `<li><i style="background:${s.c}"></i><span data-no-i18n>${esc(s.n)}</span><b data-no-i18n>${fmt((s.v / tot) * 100, 1)}%</b></li>`).join("")}</ul></div>`;
    }
    if (prev && prev.pools.length) h += `<div class="stk-prev"><small>${T("Last week's result")}</small>${prev.pools.slice(0, 3).map((p, i) => `<span>${i === 0 ? '<i class="stk-crown" aria-hidden="true">♛</i>' : ""}<b data-no-i18n>#${i + 1} ${esc(pname(p))}</b> <i data-no-i18n>${prev.total > 0 ? fmt((p.ve / prev.total) * 100, 1) : 0}%</i></span>`).join("")}</div>`;
    const tabs = [["all", "All"], ["mine", "My picks"], ["arcpad", "ArcPad"], ["predict", "Predict"]];
    h += `<div class="stk-vtools"><div class="stk-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-stk-tab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}</div>
      <input id="stk-q" class="stk-search" type="search" placeholder="${T("Search a token")}" value="${esc(S.q)}" autocomplete="off"></div>`;
    h += `<div class="stk-pools">${shown.slice(0, 40).map((p) => { const v = res.get(p.poolId) || 0, share = tot > 0 ? (v / tot) * 100 : 0, w = S.w[p.poolId] || 0, isLead = p.poolId === lead;
      return `<div class="stk-pool${isLead ? " lead" : ""}${w > 0 ? " picked" : ""}" data-pool="${p.poolId}">${avatar(p)}<div class="stk-pn"><b data-no-i18n>${esc(pname(p))}</b>${isLead ? `<i class="stk-crown" title="${T("Leading this week")}">♛</i>` : ""}${tag(p.src || [])}<a href="${EXPL("token", p.token)}" target="_blank" rel="noopener" data-no-i18n>${short(p.token)} ↗</a></div>
      <div class="stk-pr"><span class="stk-pbar"><i style="width:${share.toFixed(1)}%"></i></span><span data-no-i18n>${fmt(share, 1)}%</span></div>
      <label class="stk-pw"><input type="range" min="0" max="100" step="5" data-stk-w="${p.poolId}" value="${w}" aria-label="${T("Your weight")} ${esc(pname(p))}"${me() ? "" : " disabled"}><b data-no-i18n data-stk-wv="${p.poolId}">${w}%</b></label></div>`; }).join("") || `<div class="stk-empty">${T(pools.length ? "No pool matches." : "Pools show up here once staking is live.")}</div>`}</div>`;
    const ok = me() && S.me && S.me.ve > 0 && sum > 0 && sum <= 100 && picked <= 8;
    const canRepeat = S.me && S.me.lastVote && S.me.lastVote.length;
    h += `<div class="stk-vfoot"><span class="stk-vsum ${sum > 100 || picked > 8 ? "bad" : ""}">${T("Your split")}: <b data-no-i18n>${sum}%</b> · <b data-no-i18n>${picked}</b>/8 ${T("pools")}${S.me && S.me.ve > 0 ? ` · <b data-no-i18n>${fmt(S.me.ve, 0)}</b> veARCIRCLE` : ""}</span>
      <div class="stk-vbtns"><button type="button" class="stk-btn sm" data-stk-act="equal"${picked ? "" : " disabled"}>${T("Equal split")}</button><button type="button" class="stk-btn sm" data-stk-act="repeat"${canRepeat ? "" : " disabled"}>${T("Repeat last week")}</button><button type="button" class="stk-btn sm" data-stk-act="clear"${picked ? "" : " disabled"}>${T("Clear")}</button>
      <button type="button" class="stk-btn go" data-stk-act="vote"${ok && live() ? "" : " disabled"}>${T("Vote")}</button></div></div>`;
    if (me() && S.me && !(S.me.ve > 0)) h += `<p class="stk-note">${T("Lock $ARCIRCLE first: your veARCIRCLE is your vote.")}</p>`;
    return h + `<p class="stk-msg ${S.msg.vote ? S.msg.vote.cls : ""}" aria-live="polite">${S.msg.vote ? S.msg.vote.h : ""}</p></section>`;
  }
  function treasuryCard() {
    const tr_ = (S.st && S.st.treasury) || null, f = (S.st && S.st.funded) || [];
    let h = `<section class="ams-card stk-card stk-tre"><h3>${T("Where the USDC comes from")}</h3>
      <p class="stk-note">${T("ARCIRCLE Orders and Predict fees go to the ARCIRCLE fee burn: half buys $ARCIRCLE and burns it, half goes to the treasury. Half of the treasury's half is promised to stakers, funded week by week from the treasury wallet — every step is on-chain.")}</p>`;
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
  function stakersCard() {
    const list = (S.st && S.st.stakers) || [];
    if (!list.length) return "";
    return `<section class="ams-card stk-card stk-topl"><h3>${T("Biggest locks")}</h3><ol>${list.slice(0, 10).map((x, i) => `<li${lc(x.a) === me() ? ' class="you"' : ""}><span data-no-i18n>#${i + 1}</span><a href="${EXPL("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${short(x.a)}${lc(x.a) === me() ? ` (${esc(tr("you"))})` : ""}</a>${badge(x.tier)}<b data-no-i18n>${big(x.ve != null ? x.ve : x.amount)}</b><em data-no-i18n>${x.max ? esc(tr("Max lock")) : day(x.end)}</em></li>`).join("")}</ol><p class="stk-note">${T("Ranked by veARCIRCLE. Badges: Bronze 1K, Silver 10K, Gold 100K, Diamond 1M veARCIRCLE.")}</p></section>`;
  }
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
    const pre = !S.loaded ? `<div class="stk-empty">…</div>` : !live() ? `<div class="stk-soon"><b>${T("Opens soon")}</b><span>${T("The veARCIRCLE contract is being deployed. Everything below shows how it will work — the buttons switch on when it's live.")}</span></div>` : "";
    body.innerHTML = `${pre}${head()}<div class="stk-grid">${lockCard()}${rewardsCard()}</div>${voteCard()}<div class="stk-grid">${treasuryCard()}${stakersCard()}</div>`;
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.s); } catch { /* range */ } } }
    if (wFocus) { const el = body.querySelector(`[data-stk-w="${wFocus}"]`); if (el) el.focus(); }
    flipAfter(pos);
    // a new leader this week
    const cur = S.st && S.st.votes && S.st.votes[0], lead = cur && cur.pools && cur.pools[0] ? cur.pools[0].poolId : null;
    if (lead && S.lead && S.lead.week === cur.week && S.lead.id !== lead && o.flip) {
      const row = body.querySelector(`.stk-pool[data-pool="${lead}"]`);
      if (row) { row.classList.add("newlead"); const f = document.createElement("span"); f.className = "stk-flip"; f.textContent = tr("Takes the lead!"); row.appendChild(f); setTimeout(() => { row.classList.remove("newlead"); f.remove(); }, 2600); }
    }
    if (lead) S.lead = { week: cur.week, id: lead };
  }

  // ---------------- motion ----------------
  function countUp(el, from, to, ms = 900) {
    if (!el || reduce() || !(to > from)) { if (el) el.textContent = fmt(to, 2); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e, 2); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function lockFx(fromVe) {
    const card = body.querySelector(".stk-lock");
    if (card && !reduce()) {
      const fx = document.createElement("div"); fx.className = "stk-lockfx"; fx.setAttribute("aria-hidden", "true");
      fx.innerHTML = `<svg class="stk-padlock" viewBox="0 0 48 56"><path class="sh" d="M14 24 V16 a10 10 0 0 1 20 0 V24"/><rect x="8" y="24" width="32" height="26" rx="6"/><circle cx="24" cy="36" r="3.4"/><path d="M24 39 v5"/></svg>`;
      card.appendChild(fx); setTimeout(() => fx.remove(), 1600);
    }
    countUp(body.querySelector("[data-stk-ve]"), fromVe || 0, (S.me && S.me.ve) || 0);
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
    if (remain === 0 && !S.rolling) { S.rolling = true; setTimeout(() => { S.rolling = false; refresh(); }, 4000); }
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
    } catch (e) { say(k, esc(errText(e)), "err"); }
    finally { S.busy = false; if (S.steps && S.steps.at < S.steps.list.length) { S.steps = null; render(); } }
  }
  async function approve(sg, token, spender, need, label, k) {
    const t = new ethers.Contract(token, ERC20, sg);
    const have = await t.allowance(await sg.getAddress(), spender);
    if (have >= need) return;
    say(k, T(label));
    await (await t.approve(spender, need)).wait();
  }
  const step = (i) => { if (S.steps) { S.steps.at = i; const ol = body.querySelector(".stk-steps"); if (ol) ol.querySelectorAll("li").forEach((li, j) => { li.className = j < i ? "done" : j === i ? "now" : ""; }); } };
  /// claim, swap the USDC for $ARCIRCLE through ARCIRCLE Orders ($ARCIRCLE's own pool), add it to the lock
  async function compound(c, sg) {
    const u = await sg.getAddress(), key = S.st.arcPool, orders = ORDERS();
    const usdc = new ethers.Contract(USDC(), ERC20, sg), arc = new ethers.Contract(ARCIRCLE(), ERC20, sg);
    const b0 = await usdc.balanceOf(u);
    S.steps = { list: ["Claim the USDC", "Approve the USDC for ARCIRCLE Orders", "Swap it for $ARCIRCLE", "Approve the $ARCIRCLE", "Add it to your lock"], at: 0 }; render();
    say("rew", T("Confirm the claim in your wallet…"));
    await (await c.claim()).wait();
    const got = (await usdc.balanceOf(u)) - b0;
    if (!(got > 0n)) throw new Error(tr("Nothing came in to swap."));
    step(1); await approve(sg, USDC(), orders, got, "Approve the USDC for ARCIRCLE Orders…", "rew");
    step(2);
    const oc = new ethers.Contract(orders, ORDERS_ABI, sg);
    let out = null;
    try { await sg.provider.call({ to: orders, data: oc.interface.encodeFunctionData("quote", [key, USDC(), got]) }); } catch (e) {
      const d = (e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data))) || null;
      const hex = typeof d === "string" ? d : d && d.data;
      try { out = oc.interface.decodeErrorResult("QuoteResult", hex)[0]; } catch { out = null; }
    }
    if (out == null) throw new Error(tr("Couldn't read a price from the pool right now. Your USDC is in your wallet."));
    const minNet = (out * 999n * 97n) / 100000n; // after the 0.1% fee, at most 3% worse
    const a0 = await arc.balanceOf(u);
    say("rew", T("Confirm the swap in your wallet…"));
    await (await oc.swapMarket(key, USDC(), ARCIRCLE(), got, minNet)).wait();
    const bought = (await arc.balanceOf(u)) - a0;
    if (!(bought > 0n)) throw new Error(tr("The swap brought no $ARCIRCLE."));
    step(3); await approve(sg, ARCIRCLE(), S.st.address, bought, "Approve the $ARCIRCLE in your wallet…", "lock");
    step(4); say("rew", T("Confirm adding it to your lock…"));
    const tx = await c.increaseAmount(bought); await tx.wait();
    step(5); setTimeout(() => { S.steps = null; render(); }, 2500);
    return tx.hash;
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
    if (a === "share" || a === "copy") {
      const link = `${SITE()}/stake/${me()}`;
      if (a === "share") window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(link)}`, "_blank", "noopener");
      else { try { await navigator.clipboard.writeText(link); if (el) { const t = el.textContent; el.textContent = tr("Copied"); setTimeout(() => { el.textContent = t; }, 1500); } } catch { say("lock", esc(link)); } }
      return;
    }
    if (!live()) return;
    if (a === "lock") return run("lock", async (c, sg) => {
      const amt = ethers.parseEther(String(num(S.amt)));
      await approve(sg, ARCIRCLE(), S.st.address, amt, "Approve the $ARCIRCLE in your wallet…", "lock");
      say("lock", T("Confirm the lock in your wallet…"));
      const tx = S.max ? await c.createMaxLock(amt) : await c.createLock(amt, endFor(S.dur)); await tx.wait(); S.amt = ""; return tx.hash;
    }, "lock");
    if (a === "add") return run("lock", async (c, sg) => {
      const amt = ethers.parseEther(String(num(S.add)));
      await approve(sg, ARCIRCLE(), S.st.address, amt, "Approve the $ARCIRCLE in your wallet…", "lock");
      say("lock", T("Confirm in your wallet…"));
      const tx = await c.increaseAmount(amt); await tx.wait(); S.add = ""; return tx.hash;
    }, "lock");
    if (a === "extend") return run("lock", async (c) => { const l = lockOf(); const minW = Math.ceil((l.end - nowS()) / WEEK) + 1; say("lock", T("Confirm in your wallet…")); const tx = await c.increaseUnlockTime(endFor(Math.min(52, Math.max(S.ext, minW)))); await tx.wait(); return tx.hash; }, "lock");
    if (a === "max") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.lockMax(); await tx.wait(); S.open.max = false; return tx.hash; }, "lock");
    if (a === "unmax") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.unlockMax(); await tx.wait(); S.open.max = false; return tx.hash; });
    if (a === "withdraw") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.withdraw(); await tx.wait(); return tx.hash; });
    if (a === "claim") return run("rew", async (c) => { say("rew", T("Confirm in your wallet…")); const tx = await c.claim(); await tx.wait(); return tx.hash; }, "coin");
    if (a === "compound") return run("rew", compound, "lock");
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
    if (b.dataset.stkTab) { S.tab = b.dataset.stkTab; render(); return; }
    if (b.dataset.stkWk) { const w = Number(b.dataset.w); if (b.dataset.stkWk === "stk-weeks") S.dur = w; else S.ext = w; render(); return; }
    if (b.dataset.stkPct && S.bal.arc != null) { const v = (S.bal.arc * BigInt(b.dataset.p)) / 100n; const s = ethers.formatEther(v); if (b.dataset.stkPct === "amt") S.amt = s; else S.add = s; render(); }
  });
  body.addEventListener("toggle", (e) => { const d = e.target.closest && e.target.closest("[data-stk-det]"); if (!d) return; const k = d.dataset.stkDet; if (!!S.open[k] !== d.open) { S.open[k] = d.open; if (k === "ext" || k === "add") render(); } }, true);
  body.addEventListener("change", (e) => { if (e.target.matches("[data-stk-max]")) { S.max = e.target.checked; render(); } });
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "stk-amt") { S.amt = t.value; render(); }
    else if (t.id === "stk-add") { S.add = t.value; render(); }
    else if (t.id === "stk-fund") S.fundAmt = t.value;
    else if (t.id === "stk-q") { S.q = t.value; render(); }
    else if (t.id === "stk-weeks") { S.dur = Number(t.value); render(); }
    else if (t.id === "stk-ext") { S.ext = Number(t.value); render(); }
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
    if (!S.booted) { S.booted = true; render(); acct = me(); refresh(); }
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
