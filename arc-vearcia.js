/* global CONFIG, ethers, state, connectWallet */
// arc-vearcia.js — veARCIA (arcpad.html#vearcia; contracts/ArciaStaking.sol on Robinhood Chain; api/_vearcia.mjs).
//   · stake $ARCIA for 1–20 days → veARCIA = amount × 1.0x…2.0x; one position per wallet, adding or renewing restarts
//     the lock (never earlier than it would end); an ended lock counts 1.0x until renewed
//   · $ARCIA rewards stream from the reward pool over 20 days, shared every second by reward weight
//     (veARCIA × the $ARCIRCLE boost); claim any time
//   · early withdrawal: time left ÷ the lock's length, at most 50%, burned — shown before signing
//   · the $ARCIRCLE boost (1.2x / 1.5x / 2.0x from 1M / 5M / 10M, Arc + veARCIRCLE + Robinhood Chain): the site signs
//     a 7-day note (GET /api/social?veboost=0x…) and the wallet applies it
// Reads go straight to Robinhood Chain; the wallet switches there for transactions. Until CONFIG.VEARCIA_ADDRESS is
// set the page explains it, previews the numbers and checks the boost, with the buttons off.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-vearcia");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const body = $("vea-body");
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const CF = (k, d) => (typeof CONFIG !== "undefined" && CONFIG[k]) || d;
  const P = CF("PONS", {}) || {};
  const CHAIN = 4663, CHAIN_HEX = "0x" + CHAIN.toString(16);
  const RPC = () => CF("ROBINHOOD_RPC", P.RPC || "https://rpc.mainnet.chain.robinhood.com");
  const EXPL = () => CF("ROBINHOOD_EXPLORER", P.EXPLORER || "https://robinhoodchain.blockscout.com");
  const ADD = () => ({ chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPC()], blockExplorerUrls: [EXPL()], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } });
  const ADDR = () => { const a = CF("VEARCIA_ADDRESS", ""); return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : ""; };
  const ARCIA = () => CF("ARCIA_RH_TOKEN", "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25");
  const DAY = 86400, MAXD = 20, BPS = 10000;
  const BOOST = [10000, 12000, 15000, 20000], TIER_MIN = [0, 1e6, 5e6, 1e7];
  const lockBps = (d) => BPS + Math.floor(((d - 1) * BPS) / 19);
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const nowS = () => Math.floor(Date.now() / 1000);
  const F = (w) => (w == null ? null : Number(ethers.formatEther(w)));
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e4 ? fmt(n / 1e3, 1) + "K" : fmt(n, n < 1 ? 4 : 2));
  const pct = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e4 ? fmt(n / 1000, 0) + "K%" : fmt(n, n < 10 ? 2 : 1) + "%");
  const mult = (bps) => (bps / BPS).toFixed(2).replace(/0$/, "") + "x";
  const left = (s) => { s = Math.max(0, s); const d = Math.floor(s / DAY), h = Math.floor((s % DAY) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const when = (t) => (t ? new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  const ABI = [
    "function stats() view returns (uint256 pool, uint256 perDay, uint256 finish, uint256 staked, uint256 ve, uint256 weight, uint256 streamed, uint256 claimed, uint256 burned)",
    "function positions(address) view returns (uint128 amount, uint64 start, uint64 end, uint16 lockBps, uint8 tier, uint64 boostUntil, uint64 boostIssued, uint256 ve, uint256 weight, uint256 paid, uint256 owed)",
    "function earned(address) view returns (uint256)", "function penaltyOf(address,uint256) view returns (uint256 penalty, uint256 bps)", "function owner() view returns (address)",
    "function stake(uint256 amount, uint256 days_)", "function withdraw(uint256 amount)", "function claim() returns (uint256)",
    "function applyBoost(address user, uint8 tier, uint64 issued, uint64 until, bytes sig)", "function fund(uint256 amount)", "function defund(uint256 amount)",
    "error NotOwner()", "error ZeroAmount()", "error BadDays()", "error ShorterLock()", "error NoStake()", "error TooMuch()", "error BadBoost()", "error StaleBoost()",
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const ERR = {
    ShorterLock: "Your lock already runs longer than that — pick at least as many days as are left.",
    ZeroAmount: "Enter an amount first.", TooMuch: "That's more than you can take out.", BadDays: "Pick 1 to 20 days.",
    BadBoost: "That boost note isn't valid any more — refresh it.", StaleBoost: "A newer boost is already applied.", NotOwner: "Only the owner wallet can do that.",
  };
  const S = { st: null, pos: null, earned: null, bal: null, allow: null, owner: null, boost: null, days: 20, amt: "", wamt: "", poolAmt: "", busy: false, msg: {}, at: 0, loaded: false };

  // ---------------- chain ----------------
  let rp = null;
  const rpc = () => (rp = rp || new ethers.JsonRpcProvider(RPC(), ethers.Network.from(CHAIN), { staticNetwork: true, batchMaxCount: 1 }));
  const rd = (a, abi) => new ethers.Contract(a, abi, rpc());
  async function toRobinhood() {
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) { if (Number(acc.chainId) !== CHAIN) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CHAIN, addEthereumChainParameter: ADD() }); return; }
      } catch (e) { if (rejected(e)) throw e; }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
    if (Number.parseInt(await p.request({ method: "eth_chainId" }), 16) === CHAIN) return;
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) { if (rejected(e)) throw e; await p.request({ method: "wallet_addEthereumChain", params: [ADD()] }); await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }).catch(() => {}); }
  }
  async function signer() {
    window.arcChainSwitching = true;
    try { sessionStorage.setItem("wallet.autoSwitch." + me(), "1"); } catch { /* fine */ }
    await toRobinhood();
    const bp = new ethers.BrowserProvider(walletProv(), "any");
    for (let i = 0; i < 6; i++) { if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me()); await new Promise((r) => setTimeout(r, 500)); }
    throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
  }
  function why(err) {
    if (rejected(err)) return tr("You rejected the request in your wallet.");
    const data = err && (err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data));
    if (data) { try { const e = new ethers.Interface(ABI).parseError(data); if (e) return tr(ERR[e.name] || e.name); } catch { /* not ours */ } }
    const m = String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    const hit = Object.keys(ERR).find((k) => m.includes(k));
    if (hit) return tr(ERR[hit]);
    if (/insufficient funds/i.test(m)) return tr("Not enough ETH on Robinhood Chain for gas.");
    return m.slice(0, 180);
  }

  // ---------------- data ----------------
  async function load() {
    const a = ADDR(), u = me();
    const jobs = [];
    if (a) {
      const C = rd(a, ABI);
      jobs.push(C.stats().then((r) => { S.st = { pool: r[0], perDay: r[1], finish: Number(r[2]), staked: r[3], ve: r[4], weight: r[5], streamed: r[6], claimed: r[7], burned: r[8] }; }).catch(() => {}));
      jobs.push(C.owner().then((o) => { S.owner = lc(o); }).catch(() => {}));
      if (u) {
        jobs.push(C.positions(u).then((p) => { S.pos = { amount: p.amount, start: Number(p.start), end: Number(p.end), lockBps: Number(p.lockBps), tier: Number(p.tier), boostUntil: Number(p.boostUntil), ve: p.ve, weight: p.weight }; }).catch(() => {}));
        jobs.push(C.earned(u).then((e) => { S.earned = e; }).catch(() => {}));
        const t = rd(ARCIA(), ERC20);
        jobs.push(t.balanceOf(u).then((b) => { S.bal = b; }).catch(() => {}));
        jobs.push(t.allowance(u, a).then((x) => { S.allow = x; }).catch(() => {}));
      }
    } else if (u) {
      jobs.push(rd(ARCIA(), ERC20).balanceOf(u).then((b) => { S.bal = b; }).catch(() => {}));
    }
    if (u && (!S.boost || S.boost.wallet !== u || Date.now() - S.boostAt > 5 * 60e3)) jobs.push(loadBoost());
    await Promise.all(jobs);
    if (!u) { S.pos = S.earned = S.bal = S.allow = null; S.boost = null; }
    S.at = nowS(); S.loaded = true;
  }
  async function loadBoost() {
    const u = me(); if (!u) return;
    try { const r = await fetch(`/api/social?veboost=${u}`, { cache: "no-store" }); const j = await r.json(); if (me() === u) { S.boost = j && j.ok ? j : null; S.boostAt = Date.now(); } } catch { /* keep */ }
  }

  // ---------------- maths ----------------
  const tierOn = () => (S.pos && S.pos.tier && S.pos.boostUntil > nowS() ? S.pos.tier : 0);
  const tierCan = () => (S.boost && S.boost.ok ? Number(S.boost.tier) || 0 : 0);
  /// the reward weight a position of `amt` $ARCIA locked `d` days would have, and its share of today's stream
  function preview(addWei, d) {
    const st = S.st, pos = S.pos;
    const amt = (pos ? pos.amount : 0n) + addWei;
    const lb = lockBps(d), boost = BOOST[Math.max(tierOn(), tierCan())];
    const ve = (amt * BigInt(lb)) / 10000n, w = (ve * BigInt(boost)) / 10000n;
    const others = st ? st.weight - (pos ? pos.weight : 0n) : 0n;
    const tot = others + w;
    const perDay = st ? F(st.perDay) : null;
    const daily = perDay != null && tot > 0n ? perDay * (Number(w) / Number(tot)) : null;
    const apr = daily != null && amt > 0n ? ((daily * 365) / F(amt)) * 100 : null;
    return { amt, ve, w, lb, boost, daily, apr };
  }
  /// the yearly rate for one $ARCIA at a given total multiplier, with today's stream and stakers
  function aprAt(m) {
    const st = S.st; if (!st || !(st.weight > 0n)) return null;
    return ((F(st.perDay) * 365 * m) / F(st.weight)) * 100;
  }
  function liveEarned() {
    if (S.earned == null || !S.st || !S.pos || !(S.st.weight > 0n)) return S.earned == null ? null : F(S.earned);
    const t = nowS(), to = Math.min(t, S.st.finish);
    const dt = Math.max(0, to - S.at);
    return F(S.earned) + (F(S.st.perDay) / DAY) * dt * (Number(S.pos.weight) / Number(S.st.weight));
  }
  function penaltyNow(amtWei) {
    const p = S.pos; if (!p || !(p.end > nowS()) || !(p.end > p.start)) return { bps: 0, pen: 0n };
    let bps = Math.floor(((p.end - nowS()) * BPS) / (p.end - p.start));
    if (bps > 5000) bps = 5000;
    return { bps, pen: (amtWei * BigInt(bps)) / 10000n };
  }
  const parse = (s) => { try { const v = ethers.parseEther(String(s || "").replace(/,/g, "").trim() || "0"); return v > 0n ? v : 0n; } catch { return 0n; } };
  const minDays = () => { const p = S.pos; if (!p || !(p.amount > 0n) || !(p.end > nowS())) return 1; return Math.min(MAXD, Math.max(1, Math.ceil((p.end - nowS()) / DAY))); };

  // ---------------- paint ----------------
  function paint() {
    if (!body) return;
    const live = !!ADDR(), u = me(), st = S.st;
    const statBox = (k, v, sub, cls = "") => `<div class="vea-stat ${cls}"><span>${T(k)}</span><b data-no-i18n>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const lo = aprAt(1), hi = aprAt(4);
    let h = "";
    if (!live) h += `<div class="vea-soon"><b>${T("Opening soon on Robinhood Chain")}</b><span>${T("Preview the numbers and check your $ARCIRCLE boost now — staking opens when the contract is live.")}</span></div>`;
    h += `<div class="vea-stats">
      ${statBox("Reward pool", st ? big(F(st.pool)) + " <i>$ARCIA</i>" : "—", st && st.finish > nowS() ? T("streams out over 20 days") : "")}
      ${statBox("Daily rewards", st ? big(F(st.perDay)) + " <i>$ARCIA</i>" : "—", T("shared by every staker"), "hl")}
      ${statBox("Yearly rate", lo != null ? `${pct(lo)} – ${pct(hi)}` : "—", T("1 day, no boost → 20 days, 2.0x boost"), "apr")}
      ${statBox("Total staked", st ? big(F(st.staked)) + " <i>$ARCIA</i>" : "—", st ? `${big(F(st.ve))} veARCIA` : "")}
      ${statBox("Burned by early exits", st ? big(F(st.burned)) + " <i>$ARCIA</i>" : "—", "")}
    </div>`;
    h += `<div class="vea-grid">${stakeCard(live)}${posCard(live)}</div>`;
    h += boostCard(live);
    if (live && u && S.owner && u === S.owner) h += ownerCard();
    body.innerHTML = h;
    tick();
  }
  function stakeCard(live) {
    const u = me(), pos = S.pos, has = pos && pos.amount > 0n;
    const add = parse(S.amt), md = minDays();
    if (S.days < md) S.days = md;
    const pv = preview(add, S.days);
    const unlock = nowS() + S.days * DAY;
    const marks = [1, 5, 10, 15, 20];
    const needApprove = live && add > 0n && S.allow != null && S.allow < add;
    const btn = !u ? `<button type="button" class="vea-go" data-vea="connect">${T("Connect wallet")}</button>`
      : !live ? `<button type="button" class="vea-go" disabled>${T("Opens soon")}</button>`
      : add > 0n ? `<button type="button" class="vea-go" data-vea="stake"${S.busy ? " disabled" : ""}>${T(needApprove ? "Approve and stake" : "Stake")}</button>`
      : has ? `<button type="button" class="vea-go ghost" data-vea="renew"${S.busy ? " disabled" : ""}>${T("Renew the lock")} · ${S.days}${T("d")}</button>`
      : `<button type="button" class="vea-go" disabled>${T("Enter an amount")}</button>`;
    return `<section class="ams-card vea-card vea-stake">
      <h3>${T(has ? "Add or renew" : "Stake $ARCIA")}</h3>
      <label class="vea-in"><span>${T("Amount")}</span><input id="vea-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.amt)}"><em>$ARCIA</em>
        ${S.bal != null ? `<button type="button" class="ams-mini" data-vea="max">${T("Max")}</button>` : ""}</label>
      <p class="vea-bal">${S.bal != null ? `${T("Wallet")}: <b data-no-i18n>${big(F(S.bal))}</b> $ARCIA <small>${T("on Robinhood Chain")}</small>` : u ? "" : T("Connect a wallet to stake.")}</p>
      <div class="vea-lock">
        <div class="vea-lock-h"><span>${T("Lock")}</span><b data-no-i18n>${S.days} ${tr(S.days === 1 ? "day" : "days")}</b><em class="vea-x" data-no-i18n>${mult(pv.lb)}</em></div>
        <input type="range" id="vea-days" min="1" max="${MAXD}" step="1" value="${S.days}" aria-label="${T("Lock length in days")}" style="--p:${((S.days - 1) / 19) * 100}%">
        <div class="vea-marks">${marks.map((d) => `<button type="button" data-vea-d="${d}" class="${d === S.days ? "on" : ""}${d < md ? " off" : ""}"${d < md ? " disabled" : ""} data-no-i18n>${d}d · ${mult(lockBps(d))}</button>`).join("")}</div>
        ${has && pos.end > nowS() ? `<p class="vea-note">${T("Adding or renewing restarts your lock from now; it can't end earlier than it does now")} (${T("at least")} <b data-no-i18n>${md}</b>${T("d")}).</p>` : ""}
      </div>
      <dl class="vea-sum">
        <div><dt>${T("veARCIA")}</dt><dd data-no-i18n>${big(F(pv.ve))}</dd></div>
        <div><dt>${T("Reward weight")}</dt><dd data-no-i18n>${big(F(pv.w))} <small>${mult(pv.lb)} × ${mult(pv.boost)}</small></dd></div>
        <div><dt>${T("Est. daily rewards")}</dt><dd class="g" data-no-i18n>${pv.daily != null && pv.amt > 0n ? big(pv.daily) + " $ARCIA" : "—"}</dd></div>
        <div><dt>${T("Est. yearly rate")}</dt><dd class="g" data-no-i18n>${pv.apr != null ? pct(pv.apr) : "—"}</dd></div>
        <div><dt>${T("Unlocks")}</dt><dd data-no-i18n>${when(unlock)}</dd></div>
      </dl>
      ${btn}
      <p class="vea-msg ${esc((S.msg.stake || {}).k || "")}" id="vea-msg-stake">${esc((S.msg.stake || {}).t || "")}</p>
      <p class="vea-fine">${T("Staking is free. Estimates use today's rewards and stakers; they change as those do. Not financial advice.")}</p>
    </section>`;
  }
  function posCard(live) {
    const u = me(), p = S.pos;
    if (!u) return `<section class="ams-card vea-card vea-pos vea-empty"><h3>${T("Your veARCIA")}</h3><p>${T("Connect a wallet to see your stake, rewards and lock.")}</p><button type="button" class="vea-go ghost" data-vea="connect">${T("Connect wallet")}</button></section>`;
    if (!live || !p || !(p.amount > 0n) && !(S.earned > 0n)) return `<section class="ams-card vea-card vea-pos vea-empty"><h3>${T("Your veARCIA")}</h3><p>${T("Nothing staked yet. Pick an amount and a lock — 20 days gets 2.0x.")}</p>${S.earned > 0n ? claimRow() : ""}</section>`;
    const t = nowS(), running = p.end > t;
    const w = parse(S.wamt), pen = penaltyNow(w);
    const total = p.end - p.start, leftS = Math.max(0, p.end - t);
    const pr = total > 0 ? Math.min(100, ((total - leftS) / total) * 100) : 100;
    return `<section class="ams-card vea-card vea-pos">
      <h3>${T("Your veARCIA")}</h3>
      <div class="vea-big"><b data-no-i18n>${big(F(p.ve))}</b><span>veARCIA</span><em data-no-i18n>${mult(p.lockBps || BPS)}${tierOn() ? " × " + mult(BOOST[tierOn()]) : ""}</em></div>
      <dl class="vea-sum">
        <div><dt>${T("Staked")}</dt><dd data-no-i18n>${big(F(p.amount))} $ARCIA</dd></div>
        <div><dt>${T("Reward weight")}</dt><dd data-no-i18n>${big(F(p.weight))}</dd></div>
        <div><dt>${T("Share of the stream")}</dt><dd data-no-i18n>${S.st && S.st.weight > 0n ? pct((Number(p.weight) / Number(S.st.weight)) * 100) : "—"}</dd></div>
      </dl>
      <div class="vea-lockbar${running ? "" : " done"}"><div><span>${T(running ? "Unlocks in" : "Lock ended")}</span><b data-no-i18n data-vea-left="${p.end}">${running ? left(leftS) : when(p.end)}</b></div><i style="--p:${pr}%"></i>
        ${running ? "" : `<small>${T("Counts 1.0x until you renew — or withdraw for free.")}</small>`}</div>
      ${claimRow()}
      <div class="vea-wd">
        <label class="vea-in sm"><span>${T("Withdraw")}</span><input id="vea-wamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.wamt)}"><em>$ARCIA</em><button type="button" class="ams-mini" data-vea="wmax">${T("Max")}</button></label>
        ${running ? `<p class="vea-pen${pen.bps >= 5000 ? " cap" : ""}">${T("Withdrawing now costs")} <b data-no-i18n>${(pen.bps / 100).toFixed(2)}%</b> — ${T("time left ÷ the lock's length")} (<span data-no-i18n>${left(leftS)} ÷ ${Math.round(total / DAY)}d</span>), ${T("at most 50%")}.${w > 0n ? ` ${T("You get")} <b data-no-i18n>${big(F(w - pen.pen))}</b> $ARCIA · <b data-no-i18n>${big(F(pen.pen))}</b> ${T("burned")}.` : ""}</p>`
          : `<p class="vea-pen free">${T("Your lock has ended: withdrawing is free.")}</p>`}
        <button type="button" class="vea-go ${running ? "warn" : "ghost"}" data-vea="withdraw"${S.busy || !(w > 0n) ? " disabled" : ""}>${T(running ? "Withdraw early" : "Withdraw")}</button>
        <p class="vea-msg ${esc((S.msg.wd || {}).k || "")}">${esc((S.msg.wd || {}).t || "")}</p>
      </div>
    </section>`;
  }
  function claimRow() {
    return `<div class="vea-claim"><div><span>${T("Rewards earned")}</span><b data-no-i18n id="vea-earned">${big(liveEarned())}</b><i>$ARCIA</i></div>
      <button type="button" class="vea-go sm" data-vea="claim"${S.busy || !(S.earned > 0n) ? " disabled" : ""}>${T("Claim")}</button></div>
      <p class="vea-msg ${esc((S.msg.claim || {}).k || "")}">${esc((S.msg.claim || {}).t || "")}</p>`;
  }
  function boostCard(live) {
    const u = me(), b = S.boost, on = tierOn(), can = tierCan();
    const held = b ? Number(b.held) : null;
    const tiers = [0, 1, 2, 3].map((i) => {
      const reached = held != null && held >= TIER_MIN[i];
      return `<li class="${i === on ? "on" : ""}${reached ? " ok" : ""}"><b data-no-i18n>${mult(BOOST[i])}</b><span data-no-i18n>${i ? big(TIER_MIN[i]) + " $ARCIRCLE" : tr("No boost")}</span></li>`;
    }).join("");
    let act = "";
    if (!u) act = `<p class="vea-fine">${T("Connect a wallet to check your $ARCIRCLE.")}</p>`;
    else if (!b) act = `<p class="vea-fine">${T("Checking your $ARCIRCLE…")}</p>`;
    else {
      const parts = b.parts || {};
      act = `<p class="vea-held">${T("You hold")} <b data-no-i18n>${big(held)}</b> $ARCIRCLE <small data-no-i18n>(Arc ${big(Number(parts.arc))} · veARCIRCLE ${big(Number(parts.staked))} · Robinhood ${big(Number(parts.robinhood))})</small>${b.next ? ` · <span>${T("next tier at")} <b data-no-i18n>${big(Number(b.next))}</b></span>` : ""}</p>`;
      const exp = S.pos && S.pos.boostUntil ? S.pos.boostUntil : 0;
      const soon = on && exp - nowS() < 2 * DAY;
      if (!live) act += `<p class="vea-fine">${T("Your boost applies once staking opens.")}</p>`;
      else if (!b.signed) act += `<p class="vea-fine">${esc(tr(b.reason || "The boost can't be signed right now."))}</p>`;
      else if (can !== on || soon) act += `<button type="button" class="vea-go sm" data-vea="boost"${S.busy ? " disabled" : ""}>${T(can > on ? "Apply my boost" : can < on ? "Update my boost" : "Refresh my boost")} · ${mult(BOOST[can])}</button>`;
      if (live && on) act += `<p class="vea-fine">${T("Applied")} ${mult(BOOST[on])} · ${T("lasts until")} <span data-no-i18n>${when(exp)}</span></p>`;
      act += `<p class="vea-msg ${esc((S.msg.boost || {}).k || "")}">${esc((S.msg.boost || {}).t || "")}</p>`;
    }
    return `<section class="ams-card vea-card vea-boost"><h3>${T("$ARCIRCLE boost")}</h3><p class="vea-fine">${T("Holding $ARCIRCLE multiplies your reward weight. Counted on Arc (wallet + ARCIRCLE Staking) and Robinhood Chain; a boost lasts 7 days.")}</p><ol class="vea-tiers">${tiers}</ol>${act}</section>`;
  }
  function ownerCard() {
    return `<section class="ams-card vea-card vea-owner"><h3>${T("Reward pool")} <small>${T("owner")}</small></h3>
      <label class="vea-in sm"><span>${T("Amount")}</span><input id="vea-pamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.poolAmt)}"><em>$ARCIA</em></label>
      <div class="vea-row"><button type="button" class="vea-go sm" data-vea="fund"${S.busy ? " disabled" : ""}>${T("Add to the pool")}</button><button type="button" class="vea-go sm ghost" data-vea="defund"${S.busy ? " disabled" : ""}>${T("Take back")}</button></div>
      <p class="vea-fine">${T("The daily rate becomes the pool ÷ 20 days after either.")}</p>
      <p class="vea-msg ${esc((S.msg.pool || {}).k || "")}">${esc((S.msg.pool || {}).t || "")}</p></section>`;
  }
  function tick() {
    const e = $("vea-earned"); if (e) e.textContent = big(liveEarned());
    panel.querySelectorAll("[data-vea-left]").forEach((el) => { const end = Number(el.dataset.veaLeft); if (end > nowS()) el.textContent = left(end - nowS()); });
  }

  // ---------------- actions ----------------
  const say = (k, t, kind = "") => { S.msg[k] = { t, k: kind }; paint(); };
  async function send(k, fn, ok) {
    if (S.busy) return;
    S.busy = true; say(k, tr("Confirm in your wallet…"));
    try {
      const sg = await signer();
      await fn(sg);
      say(k, ok, "ok");
      await load(); paint();
    } catch (err) { say(k, why(err), "bad"); }
    finally { S.busy = false; window.arcChainSwitching = false; paint(); }
  }
  // Robinhood Chain confirms in about a second: ask for the receipt every second instead of the wallet's slower polling
  async function wait(tx, k) {
    say(k, tr("Waiting for Robinhood Chain…"));
    for (let i = 0; i < 180; i++) {
      const rc = await rpc().getTransactionReceipt(tx.hash).catch(() => null);
      if (rc) { if (rc.status !== 1) throw new Error(tr("The transaction failed.")); return rc; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const rc = await tx.wait();
    if (!rc || rc.status !== 1) throw new Error(tr("The transaction failed."));
    return rc;
  }
  async function doStake(renew) {
    const add = renew ? 0n : parse(S.amt);
    if (!renew && !(add > 0n)) return say("stake", tr("Enter an amount first."), "bad");
    if (!renew && S.bal != null && add > S.bal) return say("stake", tr("That's more $ARCIA than the wallet holds."), "bad");
    await send("stake", async (sg) => {
      const a = ADDR();
      if (add > 0n) {
        const t = new ethers.Contract(ARCIA(), ERC20, sg);
        const al = await rd(ARCIA(), ERC20).allowance(me(), a);
        if (al < add) { say("stake", tr("Step 1 of 2 — approve $ARCIA in your wallet…")); await wait(await t.approve(a, add), "stake"); say("stake", tr("Step 2 of 2 — confirm the stake…")); }
      }
      await wait(await new ethers.Contract(a, ABI, sg).stake(add, S.days), "stake");
      S.amt = "";
    }, renew ? tr("Lock renewed.") : tr("Staked — your veARCIA is earning."));
  }
  async function doWithdraw() {
    const w = parse(S.wamt);
    if (!(w > 0n)) return;
    await send("wd", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).withdraw(w), "wd"); S.wamt = ""; }, tr("Withdrawn."));
  }
  async function doClaim() { await send("claim", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).claim(), "claim"); }, tr("Rewards claimed.")); }
  async function doBoost() {
    await loadBoost();
    const b = S.boost;
    if (!b || !b.signed) return say("boost", (b && b.reason) || tr("The boost can't be signed right now."), "bad");
    await send("boost", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).applyBoost(me(), b.tier, b.issued, b.until, b.signature), "boost"); S.boost = null; }, tr("Boost applied."));
  }
  async function doPool(dir) {
    const v = parse(S.poolAmt); if (!(v > 0n)) return say("pool", tr("Enter an amount first."), "bad");
    await send("pool", async (sg) => {
      const a = ADDR(), C = new ethers.Contract(a, ABI, sg);
      if (dir === "fund") {
        const al = await rd(ARCIA(), ERC20).allowance(me(), a);
        if (al < v) await wait(await new ethers.Contract(ARCIA(), ERC20, sg).approve(a, v), "pool");
        await wait(await C.fund(v), "pool");
      } else await wait(await C.defund(v), "pool");
      S.poolAmt = "";
    }, tr("Done."));
  }

  panel.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-vea], [data-vea-d]");
    if (!b || b.disabled) return;
    if (b.dataset.veaD) { S.days = Number(b.dataset.veaD); paint(); return; }
    const k = b.dataset.vea;
    if (k === "connect") { if (typeof connectWallet === "function") connectWallet(); return; }
    if (k === "max") { if (S.bal != null) { S.amt = ethers.formatEther(S.bal); paint(); } return; }
    if (k === "wmax") { if (S.pos) { S.wamt = ethers.formatEther(S.pos.amount); paint(); } return; }
    if (k === "stake") doStake(false);
    else if (k === "renew") doStake(true);
    else if (k === "withdraw") doWithdraw();
    else if (k === "claim") doClaim();
    else if (k === "boost") doBoost();
    else if (k === "fund" || k === "defund") doPool(k);
  });
  // typing keeps focus: re-render only the summary-bearing cards after a pause
  let typeT = 0;
  panel.addEventListener("input", (e) => {
    const id = e.target && e.target.id;
    if (id === "vea-days") { S.days = Number(e.target.value) || 1; e.target.style.setProperty("--p", ((S.days - 1) / 19) * 100 + "%"); clearTimeout(typeT); typeT = setTimeout(() => keep(paint), 120); return; }
    if (id === "vea-amt") S.amt = e.target.value;
    else if (id === "vea-wamt") S.wamt = e.target.value;
    else if (id === "vea-pamt") { S.poolAmt = e.target.value; return; }
    else return;
    clearTimeout(typeT); typeT = setTimeout(() => keep(paint), 350);
  });
  function keep(fn) {
    const a = document.activeElement, id = a && a.id, s = a && a.selectionStart;
    fn();
    if (id) { const n = $(id); if (n) { n.focus(); try { if (s != null) n.setSelectionRange(s, s); } catch { /* range input */ } } }
  }

  // ---------------- lifecycle ----------------
  let timer = 0, clock = 0;
  async function show() {
    S.acct = me();
    if (!S.loaded) paint();
    await load(); paint();
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(async () => { if (!panel.classList.contains("active") || document.hidden || S.busy) return; await load(); keep(paint); }, 20000);
    clock = setInterval(async () => {
      if (!panel.classList.contains("active") || document.hidden) return;
      if (me() !== S.acct) { S.acct = me(); S.boost = null; S.msg = {}; await load(); keep(paint); return; } // connected, disconnected or switched
      tick();
    }, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "vearcia") show(); else { clearInterval(timer); clearInterval(clock); } });
  document.addEventListener("arc:lang", () => { if (S.loaded) paint(); });
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) panel.querySelectorAll(".vea-guide details[open]").forEach((d) => d.removeAttribute("open"));
  if (panel.classList.contains("active")) show();
  window.arcVeArcia = { state: S, load, paint, preview, lockBps };
})();
