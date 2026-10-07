/* global CONFIG, ethers, state, connectWallet */
// arc-vearcia.js — veARCIA (arcpad.html#vearcia; contracts/ArciaStaking.sol on Robinhood Chain; api/_vearcia.mjs).
//   · v4 (8 Oct 2026): auto-renew turns on with every stake and the page has no switch to turn it off (only on, for an
//     older position): the lock and its multiplier keep running, and taking $ARCIA out costs 50%, burned
//   · stake $ARCIA for 1–20 days → veARCIA = amount × 1.0x…2.0x; one position per wallet, adding or renewing restarts
//     the lock (never earlier than it would end); auto-renew keeps the lock (and its multiplier) running; an ended lock
//     counts 1.0x until renewed
//   · rewards stream from reward pools over 20 days ($ARCIA, plus any extra token), shared every second by reward weight
//     (veARCIA × the $ARCIRCLE boost); claim or compound any time
//   · early withdrawal: time left ÷ the lock's length, at most 50% (auto-renew: 50%), burned — shown before signing
//   · the $ARCIRCLE boost (1.2x / 1.5x / 2.0x from 1M / 5M / 10M, Arc + veARCIRCLE + Robinhood Chain): the site signs a
//     3-day note (GET /api/social?veboost=0x…) and the wallet applies it
//   · veARCIA tiers (Bronze 10K · Silver 100K · Gold 1M · Diamond 5M) unlock ARCIA perks; the stakers as a whole (no wallet listed); the pool's history;
//     a wallet's last actions and share card (/vearcia/<wallet>) — GET /api/desk?vearcia=state · ?vearcia=me&u=0x…
// v3 (6 Oct 2026): votes weighted by veARCIA at a snapshot (GET /api/social?vevote=list, POST vevotenew / vevote —
// signed messages, no gas), the next veARCIA tier with the two ways to reach it, an early-exit simulator, the unlock in
// a calendar and a one-click re-lock, staking for a friend (stakeFor), the community over time, a live hero (streamed
// so far, the pool's runway), the stats from the server when the chain is slow, and motion for tier-ups, compounding,
// pool refills, the lock slider and auto-renew.
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
  const L3v = (en, ko, zh) => { const l = (window.arcI18n && window.arcI18n.get()) || "en"; return l === "ko" ? ko : l === "zh" ? zh : en; };
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
  const pct = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e4 ? fmt(n / 1000, 0) + "K%" : fmt(n, n >= 1000 ? 0 : n < 10 ? 2 : 1) + "%"); // 2,285% rather than 2,285.2%: the range has to fit one stat box
  const mult = (bps) => (bps / BPS).toFixed(2).replace(/0$/, "") + "x";
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  const ABI = [
    "function stats() view returns (uint256 pool, uint256 perDay, uint256 finish, uint256 staked, uint256 ve, uint256 weight, uint256 streamed, uint256 claimed, uint256 burned)",
    "function positions(address) view returns (uint128 amount, uint64 start, uint64 end, uint16 lockBps, uint16 lockDays, bool autoRenew, uint8 tier, uint64 boostUntil, uint64 boostIssued, uint256 ve, uint256 weight)",
    "function earnedAll(address) view returns (uint256[])", "function owner() view returns (address)", "function stakers() view returns (uint256)",
    "function streamCount() view returns (uint256)", "function streamInfo(uint256) view returns (address token, uint256 left_, uint256 perDay_, uint256 finish_, uint256 streamed_, uint256 claimed_)",
    "function stake(uint256 amount, uint256 days_)", "function stakeFor(address user, uint256 amount, uint256 days_)", "function withdraw(uint256 amount)", "function claim() returns (uint256)", "function compound() returns (uint256)", "function setAutoRenew(bool on)",
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
    votes: null, gto: "", gamt: "", gdays: 20, sim: 0, vnew: { title: "", body: "", opts: "", days: 3 }, refill: 0, snapD: 0, lastSnap: 0, autoSpin: 0, prevPool: null,
    busy: false, msg: {}, at: 0, skew: 0, loaded: false, tab: store.get("vea.tab", "stake"), autoPref: true, once: store.get("vea.once", false), flip: null, flame: false, histOpen: false };
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
      jobs.push(C.stats().then((r) => {
        S.st = { pool: r[0], perDay: r[1], finish: Number(r[2]), staked: r[3], ve: r[4], weight: r[5], streamed: r[6], claimed: r[7], burned: r[8] }; S.stSrv = false;
        // v3: the pool grew by more than 1% since the last read → the ring refills on screen
        if (S.prevPool != null && S.st.pool > (S.prevPool * 101n) / 100n) S.refill = Date.now();
        S.prevPool = S.st.pool;
      }).catch(() => {}));
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
    if (a) { loadSrv(); loadVotes(); } // the server's view (the community figures, history, votes) arrives a moment later
  }
  async function loadSrv() {
    const u = me();
    try {
      const r = await fetch("/api/desk?vearcia=state", { cache: "no-store" }); const j = r.ok ? await r.json() : null;
      if (j && j.live) {
        S.srv = j;
        // v3: Robinhood Chain didn't answer the page → the stats come from the server's read
        if ((!S.st || S.stSrv) && j.totals) { const W = (x) => ethers.parseEther((Number(x) || 0).toFixed(6)); const t = j.totals; S.st = { pool: W(t.pool), perDay: W(t.perDay), finish: Number(t.finish) || 0, staked: W(t.staked), ve: W(t.ve), weight: W(t.weight), streamed: W(t.streamed), claimed: W(t.claimed), burned: W(t.burned) }; S.stSrv = true; if (S.stakers == null) S.stakers = t.stakers; }
        keep(paint);
      }
    } catch { /* optional */ }
    if (u) try { const r = await fetch(`/api/desk?vearcia=me&u=${u}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.ok && me() === u) { S.mine = j; keep(paint); } } catch { /* optional */ }
  }
  async function loadVotes() {
    const u = me();
    try { const r = await fetch(`/api/social?vevote=list${u ? "&u=" + u : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.ok && me() === u) { S.votes = j; keep(paint); } } catch { /* optional */ }
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
  // everything the $ARCIA stream has paid out so far, moving every second between reads
  function streamedNow() {
    const st = S.st; if (!st) return null;
    const to = Math.min(nowS(), st.finish || nowS()), dt = Math.max(0, to - S.at);
    return F(st.streamed) + (st.weight > 0n ? (F(st.perDay) / DAY) * dt : 0);
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
    h += `<nav class="vea-tabs" role="tablist">${[["stake", "Stake"], ["pos", "My veARCIA"], ["boost", "Boost"], ["top", "Community"], ["vote", "Votes"]].map(([k, l]) => `<button type="button" role="tab" data-vtab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}${claimPill}</nav>`;
    h += `<div class="vea-sections vt-${esc(S.tab)}">
      <div class="vea-grid">${stakeCard(live)}${posCard(live)}</div>
      <div class="vea-grid g2">${boostCard(live)}${perksCard()}</div>
      <div class="vea-grid g4">${votesCard(live)}${giftCard(live)}</div>
      <div class="vea-grid g3">${topCard(live)}${trendCard(live)}</div>
    </div>`;
    if (live && u && S.owner && u === S.owner) h += ownerCard();
    body.innerHTML = h;
    tick();
    if (!S.trendDrawn && body.querySelector(".vea-trend .vea-hist")) { S.trendDrawn = true; const t = body.querySelector(".vea-trend"); if (t) t.classList.add("in"); }
    if (S.snapD) { const m = body.querySelector(`[data-vea-d="${S.snapD}"]`); if (m && !reduce()) m.classList.add("snap"); S.snapD = 0; }
    if (S.popX) { const x = body.querySelector(".vea-x"); if (x && !reduce()) { x.classList.add("pop"); if (S.days === MAXD) x.classList.add("max"); } S.popX = false; }
  }

  // the stream: the pool's ring (days left of the 20) → dots flowing → stakers
  function flowCard(live) {
    const st = S.st, now = nowS();
    const daysLeft = st && st.finish > now ? (st.finish - now) / DAY : 0;
    const frac = Math.max(0, Math.min(1, daysLeft / 20));
    const R = 46, C = 2 * Math.PI * R;
    const paused = !live || !st || !(st.weight > 0n) || !(st.finish > now) || !(st.perDay > 0n);
    // v2: the crowd is drawn, not named — one dot per staker, up to five
    const nSt = (S.srv && S.srv.dist && S.srv.dist.stakers) || 0;
    const dots = nSt ? Array.from({ length: Math.min(5, nSt) }, (_, i) => `<i style="--i:${i}"></i>`).join("") : [0, 1, 2].map((i) => `<i class="ghost" style="--i:${i}"></i>`).join("");
    const refill = S.refill && Date.now() - S.refill < 2600 && !reduce();
    const count = S.stakers != null ? S.stakers : S.srv && S.srv.totals ? S.srv.totals.stakers : null;
    const avg = st && st.staked > 0n && st.finish > now ? ((F(st.perDay) * 365) / F(st.staked)) * 100 : null;
    const liveRow = live && st ? `<div class="vea-live">
        <div><span>${T("Streamed so far")}</span><b data-no-i18n id="vea-streamed">${big(streamedNow())}</b><i>$ARCIA</i></div>
        <div><span>${T("The pool runs out in")}</span><b data-no-i18n${st.finish > now ? ` data-vea-left="${st.finish}"` : ""}>${st.finish > now ? left(st.finish - now) : "—"}</b><small data-no-i18n>${st.finish > now ? esc(when(st.finish)) : esc(tr("waiting for a refill"))}</small></div>
        <div><span>${T("Stakers")}</span><b data-no-i18n>${count != null ? fmt(count, 0) : "—"}</b></div>
        <div><span>${T("Average yearly rate")}</span><b data-no-i18n>${avg != null ? pct(avg) : "—"}</b><small>${T("all stakers, today's rewards")}</small></div>
      </div>` : "";
    return `<section class="vea-flow${paused ? " paused" : ""}${refill ? " refill" : ""}" aria-label="${T("The reward stream")}">
      <div class="vea-ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${R}" class="trk"/><circle cx="55" cy="55" r="${R}" class="val" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/></svg>
        <div><b data-no-i18n>${st && daysLeft > 0 ? "D-" + Math.ceil(daysLeft) : "—"}</b><span>${T("reward pool")}</span></div></div>
      <div class="vea-stream" aria-hidden="true"><svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 30 C 120 -5, 260 65, 400 30" class="vea-path"/></svg>${Array.from({ length: 9 }, (_, i) => `<span class="vea-dot" style="--d:${i}"></span>`).join("")}</div>
      <div class="vea-crowd"><div class="vea-av">${dots}</div><b data-no-i18n>${st ? big(F(st.perDay)) : "—"} <i>$ARCIA</i></b><span>${T(paused ? (live ? "the stream waits for stakers" : "opens soon") : "a day, every second")}</span></div>
      ${liveRow}
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
    // v3: lower, with the 1 · 5 · 10 · 15 · 20-day marks on the line
    const W = 300, H = 64, x = (i) => 6 + (i * (W - 12)) / (MAXD - 1), y = (v) => H - 8 - (v / max) * (H - 28);
    const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join(" ");
    const ticks = [1, 5, 10, 15, 20].map((d) => `<circle class="tk${d === S.days ? " on" : ""}" cx="${x(d - 1).toFixed(1)}" cy="${y(pts[d - 1] || 0).toFixed(1)}" r="2.6"/>`).join("");
    return `<svg class="vea-curve" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon points="6,${H - 8} ${line} ${W - 6},${H - 8}" class="fill"/><polyline points="${line}"/>${ticks}<circle cx="${x(S.days - 1).toFixed(1)}" cy="${y(pts[S.days - 1] || 0).toFixed(1)}" r="5"/><text x="6" y="11">${T("est. yearly rate by lock")} <tspan class="v">${esc(pct(pts[S.days - 1]))}</tspan></text></svg>`;
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
      ${has && pos.auto ? "" : `<p class="vea-note vea-auto-note">${T("Auto-renew turns on with your stake and stays on: your lock and its multiplier keep running, and taking $ARCIA out burns 50%.")}</p>`}
      ${btn}
      <label class="vea-chk sm"><input type="checkbox" id="vea-once"${S.once ? " checked" : ""}><span>${T("Approve once — no approval step next time")}</span></label>
      <p class="vea-msg ${esc((S.msg.stake || {}).k || "")}" id="vea-msg-stake">${esc((S.msg.stake || {}).t || "")}</p>
      <p class="vea-fine">${T("Staking is free. Estimates use today's rewards and stakers; they change as those do. Not financial advice.")}</p>
    </section>`;
  }

  // start → now → end, with the early-exit cost falling from 50% to 0 over the lock
  function timeline(p) {
    if (p.auto) return `<div class="vea-tl auto"><span>${T("Auto-renew is on")}</span><b data-no-i18n>${p.lockDays}d · ${mult(p.lockBps || BPS)}</b><small>${T("The lock keeps running; taking $ARCIA out costs 50%, burned.")}</small></div>`;
    const t = nowS(), total = Math.max(1, p.end - p.start), x = Math.min(1, Math.max(0, (t - p.start) / total));
    const W = 300, H = 66, X = (f) => 4 + f * (W - 8), Y = (pc) => H - 14 - (pc / 50) * (H - 36);
    const curveD = `M${X(0)},${Y(50)} L${X(0.5)},${Y(50)} L${X(1)},${Y(0)}`;
    const ended = t >= p.end;
    return `<div class="vea-tl${ended ? " done" : ""}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${curveD} L${X(1)},${H - 14} L${X(0)},${H - 14}Z" class="area"/><path d="${curveD}" class="cost"/><line x1="${X(0)}" x2="${X(1)}" y1="${H - 14}" y2="${H - 14}" class="base"/><line x1="${X(0)}" x2="${X(x)}" y1="${H - 14}" y2="${H - 14}" class="done"/><line x1="${X(x)}" x2="${X(x)}" y1="16" y2="${H - 8}" class="now"/><circle cx="${X(x)}" cy="${H - 14}" r="5" class="now"/>
        <text x="${X(0)}" y="${H - 1}">${esc(when(p.start))}</text><text x="${X(1)}" y="${H - 1}" text-anchor="end">${esc(when(p.end))}</text><text x="${X(0) + 2}" y="10">${T("early-exit cost")} 50% → 0%</text></svg>
      <div><span>${T(ended ? "Lock ended" : "Unlocks in")}</span><b data-no-i18n data-vea-left="${p.end}">${ended ? when(p.end) : left(p.end - t)}</b></div>
      ${ended ? `<small>${T("Counts 1.0x until you renew — or withdraw for free.")}</small>` : ""}</div>`;
  }

  function posCard(live) {
    const u = me(), p = S.pos;
    if (!u) return `<section class="ams-card vea-card vea-pos vea-empty" data-vt="pos"><h3>${T("Your veARCIA")}</h3>${previewBlock()}<p>${T("Connect a wallet to see your stake, rewards and lock.")}</p><button type="button" class="vea-go ghost" data-vea="connect">${T("Connect wallet")}</button></section>`;
    if (!live || !p || !(p.amount > 0n) && !(S.earned > 0n)) return `<section class="ams-card vea-card vea-pos vea-empty" data-vt="pos"><h3>${T("Your veARCIA")}</h3>${previewBlock()}<p>${T("Nothing staked yet. Pick an amount and a lock — 20 days gets 2.0x.")}</p>${S.earned > 0n ? claimRow() : ""}</section>`;
    const w = parse(S.wamt), pen = penaltyNow(w), run = running();
    const ve = F(p.ve), vt = veTier(ve);
    const daily = myDaily();
    const toEnd = p.auto ? null : Math.max(0, p.end - nowS());
    const recv = w > 0n ? F(w - pen.pen) : null, burn = w > 0n ? F(pen.pen) : null;
    const sharePct = w > 0n ? (pen.bps / 100) : 0;
    return `<section class="ams-card vea-card vea-pos" data-vt="pos">
      <h3>${T("Your veARCIA")} ${vt ? `<span class="vea-tb t${vt}">${esc(VT[vt][0])}</span>` : ""}${S.mine && S.mine.rank ? `<small data-no-i18n>#${S.mine.rank}</small>` : ""}
        <span class="vea-share-w"><a class="ams-mini" href="/api/og?vearcia=${esc(u)}" target="_blank" rel="noopener" download="vearcia-card.png">${T("Card image")}</a><button type="button" class="ams-mini vea-share" data-vea="share">${T("Share")}</button></span></h3>
      <div class="vea-big"><b data-no-i18n>${big(ve)}</b><span>veARCIA</span><em data-no-i18n>${mult(p.lockBps || BPS)}${tierOn() ? " × " + mult(BOOST[tierOn()]) : ""}</em></div>
      ${tierProg(p)}
      <dl class="vea-sum">
        <div><dt>${T("Staked")}</dt><dd data-no-i18n>${big(F(p.amount))} $ARCIA</dd></div>
        <div><dt>${T("Share of the stream")}</dt><dd data-no-i18n>${S.st && S.st.weight > 0n ? pct((Number(p.weight) / Number(S.st.weight)) * 100) : "—"}</dd></div>
        <div><dt>${T("Your daily rewards")}</dt><dd class="g" data-no-i18n>${big(daily)} $ARCIA</dd></div>
        <div><dt>${T(p.auto ? "Next 20 days" : "Until it unlocks")}</dt><dd class="g" data-no-i18n>≈ ${big(daily * Math.min(20, p.auto ? 20 : toEnd / DAY))} $ARCIA</dd></div>
        ${S.mine && S.mine.received > 0 ? `<div><dt>${T("Received so far")}</dt><dd data-no-i18n>${big(S.mine.received)} $ARCIA</dd></div>` : ""}
      </dl>
      ${timeline(p)}
      ${lockActs(p)}
      ${p.auto
        ? `<div class="vea-switch on${S.autoSpin && Date.now() - S.autoSpin < 1800 ? " spin" : ""}"><span><b><svg class="vea-inf" viewBox="0 0 32 16" aria-hidden="true"><path d="M8 3c-3 0-5 2.2-5 5s2 5 5 5c4.5 0 11.5-10 16-10 3 0 5 2.2 5 5s-2 5-5 5c-4.5 0-11.5-10-16-10z"/></svg>${T("Auto-renew is always on")}</b><small>${T("Your multiplier never runs out. Taking $ARCIA out burns 50%.")}</small></span></div>`
        : `<div class="vea-switch"><span><b><svg class="vea-inf" viewBox="0 0 32 16" aria-hidden="true"><path d="M8 3c-3 0-5 2.2-5 5s2 5 5 5c4.5 0 11.5-10 16-10 3 0 5 2.2 5 5s-2 5-5 5c-4.5 0-11.5-10-16-10z"/></svg>${T("Auto-renew")}</b><small>${T("Keep the lock (and its multiplier) running for good. Taking $ARCIA out will burn 50%.")}</small></span><button type="button" class="vea-go sm" data-vea="autoon"${S.busy ? " disabled" : ""}>${T("Turn on auto-renew")}</button></div>`}
      ${claimRow()}
      <div class="vea-wd">
        <label class="vea-in sm"><span>${T("Withdraw")}</span><input id="vea-wamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.wamt)}"><em>$ARCIA</em><button type="button" class="ams-mini" data-vea="wmax">${T("Max")}</button></label>
        ${run ? `<p class="vea-pen${pen.bps >= 5000 ? " cap" : ""}">${T("Withdrawing now costs")} <b data-no-i18n>${(pen.bps / 100).toFixed(2)}%</b> — ${T(p.auto ? "auto-renew is on" : "time left ÷ the lock's length")}${p.auto ? "" : ` (<span data-no-i18n>${left(p.end - nowS())} ÷ ${Math.round((p.end - p.start) / DAY)}d</span>)`}, ${T("at most 50%")}.</p>`
          : `<p class="vea-pen free">${T("Your lock has ended: withdrawing is free.")}</p>`}
        ${run && !p.auto ? simBlock(p, w) : ""}
        ${w > 0n ? `<div class="vea-split${S.flame ? " burning" : ""}" aria-label="${T("You get")} ${esc(big(recv))} · ${T("burned")} ${esc(big(burn))}"><i class="get" style="--w:${100 - sharePct}%"><span>${T("You get")} <b data-no-i18n>${big(recv)}</b></span></i>${burn > 0 ? `<i class="burn" style="--w:${sharePct}%"><span data-no-i18n>${big(burn)}</span></i>` : ""}</div>` : S.flame ? `<div class="vea-split burning"><i class="burn" style="--w:100%"><span>${T("burned")}</span></i></div>` : ""}
        <button type="button" class="vea-go ${run ? "warn" : "ghost"}" data-vea="withdraw"${S.busy || !(w > 0n) ? " disabled" : ""}>${T(p.auto ? "Withdraw (50% burned)" : run ? "Withdraw early" : "Withdraw")}</button>
        <p class="vea-msg ${esc((S.msg.wd || {}).k || "")}">${esc((S.msg.wd || {}).t || "")}</p>
      </div>
      ${actsBlock()}
    </section>`;
  }
  /// v3: what the stake would look like — the amount being typed (or a sample 10,000) at the chosen lock
  function previewBlock() {
    const typed = parse(S.amt), amt = typed > 0n ? typed : ethers.parseEther("10000");
    const pv = preview(amt, S.days), vt = veTier(F(pv.ve));
    return `<div class="vea-prev">
      <div class="vea-big ghost"><b data-no-i18n>${big(F(pv.ve))}</b><span>veARCIA</span><em data-no-i18n>${mult(pv.lb)}</em></div>
      <p class="vea-fine">${typed > 0n ? T("Preview for the amount you typed") : T("Preview for a sample 10,000 $ARCIA")} · <span data-no-i18n>${S.days}${esc(tr("d"))}</span></p>
      <dl class="vea-sum">
        <div><dt>${T("Est. daily rewards")}</dt><dd class="g" data-no-i18n>${pv.daily != null ? big(pv.daily) + " $ARCIA" : "—"}</dd></div>
        <div><dt>${T("Est. yearly rate")}</dt><dd class="g" data-no-i18n>${pv.apr != null ? pct(pv.apr) : "—"}</dd></div>
        <div><dt>${T("veARCIA tier")}</dt><dd data-no-i18n>${vt ? `<span class="vea-tb t${vt}">${esc(VT[vt][0])}</span>` : "—"}</dd></div>
        <div><dt>${T("Unlocks")}</dt><dd data-no-i18n>${esc(when(nowS() + S.days * DAY))}</dd></div>
      </dl></div>`;
  }
  /// v3: the next veARCIA tier and the two ways to reach it (a longer lock, or more $ARCIA at this length)
  function tierProg(p) {
    const ve = F(p.ve), t = veTier(ve);
    if (t >= VT.length - 1) return `<div class="vea-tp top"><span class="vea-tb t4">Diamond</span><small>${T("The top veARCIA tier")}</small></div>`;
    const [nm, need] = VT[t + 1], from = VT[t][1], amount = F(p.amount);
    const prog = Math.max(0, Math.min(100, ((ve - from) / (need - from)) * 100));
    let dReach = null;
    for (let d = minDays(); d <= MAXD; d++) if ((amount * lockBps(d)) / BPS >= need) { dReach = d; break; }
    const L = Math.max(minDays(), p.auto ? p.lockDays : Math.max(1, p.lockDays || 1));
    const add = Math.max(0, Math.ceil(need / (lockBps(L) / BPS) - amount));
    const ways = [
      dReach && dReach !== p.lockDays ? `<button type="button" class="ams-mini" data-vea="tfill" data-days="${dReach}" data-amt="0">${T("Lock")} ${dReach}${T("d")} · ${mult(lockBps(dReach))}</button>` : "",
      add > 0 ? `<button type="button" class="ams-mini" data-vea="tfill" data-days="${L}" data-amt="${add}">${T("Add")} <span data-no-i18n>${big(add)}</span> $ARCIA · ${L}${T("d")}</button>` : "",
    ].filter(Boolean).join(`<em>${esc(L3v("or", "또는", "或"))}</em>`);
    return `<div class="vea-tp"><div class="vea-tp-h"><span class="vea-tb t${t + 1}">${esc(nm)}</span><small><b data-no-i18n>${big(need - ve)}</b> veARCIA ${T("to go")} · ARCIA chat <b data-no-i18n>${VT_PERK[t + 1]}</b> ${T("messages a day")}</small></div>
      <div class="vea-prog"><i style="--p:${prog.toFixed(1)}%"></i></div>${ways ? `<div class="vea-tp-w">${ways}</div>` : ""}</div>`;
  }
  /// v3: the unlock in a calendar, and a one-click re-lock once it has ended
  function lockActs(p) {
    if (p.auto) return "";
    const ended = !(p.end > nowS());
    if (!ended) return `<div class="vea-la"><button type="button" class="ams-mini" data-vea="ics">${T("Add the unlock to my calendar")}</button></div>`;
    const same = Math.max(1, p.lockDays || 1);
    return `<div class="vea-la relock"><span>${T("Your lock has ended — it counts 1.0x now.")}</span>
      <button type="button" class="vea-go sm" data-vea="relock" data-days="${same}"${S.busy ? " disabled" : ""}>${T("Re-lock")} · ${same}${T("d")} · ${mult(lockBps(same))}</button>
      ${same < MAXD ? `<button type="button" class="vea-go sm ghost" data-vea="relock" data-days="${MAXD}"${S.busy ? " disabled" : ""}>${MAXD}${T("d")} · ${mult(lockBps(MAXD))}</button>` : ""}</div>`;
  }
  /// v3: the early-exit cost if you waited — slide a date, see what you'd get and what would burn
  function simBlock(p, w) {
    const maxd = Math.max(1, Math.ceil((p.end - nowS()) / DAY));
    if (S.sim > maxd) S.sim = maxd;
    const t = Math.min(p.end, nowS() + S.sim * DAY), total = Math.max(1, p.end - p.start);
    const bps = Math.min(5000, Math.floor((Math.max(0, p.end - t) * BPS) / total));
    const amt = w > 0n ? w : p.amount, a = F(amt), burn = (a * bps) / BPS, get = a - burn;
    return `<div class="vea-sim"><div class="vea-sim-h"><span>${T(S.sim ? "If you withdraw on" : "If you withdraw now")}</span><b data-no-i18n>${esc(when(t))}</b><em data-no-i18n>${(bps / 100).toFixed(2)}%</em></div>
      <input type="range" id="vea-sim" min="0" max="${maxd}" step="1" value="${S.sim}" aria-label="${T("Days from now")}" style="--p:${(S.sim / maxd) * 100}%">
      <div class="vea-split sim"><i class="get" style="--w:${100 - bps / 100}%"><span>${T("You get")} <b data-no-i18n>${big(get)}</b></span></i>${burn > 0 ? `<i class="burn" style="--w:${bps / 100}%"><span data-no-i18n>${big(burn)}</span></i>` : ""}</div>
      <small>${T(w > 0n ? "For the amount above" : "For your whole stake")} · ${T("free from")} <span data-no-i18n>${esc(when(p.end))}</span></small></div>`;
  }
  /// your last actions (moved here from the history card)
  function actsBlock() {
    const hist = (S.mine && S.mine.history) || [];
    const name = { stake: "Staked", withdraw: "Withdrew", compound: "Compounded", claim: "Claimed", boost: "Boost", auto: "Auto-renew" };
    const rows = hist.slice(0, 10).map((r) => `<li><span>${T(name[r.kind] || r.kind)}</span><b data-no-i18n>${r.amount != null ? big(r.amount) + " $ARCIA" : r.kind === "boost" ? mult(BOOST[r.tier] || BPS) : r.kind === "auto" ? esc(r.on ? L3v("on", "켜짐", "开启") : L3v("off", "꺼짐", "关闭")) : ""}${r.penalty > 0 ? ` <small>(${big(r.penalty)} ${tr("burned")})</small>` : ""}${r.days ? ` <small>${r.days}d</small>` : ""}</b><a href="${esc(EXPL())}/tx/${esc(r.tx)}" target="_blank" rel="noopener" data-no-i18n>${r.t ? esc(ago(r.t)) : "↗"}</a></li>`).join("");
    return `<details class="vea-acts"${S.histOpen ? " open" : ""}><summary>${T("Your last actions")}</summary>${rows ? `<ol>${rows}</ol>` : `<p class="vea-fine">${T("Nothing yet.")}</p>`}</details>`;
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
    return `<section class="ams-card vea-card vea-perks" data-vt="pos"><h3>${T("veARCIA tiers")}</h3>
      <ol class="vea-vt">${VT.slice(1).map(([n, v], i) => `<li class="t${i + 1}${vt === i + 1 ? " on" : ""}${ve >= v ? " ok" : ""}"><span class="vea-tb t${i + 1}">${esc(n)}</span><b data-no-i18n>${big(v)}</b><small>${T("ARCIA chat")} <b data-no-i18n>${VT_PERK[i + 1]}</b> ${T("messages a day")} · ${T("badge on comments")}</small></li>`).join("")}</ol>
      ${next && ve > 0 ? `<p class="vea-fine">${T("Next")}: <b>${esc(next[0])}</b> — <b data-no-i18n>${big(next[1] - ve)}</b> veARCIA ${T("to go")}</p>` : ""}
      <p class="vea-fine">${T("veARCIA is recorded over time: each vote counts it as of the moment the vote opens.")}</p></section>`;
  }
  /// v2: the stakers as a whole — how long they lock, their tiers, auto-renew and boosts. No wallet is listed.
  function topCard(live) {
    const d = S.srv && S.srv.dist;
    if (!d || !d.stakers) return `<section class="ams-card vea-card vea-comm" data-vt="top"><h3>${T("Community")}</h3><p class="vea-fine">${T(live ? "The first stakers show here." : "Opens soon.")}</p></section>`;
    const pc = (v, t) => (t > 0 ? (v / t) * 100 : 0);
    const shades = ["rgba(255,139,216,.3)", "rgba(255,139,216,.5)", "rgba(255,139,216,.72)", "#ff8bd8"];
    const bar = d.locks.map((g, i) => (g.staked > 0 ? `<i style="flex:${g.staked};background:${shades[i]}" title="${g.lo}–${g.hi} ${esc(tr("days"))}: ${pc(g.staked, d.staked).toFixed(1)}%"></i>` : "")).join("");
    const legend = d.locks.map((g, i) => `<li><i style="background:${shades[i]}"></i><span data-no-i18n>${g.lo}–${g.hi} ${esc(tr("days"))}</span><b data-no-i18n>${pc(g.staked, d.staked).toFixed(0)}%</b><small data-no-i18n>${g.n} ${esc(tr(g.n === 1 ? "staker" : "stakers"))}</small></li>`).join("");
    const tiers = d.tiers.map((t, i) => `<li class="${t.n ? "" : "z"}">${i ? `<span class="vea-tb t${i}">${esc(VT[i][0])}</span>` : `<span class="vea-tb t0">${T("Member")}</span>`}<b data-no-i18n>${t.n}</b></li>`).join("");
    const pos = S.pos && S.mine && S.mine.rank && d.stakers ? Math.max(1, Math.ceil((S.mine.rank / d.stakers) * 100)) : null;
    return `<section class="ams-card vea-card vea-comm" data-vt="top"><h3>${T("Community")} <small data-no-i18n>${d.stakers} ${esc(tr(d.stakers === 1 ? "staker" : "stakers"))}</small></h3>
      <div class="vea-cm-k">
        <div><span>${T("Average lock")}</span><b data-no-i18n>${d.avgLock.toFixed(1)} <i>${esc(tr("days"))}</i></b></div>
        <div><span>${T("On auto-renew")}</span><b data-no-i18n>${pc(d.auto.staked, d.staked).toFixed(0)}%</b></div>
        <div><span>${T("Boosted by $ARCIRCLE")}</span><b data-no-i18n>${d.boosted.n}</b></div>
        <div><span>${T("At 20 days (2.0x)")}</span><b data-no-i18n>${pc(d.max.staked, d.staked).toFixed(0)}%</b></div>
      </div>
      <div class="vea-cm-s"><small>${T("Lock length, by $ARCIA staked")}</small><div class="vea-cm-bar" role="img" aria-label="${T("Lock length, by $ARCIA staked")}">${bar}</div><ul class="vea-cm-lg">${legend}</ul></div>
      <div class="vea-cm-s"><small>${T("Stakers by veARCIA tier")}</small><ul class="vea-cm-t">${tiers}</ul></div>
      ${pos ? `<p class="vea-cm-you" data-no-i18n>${esc(L3v(`You're in the top ${pos}% of stakers`, `상위 ${pos}% 스테이커예요`, `你位于质押者前 ${pos}%`))}</p>` : ""}
      <p class="vea-fine">${T("No wallet is listed here — only the stakers as a whole.")}</p></section>`;
  }
  /// v3: the community over time — total staked, stakers, the average yearly rate and the daily rewards. No wallet named.
  function spark(pts, { step = false, fmtv = big, label = "", unit = "" } = {}) {
    if (!pts.length) return "";
    const t0 = pts[0].t, t1 = Math.max(t0 + 1, pts[pts.length - 1].t), vs = pts.map((p) => p.v), vmax = Math.max(...vs, 1e-9), vmin = Math.min(...vs, 0);
    const W = 300, H = 92, X = (t) => 6 + ((t - t0) / (t1 - t0)) * (W - 12), Y = (v) => H - 14 - ((v - vmin) / (vmax - vmin || 1)) * (H - 26);
    let d = `M${X(pts[0].t).toFixed(1)},${Y(pts[0].v).toFixed(1)}`;
    for (let k = 1; k < pts.length; k++) d += step ? ` H${X(pts[k].t).toFixed(1)} V${Y(pts[k].v).toFixed(1)}` : ` L${X(pts[k].t).toFixed(1)},${Y(pts[k].v).toFixed(1)}`;
    const lastV = pts[pts.length - 1].v;
    return `<div class="vea-tr"><div class="vea-tr-h"><span>${T(label)}</span><b data-no-i18n>${esc(fmtv(lastV))}${unit ? ` <i>${esc(unit)}</i>` : ""}</b></div>
      <svg class="vea-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T(label)}"><path d="${d} V${H - 14} H${X(pts[0].t).toFixed(1)}Z" class="fill"/><path d="${d}" class="line"/><circle cx="${X(pts[pts.length - 1].t).toFixed(1)}" cy="${Y(lastV).toFixed(1)}" r="3.4" class="dot"/>
      <text x="6" y="${H - 2}">${esc(new Date((t0 - S.skew) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</text><text x="${W - 6}" y="${H - 2}" text-anchor="end">${T("now")}</text></svg></div>`;
  }
  function trendCard(live) {
    const st = S.st, now = nowS();
    const series = ((S.srv && S.srv.series) || []).filter((p) => p.t);
    const pools = ((S.srv && S.srv.pools) || []).filter((p) => p.t);
    if (!series.length && !pools.length) return `<section class="ams-card vea-card vea-histc" data-vt="top"><h3>${T("Over time")}</h3><p class="vea-fine">${T(live ? "The community's numbers show here as they change." : "Opens soon.")}</p></section>`;
    const count = S.stakers != null ? S.stakers : S.srv && S.srv.totals ? S.srv.totals.stakers : null;
    const cur = st ? { t: now, staked: F(st.staked), stakers: count != null ? count : series.length ? series[series.length - 1].stakers : 0 } : null;
    const all = cur ? [...series, cur] : series;
    const perDayAt = (t) => { let v = pools.length ? pools[0].perDay : st ? F(st.perDay) : 0; for (const p of pools) if (p.t <= t) v = p.perDay; return v; };
    const rate = all.filter((p) => p.staked > 0).map((p) => ({ t: p.t, v: ((p.t >= now && st ? F(st.perDay) : perDayAt(p.t)) * 365 / p.staked) * 100 }));
    const daily = pools.length ? [...pools.map((p) => ({ t: p.t, v: p.perDay })), { t: now, v: st ? F(st.perDay) : pools[pools.length - 1].perDay }] : [];
    return `<section class="ams-card vea-card vea-histc vea-trend" data-vt="top"><h3>${T("Over time")} <small>${T("no wallet named")}</small></h3>
      <div class="vea-trs">
        ${spark(all.map((p) => ({ t: p.t, v: p.staked })), { step: true, label: "Total staked", unit: "$ARCIA" })}
        ${spark(all.map((p) => ({ t: p.t, v: p.stakers })), { step: true, label: "Stakers", fmtv: (v) => fmt(v, 0) })}
        ${spark(rate, { label: "Average yearly rate", fmtv: pct })}
        ${spark(daily, { step: true, label: "Daily rewards", unit: "$ARCIA" })}
      </div>
      <p class="vea-fine">${T("The average yearly rate is the day's $ARCIA rewards × 365 ÷ everything staked — longer locks and the boost earn more than the average, shorter ones less.")}</p></section>`;
  }
  /// v3: votes — weighted by veARCIA at the moment each one opened; free (a signed message), a choice can change until the end
  function votesCard(live) {
    const V = S.votes, u = me();
    const items = (V && V.items) || [];
    const vmsg = S.msg.vote || {};
    const list = items.map((it) => {
      const sum = it.tally.reduce((a, b) => a + b, 0);
      const lead = sum > 0 ? it.tally.indexOf(Math.max(...it.tally)) : -1;
      const mine = it.mine, w = mine && mine.weight != null ? mine.weight : null;
      const can = it.open && u && w > 0;
      const opts = it.options.map((o, k) => {
        const p = sum > 0 ? (it.tally[k] / sum) * 100 : 0;
        return `<li class="${mine && mine.choice === k ? "mine" : ""}${k === lead && !it.open ? " won" : ""}"><button type="button" data-vea="vote" data-vid="${it.id}" data-vo="${k}"${can && !S.busy ? "" : " disabled"}><span data-no-i18n>${esc(o)}</span><b data-no-i18n>${p.toFixed(p > 0 && p < 10 ? 1 : 0)}%</b><i style="--w:${p.toFixed(2)}%"></i></button><small data-no-i18n>${big(it.tally[k])} veARCIA · ${it.count[k]} ${esc(L3v(it.count[k] === 1 ? "voter" : "voters", "명", "人"))}</small></li>`;
      }).join("");
      const meLine = !u ? T("Connect a wallet to vote.")
        : w == null ? T("Checking your veARCIA at the snapshot…")
        : w > 0 ? `${T("Your veARCIA at the snapshot")}: <b data-no-i18n>${big(w)}</b>${mine.choice != null ? ` · ${T("you chose")} <b data-no-i18n>${esc(it.options[mine.choice])}</b>${it.open ? ` — ${T("you can change it until the end")}` : ""}` : it.open ? ` — ${T("pick an option to vote")}` : ""}`
        : T("This wallet had no veARCIA when this vote opened.");
      const turnout = it.total > 0 ? (sum / it.total) * 100 : 0;
      return `<article class="vea-v${it.open ? " open" : ""}" data-vid="${it.id}">
        <div class="vea-v-h"><span class="vea-v-st">${it.open ? `${T("Open")} · <b data-no-i18n data-vea-left="${it.end}">${left(it.end - nowS())}</b>` : T("Closed")}</span><small data-no-i18n>#${it.id} · ${esc(tr("snapshot"))} ${esc(when(it.snap))}</small></div>
        <b class="vea-v-t" data-no-i18n>${esc(it.title)}</b>${it.body ? `<p class="vea-v-b" data-no-i18n>${esc(it.body)}</p>` : ""}
        <ol class="vea-v-o">${opts}</ol>
        <p class="vea-v-me">${meLine}</p>
        <small class="vea-v-tu">${esc(L3v("Counted", "집계", "已计票"))}: <b data-no-i18n>${big(sum)}</b> veARCIA · <b data-no-i18n>${pct(turnout)}</b> ${T("of all veARCIA at the snapshot")} · <span data-no-i18n>${it.voters}</span> ${esc(L3v(it.voters === 1 ? "voter" : "voters", "명 투표", "人投票"))}</small>
      </article>`;
    }).join("");
    const nv = S.vnew;
    const admin = V && V.admin ? `<details class="vea-vnew"${S.vnewOpen ? " open" : ""}><summary>${T("Open a new vote")} <small>${T("owner")}</small></summary>
        <label class="vea-in sm"><span>${esc(L3v("Title", "제목", "标题"))}</span><input id="vea-vt" maxlength="120" autocomplete="off" value="${esc(nv.title)}"></label>
        <label class="vea-in sm area"><span>${T("Details")}</span><textarea id="vea-vb" maxlength="800" rows="3">${esc(nv.body)}</textarea></label>
        <label class="vea-in sm area"><span>${T("Options — one per line, 2 to 6")}</span><textarea id="vea-vo" rows="3">${esc(nv.opts)}</textarea></label>
        <div class="vea-row"><label class="vea-in sm"><span>${esc(L3v("Runs", "기간", "持续"))}</span><select id="vea-vd">${[1, 3, 5, 7, 14].map((d) => `<option value="${d}"${Number(nv.days) === d ? " selected" : ""}>${d} ${esc(tr(d === 1 ? "day" : "days"))}</option>`).join("")}</select></label>
        <button type="button" class="vea-go sm" data-vea="vnew"${S.busy ? " disabled" : ""}>${T("Sign and open")}</button></div>
        <p class="vea-fine">${T("The snapshot is taken the moment it opens: veARCIA staked after that doesn't count in this vote.")}</p></details>` : "";
    return `<section class="ams-card vea-card vea-votes" data-vt="vote"><h3>${T("Votes")} <small>${T("weighted by veARCIA")}</small></h3>
      <p class="vea-fine">${T("Free to vote: you sign a message, no gas. Each vote counts your veARCIA as of the moment it opened, so the result can't be bought afterwards.")}</p>
      ${items.length ? `<div class="vea-vl">${list}</div>` : `<p class="vea-v-none">${T(V ? "No vote yet — the first one shows here." : "Loading the votes…")}</p>`}
      ${vmsg.t ? `<p class="vea-msg ${esc(vmsg.k || "")}">${esc(vmsg.t)}</p>` : ""}
      ${admin}</section>`;
  }
  /// v3: stake for a friend — opens a position for a wallet with none (ArciaStaking.stakeFor); it's theirs from the start
  function giftCard(live) {
    const u = me(), amt = parse(S.gamt), d = S.gdays, lb = lockBps(d);
    const ve = (amt * BigInt(lb)) / 10000n;
    const okTo = /^0x[0-9a-fA-F]{40}$/.test(S.gto.trim());
    const needApprove = live && amt > 0n && S.allow != null && S.allow < amt;
    const btn = !u ? `<button type="button" class="vea-go ghost" data-vea="connect">${T("Connect wallet")}</button>`
      : `<button type="button" class="vea-go" data-vea="gift"${S.busy || !okTo || !(amt > 0n) || !live ? " disabled" : ""}>${T(needApprove ? "Approve and stake for them" : "Stake for them")}</button>`;
    return `<section class="ams-card vea-card vea-gift" data-vt="stake"><h3>${T("Stake for a friend")}</h3>
      <p class="vea-fine">${T("Open a veARCIA position for another wallet with your $ARCIA. It's theirs from the first second — their rewards, their lock, their withdrawals. Only for a wallet with no stake yet.")}</p>
      <label class="vea-in sm"><span>${T("Their wallet")}</span><input id="vea-gto" autocomplete="off" spellcheck="false" placeholder="0x…" value="${esc(S.gto)}"></label>
      <label class="vea-in sm"><span>${T("Amount")}</span><input id="vea-gamt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(S.gamt)}"><em>$ARCIA</em></label>
      <div class="vea-marks">${[1, 5, 10, 15, 20].map((x) => `<button type="button" data-vea-gd="${x}" class="${x === d ? "on" : ""}" data-no-i18n>${x}d · ${mult(lockBps(x))}</button>`).join("")}</div>
      <p class="vea-gsum">${amt > 0n ? `${T("They get")} <b data-no-i18n>${big(F(ve))}</b> veARCIA · ${esc(L3v("unlocks", "해제", "解锁"))} <span data-no-i18n>${esc(when(nowS() + d * DAY))}</span>` : T("Type an amount to see what they get.")}</p>
      ${btn}
      <p class="vea-msg ${esc((S.msg.gift || {}).k || "")}">${esc((S.msg.gift || {}).t || "")}</p></section>`;
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
    el.innerHTML = [...s].map((c, i) => (c !== prev[i] ? `<b class="r">${esc(c)}</b>` : esc(c))).join("");
  }
  function tick() {
    const v = big(liveEarned());
    const e = $("vea-earned"); if (e) roll(e, v);
    body.querySelectorAll(".vea-earned-mini").forEach((x) => roll(x, v));
    panel.querySelectorAll("[data-vea-left]").forEach((el) => { const end = Number(el.dataset.veaLeft); if (end > nowS()) el.textContent = left(end - nowS()); });
    const sn = $("vea-streamed"); if (sn) roll(sn, big(streamedNow()));
    // v3: the emblem's ring drains with the lock (full and turning with auto-renew)
    const em = panel.querySelector(".vea-emblem"), p = S.pos;
    if (em) {
      const on = !!(p && p.amount > 0n && (p.auto || p.end > nowS()));
      em.classList.toggle("vea-lk", on); em.classList.toggle("auto", on && p.auto);
      if (on) em.style.setProperty("--lk", p.auto ? "1" : Math.max(0, Math.min(1, (p.end - nowS()) / Math.max(1, p.end - p.start))).toFixed(4));
    }
  }

  // ---------------- motion ----------------
  function coinsFly(from, target) {
    if (reduce() || !from) return;
    const to = target || document.getElementById("wallet-pill-btn") || document.getElementById("wallet-slot") || document.getElementById("connect-btn");
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
  /// v3: a new veARCIA tier — the badge turns over and the perk is named
  function tierUp(t) {
    if (!t) return;
    const box = document.createElement("div");
    box.className = "vea-tierup"; box.setAttribute("role", "status");
    box.innerHTML = `<span class="vea-tb t${t}">${esc(VT[t][0])}</span><div><b>${esc(L3v(`You reached ${VT[t][0]}`, `${VT[t][0]} 달성`, `你达到了 ${VT[t][0]}`))}</b><small>${T("ARCIA chat")} <b data-no-i18n>${VT_PERK[t]}</b> ${T("messages a day")} · ${T("badge on comments")}</small></div>`;
    document.body.appendChild(box);
    if (!reduce() && typeof window.arcConfetti === "function") window.arcConfetti({ count: 60 });
    setTimeout(() => box.classList.add("out"), 5200); setTimeout(() => box.remove(), 5800);
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
    const t0 = S.pos ? veTier(F(S.pos.ve)) : 0;
    try {
      const sg = await signer();
      await fn(sg);
      say(k, ok, "ok");
      if (after) after();
      await load(); keep(paint);
      const t1 = S.pos ? veTier(F(S.pos.ve)) : 0;
      if (t1 > t0) tierUp(t1);
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
  async function doCompound(btn) {
    const r = btn ? btn.getBoundingClientRect() : null;
    await send("claim", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).compound(), "claim"); }, tr("Compounded — your rewards are staked."), () => { coinsFly(r ? { getBoundingClientRect: () => r } : null, panel.querySelector(".vea-emblem")); setTimeout(lockRing, 700); });
  }
  async function doAuto(on) { await send("wd", async (sg) => { await wait(await new ethers.Contract(ADDR(), ABI, sg).setAutoRenew(on), "wd"); }, tr(on ? "Auto-renew is on." : "Auto-renew is off — the countdown has started."), () => { if (on && !reduce()) S.autoSpin = Date.now(); }); }
  async function doGift() {
    const to = S.gto.trim(), amt = parse(S.gamt);
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return say("gift", tr("Paste the friend's wallet address (0x…)."), "bad");
    if (!(amt > 0n)) return say("gift", tr("Enter an amount first."), "bad");
    if (S.bal != null && amt > S.bal) return say("gift", tr("That's more $ARCIA than the wallet holds."), "bad");
    try { const p = await rd(ADDR(), ABI).positions(to); if (p.amount > 0n) return say("gift", tr("That wallet already has a stake — a gift opens a new position only."), "bad"); } catch { /* the contract checks it too */ }
    const d = S.gdays;
    await send("gift", async (sg) => {
      const a = ADDR();
      const al = await rd(ARCIA(), ERC20).allowance(me(), a);
      if (al < amt) { say("gift", tr("Step 1/2 — approve $ARCIA in your wallet…")); await wait(await new ethers.Contract(ARCIA(), ERC20, sg).approve(a, S.once ? ethers.MaxUint256 : amt), "gift"); say("gift", tr("Step 2/2 — confirm the stake for your friend…")); }
      await wait(await new ethers.Contract(a, ABI, sg).stakeFor(to, amt, d), "gift");
      S.gamt = "";
    }, `${tr("Done — your friend's veARCIA is earning")} (${short(to)})`, () => { if (!reduce() && typeof window.arcConfetti === "function") window.arcConfetti({ count: 40 }); });
  }
  // the signed messages api/_vearcia.mjs checks (same cleaning as the server)
  const vclean = (x, n) => String(x || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  const issuedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  async function personalSign(msg) { const bp = new ethers.BrowserProvider(walletProv(), "any"); const sg = await bp.getSigner(me()); return sg.signMessage(msg); }
  async function doVote(id, choice) {
    const it = S.votes && S.votes.items.find((x) => x.id === id); if (!it || S.busy) return;
    S.busy = true; say("vote", tr("Sign your vote in your wallet — no gas…"));
    try {
      const w = me(), issued = issuedNow();
      const msg = `veARCIA vote\nProposal: #${it.id} ${it.title}\nChoice: ${it.options[choice]}\nWallet: ${w}\nIssued: ${issued}`;
      const signature = await personalSign(msg);
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "vevote", id, choice, wallet: w, issued, signature }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "couldn't save the vote");
      say("vote", `${tr("Vote counted")} — ${big(j.weight)} veARCIA`, "ok");
      await loadVotes();
    } catch (e) { say("vote", rejected(e) ? tr("You rejected the request in your wallet.") : String(e.message || e).slice(0, 160), "bad"); }
    finally { S.busy = false; keep(paint); }
  }
  async function doVoteNew() {
    const nv = S.vnew, title = vclean(nv.title, 120), body = String(nv.body || "").trim().slice(0, 800);
    const options = String(nv.opts || "").split("\n").map((o) => vclean(o, 60)).filter(Boolean), days = Number(nv.days) || 3;
    if (title.length < 4) return say("vote", tr("Give the vote a title."), "bad");
    if (options.length < 2 || options.length > 6) return say("vote", tr("2 to 6 options, one per line."), "bad");
    if (S.busy) return;
    S.busy = true; say("vote", tr("Sign the new vote in your wallet — no gas…"));
    try {
      const w = me(), issued = issuedNow();
      const msg = `veARCIA — new proposal\nTitle: ${title}\nOptions: ${options.join(" | ")}\nRuns: ${days} days\nWallet: ${w}\nIssued: ${issued}`;
      const signature = await personalSign(msg);
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "vevotenew", title, body, options, days, wallet: w, issued, signature }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "couldn't open the vote");
      S.vnew = { title: "", body: "", opts: "", days: 3 }; S.vnewOpen = false;
      say("vote", `${tr("Vote opened")} — #${j.item.id}`, "ok");
      await loadVotes();
    } catch (e) { say("vote", rejected(e) ? tr("You rejected the request in your wallet.") : String(e.message || e).slice(0, 160), "bad"); }
    finally { S.busy = false; keep(paint); }
  }
  function ics() {
    const p = S.pos; if (!p || p.auto || !(p.end > nowS())) return;
    const z = (t) => new Date((t - (S.skew || 0)) * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE//veARCIA//EN", "BEGIN:VEVENT", `UID:vearcia-${me()}-${p.end}@arcircle.app`, `DTSTAMP:${z(nowS())}`, `DTSTART:${z(p.end)}`, `DTEND:${z(p.end + 1800)}`,
      `SUMMARY:${tr("veARCIA lock ends — withdraw free or re-lock")}`, `DESCRIPTION:${tr("Your $ARCIA lock on veARCIA ends. Re-lock to keep the multiplier, or withdraw for free.")}`, "URL:https://www.arcircle.app/arc#vearcia",
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${tr("veARCIA lock ends tomorrow")}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" })); a.download = "vearcia-unlock.ics";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
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
    const vt = veTier(F(p.ve)), tn = vt ? VT[vt][0] : "";
    const line2 = `${p.auto ? L3v("Auto-renew on", "자동갱신 켜짐", "自动续期已开启") : `${mult(p.lockBps || BPS)} ${L3v("lock", "락", "锁仓")}`}${tierOn() ? ` · ${mult(BOOST[tierOn()])} $ARCIRCLE ${L3v("boost", "부스트", "加成")}` : ""}${tn ? ` · ${tn}` : ""}`;
    const text = `${L3v(`I staked ${big(F(p.amount))} $ARCIA → ${big(F(p.ve))} veARCIA on Robinhood Chain`, `Robinhood Chain에서 ${big(F(p.amount))} $ARCIA를 스테이킹해 ${big(F(p.ve))} veARCIA를 받았어요`, `我在 Robinhood Chain 质押了 ${big(F(p.amount))} $ARCIA → ${big(F(p.ve))} veARCIA`)} 💚\n${line2}\n`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&via=ARCIRCLEonArc`, "_blank", "noopener");
  }
  async function notifyMe() {
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* fine */ }
    store.set("vea.notify", true); keep(paint);
  }

  panel.addEventListener("click", (e) => {
    const tab = e.target.closest && e.target.closest("[data-vtab]");
    if (tab) { S.tab = tab.dataset.vtab; store.set("vea.tab", S.tab); keep(paint); return; }
    const b = e.target.closest && e.target.closest("[data-vea], [data-vea-d], [data-vea-gd]");
    if (!b || b.disabled) return;
    if (b.dataset.veaD) { S.days = Number(b.dataset.veaD); S.popX = true; S.snapD = S.days; paint(); return; }
    if (b.dataset.veaGd) { S.gdays = Number(b.dataset.veaGd); keep(paint); return; }
    const k = b.dataset.vea;
    if (k === "connect") { if (typeof connectWallet === "function") connectWallet(); return; }
    if (k === "max") { if (S.bal != null) { S.amt = ethers.formatEther(S.bal); paint(); } return; }
    if (k === "wmax") { if (S.pos) { S.wamt = ethers.formatEther(S.pos.amount); paint(); } return; }
    if (k === "autoon") { doAuto(true); return; }
    if (k === "stake") doStake(false);
    else if (k === "renew") doStake(true);
    else if (k === "withdraw") doWithdraw();
    else if (k === "claim") doClaim(b);
    else if (k === "compound") doCompound(b);
    else if (k === "gift") doGift();
    else if (k === "vote") doVote(Number(b.dataset.vid), Number(b.dataset.vo));
    else if (k === "vnew") doVoteNew();
    else if (k === "ics") ics();
    else if (k === "relock") { S.days = Number(b.dataset.days) || S.days; doStake(true); }
    else if (k === "tfill") {
      S.days = Math.max(minDays(), Number(b.dataset.days) || S.days); S.amt = Number(b.dataset.amt) > 0 ? String(b.dataset.amt) : "";
      S.tab = "stake"; store.set("vea.tab", S.tab); S.popX = true; paint();
      const c = body.querySelector(".vea-stake"); if (c) c.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
      const inp = $("vea-amt"); if (inp && S.amt) { inp.classList.add("vea-flash"); setTimeout(() => inp.classList.remove("vea-flash"), 1200); }
    }
    else if (k === "boost") doBoost();
    else if (k === "share") share();
    else if (k === "notify") notifyMe();
    else if (k === "fund" || k === "defund") doPool(k);
  });
  panel.addEventListener("change", (e) => {
    const t = e.target;

    if (t.id === "vea-once") { S.once = !!t.checked; store.set("vea.once", S.once); }
    if (t.id === "vea-vd") S.vnew.days = Number(t.value) || 3;
  });
  panel.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("vea-acts")) S.histOpen = e.target.open; if (e.target.classList && e.target.classList.contains("vea-vnew")) S.vnewOpen = e.target.open; }, true);
  let typeT = 0;
  panel.addEventListener("input", (e) => {
    const id = e.target && e.target.id;
    if (id === "vea-days") {
      S.days = Number(e.target.value) || 1; e.target.style.setProperty("--p", ((S.days - 1) / 19) * 100 + "%");
      // v3: the slider snaps on 1 · 5 · 10 · 15 · 20 — a tick under the finger and a pulse on the mark
      if ([1, 5, 10, 15, 20].includes(S.days) && S.lastSnap !== S.days) { S.snapD = S.days; try { if (navigator.vibrate && !reduce()) navigator.vibrate(8); } catch { /* fine */ } }
      S.lastSnap = S.days;
      clearTimeout(typeT); typeT = setTimeout(() => { S.popX = true; keep(paint); }, 120); return;
    }
    if (id === "vea-sim") { S.sim = Number(e.target.value) || 0; clearTimeout(typeT); typeT = setTimeout(() => keep(paint), 60); return; }
    if (id === "vea-vt" || id === "vea-vb" || id === "vea-vo") { S.vnew[{ "vea-vt": "title", "vea-vb": "body", "vea-vo": "opts" }[id]] = e.target.value; return; }
    if (id === "vea-gto" || id === "vea-gamt") { S[id === "vea-gto" ? "gto" : "gamt"] = e.target.value; clearTimeout(typeT); typeT = setTimeout(() => keep(paint), 350); return; }
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
    // v3: ARCIRCLE Orders' "Stake it" after an $ARCIA buy leaves the amount here
    const pre = store.get("vea.prefill", null);
    // (v4: ARCIA's chat and calculator also leave the lock length — "stake 100k arcia 14 days")
    if (pre && pre.amt && Date.now() - (pre.at || 0) < 30 * 60e3) {
      S.amt = String(pre.amt); S.tab = "stake";
      const pd = Math.round(Number(pre.days)); if (pd >= 1 && pd <= MAXD) S.days = pd;
      store.set("vea.prefill", null); paint();
      const f = body.querySelector("#vea-amt"); if (f && f.scrollIntoView) f.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
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
  // v3: phones — the intro folds to three lines with a "Read more"
  { const lede = panel.querySelector(".vea-hero .bp-lede");
    if (lede && !lede.classList.contains("vea-fold")) {
      lede.classList.add("vea-fold");
      const b = document.createElement("button"); b.type = "button"; b.className = "vea-more"; b.textContent = tr("Read more");
      b.addEventListener("click", () => { const o = lede.classList.toggle("open"); b.textContent = tr(o ? "Show less" : "Read more"); });
      lede.insertAdjacentElement("afterend", b);
      const fit = () => { b.hidden = !(window.matchMedia && matchMedia("(max-width: 860px)").matches); };
      fit(); window.addEventListener("resize", fit);
    } }
  if (panel.classList.contains("active")) show();
  window.arcVeArcia = { state: S, load, paint, preview, lockBps, loadVotes, tierUp };
})();
