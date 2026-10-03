/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, WagmiCoreRef, wagmiConfigRef, updateNetworkBadge */
// arc-predict.js — ARCIRCLE Predict, an ARCIRCLE PAD utility (arcpad.html#predict).
// UP / DOWN rounds on Arc tokens paid in native USDC, and on graduated Pons coins on Robinhood Chain paid in ETH — one
// ArcPredict contract per chain (contracts/contracts/ArcPredict.sol, server api/_predict.mjs; ?chain=rh for Robinhood).
// Rounds run on a fixed schedule; betting on the next round opens the moment the live one locks.
//   · Market view   the live round (price to beat, live chart from the pool's swaps, countdown ring, UP / DOWN pools),
//                   the round open for bets with what a bet would pay, and a side panel: my bets + stats, last
//                   rounds, live bets, invite (referral link and earnings)
//   · All markets   every live round at once, sorted by time left or pot
//   · Leaderboard   this week and all time, by PnL, with streaks
//   · Open a market anyone burns $ARCIRCLE to list a token's pool (5m / 15m / 1h); the team lists free and can stop one
// Reads: GET /api/desk?predict=state|mine|chart|feed|lb|status[&chain=rh]. Writes go from the wallet (on Robinhood
// Chain the wallet is switched there for the write and stays there).
// Deep links: #predict?m=<market> · #predict?c=rh (Robinhood Chain) · #predict?ref=0x… (kept in this browser, used on the
// first bet) · #predict?view=lb
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-predict");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  // the chain: Arc (bets in USDC) or Robinhood Chain (bets in ETH)
  const RHC = (typeof CONFIG !== "undefined" && CONFIG.NFT) || {};
  const RH_CHAIN = 4663, RH_HEX = "0x" + RH_CHAIN.toString(16), RH_EXPL = RHC.EXPLORER || "https://robinhoodchain.blockscout.com";
  const RH_ADD = { chainId: RH_HEX, chainName: "Robinhood Chain", rpcUrls: [RHC.RPC || "https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: [RH_EXPL], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const isRH = () => S.chain === "rh";
  const EXPL = (kind, x) => `${isRH() ? RH_EXPL : (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const UNIT = () => (isRH() ? "ETH" : "USDC");
  const cq = () => (isRH() ? "c=rh&" : ""); // in a #predict? link
  const txa = (h) => (h ? ` <a class="pd-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>` : "");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n < 0 ? "−" : "") + "$" + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big$ = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : usd(n, n < 100 ? 2 : 0));
  /// an amount in the bet unit: dollars on Arc (USDC), ETH on Robinhood Chain (with "≈ $" where it helps)
  const ethS = (n) => { const a = Math.abs(n), d = a === 0 ? 0 : a >= 1 ? 3 : a >= 0.01 ? 4 : a >= 0.0001 ? 6 : 8; return (n < 0 ? "−" : "") + a.toLocaleString("en-US", { maximumFractionDigits: d }) + " ETH"; };
  const uUsd = () => (S.st && S.st.unitUsd) || null;
  const money = (n, d = 2) => (!isRH() ? usd(n, d) : n == null || !isFinite(n) ? "—" : ethS(n));
  const moneyU = (n) => (isRH() && uUsd() && n != null && isFinite(n) ? `${ethS(n)} <small class="pd-usd">≈${usd(n * uUsd())}</small>` : money(n));
  const bigM = (n) => (isRH() ? money(n) : big$(n));
  /// "≈$1" for a chip
  const dl = (x) => "≈$" + (x >= 10 ? Math.round(x) : Number(x.toPrecision(2)));
  const sig2 = (x) => Number(x.toPrecision(2));
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  /// $0.0₃5426 for tiny prices (the subscript counts the zeros after the point)
  function px(n) {
    if (n == null || !isFinite(n) || n <= 0) return "—";
    const e = S.st && S.st.pxUnit === "ETH", pre = e ? "" : "$", suf = e ? " ETH" : "";
    if (n >= 1) return pre + n.toLocaleString("en-US", { maximumFractionDigits: 4 }) + suf;
    const s = n.toFixed(20).slice(2), z = s.match(/^0*/)[0].length;
    const digits = s.slice(z, z + 4).replace(/0+$/, "") || "0";
    if (z < 3) return pre + "0." + "0".repeat(z) + digits + suf;
    return pre + "0.0" + String(z).split("").map((d) => SUB[d]).join("") + digits + suf;
  }
  const pc = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const dur = (s) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`);
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const API = "/api/desk";
  const SITE = "https://www.arcircle.app";
  const ARCIRCLE = () => (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const ABI = [
    "function bet(uint256 m, uint64 epoch, bool up, address ref) payable",
    "function claim(uint256[] ids) returns (uint256)",
    "function claimRef(uint256[] ids) returns (uint256)",
    "function addMarket((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, uint32 duration, uint32 lock) returns (uint256)",
    "function listMarket((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, uint32 duration) returns (uint256)",
    "function stop(uint256 id)",
    "function payFees()",
  ];
  const ERC20 = ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const DURS = [[300, "5 minutes"], [900, "15 minutes"], [3600, "1 hour"]];
  const LS = { amt: "arcircle.predict.amt", ref: "arcircle.predict.ref", notify: "arcircle.predict.notify", view: "arcircle.predict.view", chain: "arcircle.predict.chain" };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } } };
  const S = {
    chain: /[?&]c=rh\b/.test(location.hash) ? "rh" : /^#predict\?/.test(location.hash) ? "arc" : ls.get(LS.chain) === "rh" ? "rh" : "arc",
    st: null, m: null, view: ls.get(LS.view) === "all" ? "all" : "market", side: "bets", sort: "time", lbTab: "week",
    mine: null, feed: null, lb: null, chart: null, kstat: null, amt: "", busy: false, msg: null, smsg: null, list: null,
    booted: false, timer: 0, tick: 0, skew: 0, acct: null, cardKey: null, listKey: null, sideKey: null, lastPx: {}, lastPast: {}, notified: new Set(), lastBet: null, title0: null, claimable0: null,
  };
  const amtKey = () => LS.amt + (isRH() ? ".rh" : "");
  S.amt = ls.get(amtKey()) || "";
  const nowC = () => Date.now() / 1000 + S.skew; // chain time
  (function grabRef() { const m = /[?&]ref=(0x[0-9a-fA-F]{40})/.exec(location.hash); if (m) ls.set(LS.ref, lc(m[1])); })();
  (function grabView() { const m = /[?&]view=(lb|all)\b/.exec(location.hash); if (m) S.view = m[1]; })();

  // ---------------- skeleton ----------------
  function frame() {
    S.cardKey = S.listKey = S.sideKey = null;
    $("pd-body").innerHTML = `
      <div class="pd-chains" role="tablist" aria-label="${T("Chain")}">
        ${[["arc", "Arc", "USDC"], ["rh", "Robinhood Chain", "ETH"]].map(([k, l, u]) => `<button type="button" role="tab" class="pd-chain ${k}" data-pd-chain="${k}" aria-selected="${S.chain === k}"><i aria-hidden="true"></i><b data-no-i18n>${l}</b><small>${T("bets in")} <span data-no-i18n>${u}</span></small></button>`).join("")}
      </div>
      <div class="pd-strip" id="pd-strip"></div>
      <div class="pd-views" role="tablist" aria-label="${T("View")}">
        ${[["market", "Market"], ["all", "All markets"], ["lb", "Leaderboard"]].map(([k, l]) => `<button type="button" role="tab" data-pd-view="${k}" aria-selected="${S.view === k}">${T(l)}</button>`).join("")}
        <label class="pd-notify"><input type="checkbox" id="pd-notify"${ls.get(LS.notify) === "1" ? " checked" : ""}> <span>${T("Notify me")}</span></label>
      </div>
      <div id="pd-view-market">
        <div class="pd-mkts" id="pd-mkts" role="tablist" aria-label="${T("Markets")}"></div>
        <div class="pd-main">
          <div class="ams-card pd-round" id="pd-round"></div>
          <div class="ams-card pd-side" id="pd-side"></div>
        </div>
      </div>
      <div id="pd-view-all" class="ams-card pd-allv" hidden></div>
      <div id="pd-view-lb" class="ams-card pd-lbv" hidden></div>
      <div class="ams-card pd-list" id="pd-list"></div>`;
  }
  const skel = () => `<div class="pd-skel"><i></i><i></i><i></i></div>`;

  // ---------------- data ----------------
  /// a read for the chain picked now (a reply that lands after a switch is dropped)
  const getJ = async (q) => { const c = S.chain; try { const r = await fetch(`${API}?${q}${c === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; return j && !j.error && c === S.chain && (!j.chain || j.chain === c) ? j : null; } catch { return null; } };
  async function load() {
    const j = await getJ("predict=state");
    const c = S.chain;
    if (j && c === S.chain && (j.chain || "arc") === c) { S.st = j; if (j.now) S.skew = j.now - Date.now() / 1000; }
  }
  const acct = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function loadMine() { const a = acct(); S.acct = a; if (!a || !S.st || !S.st.live) { S.mine = null; return; } const j = await getJ(`predict=mine&u=${a}`); if (j) S.mine = j; }
  async function loadChart() { if (S.m == null || !S.st || !S.st.live) return; const j = await getJ(`predict=chart&m=${S.m}`); if (j && j.points) S.chart = j; }
  async function loadFeed() { const j = await getJ("predict=feed"); if (j) S.feed = j; }
  async function loadLb() { const j = await getJ("predict=lb"); if (j) S.lb = j; }
  async function loadStatus() { const j = await getJ("predict=status"); if (j) S.kstat = j; }
  const market = (id = S.m) => (S.st && S.st.markets ? S.st.markets.find((m) => m.id === id) || null : null);
  function pickDefault() {
    const ms = (S.st && S.st.markets) || [];
    if (!ms.length) { S.m = null; return; }
    if (S.m != null && ms.some((m) => m.id === S.m)) return;
    const hm = /^#predict\?(?:.*&)?m=(\d+)/.exec(location.hash);
    const want = hm ? Number(hm[1]) : null;
    S.m = want != null && ms.some((m) => m.id === want) ? want : (ms.find((m) => !m.stopped) || ms[0]).id;
  }
  const myBet = (rid) => (rid && S.mine && S.mine.items ? S.mine.items.find((x) => x.round === rid) || null : null);
  /// the round a bet goes into now: the next one while the live one is locked
  const betRound = (m) => (!m || m.betting == null ? null : m.next && m.next.epoch === m.betting ? { ...m.next, kind: "next" } : m.live.epoch === m.betting ? { ...m.live, kind: "live" } : null);

  // ---------------- render ----------------
  function render() {
    const st = S.st;
    if (!st) { $("pd-round").innerHTML = skel(); return; }
    if (!st.live) { soon(); return; }
    pickDefault();
    strip();
    panel.querySelectorAll("[data-pd-view]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.pdView === S.view)));
    $("pd-view-market").hidden = S.view !== "market";
    $("pd-view-all").hidden = S.view !== "all";
    $("pd-view-lb").hidden = S.view !== "lb";
    if (S.view === "market") { tabs(); card(); side(); }
    else if (S.view === "all") all();
    else lbView();
    listPanel();
  }
  function soon() {
    $("pd-strip").innerHTML = "";
    $("pd-mkts").innerHTML = "";
    $("pd-round").innerHTML = `<div class="pd-soon"><b>${T(isRH() ? "ARCIRCLE Predict on Robinhood Chain opens soon" : "ARCIRCLE Predict opens soon")}</b><span>${T(isRH() ? "Rounds on graduated Pons coins start once its contract is deployed on Robinhood Chain. Here is how a round will work:" : "Rounds start once its contract is deployed on Arc. Here is how a round will work:")}</span></div>${how()}`;
    $("pd-side").innerHTML = `<h3>${T("Your bets")}</h3><p class="pd-empty">${T("Nothing yet.")}</p>`;
    $("pd-list").hidden = true;
  }
  const how = () => isRH() ? `<ol class="pd-how"><li>${T("Each round opens with a price to beat: the coin's price in its Uniswap v4 ETH pool, after it graduated from Pons.")}</li><li>${T("Put ETH on UP or DOWN. Bets for the next round open the moment the live one locks.")}</li><li>${T("At the end the pool is read again — the winning side splits the whole pot, after a 2% fee.")}</li><li>${T("Nobody on the other side, or no move? Everyone gets their stake back.")}</li></ol>` : `<ol class="pd-how"><li>${T("Each round opens with a price to beat: the token's price in its Uniswap v4 USDC pool.")}</li><li>${T("Put USDC on UP or DOWN. Bets for the next round open the moment the live one locks.")}</li><li>${T("At the end the pool is read again — the winning side splits the whole pot, after a 2% fee.")}</li><li>${T("Nobody on the other side, or no move? Everyone gets their stake back.")}</li></ol>`;
  function strip() {
    const st = S.st, live = st.markets.filter((m) => !m.stopped).length, k = S.kstat;
    const ago = k && k.at ? Math.max(0, Math.round(nowC() - k.at)) : null;
    $("pd-strip").innerHTML = [
      [String(live), "markets live"], [String(st.rounds), "rounds played"], [bigM(st.volume), "volume"], [`${(st.feeBps / 100).toFixed(st.feeBps % 100 ? 1 : 0)}%`, "fee on wins"],
    ].map(([v, l]) => `<span class="pd-chip"><b data-no-i18n>${esc(v)}</b> ${T(l)}</span>`).join("") +
      (ago != null ? `<span class="pd-chip pd-keeper${ago > 180 ? " late" : ""}" title="${T("The keeper reads the pools at every round boundary")}"><i aria-hidden="true"></i>${T("keeper")} <b data-no-i18n>${ago < 60 ? ago + "s" : Math.round(ago / 60) + "m"}</b> ${T("ago")}</span>` : "") +
      (isRH() && st.address ? `<a class="pd-chip pd-ca" href="${EXPL("address", st.address)}" target="_blank" rel="noopener">${T("contract")} <b data-no-i18n>${short(st.address)} ↗</b></a>` : "") +
      (isRH() && uUsd() ? `<span class="pd-chip" title="${T("Prices are the pool's ETH price × ETH/USD")}"><b data-no-i18n>ETH ${usd(uUsd(), 0)}</b></span>` : "") +
      (st.paused ? `<span class="pd-chip pd-paused">${T("New bets are paused by the team. Running rounds still settle and every claim works.")}</span>` : "");
  }
  const logo = (m, cls = "") => `<span class="pd-logo ${cls}" aria-hidden="true">${m.logo ? `<img src="${esc(m.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<i data-no-i18n>${esc((m.sym || "?").slice(0, 2))}</i></span>`;
  const callTag = (b) => (b && b.call ? `<em class="pd-call ${esc(b.call)}" title="${T("ARCIA's 24-hour safety call")}">ARCIA · ${T(b.call === "safe" ? "Safe" : b.call === "risky" ? "Risky" : "Caution")}</em>` : "");
  const scoreTag = (b) => (b && b.score != null ? `<em class="pd-score ${b.score >= 70 ? "hi" : b.score >= 40 ? "mid" : "lo"}" title="${T("Token Scanner score")}" data-no-i18n>${Math.round(b.score)}/100</em>` : "");
  function tabs() {
    const ms = S.st.markets;
    $("pd-mkts").innerHTML = ms.map((m) => {
      const ch = m.price && m.live.open ? (m.price / m.live.open - 1) * 100 : null;
      return `<button type="button" role="tab" class="pd-mk${m.id === S.m ? " on" : ""}${m.stopped ? " off" : ""}" data-pd-m="${m.id}" aria-selected="${m.id === S.m}">
        ${logo(m)}<b data-no-i18n>${esc(m.sym)}</b><em data-no-i18n>${dur(m.duration)}</em><span class="pd-mk-ch ${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${ch == null ? "" : pc(ch)}</span>${m.badge && m.badge.call === "risky" ? `<i class="pd-mk-risk" title="${T("ARCIA called it Risky")}">!</i>` : ""}</button>`;
    }).join("") || `<p class="pd-empty">${T("No market yet")}</p>`;
  }

  // ---- the round card: built once per market / round / wallet, then patched in place so the animations run ----
  function phase(m) {
    const t = nowC(), r = m.live;
    if (t < r.lockAt) return { k: "open", label: tr("Bets close in"), left: r.lockAt - t, frac: (t - r.startAt) / Math.max(1, r.lockAt - r.startAt) };
    if (t < r.endAt) return { k: "locked", label: tr("Locked — ends in"), left: r.endAt - t, frac: (t - r.startAt) / Math.max(1, r.endAt - r.startAt) };
    return { k: "settling", label: tr("Ended — reading the pool…"), left: 0, frac: 1 };
  }
  const mult = (up, down, fee, side) => { const pot = up + down, s = side === "up" ? up : down; return s > 0 && pot > s ? (pot * (1 - fee)) / s : null; };
  /// a round with one side empty refunds everyone in full (no fee), so there's no "win" to show yet
  const lone = (up, down, side) => (side === "up" ? down : up) <= 0;
  const posLine = (p, up, down) => { const x = mult(up, down, S.st.feeBps / 10000, p.side), o = p.side === "up" ? "DOWN" : "UP"; return `${T("You're in")} <b data-no-i18n>${p.side.toUpperCase()}</b> ${T("with")} <b data-no-i18n>${money(p.stake)}</b>${x ? ` · ${T("if it wins ≈")} <b data-no-i18n>${money(p.stake * x)}</b>` : lone(up, down, p.side) ? ` · ${T(o === "DOWN" ? "full refund unless someone takes DOWN" : "full refund unless someone takes UP")}` : ""}`; };
  /// what `amt` on `side` would pay if that side won and nobody else came in
  const payout = (up, down, fee, side, amt) => (amt > 0 ? (amt * (up + down + amt) * (1 - fee)) / ((side === "up" ? up : down) + amt) : null);
  function card() {
    const el = $("pd-round"), m = market();
    if (!m) { el.innerHTML = `<div class="pd-soon"><b>${T("No market yet")}</b><span>${T("The team lists the first tokens soon.")}</span></div>${how()}`; S.cardKey = null; return; }
    const br = betRound(m);
    const key = `${m.id}|${m.live.epoch}|${br ? br.epoch : "-"}|${acct()}|${S.st.paused}|${m.stopped}`;
    if (key !== S.cardKey) {
      const prev = S.cardKey && S.cardKey.split("|")[0] === String(m.id) ? Number(S.cardKey.split("|")[1]) : null;
      build(m, br);
      if (prev != null && prev !== m.live.epoch && !reduce()) { el.classList.remove("pd-turn"); void el.offsetWidth; el.classList.add("pd-turn"); }
      S.cardKey = key;
    }
    patch(m, br);
    reveal(m);
  }
  function build(m, br) {
    const el = $("pd-round");
    const lim = S.st.limits;
    el.innerHTML = `
      <div class="pd-r-head">
        <div class="pd-r-tok">${logo(m, "lg")}<div><b data-no-i18n>${esc(m.sym)}</b><small><span data-no-i18n>${esc(m.name)}</span> · <a href="${EXPL("token", m.token)}" target="_blank" rel="noopener" data-no-i18n>${short(m.token)} ↗</a></small><div class="pd-tags">${scoreTag(m.badge)}${callTag(m.badge)}</div></div></div>
        <div class="pd-r-id">${T("Round")} <b data-no-i18n>#${m.live.epoch + 1}</b><em data-no-i18n>${dur(m.duration)}</em>${m.stopped ? `<i class="pd-off">${T("Stopped")}</i>` : ""}<button type="button" class="pd-ico" data-pd-act="sharem" title="${T("Share this market")}" aria-label="${T("Share this market")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg></button></div>
      </div>
      <div class="pd-live">
        <div class="pd-prices">
          <div class="pd-pr"><small>${T("Price to beat")}</small><b data-k="open" data-no-i18n></b></div>
          <div class="pd-pr now" data-k="nowbox"><small>${T("Now")}</small><b data-k="now" data-no-i18n></b><span data-k="ch" data-no-i18n></span></div>
          <div class="pd-ring" data-k="ring" aria-hidden="true"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19" pathLength="100"/></svg><b data-k="left" data-no-i18n></b></div>
        </div>
        <div class="pd-phase"><span data-k="phase"></span></div>
        <div class="pd-chart" data-k="chart" aria-label="${T("Price through this round")}"></div>
        <div class="pd-pools" data-k="pools">
          <div class="pd-pool up"><small>UP <i data-k="upPct" data-no-i18n></i></small><b data-k="upAmt" data-no-i18n></b><em data-k="upX" data-no-i18n></em></div>
          <div class="pd-bar" aria-hidden="true"><i data-k="bar"></i></div>
          <div class="pd-pool down"><small><i data-k="downPct" data-no-i18n></i> DOWN</small><b data-k="downAmt" data-no-i18n></b><em data-k="downX" data-no-i18n></em></div>
          <div class="pd-lockov" data-k="lockov" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><b>LOCKED</b><span>${T("Bets are on the next round")}</span></div>
        </div>
        <div class="pd-pos" data-k="livepos" hidden></div>
      </div>
      <div class="pd-bet${br && !S.st.paused ? "" : " dis"}" data-k="betbox">
        <div class="pd-bet-h"><b>${br ? (br.kind === "next" ? `${T("Next round")} <span data-no-i18n>#${br.epoch + 1}</span>` : `${T("This round")} <span data-no-i18n>#${br.epoch + 1}</span>`) : T("No round open for bets")}</b><small data-k="bethint"></small></div>
        <div class="pd-mini" data-k="betpools"></div>
        <div class="pd-amt"><input id="pd-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="${UNIT()}" value="${esc(S.amt)}" aria-label="${T(isRH() ? "ETH to put in" : "USDC to put in")}"${br ? "" : " disabled"}>${isRH() ? `<small class="pd-amtusd" data-k="amtusd" data-no-i18n></small>` : ""}
          <div class="pd-chips">${chips(lim).map(([v, l]) => `<button type="button" data-pd-amt="${v}"${br ? "" : " disabled"} title="${esc(money(v))}" data-no-i18n>${esc(l)}</button>`).join("")}</div></div>
        <div class="pd-go"><button type="button" class="pd-up" data-pd-bet="up"><span>UP <i aria-hidden="true">▲</i></span><small data-k="payUp"></small></button>
          <button type="button" class="pd-down" data-pd-bet="down"><span>DOWN <i aria-hidden="true">▼</i></span><small data-k="payDown"></small></button></div>
        <div class="pd-pos" data-k="betpos" hidden></div>
        <button type="button" class="pd-again" data-pd-act="again" data-k="again" hidden></button>
        <p class="pd-small"><span data-no-i18n>${money(lim.minBet)}–${money(lim.maxBet)}${isRH() && uUsd() ? ` (≈${usd(lim.minBet * uUsd())}–${usd(lim.maxBet * uUsd())})` : ""}</span> ${T(isRH() ? "a round per wallet · one side per round · paid out in ETH on Robinhood Chain" : "a round per wallet · one side per round · paid out in USDC on Arc")} · ${T("no approval needed")}</p>
        <p class="pd-msg${S.msg ? " " + S.msg.cls : ""}" aria-live="polite">${S.msg ? S.msg.h : ""}</p>
      </div>
      <div class="pd-stamp" data-k="stamp" aria-live="polite" hidden></div>`;
  }
  /// quick amounts: $1 / $2 / the max on Arc; on Robinhood Chain about $1 / $2 / $5 in ETH (within the limits)
  function chips(lim) {
    if (!isRH()) return [1, 2, lim.maxBet].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => [v, "$" + v]);
    const u = uUsd();
    const vs = u ? [1, 2, 5].map((d) => Math.min(lim.maxBet, Math.max(lim.minBet, sig2(d / u)))) : [lim.minBet, sig2(lim.maxBet / 2), lim.maxBet];
    return vs.filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => [v, u ? dl(v * u) : ethS(v)]);
  }
  const K = (k) => panel.querySelector(`#pd-round [data-k="${k}"]`);
  const setT = (k, v) => { const e = K(k); if (e && e.textContent !== v) e.textContent = v; return e; };
  function patch(m, br) {
    const fee = S.st.feeBps / 10000, r = m.live, ph = phase(m);
    setT("open", r.openPending ? tr("set at the start") : px(r.open));
    const nowEl = setT("now", px(m.price));
    const last = S.lastPx[m.id];
    if (nowEl && last != null && m.price != null && last !== m.price && !reduce()) { nowEl.classList.remove("flash-up", "flash-down"); void nowEl.offsetWidth; nowEl.classList.add(m.price > last ? "flash-up" : "flash-down"); }
    S.lastPx[m.id] = m.price;
    const ch = m.price && r.open ? (m.price / r.open - 1) * 100 : null;
    setT("ch", ch == null ? "" : (ch > 0 ? "▲ " : ch < 0 ? "▼ " : "") + pc(ch));
    const nb = K("nowbox"); if (nb) nb.className = "pd-pr now " + (ch > 0 ? "up" : ch < 0 ? "down" : "");
    ring(m, ph);
    const up = r.up, down = r.down, pot = up + down, upPct = pot > 0 ? (up / pot) * 100 : 50;
    setT("upAmt", money(up)); setT("downAmt", money(down));
    setT("upPct", pot > 0 ? Math.round(upPct) + "%" : ""); setT("downPct", pot > 0 ? Math.round(100 - upPct) + "%" : "");
    const mu = mult(up, down, fee, "up"), md = mult(up, down, fee, "down");
    setT("upX", mu ? mu.toFixed(2) + "×" : "—"); setT("downX", md ? md.toFixed(2) + "×" : "—");
    const bar = K("bar"); if (bar) bar.style.width = upPct.toFixed(1) + "%";
    const lov = K("lockov"); if (lov) lov.hidden = ph.k === "open" || !br || br.kind !== "next";
    const lp = myBet(r.id);
    const lpe = K("livepos");
    // the round open for bets shows its own position line; the live one only when they're different rounds
    if (lpe) { lpe.hidden = !lp || (br && br.id && br.id === r.id); if (lp && !lpe.hidden) { lpe.className = "pd-pos " + lp.side; lpe.innerHTML = posLine(lp, up, down); } }
    chartDraw(m);
    // the betting box
    const bb = K("betbox");
    const amt = Number(String(($("pd-amt") || {}).value || S.amt || "").replace(/,/g, ""));
    if (isRH()) setT("amtusd", amt > 0 && uUsd() ? "≈" + usd(amt * uUsd()) : "");
    if (br) {
      const bu = br.up, bd = br.down, bp = myBet(br.id);
      setT("bethint", br.kind === "next" ? `${tr("starts in")} ${mmss(br.startAt - nowC())} · ${tr("price to beat set when it starts")}` : `${tr("bets close in")} ${mmss(br.lockAt - nowC())}`);
      const mp = K("betpools");
      if (mp) mp.innerHTML = br.kind === "next" ? `<span>UP <b data-no-i18n>${money(bu)}</b></span><span>DOWN <b data-no-i18n>${money(bd)}</b></span>` : "";
      const pu = payout(bu, bd, fee, "up", amt), pdn = payout(bu, bd, fee, "down", amt);
      setT("payUp", pu ? (lone(bu, bd, "up") ? tr("refund if no DOWN") : `${tr("wins ≈")} ${money(pu)}`) : tr("price ends higher"));
      setT("payDown", pdn ? (lone(bu, bd, "down") ? tr("refund if no UP") : `${tr("wins ≈")} ${money(pdn)}`) : tr("price ends lower"));
      const can = !S.st.paused && nowC() < br.lockAt;
      panel.querySelectorAll("#pd-round [data-pd-bet]").forEach((b) => { b.disabled = !can || (bp && bp.side !== b.dataset.pdBet); });
      if (bb) bb.classList.toggle("dis", !can);
      const bpe = K("betpos");
      if (bpe) { bpe.hidden = !bp; if (bp) { bpe.className = "pd-pos " + bp.side; bpe.innerHTML = posLine(bp, bu, bd); } }
      // the same bet again, on the round now open, when the last one was on an earlier round of this market
      const again = K("again"), L = S.lastBet;
      if (again) {
        const show = L && L.m === m.id && L.epoch < br.epoch && !bp && can;
        again.hidden = !show;
        if (show) again.innerHTML = `↻ ${T("Same bet on this round")}: <b data-no-i18n>${L.side.toUpperCase()} ${money(L.amt)}</b>`;
      }
    } else {
      setT("bethint", m.stopped ? tr("This market is stopped.") : "");
      panel.querySelectorAll("#pd-round [data-pd-bet]").forEach((b) => { b.disabled = true; });
    }
  }
  function ring(m, ph) {
    const r = K("ring");
    if (!r) return;
    r.style.setProperty("--f", (Math.min(1, Math.max(0, ph.frac || 0)) * 100).toFixed(2));
    r.className = `pd-ring pd-ph-${ph.k}${ph.left > 0 && ph.left <= 10 ? " pulse" : ""}`;
    setT("left", ph.left ? mmss(ph.left) : "…");
    setT("phase", ph.label);
  }
  function chartDraw(m) {
    const box = K("chart");
    if (!box) return;
    const c = S.chart && S.chart.market === m.id ? S.chart : null;
    const r = m.live, x0 = r.startAt - m.duration / 2, x1 = r.endAt;
    const pts = ((c && c.points) || []).filter((p) => p[0] >= x0 - m.duration);
    // the price before the window holds until the first swap inside it
    const before = pts.filter((p) => p[0] < x0).pop();
    const inside = pts.filter((p) => p[0] >= x0);
    const series = [[x0, before ? before[1] : inside.length ? inside[0][1] : m.price], ...inside, [Math.min(nowC(), x1), m.price]].filter((p) => p[1] > 0);
    if (series.length < 2 || !m.price) { box.innerHTML = `<div class="pd-chart-empty">${T("No trades yet in this round — the line starts with the first swap.")}</div>`; return; }
    const Wd = 600, Hd = 150, pad = 8;
    const vals = series.map((p) => p[1]).concat(r.open ? [r.open] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < hi * 0.002) { lo *= 0.998; hi *= 1.002; }
    const X = (t) => ((t - x0) / Math.max(1, x1 - x0)) * Wd, Y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (Hd - pad * 2);
    let d = "";
    series.forEach((p, i) => { const x = X(Math.max(x0, p[0])).toFixed(1), y = Y(p[1]).toFixed(1); d += i ? ` H${x} V${y}` : `M${x} ${y}`; });
    const lastX = X(series[series.length - 1][0]).toFixed(1);
    const oy = r.open ? Y(r.open).toFixed(1) : null;
    const area = oy ? `${d} V${oy} H${X(x0).toFixed(1)} Z` : "";
    const id = "pdc" + m.id;
    box.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" role="img" aria-label="${T("Price through this round")}">
      <defs><clipPath id="${id}a"><rect x="0" y="0" width="${Wd}" height="${oy || Hd}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${oy || 0}" width="${Wd}" height="${Hd}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39ff88" stop-opacity=".32"/><stop offset="1" stop-color="#39ff88" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5c8a" stop-opacity=".32"/><stop offset="1" stop-color="#ff5c8a" stop-opacity="0"/></linearGradient></defs>
      <rect class="pd-c-pre" x="0" y="0" width="${X(r.startAt).toFixed(1)}" height="${Hd}"/>
      <line class="pd-c-lock" x1="${X(r.lockAt).toFixed(1)}" x2="${X(r.lockAt).toFixed(1)}" y1="0" y2="${Hd}"/>
      ${oy ? `<path d="${area}" fill="url(#${id}g)" clip-path="url(#${id}a)"/><path d="${area}" fill="url(#${id}r)" clip-path="url(#${id}b)"/>` : ""}
      ${oy ? `<g clip-path="url(#${id}a)"><path class="pd-c-line up" d="${d}"/></g><g clip-path="url(#${id}b)"><path class="pd-c-line down" d="${d}"/></g><line class="pd-c-open" x1="0" x2="${Wd}" y1="${oy}" y2="${oy}"/>` : `<path class="pd-c-line" d="${d}"/>`}
      <circle class="pd-c-dot" cx="${lastX}" cy="${Y(m.price).toFixed(1)}" r="4"/></svg>
      ${oy ? `<span class="pd-c-tag" style="top:${((oy / Hd) * 100).toFixed(1)}%" data-no-i18n>${esc(px(r.open))}</span>` : ""}`;
  }
  /// a round of this market just settled: its result stamped on the card; a win of yours floats up
  function reveal(m) {
    const p = m.past && m.past[0];
    const prev = S.lastPast[m.id];
    S.lastPast[m.id] = p ? p.id : 0;
    if (!p || prev === undefined || prev === p.id || nowC() - p.endAt > 600) return;
    const st = K("stamp");
    if (!st) return;
    const k = p.result === "up" ? "up" : p.result === "down" ? "down" : "refund";
    const mine = myBet(p.id);
    const won = mine && mine.side === p.result;
    const winSide = p.result === "up" ? p.up : p.down;
    const profit = won && winSide > 0 ? (mine.stake * (p.up + p.down) * (1 - (p.feeBps || 0) / 10000)) / winSide - mine.stake : 0;
    st.className = `pd-stamp ${k}${reduce() ? " still" : ""}`;
    st.innerHTML = `<b>${k === "refund" ? T("REFUND") : `${k === "up" ? "▲ UP" : "▼ DOWN"} ${T("WINS")}`}</b><span data-no-i18n>#${p.epoch + 1} · ${px(p.open)} → ${px(p.close)}</span>${won ? `<em data-no-i18n>+${money(profit)}</em>` : ""}`;
    st.hidden = false;
    if (won && !reduce()) confetti(st);
    clearTimeout(S.stampT);
    S.stampT = setTimeout(() => { st.hidden = true; }, 3600);
  }
  function confetti(host) {
    const box = document.createElement("div");
    box.className = "pd-confetti";
    for (let i = 0; i < 18; i++) { const s = document.createElement("i"); s.style.setProperty("--x", (Math.random() * 2 - 1).toFixed(2)); s.style.setProperty("--d", (Math.random() * 0.4).toFixed(2) + "s"); s.style.setProperty("--h", Math.floor(Math.random() * 360)); box.appendChild(s); }
    host.appendChild(box);
    setTimeout(() => box.remove(), 1800);
  }

  // ---- side panel: my bets · last rounds · live bets · invite ----
  function side() {
    const el = $("pd-side");
    const tabsH = `<div class="pd-stabs" role="tablist">${[["bets", "Your bets"], ["past", "Last rounds"], ["feed", "Live bets"], ["invite", "Invite"]].map(([k, l]) => `<button type="button" role="tab" data-pd-side="${k}" aria-selected="${S.side === k}">${T(l)}${k === "bets" && S.mine && S.mine.claimable > 0 ? ` <i class="pd-dot" aria-hidden="true"></i>` : ""}</button>`).join("")}</div>`;
    let body = "";
    if (S.side === "bets") body = sideBets();
    else if (S.side === "past") body = sidePast();
    else if (S.side === "feed") body = sideFeed();
    else body = sideInvite();
    const html = tabsH + `<div class="pd-sbody">${body}</div>`;
    if (html !== S.sideKey) { el.innerHTML = html; S.sideKey = html; }
  }
  const mkName = (id) => { const mk = market(id); return mk ? `${mk.sym} ${dur(mk.duration)}` : "—"; };
  function sideBets() {
    const a = acct();
    if (!a) return `<p class="pd-empty">${T("Connect a wallet to see your bets and claim what you won.")}</p><button type="button" class="pd-btn" data-pd-act="connect">${T("Connect wallet")}</button>${how()}`;
    const M = S.mine;
    if (!M) return skel();
    const st = M.stats;
    const items = (M.items || []).slice(0, 12);
    const res = (x) => x.result === "open" ? `<em class="pd-live">${T("live")}</em>` : x.result === "refund" ? `<em>${T("refund")}</em>` : x.result === x.side ? `<em class="win">${T("won")}</em>` : `<em class="lost">${T("lost")}</em>`;
    return (M.claimable > 0 ? `<div class="pd-claim glow"><div><small>${T("Ready to claim")}</small><b data-no-i18n>${moneyU(M.claimable)}</b></div><button type="button" class="pd-btn go" data-pd-act="claim">${T("Claim")}</button></div>` : "") +
      (st ? `<div class="pd-stats4"><div><small>${T("PnL")}</small><b class="${st.pnl >= 0 ? "up" : "down"}" data-no-i18n>${st.pnl >= 0 ? "+" : ""}${money(st.pnl)}</b></div><div><small>${T("Win rate")}</small><b data-no-i18n>${st.wins + st.losses ? Math.round((st.wins / (st.wins + st.losses)) * 100) + "%" : "—"}</b></div><div><small>${T("Streak")}</small><b data-no-i18n>${st.streak} · ${T("best")} ${st.best}</b></div><div><small>${T("Volume")}</small><b data-no-i18n>${bigM(st.vol)}</b></div></div>` : "") +
      (items.length ? `<div class="pd-bets">${items.map((x) => `<div class="pd-b ${x.side}"><span data-no-i18n>#${x.epoch != null ? x.epoch + 1 : x.round}</span><b data-no-i18n>${esc(mkName(x.market))}</b><i data-no-i18n>${x.side.toUpperCase()}</i><span data-no-i18n>${money(x.stake)}</span>${res(x)}${x.claimable > 0 ? `<small class="win" data-no-i18n>+${money(x.claimable)}</small>` : x.claimed ? `<small>${T("claimed")}</small>` : "<small></small>"}${x.result !== "open" ? `<button type="button" class="pd-ico sm" data-pd-share="${x.round}" title="${T("Share")}" aria-label="${T("Share")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg></button>` : "<span></span>"}</div>`).join("")}</div>` : `<p class="pd-empty">${T("No bets in the recent rounds.")}</p>${how()}`);
  }
  function sidePast() {
    const m = market();
    const rows = (m && m.past) || [];
    return rows.length ? `<div class="pd-hist">${rows.map((r) => {
      const ch = r.open && r.close ? (r.close / r.open - 1) * 100 : null;
      const k = r.result === "up" ? "up" : r.result === "down" ? "down" : "refund";
      return `<div class="pd-h ${k}"><i aria-hidden="true">${k === "up" ? "▲" : k === "down" ? "▼" : "↺"}</i><span data-no-i18n>#${r.epoch + 1}</span><b>${T(k === "refund" ? "Refund" : k.toUpperCase())}</b><em data-no-i18n>${ch == null ? "" : pc(ch)}</em><small data-no-i18n>${money(r.up + r.down)}</small><button type="button" class="pd-ico sm" data-pd-share="${r.id}" title="${T("Share")}" aria-label="${T("Share")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg></button></div>`;
    }).join("")}</div>` : `<p class="pd-empty">${T("No settled rounds with bets yet.")}</p>${how()}`;
  }
  function sideFeed() {
    const it = (S.feed && S.feed.items) || [];
    if (!it.length) return `<p class="pd-empty">${T("No bets in the last hour.")}</p>`;
    const ago = (t) => { const d = Math.max(0, nowC() - t); return d < 60 ? `${Math.round(d)}s` : d < 3600 ? `${Math.round(d / 60)}m` : `${Math.round(d / 3600)}h`; };
    return `<div class="pd-feed">${it.map((x) => `<div class="pd-f ${x.up ? "up" : "down"}"><i aria-hidden="true">${x.up ? "▲" : "▼"}</i><span data-no-i18n>${short(x.user)}</span><b data-no-i18n>${x.up ? "UP" : "DOWN"} ${money(x.amount)}</b><em data-no-i18n>${esc(mkName(x.market))}</em><small data-no-i18n>${ago(x.t)}</small></div>`).join("")}</div>`;
  }
  function sideInvite() {
    const a = acct(), share = (S.st.refShare / 100).toFixed(0);
    const intro = `<p class="pd-small pd-lead">${T("Share your link. When a wallet's first bet comes through it, you earn")} <b data-no-i18n>${share}%</b> ${T("of the fee it pays on every round with a winner — forever, claimable any time.")}</p>`;
    if (!a) return intro + `<button type="button" class="pd-btn" data-pd-act="connect">${T("Connect wallet")}</button>`;
    const link = `${SITE}/arc#predict?${cq()}ref=${a}`;
    const R = (S.mine && S.mine.ref) || {};
    return intro + `<div class="pd-row"><input type="text" readonly value="${esc(link)}" id="pd-reflink" aria-label="${T("Your invite link")}" data-no-i18n><button type="button" class="pd-btn" data-pd-act="copyref">${T("Copy")}</button><button type="button" class="pd-btn" data-pd-act="xref">${T("Post on X")}</button></div>
      <div class="pd-stats4"><div><small>${T("Wallets via you")}</small><b data-no-i18n>${R.invited || 0}</b></div><div><small>${T("Earned")}</small><b data-no-i18n>${money(R.earned || 0)}</b></div><div><small>${T("To claim")}</small><b class="up" data-no-i18n>${money(R.claimable || 0)}</b></div><div><small>${T("Your referrer")}</small><b data-no-i18n>${R.referrer ? short(R.referrer) : "—"}</b></div></div>
      ${R.claimable > 0 ? `<button type="button" class="pd-btn go" data-pd-act="claimref">${T("Claim referral earnings")}</button>` : ""}`;
  }

  // ---- all markets ----
  function all() {
    const el = $("pd-view-all"), t = nowC();
    const ms = S.st.markets.filter((m) => !m.stopped).slice();
    ms.sort((a, b) => (S.sort === "pot" ? (b.live.up + b.live.down) - (a.live.up + a.live.down) : (a.live.endAt - t) - (b.live.endAt - t)));
    el.innerHTML = `<div class="pd-all-h"><h3>${T("Every live round")}</h3><div class="pd-sort">${[["time", "Ending soon"], ["pot", "Biggest pot"]].map(([k, l]) => `<button type="button" class="pd-btn${S.sort === k ? " on" : ""}" data-pd-sort="${k}">${T(l)}</button>`).join("")}</div></div>
      <div class="pd-grid">${ms.map((m) => {
        const ph = phase(m), pot = m.live.up + m.live.down, upPct = pot > 0 ? (m.live.up / pot) * 100 : 50;
        const ch = m.price && m.live.open ? (m.price / m.live.open - 1) * 100 : null;
        return `<button type="button" class="pd-tile" data-pd-go="${m.id}">
          <span class="pd-tile-h">${logo(m)}<b data-no-i18n>${esc(m.sym)}</b><em data-no-i18n>${dur(m.duration)}</em></span>
          <span class="pd-ring sm pd-ph-${ph.k}" style="--f:${(Math.min(1, Math.max(0, ph.frac || 0)) * 100).toFixed(1)}"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19" pathLength="100"/></svg><b data-pd-tleft="${m.id}" data-no-i18n>${ph.left ? mmss(ph.left) : "…"}</b></span>
          <span class="pd-tile-px"><b data-no-i18n>${px(m.price)}</b><i class="${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${ch == null ? "" : pc(ch)}</i></span>
          <span class="pd-tile-bar" style="--up:${upPct.toFixed(1)}%"><i></i></span>
          <span class="pd-tile-f"><span data-no-i18n>UP ${money(m.live.up)}</span><span data-no-i18n>${money(m.live.down)} DOWN</span></span></button>`;
      }).join("") || `<p class="pd-empty">${T("No market yet")}</p>`}</div>`;
  }

  // ---- leaderboard ----
  function lbView() {
    const el = $("pd-view-lb"), L = S.lb;
    if (!L) { el.innerHTML = skel(); return; }
    const rows = (L[S.lbTab] || []).slice(0, 25), a = acct();
    el.innerHTML = `<div class="pd-all-h"><h3>${T("Leaderboard")}</h3><div class="pd-sort">${[["week", "This week"], ["all", "All time"]].map(([k, l]) => `<button type="button" class="pd-btn${S.lbTab === k ? " on" : ""}" data-pd-lb="${k}">${T(l)}</button>`).join("")}</div></div>
      <p class="pd-small">${T("Profit and loss from settled rounds (winnings minus stakes). Refunds don't count.")} <span data-no-i18n>${L.players || 0}</span> ${T("players")} · <span data-no-i18n>${L.rounds || 0}</span> ${T("rounds")}</p>
      ${rows.length ? `<div class="pd-lb"><div class="pd-lb-r head"><span>#</span><span>${T("Wallet")}</span><span>${T("PnL")}</span><span>${T("Volume")}</span><span>${T("W / L")}</span></div>${rows.map((r, i) => `<div class="pd-lb-r${r.user === a ? " me" : ""}${i < 3 ? " top" : ""}"><span class="pd-rank r${i + 1}" data-no-i18n>${i + 1}</span><a href="${EXPL("address", r.user)}" target="_blank" rel="noopener" data-no-i18n>${short(r.user)}</a><b class="${r.pnl >= 0 ? "up" : "down"}" data-no-i18n>${r.pnl >= 0 ? "+" : ""}${money(r.pnl)}</b><span data-no-i18n>${bigM(r.vol)}</span><span data-no-i18n>${r.wins}/${r.losses}</span></div>`).join("")}</div>` : `<p class="pd-empty">${T("Nobody yet — the first settled rounds fill this in.")}</p>`}
      ${L.streaks && L.streaks.length && L.streaks[0].best > 1 ? `<h4>${T("Longest win streaks")}</h4><div class="pd-streaks">${L.streaks.filter((s) => s.best > 1).slice(0, 5).map((s) => `<span class="pd-chip"><b data-no-i18n>${s.best}</b> <span data-no-i18n>${short(s.user)}</span></span>`).join("")}</div>` : ""}`;
  }

  // ---- open a market (anyone with $ARCIRCLE; the team free) ----
  function listPanel() {
    const el = $("pd-list"), st = S.st, a = acct();
    const staff = a && (a === st.owner || a === st.operator);
    const L = S.list || {};
    const key = `${a}|${st.listing.open}|${st.listing.burn}|${JSON.stringify(L)}|${S.view}|${S.m}`;
    el.hidden = !(st.listing.open || staff);
    if (el.hidden || key === S.listKey) return;
    S.listKey = key;
    const m = market();
    if (isRH()) { el.innerHTML = listPanelRH(staff, a, L, m); return; }
    const warn = L.badge && (L.badge.call === "risky" || (L.badge.score != null && L.badge.score < 40));
    el.innerHTML = `<h3>${T("Open a market")} ${staff ? `<small data-no-i18n>${a === st.owner ? "owner" : "operator"}</small>` : ""}</h3>
      <p class="pd-small">${staff ? T("The team lists free, with any round length and lock.") : `${T("Burn")} <b data-no-i18n>${Number(st.listing.burn).toLocaleString("en-US")} $ARCIRCLE</b> ${T("to open a market for any Arc token's Uniswap v4 USDC pool with at least")} <b data-no-i18n>${bigM(st.listing.minUsdc || 0)}</b> ${T("of USDC in range. Its rounds start right away.")}`}</p>
      <div class="pd-row"><input type="text" id="pd-lt" placeholder="${T("Arc token address (0x…)")}" value="${esc(L.t || "")}" spellcheck="false"><button type="button" class="pd-btn" data-pd-act="pools">${T("Find its USDC pools")}</button></div>
      ${L.pools ? (L.pools.length ? `<div class="pd-pools-l">${L.pools.map((p, i) => `<label class="pd-pl"><input type="radio" name="pd-pl" value="${i}"${i === (L.pick || 0) ? " checked" : ""}><b>${esc(p.venue || "Uniswap v4")}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.dex && p.dex.liqUsd ? " · " + bigM(p.dex.liqUsd) : ""}</span><small data-no-i18n>${short(p.id)}</small></label>`).join("")}</div>` : `<p class="pd-empty">${T("No Uniswap v4 pool against USDC found for this token.")}</p>`) : ""}
      ${L.badge ? `<div class="pd-tags">${scoreTag(L.badge)}${callTag(L.badge)}</div>${warn ? `<p class="pd-warn">${T("Token Scanner or ARCIA flags this token. Think twice before opening rounds on it.")}</p>` : ""}` : ""}
      <div class="pd-row pd-durs">${DURS.map(([s, l]) => `<button type="button" class="pd-btn${(L.d || 300) === s ? " on" : ""}" data-pd-dur="${s}">${T(l)}</button>`).join("")}</div>
      <button type="button" class="pd-btn go" data-pd-act="add"${L.pools && L.pools.length && !(warn && !staff && L.badge.call === "risky") ? "" : " disabled"}>${staff ? T("List it") : T("Burn and open it")}</button>
      ${staff && m ? `<div class="pd-staff2"><span>${T("This market")}: <b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b> · ${T(m.stopped ? "stopped" : "running")}</span>${m.stopped ? "" : `<button type="button" class="pd-btn" data-pd-act="stop">${T("Stop after the round open for bets")}</button>`}<button type="button" class="pd-btn" data-pd-act="fees">${T("Send fees to the fee burn")}</button><a href="${EXPL("address", st.address)}" target="_blank" rel="noopener" data-no-i18n>${short(st.address)} ↗</a></div>` : ""}
      <p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`;
  }

  /// Robinhood Chain: the team lists a graduated Pons coin (its pool key comes from the Pons factory, server-side)
  function listPanelRH(staff, a, L, m) {
    const st = S.st, P = L.pons;
    const staffRow = staff && m ? `<div class="pd-staff2"><span>${T("This market")}: <b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b> · ${T(m.stopped ? "stopped" : "running")}</span>${m.stopped ? "" : `<button type="button" class="pd-btn" data-pd-act="stop">${T("Stop after the round open for bets")}</button>`}<button type="button" class="pd-btn" data-pd-act="fees">${T("Send fees to the treasury")}</button><a href="${EXPL("address", st.address)}" target="_blank" rel="noopener" data-no-i18n>${short(st.address)} ↗</a></div>` : "";
    return `<h3>${T("List a Pons coin")} <small data-no-i18n>${a === st.owner ? "owner" : "operator"}</small></h3>
      <p class="pd-small">${T("Graduated Pons V2 coins only — the coin's Uniswap v4 pool against ETH. Coins still on their bonding curve can't be listed.")}</p>
      <div class="pd-row"><input type="text" id="pd-lt" placeholder="${T("Pons coin address (0x…)")}" value="${esc(L.t || "")}" spellcheck="false"><button type="button" class="pd-btn" data-pd-act="pons">${T("Check it")}</button></div>
      ${P ? `<div class="pd-pons">${P.image ? `<img src="${esc(P.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<b data-no-i18n>$${esc(P.symbol || "?")}</b><span data-no-i18n>${esc(P.name || "")}</span><em data-no-i18n>${P.priceUsd != null ? "$" + Number(P.priceUsd).toPrecision(3) : P.priceEth != null ? ethS(P.priceEth) : ""}</em><small data-no-i18n>${short(P.poolId)}</small></div>` : ""}
      <div class="pd-row pd-durs">${DURS.map(([sec, l]) => `<button type="button" class="pd-btn${(L.d || 300) === sec ? " on" : ""}" data-pd-dur="${sec}">${T(l)}</button>`).join("")}</div>
      <button type="button" class="pd-btn go" data-pd-act="add"${P && staff ? "" : " disabled"}>${T("List it")}</button>
      ${staffRow}
      <p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`;
  }
  async function checkPons() {
    const t = String(($("pd-lt") || {}).value || "").trim();
    S.list = Object.assign({}, S.list, { t, pons: null });
    S.listKey = null;
    if (!isAddr(t)) { listPanel(); sayList(T("Paste a Pons coin address (0x…)."), "err"); return; }
    listPanel();
    sayList(T("Reading it from Pons…"));
    let j = null;
    try { const r = await fetch(`${API}?chain=rh&predict=pons&token=${t}`, { cache: "no-store" }); j = await r.json(); } catch { j = null; }
    S.listKey = null;
    if (!j || j.error) { listPanel(); sayList(esc(j && j.error ? tr(j.error) : tr("Couldn't read it — try again.")), "err"); return; }
    S.list = Object.assign({}, S.list, { pons: j });
    S.smsg = null;
    listPanel();
  }

  // ---------------- writes ----------------
  // keeps the page from reloading (arc-shared.js) while the wallet moves to Robinhood Chain
  function holdChain(on) {
    if (on) { clearTimeout(holdChain.t); window.arcChainSwitching = true; try { sessionStorage.setItem("wallet.autoSwitch." + acct(), "1"); } catch { /* fine */ } }
    else holdChain.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000);
  }
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  async function rhSigner() {
    if ((typeof state === "undefined" || !state.account) && typeof connectWallet === "function") await connectWallet();
    if (!acct()) throw new Error(tr("Connect a wallet first."));
    holdChain(true);
    try {
      let done = false;
      if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
        try { const ac = WagmiCoreRef.getAccount(wagmiConfigRef); if (ac && ac.isConnected) { if (Number(ac.chainId) !== RH_CHAIN) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: RH_CHAIN, addEthereumChainParameter: RH_ADD }); done = true; } } catch (e) { if (rejected(e)) throw e; }
      }
      const p = walletProv();
      if (!p) throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
      if (!done && Number.parseInt(await p.request({ method: "eth_chainId" }), 16) !== RH_CHAIN) {
        try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: RH_HEX }] }); }
        catch (e) { if (rejected(e)) throw e; await p.request({ method: "wallet_addEthereumChain", params: [RH_ADD] }); await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: RH_HEX }] }).catch(() => {}); }
      }
      const bp = new ethers.BrowserProvider(p, "any");
      for (let i = 0; i < 6; i++) {
        if (Number((await bp.getNetwork()).chainId) === RH_CHAIN) { try { if (typeof updateNetworkBadge === "function") updateNetworkBadge(); } catch { /* fine */ } return bp.getSigner(acct()); }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
    } finally { holdChain(false); }
  }
  async function signer() {
    if (isRH()) return rhSigner();
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const s = String((e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NotOpen: "Bets for this round are closed.", NoPriceToBeat: "This round has no price to beat (the pool wasn't read in time) — bet on the next one.", OverMaxBet: "That's over the most a wallet can put in one round.", OverMaxSide: "This side of the round is full.", OtherSide: "You already bet on the other side of this round.", TooSmall: "That's under the smallest bet.", IsPaused: "New bets are paused.", NothingToClaim: "Nothing to claim right now.", TooThin: "This pool holds too little USDC to open a market.", HookNotAllowed: "This pool's hook isn't accepted.", AlreadyListed: "This pool already has a market of that length.", ListingClosed: "Opening markets is closed right now.", NotQuotePool: isRH() ? "That pool isn't paired with ETH." : "That pool isn't paired with USDC.", PoolNotLive: "That pool has no price yet.", NotAllowed: "Only the owner or operator wallet can do that.", "insufficient funds": isRH() ? "Not enough ETH on Robinhood Chain for this and its gas." : "Not enough USDC for this and its gas." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const contract = (sg) => new ethers.Contract(S.st.address, ABI, sg);
  function say(h, cls = "") { S.msg = { h, cls }; const p = panel.querySelector("#pd-round .pd-msg"); if (p) { p.className = "pd-msg " + cls; p.innerHTML = h; } }
  function sayList(h, cls = "") { S.smsg = { h, cls }; const p = panel.querySelector("#pd-list .pd-msg"); if (p) { p.className = "pd-msg " + cls; p.innerHTML = h; } }
  const refOf = (me) => { const r = ls.get(LS.ref); return r && isAddr(r) && lc(r) !== lc(me) ? r : ethers.ZeroAddress; };
  async function placeBet(side, amtIn) {
    if (S.busy) { say(T("One moment — your last transaction is still confirming."), "err"); return; }
    const m = market(), br = betRound(m);
    if (!br) return;
    const v = amtIn != null ? amtIn : Number(String(($("pd-amt") || {}).value || "").replace(/,/g, ""));
    const lim = S.st.limits;
    if (!(v > 0)) { say(T(isRH() ? "Enter an amount of ETH." : "Enter an amount of USDC."), "err"); return; }
    if (v < lim.minBet - 1e-12) { say(`${T("The smallest bet is")} <b data-no-i18n>${moneyU(lim.minBet)}</b>.`, "err"); return; }
    const mine0 = myBet(br.id);
    if (v + (mine0 ? mine0.stake : 0) > lim.maxBet + 1e-12) { say(`${T("A wallet can put at most")} <b data-no-i18n>${moneyU(lim.maxBet)}</b> ${T("in one round.")}`, "err"); return; }
    S.busy = true;
    const btn = panel.querySelector(`#pd-round [data-pd-bet="${side}"]`);
    try {
      const sg = await signer();
      const me = await sg.getAddress();
      const wei = ethers.parseEther(v.toFixed(18));
      const bal = await sg.provider.getBalance(me).catch(() => null);
      if (bal != null && bal < wei + ethers.parseEther(isRH() ? "0.00002" : "0.02")) throw new Error(tr(isRH() ? "This wallet doesn't hold that much ETH on Robinhood Chain (keep a little for gas)." : "This wallet doesn't hold that much USDC (keep a little for gas)."));
      if (nowC() >= br.lockAt - 2) throw new Error(tr("Bets for this round are closed."));
      say(T("Confirm in your wallet…"));
      const tx = await contract(sg).bet(m.id, br.epoch, side === "up", refOf(me), { value: wei });
      say(`${T("Placing your bet…")}${txa(tx.hash)}`);
      await tx.wait();
      coinFly(btn, side);
      try { if (navigator.vibrate && !reduce()) navigator.vibrate(30); } catch { /* fine */ }
      say(`${T("You're in")} <b data-no-i18n>${side.toUpperCase()}</b> ${T("with")} <b data-no-i18n>${money(v)}</b>.${txa(tx.hash)}`, "ok");
      S.amt = String(v); ls.set(amtKey(), S.amt);
      S.lastBet = { m: m.id, epoch: br.epoch, side, amt: v };
      await Promise.all([load(), loadMine(), loadFeed()]);
      render();
    } catch (e) { say(esc(errText(e)), "err"); } finally { S.busy = false; }
  }
  function coinFly(from, side) {
    if (!from || reduce()) return;
    const to = panel.querySelector(`#pd-round .pd-pool.${side}`) || from;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const c = document.createElement("i");
    c.className = `pd-coin ${side}`;
    c.style.left = a.left + a.width / 2 + "px"; c.style.top = a.top + a.height / 2 + "px";
    c.style.setProperty("--dx", (b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(0) + "px");
    c.style.setProperty("--dy", (b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(0) + "px");
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 900);
  }
  async function claimAll(ref) {
    const ids = ref ? S.mine && S.mine.ref && S.mine.ref.claimIds : S.mine && S.mine.claimIds;
    if (!ids || !ids.length) return;
    if (S.busy) { say(T("One moment — your last transaction is still confirming."), "err"); return; }
    S.busy = true;
    try {
      const sg = await signer();
      say(T("Confirm in your wallet…"));
      const tx = ref ? await contract(sg).claimRef(ids.slice(0, 60)) : await contract(sg).claim(ids.slice(0, 60));
      say(`${T("Claiming…")}${txa(tx.hash)}`);
      await tx.wait();
      await loadMine(); S.sideKey = null; render();
      say(`${T(isRH() ? (ref ? "Referral earnings claimed — the ETH is in your wallet." : "Claimed — the ETH is in your wallet.") : ref ? "Referral earnings claimed — the USDC is in your wallet." : "Claimed — the USDC is in your wallet.")}${txa(tx.hash)}`, "ok");
    } catch (e) { say(esc(errText(e)), "err"); } finally { S.busy = false; }
  }
  function shareRound(id) {
    const a = acct();
    const q = [a ? "u=" + a : "", isRH() ? "c=rh" : ""].filter(Boolean).join("&");
    const url = `${SITE}/predict/${id}${q ? "?" + q : ""}`;
    const text = tr(isRH() ? "I called it on ARCIRCLE Predict — UP or DOWN on Pons coins on Robinhood Chain, paid in ETH." : "I called it on ARCIRCLE Predict — UP or DOWN on Arc tokens, paid in USDC.");
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }
  function shareMarket() {
    const m = market(); if (!m) return;
    const a = acct();
    const url = `${SITE}/arc#predict?${cq()}m=${m.id}${a ? "&ref=" + a : ""}`;
    const text = `${tr("UP or DOWN?")} $${m.sym} ${dur(m.duration)} ${tr(isRH() ? "rounds on ARCIRCLE Predict, paid in ETH on Robinhood Chain." : "rounds on ARCIRCLE Predict, paid in USDC.")}`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }
  async function findPools() {
    const t = String(($("pd-lt") || {}).value || "").trim();
    S.list = Object.assign({}, S.list, { t, pools: null, badge: null });
    if (!isAddr(t)) { sayList(T("Paste an Arc token address (0x…)."), "err"); return; }
    sayList(T("Looking for its pools…"));
    let j = null;
    for (let i = 0; i < 8; i++) {
      try { const r = await fetch(`/api/social?liq=${t}`, { cache: "no-store" }); j = r.ok ? await r.json() : null; } catch { j = null; }
      if (j && j.done) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    const usdcA = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
    const pools = ((j && j.pools) || []).filter((p) => p.key && [p.key.currency0, p.key.currency1].map(lc).some((c) => c === usdcA || c === "0x0000000000000000000000000000000000000000"));
    // what Token Scanner and ARCIA say about it, when they've looked
    let badge = {};
    try { const r = await fetch(`/api/social?scores=${t}`, { cache: "no-store" }); const s = r.ok ? await r.json() : null; const x = s && s.scores && (s.scores[lc(t)] || s.scores[t]); if (x && x.score != null) badge.score = x.score; } catch { /* none */ }
    S.list = Object.assign({}, S.list, { pools, pick: 0, badge });
    S.smsg = null;
    listPanel();
  }
  async function addMarket() {
    const L = S.list || {}, st = S.st, a = acct();
    const p = isRH() ? L.pons : L.pools && L.pools[L.pick || 0];
    if (!p) return;
    const staff = a && (a === st.owner || a === st.operator);
    try {
      const sg = await signer();
      const k = p.key, key = [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks], d = L.d || 300;
      let tx;
      if (staff) { sayList(T("Confirm in your wallet…")); tx = await contract(sg).addMarket(key, d, 0); }
      else {
        const burn = ethers.parseEther(String(st.listing.burn || 0));
        if (burn > 0n) {
          const arc = new ethers.Contract(ARCIRCLE(), ERC20, sg);
          const me = await sg.getAddress();
          if ((await arc.balanceOf(me)) < burn) throw new Error(`${tr("This wallet doesn't hold")} ${Number(st.listing.burn).toLocaleString("en-US")} $ARCIRCLE.`);
          if ((await arc.allowance(me, st.address)) < burn) { sayList(T("Approve the $ARCIRCLE to burn in your wallet…")); await (await arc.approve(st.address, burn)).wait(); }
        }
        sayList(T("Confirm in your wallet…"));
        tx = await contract(sg).listMarket(key, d);
      }
      await tx.wait();
      S.list = null;
      await load(); S.m = S.st.markets.length ? S.st.markets[S.st.markets.length - 1].id : S.m; S.view = "market";
      render();
      sayList(`${T("Opened. Its first round is live — the keeper reads the pool within a minute or two.")}${txa(tx.hash)}`, "ok");
    } catch (e) { sayList(esc(errText(e)), "err"); }
  }
  /// Arc ↔ Robinhood Chain: each has its own contract, markets, bets and leaderboard
  async function setChain(c) {
    if (c === S.chain || S.busy) return;
    S.chain = c; ls.set(LS.chain, c);
    Object.assign(S, { st: null, m: null, mine: null, feed: null, lb: null, chart: null, kstat: null, list: null, msg: null, smsg: null, lastPx: {}, lastPast: {}, lastBet: null, claimable0: null, amt: ls.get(amtKey()) || "" });
    try { history.replaceState(null, "", "#predict" + (c === "rh" ? "?c=rh" : "")); } catch { /* fine */ }
    frame();
    render();
    await load();
    pickDefault();
    await Promise.all([loadMine(), loadChart(), loadFeed(), loadStatus(), S.view === "lb" ? loadLb() : null]);
    if (S.chain === c) render();
  }
  async function staffTx(kind) {
    try {
      const sg = await signer();
      sayList(T("Confirm in your wallet…"));
      const tx = kind === "stop" ? await contract(sg).stop(S.m) : await contract(sg).payFees();
      await tx.wait();
      await load(); S.listKey = null; render();
      sayList(`${T("Done.")}${txa(tx.hash)}`, "ok");
    } catch (e) { sayList(esc(errText(e)), "err"); }
  }

  // ---------------- notifications (this browser only) ----------------
  const notifyOn = () => ls.get(LS.notify) === "1";
  function notify(title, body) {
    toast(title, body);
    try { if (notifyOn() && "Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(title, { body, icon: "/images/arcircle-mark-sm.png" }); } catch { /* fine */ }
  }
  function toast(title, body) {
    if (!notifyOn()) return;
    const t = document.createElement("div");
    t.className = "pd-toast";
    t.setAttribute("role", "status");
    t.innerHTML = `<b>${esc(title)}</b><span>${esc(body)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 4200);
    setTimeout(() => t.remove(), 4800);
  }
  function watchMine() {
    const M = S.mine;
    if (!M || !S.st) return;
    for (const x of M.items || []) {
      if (x.result !== "open") continue;
      const m = market(x.market);
      if (!m || m.live.id !== x.round) continue;
      const left = m.live.endAt - nowC();
      if (left > 0 && left <= 30 && !S.notified.has("e" + x.round)) { S.notified.add("e" + x.round); notify(`${tr("30 seconds left")} · ${m.sym} ${dur(m.duration)}`, `${tr("You're in")} ${x.side.toUpperCase()} ${tr("with")} ${money(x.stake)}`); }
    }
    const c = M.claimable || 0;
    if (S.claimable0 != null && c > S.claimable0 + 1e-9) notify(tr("You won — claim it"), `${money(c - S.claimable0)} ${tr("is ready in Your bets.")}`);
    S.claimable0 = c;
  }

  // ---------------- events ----------------
  panel.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-pd-m],[data-pd-amt],[data-pd-bet],[data-pd-act],[data-pd-dur],[data-pd-view],[data-pd-side],[data-pd-sort],[data-pd-lb],[data-pd-go],[data-pd-share],[data-pd-chain]");
    if (!t) return;
    if (t.dataset.pdChain) { setChain(t.dataset.pdChain); return; }
    if (t.dataset.pdM != null || t.dataset.pdGo != null) {
      S.m = Number(t.dataset.pdM != null ? t.dataset.pdM : t.dataset.pdGo); S.msg = null; S.chart = null; S.view = "market";
      try { history.replaceState(null, "", `#predict?${cq()}m=${S.m}`); } catch { /* fine */ }
      render(); loadChart().then(() => { if (S.view === "market") card(); }); return;
    }
    if (t.dataset.pdView) { S.view = t.dataset.pdView; ls.set(LS.view, S.view === "all" ? "all" : "market"); if (S.view === "lb" && !S.lb) loadLb().then(render); render(); return; }
    if (t.dataset.pdSide) { S.side = t.dataset.pdSide; if (S.side === "feed") loadFeed().then(side); side(); return; }
    if (t.dataset.pdSort) { S.sort = t.dataset.pdSort; all(); return; }
    if (t.dataset.pdLb) { S.lbTab = t.dataset.pdLb; lbView(); return; }
    if (t.dataset.pdShare) { shareRound(t.dataset.pdShare); return; }
    if (t.dataset.pdAmt) { const i = $("pd-amt"); if (i) { i.value = String(Number(t.dataset.pdAmt)); S.amt = i.value; const m = market(); if (m) patch(m, betRound(m)); } return; }
    if (t.dataset.pdBet) { placeBet(t.dataset.pdBet); return; }
    if (t.dataset.pdDur) { S.list = Object.assign({}, S.list, { d: Number(t.dataset.pdDur), t: String(($("pd-lt") || {}).value || "") }); listPanel(); return; }
    const a = t.dataset.pdAct;
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(() => loadMine().then(render)).catch(() => {}); }
    else if (a === "claim") claimAll(false);
    else if (a === "claimref") claimAll(true);
    else if (a === "again") { const L = S.lastBet; if (L) placeBet(L.side, L.amt); }
    else if (a === "sharem") shareMarket();
    else if (a === "copyref") { const i = $("pd-reflink"); if (i) { try { navigator.clipboard.writeText(i.value); t.textContent = tr("Copied"); } catch { i.select(); } } }
    else if (a === "xref") { const i = $("pd-reflink"); if (i) window.open(`https://x.com/intent/post?text=${encodeURIComponent(tr(isRH() ? "UP or DOWN on Pons coins on Robinhood Chain, paid in ETH. Join me on ARCIRCLE Predict:" : "UP or DOWN on Arc tokens, paid in USDC. Join me on ARCIRCLE Predict:"))}&url=${encodeURIComponent(i.value)}`, "_blank", "noopener"); }
    else if (a === "pools") findPools();
    else if (a === "pons") checkPons();
    else if (a === "add") addMarket();
    else if (a === "stop" || a === "fees") staffTx(a);
  });
  // the hero's paragraph is cut to two lines on a phone; a tap opens it
  const lede = panel.querySelector(".pd-hero .bp-lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("open"));
  panel.addEventListener("input", (e) => {
    if (e.target && e.target.id === "pd-amt") { S.amt = e.target.value; const m = market(); if (m) patch(m, betRound(m)); }
    if (e.target && e.target.id === "pd-lt") S.list = Object.assign({}, S.list, { t: e.target.value });
  });
  panel.addEventListener("change", (e) => {
    if (e.target && e.target.name === "pd-pl") S.list = Object.assign({}, S.list, { pick: Number(e.target.value) });
    if (e.target && e.target.id === "pd-notify") {
      ls.set(LS.notify, e.target.checked ? "1" : "0");
      if (e.target.checked && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
    }
  });

  // every second: countdowns, the ring, the tab title; every 3 s: the data
  function tick() {
    if (!S.st || !S.st.live) return;
    const m = market();
    if (S.view === "market" && m) {
      const ph = phase(m);
      ring(m, ph);
      const br = betRound(m);
      if (br) setT("bethint", br.kind === "next" ? `${tr("starts in")} ${mmss(br.startAt - nowC())} · ${tr("price to beat set when it starts")}` : `${tr("bets close in")} ${mmss(br.lockAt - nowC())}`);
      // the round open for bets changed under us (the live one just locked): rebuild
      const want = `${m.id}|${m.live.epoch}|${br ? br.epoch : "-"}`;
      if (S.cardKey && !S.cardKey.startsWith(want) && !typing()) card();
      if (panel.classList.contains("active")) {
        if (S.title0 == null) S.title0 = document.title;
        document.title = `${ph.k === "open" ? "●" : ph.k === "locked" ? "■" : "…"} ${ph.left ? mmss(ph.left) : ""} · ${m.sym} ${dur(m.duration)} — ARCIRCLE Predict`;
      }
    } else if (S.view === "all") {
      panel.querySelectorAll("[data-pd-tleft]").forEach((b) => { const mk = market(Number(b.dataset.pdTleft)); if (mk) { const ph = phase(mk); b.textContent = ph.left ? mmss(ph.left) : "…"; } });
    }
    watchMine();
  }
  const typing = () => { const a = document.activeElement; return !!(a && panel.contains(a) && a.tagName === "INPUT" && a.type !== "checkbox" && a.type !== "radio"); };
  let n = 0;
  async function refresh() {
    if (document.hidden || !panel.classList.contains("active")) return;
    n++;
    const before = market() && market().past && market().past[0] ? market().past[0].id : null;
    await load();
    const after = market() && market().past && market().past[0] ? market().past[0].id : null;
    const jobs = [];
    // a round just settled (or a new wallet): the bets and claims now, so the result shows what you won
    if (acct() !== S.acct || n % 3 === 0 || before !== after) jobs.push(loadMine());
    if (S.view === "market") jobs.push(loadChart());
    if (S.side === "feed" || n % 5 === 0) jobs.push(loadFeed());
    if (S.view === "lb" && n % 10 === 0) jobs.push(loadLb());
    if (n % 10 === 1) jobs.push(loadStatus());
    await Promise.all(jobs);
    render();
  }
  async function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      render();
      await load();
      pickDefault();
      await Promise.all([loadMine(), loadChart(), loadFeed(), loadStatus(), S.view === "lb" ? loadLb() : null]);
      render();
    }
    clearInterval(S.timer); clearInterval(S.tick);
    S.timer = setInterval(refresh, 3000);
    S.tick = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => {
    if (e.detail && e.detail.tab === "predict") show();
    else { clearInterval(S.timer); clearInterval(S.tick); if (S.title0 != null) { document.title = S.title0; S.title0 = null; } }
  });
  window.addEventListener("hashchange", () => {
    const m = /^#predict\?(?:.*&)?m=(\d+)/.exec(location.hash);
    const r = /[?&]ref=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (r) ls.set(LS.ref, lc(r[1]));
    if (/^#predict/.test(location.hash) && S.booted) {
      const c = /[?&]c=rh\b/.test(location.hash) ? "rh" : /^#predict\?/.test(location.hash) ? "arc" : S.chain;
      if (c !== S.chain) { setChain(c).then(() => { if (m) { S.m = Number(m[1]); render(); loadChart().then(() => card()); } }); return; }
    }
    if (m && S.booted) { S.m = Number(m[1]); S.view = "market"; render(); loadChart().then(() => card()); }
  });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); render(); } });
  if (panel.classList.contains("active")) show();
  window.arcPredict = { state: () => S.st, market: () => S.m, chain: () => S.chain, setChain: (c) => setChain(c), refresh: () => refresh(), _px: px, _s: () => ({ busy: S.busy, ids: S.mine && S.mine.claimIds, msg: S.msg }) };
})();
