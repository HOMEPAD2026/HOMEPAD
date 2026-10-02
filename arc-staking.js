/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-staking.js — ARCIRCLE Staking (arcpad.html#staking; api/_stake.mjs; contracts/ArcircleStaking.sol): veARCIRCLE.
//   · lock $ARCIRCLE for 1 week to 1 year → veARCIRCLE, largest when the lock is new and long, running down to zero at
//     the unlock date; add to it or extend it any time, withdraw only after it ends
//   · weekly USDC: the treasury funds each week with half of its share of the ARCIRCLE Orders and Predict fees; a week
//     is paid to whoever held veARCIRCLE when it began, pro rata, and is claimable once it's over
//   · weekly pool votes: veARCIRCLE holders split their power across the pools ARCIRCLE PAD should back
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
  const DURS = [[1, "1 week"], [4, "1 month"], [13, "3 months"], [26, "6 months"], [52, "1 year"]];
  const ARCIRCLE = () => lc((typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7");
  const USDC = () => lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
  const EXPL = (k, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${k}/${x}`;
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e3 ? fmt(n / 1e3, 1) + "K" : fmt(n, 2));
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + fmt(n, n < 1 ? 4 : 2));
  const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
  const wkName = (w) => new Date(w * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const left = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d}d ${h}h` : `${h}h ${Math.floor((s % 3600) / 60)}m`; };
  const ABI = [
    "function createLock(uint256 amount, uint256 unlockTime)", "function increaseAmount(uint256 amount)", "function increaseUnlockTime(uint256 unlockTime)",
    "function withdraw()", "function claim() returns (uint256)", "function fund(uint256 amount)", "function vote(bytes32[] pools, uint256[] weights)",
    "error ZeroAmount()", "error NoLock()", "error LockExists()", "error LockExpired()", "error LockNotOver()", "error BadUnlock()", "error NotLonger()", "error NoStakers()", "error TooEarly()", "error BadVote()",
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const S = { st: null, me: null, bal: {}, dur: 52, ext: 52, amt: "", add: "", fundAmt: "", q: "", w: {}, busy: false, msg: {}, skew: 0, loaded: false };

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
    if (S.me && S.me.vote && !S.wTouched) { S.w = {}; const tot = S.me.ve || 0; for (const v of S.me.vote) S.w[v.poolId] = tot > 0 ? Math.round((v.ve / tot) * 100) : 0; }
  }
  async function refresh() { await loadState(); await loadMe(); render(); }

  // ---------------- view ----------------
  const live = () => !!(S.st && S.st.live);
  const endFor = (weeks) => Math.floor((nowS() + weeks * WEEK) / WEEK) * WEEK;
  const veFor = (amount, end) => (amount > 0 && end > nowS() ? (amount * (end - nowS())) / YEAR : 0);
  function stats() {
    const t = (S.st && S.st.totals) || {};
    const last = S.st && S.st.weeks ? S.st.weeks.find((w) => !w.open && w.usdc > 0) : null;
    const per = last && last.ve > 0 ? (last.usdc / last.ve) * 1e6 : null;
    const tile = (k, v, s) => `<div class="stk-stat"><small>${T(k)}</small><b data-no-i18n>${v}</b>${s ? `<span>${s}</span>` : ""}</div>`;
    return `<div class="stk-stats">${[
      tile("$ARCIRCLE locked", live() ? big(t.locked) : "—", live() ? `<span data-no-i18n>${fmt(t.stakers, 0)}</span> ${T("stakers")}` : T("Opens soon")),
      tile("veARCIRCLE", live() ? big(t.ve) : "—", T("voting power right now")),
      tile("USDC paid to stakers", live() ? usd(t.funded) : "—", live() ? `<span data-no-i18n>${usd(t.claimed)}</span> ${T("claimed")}` : ""),
      tile("Last week, per 1M veARCIRCLE", per != null ? usd(per) : "—", T("what a full week paid")),
    ].join("")}</div>`;
  }
  function lockCard() {
    const m = S.me, lock = m && m.lock && m.lock.amount > 0 ? m.lock : null, t = nowS();
    const arcBal = S.bal.arc != null ? Number(ethers.formatEther(S.bal.arc)) : null;
    const balRow = arcBal != null ? `<div class="stk-avail"><span>${T("In your wallet")}</span><b data-no-i18n>${fmt(arcBal, 2)} $ARCIRCLE</b></div>` : "";
    const pct = (k) => `<div class="stk-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-stk-pct="${k}" data-p="${p}">${p}%</button>`).join("")}</div>`;
    const durRow = (key, cur, minEnd) => `<div class="stk-durs">${DURS.map(([w, l]) => { const e = endFor(w); const off = minEnd && e <= minEnd; return `<button type="button" data-stk-${key}="${w}" class="${cur === w ? "on" : ""}"${off ? " disabled" : ""}>${T(l)}</button>`; }).join("")}</div>`;
    const btn = (act, label, dis) => `<button type="button" class="stk-btn go" data-stk-act="${act}"${dis || !live() ? " disabled" : ""}>${T(label)}</button>`;
    let h = `<section class="ams-card stk-card stk-lock"><h3>${T(lock ? "Your lock" : "Lock $ARCIRCLE")}</h3>`;
    if (!me()) h += `<p class="stk-note">${T("Connect a wallet to lock $ARCIRCLE.")}</p><button type="button" class="stk-btn go" data-stk-act="connect">${T("Connect wallet")}</button>`;
    else if (!lock) {
      const amt = Number(String(S.amt).replace(/,/g, "")) || 0, end = endFor(S.dur), ve = veFor(amt, end);
      h += `${balRow}<label class="stk-f"><small>${T("Amount")}</small><span class="stk-in"><input id="stk-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.amt)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("amt")}
        <label class="stk-f"><small>${T("Lock for")}</small></label>${durRow("dur", S.dur)}
        <div class="stk-sum"><div><span>${T("Unlocks")}</span><b data-no-i18n>${day(end)}</b></div><div><span>${T("Your veARCIRCLE now")}</span><b data-no-i18n>${fmt(ve, 2)}</b></div><div><span>${T("Early exit")}</span><b>${T("None — locked until then")}</b></div></div>
        ${btn("lock", S.bal.arcAllow != null && amt > 0 && S.bal.arcAllow < ethers.parseEther(String(amt)) ? "Approve and lock" : "Lock", !(amt > 0))}`;
    } else {
      const ended = lock.end <= t;
      const frac = Math.max(0, Math.min(1, (lock.end - t) / YEAR));
      h += `<div class="stk-mine"><div><small>${T("Locked")}</small><b data-no-i18n>${fmt(lock.amount, 2)} $ARCIRCLE</b></div><div><small>${T("Unlocks")}</small><b data-no-i18n>${day(lock.end)}</b><span>${ended ? T("ended — withdraw it") : `${T("in")} <span data-no-i18n>${left(lock.end - t)}</span>`}</span></div><div><small>veARCIRCLE</small><b data-no-i18n>${fmt(m.ve, 2)}</b><span>${T("runs down to 0 at unlock")}</span></div></div>
        <div class="stk-bar" title="${T("Time left of a year")}"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>`;
      if (ended) h += btn("withdraw", "Withdraw $ARCIRCLE");
      else {
        const add = Number(String(S.add).replace(/,/g, "")) || 0;
        h += `<details class="stk-more"${S.openAdd ? " open" : ""} data-stk-det="add"><summary>${T("Add more")}</summary>${balRow}<label class="stk-f"><span class="stk-in"><input id="stk-add" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.add)}"><em data-no-i18n>$ARCIRCLE</em></span></label>${pct("add")}
          <p class="stk-note">${T("Same unlock date. Your veARCIRCLE grows by")} <b data-no-i18n>${fmt(veFor(add, lock.end), 2)}</b>.</p>${btn("add", S.bal.arcAllow != null && add > 0 && S.bal.arcAllow < ethers.parseEther(String(add)) ? "Approve and add" : "Add to lock", !(add > 0))}</details>
          <details class="stk-more"${S.openExt ? " open" : ""} data-stk-det="ext"><summary>${T("Extend")}</summary>${durRow("ext", S.ext, lock.end)}
          <p class="stk-note">${T("New unlock date")}: <b data-no-i18n>${day(endFor(S.ext))}</b> · veARCIRCLE <b data-no-i18n>${fmt(veFor(lock.amount, endFor(S.ext)), 2)}</b></p>${btn("extend", "Extend lock", endFor(S.ext) <= lock.end)}</details>`;
      }
    }
    return h + `<p class="stk-msg ${S.msg.lock ? S.msg.lock.cls : ""}" aria-live="polite">${S.msg.lock ? S.msg.lock.h : ""}</p></section>`;
  }
  function rewardsCard() {
    const m = S.me, wk = (S.st && S.st.weeks) || [];
    let h = `<section class="ams-card stk-card stk-rew"><h3>${T("USDC rewards")}</h3>`;
    h += `<div class="stk-claim"><div><small>${T("Ready to claim")}</small><b data-no-i18n>${m ? usd(m.claimable) : "—"}</b></div><button type="button" class="stk-btn go" data-stk-act="claim"${m && m.claimable > 0 && live() ? "" : " disabled"}>${T("Claim")}</button></div>`;
    h += `<p class="stk-note">${T("Each week is paid to whoever held veARCIRCLE when it began, in proportion to their veARCIRCLE — claimable once the week is over. Rewards never expire.")}</p>`;
    if (wk.length) h += `<table class="stk-wk"><thead><tr><th>${T("Week of")}</th><th>USDC</th><th>${T("veARCIRCLE at its start")}</th><th>${T("Per 1M")}</th></tr></thead><tbody>${wk.map((w) => `<tr${w.open ? ' class="open"' : ""}><td data-no-i18n>${esc(wkName(w.week))}${w.open ? ` <em>${T("now")}</em>` : ""}</td><td data-no-i18n>${usd(w.usdc)}</td><td data-no-i18n>${big(w.ve)}</td><td data-no-i18n>${w.ve > 0 && w.usdc > 0 ? usd((w.usdc / w.ve) * 1e6) : "—"}</td></tr>`).join("")}</tbody></table>`;
    if (S.st && S.st.live) h += `<p class="stk-note">${T("This week ends in")} <b data-no-i18n>${left(S.st.nextWeek - nowS())}</b>.</p>`;
    return h + `<p class="stk-msg ${S.msg.rew ? S.msg.rew.cls : ""}" aria-live="polite">${S.msg.rew ? S.msg.rew.h : ""}</p></section>`;
  }
  function voteCard() {
    const st = S.st, pools = (st && st.pools) || [], cur = st && st.votes ? st.votes[0] : null, prev = st && st.votes ? st.votes[1] : null;
    const res = new Map(((cur && cur.pools) || []).map((p) => [p.poolId, p.ve]));
    const tot = (cur && cur.total) || 0;
    const q = lc(S.q);
    const shown = pools.filter((p) => !q || lc(p.sym).includes(q) || lc(p.name).includes(q) || p.token.includes(q) || p.poolId.includes(q))
      .sort((a, b) => (res.get(b.poolId) || 0) - (res.get(a.poolId) || 0) || (S.w[b.poolId] || 0) - (S.w[a.poolId] || 0));
    const sum = Object.values(S.w).reduce((a, b) => a + (Number(b) || 0), 0), picked = Object.values(S.w).filter((v) => Number(v) > 0).length;
    const tag = (s) => s.map((x) => `<em class="stk-src ${x}">${T(x === "arcircle" ? "Core coin" : x === "predict" ? "Predict" : x === "arcpad" ? "ArcPad" : x)}</em>`).join("");
    const name = (p) => (p.sym && p.sym !== "?" ? "$" + p.sym : short(p.token));
    let h = `<section class="ams-card stk-card stk-vote"><div class="stk-vh"><h3>${T("This week's pool vote")}</h3><span>${T("Resets every Thursday 00:00 UTC")}</span></div>
      <p class="stk-note">${T("Split your veARCIRCLE across up to 8 pools ARCIRCLE PAD should back this week. Voting again replaces your vote. It costs nothing but gas.")}</p>`;
    if (prev && prev.pools.length) h += `<div class="stk-prev"><small>${T("Last week's result")}</small>${prev.pools.slice(0, 3).map((p, i) => `<span><b data-no-i18n>#${i + 1} ${esc(p.sym && p.sym !== "?" ? "$" + p.sym : short(p.token || p.poolId))}</b> <i data-no-i18n>${prev.total > 0 ? fmt((p.ve / prev.total) * 100, 1) : 0}%</i></span>`).join("")}</div>`;
    h += `<input id="stk-q" class="stk-search" type="search" placeholder="${T("Search a token")}" value="${esc(S.q)}" autocomplete="off">`;
    h += `<div class="stk-pools">${shown.slice(0, 40).map((p) => { const v = res.get(p.poolId) || 0, share = tot > 0 ? (v / tot) * 100 : 0; return `<div class="stk-pool"><div class="stk-pn"><b data-no-i18n>${esc(name(p))}</b>${tag(p.src || [])}<a href="${EXPL("token", p.token)}" target="_blank" rel="noopener" data-no-i18n>${short(p.token)} ↗</a></div>
      <div class="stk-pr"><span class="stk-pbar"><i style="width:${share.toFixed(1)}%"></i></span><span data-no-i18n>${fmt(share, 1)}%</span></div>
      <label class="stk-pw"><input type="number" min="0" max="100" step="5" data-stk-w="${p.poolId}" value="${S.w[p.poolId] || ""}" placeholder="0"${me() ? "" : " disabled"}><em>%</em></label></div>`; }).join("") || `<div class="stk-empty">${T(pools.length ? "No pool matches." : "Pools show up here once staking is live.")}</div>`}</div>`;
    const ok = me() && S.me && S.me.ve > 0 && sum > 0 && sum <= 100 && picked <= 8;
    h += `<div class="stk-vfoot"><span class="${sum > 100 || picked > 8 ? "bad" : ""}">${T("Your split")}: <b data-no-i18n>${sum}%</b> · <b data-no-i18n>${picked}</b>/8 ${T("pools")}${S.me && S.me.ve > 0 ? ` · <b data-no-i18n>${fmt(S.me.ve, 0)}</b> veARCIRCLE` : ""}</span><button type="button" class="stk-btn go" data-stk-act="vote"${ok && live() ? "" : " disabled"}>${T("Vote")}</button></div>`;
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
    h += `<details class="stk-more"${S.openFund ? " open" : ""} data-stk-det="fund"><summary>${T("Fund this week")}</summary>
      <p class="stk-note">${T("Anyone can add USDC to this week's rewards — the treasury does it every week. It goes to whoever held veARCIRCLE when this week began.")}</p>
      ${usdcBal != null ? `<div class="stk-avail"><span>${T("In your wallet")}</span><b data-no-i18n>${fmt(usdcBal, 2)} USDC</b></div>` : ""}
      <label class="stk-f"><span class="stk-in"><input id="stk-fund" type="text" inputmode="decimal" autocomplete="off" placeholder="${tr_ && tr_.owed > 0 ? fmt(tr_.owed, 2) : "0"}" value="${esc(S.fundAmt)}"><em data-no-i18n>USDC</em></span></label>
      <button type="button" class="stk-btn go" data-stk-act="fund"${live() && me() ? "" : " disabled"}>${T("Fund")}</button></details>`;
    return h + `<p class="stk-msg ${S.msg.fund ? S.msg.fund.cls : ""}" aria-live="polite">${S.msg.fund ? S.msg.fund.h : ""}</p></section>`;
  }
  function stakersCard() {
    const list = (S.st && S.st.stakers) || [];
    if (!list.length) return "";
    return `<section class="ams-card stk-card stk-top"><h3>${T("Biggest locks")}</h3><ol>${list.slice(0, 10).map((x, i) => `<li><span data-no-i18n>#${i + 1}</span><a href="${EXPL("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${short(x.a)}${lc(x.a) === me() ? ` (${tr("you")})` : ""}</a><b data-no-i18n>${big(x.amount)}</b><em data-no-i18n>${day(x.end)}</em></li>`).join("")}</ol></section>`;
  }
  function render() {
    if (!body) return;
    const focus = document.activeElement && document.activeElement.id && body.contains(document.activeElement) ? { id: document.activeElement.id, s: document.activeElement.selectionStart } : null;
    const wFocus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.stkW;
    const pre = !S.loaded ? `<div class="stk-empty">…</div>` : !live() ? `<div class="stk-soon"><b>${T("Opens soon")}</b><span>${T("The veARCIRCLE contract is being deployed. Everything below shows how it will work — the buttons switch on when it's live.")}</span></div>` : "";
    body.innerHTML = `${pre}${stats()}<div class="stk-grid">${lockCard()}${rewardsCard()}</div>${voteCard()}<div class="stk-grid">${treasuryCard()}${stakersCard()}</div>`;
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.s); } catch { /* number */ } } }
    if (wFocus) { const el = body.querySelector(`[data-stk-w="${wFocus}"]`); if (el) el.focus(); }
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
      NotLonger: "The new unlock date has to be later than the current one.", NoLock: "You need a running lock (veARCIRCLE) for that.", BadVote: "Check your split: up to 8 pools, 100% at most.", ZeroAmount: "Enter an amount." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const say = (k, h, cls = "") => { S.msg[k] = { h, cls }; const card = { lock: ".stk-lock", rew: ".stk-rew", vote: ".stk-vote", fund: ".stk-tre" }[k]; const p = body.querySelector(`${card} .stk-msg`); if (p) { p.className = "stk-msg " + cls; p.innerHTML = h; } };
  const txLink = (h) => `<a href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>`;
  async function run(k, fn) {
    if (S.busy) { say(k, T("One moment — your last transaction is still confirming."), "err"); return; }
    S.busy = true;
    try {
      const sg = await signer();
      const c = new ethers.Contract(S.st.address, ABI, sg);
      const h = await fn(c, sg);
      if (h) say(k, `${T("Done")} · ${txLink(h)}`, "ok");
      await refresh();
    } catch (e) { say(k, esc(errText(e)), "err"); }
    finally { S.busy = false; }
  }
  async function approve(sg, token, need, label, k) {
    const t = new ethers.Contract(token, ERC20, sg);
    const have = await t.allowance(await sg.getAddress(), S.st.address);
    if (have >= need) return;
    say(k, T(label));
    await (await t.approve(S.st.address, need)).wait();
  }
  const num = (v) => Number(String(v || "").replace(/,/g, "")) || 0;
  async function act(a) {
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(refresh).catch(() => {}); return; }
    if (!live()) return;
    if (a === "lock") return run("lock", async (c, sg) => {
      const amt = ethers.parseEther(String(num(S.amt))), end = endFor(S.dur);
      await approve(sg, ARCIRCLE(), amt, "Approve the $ARCIRCLE in your wallet…", "lock");
      say("lock", T("Confirm the lock in your wallet…"));
      const tx = await c.createLock(amt, end); await tx.wait(); S.amt = ""; return tx.hash;
    });
    if (a === "add") return run("lock", async (c, sg) => {
      const amt = ethers.parseEther(String(num(S.add)));
      await approve(sg, ARCIRCLE(), amt, "Approve the $ARCIRCLE in your wallet…", "lock");
      say("lock", T("Confirm in your wallet…"));
      const tx = await c.increaseAmount(amt); await tx.wait(); S.add = ""; return tx.hash;
    });
    if (a === "extend") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.increaseUnlockTime(endFor(S.ext)); await tx.wait(); return tx.hash; });
    if (a === "withdraw") return run("lock", async (c) => { say("lock", T("Confirm in your wallet…")); const tx = await c.withdraw(); await tx.wait(); return tx.hash; });
    if (a === "claim") return run("rew", async (c) => { say("rew", T("Confirm in your wallet…")); const tx = await c.claim(); await tx.wait(); return tx.hash; });
    if (a === "vote") return run("vote", async (c) => {
      const e = Object.entries(S.w).filter(([, v]) => Number(v) > 0);
      say("vote", T("Confirm your vote in your wallet…"));
      const tx = await c.vote(e.map(([p]) => p), e.map(([, v]) => Math.round(Number(v) * 100))); await tx.wait(); S.wTouched = false; return tx.hash;
    });
    if (a === "fund") return run("fund", async (c, sg) => {
      const v = num(S.fundAmt) || (S.st.treasury && S.st.treasury.owed) || 0;
      if (!(v > 0)) throw new Error("ZeroAmount");
      const amt = ethers.parseUnits(v.toFixed(6), 6);
      await approve(sg, USDC(), amt, "Approve the USDC in your wallet…", "fund");
      say("fund", T("Confirm in your wallet…"));
      const tx = await c.fund(amt); await tx.wait(); S.fundAmt = ""; return tx.hash;
    });
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.stkAct) { act(b.dataset.stkAct); return; }
    if (b.dataset.stkDur) { S.dur = Number(b.dataset.stkDur); render(); return; }
    if (b.dataset.stkExt) { S.ext = Number(b.dataset.stkExt); render(); return; }
    if (b.dataset.stkPct && S.bal.arc != null) { const v = (S.bal.arc * BigInt(b.dataset.p)) / 100n; const s = ethers.formatEther(v); if (b.dataset.stkPct === "amt") S.amt = s; else S.add = s; render(); }
  });
  body.addEventListener("toggle", (e) => { const d = e.target.closest && e.target.closest("[data-stk-det]"); if (!d) return; const k = d.dataset.stkDet; if (k === "add") S.openAdd = d.open; if (k === "ext") S.openExt = d.open; if (k === "fund") S.openFund = d.open; }, true);
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "stk-amt") { S.amt = t.value; render(); }
    else if (t.id === "stk-add") { S.add = t.value; render(); }
    else if (t.id === "stk-fund") S.fundAmt = t.value;
    else if (t.id === "stk-q") { S.q = t.value; render(); }
    else if (t.dataset.stkW) { S.w[t.dataset.stkW] = Math.max(0, Math.min(100, Number(t.value) || 0)); S.wTouched = true; const f = body.querySelector(".stk-vfoot"); if (f) render(); }
  });

  // ---------------- life ----------------
  let timer = null, acct = null;
  async function tick() {
    if (S.busy) return;
    const typing = document.activeElement && body.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName);
    if (me() !== acct) { acct = me(); S.wTouched = false; await loadMe(); if (!typing) render(); return; }
    if (!typing) await refresh();
  }
  function show() {
    if (!S.booted) { S.booted = true; render(); acct = me(); refresh(); }
    clearInterval(timer);
    timer = setInterval(tick, 15000);
    setTimeout(tick, 2500);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "staking") show(); else clearInterval(timer); });
  document.addEventListener("arc:lang", () => { if (S.booted) render(); });
  const lede = panel.querySelector(".stk-hero .bp-lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("open"));
  if (panel.classList.contains("active")) show();
  window.arcStaking = { get state() { return S; }, refresh };
})();
