/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-orders.js — ARCIRCLE Orders, an ARCIRCLE PAD utility (arcpad.html#orders; api/_orders.mjs; contract ArcircleOrders.sol).
// Exchange-style orders on Arc's Uniswap v4 pools, without giving up custody:
//   · limit   sign "sell X for at least Y" (EIP-712, no gas). Tokens stay in the wallet; the executor matches it with
//             another wallet's order (P2P) or fills it from the pool once the pool reaches the price
//   · market  a swap through ArcircleOrders.swapMarket, from the wallet, with a slippage floor
//   · stop    a signed order that waits until the pool's price crosses a trigger, then sells (or buys) at market,
//             never below its floor
// 0.1% of what each side receives goes to the ARCIRCLE PAD treasury. Arc only, any token with a Uniswap v4 pool.
// The book shows price levels — signatures never leave the server.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const CFG = () => (typeof CONFIG !== "undefined" ? CONFIG : {});
  const ORDERS = () => lc(CFG().ORDERS_ADDRESS || "");
  const LIVE = () => isAddr(ORDERS());
  const USDC = () => lc(CFG().USDC_ADDRESS || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE = () => lc(CFG().ARCIRCLE_TOKEN || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7");
  const CHAIN = () => Number(CFG().CHAIN_ID_DECIMAL || 5042);
  const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
  const EXPL = (kind, x) => `${CFG().BLOCK_EXPLORER || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h, label) => (h ? `<a class="aor-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const API = "/api/social";
  const FEE = 0.001;
  const ZERO32 = "0x" + "0".repeat(64);
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);

  // ---------------- numbers ----------------
  /// a price with four significant figures, never in exponent form (0.00003835)
  function fp(p) {
    if (p == null || !isFinite(p) || p <= 0) return "—";
    if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const d = Math.min(14, -Math.floor(Math.log10(p)) + 3);
    return p.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
  }
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }));
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const human = (raw, dec) => Number(raw) / 10 ** dec;
  /// a decimal string → raw units, extra decimals cut (never rounded up)
  function units(v, dec) {
    let s = String(v == null ? "" : v).trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
    const [i, f = ""] = s.split(".");
    s = (i || "0") + "." + f.slice(0, dec);
    try { const r = ethers.parseUnits(s, dec); return r > 0n ? r : null; } catch { return null; }
  }
  /// a positive Number → a plain decimal string ethers can parse
  const dstr = (n, d = 18) => (n > 0 && isFinite(n) ? n.toFixed(Math.min(d, 18)).replace(/0+$/, "").replace(/\.$/, "") : "0");
  const fmtU = (raw, dec, max = 6) => { const n = human(raw, dec); return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : max }); };
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
  const hhmm = (s) => { const d = new Date(s * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };

  // ---------------- contract bits ----------------
  const ORDERS_ABI = [
    "function epochOf(address) view returns (uint32)",
    "function cancel((address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint32 epoch,uint256 salt))",
    "function cancelAll()",
    "function swapMarket((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),address,address,uint256,uint256) returns (uint256)",
    "function quote((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),address,uint256)",
  ];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const TYPES = { Order: [["maker", "address"], ["sell", "address"], ["buy", "address"], ["sellAmount", "uint256"], ["buyAmount", "uint256"], ["triggerSqrtP", "uint160"], ["triggerBelow", "bool"], ["poolId", "bytes32"], ["expiry", "uint64"], ["epoch", "uint32"], ["salt", "uint256"]].map(([name, type]) => ({ name, type })) };
  const rp = () => (typeof readProvider === "function" ? readProvider() : null);
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const m = String((e && (e.shortMessage || e.reason || e.message)) || tr("That didn't go through."));
    if (/PriceNotMet/.test(m)) return tr("The price moved past your slippage limit — nothing was swapped.");
    return m.slice(0, 180);
  };

  // ---------------- state ----------------
  const S = {
    t: null, tok: null, quote: null, pools: [], pi: 0, spot: null, book: null, mine: null, markets: [],
    side: "buy", type: "limit", left: "book", center: "chart", myTab: "open", busy: false, booted: false, acct: null,
    bal: {}, epoch: null, msg: null, loadingMkt: false,
  };
  const pool = () => S.pools[S.pi] || null;
  const RK = "arcircle.orders.recent";
  const recent = () => { try { const l = JSON.parse(localStorage.getItem(RK) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
  const addRecent = (t, sym) => { try { localStorage.setItem(RK, JSON.stringify([{ t, sym }, ...recent().filter((x) => x.t !== t)].slice(0, 6))); } catch { /* private window */ } };

  // ---------------- skeleton ----------------
  function frame() {
    $("aor-body").innerHTML = `
      <div class="ams-preview aor-preview" id="aor-preview"${LIVE() ? " hidden" : ""}><i class="ams-preview-ico"></i><div><b>${T("Preview — ARCIRCLE Orders opens once its contract is live on Arc")}</b><span>${T("You can browse markets, the book and the pool price now; placing orders turns on with the contract.")}</span></div></div>
      <div class="ams-card aor-bar">
        <form class="aor-pick" id="aor-form" autocomplete="off">
          <input id="aor-in" type="text" spellcheck="false" placeholder="${T("Paste an Arc token address (0x…)")}" aria-label="${T("Arc token address")}">
          <button type="submit" class="aor-btn go">${T("Open market")}</button>
        </form>
        <div class="aor-chips" id="aor-chips"></div>
        <div class="aor-mkt" id="aor-mkt"></div>
      </div>
      <div class="aor-mtabs" role="tablist" aria-label="${T("Market view")}">
        <button type="button" role="tab" data-mt="chart" aria-selected="true">${T("Chart")}</button><button type="button" role="tab" data-mt="book" aria-selected="false">${T("Order book")}</button><button type="button" role="tab" data-mt="trades" aria-selected="false">${T("Trades")}</button>
      </div>
      <div class="aor-grid" id="aor-grid" data-mt="chart">
        <section class="ams-card aor-bookc">
          <div class="aor-seg" role="tablist"><button type="button" data-left="book" aria-selected="true">${T("Order book")}</button><button type="button" data-left="trades" aria-selected="false">${T("Trades")}</button></div>
          <div id="aor-book" class="aor-book"></div>
        </section>
        <section class="ams-card aor-chartc">
          <div class="aor-seg" role="tablist"><button type="button" data-center="chart" aria-selected="true">${T("Chart")}</button><button type="button" data-center="depth" aria-selected="false">${T("Depth")}</button></div>
          <div id="aor-chart" class="aor-chart"></div>
        </section>
        <section class="ams-card aor-formc" id="aor-formc"></section>
      </div>
      <section class="ams-card aor-mine">
        <div class="aor-mine-h"><div class="aor-seg" role="tablist"><button type="button" data-my="open" aria-selected="true">${T("Open orders")}</button><button type="button" data-my="history" aria-selected="false">${T("History")}</button></div>
          <button type="button" class="aor-btn sm ghost" data-act="cancelall" id="aor-cxall" hidden>${T("Cancel all on-chain")}</button></div>
        <div id="aor-mine"></div>
      </section>`;
    $("aor-form").addEventListener("submit", (e) => { e.preventDefault(); open($("aor-in").value.trim()); });
    $("aor-in").addEventListener("paste", () => setTimeout(() => { const v = $("aor-in").value.trim(); if (isAddr(v)) open(v); }, 0));
    if (!S.wired) { S.wired = true; panel.addEventListener("click", onClick); panel.addEventListener("input", onInput); panel.addEventListener("change", onInput); }
    chips(); market(); bookView(); chartView(); form(); mineView();
  }
  const seg = (attr, v) => panel.querySelectorAll(`button[data-${attr}]`).forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-" + attr) === v)));

  // ---------------- markets: chips, the bar ----------------
  async function loadMarkets() {
    try { const r = await fetch(`${API}?orders=markets`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; S.markets = (j && j.markets) || []; } catch { /* keep */ }
    chips();
  }
  function chips() {
    const el = $("aor-chips"); if (!el) return;
    const seen = new Set(), list = [];
    const add = (t, sym, n) => { t = lc(t); if (!isAddr(t) || seen.has(t)) return; seen.add(t); list.push({ t, sym, n }); };
    add(ARCIRCLE(), "ARCIRCLE");
    for (const m of S.markets) add(m.token.address || m.token, m.token.symbol, m.open);
    for (const r of recent()) add(r.t, r.sym);
    el.innerHTML = list.slice(0, 9).map((x) => `<button type="button" class="aor-chip${x.t === S.t ? " on" : ""}" data-t="${x.t}"><b data-no-i18n>$${esc(x.sym || short(x.t))}</b>${x.n ? `<em data-no-i18n>${x.n}</em>` : ""}</button>`).join("");
  }
  function market() {
    const el = $("aor-mkt"); if (!el) return;
    if (!S.t) { el.innerHTML = `<p class="aor-hint">${T("Pick a market above — any Arc token with a Uniswap v4 pool (Argus, ArcPad or a plain pool).")}</p>`; return; }
    if (S.loadingMkt) { el.innerHTML = `<p class="aor-hint"><span class="aor-spin"></span>${T("Reading the token's pools on Arc…")}</p>`; return; }
    if (!S.tok) { el.innerHTML = `<p class="aor-hint bad">${T(S.err || "No Uniswap v4 pool found for this token on Arc.")}</p>`; return; }
    const p = pool(), b = S.book || {}, d = b.day || {};
    el.innerHTML = `
      <div class="aor-pair"><span class="aor-pair-n" data-no-i18n>$${esc(S.tok.symbol)}<i>/ ${esc(S.quote.symbol)}</i></span>
        <a class="aor-tx" href="${EXPL("token", S.t)}" target="_blank" rel="noopener" data-no-i18n>${short(S.t)} ↗</a></div>
      <div class="aor-stats">
        <div class="aor-stat big"><small>${T("Pool price")}</small><b data-no-i18n id="aor-spot">${fp(S.spot)}</b><span data-no-i18n>${esc(S.quote.symbol)}</span></div>
        <div class="aor-stat"><small>${T("Last fill")}</small><b data-no-i18n>${fp(b.last)}</b></div>
        <div class="aor-stat"><small>${T("24h high")}</small><b data-no-i18n>${fp(d.high)}</b></div>
        <div class="aor-stat"><small>${T("24h low")}</small><b data-no-i18n>${fp(d.low)}</b></div>
        <div class="aor-stat"><small>${T("24h volume")}</small><b data-no-i18n>${d.volume ? usd(d.volume) : "—"}</b></div>
        <div class="aor-stat"><small>${T("Open orders")}</small><b data-no-i18n>${b.open || 0}</b>${b.stops ? `<span><span data-no-i18n>${b.stops}</span> ${T("stops")}</span>` : ""}</div>
        ${S.pools.length > 1 ? `<label class="aor-stat aor-poolsel"><small>${T("Pool")}</small><select id="aor-pool" aria-label="${T("Pool")}">${S.pools.map((x, i) => `<option value="${i}"${i === S.pi ? " selected" : ""} data-no-i18n>${esc(x.venue)} · ${x.dex && x.dex.liqUsd ? usd(x.dex.liqUsd) : esc(x.id.slice(0, 8))}</option>`).join("")}</select></label>`
          : `<div class="aor-stat"><small>${T("Pool")}</small><b data-no-i18n>${esc(p.venue || "Uniswap v4")}</b>${p.dex && p.dex.liqUsd ? `<span data-no-i18n>${usd(p.dex.liqUsd)}</span>` : ""}</div>`}
      </div>`;
  }

  // ---------------- open a market ----------------
  async function open(addr) {
    addr = lc(addr);
    if (!isAddr(addr)) { S.msg = { k: "bad", t: "Paste a token contract address (0x…)." }; form(); return; }
    if (addr === USDC()) { S.msg = { k: "bad", t: "USDC is the quote — pick the token you want to trade." }; form(); return; }
    S.t = addr; S.tok = null; S.quote = null; S.pools = []; S.pi = 0; S.spot = null; S.book = null; S.err = null; S.loadingMkt = true; S.msg = null;
    if ($("aor-in")) $("aor-in").value = addr;
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#orders?t=${addr}`);
    chips(); market(); bookView(); chartView(); form();
    try {
      let j = null;
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`${API}?liq=${addr}`, { cache: "no-store" });
        j = await r.json().catch(() => null);
        if (S.t !== addr) return;
        if (r.status === 503 || (j && !j.done && !(j.pools && j.pools.length))) { await new Promise((res) => setTimeout(res, 1500)); continue; }
        if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
        break;
      }
      const pools = ((j && j.pools) || []).filter((p) => p.key && p.quote && isAddr(p.quote.address) && lc(p.key.currency0) !== "0x0000000000000000000000000000000000000000");
      // USDC pools first, then the deepest
      pools.sort((a, b) => (lc(b.quote.address) === USDC()) - (lc(a.quote.address) === USDC()) || ((b.dex && b.dex.liqUsd) || 0) - ((a.dex && a.dex.liqUsd) || 0) || Number(BigInt(b.liquidity || 0) > BigInt(a.liquidity || 0)) - Number(BigInt(b.liquidity || 0) < BigInt(a.liquidity || 0)));
      const q = pools[0] && lc(pools[0].quote.address);
      S.pools = pools.filter((p) => lc(p.quote.address) === q); // one book per token: one quote
      if (!S.pools.length) throw new Error("No Uniswap v4 pool found for this token on Arc.");
      S.tok = { address: addr, symbol: (j.token && j.token.symbol) || "TOKEN", decimals: Number((j.token && j.token.decimals) ?? 18) };
      S.quote = { address: q, symbol: pools[0].quote.symbol || "USDC", decimals: Number(pools[0].quote.decimals ?? 6) };
      S.spot = pools[0].price || null;
      addRecent(addr, S.tok.symbol);
    } catch (e) {
      S.err = String((e && e.message) || e);
    }
    S.loadingMkt = false;
    chips(); market(); chartView(); form();
    if (S.tok) { await Promise.all([loadBook(), loadSpot(), loadBal()]); market(); bookView(); chartView(); form(); }
  }

  // ---------------- live data ----------------
  async function loadBook() {
    if (!S.t) return;
    try { const r = await fetch(`${API}?orders=book&token=${S.t}`, { cache: "no-store" }); if (r.ok) S.book = await r.json(); } catch { /* keep */ }
  }
  async function loadSpot() {
    const p = pool(); const L = window.ArcLiqCore; const prov = rp();
    if (!p || !L || !prov) return;
    try {
      const slot = L.poolSlot(p.id, ethers.keccak256);
      const h = await new ethers.Contract(PM, ["function extsload(bytes32) view returns (bytes32)"], prov).extsload(slot);
      const s0 = L.decodeSlot0(h);
      if (s0.sqrtP > 0n) {
        S.sqrtP = s0.sqrtP;
        S.spot = L.priceOf(s0.sqrtP, p.tokenIs0, p.tokenIs0 ? S.tok.decimals : S.quote.decimals, p.tokenIs0 ? S.quote.decimals : S.tok.decimals);
      }
    } catch { /* keep the last price */ }
  }
  async function loadBal() {
    const a = me(), prov = rp();
    if (!a || !S.tok || !prov) { S.bal = {}; return; }
    try {
      const calls = [S.tok.address, S.quote.address].map((t) => new ethers.Contract(t, ERC20, prov));
      const [bt, bq] = await Promise.all(calls.map((c) => c.balanceOf(a)));
      S.bal = { [S.tok.address]: bt, [S.quote.address]: bq };
      if (LIVE()) S.epoch = Number(await new ethers.Contract(ORDERS(), ORDERS_ABI, prov).epochOf(a));
    } catch { /* keep */ }
  }
  async function loadMine() {
    const a = me();
    if (!a) { S.mine = null; return; }
    try { const r = await fetch(`${API}?orders=mine&wallet=${a}`, { cache: "no-store" }); if (r.ok) S.mine = await r.json(); } catch { /* keep */ }
  }

  // ---------------- the order book ----------------
  const myLevels = () => {
    const out = new Set();
    for (const o of ((S.mine && S.mine.orders) || [])) if (lc(o.token.address || o.token) === S.t && o.status === "open" && o.type === "limit") out.add(o.side + ":" + sig4(o.price));
    return out;
  };
  const sig4 = (p) => { if (!(p > 0)) return 0; const e = Math.floor(Math.log10(p)) - 3; return Math.round(p / 10 ** e) * 10 ** e; };
  function bookView() {
    const el = $("aor-book"); if (!el) return;
    if (!S.tok) { el.innerHTML = `<div class="aor-empty">${T(S.t ? "…" : "No market open")}</div>`; return; }
    const b = S.book || { asks: [], bids: [], fills: [] };
    if (S.left === "trades") {
      el.innerHTML = `<div class="aor-th"><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Time")}</span></div>` +
        (b.fills && b.fills.length ? `<div class="aor-trades">${b.fills.map((f) => `<a class="aor-tr ${f.side === "buy" ? "up" : "dn"}" href="${EXPL("tx", f.tx)}" target="_blank" rel="noopener" title="${T(f.via === "match" ? "Wallet to wallet" : "Filled from the pool")}"><b data-no-i18n>${fp(f.price)}</b><span data-no-i18n>${num(f.amount)}</span><em data-no-i18n>${hhmm(f.at)}<i>${f.via === "match" ? "P2P" : "POOL"}</i></em></a>`).join("")}</div>`
          : `<div class="aor-empty">${T("No fills yet in this market.")}</div>`);
      return;
    }
    const mine = myLevels();
    const asks = (b.asks || []).slice(0, 12), bids = (b.bids || []).slice(0, 12);
    let ca = 0, cb = 0;
    const askCum = asks.map((l) => (ca += l.amount)), bidCum = bids.map((l) => (cb += l.amount));
    const max = Math.max(ca, cb, 1e-18);
    const row = (l, cum, side) => `<button type="button" class="aor-lv ${side === "sell" ? "dn" : "up"}${mine.has(side + ":" + l.price) ? " mine" : ""}" data-price="${l.price}" style="--d:${((cum / max) * 100).toFixed(1)}%"><b data-no-i18n>${fp(l.price)}</b><span data-no-i18n>${num(l.amount)}</span><em data-no-i18n>${num(l.amount * l.price)}</em></button>`;
    const bestAsk = asks[0] && asks[0].price, bestBid = bids[0] && bids[0].price;
    const spread = bestAsk && bestBid ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 : null;
    el.innerHTML = `<div class="aor-th"><span>${T("Price")} <i data-no-i18n>${esc(S.quote.symbol)}</i></span><span>${T("Amount")}</span><span>${T("Total")}</span></div>
      <div class="aor-asks">${asks.length ? asks.map((l, i) => row(l, askCum[i], "sell")).reverse().join("") : `<div class="aor-none">${T("No sell orders")}</div>`}</div>
      <div class="aor-mid"><b data-no-i18n>${fp(S.spot)}</b><small>${T("pool price")}</small>${spread != null ? `<em>${T("spread")} <span data-no-i18n>${spread.toFixed(2)}%</span></em>` : ""}</div>
      <div class="aor-bids">${bids.length ? bids.map((l, i) => row(l, bidCum[i], "buy")).join("") : `<div class="aor-none">${T("No buy orders")}</div>`}</div>
      <p class="aor-foot">${T("Orders below the ask and above the bid fill from the pool as soon as its price gets there.")}</p>`;
  }

  // ---------------- chart and depth ----------------
  function chartView() {
    const el = $("aor-chart"); if (!el) return;
    const p = pool();
    if (!p) { el.innerHTML = `<div class="aor-empty">${T(S.t && S.loadingMkt ? "…" : "The chart shows up when a market is open.")}</div>`; return; }
    if (S.center === "depth") { el.innerHTML = depthSvg(); return; }
    if (el.dataset.pool === p.id && el.querySelector("iframe")) return;
    el.dataset.pool = p.id;
    el.innerHTML = `<iframe title="${T("Price chart")}" loading="lazy" src="https://dexscreener.com/arc/${encodeURIComponent(p.id)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15"></iframe>`;
  }
  function depthSvg() {
    const b = S.book || {};
    const asks = (b.asks || []).slice(0, 30), bids = (b.bids || []).slice(0, 30);
    if (!asks.length && !bids.length) return `<div class="aor-empty">${T("No orders in the book yet — the depth chart fills in as orders come.")}</div>`;
    const W = 600, H = 300, pad = 24;
    const prices = [...asks, ...bids].map((l) => l.price).concat(S.spot ? [S.spot] : []);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    if (hi === lo) { lo *= 0.9; hi *= 1.1; }
    const span = hi - lo; lo -= span * 0.05; hi += span * 0.05;
    let c = 0; const bc = bids.map((l) => [l.price, (c += l.amount)]); const bmax = c;
    c = 0; const ac = asks.map((l) => [l.price, (c += l.amount)]); const amax = c;
    const ymax = Math.max(bmax, amax, 1e-18);
    const x = (p) => pad + ((p - lo) / (hi - lo)) * (W - pad * 2);
    const y = (v) => H - pad - (v / ymax) * (H - pad * 2);
    const step = (pts, toLeft) => {
      if (!pts.length) return "";
      let d = `M${x(pts[0][0]).toFixed(1)},${y(0).toFixed(1)}`;
      let prev = 0;
      for (const [p, v] of pts) { d += ` L${x(p).toFixed(1)},${y(prev).toFixed(1)} L${x(p).toFixed(1)},${y(v).toFixed(1)}`; prev = v; }
      d += ` L${x(toLeft ? lo : hi).toFixed(1)},${y(prev).toFixed(1)} L${x(toLeft ? lo : hi).toFixed(1)},${y(0).toFixed(1)} Z`;
      return d;
    };
    const sx = S.spot ? x(S.spot) : null;
    return `<svg class="aor-depth" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Depth")}">
      <line class="aor-d-base" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>
      <path class="aor-d-bid" d="${step(bc, true)}"/><path class="aor-d-ask" d="${step(ac, false)}"/>
      ${sx != null ? `<line class="aor-d-spot" x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="${pad / 2}" y2="${H - pad}"/><text class="aor-d-lbl" x="${Math.min(W - 90, sx + 6).toFixed(1)}" y="${pad}" data-no-i18n>${esc(fp(S.spot))}</text>` : ""}
      <text class="aor-d-lbl" x="${pad}" y="${H - 6}" data-no-i18n>${esc(fp(lo))}</text><text class="aor-d-lbl end" x="${W - pad}" y="${H - 6}" data-no-i18n>${esc(fp(hi))}</text>
    </svg><div class="aor-d-key"><span class="up">${T("Buy orders")}</span><span class="dn">${T("Sell orders")}</span><small>${T("cumulative, in")} <span data-no-i18n>$${esc(S.tok.symbol)}</span></small></div>`;
  }

  // ---------------- the order form ----------------
  const F = { price: "", amount: "", total: "", trigger: "", expiry: "604800", slip: "3" };
  function form() {
    const el = $("aor-formc"); if (!el) return;
    const tk = S.tok, q = S.quote;
    const sym = tk ? "$" + tk.symbol : "TOKEN", qs = q ? q.symbol : "USDC";
    const buy = S.side === "buy", ty = S.type;
    const sellTok = tk ? (buy ? q : tk) : null;
    const bal = sellTok && S.bal[sellTok.address] != null ? S.bal[sellTok.address] : null;
    const field = (id, label, unit, val, ph) => `<label class="aor-f"><small>${T(label)}</small><span class="aor-in"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(ph || "0")}" value="${esc(val)}"><i data-no-i18n>${esc(unit)}</i></span></label>`;
    const fields = ty === "limit"
      ? field("aor-price", "Price", qs, F.price, S.spot ? fp(S.spot) : "0") + field("aor-amount", "Amount", sym, F.amount) + `<div class="aor-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}">${p}%</button>`).join("")}</div>` + field("aor-total", "Total", qs, F.total)
      : ty === "market"
        ? (buy ? field("aor-total", "Spend", qs, F.total) : field("aor-amount", "Sell", sym, F.amount)) + `<div class="aor-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}">${p}%</button>`).join("")}</div>`
        : field("aor-trigger", buy ? "Buy when the price rises to" : "Sell when the price falls to", qs, F.trigger, S.spot ? fp(S.spot) : "0") + field("aor-amount", "Amount", sym, F.amount) + `<div class="aor-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}">${p}%</button>`).join("")}</div>`;
    const opts = ty === "market" || ty === "stop"
      ? `<label class="aor-f half"><small>${T("Slippage limit")}</small><select id="aor-slip">${["1", "3", "5", "10"].map((v) => `<option value="${v}"${F.slip === v ? " selected" : ""} data-no-i18n>${v}%</option>`).join("")}</select></label>` : "";
    const exp = ty !== "market"
      ? `<label class="aor-f half"><small>${T("Expires")}</small><select id="aor-exp">${[["86400", "1 day"], ["604800", "7 days"], ["2592000", "30 days"], ["7776000", "90 days"]].map(([v, l]) => `<option value="${v}"${F.expiry === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>` : "";
    const connected = !!me();
    const btn = !tk ? `<button type="button" class="aor-submit" disabled>${T("Open a market first")}</button>`
      : !LIVE() ? `<button type="button" class="aor-submit" disabled>${T("Opens once the contract is live")}</button>`
        : !connected ? `<button type="button" class="aor-submit go" data-act="connect">${T("Connect wallet")}</button>`
          : `<button type="button" class="aor-submit ${buy ? "buy" : "sell"}" data-act="submit" id="aor-submit"${S.busy ? " disabled" : ""}>${S.busy ? `<span class="aor-spin"></span>${T(S.busy)}` : `${T(buy ? "Buy" : "Sell")} <span data-no-i18n>${esc(sym)}</span>`}</button>`;
    el.innerHTML = `
      <div class="aor-side" role="radiogroup" aria-label="${T("Side")}"><button type="button" role="radio" class="buy" data-side="buy" aria-checked="${buy}">${T("Buy")}</button><button type="button" role="radio" class="sell" data-side="sell" aria-checked="${!buy}">${T("Sell")}</button></div>
      <div class="aor-types" role="tablist">${[["limit", "Limit"], ["market", "Market"], ["stop", "Stop"]].map(([k, l]) => `<button type="button" role="tab" data-type="${k}" aria-selected="${ty === k}">${T(l)}</button>`).join("")}</div>
      <div class="aor-avail"><small>${T("Available")}</small><b data-no-i18n>${bal != null ? `${fmtU(bal, sellTok.decimals)} ${esc(sellTok === tk ? sym : qs)}` : "—"}</b></div>
      ${fields}
      <div class="aor-row2">${exp}${opts}</div>
      <div class="aor-sum" id="aor-sum">${summary()}</div>
      ${btn}
      <p class="aor-note">${T(ty === "limit" ? "Signed in your wallet — no gas. Your tokens stay with you until the order fills." : ty === "stop" ? "Waits for the pool price to cross the trigger, then fills at market — never below your slippage limit." : "Swaps now through the pool, from your wallet.")}</p>
      <div id="aor-msg">${S.msg ? `<div class="aor-msg ${S.msg.k}">${S.msg.html || T(S.msg.t)}</div>` : ""}</div>`;
  }
  /// what the form builds right now (amounts in raw units), or { err }
  function build() {
    const tk = S.tok, q = S.quote, p = pool();
    if (!tk || !p) return { err: "" };
    const buy = S.side === "buy", ty = S.type;
    const td = tk.decimals, qd = q.decimals;
    const P = Number(String(F.price).replace(/,/g, "")), A = Number(String(F.amount).replace(/,/g, "")), Q = Number(String(F.total).replace(/,/g, ""));
    const slip = Number(F.slip) / 100;
    if (ty === "limit") {
      if (!(P > 0)) return { err: "Enter a price." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const p18 = units(dstr(P), 18);
      if (!p18) return { err: "Enter a price." };
      const grossQ = (amt * p18 * 10n ** BigInt(qd)) / (10n ** BigInt(td) * 10n ** 18n);
      if (grossQ === 0n) return { err: "That order is too small." };
      if (!buy) return { sell: tk, buy: q, sellAmount: amt, buyAmount: (grossQ * 999n) / 1000n, gross: grossQ, price: P, tokAmt: amt };
      const spend = (amt * p18 * 10n ** BigInt(qd) + 10n ** BigInt(td) * 10n ** 18n - 1n) / (10n ** BigInt(td) * 10n ** 18n);
      return { sell: q, buy: tk, sellAmount: spend, buyAmount: (amt * 999n) / 1000n, gross: amt, price: P, tokAmt: amt };
    }
    if (ty === "market") {
      const amt = buy ? units(F.total, qd) : units(F.amount, td);
      if (!amt) return { err: buy ? "Enter how much to spend." : "Enter an amount." };
      return { sell: buy ? q : tk, buy: buy ? tk : q, sellAmount: amt, market: true, slip };
    }
    const Pt = Number(String(F.trigger).replace(/,/g, ""));
    if (!(Pt > 0)) return { err: "Enter a trigger price." };
    if (S.spot && (buy ? Pt <= S.spot : Pt >= S.spot)) return { err: buy ? "A stop buy triggers above the pool price." : "A stop sell triggers below the pool price." };
    const amt = units(F.amount, td);
    if (!amt) return { err: "Enter an amount." };
    const p18 = units(dstr(Pt), 18);
    const grossQ = (amt * p18 * 10n ** BigInt(qd)) / (10n ** BigInt(td) * 10n ** 18n);
    if (grossQ === 0n) return { err: "That order is too small." };
    const sl = BigInt(Math.round(slip * 10000));
    const r = p.tokenIs0 ? Pt * 10 ** (qd - td) : 1 / (Pt * 10 ** (qd - td));
    const trig = BigInt(Math.floor(Math.sqrt(r) * 2 ** 48)) * 2n ** 48n;
    const below = !buy === !!p.tokenIs0;
    if (!buy) return { sell: tk, buy: q, sellAmount: amt, buyAmount: (grossQ * (10000n - sl) * 999n) / 10000n / 1000n, gross: grossQ, trig, below, price: Pt, tokAmt: amt };
    return { sell: q, buy: tk, sellAmount: grossQ, buyAmount: (amt * 10000n * 999n) / (10000n + sl) / 1000n, gross: amt, trig, below, price: Pt, tokAmt: amt };
  }
  function summary() {
    const o = build();
    if (!S.tok) return "";
    if (o.err !== undefined) return `<div class="aor-sl"><span>${T("You receive at least")}</span><b>—</b></div><div class="aor-sl"><span>${T("Fee")}</span><b data-no-i18n>0.1%</b></div>`;
    const sym = (t) => (t === S.tok ? "$" + t.symbol : t.symbol);
    if (o.market) {
      const est = S.quoteOut != null && S.quoteFor === `${o.sell.address}:${o.sellAmount}` ? S.quoteOut : null;
      return `<div class="aor-sl"><span>${T("Estimated")}</span><b data-no-i18n>${est != null ? `${fmtU((est * 999n) / 1000n, o.buy.decimals)} ${esc(sym(o.buy))}` : "…"}</b></div>
        <div class="aor-sl"><span>${T("You receive at least")}</span><b data-no-i18n>${est != null ? `${fmtU(minNet(est, o.slip), o.buy.decimals)} ${esc(sym(o.buy))}` : "—"}</b></div>
        <div class="aor-sl"><span>${T("Fee")}</span><b data-no-i18n>0.1%</b></div>`;
    }
    return `${S.type === "limit" ? `<div class="aor-sl"><span>${T(o.sell === S.tok ? "You sell" : "You pay")}</span><b data-no-i18n>${fmtU(o.sellAmount, o.sell.decimals)} ${esc(sym(o.sell))}</b></div>` : `<div class="aor-sl"><span>${T(o.sell === S.tok ? "You sell" : "You pay up to")}</span><b data-no-i18n>${fmtU(o.sellAmount, o.sell.decimals)} ${esc(sym(o.sell))}</b></div>`}
      <div class="aor-sl"><span>${T("You receive at least")}</span><b data-no-i18n>${fmtU(o.buyAmount, o.buy.decimals)} ${esc(sym(o.buy))}</b></div>
      <div class="aor-sl"><span>${T("Fee")}</span><b><span data-no-i18n>0.1%</span> ${T("of what you receive")}</b></div>
      ${S.type === "limit" && S.spot ? `<div class="aor-sl dim"><span>${T("vs pool price")}</span><b data-no-i18n>${(((o.price - S.spot) / S.spot) * 100).toFixed(2)}%</b></div>` : ""}`;
  }
  const minNet = (out, slip) => ((out * 999n) / 1000n) * BigInt(Math.round((1 - slip) * 10000)) / 10000n;
  let qTimer = 0;
  function requote() {
    clearTimeout(qTimer);
    if (S.type !== "market" || !LIVE()) return;
    qTimer = setTimeout(async () => {
      const o = build(); const p = pool();
      if (o.err !== undefined || !p) return;
      const key = `${o.sell.address}:${o.sellAmount}`;
      try {
        const iface = new ethers.Interface(ORDERS_ABI.concat(["error QuoteResult(uint256 out)"]));
        const data = iface.encodeFunctionData("quote", [keyOf(p), o.sell.address, o.sellAmount]);
        let out = null;
        try { await rp().call({ to: ORDERS(), data }); } catch (e) {
          const d = (e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data))) || null;
          const hex = typeof d === "string" ? d : d && d.data;
          if (hex && hex.length >= 74) { try { out = iface.decodeErrorResult("QuoteResult", hex)[0]; } catch { out = null; } }
        }
        if (out != null) { S.quoteOut = out; S.quoteFor = key; } else { S.quoteOut = null; S.quoteFor = null; }
      } catch { S.quoteOut = null; }
      const sum = $("aor-sum"); if (sum) sum.innerHTML = summary();
    }, 350);
  }
  const keyOf = (p) => ({ currency0: p.key.currency0, currency1: p.key.currency1, fee: p.key.fee, tickSpacing: p.key.tickSpacing, hooks: p.key.hooks });

  // ---------------- placing ----------------
  async function ensureAllowance(s, token, need) {
    const c = new ethers.Contract(token.address, ERC20, s);
    const a = await new ethers.Contract(token.address, ERC20, rp()).allowance(me(), ORDERS());
    if (a >= need) return;
    S.busy = "Approve in your wallet…"; form();
    const tx = await c.approve(ORDERS(), need);
    S.busy = "Waiting for the approval…"; form();
    await tx.wait();
  }
  /// what the maker's other open orders already need from this token (the approval covers them all)
  function openNeed(token) {
    let n = 0n;
    for (const o of ((S.mine && S.mine.orders) || [])) if (o.status === "open" && o.order && lc(o.order.sell) === token.address) n += BigInt(o.order.sellAmount) - BigInt(o.filled || 0);
    return n;
  }
  async function submit() {
    if (S.busy) return;
    const o = build();
    if (o.err !== undefined) { S.msg = { k: "bad", t: o.err || "Open a market first." }; form(); return; }
    const p = pool();
    S.msg = null;
    try {
      const s = await signer();
      const maker = me();
      const bal = await new ethers.Contract(o.sell.address, ERC20, rp()).balanceOf(maker);
      if (bal < o.sellAmount) throw new Error(tr("Not enough balance for this order."));
      if (o.market) {
        await ensureAllowance(s, o.sell, o.sellAmount);
        S.busy = "Getting the price…"; form();
        S.quoteFor = null; requote(); await new Promise((r) => setTimeout(r, 900));
        if (S.quoteOut == null || S.quoteFor !== `${o.sell.address}:${o.sellAmount}`) throw new Error(tr("Couldn't read a price from the pool right now."));
        S.busy = "Confirm the swap in your wallet…"; form();
        const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).swapMarket(keyOf(p), o.sell.address, o.buy.address, o.sellAmount, minNet(S.quoteOut, o.slip));
        S.busy = "Swapping…"; form();
        const rc = await tx.wait();
        S.msg = { k: "ok", html: `${T("Swapped.")} ${txa(rc.hash || tx.hash, tr("View transaction"))}` };
        F.amount = ""; F.total = "";
      } else {
        await ensureAllowance(s, o.sell, o.sellAmount + openNeed(o.sell));
        S.busy = "Sign the order in your wallet…"; form();
        const epoch = LIVE() ? Number(await new ethers.Contract(ORDERS(), ORDERS_ABI, rp()).epochOf(maker)) : 0;
        const salt = BigInt(ethers.hexlify(ethers.randomBytes(16)));
        const order = {
          maker, sell: o.sell.address, buy: o.buy.address, sellAmount: o.sellAmount, buyAmount: o.buyAmount,
          triggerSqrtP: o.trig || 0n, triggerBelow: !!o.below, poolId: o.trig ? p.id : ZERO32,
          expiry: BigInt(Math.floor(Date.now() / 1000) + Number(F.expiry || 604800)), epoch, salt,
        };
        const sig = await s.signTypedData({ name: "ARCIRCLE Orders", version: "1", chainId: CHAIN(), verifyingContract: ORDERS() }, TYPES, order);
        S.busy = "Placing…"; form();
        const body = { action: "orderplace", token: S.t, key: keyOf(p), sig, order: Object.fromEntries(Object.entries(order).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) };
        if (o.trig) body.triggerPrice = o.price;
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ? tr(j.error) : `HTTP ${r.status}`);
        S.msg = { k: "ok", t: S.type === "stop" ? "Stop order placed — it waits for its trigger." : "Order placed — it fills as soon as a wallet or the pool meets your price." };
        F.amount = ""; F.total = "";
      }
    } catch (e) {
      S.msg = { k: "bad", t: errText(e) };
    }
    S.busy = false;
    await Promise.all([loadBook(), loadMine(), loadBal(), loadSpot()]);
    market(); bookView(); chartView(); form(); mineView();
  }

  // ---------------- my orders ----------------
  const STATUS = { open: "Open", unfunded: "Needs balance or approval", filled: "Filled", cancelled: "Cancelled", expired: "Expired" };
  function mineView() {
    const el = $("aor-mine"); if (!el) return;
    const cx = $("aor-cxall");
    if (!me()) { el.innerHTML = `<div class="aor-empty">${T("Connect a wallet to see your orders.")}</div>`; if (cx) cx.hidden = true; return; }
    const all = (S.mine && S.mine.orders) || [];
    const open = all.filter((o) => o.status === "open" || o.status === "unfunded");
    const list = S.myTab === "open" ? open : all.filter((o) => !(o.status === "open" || o.status === "unfunded"));
    if (cx) cx.hidden = !(LIVE() && open.length);
    if (!list.length) { el.innerHTML = `<div class="aor-empty">${T(S.myTab === "open" ? "No open orders." : "Nothing here yet.")}</div>`; return; }
    el.innerHTML = `<div class="aor-mt"><div class="aor-mt-h"><span>${T("Market")}</span><span>${T("Type")}</span><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Filled")}</span><span>${T("Status")}</span><span></span></div>${list.map((o) => {
      const tk = o.token || {}, q = o.quote || {};
      const amt = o.side === "sell" ? human(o.sellAmount, tk.decimals) : human(o.buyAmount, tk.decimals) / (1 - FEE);
      const st = o.expiry && o.expiry < Date.now() / 1000 && o.status === "open" ? "expired" : o.status;
      return `<div class="aor-mr" data-h="${esc(o.hash)}" data-tk="${esc(tk.address)}">
        <span class="aor-mr-m"><button type="button" class="aor-link" data-t="${esc(tk.address)}" data-no-i18n>$${esc(tk.symbol)}/${esc(q.symbol)}</button><small>${ago(o.at)}</small></span>
        <span class="aor-mr-t ${o.side === "buy" ? "up" : "dn"}">${T(o.side === "buy" ? "Buy" : "Sell")} · ${T(o.type === "stop" ? "Stop" : "Limit")}</span>
        <span data-no-i18n>${fp(o.type === "stop" && o.trigger && o.trigger.price ? o.trigger.price : o.price)}${o.type === "stop" ? `<small>${T("trigger")}</small>` : ""}</span>
        <span data-no-i18n>${num(amt)}</span>
        <span><i class="aor-bar-f" style="--f:${Math.min(100, o.filledPct || 0)}%"></i><small data-no-i18n>${(o.filledPct || 0).toFixed(o.filledPct > 0 && o.filledPct < 1 ? 2 : 0)}%</small></span>
        <span class="aor-st ${st}">${T(STATUS[st] || st)}</span>
        <span class="aor-mr-a">${st === "open" || st === "unfunded" ? `<button type="button" class="aor-btn sm" data-act="cancel">${T("Cancel")}</button>${LIVE() && o.order ? `<button type="button" class="aor-btn sm ghost" data-act="cancelchain" title="${T("Cancel on-chain: final even if this site were offline (costs a little gas)")}">${T("On-chain")}</button>` : ""}` : ""}</span>
      </div>`;
    }).join("")}</div>`;
  }
  async function cancel(h, onchain) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    try {
      const s = await signer();
      if (onchain) {
        const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).cancel(o.order);
        S.msg = { k: "", t: "Cancelling on Arc…" }; form();
        await tx.wait();
        S.msg = { k: "ok", html: `${T("Cancelled on-chain.")} ${txa(tx.hash, tr("View transaction"))}` };
      } else {
        const sig = await s.signMessage(`Cancel ARCIRCLE order ${h}`);
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ordercancel", token: o.token.address, hash: h, sig }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ? tr(j.error) : `HTTP ${r.status}`);
        S.msg = { k: "ok", t: "Order cancelled." };
      }
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook()]);
    bookView(); form(); mineView(); market();
  }
  async function cancelAll() {
    try {
      const s = await signer();
      const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).cancelAll();
      S.msg = { k: "", t: "Cancelling every order you've signed…" }; form();
      await tx.wait();
      S.msg = { k: "ok", html: `${T("Every order you signed before now is cancelled.")} ${txa(tx.hash, tr("View transaction"))}` };
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook(), loadBal()]);
    bookView(); form(); mineView(); market();
  }

  // ---------------- events ----------------
  function setPct(pct) {
    const buy = S.side === "buy";
    const sellTok = buy ? S.quote : S.tok;
    const bal = sellTok && S.bal[sellTok.address];
    if (bal == null) return;
    const part = (bal * BigInt(pct)) / 100n;
    if (S.type === "market") { if (buy) F.total = ethers.formatUnits(part, S.quote.decimals); else F.amount = ethers.formatUnits(part, S.tok.decimals); }
    else if (!buy) F.amount = ethers.formatUnits(part, S.tok.decimals);
    else {
      const P = Number(S.type === "stop" ? F.trigger : F.price) || S.spot;
      if (!(P > 0)) return;
      F.amount = dstr((human(part, S.quote.decimals) / P) * 0.9999, Math.min(S.tok.decimals, 8));
    }
    syncTotal(S.type === "limit" ? "amount" : null);
    form(); requote();
  }
  function syncTotal(from) {
    if (S.type !== "limit") return;
    const P = Number(F.price), A = Number(F.amount), Q = Number(F.total);
    if (from === "total" && P > 0 && Q > 0) F.amount = dstr(Q / P, Math.min(S.tok ? S.tok.decimals : 18, 8));
    else if ((from === "amount" || from === "price") && P > 0 && A > 0) F.total = dstr(P * A, S.quote ? S.quote.decimals : 6);
  }
  function onInput(e) {
    const id = e.target.id;
    if (id === "aor-pool") { S.pi = Number(e.target.value) || 0; S.spot = pool().price; loadSpot().then(() => { market(); bookView(); chartView(); form(); }); return; }
    if (id === "aor-exp") { F.expiry = e.target.value; return; }
    if (id === "aor-slip") { F.slip = e.target.value; const s = $("aor-sum"); if (s) s.innerHTML = summary(); return; }
    const map = { "aor-price": "price", "aor-amount": "amount", "aor-total": "total", "aor-trigger": "trigger" };
    if (!map[id] || e.type !== "input") return;
    F[map[id]] = e.target.value;
    syncTotal(map[id]);
    // keep typing in place: only the other fields and the summary change
    if (S.type === "limit") { if (map[id] !== "total" && $("aor-total")) $("aor-total").value = F.total; if (map[id] === "total" && $("aor-amount")) $("aor-amount").value = F.amount; }
    const s = $("aor-sum"); if (s) s.innerHTML = summary();
    requote();
  }
  function onClick(e) {
    const b = e.target.closest("button, a"); if (!b || !panel.contains(b)) return;
    const d = b.dataset;
    if (d.t && b.tagName === "BUTTON") { open(d.t); return; }
    if (d.side) { S.side = d.side; S.msg = null; form(); requote(); return; }
    if (d.type) { S.type = d.type; S.msg = null; form(); requote(); return; }
    if (d.pct) { setPct(Number(d.pct)); return; }
    if (d.price) { F.price = dstr(Number(d.price)); if (S.type !== "limit") S.type = "limit"; syncTotal("price"); form(); if (innerWidth <= 900) $("aor-formc").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (d.left) { S.left = d.left; seg("left", d.left); bookView(); return; }
    if (d.center) { S.center = d.center; seg("center", d.center); chartView(); return; }
    if (d.my) { S.myTab = d.my; seg("my", d.my); mineView(); return; }
    if (d.mt) {
      seg("mt", d.mt); $("aor-grid").dataset.mt = d.mt;
      if (d.mt === "trades" || d.mt === "book") { S.left = d.mt; seg("left", d.mt); bookView(); }
      return;
    }
    if (d.act === "connect") { (async () => { try { await signer(); } catch (err) { S.msg = { k: "bad", t: errText(err) }; } await Promise.all([loadBal(), loadMine()]); form(); mineView(); bookView(); })(); return; }
    if (d.act === "submit") { submit(); return; }
    if (d.act === "cancel" || d.act === "cancelchain") { const r = b.closest("[data-h]"); if (r) cancel(r.dataset.h, d.act === "cancelchain"); return; }
    if (d.act === "cancelall") { cancelAll(); return; }
  }

  // ---------------- boot ----------------
  async function tick(n) {
    if (!panel.classList.contains("active") || document.hidden) return;
    const acct = me();
    if (acct !== S.acct) { S.acct = acct; await Promise.all([loadBal(), loadMine()]); form(); mineView(); }
    if (!S.tok) return;
    await loadBook();
    if (n % 2 === 0) await loadSpot();
    if (n % 3 === 0 && acct) { await Promise.all([loadMine(), loadBal()]); mineView(); if (!S.busy && !panel.querySelector(".aor-formc input:focus")) form(); }
    market(); bookView();
    if (S.center === "depth") chartView();
  }
  function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      loadMarkets();
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      open(m ? m[1] : ARCIRCLE());
      S.acct = me(); loadMine().then(mineView);
    }
    clearInterval(S.timer);
    let n = 0;
    S.timer = setInterval(() => tick(++n), 5000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") show(); else clearInterval(S.timer); });
  window.addEventListener("hashchange", () => { const m = /^#orders\?t=(0x[0-9a-fA-F]{40})/.exec(location.hash); if (m && S.booted && lc(m[1]) !== S.t) open(m[1]); });
  document.addEventListener("arc:lang", () => { if (S.booted) { const t = S.t; frame(); if (t) { market(); bookView(); form(); } } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcOrders = { open, state: S, form: F };
})();
