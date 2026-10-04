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
// v2 (Oct 2026): a sticky UP / DOWN bar on phones, what a bet would pay before it's placed, a 3-2-1 round finish,
// market chips with time left / pot / sparkline, ARCIA's call on every round (for fun) and her record vs the crowd,
// the last 10 results, reactions, per-market reminders, badges, quick bets from All markets.
// v3 (Oct 2026): a gauge and a Bet → Live → Settle band on the round card, how the odds moved, a heat map of the last 50
// results, practice mode (no money), alerts by Web Push and Telegram (/predictalerts), claims across both chains, a
// stats card to share, weekly season podiums, fan tiers, end dates for listed markets, Robinhood Chain listings by
// anyone (when open), ARCIA filling in a bet from her chat ("UP $2 on ARCIRCLE 5m").
// Deep links: #predict?m=<market> · #predict?c=rh (Robinhood Chain) · #predict?ref=0x… (kept in this browser, used on the
// first bet) · #predict?view=lb · #predict?m=0&side=up&amt=2 (a bet filled in, never placed: you tap and sign)
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-predict");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  /// a short label with its own translations (single words would clash with other pages in the shared dictionary)
  const L3 = (o) => { const l = window.arcI18n ? window.arcI18n.get() : "en"; return esc(o[l] || o.en); };
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
  const dl = (x) => "≈$" + (x >= 2 ? Math.round(x) : Number(x.toPrecision(2)));
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
  const endsIn = (t) => { const d = Math.max(0, t - Date.now() / 1000); return d >= 86400 ? `${Math.round(d / 86400)}d` : d >= 3600 ? `${Math.round(d / 3600)}h` : `${Math.max(1, Math.round(d / 60))}m`; };
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
  const ENDS = [[0, "No end"], [1, "1 day"], [7, "7 days"], [30, "30 days"]];
  const LS = { amt: "arcircle.predict.amt", ref: "arcircle.predict.ref", notify: "arcircle.predict.notify", view: "arcircle.predict.view", chain: "arcircle.predict.chain", watch: "arcircle.predict.watch", last: "arcircle.predict.last", badges: "arcircle.predict.badges", rx: "arcircle.predict.rx", practice: "arcircle.predict.practice", paper: "arcircle.predict.paper" };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* this visit only */ } } };
  const S = {
    chain: /[?&]c=rh\b/.test(location.hash) ? "rh" : /^#predict\?/.test(location.hash) ? "arc" : ls.get(LS.chain) === "rh" ? "rh" : "arc",
    st: null, m: null, view: ls.get(LS.view) === "all" ? "all" : "market", side: "bets", sort: "time", lbTab: "week",
    mine: null, feed: null, lb: null, chart: null, kstat: null, amt: "", busy: false, msg: null, smsg: null, list: null,
    booted: false, timer: 0, tick: 0, skew: 0, acct: null, cardKey: null, listKey: null, sideKey: null, lastPx: {}, lastPast: {}, notified: new Set(), lastBet: null, title0: null, claimable0: null,
    rx: null, rxM: null, feedSeen: null, wchain: null, rolls: {},
    // v3
    fails: 0, kseen: false, mineOther: null, heat: null, heatM: null, practice: ls.get(LS.practice) === "1", sugg: null, roundVis: true, leadK: {}, potPrev: {},
  };
  const jget = (k, d) => { try { const v = JSON.parse(ls.get(k) || "null"); return v == null ? d : v; } catch { return d; } };
  const lastKey = () => LS.last + (isRH() ? ".rh" : "");
  S.lastBet = jget(lastKey(), null);
  /// markets with a reminder on (30 s before bets close), as "<chain>:<id>"
  const watched = (id) => jget(LS.watch, []).includes(`${S.chain}:${id}`);
  const toggleWatch = (id) => { const k = `${S.chain}:${id}`, l = jget(LS.watch, []); const on = !l.includes(k); ls.set(LS.watch, JSON.stringify(on ? [...l, k].slice(-30) : l.filter((x) => x !== k))); return on; };
  const ICO = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    fire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.2 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6.9 2.6 1.8 3 0-3 .3-5.6 1-8.2z"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4c3 0 6 3 6 6l-6 6-4-4z"/><path d="M10 12l-4 1-2 3 4 0M12 14l-1 4-3 2 0-4"/><circle cx="15.5" cy="8.5" r="1.4"/></svg>',
    ice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/></svg>',
    eyes: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="8" cy="12" rx="4" ry="5"/><ellipse cx="16" cy="12" rx="4" ry="5"/><circle cx="9" cy="13" r="1.6"/><circle cx="17" cy="13" r="1.6"/></svg>',
    flame: '<svg class="pd-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.2 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6.9 2.6 1.8 3 0-3 .3-5.6 1-8.2z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="11" rx="5"/><path d="M8 10.5v4M6 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.8" r="1"/></svg>',
    // side panel tabs (icons on phones)
    bets: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
    past: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
    feed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
    invite: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M18 8v6M15 11h6"/></svg>',
    tg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/></svg>',
  };
  const RXK = [["fire", "Hot"], ["rocket", "To the moon"], ["ice", "Cold"], ["eyes", "Watching"]];
  const amtKey = () => LS.amt + (isRH() ? ".rh" : "");
  S.amt = ls.get(amtKey()) || "";
  const nowC = () => Date.now() / 1000 + S.skew; // chain time
  (function grabRef() { const m = /[?&]ref=(0x[0-9a-fA-F]{40})/.exec(location.hash); if (m) ls.set(LS.ref, lc(m[1])); })();
  (function grabView() { const m = /[?&]view=(lb|all)\b/.exec(location.hash); if (m) S.view = m[1]; })();
  /// a bet filled in from a link (ARCIA's chat): the amount goes in the box and the side glows — nothing is placed
  function grabSugg() {
    const sd = /[?&]side=(up|down)\b/i.exec(location.hash), am = /[?&]amt=(\d+(?:\.\d+)?)\b/.exec(location.hash);
    if (!sd && !am) return;
    S.sugg = { side: sd ? sd[1].toLowerCase() : null, amt: am ? Number(am[1]) : null, at: Date.now() };
    if (S.sugg.amt > 0) { S.amt = String(S.sugg.amt); }
    S.view = "market";
  }
  grabSugg();

  // ---------------- skeleton ----------------
  function frame() {
    S.cardKey = S.listKey = S.sideKey = null;
    $("pd-body").innerHTML = `
      <div class="pd-chains" role="tablist" aria-label="${T("Chain")}">
        ${[["arc", "Arc", "USDC"], ["rh", "Robinhood Chain", "ETH"]].map(([k, l, u]) => `<button type="button" role="tab" class="pd-chain ${k}" data-pd-chain="${k}" aria-selected="${S.chain === k}"><i aria-hidden="true"></i><b data-no-i18n>${l}</b><small>${T("bets in")} <span data-no-i18n>${u}</span></small></button>`).join("")}
      </div>
      <div class="pd-strip${phone() ? " in-hero" : ""}" id="pd-strip"></div>
      <div class="pd-views" role="tablist" aria-label="${T("View")}">
        ${[["market", "Market"], ["all", "All markets"], ["lb", "Leaderboard"]].map(([k, l]) => `<button type="button" role="tab" data-pd-view="${k}" aria-selected="${S.view === k}">${T(l)}</button>`).join("")}
        <button type="button" class="pd-practice" data-pd-act="practice" aria-pressed="${S.practice}" title="${T("Bet with play money on the real rounds — nothing leaves your wallet")}">${ICO.play}<span>${T("Practice")}</span></button>
        <button type="button" class="pd-notify" data-pd-act="notify" aria-pressed="${ls.get(LS.notify) === "1"}" title="${T("Alerts in this browser: 30 seconds left in your rounds, and wins to claim")}">${ICO.bell}<span>${T("Alerts")}</span></button>
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
      <div class="ams-card pd-list" id="pd-list"></div>
      <div class="pd-sticky" id="pd-sticky" hidden></div>`;
    stickyWatch();
    // phones: the live numbers sit inside the hero card, one block instead of two
    const hs = panel.querySelector(".pd-hero .ams-hero-txt"), sp = $("pd-body").querySelector("#pd-strip");
    panel.querySelectorAll(".pd-hero #pd-strip").forEach((x) => { if (x !== sp) x.remove(); });
    if (phone() && hs && sp) hs.appendChild(sp);
  }
  const phone = () => !!(window.matchMedia && matchMedia("(max-width: 720px)").matches);
  const skel = () => `<div class="pd-skel"><i></i><i></i><i></i></div>`;

  // ---------------- data ----------------
  /// a read for the chain picked now (a reply that lands after a switch is dropped)
  const getJ = async (q) => { const c = S.chain; try { const r = await fetch(`${API}?${q}${c === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; return j && !j.error && c === S.chain && (!j.chain || j.chain === c) ? j : null; } catch { return null; } };
  async function load() {
    const j = await getJ("predict=state");
    const c = S.chain;
    if (j && c === S.chain && (j.chain || "arc") === c) { S.st = j; S.fails = 0; if (j.now) S.skew = j.now - Date.now() / 1000; }
    else if (!j && c === S.chain) S.fails++;
  }
  const acct = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function loadMine() { const a = acct(); S.acct = a; if (!a || !S.st || !S.st.live) { S.mine = null; return; } const j = await getJ(`predict=mine&u=${a}`); if (j) S.mine = j; }
  /// v3: what this wallet can claim on the other chain (one "claim everything" box)
  async function loadMineOther() {
    const a = acct(), oc = isRH() ? "arc" : "rh", c = S.chain;
    if (!a) { S.mineOther = null; return; }
    try { const r = await fetch(`${API}?predict=mine&u=${a}${oc === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (c === S.chain) S.mineOther = j && !j.error ? { chain: oc, claimable: j.claimable || 0, n: (j.claimIds || []).length, unitUsd: j.unitUsd } : null; } catch { /* keep */ }
  }
  async function loadHeat() { if (S.m == null || !S.st || !S.st.live) return; const m = S.m, j = await getJ(`predict=heat&m=${m}`); if (j && j.items && m === S.m) { S.heat = j.items; S.heatM = m; } }
  async function loadChart() { if (S.m == null || !S.st || !S.st.live) return; const j = await getJ(`predict=chart&m=${S.m}`); if (j && j.points) S.chart = j; }
  async function loadFeed() { const j = await getJ("predict=feed"); if (j) S.feed = j; }
  async function loadLb() { const j = await getJ("predict=lb"); if (j) S.lb = j; }
  async function loadStatus() { const j = await getJ("predict=status"); if (j) { S.kstat = j; S.kseen = true; } }
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
    if (!st) {
      $("pd-round").innerHTML = S.fails >= 2 ? `<div class="pd-soon pd-fail"><b>${T(isRH() ? "Robinhood Chain isn't answering right now" : "Arc isn't answering right now")}</b><span>${T("Trying again every few seconds — bets already placed stay in their rounds.")}</span><button type="button" class="pd-btn" data-pd-act="retry">${T("Try again")}</button></div>${how()}` : skel();
      return;
    }
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
    // what the keeper last said went wrong (it skips without a key, or a sample / settle didn't go through)
    const issue = k ? (k.error && k.error.msg && (!k.at || k.error.at >= k.at - 5) ? k.error.msg : k.skipped && k.skipped.msg && (!k.at || k.skipped.at > k.at) ? k.skipped.msg : "") : "";
    const late = ago != null && ago > 300;
    $("pd-strip").innerHTML = [
      [String(live), "markets live"], [String(st.rounds), "rounds played"], [bigM(st.volume), "volume"], [`${(st.feeBps / 100).toFixed(st.feeBps % 100 ? 1 : 0)}%`, "fee on wins"],
    ].map(([v, l]) => `<span class="pd-chip"><b data-no-i18n>${esc(v)}</b> ${T(l)}</span>`).join("") +
      (ago != null ? `<span class="pd-chip pd-keeper${late ? " late" : ""}${issue ? " warn" : ""}" title="${esc(issue ? tr("The keeper reported") + ": " + issue : tr("The keeper reads the pools at every round boundary"))}"><i aria-hidden="true"></i>${T(late ? "keeper late" : "keeper")} <b data-no-i18n>${ago < 60 ? ago + "s" : ago < 7200 ? Math.round(ago / 60) + "m" : Math.round(ago / 3600) + "h"}</b> ${T("ago")}</span>`
        : S.kseen && st.markets.length ? `<span class="pd-chip pd-keeper late warn" title="${esc(issue || tr("The keeper hasn't reported on this chain yet — rounds wait for it to read the pools."))}"><i aria-hidden="true"></i>${T("keeper not reporting")}</span>` : "") +
      (isRH() && st.address ? `<a class="pd-chip pd-ca" href="${EXPL("address", st.address)}" target="_blank" rel="noopener">${T("contract")} <b data-no-i18n>${short(st.address)} ↗</b></a>` : "") +
      (isRH() && uUsd() ? `<span class="pd-chip" title="${T("Prices are the pool's ETH price × ETH/USD")}"><b data-no-i18n>ETH ${usd(uUsd(), 0)}</b></span>` : "") +
      (st.paused ? `<span class="pd-chip pd-paused">${T("New bets are paused by the team. Running rounds still settle and every claim works.")}</span>` : "");
  }
  const logo = (m, cls = "") => `<span class="pd-logo ${cls}" aria-hidden="true">${m.logo ? `<img src="${esc(m.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<i data-no-i18n>${esc((m.sym || "?").slice(0, 2))}</i></span>`;
  const callTag = (b) => (b && b.call ? `<em class="pd-call ${esc(b.call)}" title="${T("ARCIA's 24-hour safety call")}">ARCIA · ${T(b.call === "safe" ? "Safe" : b.call === "risky" ? "Risky" : "Caution")}</em>` : "");
  const scoreTag = (b) => (b && b.score != null ? `<em class="pd-score ${b.score >= 70 ? "hi" : b.score >= 40 ? "mid" : "lo"}" title="${T("Token Scanner score")}" data-no-i18n>${Math.round(b.score)}/100</em>` : "");
  /// a tiny line of the last rounds' closing prices and the price now
  function spark(m) {
    const v = [...(m.past || []).slice().reverse().map((r) => r.close), m.price].filter((x) => x > 0);
    if (v.length < 2) return "";
    const lo = Math.min(...v), hi = Math.max(...v), W = 44, H = 16, X = (i) => (i / (v.length - 1)) * W, Y = (x) => (hi > lo ? H - 1 - ((x - lo) / (hi - lo)) * (H - 2) : H / 2);
    const up = v[v.length - 1] >= v[0];
    return `<svg class="pd-spark ${up ? "up" : "down"}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${v.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ")}"/></svg>`;
  }
  function tabs() {
    const ms = S.st.markets;
    $("pd-mkts").innerHTML = ms.map((m) => {
      const ch = m.price && m.live.open ? (m.price / m.live.open - 1) * 100 : null;
      const br = betRound(m), pot = br ? br.up + br.down : 0;
      return `<button type="button" role="tab" class="pd-mk${m.id === S.m ? " on" : ""}${m.stopped ? " off" : ""}" data-pd-m="${m.id}" aria-selected="${m.id === S.m}">
        ${logo(m)}<span class="pd-mk-t"><span class="pd-mk-a"><b data-no-i18n>${esc(m.sym)}</b><em data-no-i18n>${dur(m.duration)}</em><span class="pd-mk-ch ${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${ch == null ? "" : pc(ch)}</span></span>
        <span class="pd-mk-b"><i class="pd-mk-net ${S.chain}" data-no-i18n>${isRH() ? "RH" : "Arc"}</i><i class="pd-mk-left" data-pd-mleft="${m.id}" data-no-i18n></i>${pot > 0 ? `<i class="pd-mk-pot" data-no-i18n>${esc(bigM(pot))}</i>` : ""}${m.endsAt ? `<i class="pd-mk-end" title="${T("Ends")}" data-no-i18n>${esc(endsIn(m.endsAt))}</i>` : ""}</span></span>${spark(m)}${m.badge && m.badge.call === "risky" ? `<i class="pd-mk-risk" title="${T("ARCIA called it Risky")}">!</i>` : ""}${watched(m.id) ? `<i class="pd-mk-bell" title="${T("Reminder on")}">${ICO.bell}</i>` : ""}</button>`;
    }).join("") || `<p class="pd-empty">${T("No market yet")}</p>`;
    chipClock();
  }
  /// every second: time left on each chip, and a pulse on the ones whose bets close within 30 s
  function chipClock() {
    panel.querySelectorAll("[data-pd-mleft]").forEach((el) => {
      const m = market(Number(el.dataset.pdMleft)), br = m && betRound(m);
      if (!m || !br) { el.textContent = ""; return; }
      const left = br.lockAt - nowC();
      el.textContent = left > 0 ? mmss(left) : "";
      const chip = el.closest(".pd-mk");
      if (chip) { chip.classList.toggle("soon", left > 0 && left <= 30 && !m.stopped); chip.classList.toggle("last", left > 0 && left <= 10 && !m.stopped); }
    });
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
    paintRx();
    reveal(m);
  }
  function build(m, br) {
    const el = $("pd-round");
    const lim = S.st.limits;
    const share = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg>`;
    el.innerHTML = `
      <ol class="pd-steps" data-k="steps" aria-label="${T("Round stage")}"><li data-s="open" data-no-i18n><i aria-hidden="true"></i>${L3({ en: "Bet", ko: "베팅", zh: "下注" })}</li><li data-s="locked" data-no-i18n><i aria-hidden="true"></i>${L3({ en: "Live", ko: "진행", zh: "进行" })}</li><li data-s="settling" data-no-i18n><i aria-hidden="true"></i>${L3({ en: "Settle", ko: "정산", zh: "结算" })}</li></ol>
      <div class="pd-r-head">
        <div class="pd-r-tok">${logo(m, "lg")}<div><b data-no-i18n>${esc(m.sym)}</b><small><span data-no-i18n>${esc(m.name)}</span> · <a href="${EXPL("token", m.token)}" target="_blank" rel="noopener" data-no-i18n>${short(m.token)} ↗</a></small><div class="pd-tags">${scoreTag(m.badge)}${callTag(m.badge)}</div></div></div>
        <div class="pd-r-id">${T("Round")} <b data-no-i18n>#${m.live.epoch + 1}</b><em data-no-i18n>${dur(m.duration)}</em>${m.stopped ? `<i class="pd-off">${T("Stopped")}</i>` : ""}${m.endsAt ? `<i class="pd-ends" title="${T("The wallet that listed it set an end date")}">${T("ends in")} <span data-no-i18n>${esc(endsIn(m.endsAt))}</span></i>` : ""}<button type="button" class="pd-ico${watched(m.id) ? " on" : ""}" data-pd-act="watch" aria-pressed="${watched(m.id)}" title="${T("Remind me 30 seconds before bets close, every round of this market")}" aria-label="${T("Reminder")}">${ICO.bell}</button><button type="button" class="pd-ico" data-pd-act="sharem" title="${T("Share this market")}" aria-label="${T("Share this market")}">${share}</button></div>
      </div>
      <div class="pd-res" data-k="res"></div>
      <p class="pd-late" data-k="late" hidden></p>
      <div class="pd-live">
        <div class="pd-prices">
          <div class="pd-pr"><small>${T("Price to beat")}</small><b data-k="open" data-no-i18n></b></div>
          <div class="pd-pr now" data-k="nowbox"><small>${T("Now")}</small><b data-k="now" data-no-i18n></b><span data-k="ch" data-no-i18n></span></div>
          <div class="pd-ring" data-k="ring" aria-hidden="true"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19" pathLength="100"/></svg><b data-k="left" data-no-i18n></b></div>
        </div>
        <div class="pd-gauge" data-k="gauge" aria-hidden="true">
          <svg viewBox="0 0 120 68"><path class="g-dn" d="M10 62 A50 50 0 0 1 60 12"/><path class="g-up" d="M60 12 A50 50 0 0 1 110 62"/><line class="g-tick" x1="60" y1="8" x2="60" y2="18"/><g class="g-needle" data-k="needle"><line x1="60" y1="62" x2="60" y2="20"/></g><circle class="g-hub" cx="60" cy="62" r="5"/></svg>
          <div class="pd-diff"><small>${T("vs the price to beat")}</small><b data-k="diffv" data-no-i18n></b><span class="pd-diffbar"><i data-k="diffbar"></i></span></div>
        </div>
        <div class="pd-phase"><span data-k="phase"></span> <b data-k="phaseT" data-no-i18n></b><em class="pd-lead" data-k="lead" hidden></em></div>
        <div class="pd-pools" data-k="pools">
          <div class="pd-pool up"><small>UP <i data-k="upPct" data-no-i18n></i></small><b data-k="upAmt" data-no-i18n></b><em data-k="upX" data-no-i18n></em><span class="pd-you" data-k="youUp" hidden></span></div>
          <div class="pd-bar" aria-hidden="true"><i data-k="bar"></i><em class="pd-bar-me" data-k="barme" hidden>${T("You")}</em></div>
          <div class="pd-pool down"><small><i data-k="downPct" data-no-i18n></i> DOWN</small><b data-k="downAmt" data-no-i18n></b><em data-k="downX" data-no-i18n></em><span class="pd-you" data-k="youDown" hidden></span></div>
          <div class="pd-lockov" data-k="lockov" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/></svg><b>LOCKED</b><span>${T("Bets are on the next round")}</span></div>
        </div>
        <div class="pd-flow" data-k="flow" hidden></div>
        <div class="pd-pos" data-k="livepos" hidden></div>
      </div>
      <div class="pd-bet${br && !S.st.paused ? "" : " dis"}" data-k="betbox">
        <div class="pd-bet-h"><b>${br ? (br.kind === "next" ? `${T("Next round")} <span data-no-i18n>#${br.epoch + 1}</span>` : `${T("This round")} <span data-no-i18n>#${br.epoch + 1}</span>`) : T("No round open for bets")}</b><small data-k="bethint"></small></div>
        <div class="pd-prac" data-k="prac" hidden></div>
        <p class="pd-sugg" data-k="sugg" hidden></p>
        <div class="pd-arcia" data-k="arcia" hidden></div>
        <div class="pd-mini" data-k="betpools"></div>
        <div class="pd-first" data-k="first" hidden><img src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40" loading="lazy"><div><b data-k="firstT"></b><span data-k="firstB"></span></div></div>
        <div class="pd-amt"><input id="pd-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="${UNIT()}" value="${esc(S.amt)}" aria-label="${T(isRH() ? "ETH to put in" : "USDC to put in")}"${br ? "" : " disabled"}>${isRH() ? `<small class="pd-amtusd" data-k="amtusd" data-no-i18n></small>` : ""}
          <div class="pd-chips">${chips(lim).map(([v, l]) => `<button type="button" data-pd-amt="${v}"${br ? "" : " disabled"} title="${esc(money(v))}" data-no-i18n>${esc(l)}</button>`).join("")}</div></div>
        <p class="pd-preview" data-k="preview" hidden></p>
        <div class="pd-go"><button type="button" class="pd-up" data-pd-bet="up"><span>UP <i aria-hidden="true">▲</i></span><small data-k="payUp"></small></button>
          <button type="button" class="pd-down" data-pd-bet="down"><span>DOWN <i aria-hidden="true">▼</i></span><small data-k="payDown"></small></button></div>
        <button type="button" class="pd-btn pd-rhsw" data-pd-act="rhswitch" data-k="rhsw" hidden>${T("Switch your wallet to Robinhood Chain first")}</button>
        <div class="pd-pos" data-k="betpos" hidden></div>
        <button type="button" class="pd-again" data-pd-act="again" data-k="again" hidden></button>
        <p class="pd-small"><span data-no-i18n>${S.practice ? tr("Practice — no money moves") + " · " : ""}${money(lim.minBet)}–${money(lim.maxBet)}${isRH() && uUsd() ? ` (≈${usd(lim.minBet * uUsd())}–${usd(lim.maxBet * uUsd())})` : ""}</span> ${T(isRH() ? "a round per wallet · one side per round · paid out in ETH on Robinhood Chain" : "a round per wallet · one side per round · paid out in USDC on Arc")} · ${T("no approval needed")}</p>
        <p class="pd-msg${S.msg ? " " + S.msg.cls : ""}" aria-live="polite">${S.msg ? S.msg.h : ""}</p>
      </div>
      <div class="pd-chart" data-k="chart" aria-label="${T("Price through this round")}"></div>
      <div class="pd-rx" data-k="rx" role="group" aria-label="${T("Reactions")}"></div>
      <div class="pd-ticker" data-k="ticker" aria-live="off"></div>
      <div class="pd-cd" data-k="cd" aria-live="assertive" hidden></div>
      <div class="pd-stamp" data-k="stamp" aria-live="polite" hidden></div>`;
    stickyWatch();
    paintRx();
    if (isRH()) walletChain();
  }
  /// quick amounts: $1 / $2 / the max on Arc; on Robinhood Chain about $1 / $2 / $5 in ETH (within the limits)
  function chips(lim) {
    if (!isRH()) return [1, 2, lim.maxBet].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => [v, "$" + v]);
    const u = uUsd();
    if (!u) return [lim.minBet, sig2(lim.maxBet / 2), lim.maxBet].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => [v, ethS(v)]);
    // the dollar target names the chip unless the limits moved it
    const vs = [1, 2, 5].map((d) => { const raw = sig2(d / u), v = Math.min(lim.maxBet, Math.max(lim.minBet, raw)); return [v, v === raw ? "≈$" + d : dl(v * u)]; });
    return vs.filter((x, i, a) => x[0] > 0 && a.findIndex((y) => y[0] === x[0]) === i);
  }
  const K = (k) => panel.querySelector(`#pd-round [data-k="${k}"]`);
  const setT = (k, v) => { const e = K(k); if (e && e.textContent !== v) e.textContent = v; return e; };
  /// a number that rolls from what it showed to its new value
  function roll(k, v, fmt) {
    const e = K(k);
    if (!e) return;
    const key = `${S.m}:${k}`, from = S.rolls[key];
    S.rolls[key] = v;
    if (from == null || from === v || reduce() || !isFinite(from) || !isFinite(v)) { const t = fmt(v); if (e.textContent !== t) e.textContent = t; return; }
    const t0 = performance.now();
    const step = (t) => { const k2 = Math.min(1, (t - t0) / 600), x = from + (v - from) * (1 - Math.pow(1 - k2, 3)); e.textContent = fmt(k2 < 1 ? x : v); if (k2 < 1 && e.isConnected) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    e.classList.remove("bump"); void e.offsetWidth; e.classList.add("bump");
  }
  const fmtX = (v) => (v && isFinite(v) ? v.toFixed(2) + "×" : "—");
  /// your stake in a round: the real one, or the practice one in practice mode
  const mineIn = (rid, mid, ep) => (S.practice ? paperOf(mid, ep) : myBet(rid));
  /// the gauge: how far the price is from the price to beat — the needle swings up to ±80°, softly saturating
  /// (±1% fills most of it on a 5-minute market, ±2% on 15 minutes, ±4% on an hour)
  function gauge(m, ch) {
    const nd = K("needle"), dv = K("diffv"), db = K("diffbar"), g = K("gauge");
    if (!nd) return;
    const R = m.duration <= 300 ? 1 : m.duration <= 900 ? 2 : 4, k = ch == null || !isFinite(ch) ? 0 : Math.tanh(ch / R);
    nd.style.transform = `rotate(${(k * 80).toFixed(1)}deg)`;
    if (dv) { const t = ch == null ? tr("set at the start") : (ch > 0 ? "▲ " : ch < 0 ? "▼ " : "") + pc(ch); if (dv.textContent !== t) dv.textContent = t; }
    if (db) { db.style.width = (Math.abs(k) * 50).toFixed(1) + "%"; db.style.left = k >= 0 ? "50%" : (50 - Math.abs(k) * 50).toFixed(1) + "%"; db.className = k > 0 ? "up" : k < 0 ? "down" : ""; }
    if (g) g.className = "pd-gauge " + (ch > 0 ? "up" : ch < 0 ? "down" : "");
  }
  /// a coin drops into a pool when someone's bet lands on it
  function dropCoin(side) {
    const b = K(side === "up" ? "upAmt" : "downAmt"), pool = b && b.closest(".pd-pool");
    if (!pool) return;
    const c = document.createElement("i");
    c.className = `pd-drop ${side}`;
    c.style.setProperty("--x", (Math.random() * 40 - 20).toFixed(0) + "px");
    pool.appendChild(c);
    setTimeout(() => c.remove(), 1000);
  }
  /// how the UP / DOWN split moved as bets came into the live round (from the chart read)
  function flowDraw(m) {
    const el = K("flow");
    if (!el) return;
    const c = S.chart && S.chart.market === m.id ? S.chart : null, f = c && c.flow ? c.flow[m.live.id] : null;
    if (!f || f.length < 2) { if (!el.hidden) el.hidden = true; return; }
    const r = m.live, t0 = f[0][0], t1 = Math.max(f[f.length - 1][0] + 1, Math.min(nowC(), r.endAt)), Wd = 300, Hd = 34;
    const sh = (u, d) => u / Math.max(1e-18, u + d);
    const pts = f.map(([t, u, d]) => [((t - t0) / Math.max(1, t1 - t0)) * Wd, Hd - sh(u, d) * Hd]);
    pts.push([Wd, pts[pts.length - 1][1]]);
    let d = `M0 ${Hd} V${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += ` H${pts[i][0].toFixed(1)} V${pts[i][1].toFixed(1)}`;
    d += ` V${Hd} Z`;
    const a = Math.round(sh(f[0][1], f[0][2]) * 100), z = Math.round(sh(f[f.length - 1][1], f[f.length - 1][2]) * 100);
    const h = `<small>${T("How the split moved")} · <span data-no-i18n>${f.length}</span></small><svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" aria-hidden="true"><rect class="f-dn" x="0" y="0" width="${Wd}" height="${Hd}"/><path class="f-up" d="${d}"/><line class="f-mid" x1="0" x2="${Wd}" y1="${Hd / 2}" y2="${Hd / 2}"/></svg><b data-no-i18n>UP ${a}% → ${z}%</b>`;
    el.hidden = false;
    if (el.innerHTML !== h) el.innerHTML = h;
  }

  // ---- practice mode (v3): play money on the real rounds, kept in this browser ----
  const PSTART = () => (isRH() ? 0.05 : 100);
  const paperK = () => `${LS.paper}.${S.chain}`;
  function paper() { const p = jget(paperK(), null); return p && Array.isArray(p.bets) ? p : { bal: PSTART(), bets: [], w: 0, l: 0 }; }
  const paperSave = (p) => { p.bets = p.bets.slice(0, 60); ls.set(paperK(), JSON.stringify(p)); };
  const paperOf = (mid, ep) => { const b = paper().bets.find((x) => x.m === mid && x.e === ep); return b ? { side: b.side, stake: b.amt, paper: true } : null; };
  function paperBet(side, v, m, br) {
    const p = paper();
    if (p.bal + 1e-12 < v) { say(T("Not enough play balance — reset it to start over."), "err"); return false; }
    const had = p.bets.find((x) => x.m === m.id && x.e === br.epoch);
    if (had && had.side !== side) { say(T("You already bet on the other side of this round."), "err"); return false; }
    if ((had ? had.amt : 0) + v > S.st.limits.maxBet + 1e-12) { say(`${T("A wallet can put at most")} <b data-no-i18n>${moneyU(S.st.limits.maxBet)}</b> ${T("in one round.")}`, "err"); return false; }
    p.bal -= v;
    if (had) had.amt += v; else p.bets.unshift({ m: m.id, sym: m.sym, d: m.duration, e: br.epoch, side, amt: v, at: Math.round(nowC()), end: br.endAt });
    paperSave(p);
    return true;
  }
  /// practice bets settle on the round's real result when it had real bets; otherwise on the prices this page saw
  /// (the round's price to beat, and the next round's — which is this round's close). With nobody on the other side,
  /// practice plays an even pot so a right call still pays.
  function paperTick() {
    if (!S.st || !S.st.markets) return;
    const p = paper(), fee = S.st.feeBps / 10000;
    let ch = false;
    for (const b of p.bets) {
      if (b.res) continue;
      const m = market(b.m);
      if (!m) continue;
      if (m.live.epoch === b.e && !m.live.openPending && m.live.open && !b.open) { b.open = m.live.open; ch = true; }
      if (m.live.epoch === b.e + 1 && !m.live.openPending && m.live.open && !b.close) { b.close = m.live.open; ch = true; }
      const r = (m.past || []).find((x) => x.epoch === b.e);
      const cmp = (o, c) => (o && c ? (c > o ? "up" : c < o ? "down" : "refund") : null);
      let res = r ? (r.result !== "refund" ? r.result : cmp(r.open, r.close) || "refund") : cmp(b.open, b.close);
      if (!res && nowC() > b.end + Math.max(600, b.d * 2)) res = "refund"; // the page never saw its end
      if (!res) continue;
      const upP = (r ? r.up : 0) + (b.side === "up" ? b.amt : 0), dnP = (r ? r.down : 0) + (b.side === "down" ? b.amt : 0);
      const mine = b.side === "up" ? upP : dnP, other = b.side === "up" ? dnP : upP;
      b.res = res === "refund" ? "refund" : res === b.side ? "won" : "lost";
      b.pay = b.res === "refund" ? b.amt : b.res === "won" ? (b.amt * (mine + Math.max(other, mine)) * (1 - fee)) / mine : 0;
      p.bal += b.pay; if (b.res === "won") p.w++; else if (b.res === "lost") p.l++;
      ch = true;
      if (S.practice) toast(tr(b.res === "won" ? "Practice win" : b.res === "lost" ? "Practice loss" : "Practice refund"), `${b.sym} ${dur(b.d)} #${b.e + 1} · ${b.side.toUpperCase()} ${money(b.amt)}${b.res === "won" ? " → " + money(b.pay) : ""}`, true);
    }
    if (ch) paperSave(p);
  }

  /// the last 10 results, newest on the right, with ARCIA's calls on them
  function results(m) {
    const el = K("res");
    if (!el) return;
    const past = (m.past || []).slice(0, 10), C = S.st.calls, mc = C && C.open && C.open[m.id], rec = (mc && mc.recent) || [];
    if (!past.length) { el.innerHTML = ""; return; }
    const hits = rec.filter((x) => x === "w").length, n = rec.filter(Boolean).length;
    const html = `<span class="pd-res-l">${T("Last rounds")}</span><span class="pd-res-d">${past.slice().reverse().map((r, i) => { const k = r.result === "up" ? "up" : r.result === "down" ? "down" : "refund", a = rec[past.length - 1 - i]; return `<i class="${k}${a ? " a" + a : ""}" title="#${r.epoch + 1} · ${k.toUpperCase()}${a ? " · ARCIA " + (a === "w" ? "✓" : "✗") : ""}" data-no-i18n>${k === "up" ? "▲" : k === "down" ? "▼" : "↺"}</i>`; }).join("")}</span>${n ? `<span class="pd-res-a" title="${T("ARCIA's calls on these rounds")}">ARCIA <b data-no-i18n>${hits}/${n}</b></span>` : ""}`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
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
    // which side is ahead right now: the card is tinted that way
    const lead = K("lead"), card0 = $("pd-round"), leadK = ch > 0 ? "up" : ch < 0 ? "down" : "";
    if (lead) {
      lead.hidden = !leadK || ph.k === "settling"; lead.className = "pd-lead " + leadK; lead.textContent = leadK ? `${leadK === "up" ? "▲ UP" : "▼ DOWN"} ${tr("is winning")} ${pc(ch)}` : "";
      // the lead changed hands: the pill flips over to its new colour
      const was = S.leadK[m.id];
      if (was && leadK && was !== leadK && !reduce()) { void lead.offsetWidth; lead.classList.add("flip"); }
      if (leadK) S.leadK[m.id] = leadK;
    }
    if (card0) { card0.classList.toggle("lead-up", leadK === "up"); card0.classList.toggle("lead-down", leadK === "down"); }
    ring(m, ph);
    results(m);
    gauge(m, ch);
    const up = r.up, down = r.down, pot = up + down, upPct = pot > 0 ? (up / pot) * 100 : 50;
    // a new bet came in: a coin drops into its side (4-2)
    const pk = `${m.id}:${r.epoch}`, pv = S.potPrev[pk];
    if (pv && !reduce()) { if (up > pv.up + 1e-12) dropCoin("up"); if (down > pv.down + 1e-12) dropCoin("down"); }
    S.potPrev[pk] = { up, down };
    roll("upAmt", up, money); roll("downAmt", down, money);
    setT("upPct", pot > 0 ? Math.round(upPct) + "%" : ""); setT("downPct", pot > 0 ? Math.round(100 - upPct) + "%" : "");
    const mu = mult(up, down, fee, "up"), md = mult(up, down, fee, "down");
    // the payout multiples roll as they change (1.59× → 1.62×)
    roll("upX", mu || NaN, fmtX); roll("downX", md || NaN, fmtX);
    const bar = K("bar"); if (bar) bar.style.width = upPct.toFixed(1) + "%";
    const lov = K("lockov"); if (lov) lov.hidden = ph.k === "open" || !br || br.kind !== "next";
    const lp = mineIn(r.id, m.id, r.epoch);
    // "You" on the pool bar, in the middle of your side
    const bm = K("barme");
    if (bm) { bm.hidden = !lp; if (lp) { bm.style.left = (lp.side === "up" ? upPct / 2 : upPct + (100 - upPct) / 2).toFixed(1) + "%"; bm.className = "pd-bar-me " + lp.side; } }
    flowDraw(m);
    // "You" on your side of the live round's pools
    for (const sd of ["up", "down"]) { const y = K(sd === "up" ? "youUp" : "youDown"); if (y) { const on = !!lp && lp.side === sd; y.hidden = !on; if (on) y.textContent = `${tr(lp.paper ? "You (practice)" : "You")} · ${money(lp.stake)}`; } }
    const lpe = K("livepos");
    // the round open for bets shows its own position line; the live one only when they're different rounds
    if (lpe) { lpe.hidden = !lp || (br && br.id && br.id === r.id); if (lp && !lpe.hidden) { lpe.className = "pd-pos " + lp.side; lpe.innerHTML = posLine(lp, up, down); } }
    // the keeper is late: say so on the card
    const k = S.kstat, ago = k && k.at ? nowC() - k.at : null, lateEl = K("late");
    if (lateEl) { const late = ago != null && ago > Math.max(300, m.duration); lateEl.hidden = !late; if (late) lateEl.textContent = tr("Results are running late — each round settles as soon as the keeper reads the pool again. Bets already placed stay in the round."); }
    chartDraw(m);
    // the betting box
    const bb = K("betbox");
    const amt = Number(String(($("pd-amt") || {}).value || S.amt || "").replace(/,/g, ""));
    if (isRH()) setT("amtusd", amt > 0 && uUsd() ? "≈" + usd(amt * uUsd()) : "");
    const lim = S.st.limits, bad = amt > 0 && (amt < lim.minBet - 1e-12 || amt > lim.maxBet + 1e-12);
    const inp = $("pd-amt"); if (inp) inp.classList.toggle("bad", bad);
    if (br) {
      const bu = br.up, bd = br.down, bp = mineIn(br.id, m.id, br.epoch);
      setT("bethint", br.kind === "next" ? `${tr("starts in")} ${mmss(br.startAt - nowC())} · ${tr("price to beat set when it starts")}` : `${tr("bets close in")} ${mmss(br.lockAt - nowC())}`);
      const mp = K("betpools");
      if (mp) mp.innerHTML = br.kind === "next" ? `<span>UP <b data-no-i18n>${money(bu)}</b></span><span>DOWN <b data-no-i18n>${money(bd)}</b></span>` : "";
      // nobody in yet / one side empty: what happens then
      const first = K("first");
      if (first) {
        const empty = bu + bd <= 0;
        const t = empty ? tr("The first bet sets the odds") : bd <= 0 ? tr("Nobody on DOWN yet") : bu <= 0 ? tr("Nobody on UP yet") : "";
        const b = empty ? tr("Nobody on the other side by the lock? Everyone gets their full stake back — no fee.") : bd <= 0 ? tr("If nobody takes DOWN, UP bets are refunded in full.") : bu <= 0 ? tr("If nobody takes UP, DOWN bets are refunded in full.") : "";
        first.hidden = !t || !!bp; setT("firstT", t); setT("firstB", b); first.classList.toggle("big", empty);
      }
      // a bet ARCIA filled in from her chat: the amount is in the box and its side glows (nothing is placed)
      const SG = S.sugg && Date.now() - S.sugg.at < 10 * 60e3 ? S.sugg : null, sgEl = K("sugg");
      if (sgEl) { sgEl.hidden = !SG || !!bp; if (SG && !bp) { const h = `<img src="/images/arcia-avatar-96.jpg" alt="" width="22" height="22"><span>${T("ARCIA filled this in")}: <b data-no-i18n>${SG.side ? SG.side.toUpperCase() + " " : ""}${SG.amt ? esc(money(SG.amt)) : ""}</b> — ${T("check it, then tap and sign in your wallet.")}</span>`; if (sgEl.innerHTML !== h) sgEl.innerHTML = h; } }
      panel.querySelectorAll("#pd-round [data-pd-bet]").forEach((b) => b.classList.toggle("pd-suggest", !!SG && !bp && SG.side === b.dataset.pdBet));
      // practice mode: its balance and record
      const prEl = K("prac");
      if (prEl) { prEl.hidden = !S.practice; if (S.practice) { const P = paper(); const h = `<b>${T("Practice mode")}</b><span>${T("play balance")} <b data-no-i18n>${esc(money(P.bal))}</b> · <span data-no-i18n>${P.w}–${P.l}</span></span><button type="button" class="pd-btn sm" data-pd-act="pracreset">${T("Reset")}</button><button type="button" class="pd-btn sm" data-pd-act="practice">${T("Leave")}</button>`; if (prEl.innerHTML !== h) prEl.innerHTML = h; } }
      // ARCIA's call on this round (for fun)
      const ac = K("arcia"), C = S.st.calls, mc = C && C.open && C.open[m.id];
      if (ac) {
        const show = mc && mc.pick && mc.epoch === br.epoch;
        ac.hidden = !show;
        if (show) {
          const rec = `${C.arcia.w}–${C.arcia.l}`, crowd = `${C.crowd.w}–${C.crowd.l}`;
          const html = `<img src="/images/arcia-avatar-96.jpg" alt="" width="28" height="28" loading="lazy"><span>${T("ARCIA's call")}: <b class="${mc.pick}" data-no-i18n>${mc.pick === "up" ? "UP ▲" : "DOWN ▼"}</b></span><small>${T("her record")} <b data-no-i18n>${rec}</b> · ${T("the crowd")} <b data-no-i18n>${crowd}</b></small><em>${T("for fun, not advice")}</em>`;
          if (ac.innerHTML !== html) ac.innerHTML = html;
        }
      }
      const pu = payout(bu, bd, fee, "up", amt), pdn = payout(bu, bd, fee, "down", amt);
      setT("payUp", pu ? (lone(bu, bd, "up") ? tr("refund if no DOWN") : `${tr("wins ≈")} ${money(pu)}`) : tr("price ends higher"));
      setT("payDown", pdn ? (lone(bu, bd, "down") ? tr("refund if no UP") : `${tr("wins ≈")} ${money(pdn)}`) : tr("price ends lower"));
      // what this amount pays, before it's placed (if no one else comes in)
      const pv = K("preview");
      if (pv) {
        const show = amt > 0 && !bad && !bp;
        pv.hidden = !show && !bad;
        if (bad) { pv.className = "pd-preview bad"; pv.innerHTML = `${T(amt < lim.minBet ? "The smallest bet is" : "A wallet can put at most")} <b data-no-i18n>${moneyU(amt < lim.minBet ? lim.minBet : lim.maxBet)}</b>${amt < lim.minBet ? "" : ` ${T("in one round.")}`}`; }
        else if (show) {
          const line = (sd, v) => (lone(bu, bd, sd) ? `${sd.toUpperCase()}: ${T("refunded unless someone takes the other side")}` : `${sd === "up" ? "▲" : "▼"} ${T(sd === "up" ? "If UP wins" : "If DOWN wins")} <b data-no-i18n>${moneyU(v)}</b> <i data-no-i18n>${v > amt ? "+" + money(v - amt) : ""}</i>`);
          pv.className = "pd-preview"; pv.innerHTML = `<span>${line("up", pu)}</span><span>${line("down", pdn)}</span><small>${T("if nobody else bets after you")}</small>`;
        }
      }
      const can = (S.practice || !S.st.paused) && nowC() < br.lockAt;
      panel.querySelectorAll("#pd-round [data-pd-bet]").forEach((b) => { b.disabled = !can || bad || (bp && bp.side !== b.dataset.pdBet); });
      if (bb) bb.classList.toggle("dis", !can);
      const bpe = K("betpos");
      if (bpe) { bpe.hidden = !bp; if (bp) { bpe.className = "pd-pos " + bp.side; bpe.innerHTML = posLine(bp, bu, bd); } }
      // Robinhood Chain: the wallet is on another network — one tap to switch before betting
      const sw = K("rhsw"); if (sw) sw.hidden = !(isRH() && acct() && S.wchain != null && S.wchain !== RH_CHAIN);
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
    sticky(m, br);
  }
  function ring(m, ph) {
    const r = K("ring");
    if (!r) return;
    r.style.setProperty("--f", (Math.min(1, Math.max(0, ph.frac || 0)) * 100).toFixed(2));
    r.className = `pd-ring pd-ph-${ph.k}${ph.left > 0 && ph.left <= 10 ? " pulse" : ""}`;
    setT("left", ph.left ? mmss(ph.left) : "…");
    setT("phase", ph.label);
    setT("phaseT", ph.left ? mmss(ph.left) : "");
    // Bet → Live → Settle
    const stp = K("steps");
    if (stp && stp.dataset.on !== ph.k) { stp.dataset.on = ph.k; const O = ["open", "locked", "settling"], at = O.indexOf(ph.k); stp.querySelectorAll("li").forEach((li) => { const i = O.indexOf(li.dataset.s); li.className = i < at ? "done" : i === at ? "on" : ""; }); }
    // the last 10 seconds before bets close: the card glows
    const c = $("pd-round"); if (c) c.classList.toggle("pd-hot", ph.k === "open" && ph.left > 0 && ph.left <= 10 && !reduce());
    countdown(m, ph);
  }
  /// the finish: 3-2-1 over the card as the round ends, then "reading the pool" until the result lands
  function countdown(m, ph) {
    const el = K("cd");
    if (!el) return;
    const n = ph.k === "locked" && ph.left > 0 && ph.left <= 3 ? Math.ceil(ph.left) : 0;
    if (n) {
      el.hidden = false;
      if (el.dataset.n !== String(n)) { el.dataset.n = String(n); el.className = "pd-cd n"; el.innerHTML = `<b data-no-i18n>${n}</b>`; if (!reduce()) { void el.offsetWidth; el.classList.add("go"); } }
    } else if (ph.k === "settling" && myBet(m.live.id)) {
      el.hidden = false;
      if (el.dataset.n !== "s") { el.dataset.n = "s"; el.className = "pd-cd s"; el.innerHTML = `<span class="pd-cd-spin" aria-hidden="true"></span><span>${T("Reading the pool…")}</span>`; }
    } else if (!el.hidden) { el.hidden = true; el.dataset.n = ""; }
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
    // bets in this window, as dots on the line where they came in (green UP, pink DOWN)
    const at = (t) => { let v = series[0][1]; for (const p of series) { if (p[0] > t) break; v = p[1]; } return v; };
    const bets = ((S.feed && S.feed.items) || []).filter((x) => x.market === m.id && x.t >= x0 && x.t <= Math.min(nowC(), x1)).slice(0, 40)
      .map((x) => `<circle class="pd-c-bet ${x.up ? "up" : "down"}" cx="${X(x.t).toFixed(1)}" cy="${Y(at(x.t)).toFixed(1)}" r="${Math.min(6, 2.5 + Math.sqrt(x.amount / Math.max(1e-12, S.st.limits.maxBet)) * 3).toFixed(1)}"><title>${esc((x.up ? "UP " : "DOWN ") + money(x.amount))}</title></circle>`).join("");
    box.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" preserveAspectRatio="none" role="img" aria-label="${T("Price through this round")}">
      <defs><clipPath id="${id}a"><rect x="0" y="0" width="${Wd}" height="${oy || Hd}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${oy || 0}" width="${Wd}" height="${Hd}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39ff88" stop-opacity=".32"/><stop offset="1" stop-color="#39ff88" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5c8a" stop-opacity=".32"/><stop offset="1" stop-color="#ff5c8a" stop-opacity="0"/></linearGradient></defs>
      <rect class="pd-c-pre" x="0" y="0" width="${X(r.startAt).toFixed(1)}" height="${Hd}"/>
      <line class="pd-c-lock" x1="${X(r.lockAt).toFixed(1)}" x2="${X(r.lockAt).toFixed(1)}" y1="0" y2="${Hd}"/>
      ${oy ? `<path d="${area}" fill="url(#${id}g)" clip-path="url(#${id}a)"/><path d="${area}" fill="url(#${id}r)" clip-path="url(#${id}b)"/>` : ""}
      ${oy ? `<g clip-path="url(#${id}a)"><path class="pd-c-line up" d="${d}"/></g><g clip-path="url(#${id}b)"><path class="pd-c-line down" d="${d}"/></g><line class="pd-c-open" x1="0" x2="${Wd}" y1="${oy}" y2="${oy}"/>` : `<path class="pd-c-line" d="${d}"/>`}
      ${bets}${series.slice(-5, -1).map((p, i, a) => `<circle class="pd-c-trail" cx="${X(Math.max(x0, p[0])).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="${(1.6 + i * 0.5).toFixed(1)}" style="opacity:${((i + 1) / (a.length + 1) * 0.55).toFixed(2)}"/>`).join("")}<circle class="pd-c-dot" cx="${lastX}" cy="${Y(m.price).toFixed(1)}" r="4"/></svg>
      ${oy ? `<span class="pd-c-tag" style="top:${((oy / Hd) * 100).toFixed(1)}%" data-no-i18n>${esc(px(r.open))}</span>` : ""}
      <div class="pd-c-axis" data-no-i18n>${[[r.startAt, tr("start")], ...((r.endAt - r.lockAt) / Math.max(1, x1 - x0) > 0.18 ? [[r.lockAt, tr("bets close")]] : []), [r.endAt, tr("end")]].map(([t, l]) => `<span style="left:${((X(t) / Wd) * 100).toFixed(1)}%"><b>${esc(l)}</b>${clock(t)}</span>`).join("")}</div>`;
  }
  const clock = (t) => new Date((t - S.skew) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
    st.innerHTML = `<b>${k === "refund" ? T("REFUND") : `${k === "up" ? "▲ UP" : "▼ DOWN"} ${T("WINS")}`}</b><span data-no-i18n>#${p.epoch + 1} · ${px(p.open)} → ${px(p.close)}</span>${won ? `<em data-no-i18n>+${money(reduce() ? profit : 0)}</em>` : ""}`;
    st.hidden = false;
    // your winnings count up; a loss shakes; the phone buzzes either way
    if (won && !reduce()) { const em = st.querySelector("em"), t0 = performance.now(); const step = (t) => { const k2 = Math.min(1, (t - t0) / 900); if (em) em.textContent = "+" + money(profit * (1 - Math.pow(1 - k2, 3))); if (k2 < 1 && em && em.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    if (mine) buzz(won ? [20, 40, 60] : k === "refund" ? 20 : 90);
    const cd = K("cd"); if (cd) { cd.hidden = true; cd.dataset.n = ""; }
    const pools = K("pools");
    if (pools && !reduce() && k !== "refund") { pools.classList.remove("win-up", "win-down"); void pools.offsetWidth; pools.classList.add("win-" + k); setTimeout(() => pools.classList.remove("win-up", "win-down"), 2600); }
    if (mine && !won && k !== "refund" && !reduce()) { st.classList.add("lost"); }
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

  // ---- phones: UP / DOWN pinned to the bottom while the betting box is off screen ----
  let stickyObs = null, cardObs = null, betVisible = true;
  function stickyWatch() {
    if (stickyObs) { stickyObs.disconnect(); stickyObs = null; }
    if (cardObs) { cardObs.disconnect(); cardObs = null; }
    const bb = K("betbox"), rc = $("pd-round");
    if (!bb || !("IntersectionObserver" in window)) return;
    const again = () => { const m = market(); if (m && S.st && S.st.live) sticky(m, betRound(m)); };
    stickyObs = new IntersectionObserver((es) => { betVisible = es.some((e) => e.isIntersecting); again(); }, { threshold: 0.25 });
    stickyObs.observe(bb);
    // v3: the bar only while the round card itself is on screen (not over the guide or the footer)
    if (rc) { cardObs = new IntersectionObserver((es) => { S.roundVis = es.some((e) => e.isIntersecting); again(); }, { threshold: 0.05 }); cardObs.observe(rc); }
  }
  function sticky(m, br) {
    const el = $("pd-sticky");
    if (!el) return;
    const show = S.view === "market" && panel.classList.contains("active") && !!br && !betVisible && S.roundVis && (S.practice || !S.st.paused) && !mineIn(br.id, m.id, br.epoch) && nowC() < br.lockAt;
    el.hidden = !show;
    document.body.classList.toggle("pd-sticky-on", show);
    if (!show) return;
    const fee = S.st.feeBps / 10000, amt = Number(String(S.amt || "").replace(/,/g, "")) || 0;
    const pu = payout(br.up, br.down, fee, "up", amt), pdn = payout(br.up, br.down, fee, "down", amt);
    const key = `${m.id}|${br.epoch}|${amt}|${br.up}|${br.down}|${Math.floor(Math.max(0, br.lockAt - nowC()))}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    // one row: the market and time left · the amount (a tap cycles the quick amounts) · UP · DOWN
    const cs = chips(S.st.limits), cur = cs.find(([v]) => Math.abs(v - amt) < 1e-12);
    el.innerHTML = `<span class="pd-st-t"><b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b><small data-no-i18n>${mmss(br.lockAt - nowC())}</small></span>
      <button type="button" class="pd-st-amtc${amt > 0 ? " on" : ""}" data-pd-act="stamt" title="${T("Tap to change the amount")}" data-no-i18n>${esc(amt > 0 ? (cur ? cur[1] : money(amt)) : tr("Amount"))}</button>
      <button type="button" class="pd-up" data-pd-bet="up"${amt > 0 ? "" : " disabled"}><span>▲ UP</span><small data-no-i18n>${pu && !lone(br.up, br.down, "up") ? "≈" + money(pu) : ""}</small></button><button type="button" class="pd-down" data-pd-bet="down"${amt > 0 ? "" : " disabled"}><span>▼ DOWN</span><small data-no-i18n>${pdn && !lone(br.up, br.down, "down") ? "≈" + money(pdn) : ""}</small></button>`;
  }
  window.addEventListener("resize", () => { const m = market(); if (m && S.st && S.st.live) sticky(m, betRound(m)); });

  // ---- reactions on the live round ----
  async function loadRx() { const m = S.m; if (m == null) return; const j = await getJ(`predict=rx&m=${m}`); if (j && j.r && m === S.m) { S.rx = j; S.rxM = m; } }
  function paintRx() {
    const el = K("rx"), m = market();
    if (!el || !m) return;
    const r = (S.rxM === m.id && S.rx && S.rx.r && S.rx.r[m.live.epoch]) || {};
    const mine = jget(LS.rx, {})[`${S.chain}:${m.id}:${m.live.epoch}`] || {};
    const html = RXK.map(([k, l]) => `<button type="button" class="pd-rxb${mine[k] ? " on" : ""}" data-pd-rx="${k}" title="${T(l)}" aria-label="${T(l)}">${ICO[k]}<b data-no-i18n>${r[k] || ""}</b></button>`).join("") + `<small>${T("this round")}</small>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  async function react(kind, btn) {
    const m = market();
    if (!m) return;
    const key = `${S.chain}:${m.id}:${m.live.epoch}`, all = jget(LS.rx, {}), mine = all[key] || {};
    if (Object.values(mine).reduce((a, b) => a + b, 0) >= 4) return;
    mine[kind] = (mine[kind] || 0) + 1; all[key] = mine;
    const keys = Object.keys(all); if (keys.length > 60) for (const k of keys.slice(0, keys.length - 60)) delete all[k];
    ls.set(LS.rx, JSON.stringify(all));
    if (S.rxM === m.id && S.rx) { const r = (S.rx.r[m.live.epoch] = S.rx.r[m.live.epoch] || {}); r[kind] = (r[kind] || 0) + 1; }
    paintRx();
    if (btn && !reduce()) { const b = panel.querySelector(`[data-pd-rx="${kind}"]`); if (b) { const f = document.createElement("i"); f.className = "pd-rx-fly"; f.innerHTML = ICO[kind]; b.appendChild(f); setTimeout(() => f.remove(), 900); } }
    try { await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "predict-react", chain: S.chain, m: m.id, epoch: m.live.epoch, kind }) }); } catch { /* counted here only */ }
  }

  // ---- which network the wallet is on (Robinhood Chain: a switch button before betting) ----
  async function walletChain() {
    const p = walletProv();
    if (!p || !acct()) { S.wchain = null; return; }
    try { S.wchain = Number.parseInt(await p.request({ method: "eth_chainId" }), 16); } catch { S.wchain = null; }
  }

  // ---- new bets on this market slide in at the bottom of the card ----
  function ticker() {
    const it = (S.feed && S.feed.items) || [];
    const seen = S.feedSeen;
    S.feedSeen = new Set(it.map((x) => `${x.user}|${x.t}|${x.market}|${x.amount}`));
    if (!seen || S.view !== "market") return;
    const el = K("ticker");
    if (!el) return;
    const me = acct();
    const fresh = it.filter((x) => x.market === S.m && !seen.has(`${x.user}|${x.t}|${x.market}|${x.amount}`) && lc(x.user) !== me).slice(0, 3);
    fresh.forEach((x, i) => setTimeout(() => {
      const p = document.createElement("span");
      p.className = `pd-tk ${x.up ? "up" : "down"}`;
      p.innerHTML = `<i aria-hidden="true">${x.up ? "▲" : "▼"}</i><span data-no-i18n>${esc(short(x.user))}</span><b data-no-i18n>${x.up ? "UP" : "DOWN"} ${esc(money(x.amount))}</b>`;
      el.appendChild(p);
      setTimeout(() => p.classList.add("out"), 3600);
      setTimeout(() => p.remove(), 4200);
    }, i * 700));
  }

  // ---- badges, from your stats ----
  const BADGES = [
    ["first", "First call", (s, n) => n >= 1], ["win", "First win", (s) => s.wins >= 1], ["roll", "On a roll · 3 in a row", (s) => s.best >= 3],
    ["hot", "Hot streak · 5 in a row", (s) => s.best >= 5], ["legend", "Unstoppable · 10 in a row", (s) => s.best >= 10],
    ["reg", "Regular · 10 rounds", (s, n) => n >= 10], ["vet", "Veteran · 50 rounds", (s, n) => n >= 50], ["cent", "Centurion · 100 rounds", (s, n) => n >= 100],
    ["green", "In profit", (s) => s.pnl > 0],
  ];
  function badges(st) {
    if (!st) return "";
    const n = st.n != null ? st.n : (st.wins || 0) + (st.losses || 0);
    const got = BADGES.filter(([, , f]) => f(st, n));
    // a badge earned since this browser last looked: a toast
    const k = `${LS.badges}.${S.chain}.${acct()}`, had = jget(k, null);
    if (had) for (const [id, l] of got) if (!had.includes(id)) toast(tr("Badge unlocked"), tr(l), true);
    ls.set(k, JSON.stringify(got.map((b) => b[0])));
    const next = BADGES.find(([, , f]) => !f(st, n));
    return `<div class="pd-badges">${got.map(([id, l]) => `<span class="pd-badge ${id}" title="${T(l)}">${T(l.split(" · ")[0])}</span>`).join("")}${next ? `<span class="pd-badge next" title="${T("Next badge")}">${T(next[1])}</span>` : ""}</div>`;
  }

  // ---- side panel: my bets · last rounds · live bets · invite ----
  function side() {
    const el = $("pd-side");
    const tabsH = `<div class="pd-stabs" role="tablist">${[["bets", S.practice ? "Practice bets" : "Your bets"], ["past", "Last rounds"], ["feed", "Live bets"], ["invite", "Invite"]].map(([k, l]) => `<button type="button" role="tab" data-pd-side="${k}" aria-selected="${S.side === k}" title="${T(l)}">${ICO[k]}<span>${T(l)}</span>${k === "bets" && ((S.mine && S.mine.claimable > 0) || (S.mineOther && S.mineOther.claimable > 0)) ? ` <i class="pd-dot" aria-hidden="true"></i>` : ""}</button>`).join("")}</div>`;
    let body = "";
    if (S.side === "bets") body = S.practice ? sidePractice() : sideBets();
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
    // everything this wallet can claim, on both chains (the other chain's is one tap: switch, then claim)
    const O = S.mineOther, oName = O && O.chain === "rh" ? "Robinhood Chain" : "Arc";
    const oAmt = O ? (O.chain === "rh" ? `${ethS(O.claimable)}${O.unitUsd ? ` <small class="pd-usd">≈${usd(O.claimable * O.unitUsd)}</small>` : ""}` : usd(O.claimable)) : "";
    const claimBox = M.claimable > 0 || (O && O.claimable > 0) ? `<div class="pd-claim glow"><div><small>${T("Ready to claim")}</small>${M.claimable > 0 ? `<b data-no-i18n>${moneyU(M.claimable)}</b>` : ""}${O && O.claimable > 0 ? `<span class="pd-claim-o" data-no-i18n>${M.claimable > 0 ? "+ " : ""}<b>${oAmt}</b> ${L3({ en: "on {c}", ko: "{c}에서", zh: "在 {c}" }).replace("{c}", oName)}</span>` : ""}</div><div class="pd-claim-b">${M.claimable > 0 ? `<button type="button" class="pd-btn go" data-pd-act="claim">${T("Claim")}</button>` : ""}${O && O.claimable > 0 ? `<button type="button" class="pd-btn" data-pd-act="claimother">${T("Switch and claim")} <span data-no-i18n>${O.chain === "rh" ? "RH" : "Arc"}</span></button>` : ""}</div></div>` : "";
    const pod = st && st.podiums && st.podiums.some(Boolean) ? `<div class="pd-pods">${T("Weekly podiums")}: ${["1st", "2nd", "3rd"].map((l, i) => (st.podiums[i] ? `<span class="pd-pod p${i + 1}" data-no-i18n>${l} ×${st.podiums[i]}</span>` : "")).join("")}</div>` : "";
    return claimBox +
      (st ? `<div class="pd-stats4"><div><small>${T("PnL")}</small><b class="${st.pnl >= 0 ? "up" : "down"}" data-no-i18n>${st.pnl >= 0 ? "+" : ""}${money(st.pnl)}</b>${pnlSpark(st.days)}</div><div><small>${T("Win rate")}</small><b data-no-i18n>${st.wins + st.losses ? Math.round((st.wins / (st.wins + st.losses)) * 100) + "%" : "—"}</b></div><div><small>${T("Streak")}</small><b data-no-i18n class="${st.streak >= 3 ? "pd-hotstreak" : ""}" style="--s:${Math.min(10, st.streak)}">${st.streak >= 2 ? ICO.flame : ""}${st.streak} · ${T("best")} ${st.best}</b></div><div><small>${T("Volume")}</small><b data-no-i18n>${bigM(st.vol)}</b></div></div>${pod}${badges(st)}
        <div class="pd-row pd-mestats"><button type="button" class="pd-btn" data-pd-act="sharestats">${T("Share my stats card")}</button><a class="pd-btn pd-tgalert" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener" title="${T("Send /predictalerts with your wallet to ARCIA's bot")}">${ICO.tg}<span>${T("Alerts on Telegram")}</span></a></div>` : "") +
      (items.length ? `<div class="pd-bets">${items.map((x) => `<div class="pd-b ${x.side}"><span data-no-i18n>#${x.epoch != null ? x.epoch + 1 : x.round}</span><b data-no-i18n>${esc(mkName(x.market))}</b><i data-no-i18n>${x.side.toUpperCase()}</i><span data-no-i18n>${money(x.stake)}</span>${res(x)}${x.claimable > 0 ? `<small class="win" data-no-i18n>+${money(x.claimable)}</small>` : x.claimed ? `<small>${T("claimed")}</small>` : "<small></small>"}${x.result !== "open" ? `<button type="button" class="pd-ico sm" data-pd-share="${x.round}" title="${T("Share")}" aria-label="${T("Share")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg></button>` : "<span></span>"}</div>`).join("")}</div>` : `<p class="pd-empty">${T("No bets in the recent rounds.")}</p>${how()}`);
  }
  /// the PnL of the last days as a tiny line (running total)
  function pnlSpark(days) {
    if (!days || days.length < 2) return "";
    let run = 0; const v = days.map(([, x]) => (run += x));
    const lo = Math.min(0, ...v), hi = Math.max(0, ...v), Wd = 64, Hd = 18, X = (i) => (i / (v.length - 1)) * Wd, Y = (x) => Hd - 1 - ((x - lo) / Math.max(1e-12, hi - lo)) * (Hd - 2);
    return `<svg class="pd-pnlsp ${run >= 0 ? "up" : "down"}" viewBox="0 0 ${Wd} ${Hd}" aria-hidden="true"><line x1="0" x2="${Wd}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/><polyline points="${v.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(" ")}"/></svg>`;
  }
  /// practice mode's side panel: the play balance, the record and the practice bets
  function sidePractice() {
    paperTick();
    const P = paper(), n = P.w + P.l;
    const rows = P.bets.slice(0, 14).map((b) => `<div class="pd-b ${b.side}"><span data-no-i18n>#${b.e + 1}</span><b data-no-i18n>${esc(b.sym)} ${dur(b.d)}</b><i data-no-i18n>${b.side.toUpperCase()}</i><span data-no-i18n>${money(b.amt)}</span>${b.res ? `<em class="${b.res === "won" ? "win" : b.res === "lost" ? "lost" : ""}">${T(b.res === "won" ? "won" : b.res === "lost" ? "lost" : "refund")}</em>` : `<em class="pd-live">${T("live")}</em>`}<small class="${b.res === "won" ? "win" : ""}" data-no-i18n>${b.res === "won" ? "+" + money(b.pay - b.amt) : ""}</small><span></span></div>`).join("");
    return `<div class="pd-prac-side"><div class="pd-stats4"><div><small>${T("Play balance")}</small><b data-no-i18n>${money(P.bal)}</b></div><div><small>${T("Win rate")}</small><b data-no-i18n>${n ? Math.round((P.w / n) * 100) + "%" : "—"}</b></div><div><small>${T("Won / lost")}</small><b data-no-i18n>${P.w} / ${P.l}</b></div><div><small>${T("Started with")}</small><b data-no-i18n>${money(PSTART())}</b></div></div>
      <p class="pd-small">${T("Practice bets go on the real rounds with play money and settle on the real result. Nothing leaves your wallet. With nobody on the other side, practice pays an even pot.")}</p>
      ${rows ? `<div class="pd-bets">${rows}</div>` : `<p class="pd-empty">${T("No practice bets yet — pick UP or DOWN on the round.")}</p>`}
      <div class="pd-row"><button type="button" class="pd-btn" data-pd-act="pracreset">${T("Reset the play balance")}</button><button type="button" class="pd-btn go" data-pd-act="practice">${T("Play for real")}</button></div></div>`;
  }
  /// the last 50 results of this market as a grid (oldest top left, newest bottom right)
  function heatGrid() {
    const it = S.heatM === S.m && S.heat ? S.heat : null;
    if (!it || !it.length) return "";
    const ups = it.filter((x) => x.r === "u").length, dns = it.filter((x) => x.r === "d").length;
    return `<div class="pd-heat"><div class="pd-heat-h"><b data-no-i18n>${L3({ en: "Last {n} results", ko: "최근 {n}개 결과", zh: "最近 {n} 个结果" }).replace("{n}", it.length)}</b><span data-no-i18n><i class="u"></i>UP ${ups} · <i class="d"></i>DOWN ${dns}${it.length - ups - dns ? ` · <i class="x"></i>${it.length - ups - dns}` : ""}</span></div><div class="pd-heat-g">${it.slice().reverse().map((x) => `<i class="${x.r}" title="#${x.e + 1} · ${x.r === "u" ? "UP" : x.r === "d" ? "DOWN" : "refund"} · ${esc(money(x.pot))}"></i>`).join("")}</div></div>`;
  }
  function sidePast() {
    const m = market();
    const rows = (m && m.past) || [];
    return heatGrid() + (rows.length ? `<div class="pd-hist">${rows.map((r) => {
      const ch = r.open && r.close ? (r.close / r.open - 1) * 100 : null;
      const k = r.result === "up" ? "up" : r.result === "down" ? "down" : "refund";
      return `<div class="pd-h ${k}"><i aria-hidden="true">${k === "up" ? "▲" : k === "down" ? "▼" : "↺"}</i><span data-no-i18n>#${r.epoch + 1}</span><b>${T(k === "refund" ? "Refund" : k.toUpperCase())}</b><em data-no-i18n>${ch == null ? "" : pc(ch)}</em><small data-no-i18n>${money(r.up + r.down)}</small><button type="button" class="pd-ico sm" data-pd-share="${r.id}" title="${T("Share")}" aria-label="${T("Share")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg></button></div>`;
    }).join("")}</div>` : `<p class="pd-empty">${T("No settled rounds with bets yet.")}</p>${how()}`);
  }
  function sideFeed() {
    const it = (S.feed && S.feed.items) || [];
    if (!it.length) return `<p class="pd-empty">${T("No bets yet.")}</p>`;
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
    el.innerHTML = `<div class="pd-all-h"><h3>${T("Every live round")}</h3>${Number(S.amt) > 0 ? `<small class="pd-small">${T("Quick bets use your amount")}: <b data-no-i18n>${esc(money(Number(S.amt)))}</b></small>` : ""}<div class="pd-sort">${[["time", "Ending soon"], ["pot", "Biggest pot"]].map(([k, l]) => `<button type="button" class="pd-btn${S.sort === k ? " on" : ""}" data-pd-sort="${k}">${T(l)}</button>`).join("")}</div></div>
      <div class="pd-grid">${ms.map((m) => {
        const ph = phase(m), pot = m.live.up + m.live.down, upPct = pot > 0 ? (m.live.up / pot) * 100 : 50;
        const ch = m.price && m.live.open ? (m.price / m.live.open - 1) * 100 : null;
        const br = betRound(m), qa = Number(String(S.amt || "").replace(/,/g, "")) || 0, qOk = br && qa > 0 && !S.st.paused && t < br.lockAt - 2 && !myBet(br.id);
        return `<div class="pd-tile${br && br.lockAt - t <= 30 && br.lockAt > t ? " soon" : ""}" role="button" tabindex="0" data-pd-go="${m.id}">
          <span class="pd-tile-h">${logo(m)}<b data-no-i18n>${esc(m.sym)}</b><em data-no-i18n>${dur(m.duration)}</em></span>
          <span class="pd-tile-pot"><small data-no-i18n>${L3({ en: "pot", ko: "팟", zh: "奖池" })}</small><b data-no-i18n>${pot > 0 ? esc(bigM(pot)) : "—"}</b></span>
          <span class="pd-ring md pd-ph-${ph.k}" style="--f:${(Math.min(1, Math.max(0, ph.frac || 0)) * 100).toFixed(1)}"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19" pathLength="100"/></svg><b data-pd-tleft="${m.id}" data-no-i18n>${ph.left ? mmss(ph.left) : "…"}</b></span>
          <span class="pd-tile-px"><b data-no-i18n>${px(m.price)}</b><i class="${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${ch == null ? "" : pc(ch)}</i></span>
          <span class="pd-tile-bar" style="--up:${upPct.toFixed(1)}%"><i></i></span>
          <span class="pd-tile-f"><span data-no-i18n>UP ${money(m.live.up)}</span><span data-no-i18n>${money(m.live.down)} DOWN</span></span>
          ${qOk ? `<span class="pd-tile-q"><button type="button" class="pd-up" data-pd-qb="up" data-pd-qm="${m.id}" data-no-i18n>▲ UP ${esc(money(qa))}</button><button type="button" class="pd-down" data-pd-qb="down" data-pd-qm="${m.id}" data-no-i18n>▼ DOWN ${esc(money(qa))}</button></span>` : ""}</div>`;
      }).join("") || `<p class="pd-empty">${T("No market yet")}</p>`}</div>`;
  }

  // ---- leaderboard ----
  function lbView() {
    const el = $("pd-view-lb"), L = S.lb;
    if (!L) { el.innerHTML = skel(); return; }
    const rows = (L[S.lbTab] || []).slice(0, 25), a = acct(), F = L.fan || {}, PD = L.podiums || {};
    const FAN = { diamond: "Diamond", gold: "Gold", silver: "Silver", bronze: "Bronze" };
    const fanB = (u) => (F[u] ? `<i class="pd-fan ${F[u]}" title="${T("Fan tier from the $ARCIA held on Robinhood Chain")}">${T(FAN[F[u]])}</i>` : "");
    const podB = (u) => { const p = PD[u]; return p ? p.map((n, i) => (n ? `<i class="pd-pod p${i + 1}" title="${T("Weekly podiums")}" data-no-i18n>${["1st", "2nd", "3rd"][i]}${n > 1 ? " ×" + n : ""}</i>` : "")).join("") : ""; };
    const top3 = rows.slice(0, 3);
    const podium = top3.length && top3[0].pnl > 0 ? `<div class="pd-podium">${[1, 0, 2].map((i) => top3[i] ? `<div class="pd-pdm r${i + 1}${top3[i].user === a ? " me" : ""}"><span class="pd-pdm-av" style="--h:${parseInt(top3[i].user.slice(2, 6), 16) % 360}" aria-hidden="true"></span><a href="${EXPL("address", top3[i].user)}" target="_blank" rel="noopener" data-no-i18n>${short(top3[i].user)}</a>${fanB(top3[i].user)}<b class="${top3[i].pnl >= 0 ? "up" : "down"}" data-no-i18n>${top3[i].pnl >= 0 ? "+" : ""}${money(top3[i].pnl)}</b><span class="pd-pdm-step" data-no-i18n>${i + 1}</span></div>` : "").join("")}</div>` : "";
    const seasons = (L.seasons || []).filter((x) => x.top && x.top.length);
    el.innerHTML = `<div class="pd-all-h"><h3>${T("Leaderboard")}</h3><div class="pd-sort">${[["week", "This week"], ["all", "All time"]].map(([k, l]) => `<button type="button" class="pd-btn${S.lbTab === k ? " on" : ""}" data-pd-lb="${k}">${T(l)}</button>`).join("")}</div></div>
      ${S.lbTab === "week" ? (() => { const t = nowC(), d = new Date(t * 1000), dow = (d.getUTCDay() + 6) % 7, mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) / 1000, end = mon + 7 * 86400, left = end - t; return `<p class="pd-season">${T("Season")} <b data-no-i18n>${new Date(mon * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} – ${new Date((end - 1) * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</b> · ${T("resets in")} <b data-no-i18n>${Math.floor(left / 86400)}d ${Math.floor((left % 86400) / 3600)}h</b> <small>(${T("Monday 00:00 UTC")})</small></p>`; })() : ""}
      <p class="pd-small">${T("Profit and loss from settled rounds (winnings minus stakes). Refunds don't count.")} <span data-no-i18n>${L.players || 0}</span> ${T("players")} · <span data-no-i18n>${L.rounds || 0}</span> ${T("rounds")}</p>
      ${podium}
      ${rows.length ? `<div class="pd-lb"><div class="pd-lb-r head"><span>#</span><span>${T("Wallet")}</span><span>${T("PnL")}</span><span>${T("Volume")}</span><span>${T("W / L")}</span></div>${rows.map((r, i) => `<div class="pd-lb-r${r.user === a ? " me" : ""}${i < 3 ? " top" : ""}"><span class="pd-rank r${i + 1}" data-no-i18n>${i + 1}</span><span class="pd-lb-u"><a href="${EXPL("address", r.user)}" target="_blank" rel="noopener" data-no-i18n>${short(r.user)}</a>${fanB(r.user)}${podB(r.user)}</span><b class="${r.pnl >= 0 ? "up" : "down"}" data-no-i18n>${r.pnl >= 0 ? "+" : ""}${money(r.pnl)}</b><span data-no-i18n>${bigM(r.vol)}</span><span data-no-i18n>${r.wins}/${r.losses}</span></div>`).join("")}</div>` : `<p class="pd-empty">${T("Nobody yet — the first settled rounds fill this in.")}</p>`}
      ${seasons.length ? `<h4>${T("Past seasons")}</h4><div class="pd-seasons">${seasons.map((x) => `<div class="pd-sea"><span data-no-i18n>${new Date(x.week + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</span>${x.top.map((r, i) => `<em class="p${i + 1}"><i data-no-i18n>${i + 1}</i><a href="${EXPL("address", r.user)}" target="_blank" rel="noopener" data-no-i18n>${short(r.user)}</a><b class="${r.pnl >= 0 ? "up" : "down"}" data-no-i18n>${r.pnl >= 0 ? "+" : ""}${money(r.pnl)}</b></em>`).join("")}</div>`).join("")}</div>` : ""}
      ${L.streaks && L.streaks.length && L.streaks[0].best > 1 ? `<h4>${T("Longest win streaks")}</h4><div class="pd-streaks">${L.streaks.filter((s) => s.best > 1).slice(0, 5).map((s) => `<span class="pd-chip"><b data-no-i18n>${s.best}</b> <span data-no-i18n>${short(s.user)}</span></span>`).join("")}</div>` : ""}`;
  }

  // ---- open a market (anyone with $ARCIRCLE; the team free) ----
  function listPanel() {
    const el = $("pd-list"), st = S.st, a = acct();
    const staff = a && (a === st.owner || a === st.operator);
    const L = S.list || {};
    const m = market();
    const lister = !!(a && m && m.lister === a);
    const key = `${a}|${st.listing.open}|${st.listing.burn}|${JSON.stringify(L)}|${S.view}|${S.m}|${m && m.endsAt}`;
    el.hidden = !(st.listing.open || staff || lister);
    if (el.hidden || key === S.listKey) return;
    S.listKey = key;
    // the wallet that listed this market (not the team, listing closed): only its end date
    if (!st.listing.open && !staff) { el.innerHTML = `<h3>${T("Your market")}</h3>${endRow(m, true)}<p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`; return; }
    if (isRH()) { el.innerHTML = listPanelRH(staff, a, L, m); return; }
    const warn = L.badge && (L.badge.call === "risky" || (L.badge.score != null && L.badge.score < 40));
    el.innerHTML = `<h3>${T("Open a market")} ${staff ? `<small data-no-i18n>${a === st.owner ? "owner" : "operator"}</small>` : ""}</h3>
      <p class="pd-small">${staff ? T("The team lists free, with any round length and lock.") : `${T("Burn")} <b data-no-i18n>${Number(st.listing.burn).toLocaleString("en-US")} $ARCIRCLE</b> ${T("to open a market for any Arc token's Uniswap v4 USDC pool with at least")} <b data-no-i18n>${bigM(st.listing.minUsdc || 0)}</b> ${T("of USDC in range. Its rounds start right away.")}`}</p>
      <div class="pd-row"><input type="text" id="pd-lt" placeholder="${T("Arc token address (0x…)")}" value="${esc(L.t || "")}" spellcheck="false"><button type="button" class="pd-btn" data-pd-act="pools">${T("Find its USDC pools")}</button></div>
      ${L.pools ? (L.pools.length ? `<div class="pd-pools-l">${L.pools.map((p, i) => `<label class="pd-pl"><input type="radio" name="pd-pl" value="${i}"${i === (L.pick || 0) ? " checked" : ""}><b>${esc(p.venue || "Uniswap v4")}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.dex && p.dex.liqUsd ? " · " + bigM(p.dex.liqUsd) : ""}</span><small data-no-i18n>${short(p.id)}</small></label>`).join("")}</div>` : `<p class="pd-empty">${T("No Uniswap v4 pool against USDC found for this token.")}</p>`) : ""}
      ${L.badge ? `<div class="pd-tags">${scoreTag(L.badge)}${callTag(L.badge)}</div>${warn ? `<p class="pd-warn">${T("Token Scanner or ARCIA flags this token. Think twice before opening rounds on it.")}</p>` : ""}` : ""}
      <div class="pd-row pd-durs">${DURS.map(([s, l]) => `<button type="button" class="pd-btn${(L.d || 300) === s ? " on" : ""}" data-pd-dur="${s}">${T(l)}</button>`).join("")}</div>
      ${endPick(L)}
      <button type="button" class="pd-btn go" data-pd-act="add"${L.pools && L.pools.length && !(warn && !staff && L.badge.call === "risky") ? "" : " disabled"}>${staff ? T("List it") : T("Burn and open it")}</button>
      ${m && (staff || m.lister === a) ? endRow(m, false) : ""}
      ${staff && m ? `<div class="pd-staff2"><span>${T("This market")}: <b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b> · ${T(m.stopped ? "stopped" : "running")}</span>${m.stopped ? "" : `<button type="button" class="pd-btn" data-pd-act="stop">${T("Stop after the round open for bets")}</button>`}<button type="button" class="pd-btn" data-pd-act="fees">${T("Send fees to the fee burn")}</button><a href="${EXPL("address", st.address)}" target="_blank" rel="noopener" data-no-i18n>${short(st.address)} ↗</a></div>` : ""}
      <p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`;
  }

  /// Robinhood Chain: the team lists a graduated Pons coin (its pool key comes from the Pons factory, server-side)
  function listPanelRH(staff, a, L, m) {
    const st = S.st, P = L.pons;
    const staffRow = staff && m ? `<div class="pd-staff2"><span>${T("This market")}: <b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b> · ${T(m.stopped ? "stopped" : "running")}</span>${m.stopped ? "" : `<button type="button" class="pd-btn" data-pd-act="stop">${T("Stop after the round open for bets")}</button>`}<button type="button" class="pd-btn" data-pd-act="fees">${T("Send fees to the treasury")}</button><a href="${EXPL("address", st.address)}" target="_blank" rel="noopener" data-no-i18n>${short(st.address)} ↗</a></div>` : "";
    const open = st.listing.open && !staff;
    return `<h3>${T("List a Pons coin")} ${staff ? `<small data-no-i18n>${a === st.owner ? "owner" : "operator"}</small>` : ""}</h3>
      <p class="pd-small">${T("Graduated Pons V2 coins only — the coin's Uniswap v4 pool against ETH. Coins still on their bonding curve can't be listed.")}${open && st.listing.burn > 0 ? ` ${T("Listing burns")} <b data-no-i18n>${Number(st.listing.burn).toLocaleString("en-US")} $ARCIRCLE</b> ${T("on Robinhood Chain.")}` : ""}</p>
      <div class="pd-row"><input type="text" id="pd-lt" placeholder="${T("Pons coin address (0x…)")}" value="${esc(L.t || "")}" spellcheck="false"><button type="button" class="pd-btn" data-pd-act="pons">${T("Check it")}</button></div>
      ${P ? `<div class="pd-pons">${P.image ? `<img src="${esc(P.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<b data-no-i18n>$${esc(P.symbol || "?")}</b><span data-no-i18n>${esc(P.name || "")}</span><em data-no-i18n>${P.priceUsd != null ? "$" + Number(P.priceUsd).toPrecision(3) : P.priceEth != null ? ethS(P.priceEth) : ""}</em><small data-no-i18n>${short(P.poolId)}</small></div>` : ""}
      <div class="pd-row pd-durs">${DURS.map(([sec, l]) => `<button type="button" class="pd-btn${(L.d || 300) === sec ? " on" : ""}" data-pd-dur="${sec}">${T(l)}</button>`).join("")}</div>
      ${endPick(L)}
      <button type="button" class="pd-btn go" data-pd-act="add"${P && (staff || st.listing.open) ? "" : " disabled"}>${T(staff || !(st.listing.burn > 0) ? "List it" : "Burn and list it")}</button>
      ${m && (staff || m.lister === a) ? endRow(m, false) : ""}
      ${staffRow}
      <p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`;
  }
  /// when a new market ends (picked before listing; signed right after it opens)
  const endPick = (L) => `<div class="pd-row pd-ends-pick"><small>${T("Ends")}</small>${ENDS.map(([d, l]) => `<button type="button" class="pd-btn sm${(L.ex || 0) === d ? " on" : ""}" data-pd-exnew="${d}">${T(l)}</button>`).join("")}</div>`;
  /// the listing wallet (or the team) moves the end of a running market
  function endRow(m, solo) {
    if (!m || m.stopped) return solo ? `<p class="pd-small">${T("This market is stopped.")}</p>` : "";
    const cur = m.endsAt ? Math.max(1, Math.round((m.endsAt - Date.now() / 1000) / 86400)) : 0;
    return `<div class="pd-endrow"><span>${T("End date for")} <b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b>: <b data-no-i18n>${m.endsAt ? esc(endsIn(m.endsAt)) : L3({ en: "none", ko: "없음", zh: "无" })}</b></span><div class="pd-row">${ENDS.map(([d, l]) => `<button type="button" class="pd-btn sm${(m.endsAt ? cur === d || (d && Math.abs(cur - d) < 1) : d === 0) ? " on" : ""}" data-pd-ex="${d}">${T(l)}</button>`).join("")}</div><small class="pd-small">${T("A signature, no gas. The keeper stops it then — the round open for bets still runs and settles.")}</small></div>`;
  }
  async function setEnd(mid, days) {
    try {
      const sg = await signer();
      const at = Math.floor(Date.now() / 1000);
      const msg = `ARCIRCLE Predict · ${isRH() ? "Robinhood Chain" : "Arc"}\nEnd market #${mid} ${days ? `in ${days} day${days > 1 ? "s" : ""}` : "never (no end date)"}\n${at}`;
      sayList(T("Sign the end date in your wallet (no gas)…"));
      const sig = await sg.signMessage(msg);
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "predict-expiry", chain: S.chain, m: mid, days, at, sig }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.error) throw new Error(tr((j && j.error) || "Couldn't save it — try again."));
      await load(); S.listKey = null; render();
      sayList(days ? L3({ en: "It ends in {d} day(s).", ko: "{d}일 후에 끝나요.", zh: "{d} 天后结束。" }).replace("{d}", days) : T("No end date — it runs until the team stops it."), "ok");
    } catch (e) { sayList(esc(errText(e)), "err"); }
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
  async function placeBet(side, amtIn, mid) {
    if (S.busy) { say(T("One moment — your last transaction is still confirming."), "err"); return; }
    const m = market(mid != null ? mid : S.m), br = betRound(m);
    if (!br) return;
    const v = amtIn != null ? amtIn : Number(String(($("pd-amt") || {}).value || "").replace(/,/g, ""));
    const lim = S.st.limits;
    if (!(v > 0)) { say(T(isRH() ? "Enter an amount of ETH." : "Enter an amount of USDC."), "err"); return; }
    if (v < lim.minBet - 1e-12) { say(`${T("The smallest bet is")} <b data-no-i18n>${moneyU(lim.minBet)}</b>.`, "err"); return; }
    if (S.practice) {
      if (nowC() >= br.lockAt - 1) { say(T("Bets for this round are closed."), "err"); return; }
      if (!paperBet(side, v, m, br)) return;
      const btn0 = (!$("pd-sticky").hidden && panel.querySelector(`#pd-sticky [data-pd-bet="${side}"]`)) || panel.querySelector(`#pd-round [data-pd-bet="${side}"]`);
      coinFly(btn0, side); buzz(25);
      say(`${T("Practice bet")}: <b data-no-i18n>${side.toUpperCase()} ${money(v)}</b> — ${T("no money moved.")}`, "ok");
      S.amt = String(v); ls.set(amtKey(), S.amt); S.sugg = null;
      render();
      return;
    }
    const mine0 = myBet(br.id);
    if (v + (mine0 ? mine0.stake : 0) > lim.maxBet + 1e-12) { say(`${T("A wallet can put at most")} <b data-no-i18n>${moneyU(lim.maxBet)}</b> ${T("in one round.")}`, "err"); return; }
    S.busy = true;
    const btn = (mid != null && panel.querySelector(`[data-pd-qm="${mid}"][data-pd-qb="${side}"]`)) || (!$("pd-sticky").hidden && panel.querySelector(`#pd-sticky [data-pd-bet="${side}"]`)) || panel.querySelector(`#pd-round [data-pd-bet="${side}"]`);
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
      buzz(30);
      S.sugg = null;
      say(`${T("You're in")} <b data-no-i18n>${side.toUpperCase()}</b> ${T("with")} <b data-no-i18n>${money(v)}</b>.${txa(tx.hash)}`, "ok");
      if (S.view !== "market") toast(`${tr("You're in")} ${side.toUpperCase()} · ${m.sym} ${dur(m.duration)}`, money(v), true);
      S.amt = String(v); ls.set(amtKey(), S.amt);
      S.lastBet = { m: m.id, epoch: br.epoch, side, amt: v };
      ls.set(lastKey(), JSON.stringify(S.lastBet));
      await Promise.all([load(), loadMine(), loadFeed()]);
      render();
    } catch (e) { say(esc(errText(e)), "err"); if (S.view !== "market") toast(tr("Bet not placed"), errText(e), true); } finally { S.busy = false; }
  }
  /// a short buzz on phones (a bet confirmed, a result): never with reduced motion
  const buzz = (p) => { try { if (navigator.vibrate && !reduce()) navigator.vibrate(p); } catch { /* fine */ } };
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
  /// claimed: a few coins fly from the claim button to the wallet in the header
  function coinsHome(from) {
    if (!from || reduce()) return;
    const to = document.getElementById("wallet-slot") || document.querySelector(".ax-top") || document.body;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const c = document.createElement("i");
      c.className = "pd-coin up home";
      c.style.left = a.left + a.width / 2 + (Math.random() * 30 - 15) + "px"; c.style.top = a.top + a.height / 2 + "px";
      c.style.setProperty("--dx", (b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(0) + "px");
      c.style.setProperty("--dy", (b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(0) + "px");
      c.style.animationDelay = i * 70 + "ms";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 1400);
    }
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
      const from = panel.querySelector('[data-pd-act="claim"],[data-pd-act="claimref"]');
      coinsHome(from);
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
        const burn = ethers.parseEther(Number(st.listing.burn || 0).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 }));
        if (burn > 0n) {
          const arc = new ethers.Contract(st.listing.token || ARCIRCLE(), ERC20, sg);
          const me = await sg.getAddress();
          if ((await arc.balanceOf(me)) < burn) throw new Error(`${tr("This wallet doesn't hold")} ${Number(st.listing.burn).toLocaleString("en-US")} $ARCIRCLE.`);
          if ((await arc.allowance(me, st.address)) < burn) { sayList(T("Approve the $ARCIRCLE to burn in your wallet…")); await (await arc.approve(st.address, burn)).wait(); }
        }
        sayList(T("Confirm in your wallet…"));
        tx = await contract(sg).listMarket(key, d);
      }
      await tx.wait();
      const ex = L.ex || 0;
      S.list = null;
      await load(); S.m = S.st.markets.length ? S.st.markets[S.st.markets.length - 1].id : S.m; S.view = "market";
      render();
      sayList(`${T("Opened. Its first round is live — the keeper reads the pool within a minute or two.")}${txa(tx.hash)}`, "ok");
      if (ex > 0 && S.m != null) await setEnd(S.m, ex);
    } catch (e) { sayList(esc(errText(e)), "err"); }
  }
  /// Arc ↔ Robinhood Chain: each has its own contract, markets, bets and leaderboard
  async function setChain(c) {
    if (c === S.chain || S.busy) return;
    S.chain = c; ls.set(LS.chain, c);
    Object.assign(S, { st: null, m: null, mine: null, feed: null, lb: null, chart: null, kstat: null, list: null, msg: null, smsg: null, lastPx: {}, lastPast: {}, lastBet: null, claimable0: null, amt: ls.get(amtKey()) || "", rx: null, rxM: null, feedSeen: null, wchain: null, rolls: {},
      fails: 0, kseen: false, mineOther: null, heat: null, heatM: null, leadK: {}, potPrev: {} });
    S.lastBet = jget(lastKey(), null);
    try { history.replaceState(null, "", "#predict" + (c === "rh" ? "?c=rh" : "")); } catch { /* fine */ }
    frame();
    render();
    await load();
    pickDefault();
    await Promise.all([loadMine(), loadChart(), loadFeed(), loadStatus(), loadMineOther(), S.view === "lb" ? loadLb() : null]);
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

  // ---------------- v3: Web Push for a wallet's rounds (topic predict-<chain>-0x…) ----------------
  const predTopic = (c, w) => `predict-${c === "rh" ? "rh" : "arc"}-${lc(w)}`;
  const b64b = (x) => { const t = String(x).replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  let pushKey;
  async function pushSub() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (pushKey === undefined) { try { const r = await fetch("/api/social?orders=pushkey"); pushKey = r.ok ? (await r.json()).key || null : null; } catch { pushKey = null; } }
    if (!pushKey) return null;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
    if (!reg || !reg.pushManager) return null;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(pushKey) }));
    return sub ? sub.toJSON() : null;
  }
  async function pushTopic(topic, remove) {
    try { const sub = await pushSub(); if (!sub) return false; const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic, sub, ...(remove ? { remove: true } : {}) }) }); return r.ok; } catch { return false; }
  }

  // ---------------- notifications (this browser only) ----------------
  const notifyOn = () => ls.get(LS.notify) === "1";
  function notify(title, body) {
    toast(title, body);
    try { if (notifyOn() && "Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(title, { body, icon: "/images/arcircle-mark-sm.png" }); } catch { /* fine */ }
  }
  function toast(title, body, force) {
    if (!notifyOn() && !force) return;
    document.querySelectorAll(".pd-toast").forEach((x, i, all) => { if (i < all.length - 1) x.remove(); });
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
    navDot(c > 0);
  }
  /// a dot on ARCIRCLE Predict in the menu while something is waiting to be claimed
  function navDot(on) {
    document.querySelectorAll('.bp-nav-item[data-tab="predict"]').forEach((b) => {
      let d = b.querySelector(".pd-navdot");
      if (on && !d) { d = document.createElement("i"); d.className = "pd-navdot"; d.title = tr("Winnings to claim"); b.appendChild(d); }
      else if (!on && d) d.remove();
    });
  }
  /// markets with a reminder: 30 seconds before bets close on each round
  function watchMarkets() {
    if (!S.st || !S.st.markets) return;
    for (const m of S.st.markets) {
      if (!watched(m.id) || m.stopped) continue;
      const br = betRound(m);
      if (!br) continue;
      const left = br.lockAt - nowC(), k = `w${S.chain}:${m.id}:${br.epoch}`;
      if (left > 0 && left <= 30 && !S.notified.has(k)) {
        S.notified.add(k);
        toast(`${tr("Bets close in 30 seconds")} · ${m.sym} ${dur(m.duration)}`, `UP ${money(br.up)} · DOWN ${money(br.down)}`, true);
        try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(`${m.sym} ${dur(m.duration)} — ARCIRCLE Predict`, { body: tr("Bets close in 30 seconds"), icon: "/images/arcircle-mark-sm.png" }); } catch { /* fine */ }
      }
    }
  }

  // ---------------- events ----------------
  panel.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-pd-qb],[data-pd-rx],[data-pd-m],[data-pd-amt],[data-pd-bet],[data-pd-act],[data-pd-dur],[data-pd-view],[data-pd-side],[data-pd-sort],[data-pd-lb],[data-pd-go],[data-pd-share],[data-pd-chain],[data-pd-ex],[data-pd-exnew]");
    if (!t) return;
    if (t.dataset.pdEx != null) { setEnd(S.m, Number(t.dataset.pdEx)); return; }
    if (t.dataset.pdExnew != null) { S.list = Object.assign({}, S.list, { ex: Number(t.dataset.pdExnew), t: String(($("pd-lt") || {}).value || (S.list || {}).t || "") }); S.listKey = null; listPanel(); return; }
    if (t.dataset.pdQb) { e.stopPropagation(); placeBet(t.dataset.pdQb, Number(S.amt), Number(t.dataset.pdQm)).then(() => { if (S.view === "all") all(); }); return; }
    if (t.dataset.pdRx) { react(t.dataset.pdRx, t); return; }
    if (t.dataset.pdChain) { setChain(t.dataset.pdChain); return; }
    if (t.dataset.pdM != null || t.dataset.pdGo != null) {
      S.m = Number(t.dataset.pdM != null ? t.dataset.pdM : t.dataset.pdGo); S.msg = null; S.chart = null; S.view = "market";
      try { history.replaceState(null, "", `#predict?${cq()}m=${S.m}`); } catch { /* fine */ }
      render(); Promise.all([loadChart(), loadRx()]).then(() => { if (S.view === "market") card(); }); return;
    }
    if (t.dataset.pdView) { S.view = t.dataset.pdView; ls.set(LS.view, S.view === "all" ? "all" : "market"); if (S.view === "lb" && !S.lb) loadLb().then(render); render(); return; }
    if (t.dataset.pdSide) { S.side = t.dataset.pdSide; if (S.side === "feed") loadFeed().then(side); if (S.side === "past") loadHeat().then(side); side(); return; }
    if (t.dataset.pdSort) { S.sort = t.dataset.pdSort; all(); return; }
    if (t.dataset.pdLb) { S.lbTab = t.dataset.pdLb; lbView(); return; }
    if (t.dataset.pdShare) { shareRound(t.dataset.pdShare); return; }
    if (t.dataset.pdAmt) { const i = $("pd-amt"); S.amt = String(Number(t.dataset.pdAmt)); if (i) i.value = S.amt; ls.set(amtKey(), S.amt); const m = market(); if (m) patch(m, betRound(m)); return; }
    if (t.dataset.pdBet) { placeBet(t.dataset.pdBet); return; }
    if (t.dataset.pdDur) { S.list = Object.assign({}, S.list, { d: Number(t.dataset.pdDur), t: String(($("pd-lt") || {}).value || "") }); listPanel(); return; }
    const a = t.dataset.pdAct;
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(() => loadMine().then(render)).catch(() => {}); }
    else if (a === "claim") claimAll(false);
    else if (a === "claimref") claimAll(true);
    else if (a === "again") { const L = S.lastBet; if (L) placeBet(L.side, L.amt); }
    else if (a === "notify") {
      const on = ls.get(LS.notify) !== "1";
      ls.set(LS.notify, on ? "1" : "0"); t.setAttribute("aria-pressed", String(on));
      if (on && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      toast(tr(on ? "Alerts on" : "Alerts off"), tr(on ? "30 seconds left in your rounds, and wins to claim — in this browser." : "You can turn them back on any time."), true);
      // v3: with a wallet, the results also come with the tab closed (Web Push) — and on Telegram with /predictalerts
      const w = acct();
      if (w) pushTopic(predTopic(S.chain, w), !on).then((ok) => { if (on) toast(tr(ok ? "Push alerts on" : "Alerts in this tab"), ok ? `${tr("Your rounds' results reach this device even with the tab closed.")} ${tr("Telegram too: send")} /predictalerts ${short(w)}${isRH() ? " rh" : ""} ${tr("to @ARCIAonArc_bot")}` : `${tr("This browser can't take push alerts. On Telegram, send")} /predictalerts ${short(w)}${isRH() ? " rh" : ""} ${tr("to @ARCIAonArc_bot")}`, true); });
    }
    else if (a === "retry") { S.fails = 0; render(); load().then(() => { pickDefault(); render(); }); }
    else if (a === "practice") {
      S.practice = !S.practice; ls.set(LS.practice, S.practice ? "1" : "0");
      panel.querySelectorAll('[data-pd-act="practice"].pd-practice').forEach((b) => b.setAttribute("aria-pressed", String(S.practice)));
      S.cardKey = null; S.sideKey = null; S.msg = null; if (S.practice) S.side = "bets";
      toast(tr(S.practice ? "Practice mode" : "Practice off"), tr(S.practice ? "Play money on the real rounds — nothing leaves your wallet." : "Bets are real again."), true);
      render();
    }
    else if (a === "pracreset") { ls.set(paperK(), ""); S.cardKey = null; S.sideKey = null; toast(tr("Play balance reset"), money(PSTART()), true); render(); }
    else if (a === "claimother") { const O = S.mineOther; if (O) setChain(O.chain).then(() => { S.side = "bets"; render(); if (S.mine && S.mine.claimable > 0) claimAll(false); }); }
    else if (a === "sharestats") { const w = acct(); if (w) window.open(`https://x.com/intent/post?text=${encodeURIComponent(tr(isRH() ? "My ARCIRCLE Predict card — UP or DOWN on Pons coins on Robinhood Chain, paid in ETH." : "My ARCIRCLE Predict card — UP or DOWN on Arc tokens, paid in USDC."))}&url=${encodeURIComponent(`${SITE}/predict/me/${w}${isRH() ? "?c=rh" : ""}`)}`, "_blank", "noopener"); }
    else if (a === "stamt") {
      // the sticky bar's amount: each tap moves to the next quick amount
      const cs = chips(S.st.limits).map(([v]) => v), cur = Number(S.amt) || 0, i = cs.findIndex((v) => Math.abs(v - cur) < 1e-12);
      S.amt = String(cs[(i + 1) % cs.length]); ls.set(amtKey(), S.amt); const inp = $("pd-amt"); if (inp) inp.value = S.amt;
      const m = market(); if (m) patch(m, betRound(m));
    }
    else if (a === "watch") {
      const on = toggleWatch(S.m); t.classList.toggle("on", on); t.setAttribute("aria-pressed", String(on));
      if (on && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      const m = market(); toast(tr(on ? "Reminder on" : "Reminder off"), m ? `${m.sym} ${dur(m.duration)} · ${tr(on ? "30 seconds before bets close, every round" : "no more reminders for this market")}` : "", true);
      tabs();
    }
    else if (a === "rhswitch") { rhSigner().then(() => walletChain()).then(() => { const m = market(); if (m) patch(m, betRound(m)); }).catch((er) => say(esc(errText(er)), "err")); }
    else if (a === "sharem") shareMarket();
    else if (a === "copyref") { const i = $("pd-reflink"); if (i) { try { navigator.clipboard.writeText(i.value); t.textContent = tr("Copied"); } catch { i.select(); } } }
    else if (a === "xref") { const i = $("pd-reflink"); if (i) window.open(`https://x.com/intent/post?text=${encodeURIComponent(tr(isRH() ? "UP or DOWN on Pons coins on Robinhood Chain, paid in ETH. Join me on ARCIRCLE Predict:" : "UP or DOWN on Arc tokens, paid in USDC. Join me on ARCIRCLE Predict:"))}&url=${encodeURIComponent(i.value)}`, "_blank", "noopener"); }
    else if (a === "pools") findPools();
    else if (a === "pons") checkPons();
    else if (a === "add") addMarket();
    else if (a === "stop" || a === "fees") staffTx(a);
  });
  panel.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target && e.target.classList && e.target.classList.contains("pd-tile")) { e.preventDefault(); e.target.click(); } });
  // the hero's paragraph is cut to two lines on a phone; a tap opens it
  const lede = panel.querySelector(".pd-hero .bp-lede");
  if (lede) {
    const more = document.createElement("button");
    more.type = "button"; more.className = "pd-more"; more.setAttribute("aria-expanded", "false"); more.textContent = tr("More");
    lede.insertAdjacentElement("afterend", more);
    const flip = () => { const o = lede.classList.toggle("open"); more.setAttribute("aria-expanded", String(o)); more.textContent = tr(o ? "Less" : "More"); };
    lede.addEventListener("click", flip); more.addEventListener("click", flip);
  }
  panel.addEventListener("input", (e) => {
    if (e.target && e.target.id === "pd-amt") { S.amt = e.target.value; const m = market(); if (m) patch(m, betRound(m)); }
    if (e.target && e.target.id === "pd-lt") S.list = Object.assign({}, S.list, { t: e.target.value });
  });
  panel.addEventListener("change", (e) => {
    if (e.target && e.target.name === "pd-pl") S.list = Object.assign({}, S.list, { pick: Number(e.target.value) });

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
      sticky(m, br);
      chipClock();
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
    watchMarkets();
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
    if (S.view === "market" || S.side === "feed" || n % 5 === 0) jobs.push(loadFeed().then(ticker));
    if (S.view === "market" && (n % 2 === 0 || S.rxM !== S.m)) jobs.push(loadRx());
    if (isRH() && n % 4 === 0) jobs.push(walletChain());
    if (S.view === "lb" && n % 10 === 0) jobs.push(loadLb());
    if (n % 10 === 1) jobs.push(loadStatus());
    if (acct() && n % 10 === 2) jobs.push(loadMineOther());
    if (S.view === "market" && S.side === "past" && (n % 5 === 0 || S.heatM !== S.m)) jobs.push(loadHeat());
    await Promise.all(jobs);
    paperTick();
    render();
  }
  async function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      render();
      await load();
      pickDefault();
      await Promise.all([loadMine(), loadChart(), loadFeed(), loadStatus(), loadMineOther(), S.view === "lb" ? loadLb() : null]);
      render();
    }
    clearInterval(S.timer); clearInterval(S.tick);
    S.timer = setInterval(refresh, 3000);
    S.tick = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => {
    if (e.detail && e.detail.tab === "predict") show();
    else { clearInterval(S.timer); clearInterval(S.tick); if (S.title0 != null) { document.title = S.title0; S.title0 = null; } const sb = $("pd-sticky"); if (sb) sb.hidden = true; document.body.classList.remove("pd-sticky-on"); }
  });
  window.addEventListener("hashchange", () => {
    const m = /^#predict\?(?:.*&)?m=(\d+)/.exec(location.hash);
    const r = /[?&]ref=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (r) ls.set(LS.ref, lc(r[1]));
    if (/^#predict/.test(location.hash) && S.booted) {
      const c = /[?&]c=rh\b/.test(location.hash) ? "rh" : /^#predict\?/.test(location.hash) ? "arc" : S.chain;
      if (c !== S.chain) { setChain(c).then(() => { if (m) { S.m = Number(m[1]); render(); loadChart().then(() => card()); } }); return; }
    }
    if (m && S.booted) { grabSugg(); S.m = Number(m[1]); S.view = "market"; S.cardKey = null; render(); loadChart().then(() => card()); }
  });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); render(); } });
  if (panel.classList.contains("active")) show();
  window.arcPredict = { state: () => S.st, market: () => S.m, chain: () => S.chain, setChain: (c) => setChain(c), refresh: () => refresh(), _px: px, _s: () => ({ busy: S.busy, ids: S.mine && S.mine.claimIds, msg: S.msg }) };
})();
