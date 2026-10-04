/* global CONFIG, ethers, state, connectWallet */
// arc-vearcia.js — veARCIA (arcpad.html#vearcia; contracts/ArciaStaking.sol on Robinhood Chain; api/_vearcia.mjs).
//   · stake $ARCIA for 1–20 days → veARCIA = amount × 1.0x…2.0x; one position per wallet, adding or renewing restarts
//     the lock (never earlier than it would end); auto-renew keeps the lock (and its multiplier) running; an ended lock
//     counts 1.0x until renewed
//   · rewards stream from reward pools over 20 days ($ARCIA, plus any extra token), shared every second by reward weight
//     (veARCIA × the $ARCIRCLE boost); claim or compound any time
//   · early withdrawal: time left ÷ the lock's length, at most 50% (auto-renew: 50%), burned — shown before signing
//   · the $ARCIRCLE boost (1.2x / 1.5x / 2.0x from 1M / 5M / 10M, Arc + veARCIRCLE + Robinhood Chain): the site signs a
//     3-day note (GET /api/social?veboost=0x…) and the wallet applies it
//   · veARCIA tiers (Bronze 10K · Silver 100K · Gold 1M · Diamond 5M) unlock ARCIA perks; the top 20; the pool's history;
//     a wallet's last actions and share card (/vearcia/<wallet>) — GET /api/desk?vearcia=state · ?vearcia=me&u=0x…
// Reads go straight to Robinhood Chain; the wallet switches there for transactions. Until CONFIG.VEARCIA_ADDRESS is set
// the page explains it, previews the numbers and checks the boost, with the buttons off.
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
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const CF = (k, d) => (typeof CONFIG !== "undefined" && CONFIG[k]) || d;
  const P = CF("PONS", {}) || {};
  const CHAIN = 4663, CHAIN_HEX = "0x" + CHAIN.toString(16);
  const RPC = () => CF("ROBINHOOD_RPC", P.RPC || "https://rpc.mainnet.chain.robinhood.com");
  const EXPL = () => CF("ROBINHOOD_EXPLORER", P.EXPLORER || "https://robinhoodchain.blockscout.com");
  const ADD = () => ({ chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPC()], blockExplorerUrls: [EXPL()], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } });
  const ADDR = () => { const a = CF("VEARCIA_ADDRESS", ""); return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : ""; };
  const ARCIA = () => CF("ARCIA_RH_TOKEN", "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25");
  const SITE = () => (location && /^https?:/.test(location.origin) ? location.origin : "https://www.arcircle.app");
  const DAY = 86400, MAXD = 20, BPS = 10000;
  const BOOST = [10000, 12000, 15000, 20000], TIER_MIN = [0, 1e6, 5e6, 1e7];
  const VT = [["", 0], ["Bronze", 1e4], ["Silver", 1e5], ["Gold", 1e6], ["Diamond", 5e6]];
  const VT_PERK = ["", "+100", "+200", "+400", "+800"];
  const veTier = (ve) => { let t = 0; for (let i = 1; i < VT.length; i++) if (ve >= VT[i][1]) t = i; return t; };
  const lockBps = (d) => BPS + Math.floor(((d - 1) * BPS) / 19);
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
  const F = (w) => (w == null ? null : Number(ethers.formatEther(w)));
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e4 ? fmt(n / 1e3, 1) + "K" : fmt(n, n < 1 ? 4 : 2));
  const pct = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e4 ? fmt(n / 1000, 0) + "K%" : fmt(n, n < 10 ? 2 : 1) + "%");
  const mult = (bps) => (bps / BPS).toFixed(2).replace(/0$/, "") + "x";
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  const ABI = [
    "function stats() view returns (uint256 pool, uint256 perDay, uint256 finish, uint256 staked, uint256 ve, uint256 weight, uint256 streamed, uint256 claimed, uint256 burned)",
    "function positions(address) view returns (uint128 amount, uint64 start, uint64 end, uint16 lockBps, uint16 lockDays, bool autoRenew, uint8 tier, uint64 boostUntil, uint64 boostIssued, uint256 ve, uint256 weight)",
    "function earnedAll(address) view returns (uint256[])", "function owner() view returns (address)", "function stakers() view returns (uint256)",
    "function streamCount() view returns (uint256)", "function streamInfo(uint256) view returns (address token, uint256 left_, uint256 perDay_, uint256 finish_, uint256 streamed_, uint256 claimed_)",
    "function stake(uint256 amount, uint256 days_)", "function withdraw(uint256 amount)", "function claim() returns (uint256)", "function compound() returns (uint256)", "function setAutoRenew(bool on)",
    "function applyBoost(address user, uint8 tier, uint64 issued, uint64 until, bytes sig)", "function fund(uint256 amount)", "function defund(uint256 amount)",
    "error NotOwner()", "error ZeroAmount()", "error BadDays()", "error ShorterLock()", "error NoStake()", "error HasStake()", "error TooMuch()", "error BadBoost()", "error StaleBoost()", "error BadToken()", "error BadStream()",
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"];
  const ERR = {
    ShorterLock: "Your lock already runs longer than that — pick at least as many days as are left.",
    ZeroAmount: "Enter an amount first.", TooMuch: "That's more than you can take out.", BadDays: "Pick 1 to 20 days.", NoStake: "Stake some $ARCIA first.",
    BadBoost: "That boost note isn't valid any more — refresh it.", StaleBoost: "A newer boost is already applied.", NotOwner: "Only the owner wallet can do that.",
  };
  const S = { st: null, pos: null, earned: null, bal: null, allow: null, eth: null, owner: null, extra: [], boost: null, srv: null, mine: null, days: 20, amt: "", wamt: "", poolAmt: "",
    busy: false, msg: {}, at: 0, skew: 0, loaded: false, tab: store.get("vea.tab", "stake"), autoPref: store.get("vea.auto", false), once: store.get("vea.once", false), flip: null, flame: false, histOpen: false };
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);
  const left = (s) => { s = Math.max(0, s); const d = Math.floor(s / DAY), h = Math.floor((s % DAY) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const when = (t) => (t ? new Date((t - (S.skew || 0)) * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const ago = (t) => { const d = Math.max(0, nowS() - t); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < DAY ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / DAY)}d`; };

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
      jobs.push(C.stakers().then((n) => { S.stakers = Number(n); }).catch(() => {}));
      jobs.push(C.streamCount().then(async (n) => {
        const out = [];
        for (let i = 1; i < Number(n); i++) {
          const x = await C.streamInfo(i);
          const old = S.extra.find((e) => e.i === i);
          let sym = old && old.sym, dec = old && old.dec;
          if (sym == null) { const t = rd(x.token, ERC20); [sym, dec] = await Promise.all([t.symbol().catch(() => "?"), t.decimals().then(Number).catch(() => 18)]); }
          out.push({ i, token: x.token, sym, dec, perDay: Number(x.perDay_) / 10 ** dec, finish: Number(x.finish_) });
        }
        S.extra = out;
      }).catch(() => {}));
      jobs.push(rpc().getBlock("latest").then((b) => { if (b && b.timestamp) S.skew = Number(b.timestamp) - Math.floor(Date.now() / 1000); }).catch(() => {}));
      if (u) {
        jobs.push(C.positions(u).then((p) => { S.pos = { amount: p.amount, start: Number(p.start), end: Number(p.end), lockBps: Number(p.lockBps), lockDays: Number(p.lockDays), auto: !!p.autoRenew, tier: Number(p.tier), boostUntil: Number(p.boostUntil), ve: p.ve, weight: p.weight }; }).catch(() => {}));
        jobs.push(C.earnedAll(u).then((e) => { S.earnedAll = [...e]; S.earned = e[0]; }).catch(() => {}));
        const t = rd(ARCIA(), ERC20);
        jobs.push(t.balanceOf(u).then((b) => { S.bal = b; }).catch(() => {}));
        jobs.push(t.allowance(u, a).then((x) => { S.allow = x; }).catch(() => {}));
        jobs.push(rpc().getBalance(u).then((b) => { S.eth = F(b); }).catch(() => {}));
      }
    } else if (u) {
      jobs.push(rd(ARCIA(), ERC20).balanceOf(u).then((b) => { S.bal = b; }).catch(() => {}));
    }
    if (u && (!S.boost || S.boost.wallet !== u || Date.now() - S.boostAt > 5 * 60e3)) jobs.push(loadBoost());
    await Promise.all(jobs);
    if (!u) { S.pos = S.earned = S.bal = S.allow = S.eth = null; S.boost = S.mine = null; S.earnedAll = null; }
    S.at = nowS(); S.loaded = true;
    if (a) loadSrv(); // the server's view (top 20, history) arrives a moment later
  }
  async function loadSrv() {
    const u = me();
    try { const r = await fetch("/api/desk?vearcia=state", { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.live) { S.srv = j; keep(paint); } } catch { /* optional */ }
    if (u) try { const r = await fetch(`/api/desk?vearcia=me&u=${u}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.ok && me() === u) { S.mine = j; keep(paint); } } catch { /* optional */ }
  }
  async function loadBoost() {
    const u = me(); if (!u) return;
    try { const r = await fetch(`/api/social?veboost=${u}`, { cache: "no-store" }); const j = await r.json(); if (me() === u) { S.boost = j && j.ok ? j : null; S.boostAt = Date.now(); } } catch { /* keep */ }
  }

  // ---------------- maths ----------------
  const tierOn = () => (S.pos && S.pos.tier && S.pos.boostUntil > nowS() ? S.pos.tier : 0);
  const tierCan = () => (S.boost && S.boost.ok ? Number(S.boost.tier) || 0 : 0);
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
  const aprAt = (m) => { const st = S.st; if (!st || !(st.weight > 0n)) return null; return ((F(st.perDay) * 365 * m) / F(st.weight)) * 100; };
  const myDaily = () => (S.st && S.pos && S.st.weight > 0n && S.st.finish > nowS() ? F(S.st.perDay) * (Number(S.pos.weight) / Number(S.st.weight)) : 0);
  function liveEarned() {
    if (S.earned == null) return null;
    if (!S.st || !S.pos || !(S.st.weight > 0n)) return F(S.earned);
    const to = Math.min(nowS(), S.st.finish), dt = Math.max(0, to - S.at);
    return F(S.earned) + (myDaily() / DAY) * dt;
  }
  function penaltyNow(amtWei) {
    const p = S.pos; if (!p || !(p.amount > 0n)) return { bps: 0, pen: 0n };
    let bps;
    if (p.auto) bps = 5000;
    else { if (!(p.end > nowS()) || !(p.end > p.start)) return { bps: 0, pen: 0n }; bps = Math.floor(((p.end - nowS()) * BPS) / (p.end - p.start)); if (bps > 5000) bps = 5000; }
    return { bps, pen: (amtWei * BigInt(bps)) / 10000n };
  }
  const parse = (s) => { try { const v = ethers.parseEther(String(s || "").replace(/,/g, "").trim() || "0"); return v > 0n ? v : 0n; } catch { return 0n; } };
  const minDays = () => { const p = S.pos; if (!p || !(p.amount > 0n)) return 1; if (p.auto) return Math.max(1, p.lockDays); if (!(p.end > nowS())) return 1; return Math.min(MAXD, Math.max(1, Math.ceil((p.end - nowS()) / DAY))); };
  const running = () => S.pos && S.pos.amount > 0n && (S.pos.auto || S.pos.end > nowS());

  // ---------------- paint ----------------
  function paint() {
    if (!body) return;
    const live = !!ADDR(), u = me(), st = S.st;
    const statBox = (k, v, sub, cls = "") => `<div class="vea-stat ${cls}"><span>${T(k)}</span><b data-no-i18n>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const lo = aprAt(1), hi = aprAt(4);
    const count = S.stakers != null ? S.stakers : S.srv ? S.srv.totals.stakers : null;
    let h = "";
    if (!live) h += `<div class="vea-soon"><b>${T("Opening soon on Robinhood Chain")}</b><span>${T("Preview the numbers and check your $ARCIRCLE boost now — staking opens when the contract is live.")}</span>
      <button type="button" class="ams-mini" data-vea="notify">${T(store.get("vea.notify", false) ? "We'll let you know" : "Notify me when it opens")}</button><a class="ams-mini" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener">Telegram /vearciaalerts</a></div>`;
    h += flowCard(live);
    h += `<div class="vea-stats">
      ${statBox("Reward pool", st ? big(F(st.pool)) + " <i>$ARCIA</i>" : "—", st && st.finish > nowS() ? T("streams out over 20 days") : "")}
      ${statBox("Daily rewards", st ? big(F(st.perDay)) + " <i>$ARCIA</i>" : "—", S.extra.filter((x) => x.perDay > 0).map((x) => `+ ${esc(big(x.perDay))} ${esc(x.sym)}`).join(" · ") || T("shared by every staker"), "hl")}
      ${statBox("Yearly rate", lo != null ? `${pct(lo)} – ${pct(hi)}` : "—", lo != null ? `${pct(lo / 365)} – ${pct(hi / 365)} ${T("a day")} · ${T("not fixed")}` : T("1 day, no boost → 20 days, 2.0x boost"), "apr")}
      ${statBox("Total staked", st ? big(F(st.staked)) + " <i>$ARCIA</i>" : "—", st ? `${big(F(st.ve))} veARCIA${count != null ? ` · ${count} ${tr(count === 1 ? "staker" : "stakers")}` : ""}` : "")}
      ${statBox("Burned by early exits", st ? big(F(st.burned)) + " <i>$ARCIA</i>" : "—", "")}
    </div>`;
    const claimPill = live && u && S.earned != null && S.earned > 0n ? `<button type="button" class="vea-tabclaim" data-vea="claim"${S.busy ? " disabled" : ""}>${T("Claim")} <b data-no-i18n class="vea-earned-mini">${big(liveEarned())}</b></button>` : "";
    h += `<nav class="vea-tabs" role="tablist">${[["stake", "Stake"], ["pos", "My veARCIA"], ["boost", "Boost"], ["top", "Top"]].map(([k, l]) => `<button type="button" role="tab" data-vtab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}${claimPill}</nav>`;
    h += `<div class="vea-sections vt-${esc(S.tab)}">
      <div class="vea-grid">${stakeCard(live)}${posCard(live)}</div>
      <div class="vea-grid g2">${boostCard(live)}${perksCard()}</div>
      <div class="vea-grid g3">${topCard(live)}${historyCard(live)}</div>
    </div>`;
    if (live && u && S.owner && u === S.owner) h += ownerCard();
    body.innerHTML = h;
    tick();
    if (S.popX) { const x = body.querySelector(".vea-x"); if (x && !reduce()) { x.classList.add("pop"); if (S.days === MAXD) x.classList.add("max"); } S.popX = false; }
  }

  // the stream: the pool's ring (days left of the 20) → dots flowing → stakers
  function flowCard(live) {
    const st = S.st, now = nowS();
    const daysLeft = st && st.finish > now ? (st.finish - now) / DAY : 0;
    const frac = Math.max(0, Math.min(1, daysLeft / 20));
    const R = 46, C = 2 * Math.PI * R;
    const paused = !live || !st || !(st.weight > 0n) || !(st.finish > now) || !(st.perDay > 0n);
    const tops = (S.srv && S.srv.top) || [];
    const dots = tops.slice(0, 5).map((x, i) => `<i style="--i:${i};${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(x.a) : ""}" title="${esc(short(x.a))}"></i>`).join("") || [0, 1, 2].map((i) => `<i class="ghost" style="--i:${i}"></i>`).join("");
    return `<section class="vea-flow${paused ? " paused" : ""}" aria-label="${T("The reward stream")}">
      <div class="vea-ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${R}" class="trk"/><circle cx="55" cy="55" r="${R}" class="val" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/></svg>
        <div><b data-no-i18n>${st && daysLeft > 0 ? "D-" + Math.ceil(daysLeft) : "—"}</b><span>${T("reward pool")}</span></div></div>
      <div class="vea-stream" aria-hidden="true"><svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 30 C 120 -5, 260 65, 400 30" class="vea-path"/></svg>${Array.from({ length: 9 }, (_, i) => `<span class="vea-dot" style="--d:${i}"></span>`).join("")}</div>
      <div class="vea-crowd"><div class="vea-av">${dots}</div><b data-no-i18n>${st ? big(F(st.perDay)) : "—"} <i>$ARCIA</i></b><span>${T(paused ? (live ? "the stream waits for stakers" : "opens soon") : "a day, every second")}</span></div>
    </section>`;
  }

  // APR against lock length, for the amount being typed (or a sample 10,000)
  function curve(add) {
    const amt = add > 0n || (S.pos && S.pos.amount > 0n) ? add : ethers.parseEther("10000");
    const pts = []; let max = 0;
    for (let d = 1; d <= MAXD; d++) { const a = preview(amt, d).apr; pts.push(a); if (a != null && a > max) max = a; }
    if (!(max > 0)) {
      const m = Array.from({ length: MAXD }, (_, i) => lockBps(i + 1) / BPS);
      const W = 300, H = 64, x = (i) => 6 + (i * (W - 12)) / (MAXD - 1), y = (v) => H - 8 - ((v - 1) / 1) * (H - 18);
      return `<svg class="vea-curve" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${m.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/><circle cx="${x(S.days - 1).toFixed(1)}" cy="${y(m[S.days - 1]).toFixed(1)}" r="5"/><text x="6" y="12">${T("multiplier")}</text></svg>`;
    }
    const W = 300, H = 64, x = (i) => 6 + (i * (W - 12)) / (MAXD - 1), y = (v) => H - 8 - (v / max) * (H - 18);
    const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join(" ");
    return `<svg class="vea-curve" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon points="6,${H - 8} ${line} ${W - 6},${H - 8}" class="fill"/><polyline points="${line}"/><circle cx="${x(S.days - 1).toFixed(1)}" cy="${y(pts[S.days - 1] || 0).toFixed(1)}" r="5"/><text x="6" y="12">${T("est. yearly rate by lock")}</text></svg>`;
  }

  function stakeCard(live) {
    const u = me(), pos = S.pos, has = pos && pos.amount > 0n;
    const add = parse(S.amt), md = minDays();
    if (S.days < md) S.days = md;
    const pv = preview(add, S.days);
    const unlock = nowS() + S.days * DAY;
    const marks = [1, 5, 10, 15, 20];
    const needApprove = live && add > 0n && S.allow != null && S.allow < add;
    const lowEth = live && u && S.eth != null && S.eth < 0.0002;
    const btn = !u ? `<button type="button" class="vea-go" data-vea="connect">${T("Connect wallet")}</button>`
      : !live ? `<button type="button" class="vea-go" disabled>${T("Opens soon")}</button>`
      : add > 0n ? `<button type="button" class="vea-go" data-vea="stake"${S.busy ? " disabled" : ""}>${T(needApprove ? "Approve and stake" : "Stake")}</button>`
      : has ? `<button type="button" class="vea-go ghost" data-vea="renew"${S.busy ? " disabled" : ""}>${T("Renew the lock")} · ${S.days}${T("d")}</button>`
      : `<button type="button" class="vea-go" disabled>${T("Enter an amount")}</button>`;
    return `<section class="ams-card vea-card vea-stake" data-vt="stake">
      <h3>${T(has ? "Add or renew" : "Stake $ARCIA")}</h3>
      <label class="vea-in"><span>${T("Amount")}</span><input id="vea-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.amt)}"><em>$ARCIA</em>
        ${S.bal != null ? `<button type="button" class="ams-mini" data-vea="max">${T("Max")}</button>` : ""}</label>
      <p class="vea-bal">${S.bal != null ? `${T("Wallet")}: <b data-no-i18n>${big(F(S.bal))}</b> $ARCIA <small>${T("on Robinhood Chain")}</small>` : u ? "" : T("Connect a wallet to stake.")}
        <a href="#orders?c=rh&t=${esc(ARCIA())}" class="vea-get">${T("Get $ARCIA")} →</a></p>
      ${lowEth ? `<p class="vea-warn">${T("You need a little ETH on Robinhood Chain for gas — bridge some or withdraw it from an exchange to this wallet.")}</p>` : ""}
      <div class="vea-lock">
        <div class="vea-lock-h"><span>${T("Lock")}</span><b data-no-i18n>${S.days} ${tr(S.days === 1 ? "day" : "days")}</b><em class="vea-x${S.days === MAXD ? " top" : ""}" data-no-i18n>${mult(pv.lb)}</em></div>
        <input type="range" id="vea-days" min="1" max="${MAXD}" step="1" value="${S.days}" aria-label="${T("Lock length in days")}" style="--p:${((S.days - 1) / 19) * 100}%">
        <div class="vea-marks">${marks.map((d) => `<button type="button" data-vea-d="${d}" class="${d === S.days ? "on" : ""}${d < md ? " off" : ""}"${d < md ? " disabled" : ""} data-no-i18n>${d}d · ${mult(lockBps(d))}</button>`).join("")}</div>
        ${curve(add)}
        ${has && running() ? `<p class="vea-note">${T(pos.auto ? "Auto-renew is on: pick at least your current length." : "Adding or renewing restarts your lock from now; it can't end earlier than it does now")}${pos.auto ? "" : ` (${T("at least")} <b data-no-i18n>${md}</b>${T("d")}).`}</p>` : ""}
      </div>
      <dl class="vea-sum">
        <div><dt>${T("veARCIA")}</dt><dd data-no-i18n>${big(F(pv.ve))}</dd></div>
        <div><dt>${T("Reward weight")}</dt><dd data-no-i18n>${big(F(pv.w))} <small>${mult(pv.lb)} × ${mult(pv.boost)}</small></dd></div>
        <div><dt>${T("Est. daily rewards")}</dt><dd class="g" data-no-i18n>${pv.daily != null && pv.amt > 0n ? big(pv.daily) + " $ARCIA" : "—"}</dd></div>
        <div><dt>${T("Est. yearly rate")}</dt><dd class="g" data-no-i18n>${pv.apr != null ? `${pct(pv.apr)} <small>${pct(pv.apr / 365)}/${tr("day")}</small>` : "—"}</dd></div>
        <div><dt>${T("Unlocks")}</dt><dd data-no-i18n>${has && pos.auto ? tr("auto-renew") : when(unlock)}</dd></div>
        <div><dt>${T("veARCIA tier")}</dt><dd data-no-i18n>${veTier(F(pv.ve)) ? `<span class="vea-tb t${veTier(F(pv.ve))}">${esc(VT[veTier(F(pv.ve))][0])}</span>` : "—"}</dd></div>
      </dl>
      ${has && pos.auto ? "" : `<label class="vea-chk"><input type="checkbox" id="vea-autopref"${S.autoPref ? " checked" : ""}><span>${T("Auto-renew after staking — keeps the multiplier; turn it off any time to start the countdown")}</span></label>`}
      ${btn}
      <label class="vea-chk sm"><input type="checkbox" id="vea-once"${S.once ? " checked" : ""}><span>${T("Approve once — no approval step next time")}</span></label>
      <p class="vea-msg ${esc((S.msg.stake || {}).k || "")}" id="vea-msg-stake">${esc((S.msg.stake || {}).t || "")}</p>
      <p class="vea-fine">${T("Staking is free. Estimates use today's rewards and stakers; they change as those do. Not financial advice.")}</p>
    </section>`;
  }

  // start → now → end, with the early-exit cost falling from 50% to 0 over the lock
  function timeline(p) {
    if (p.auto) return `<div class="vea-tl auto"><span>${T("Auto-renew is on")}</span><b data-no-i18n>${p.lockDays}d · ${mult(p.lockBps || BPS)}</b><small>${T("The lock keeps running; an early exit costs 50%. Turn auto-renew off to start the countdown.")}</small></div>`;
    const t = nowS(), total = Math.max(1, p.end - p.start), x = Math.min(1, Math.max(0, (t - p.start) / total));
    const W = 300, H = 56, X = (f) => 4 + f * (W - 8), Y = (pc) => H - 14 - (pc / 50) * (H - 26);
    const curveD = `M${X(0)},${Y(50)} L${X(0.5)},${Y(50)} L${X(1)},${Y(0)}`;
    const ended = t >= p.end;
    return `<div class="vea-tl${ended ? " done" : ""}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${curveD} L${X(1)},${H - 14} L${X(0)},${H - 14}Z" class="area"/><path d="${curveD}" class="cost"/><line x1="${X(0)}" x2="${X(1)}" y1="${H - 14}" y2="${H - 14}" class="base"/><line x1="${X(0)}" x2="${X(x)}" y1="${H - 14}" y2="${H - 14}" class="done"/><line x1="${X(x)}" x2="${X(x)}" y1="6" y2="${H - 8}" class="now"/><circle cx="${X(x)}" cy="${H - 14}" r="5" class="now"/>
        <text x="${X(0)}" y="${H - 1}">${esc(when(p.start))}</text><text x="${X(1)}" y="${H - 1}" text-anchor="end">${esc(when(p.end))}</text><text x="${X(0) + 2}" y="10">${T("early-exit cost")} 50% → 0%</text></svg>
      <div><span>${T(ended ? "Lock ended" : "Unlocks in")}</span><b data-no-i18n data-vea-left="${p.end}">${ended ? when(p.end) : left(p.end - t)}</b></div>
      ${ended ? `<small>${T("Counts 1.0x until you renew — or withdraw for free.")}</small>` : ""}</div>`;
  }

  function posCard(live) {
    const u = me(), p = S.pos;
    if (!u) return `<section class="ams-card vea-card vea-pos vea-empty" data-vt="pos"><h3>${T("Your veARCIA")}</h3><p>${T("Connect a wallet to see your stake, rewards and lock.")}</p><button type="button" class="vea-go ghost" data-vea="connect">${T("Connect wallet")}</button></section>`;
    if (!live || !p || !(p.amount > 0n) && !(S.earned > 0n)) return `<section class="ams-card vea-card vea-pos vea-empty" data-vt="pos"><h3>${T("Your veARCIA")}</h3><p>${T("Nothing staked yet. Pick an amount and a lock — 20 days gets 2.0x.")}</p>${S.earned > 0n ? claimRow() : ""}</section>`;
    const w = parse(S.wamt), pen = penaltyNow(w), run = running();
    const ve = F(p.ve), vt = veTier(ve);
    const daily = myDaily();
    const toEnd = p.auto ? null : Math.max(0, p.end - nowS());
    const recv = w > 0n ? F(w - pen.pen) : null, burn = w > 0n ? F(pen.pen) : null;
    const sharePct = w > 0n ? (pen.bps / 100) : 0;
    return `<section class="ams-card vea-card vea-pos" data-vt="pos">
      <h3>${T("Your veARCIA")} ${vt ? `<span class="vea-tb t${vt}">${esc(VT[vt][0])}</span>` : ""}${S.mine && S.mine.rank ? `<small data-no-i18n>#${S.mine.rank}</small>` : ""}
        <button type="button" class="ams-mini vea-share" data-vea="share">${T("Share")}</button></h3>
      <div class="vea-big"><b data-no-i18n>${big(ve)}</b><span>veARCIA</span><em data-no-i18n>${mult(p.lockBps || BPS)}${tierOn() ? " × " + mult(BOOST[tierOn()]) : ""}</em></div>
      <dl class="vea-sum">
        <div><dt>${T("Staked")}</dt><dd data-no-i18n>${big(F(p.amount))} $ARCIA</dd></div>
        <div><dt>${T("Share of the stream")}</dt><dd data-no-i18n>${S.st && S.st.weight > 0n ? pct((Number(p.weight) / Number(S.st.weight)) * 100) : "—"}</dd></div>
        <div><dt>${T("Your daily rewards")}</dt><dd class="g" data-no-i18n>${big(daily)} $ARCIA</dd></div>
        <div><dt>${T(p.auto ? "Next 20 days" : "Until it unlocks")}</dt><dd class="g" data-no-i18n>≈ ${big(daily * Math.min(20, p.auto ? 20 : toEnd / DAY))} $ARCIA</dd></div>
        ${S.mine && S.mine.received > 0 ? `<div><dt>${T("Received so far")}</dt><dd data-no-i18n>${big(S.mine.received)} $ARCIA</dd></div>` : ""}
      </dl>
      ${timeline(p)}
      <label class="vea-switch"><input type="checkbox" data-vea="auto"${p.auto ? " checked" : ""}${S.busy ? " disabled" : ""}><i aria-hidden="true"></i><span><b>${T("Auto-renew")}</b><small>${T(p.auto ? "On — your multiplier never runs out. Turning it off starts the full countdown." : "Keep the lock (and its multiplier) running until you turn it off.")}</small></span></label>
      ${claimRow()}
      <div class="vea-wd">
        <label class="vea-in sm"><span>${T("Withdraw")}</span><input id="vea-wamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.wamt)}"><em>$ARCIA</em><button type="button" class="ams-mini" data-vea="wmax">${T("Max")}</button></label>
        ${run ? `<p class="vea-pen${pen.bps >= 5000 ? " cap" : ""}">${T("Withdrawing now costs")} <b data-no-i18n>${(pen.bps / 100).toFixed(2)}%</b> — ${T(p.auto ? "auto-renew is on" : "time left ÷ the lock's length")}${p.auto ? "" : ` (<span data-no-i18n>${left(p.end - nowS())} ÷ ${Math.round((p.end - p.start) / DAY)}d</span>)`}, ${T("at most 50%")}.</p>`
          : `<p class="vea-pen free">${T("Your lock has ended: withdrawing is free.")}</p>`}
        ${w > 0n ? `<div class="vea-split${S.flame ? " burning" : ""}" aria-label="${T("You get")} ${esc(big(recv))} · ${T("burned")} ${esc(big(burn))}"><i class="get" style="--w:${100 - sharePct}%"><span>${T("You get")} <b data-no-i18n>${big(recv)}</b></span></i>${burn > 0 ? `<i class="burn" style="--w:${sharePct}%"><span data-no-i18n>${big(burn)}</span></i>` : ""}</div>` : S.flame ? `<div class="vea-split burning"><i class="burn" style="--w:100%"><span>${T("burned")}</span></i></div>` : ""}
        <button type="button" class="vea-go ${run ? "warn" : "ghost"}" data-vea="withdraw"${S.busy || !(w > 0n) ? " disabled" : ""}>${T(run ? "Withdraw early" : "Withdraw")}</button>
        <p class="vea-msg ${esc((S.msg.wd || {}).k || "")}">${esc((S.msg.wd || {}).t || "")}</p>
      </div>
    </section>`;
  }
  function claimRow() {
    const ex = (S.extra || []).map((x) => { const v = S.earnedAll && S.earnedAll[x.i] != null ? Number(S.earnedAll[x.i]) / 10 ** x.dec : 0; return v > 0 ? `<span data-no-i18n>+ ${esc(big(v))} ${esc(x.sym)}</span>` : ""; }).join("");
    return `<div class="vea-claim"><div><span>${T("Rewards earned")}</span><b data-no-i18n id="vea-earned">${big(liveEarned())}</b><i>$ARCIA</i>${ex ? `<em class="vea-ex">${ex}</em>` : ""}</div>
      <div class="vea-claim-b"><button type="button" class="vea-go sm ghost" data-vea="compound"${S.busy || !(S.earned > 0n) || !(S.pos && S.pos.amount > 0n) ? " disabled" : ""} title="${T("Add your $ARCIA rewards to your stake — same lock, no tokens move")}">${T("Compound")}</button>
      <button type="button" class="vea-go sm" data-vea="claim"${S.busy || !(S.earned > 0n) ? " disabled" : ""}>${T("Claim")}</button></div></div>
      <p class="vea-msg ${esc((S.msg.claim || {}).k || "")}">${esc((S.msg.claim || {}).t || "")}</p>`;
  }
  function boostCard(live) {
    const u = me(), b = S.boost, on = tierOn(), can = tierCan();
    const held = b ? Number(b.held) : null;
    const tiers = [0, 1, 2, 3].map((i) => {
      const reached = held != null && held >= TIER_MIN[i];
      return `<li class="${i === on ? "on" : ""}${reached ? " ok" : ""}${S.flip === i ? " flip" : ""}"><b data-no-i18n>${mult(BOOST[i])}</b><span data-no-i18n>${i ? big(TIER_MIN[i]) + " $ARCIRCLE" : tr("No boost")}</span></li>`;
    }).join("");
    let act = "";
    if (!u) act = `<p class="vea-fine">${T("Connect a wallet to check your $ARCIRCLE.")}</p>`;
    else if (!b) act = `<p class="vea-fine">${T("Checking your $ARCIRCLE…")}</p>`;
    else {
      const parts = b.parts || {};
      const nextAt = b.next ? Number(b.next) : null, prevAt = TIER_MIN[can] || 0;
      const prog = nextAt ? Math.max(0, Math.min(100, ((held - prevAt) / (nextAt - prevAt)) * 100)) : 100;
      act = `<p class="vea-held">${T("You hold")} <b data-no-i18n>${big(held)}</b> $ARCIRCLE <small data-no-i18n>(Arc ${big(Number(parts.arc))} · veARCIRCLE ${big(Number(parts.staked))} · Robinhood ${big(Number(parts.robinhood))})</small></p>
        <div class="vea-prog"><i style="--p:${prog.toFixed(1)}%"></i><span>${nextAt ? `${T("next tier")} ${mult(BOOST[can + 1])}: <b data-no-i18n>${big(Math.max(0, nextAt - held))}</b> $ARCIRCLE ${T("to go")}` : T("Top tier reached")}</span></div>`;
      const exp = S.pos && S.pos.boostUntil ? S.pos.boostUntil : 0;
      const soon = on && exp - nowS() < DAY;
      if (!live) act += `<p class="vea-fine">${T("Your boost applies once staking opens.")}</p>`;
      else if (!b.signed) act += `<p class="vea-fine">${esc(tr(b.reason || "The boost can't be signed right now."))}</p>`;
      else if (can !== on || soon) act += `<button type="button" class="vea-go sm" data-vea="boost"${S.busy ? " disabled" : ""}>${T(can > on ? "Apply my boost" : can < on ? "Update my boost" : "Refresh my boost")} · ${mult(BOOST[can])}</button>`;
      if (live && on) act += `<p class="vea-fine">${T("Applied")} ${mult(BOOST[on])} · ${T("lasts until")} <span data-no-i18n>${when(exp)}</span></p>`;
      act += `<p class="vea-msg ${esc((S.msg.boost || {}).k || "")}">${esc((S.msg.boost || {}).t || "")}</p>`;
    }
    return `<section class="ams-card vea-card vea-boost" data-vt="boost"><h3>${T("$ARCIRCLE boost")}</h3><p class="vea-fine">${T("Holding $ARCIRCLE multiplies your reward weight. Counted on Arc (wallet + ARCIRCLE Staking) and Robinhood Chain; a boost lasts 3 days and the page refreshes it.")}</p><ol class="vea-tiers">${tiers}</ol>${act}</section>`;
  }
  function perksCard() {
    const ve = S.pos ? F(S.pos.ve) : 0, vt = veTier(ve);
    const next = vt < 4 ? VT[vt + 1] : null;
    return `<section class="ams-card vea-card vea-perks" data-vt="boost"><h3>${T("veARCIA tiers")}</h3>
      <ol class="vea-vt">${VT.slice(1).map(([n, v], i) => `<li class="t${i + 1}${vt === i + 1 ? " on" : ""}${ve >= v ? " ok" : ""}"><span class="vea-tb t${i + 1}">${esc(n)}</span><b data-no-i18n>${big(v)}</b><small>${T("ARCIA chat")} <b data-no-i18n>${VT_PERK[i + 1]}</b> ${T("messages a day")} · ${T("badge on comments")}</small></li>`).join("")}</ol>
      ${next && ve > 0 ? `<p class="vea-fine">${T("Next")}: <b>${esc(next[0])}</b> — <b data-no-i18n>${big(next[1] - ve)}</b> veARCIA ${T("to go")}</p>` : ""}
      <p class="vea-fine">${T("veARCIA is recorded over time for the votes to come — the ARCIA AI ecosystem and its governance.")}</p></section>`;
  }
  function topCard(live) {
    const top = (S.srv && S.srv.top) || [], u = me();
    const rows = top.length ? top.map((x) => `<li class="${x.a === u ? "me" : ""}"><em data-no-i18n>${x.rank}</em><span class="vea-avs" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(x.a) : ""}"></span><a href="${esc(EXPL())}/address/${esc(x.a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(x.a))}</a>${x.veTier ? `<span class="vea-tb t${x.veTier}">${esc(VT[x.veTier][0])}</span>` : ""}<b data-no-i18n>${big(x.ve)}</b><small data-no-i18n>${x.auto ? tr("auto") : x.lockDays + "d"}${x.tier ? " · " + mult(BOOST[x.tier]) : ""}</small></li>`).join("")
      : `<li class="vea-none">${T(live ? "The first stakers show here." : "Opens soon.")}</li>`;
    return `<section class="ams-card vea-card vea-top" data-vt="top"><h3>${T("Top veARCIA")} ${S.srv ? `<small data-no-i18n>${S.srv.totals.stakers} ${tr("stakers")}</small>` : ""}</h3><ol class="vea-lb">${rows}</ol></section>`;
  }
  function historyCard(live) {
    const pools = ((S.srv && S.srv.pools) || []).filter((p) => p.t);
    let chart = `<p class="vea-fine">${T(live ? "The daily rewards show here as they change." : "Opens soon.")}</p>`;
    if (pools.length >= 1) {
      const pts = [...pools.map((p) => ({ t: p.t, v: p.perDay })), { t: nowS(), v: S.st ? F(S.st.perDay) : pools[pools.length - 1].perDay }];
      const t0 = pts[0].t, t1 = Math.max(t0 + 1, pts[pts.length - 1].t), vmax = Math.max(...pts.map((p) => p.v), 1);
      const W = 300, H = 90, X = (t) => 6 + ((t - t0) / (t1 - t0)) * (W - 12), Y = (v) => H - 16 - (v / vmax) * (H - 30);
      let d = `M${X(pts[0].t).toFixed(1)},${Y(pts[0].v).toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i].t).toFixed(1)} V${Y(pts[i].v).toFixed(1)}`;
      chart = `<svg class="vea-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Daily rewards over time")}"><path d="${d} V${H - 16} H${X(pts[0].t).toFixed(1)}Z" class="fill"/><path d="${d}" class="line"/>
        <text x="6" y="12">${esc(big(vmax))} $ARCIA/${esc(tr("day"))}</text><text x="6" y="${H - 2}">${esc(new Date((t0 - S.skew) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</text><text x="${W - 6}" y="${H - 2}" text-anchor="end">${T("now")}</text></svg>`;
    }
    const hist = (S.mine && S.mine.history) || [];
    const name = { stake: "Staked", withdraw: "Withdrew", compound: "Compounded", claim: "Claimed", boost: "Boost", auto: "Auto-renew" };
    const rows = hist.slice(0, 10).map((r) => `<li><span>${T(name[r.kind] || r.kind)}</span><b data-no-i18n>${r.amount != null ? big(r.amount) + " $ARCIA" : r.kind === "boost" ? mult(BOOST[r.tier] || BPS) : r.kind === "auto" ? (r.on ? "on" : "off") : r.raw ? "" : ""}${r.penalty > 0 ? ` <small>(${big(r.penalty)} ${tr("burned")})</small>` : ""}${r.days ? ` <small>${r.days}d</small>` : ""}</b><a href="${esc(EXPL())}/tx/${esc(r.tx)}" target="_blank" rel="noopener" data-no-i18n>${r.t ? esc(ago(r.t)) : "↗"}</a></li>`).join("");
    return `<section class="ams-card vea-card vea-histc" data-vt="top"><h3>${T("Daily rewards over time")}</h3>${chart}
      ${me() ? `<details class="vea-acts"${S.histOpen ? " open" : ""}><summary>${T("Your last actions")}</summary>${rows ? `<ol>${rows}</ol>` : `<p class="vea-fine">${T("Nothing yet.")}</p>`}</details>` : ""}</section>`;
  }
  function ownerCard() {
    return `<section class="ams-card vea-card vea-owner"><h3>${T("Reward pool")} <small>${T("owner")}</small></h3>
      <label class="vea-in sm"><span>${T("Amount")}</span><input id="vea-pamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.poolAmt)}"><em>$ARCIA</em></label>
      <div class="vea-row"><button type="button" class="vea-go sm" data-vea="fund"${S.busy ? " disabled" : ""}>${T("Add to the pool")}</button><button type="button" class="vea-go sm ghost" data-vea="defund"${S.busy ? " disabled" : ""}>${T("Take back")}</button></div>
      <p class="vea-fine">${T("The daily rate becomes the pool ÷ 20 days after either.")}${S.st ? ` ${T("Runway")}: <b data-no-i18n>${S.st.finish > nowS() ? left(S.st.finish - nowS()) : "—"}</b>` : ""}</p>
      <p class="vea-msg ${esc((S.msg.pool || {}).k || "")}">${esc((S.msg.pool || {}).t || "")}</p></section>`;
  }

  // the earned number rolls its changed digits; the countdowns tick
  function roll(el, s) {
    const prev = el.dataset.v || "";
    if (prev === s) return;
    el.dataset.v = s;
    if (reduce() || !prev || prev.length !== s.length) { el.textContent = s; return; }
    el.innerHTML = [...s].map((c, i) => (c !== prev[i] ? `<i class="r">${esc(c)}</i>` : esc(c))).join("");
  }
  function tick() {
    const v = big(liveEarned());
    const e = $("vea-earned"); if (e) roll(e, v);
    body.querySelectorAll(".vea-earned-mini").forEach((x) => roll(x, v));
    panel.querySelectorAll("[data-vea-left]").forEach((el) => { const end = Number(el.dataset.veaLeft); if (end > nowS()) el.textContent = left(end - nowS()); });
  }

  // ---------------- motion ----------------
  function coinsFly(from) {
    if (reduce() || !from) return;
    const to = document.getElementById("wallet-pill-btn") || document.getElementById("wallet-slot") || document.getElementById("connect-btn");
    if (!to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const c = document.createElement("i");
      c.className = "vea-coin";
      document.body.appendChild(c);
      const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
      const mx = (x0 + x1) / 2 + (i - 3) * 30, my = Math.min(y0, y1) - 80 - i * 6;
      c.animate([{ transform: `translate(${x0}px,${y0}px) scale(.6)`, opacity: 0 }, { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.45 }, { transform: `translate(${x1}px,${y1}px) scale(.4)`, opacity: 0.2 }],
        { duration: 900 + i * 70, delay: i * 60, easing: "cubic-bezier(.3,.7,.2,1)" }).onfinish = () => c.remove();
    }
    setTimeout(() => to.animate && to.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 300 }), 1100);
  }
  function lockRing() {
    const em = panel.querySelector(".vea-emblem"); if (!em || reduce()) return;
    em.classList.remove("locked"); void em.offsetWidth; em.classList.add("locked");
    setTimeout(() => em.classList.remove("locked"), 1800);
  }

  // ---------------- actions ----------------
  const say = (k, t, kind = "") => { S.msg[k] = { t, k: kind }; keep(paint); };
  async function send(k, fn, ok, after) {
    if (S.busy) return;
    S.busy = true; say(k, tr("Confirm in your wallet…"));
    try {
      const sg = await signer();
      await fn(sg);
      say(k, ok, "ok");
      if (after) after();
      await load(); keep(paint);
    } catch (err) { say(k, why(err), "bad"); }
    finally { S.busy = false; window.arcChainSwitching = false; keep(paint); }
  }
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
    const wantAuto = S.autoPref && !(S.pos && S.pos.auto);
    await send("stake", async (sg) => {
      const a = ADDR();
      const al = add > 0n ? await rd(ARCIA(), ERC20).allowance(me(), a) : ethers.MaxUint256;
      const steps = (al < add ? 1 : 0) + 1 + (wantAuto ? 1 : 0);
      let n = 0;
      const step = (t) => { n++; if (steps > 1) say("stake", `${tr("Step")} ${n}/${steps} — ${tr(t)}`); };
      if (al < add) { step("approve $ARCIA in your wallet…"); await wait(await new ethers.Contract(ARCIA(), ERC20, sg).approve(a, S.once ? ethers.MaxUint256 : add), "stake"); }
      step("confirm the stake…");
      await wait(await new ethers.Contract(a, ABI, sg).stake(add, S.days), "stake");
      if (wantAuto) { step("turn on auto-renew…"); await wait(await new ethers.Contract(a, ABI, sg).setAutoRenew(true), "stake"); }
      S.amt = "";
    }, renew ? tr("Lock renewed.") : tr("Staked — your veARCIA is earning."), lockRing);
  }
  async function doWithdraw() {
    const w = parse(S.wamt); if (!(w > 0n)) return;
    const burning = penaltyNow(w).pen > 0n;
    await send("wd", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).withdraw(w), "wd"); S.wamt = ""; }, tr("Withdrawn."), () => {
      if (burning && !reduce()) { S.flame = true; setTimeout(() => { S.flame = false; keep(paint); }, 1800); }
    });
  }
  async function doClaim(btn) {
    const r = btn ? btn.getBoundingClientRect() : null;
    await send("claim", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).claim(), "claim"); }, tr("Rewards claimed."), () => coinsFly(r ? { getBoundingClientRect: () => r } : null));
  }
  async function doCompound() { await send("claim", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).compound(), "claim"); }, tr("Compounded — your rewards are staked."), lockRing); }
  async function doAuto(on) { await send("wd", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).setAutoRenew(on), "wd"); }, tr(on ? "Auto-renew is on." : "Auto-renew is off — the countdown has started.")); }
  async function doBoost() {
    await loadBoost();
    const b = S.boost;
    if (!b || !b.signed) return say("boost", (b && b.reason) || tr("The boost can't be signed right now."), "bad");
    const t = b.tier;
    await send("boost", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).applyBoost(me(), b.tier, b.issued, b.until, b.signature), "boost"); S.boost = null; }, tr("Boost applied."), () => {
      if (!reduce()) { S.flip = t; setTimeout(() => { S.flip = null; }, 1400); }
    });
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
  function share() {
    const u = me(), p = S.pos; if (!u || !p) return;
    const url = `${SITE()}/vearcia/${u}`;
    const text = `I staked ${big(F(p.amount))} $ARCIA → ${big(F(p.ve))} veARCIA on Robinhood Chain 💗\n${p.auto ? "Auto-renew on" : `${mult(p.lockBps || BPS)} lock`}${tierOn() ? ` · ${mult(BOOST[tierOn()])} $ARCIRCLE boost` : ""}\n`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&via=ARCIRCLEonArc`, "_blank", "noopener");
  }
  async function notifyMe() {
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* fine */ }
    store.set("vea.notify", true); keep(paint);
  }

  panel.addEventListener("click", (e) => {
    const tab = e.target.closest && e.target.closest("[data-vtab]");
    if (tab) { S.tab = tab.dataset.vtab; store.set("vea.tab", S.tab); keep(paint); return; }
    const b = e.target.closest && e.target.closest("[data-vea], [data-vea-d]");
    if (!b || b.disabled) return;
    if (b.dataset.veaD) { S.days = Number(b.dataset.veaD); S.popX = true; paint(); return; }
    const k = b.dataset.vea;
    if (k === "connect") { if (typeof connectWallet === "function") connectWallet(); return; }
    if (k === "max") { if (S.bal != null) { S.amt = ethers.formatEther(S.bal); paint(); } return; }
    if (k === "wmax") { if (S.pos) { S.wamt = ethers.formatEther(S.pos.amount); paint(); } return; }
    if (k === "auto") return; // the change event below
    if (k === "stake") doStake(false);
    else if (k === "renew") doStake(true);
    else if (k === "withdraw") doWithdraw();
    else if (k === "claim") doClaim(b);
    else if (k === "compound") doCompound();
    else if (k === "boost") doBoost();
    else if (k === "share") share();
    else if (k === "notify") notifyMe();
    else if (k === "fund" || k === "defund") doPool(k);
  });
  panel.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches && t.matches('[data-vea="auto"]')) { doAuto(!!t.checked); return; }
    if (t.id === "vea-autopref") { S.autoPref = !!t.checked; store.set("vea.auto", S.autoPref); }
    if (t.id === "vea-once") { S.once = !!t.checked; store.set("vea.once", S.once); }
  });
  panel.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("vea-acts")) S.histOpen = e.target.open; }, true);
  let typeT = 0;
  panel.addEventListener("input", (e) => {
    const id = e.target && e.target.id;
    if (id === "vea-days") { S.days = Number(e.target.value) || 1; e.target.style.setProperty("--p", ((S.days - 1) / 19) * 100 + "%"); clearTimeout(typeT); typeT = setTimeout(() => { S.popX = true; keep(paint); }, 120); return; }
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
    if (ADDR() && store.get("vea.notify", false)) { // it opened: tell whoever asked
      store.set("vea.notify", false);
      try { if ("Notification" in window && Notification.permission === "granted") new Notification(tr("veARCIA is open"), { body: tr("Stake $ARCIA on Robinhood Chain for 1–20 days."), icon: "/images/arcia-avatar-96.jpg" }); } catch { /* fine */ }
    }
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(async () => { if (!panel.classList.contains("active") || document.hidden || S.busy) return; await load(); keep(paint); }, 20000);
    clock = setInterval(async () => {
      if (!panel.classList.contains("active") || document.hidden) return;
      if (me() !== S.acct) { S.acct = me(); S.boost = null; S.mine = null; S.msg = {}; await load(); keep(paint); return; }
      tick();
    }, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "vearcia") show(); else { clearInterval(timer); clearInterval(clock); } });
  document.addEventListener("arc:lang", () => { if (S.loaded) paint(); });
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) panel.querySelectorAll(".vea-guide details[open]").forEach((d) => d.removeAttribute("open"));
  if (panel.classList.contains("active")) show();
  window.arcVeArcia = { state: S, load, paint, preview, lockBps };
})();
