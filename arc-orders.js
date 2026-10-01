/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-orders.js — ARCIRCLE Orders, an ARCIRCLE PAD utility (arcpad.html#orders; api/_orders.mjs; contracts
// ArcircleOrders.sol + ArcircleFeeBurn.sol). Exchange-style orders on Arc's Uniswap v4 pools, without giving up custody:
//   · limit    sign "sell X for at least Y" (EIP-712, no gas). Tokens stay in the wallet; the executor matches it with
//              another wallet's order (P2P) or fills it from the pool once the pool reaches the price
//   · market   a swap through ArcircleOrders.swapMarket, from the wallet, with a slippage floor
//   · stop     waits until the pool's price crosses a trigger, then sells (or buys) at market, never below its floor
//   · TP / SL  a take-profit and a stop-loss on the same tokens: one-cancels-other (the contract's `group`)
//   · trailing a stop that follows the price up and sells a set % under the peak (the floor is signed)
//   · timed    DCA / TWAP: released evenly over a period (the contract's `start` / `duration`), filled in parts
// 0.1% of what each side receives goes to ArcircleFeeBurn: half buys and burns $ARCIRCLE, half to the treasury.
// Arc only, any token with a Uniswap v4 pool. The book shows price levels — signatures never leave the server, and a
// wallet's own orders open with one signature (30 days).
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lang = () => (window.arcI18n && window.arcI18n.get()) || "en";
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CFG = () => (typeof CONFIG !== "undefined" ? CONFIG : {});
  const ORDERS = () => lc(CFG().ORDERS_ADDRESS || "");
  const LIVE = () => isAddr(ORDERS());
  const USDC = () => lc(CFG().USDC_ADDRESS || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE = () => lc(CFG().ARCIRCLE_TOKEN || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7");
  const CHAIN = () => Number(CFG().CHAIN_ID_DECIMAL || 5042);
  const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
  const PERMIT2 = () => lc(CFG().ORDERS_PERMIT2 || "0x000000000022D473030F116dDEE9F6B43aC78BA3");
  const FREE_HOLD = () => Number(CFG().ORDERS_FREE_HOLD || 100000); // $ARCIRCLE held for no fee (the contract's policy has the real number)
  const EXPL = (kind, x) => `${CFG().BLOCK_EXPLORER || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h, label) => (h ? `<a class="aor-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const API = "/api/social";
  const FEE = 0.001;
  const ZERO32 = "0x" + "0".repeat(64);
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const now = () => Math.floor(Date.now() / 1000);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };

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
  const pc = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
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
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, now() - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
  const inT = (s) => { const d = Math.max(0, s - now()); return d < 60 ? `${d}s` : d < 3600 ? `${Math.ceil(d / 60)}m` : `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`; };
  const hhmm = (s) => { const d = new Date(s * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };
  const P18 = (p) => units(dstr(p), 18);
  const SCALE = (td) => 10n ** BigInt(td) * 10n ** 18n;
  /// `amt` tokens (raw) at price `p` → quote (raw), rounded down / up
  const qOf = (amt, p, td, qd, up = false) => { const s = SCALE(td), x = amt * P18(p) * 10n ** BigInt(qd); return up ? (x + s - 1n) / s : x / s; };
  /// `q` quote (raw) at price `p` → tokens (raw), rounded down
  const tOf = (q, p, td, qd) => (q * SCALE(td)) / (P18(p) * 10n ** BigInt(qd));

  // ---------------- contract bits ----------------
  const ORDER_T = "(address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint64 start,uint32 duration,uint256 group,uint32 epoch,uint256 salt)";
  const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
  const ORDERS_ABI = [
    "function epochOf(address) view returns (uint32)", `function cancel(${ORDER_T})`, "function cancelAll()",
    `function swapMarket(${KEY_T},address,address,uint256,uint256) returns (uint256)`, `function quote(${KEY_T},address,uint256)`,
    "error QuoteResult(uint256 out)", "function feeOf(address,uint256) view returns (uint256)", "function feePolicy() view returns (address)",
  ];
  const P2_ABI = ["function allowance(address,address,address) view returns (uint160 amount, uint48 expiration, uint48 nonce)"];
  const P2_TYPES = { PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }], PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }] };
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const TYPES = { Order: [["maker", "address"], ["sell", "address"], ["buy", "address"], ["sellAmount", "uint256"], ["buyAmount", "uint256"], ["triggerSqrtP", "uint160"], ["triggerBelow", "bool"], ["poolId", "bytes32"], ["expiry", "uint64"], ["start", "uint64"], ["duration", "uint32"], ["group", "uint256"], ["epoch", "uint32"], ["salt", "uint256"]].map(([name, type]) => ({ name, type })) };
  const IFACE = () => new ethers.Interface(ORDERS_ABI);
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
  const keyOf = (p) => ({ currency0: p.key.currency0, currency1: p.key.currency1, fee: p.key.fee, tickSpacing: p.key.tickSpacing, hooks: p.key.hooks });
  /// the contract's quote(): what `amount` of `sell` brings from pool `p` before the fee (null if it can't tell)
  async function quoteOut(p, sell, amount) {
    if (!LIVE() || !p || !(amount > 0n)) return null;
    const iface = IFACE();
    try { await rp().call({ to: ORDERS(), data: iface.encodeFunctionData("quote", [keyOf(p), sell, amount]) }); } catch (e) {
      const d = (e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data))) || null;
      const hex = typeof d === "string" ? d : d && d.data;
      if (hex && hex.length >= 74) { try { return iface.decodeErrorResult("QuoteResult", hex)[0]; } catch { return null; } }
    }
    return null;
  }
  /// a price (quote per token) → the pool's sqrtPriceX96 for a stop trigger
  function trigOf(P, p) {
    const td = S.tok.decimals, qd = S.quote.decimals;
    const r = p.tokenIs0 ? P * 10 ** (qd - td) : 1 / (P * 10 ** (qd - td));
    return BigInt(Math.floor(Math.sqrt(r) * 2 ** 48)) * 2n ** 48n;
  }

  // ---------------- state ----------------
  const S = {
    t: null, tok: null, quote: null, pools: [], pi: 0, spot: null, prevSpot: null, book: null, mine: null, markets: [], status: null, candles: null,
    side: "buy", type: "limit", left: "book", center: "chart", myTab: "open", myScope: "market", tf: 900, prec: 0,
    busy: false, steps: null, booted: false, acct: null, bal: {}, msg: null, loadingMkt: false, err: null, tax: null, agentCall: null,
    editing: null, locked: false, prevLevels: new Map(), prevFill: new Map(), sheet: false, showMarkets: false,
  };
  const F = { price: "", amount: "", total: "", trigger: "", expiry: "604800", slip: "3", tp: "", sl: "", trail: "10", floor: "", dur: "86400", parts: "12", cap: "", approveMore: store.get("arcircle.orders.approvemore", false) };
  const pool = () => S.pools[S.pi] || null;
  const RK = "arcircle.orders.recent", AK = "arcircle.orders.alerts", NK = "arcircle.orders.notify";
  const recent = () => store.get(RK, []).filter((x) => x && isAddr(x.t));
  const addRecent = (t, sym) => store.set(RK, [{ t, sym }, ...recent().filter((x) => x.t !== t)].slice(0, 6));
  const viewKey = (w) => `arcircle.orders.view.${lc(w)}`;
  const viewOf = (w) => { const v = store.get(viewKey(w), null); return v && v.until > now() + 60 ? v : null; };
  const notifyOn = () => store.get(NK, false) === true;

  // ---------------- skeleton ----------------
  const ICON = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="aor-ck" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };
  function frame() {
    $("aor-body").innerHTML = `
      <div class="ams-preview aor-preview" id="aor-preview"${LIVE() ? " hidden" : ""}><i class="ams-preview-ico"></i><div><b>${T("Preview — ARCIRCLE Orders opens once its contract is live on Arc")}</b><span>${T("You can browse markets, the book and the pool price now; placing orders turns on with the contract.")}</span></div></div>
      <div class="ams-card aor-bar">
        <div class="aor-pickrow">
          <form class="aor-pick" id="aor-form" autocomplete="off">
            <input id="aor-in" type="text" spellcheck="false" placeholder="${T("Paste an Arc token address (0x…)")}" aria-label="${T("Arc token address")}">
            <button type="submit" class="aor-btn go">${T("Open market")}</button>
          </form>
          <button type="button" class="aor-btn ghost aor-mkbtn" data-act="markets" aria-expanded="false">${ICON.list}<span>${T("All markets")}</span></button>
        </div>
        <div class="aor-chips" id="aor-chips"></div>
        <div class="aor-mlist" id="aor-mlist" hidden></div>
        <div class="aor-mkt" id="aor-mkt"></div>
      </div>
      <div class="aor-mtabs" role="tablist" aria-label="${T("Market view")}">
        <button type="button" role="tab" data-mt="chart" aria-selected="true">${T("Chart")}</button><button type="button" role="tab" data-mt="book" aria-selected="false">${T("Order book")}</button><button type="button" role="tab" data-mt="trades" aria-selected="false">${T("Trades")}</button>
      </div>
      <div class="aor-grid" id="aor-grid" data-mt="chart">
        <section class="ams-card aor-bookc">
          <div class="aor-bookh"><div class="aor-seg" role="tablist"><button type="button" data-left="book" aria-selected="true">${T("Order book")}</button><button type="button" data-left="trades" aria-selected="false">${T("Trades")}</button></div>
            <select id="aor-prec" class="aor-prec" aria-label="${T("Price step")}"></select></div>
          <div id="aor-book" class="aor-book"></div>
        </section>
        <section class="ams-card aor-chartc">
          <div class="aor-charth"><div class="aor-seg" role="tablist"><button type="button" data-center="chart" aria-selected="true">${T("Chart")}</button><button type="button" data-center="depth" aria-selected="false">${T("Depth")}</button><button type="button" data-center="dex" aria-selected="false" data-no-i18n>Dexscreener</button></div>
            <div class="aor-tfs" id="aor-tfs">${[[300, "5m"], [900, "15m"], [3600, "1h"], [14400, "4h"]].map(([v, l]) => `<button type="button" data-tf="${v}" aria-pressed="${S.tf === v}" data-no-i18n>${l}</button>`).join("")}</div></div>
          <div id="aor-chart" class="aor-chart"></div>
        </section>
        <section class="ams-card aor-formc" id="aor-formc" aria-label="${T("Place an order")}"></section>
      </div>
      <section class="ams-card aor-mine">
        <div class="aor-mine-h"><div class="aor-seg" role="tablist"><button type="button" data-my="open" aria-selected="true">${T("Open orders")} <em id="aor-n-open" data-no-i18n></em></button><button type="button" data-my="history" aria-selected="false">${T("History")} <em id="aor-n-hist" data-no-i18n></em></button></div>
          <div class="aor-scope" role="radiogroup"><button type="button" data-scope="market" aria-checked="true">${T("This market")}</button><button type="button" data-scope="all" aria-checked="false">${T("All")}</button></div>
          <label class="aor-ntf"><input type="checkbox" id="aor-notify"${notifyOn() ? " checked" : ""}> <span>${T("Notify me")}</span></label>
          <span class="aor-mine-acts"><button type="button" class="aor-btn sm ghost" data-act="cancelmarket" id="aor-cxmkt" hidden>${T("Cancel all here")}</button><button type="button" class="aor-btn sm ghost" data-act="cancelall" id="aor-cxall" hidden>${T("Cancel all on-chain")}</button></span></div>
        <div id="aor-mine"></div>
        <p class="aor-tg">${T("Telegram alerts when your orders fill:")} <a href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener" data-no-i18n>@ARCIAonArc_bot</a> · <code data-no-i18n>/orderalerts on</code></p>
      </section>
      <div class="aor-dock" id="aor-dock"><button type="button" class="aor-dbuy" data-sheet="buy">${T("Buy")}</button><button type="button" class="aor-dsell" data-sheet="sell">${T("Sell")}</button></div>
      <div class="aor-scrim" id="aor-scrim" data-act="sheetclose" hidden></div>`;
    $("aor-form").addEventListener("submit", (e) => { e.preventDefault(); open($("aor-in").value.trim()); });
    $("aor-in").addEventListener("paste", () => setTimeout(() => { const v = $("aor-in").value.trim(); if (isAddr(v)) open(v); }, 0));
    if (!S.wired) {
      S.wired = true;
      panel.addEventListener("click", onClick); panel.addEventListener("input", onInput); panel.addEventListener("change", onInput);
      panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) sheet(false); });
    }
    chips(); market(); bookView(); chartView(); form(); mineView();
  }
  const seg = (attr, v) => panel.querySelectorAll(`button[data-${attr}]`).forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-" + attr) === v)));

  // ---------------- markets: chips, the list, the bar ----------------
  async function loadMarkets() {
    try { const r = await fetch(`${API}?orders=markets`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; S.markets = (j && j.markets) || []; } catch { /* keep */ }
    chips(); if (S.showMarkets) marketsView();
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
  function marketsView() {
    const el = $("aor-mlist"); if (!el) return;
    el.hidden = !S.showMarkets;
    const b = panel.querySelector('[data-act="markets"]'); if (b) b.setAttribute("aria-expanded", String(S.showMarkets));
    if (!S.showMarkets) return;
    if (!S.markets.length) { el.innerHTML = `<div class="aor-empty">${T("No markets with orders yet — open any Arc token above and place the first one.")}</div>`; return; }
    el.innerHTML = `<div class="aor-ml-h"><span>${T("Market")}</span><span>${T("Price")}</span><span>${T("Best bid")}</span><span>${T("Best ask")}</span><span>${T("Spread")}</span><span>${T("24h volume")}</span><span>${T("Orders")}</span></div>` +
      S.markets.map((m) => {
        const t = lc(m.token.address || m.token), px = m.spot || m.last;
        const spread = m.bestAsk && m.bestBid ? ((m.bestAsk - m.bestBid) / ((m.bestAsk + m.bestBid) / 2)) * 100 : null;
        return `<button type="button" class="aor-ml-r${t === S.t ? " on" : ""}" data-t="${t}"><b data-no-i18n>$${esc(m.token.symbol)}<i>/${esc(m.quote.symbol)}</i></b><span data-no-i18n>${fp(px)}</span><span class="up" data-no-i18n>${fp(m.bestBid)}</span><span class="dn" data-no-i18n>${fp(m.bestAsk)}</span><span data-no-i18n>${spread != null ? spread.toFixed(2) + "%" : "—"}</span><span data-no-i18n>${m.vol24 ? usd(m.vol24) : "—"}</span><span data-no-i18n>${m.open}</span></button>`;
      }).join("");
  }
  const dayChange = () => {
    const c = S.candles && S.candles.list;
    if (!c || !c.length || !S.spot) return null;
    const t = now() - 86400, old = c.find((x) => x[0] >= t) || c[0];
    return old && old[1] > 0 ? ((S.spot - old[1]) / old[1]) * 100 : null;
  };
  function market() {
    const el = $("aor-mkt"); if (!el) return;
    if (!S.t) { el.innerHTML = `<p class="aor-hint">${T("Pick a market above — any Arc token with a Uniswap v4 pool (Argus, ArcPad or a plain pool).")}</p>`; return; }
    if (S.loadingMkt) { el.innerHTML = `<p class="aor-hint"><span class="aor-spin"></span>${T("Reading the token's pools on Arc…")}</p>`; return; }
    if (!S.tok) { el.innerHTML = `<p class="aor-hint bad">${T(S.err || "No Uniswap v4 pool found for this token on Arc.")}</p>`; return; }
    const p = pool(), b = S.book || {}, d = b.day || {}, ch = dayChange();
    const dir = S.prevSpot && S.spot ? (S.spot > S.prevSpot ? "up" : S.spot < S.prevSpot ? "dn" : "") : "";
    const call = S.agentCall;
    el.innerHTML = `
      <div class="aor-pair">
        <span class="aor-logo" aria-hidden="true">${S.tok.logo ? `<img src="${esc(S.tok.logo)}" alt="" width="34" height="34" loading="lazy" onerror="this.remove()">` : ""}<i data-no-i18n>${esc((S.tok.symbol || "?").slice(0, 2))}</i></span>
        <div><span class="aor-pair-n" data-no-i18n>$${esc(S.tok.symbol)}<i>/ ${esc(S.quote.symbol)}</i></span>
        <span class="aor-pair-s"><a class="aor-tx" href="${EXPL("token", S.t)}" target="_blank" rel="noopener" data-no-i18n>${short(S.t)} ↗</a>${call ? `<a class="aor-call ${esc(call.call)}" href="#agent?t=${S.t}" title="${T("ARCIA AGENT's safety call for the next 24 hours")}"><span data-no-i18n>ARCIA</span> ${T(call.call === "safe" ? "Safe" : call.call === "risky" ? "Risky" : "Caution")}</a>` : ""}</span></div>
      </div>
      <div class="aor-stats">
        <div class="aor-stat big"><small>${T("Pool price")}</small><b data-no-i18n id="aor-spot" class="${dir}">${fp(S.spot)}<i class="aor-arrow ${dir}" aria-hidden="true"></i></b><span data-no-i18n class="${ch == null ? "" : ch >= 0 ? "up" : "dn"}">${ch == null ? esc(S.quote.symbol) : pc(ch) + " 24h"}</span></div>
        <div class="aor-stat"><small>${T("Last fill")}</small><b data-no-i18n>${fp(b.last)}</b></div>
        <div class="aor-stat"><small>${T("24h high")}</small><b data-no-i18n>${fp(d.high)}</b></div>
        <div class="aor-stat"><small>${T("24h low")}</small><b data-no-i18n>${fp(d.low)}</b></div>
        <div class="aor-stat"><small>${T("24h volume")}</small><b data-no-i18n>${d.volume ? usd(d.volume) : "—"}</b></div>
        <div class="aor-stat"><small>${T("Open orders")}</small><b data-no-i18n>${b.open || 0}</b>${b.stops || b.trails || b.twaps ? `<span>${[b.stops ? `${b.stops} ${tr("stops")}` : "", b.trails ? `${b.trails} ${tr("trailing")}` : "", b.twaps ? `${b.twaps} ${tr("timed")}` : ""].filter(Boolean).map(esc).join(" · ")}</span>` : ""}</div>
        ${S.pools.length > 1 ? `<label class="aor-stat aor-poolsel"><small>${T("Pool")}</small><select id="aor-pool" aria-label="${T("Pool")}">${S.pools.map((x, i) => `<option value="${i}"${i === S.pi ? " selected" : ""} data-no-i18n>${esc(x.venue)} · ${x.dex && x.dex.liqUsd ? usd(x.dex.liqUsd) : esc(x.id.slice(0, 8))}</option>`).join("")}</select></label>`
          : `<div class="aor-stat"><small>${T("Pool")}</small><b data-no-i18n>${esc(p.venue || "Uniswap v4")}</b>${p.dex && p.dex.liqUsd ? `<span data-no-i18n>${usd(p.dex.liqUsd)}</span>` : ""}</div>`}
        <div class="aor-stat"><small>${T(S.tax != null ? "Round trip" : "Pool fee")}</small><b data-no-i18n class="${S.tax != null && S.tax > 5 ? "warn" : ""}">${S.tax != null ? S.tax.toFixed(2) + "%" : p.feePct != null ? p.feePct + "%" : p.key && p.key.fee === 0x800000 ? tr("dynamic") : "—"}</b>${S.tax != null ? `<span>${T("pool fee + tax")}</span>` : ""}</div>
      </div>
      <div class="aor-side-tools">
        ${execChip()}
        <button type="button" class="aor-btn sm ghost aor-alertbtn" data-act="alerts" aria-expanded="${!!S.alertsOpen}">${ICON.bell}<span>${T("Price alert")}</span>${alertsFor(S.t).length ? `<em data-no-i18n>${alertsFor(S.t).length}</em>` : ""}</button>
      </div>
      ${S.alertsOpen ? alertsBox() : ""}`;
  }
  function execChip() {
    const st = S.status;
    if (!LIVE() || !st) return "";
    const k = !st.at ? "off" : st.low || st.ago > 900 ? "bad" : st.ago > 180 ? "warn" : "ok";
    const txt = !st.at ? tr("Executor not running yet") : `${tr("Executor")} · ${tr("checked")} ${ago(st.at)}${st.low ? " · " + tr("low on gas") : ""}`;
    const tip = st.burn ? `${tr("Last fee burn")}: ${num(st.burn.arcircle)} $ARCIRCLE (${usd(st.burn.usdc)})` : tr("Fills orders every minute");
    return `<span class="aor-exec ${k}" title="${esc(tip)}"><i></i><span data-no-i18n>${esc(txt)}</span></span>`;
  }

  // ---------------- price alerts (this browser) ----------------
  const alertsAll = () => store.get(AK, []).filter((a) => a && isAddr(a.t) && a.price > 0);
  const alertsFor = (t) => alertsAll().filter((a) => a.t === t);
  function alertsBox() {
    const list = alertsFor(S.t);
    return `<div class="aor-alerts" id="aor-alerts">
      <div class="aor-al-row"><span class="aor-in"><input id="aor-al-price" type="text" inputmode="decimal" placeholder="${esc(fp(S.spot))}" aria-label="${T("Alert price")}"><i data-no-i18n>${esc(S.quote.symbol)}</i></span><button type="button" class="aor-btn go sm" data-act="alertadd">${T("Alert me")}</button></div>
      <p class="aor-note">${T("This browser tells you when the pool price crosses it — keep the tab open, or turn on notifications.")}</p>
      ${list.length ? `<ul>${list.map((a, i) => `<li><span>${T(a.dir === "up" ? "rises to" : "falls to")} <b data-no-i18n>${fp(a.price)}</b></span><button type="button" class="aor-x" data-alertdel="${i}" aria-label="${T("Remove")}">${ICON.close}</button></li>`).join("")}</ul>` : ""}
    </div>`;
  }
  function checkAlerts() {
    if (!S.spot || !S.t) return;
    const all = alertsAll(), keep = [];
    for (const a of all) {
      if (a.t !== S.t) { keep.push(a); continue; }
      if ((a.dir === "up" && S.spot >= a.price) || (a.dir === "down" && S.spot <= a.price)) {
        const msg = `$${a.sym} ${tr(a.dir === "up" ? "rose to" : "fell to")} ${fp(S.spot)} ${S.quote.symbol}`;
        toast(msg, "alert"); notify("ARCIRCLE Orders", msg);
      } else keep.push(a);
    }
    if (keep.length !== all.length) { store.set(AK, keep); market(); }
  }

  // ---------------- open a market ----------------
  async function open(addr) {
    addr = lc(addr);
    if (!isAddr(addr)) { S.msg = { k: "bad", t: "Paste a token contract address (0x…)." }; form(); return; }
    if (addr === USDC()) { S.msg = { k: "bad", t: "USDC is the quote — pick the token you want to trade." }; form(); return; }
    Object.assign(S, { t: addr, tok: null, quote: null, pools: [], pi: 0, spot: null, prevSpot: null, book: null, err: null, loadingMkt: true, msg: null, candles: null, tax: null, agentCall: null, editing: null, alertsOpen: false });
    S.prevLevels = new Map();
    if ($("aor-in")) $("aor-in").value = addr;
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#orders?t=${addr}`);
    chips(); market(); bookView(); chartView(); form(); mineView();
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
      pools.sort((a, b) => (lc(b.quote.address) === USDC()) - (lc(a.quote.address) === USDC()) || ((b.dex && b.dex.liqUsd) || 0) - ((a.dex && a.dex.liqUsd) || 0) || Number(BigInt(b.liquidity || 0) > BigInt(a.liquidity || 0)) - Number(BigInt(b.liquidity || 0) < BigInt(a.liquidity || 0)));
      const q = pools[0] && lc(pools[0].quote.address);
      S.pools = pools.filter((p) => lc(p.quote.address) === q); // one book per token: one quote
      if (!S.pools.length) throw new Error("No Uniswap v4 pool found for this token on Arc.");
      S.tok = { address: addr, symbol: (j.token && j.token.symbol) || "TOKEN", decimals: Number((j.token && j.token.decimals) ?? 18), logo: (j.token && j.token.logo) || null };
      S.quote = { address: q, symbol: pools[0].quote.symbol || "USDC", decimals: Number(pools[0].quote.decimals ?? 6) };
      S.spot = pools[0].price || null;
      addRecent(addr, S.tok.symbol);
    } catch (e) {
      S.err = String((e && e.message) || e);
    }
    S.loadingMkt = false;
    chips(); market(); chartView(); form();
    if (!S.tok) return;
    await Promise.all([loadBook(), loadSpot(), loadBal(), loadCandles()]);
    if (S.t !== addr) return;
    market(); bookView(); chartView(); form(); mineView();
    loadTax().then(() => { market(); form(); });
    loadAgent().then(() => market());
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
      const h = await new ethers.Contract(PM, ["function extsload(bytes32) view returns (bytes32)"], prov).extsload(L.poolSlot(p.id, ethers.keccak256));
      const s0 = L.decodeSlot0(h);
      if (s0.sqrtP > 0n) {
        const v = L.priceOf(s0.sqrtP, p.tokenIs0, p.tokenIs0 ? S.tok.decimals : S.quote.decimals, p.tokenIs0 ? S.quote.decimals : S.tok.decimals);
        if (S.spot && v !== S.spot) S.prevSpot = S.spot;
        S.spot = v;
      }
    } catch { /* keep the last price */ }
  }
  async function loadBal() {
    const a = me(), prov = rp();
    if (!a || !S.tok || !prov) { S.bal = {}; return; }
    try {
      const [bt, bq] = await Promise.all([S.tok.address, S.quote.address].map((t) => new ethers.Contract(t, ERC20, prov).balanceOf(a)));
      S.bal = { [S.tok.address]: bt, [S.quote.address]: bq };
    } catch { /* keep */ }
    loadFee();
  }
  /// fee-free? (the contract's feeOf) and the threshold (its policy's discountMin)
  async function loadFee() {
    const a = me();
    if (!LIVE() || !a) { S.feeFree = false; return; }
    try {
      const c = new ethers.Contract(ORDERS(), ORDERS_ABI, rp());
      const [f, pol] = await Promise.all([c.feeOf(a, 10000n), S.freeMin ? null : c.feePolicy().catch(() => null)]);
      const was = S.feeFree;
      S.feeFree = f === 0n;
      if (pol && pol !== ethers.ZeroAddress) { const m = await new ethers.Contract(pol, ["function discountMin() view returns (uint256)"], rp()).discountMin().catch(() => null); if (m != null) S.freeMin = Number(ethers.formatEther(m)); }
      if (was !== S.feeFree) { const sum = $("aor-sum"); if (sum) sum.innerHTML = summary(); }
    } catch { /* keep */ }
  }
  async function loadMine() {
    const a = me();
    if (!a) { S.mine = null; S.locked = false; return; }
    const v = viewOf(a);
    if (!v) { S.mine = null; S.locked = true; return; }
    try {
      const r = await fetch(`${API}?orders=mine&wallet=${a}&until=${v.until}&sig=${v.sig}`, { cache: "no-store" });
      if (r.status === 401) { store.set(viewKey(a), null); S.locked = true; S.mine = null; return; }
      if (r.ok) { const j = await r.json(); diffMine(S.mine, j); S.mine = j; S.locked = false; }
    } catch { /* keep */ }
  }
  async function loadStatus() {
    if (!LIVE()) return;
    try { const r = await fetch(`${API}?orders=status`, { cache: "no-store" }); if (r.ok) S.status = await r.json(); } catch { /* keep */ }
  }
  async function loadCandles() {
    const p = pool(); if (!p) return;
    try {
      const r = await fetch(`${API}?orders=candles&pool=${p.id}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || pool() !== p) return;
      // raw currency1-per-currency0 → quote per token; quote volume
      const d0 = p.tokenIs0 ? S.tok.decimals : S.quote.decimals, d1 = p.tokenIs0 ? S.quote.decimals : S.tok.decimals, k = 10 ** (d0 - d1);
      const conv = (r0) => (p.tokenIs0 ? r0 * k : 1 / (r0 * k));
      const qIs0 = !p.tokenIs0;
      S.candles = { pool: p.id, complete: j.complete, list: (j.candles || []).map(([t, o, h, l, c, v0, v1]) => {
        const O = conv(o), H = p.tokenIs0 ? conv(h) : conv(l), Lo = p.tokenIs0 ? conv(l) : conv(h), C = conv(c);
        return [t, O, H, Lo, C, (qIs0 ? v0 : v1) / 10 ** S.quote.decimals];
      }) };
    } catch { /* keep */ }
  }
  /// a $10 buy and sell straight back through the pool: the pool fee both ways plus any token tax
  async function loadTax() {
    const p = pool(); if (!LIVE() || !p || !S.tok) return;
    try {
      const x = 10n * 10n ** BigInt(S.quote.decimals);
      const got = await quoteOut(p, S.quote.address, x);
      const back = got ? await quoteOut(p, S.tok.address, got) : null;
      if (back != null) S.tax = Math.max(0, (1 - Number(back) / Number(x)) * 100);
    } catch { /* unknown */ }
  }
  async function loadAgent() {
    try {
      const r = await fetch("/api/desk?agent=record", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const c = j && (j.calls || []).filter((x) => lc(x.t) === S.t).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
      S.agentCall = c && c.call ? { call: c.call, at: c.at } : null;
    } catch { S.agentCall = null; }
  }

  // ---------------- the order book ----------------
  const myLevels = () => {
    const out = new Set();
    for (const o of ((S.mine && S.mine.orders) || [])) if (lc(o.token.address || o.token) === S.t && o.status === "open" && o.type === "limit") out.add(o.side + ":" + group(sig4(o.price), o.side === "sell" ? "sell" : "buy"));
    return out;
  };
  const sig4 = (p) => { if (!(p > 0)) return 0; const e = Math.floor(Math.log10(p)) - 3; return Math.round(p / 10 ** e) * 10 ** e; }; // the server's level rounding
  /// the price step the book is grouped by (0 = as the server sends it, 4 significant figures)
  const steps = () => { if (!S.spot) return []; const e = Math.floor(Math.log10(S.spot)); return [e - 3, e - 2, e - 1].map((k) => 10 ** k); };
  const group = (p, side) => { const st = S.prec; if (!st) return p; const k = p / st; return Number(((side === "sell" ? Math.ceil(k - 1e-9) : Math.floor(k + 1e-9)) * st).toPrecision(12)); };
  function levels(raw, side) {
    const g = new Map();
    for (const l of raw || []) { const p = group(l.price, side); const v = g.get(p) || { price: p, amount: 0, orders: 0 }; v.amount += l.amount; v.orders += l.orders; g.set(p, v); }
    return [...g.values()].sort((a, b) => (side === "sell" ? a.price - b.price : b.price - a.price));
  }
  function precSelect() {
    const el = $("aor-prec"); if (!el) return;
    const opts = [[0, tr("Auto")], ...steps().map((s) => [s, fp(s)])];
    el.innerHTML = opts.map(([v, l]) => `<option value="${v}"${S.prec === v ? " selected" : ""}>${esc(l)}</option>`).join("");
  }
  function bookView() {
    const el = $("aor-book"); if (!el) return;
    precSelect();
    if (!S.tok) { el.innerHTML = `<div class="aor-empty">${T(S.t ? "…" : "No market open")}</div>`; return; }
    const b = S.book || { asks: [], bids: [], fills: [] };
    if (S.left === "trades") { el.innerHTML = tradesHtml(b); return; }
    const mine = myLevels();
    const ROWS = 10;
    const asks = levels(b.asks, "sell").slice(0, ROWS), bids = levels(b.bids, "buy").slice(0, ROWS);
    let ca = 0, cb = 0;
    const askCum = asks.map((l) => (ca += l.amount)), bidCum = bids.map((l) => (cb += l.amount));
    const max = Math.max(ca, cb, 1e-18);
    const seen = new Map();
    const row = (l, cum, side, i) => {
      const key = side + ":" + l.price, prev = S.prevLevels.get(key);
      seen.set(key, l.amount);
      const fl = reduce || prev === undefined ? (S.prevLevels.size ? " fl-new" : "") : l.amount > prev + 1e-12 ? " fl-up" : l.amount < prev - 1e-12 ? " fl-dn" : "";
      return `<button type="button" class="aor-lv ${side === "sell" ? "dn" : "up"}${i === 0 ? " best" : ""}${mine.has(side + ":" + l.price) ? " mine" : ""}${fl}" data-price="${l.price}" data-side="${side}" style="--d:${((cum / max) * 100).toFixed(1)}%"><b data-no-i18n>${fp(l.price)}</b><span data-no-i18n>${num(l.amount)}</span><em data-no-i18n>${num(l.amount * l.price)}</em></button>`;
    };
    const pad = (n) => Array.from({ length: Math.max(0, ROWS - n) }, () => '<div class="aor-lv ph" aria-hidden="true"></div>').join("");
    const bestAsk = asks[0] && asks[0].price, bestBid = bids[0] && bids[0].price;
    const spread = bestAsk && bestBid ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 : null;
    const dir = S.prevSpot && S.spot ? (S.spot > S.prevSpot ? "up" : S.spot < S.prevSpot ? "dn" : "") : "";
    const empty = !asks.length && !bids.length;
    el.innerHTML = `<div class="aor-th"><span>${T("Price")} <i data-no-i18n>${esc(S.quote.symbol)}</i></span><span>${T("Amount")}</span><span>${T("Total")}</span></div>
      <div class="aor-asks">${pad(asks.length)}${asks.map((l, i) => row(l, askCum[i], "sell", i)).reverse().join("")}</div>
      <div class="aor-mid"><b data-no-i18n class="${dir}">${fp(S.spot)}<i class="aor-arrow ${dir}" aria-hidden="true"></i></b><small>${T("pool price")}</small>${b.last ? `<span class="aor-midlast">${T("last")} <span data-no-i18n>${fp(b.last)}</span></span>` : ""}${spread != null ? `<em>${T("spread")} <span data-no-i18n>${spread.toFixed(2)}%</span></em>` : ""}</div>
      <div class="aor-bids">${bids.map((l, i) => row(l, bidCum[i], "buy", i)).join("")}${pad(bids.length)}</div>
      ${empty ? `<div class="aor-first"><b>${T("Be the first to place an order in this market")}</b><span>${T("Suggested, from the pool price:")}</span><div>${S.spot ? [[-5, "buy"], [-10, "buy"], [5, "sell"], [10, "sell"]].map(([k, sd]) => `<button type="button" class="aor-sug ${sd === "buy" ? "up" : "dn"}" data-sug="${sd}" data-price="${Number((S.spot * (1 + k / 100)).toPrecision(4))}">${T(sd === "buy" ? "Buy" : "Sell")} <span data-no-i18n>${pc(k, 0)}</span></button>`).join("") : ""}</div></div>`
        : `<p class="aor-foot">${T("Orders below the ask and above the bid fill from the pool as soon as its price gets there.")}</p>`}`;
    S.prevLevels = seen;
    emblem(ca, cb);
  }
  function tradesHtml(b) {
    const flash = (f) => { const k = f.tx + ":" + (f.li ?? f.h); const seen = S.prevFill.has(k); S.prevFill.set(k, 1); return seen || !S.prevFill.size ? "" : " fl-new"; };
    return `<div class="aor-th"><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Time")}</span></div>` +
      (b.fills && b.fills.length ? `<div class="aor-trades">${b.fills.map((f) => `<a class="aor-tr ${f.side === "buy" ? "up" : "dn"}${flash(f)}" href="${EXPL("tx", f.tx)}" target="_blank" rel="noopener" title="${T(f.via === "match" ? "Wallet to wallet" : f.via === "market" ? "Market order" : "Filled from the pool")}"><b data-no-i18n>${fp(f.price)}</b><span data-no-i18n>${num(f.amount)}</span><em data-no-i18n>${hhmm(f.at)}<i>${f.via === "match" ? "P2P" : f.via === "market" ? "MKT" : "POOL"}</i></em></a>`).join("")}</div>`
        : `<div class="aor-empty">${T("No fills yet in this market.")}</div>`);
  }
  /// the hero emblem leans with the book: ask bars by the sell side's size, bid bars by the buy side's
  function emblem(asks, bids) {
    const e = panel.querySelector(".aor-emblem"); if (!e) return;
    const tot = asks + bids;
    e.style.setProperty("--ask", tot ? (0.45 + (asks / tot) * 0.75).toFixed(2) : "1");
    e.style.setProperty("--bid", tot ? (0.45 + (bids / tot) * 0.75).toFixed(2) : "1");
  }

  // ---------------- chart, depth, Dexscreener ----------------
  function chartView() {
    const el = $("aor-chart"); if (!el) return;
    const tfs = $("aor-tfs"); if (tfs) tfs.hidden = S.center !== "chart";
    const p = pool();
    if (!p) { el.innerHTML = `<div class="aor-empty">${T(S.t && S.loadingMkt ? "…" : "The chart shows up when a market is open.")}</div>`; delete el.dataset.pool; return; }
    if (S.center === "depth") { el.innerHTML = depthSvg(); delete el.dataset.pool; return; }
    if (S.center === "dex") {
      if (el.dataset.pool === "dex:" + p.id && el.querySelector("iframe")) return;
      el.dataset.pool = "dex:" + p.id;
      el.innerHTML = `<iframe title="${T("Price chart")}" loading="lazy" src="https://dexscreener.com/arc/${encodeURIComponent(p.id)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15"></iframe>`;
      return;
    }
    if (el.dataset.pool !== "c:" + p.id || !el.querySelector("canvas")) {
      el.dataset.pool = "c:" + p.id;
      el.innerHTML = `<div class="aor-cv"><canvas id="aor-cv" aria-label="${T("Price chart")}" role="img"></canvas><div class="aor-tip" id="aor-tip" hidden></div><div class="aor-cmsg" id="aor-cmsg" hidden></div></div>`;
      const cv = $("aor-cv");
      cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); S.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; draw(); });
      cv.addEventListener("pointerleave", () => { S.hover = null; draw(); });
      if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(cv.parentNode);
    }
    draw();
  }
  /// the candles at the chosen timeframe, from the 5-minute ones
  function series() {
    const c = S.candles && S.candles.list;
    if (!c || !c.length) return [];
    const tf = S.tf, out = [];
    for (const [t, o, h, l, cl, v] of c) {
      const b = Math.floor(t / tf) * tf, last = out[out.length - 1];
      if (last && last[0] === b) { last[2] = Math.max(last[2], h); last[3] = Math.min(last[3], l); last[4] = cl; last[5] += v; }
      else out.push([b, o, h, l, cl, v]);
    }
    return out.slice(-120);
  }
  function draw() {
    const cv = $("aor-cv"); if (!cv) return;
    const wrap = cv.parentNode, W = Math.max(200, wrap.clientWidth), H = Math.max(220, wrap.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const data = series(), msg = $("aor-cmsg");
    if (!data.length) {
      if (msg) { msg.hidden = false; msg.innerHTML = S.candles ? `${T("No trades in this pool in the last 3 days.")} <button type="button" class="aor-link" data-center="dex" data-no-i18n>Dexscreener</button>` : `<span class="aor-spin"></span>${T("Reading the pool's trades…")}`; }
      return;
    }
    if (msg) msg.hidden = true;
    const AX = 66, VB = 0.18, PADT = 14, PADB = 22;
    const cw = W - AX, ph = (H - PADT - PADB) * (1 - VB), vt = PADT + ph + 6, vh = (H - PADT - PADB) * VB - 6;
    const lines = orderLines();
    let lo = Math.min(...data.map((d) => d[3])), hi = Math.max(...data.map((d) => d[2]));
    for (const l of lines) if (l.p > lo * 0.7 && l.p < hi * 1.3) { lo = Math.min(lo, l.p); hi = Math.max(hi, l.p); }
    if (S.spot) { lo = Math.min(lo, S.spot); hi = Math.max(hi, S.spot); }
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const padP = (hi - lo) * 0.08; hi += padP; lo -= padP;
    const y = (p) => PADT + (1 - (p - lo) / (hi - lo)) * ph;
    const n = data.length, bw = cw / Math.max(n, 30), x = (i) => (i + 0.5) * bw + (cw - n * bw);
    const css = getComputedStyle(panel);
    const UP = css.getPropertyValue("--or-up").trim() || "#39ff88", DN = css.getPropertyValue("--or-dn").trim() || "#ff6e5a";
    // grid + price axis
    g.font = "500 10px 'JetBrains Mono', monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4, yy = y(p);
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      g.fillStyle = "rgba(160,176,189,.75)"; g.textAlign = "left"; g.fillText(fp(p), cw + 6, yy);
    }
    // volume
    const vmax = Math.max(...data.map((d) => d[5]), 1e-18);
    data.forEach((d, i) => { const hh = (d[5] / vmax) * vh; g.fillStyle = d[4] >= d[1] ? "rgba(57,255,136,.22)" : "rgba(255,110,90,.22)"; g.fillRect(x(i) - bw * 0.35, vt + vh - hh, bw * 0.7, hh); });
    // candles
    data.forEach((d, i) => {
      const up = d[4] >= d[1], c = up ? UP : DN, xx = x(i);
      g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(xx, y(d[2])); g.lineTo(xx, y(d[3])); g.stroke();
      const top = y(Math.max(d[1], d[4])), bot = y(Math.min(d[1], d[4]));
      g.fillStyle = c; g.fillRect(xx - bw * 0.34, top, bw * 0.68, Math.max(1, bot - top));
    });
    // time labels
    g.fillStyle = "rgba(160,176,189,.6)"; g.textAlign = "center"; g.textBaseline = "alphabetic";
    const every = Math.max(1, Math.round(n / 5));
    data.forEach((d, i) => { if (i % every) return; const dt = new Date(d[0] * 1000); g.fillText(S.tf >= 14400 ? `${dt.getMonth() + 1}/${dt.getDate()}` : `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`, x(i), H - 6); });
    // fills (from the book's tape) as markers
    const t0 = data[0][0], tEnd = data[n - 1][0] + S.tf;
    for (const f of ((S.book && S.book.fills) || []).slice(0, 40)) {
      if (!(f.at >= t0 && f.at < tEnd) || !(f.price > lo && f.price < hi)) continue;
      const i = Math.min(n - 1, Math.floor((f.at - t0) / S.tf)), xx = x(i), yy = y(f.price), buy = f.side === "buy";
      g.fillStyle = buy ? UP : DN; g.beginPath();
      if (buy) { g.moveTo(xx, yy + 4); g.lineTo(xx - 4, yy + 10); g.lineTo(xx + 4, yy + 10); } else { g.moveTo(xx, yy - 4); g.lineTo(xx - 4, yy - 10); g.lineTo(xx + 4, yy - 10); }
      g.fill();
    }
    // my orders, stop triggers, trailing lines, and the pool price
    g.setLineDash([5, 4]); g.textBaseline = "middle"; g.textAlign = "left";
    for (const l of lines) {
      if (!(l.p > lo && l.p < hi)) continue;
      const yy = y(l.p);
      g.strokeStyle = l.c; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      const label = l.label; g.font = "600 10px Inter, sans-serif";
      const tw = g.measureText(label).width + 10;
      g.fillStyle = l.c; g.fillRect(4, yy - 8, tw, 16); g.fillStyle = "#06101a"; g.fillText(label, 9, yy);
    }
    if (S.spot && S.spot > lo && S.spot < hi) {
      const yy = y(S.spot);
      g.strokeStyle = "#8fdcff"; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      g.setLineDash([]); g.fillStyle = "#8fdcff"; g.fillRect(cw + 1, yy - 8, AX - 2, 16); g.fillStyle = "#04121c"; g.font = "700 10px 'JetBrains Mono', monospace"; g.fillText(fp(S.spot), cw + 5, yy);
    }
    g.setLineDash([]);
    // crosshair
    const tip = $("aor-tip");
    if (S.hover && S.hover.x < cw) {
      const i = Math.max(0, Math.min(n - 1, Math.floor((S.hover.x - (cw - n * bw)) / bw))), d = data[i];
      g.strokeStyle = "rgba(255,255,255,.25)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(i), PADT); g.lineTo(x(i), H - PADB); g.moveTo(0, S.hover.y); g.lineTo(cw, S.hover.y); g.stroke(); g.setLineDash([]);
      const hp = lo + (1 - (S.hover.y - PADT) / ph) * (hi - lo);
      if (S.hover.y > PADT && S.hover.y < PADT + ph) { g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(cw + 1, S.hover.y - 8, AX - 2, 16); g.fillStyle = "#04121c"; g.fillText(fp(hp), cw + 5, S.hover.y); }
      if (tip && d) {
        const ch = d[1] ? ((d[4] - d[1]) / d[1]) * 100 : 0, dt = new Date(d[0] * 1000);
        tip.hidden = false;
        tip.innerHTML = `<b data-no-i18n>${dt.toLocaleDateString()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}</b><span>O <i data-no-i18n>${fp(d[1])}</i></span><span>H <i data-no-i18n>${fp(d[2])}</i></span><span>L <i data-no-i18n>${fp(d[3])}</i></span><span>C <i data-no-i18n>${fp(d[4])}</i></span><span class="${ch >= 0 ? "up" : "dn"}" data-no-i18n>${pc(ch)}</span><span>${T("Vol")} <i data-no-i18n>${usd(d[5])}</i></span>`;
        tip.style.left = (S.hover.x > W / 2 ? 8 : W - AX - tip.offsetWidth - 8) + "px";
      }
    } else if (tip) tip.hidden = true;
  }
  /// lines to draw: my open orders (limit price, stop trigger, trailing line, take-profit / stop-loss)
  function orderLines() {
    const out = [];
    for (const o of ((S.mine && S.mine.orders) || [])) {
      if (lc(o.token.address || o.token) !== S.t || o.status !== "open") continue;
      const sd = o.side === "buy" ? tr("Buy") : tr("Sell"), amt = num(o.side === "sell" ? human(o.sellAmount, S.tok.decimals) : human(o.buyAmount, S.tok.decimals) / (1 - FEE));
      if (o.type === "stop") out.push({ p: (o.trigger && o.trigger.price) || o.price, c: "#ff9b8a", label: `${o.leg === "sl" ? "SL" : tr("Stop")} ${amt}` });
      else if (o.type === "trail" && o.trail) out.push({ p: o.trail.at, c: "#ffb27a", label: `${tr("Trail")} ${o.trail.pct}%` });
      else if (o.type === "limit") out.push({ p: o.price, c: o.leg === "tp" ? "#7dffb8" : "#ffc861", label: `${o.leg === "tp" ? "TP" : sd} ${amt}` });
    }
    return out;
  }
  function depthSvg() {
    const b = S.book || {};
    const asks = levels(b.asks, "sell").slice(0, 30), bids = levels(b.bids, "buy").slice(0, 30);
    if (!asks.length && !bids.length) return `<div class="aor-empty">${T("No orders in the book yet — the depth chart fills in as orders come.")}</div>`;
    const W = 600, H = 340, pad = 24;
    const prices = [...asks, ...bids].map((l) => l.price).concat(S.spot ? [S.spot] : []);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    if (hi === lo) { lo *= 0.9; hi *= 1.1; }
    const span = hi - lo; lo -= span * 0.05; hi += span * 0.05;
    let c = 0; const bc = bids.map((l) => [l.price, (c += l.amount)]); const bmax = c;
    c = 0; const ac = asks.map((l) => [l.price, (c += l.amount)]); const amax = c;
    const ymax = Math.max(bmax, amax, 1e-18);
    const x = (p) => pad + ((p - lo) / (hi - lo)) * (W - pad * 2);
    const y = (v) => H - pad - (v / ymax) * (H - pad * 2);
    // a fixed number of points, so one shape morphs into the next (CSS d transitions)
    const step = (pts, toLeft) => {
      const P = [[x(pts.length ? pts[0][0] : toLeft ? lo : hi), y(0)]];
      let prev = 0;
      for (let i = 0; i < 30; i++) { const q = pts[Math.min(i, pts.length - 1)]; if (!q) { P.push(P[P.length - 1], P[P.length - 1]); continue; } P.push([x(q[0]), y(prev)], [x(q[0]), y(q[1])]); prev = q[1]; }
      const end = x(toLeft ? lo : hi); P.push([end, y(prev)], [end, y(0)]);
      return "M" + P.map(([a, bb]) => `${a.toFixed(1)},${bb.toFixed(1)}`).join(" L") + " Z";
    };
    const sx = S.spot ? x(S.spot) : null, dB = step(bc, true), dA = step(ac, false);
    return `<svg class="aor-depth" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Depth")}">
      <line class="aor-d-base" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>
      <path class="aor-d-bid" d="${dB}" style="d:path('${dB}')"/><path class="aor-d-ask" d="${dA}" style="d:path('${dA}')"/>
      ${sx != null ? `<line class="aor-d-spot" x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="${pad / 2}" y2="${H - pad}"/><text class="aor-d-lbl" x="${Math.min(W - 90, sx + 6).toFixed(1)}" y="${pad}" data-no-i18n>${esc(fp(S.spot))}</text>` : ""}
      <text class="aor-d-lbl" x="${pad}" y="${H - 6}" data-no-i18n>${esc(fp(lo))}</text><text class="aor-d-lbl end" x="${W - pad}" y="${H - 6}" data-no-i18n>${esc(fp(hi))}</text>
    </svg><div class="aor-d-key"><span class="up">${T("Buy orders")}</span><span class="dn">${T("Sell orders")}</span><small>${T("cumulative, in")} <span data-no-i18n>$${esc(S.tok.symbol)}</span></small></div>`;
  }

  // ---------------- the order form ----------------
  const TYPES_UI = [["limit", "Limit"], ["market", "Market"], ["stop", "Stop order"], ["tpsl", "TP / SL"], ["trail", "Trailing stop"], ["twap", "Timed (DCA)"]];
  const sellOnly = (t) => t === "tpsl" || t === "trail";
  function form() {
    const el = $("aor-formc"); if (!el) return;
    if (sellOnly(S.type) && S.side !== "sell") S.side = "sell";
    const tk = S.tok, q = S.quote;
    const sym = tk ? "$" + tk.symbol : "TOKEN", qs = q ? q.symbol : "USDC";
    const buy = S.side === "buy", ty = S.type;
    const sellTok = tk ? (buy ? q : tk) : null;
    const bal = sellTok && S.bal[sellTok.address] != null ? S.bal[sellTok.address] : null;
    const field = (id, label, unit, val, ph, extra = "") => `<label class="aor-f"><small>${T(label)}</small><span class="aor-in"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(ph || "0")}" value="${esc(val)}"><i data-no-i18n>${esc(unit)}</i></span>${extra}</label>`;
    const pctRow = () => `<div class="aor-pctw"><input type="range" id="aor-slider" min="0" max="100" step="1" value="${esc(S.pct || 0)}" aria-label="${T("Share of your balance")}" style="--v:${S.pct || 0}%"><div class="aor-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}" aria-pressed="${Number(S.pct) === p}">${p}%</button>`).join("")}</div></div>`;
    const quick = (target, list) => S.spot ? `<div class="aor-quick">${list.map(([k, l]) => `<button type="button" data-quick="${target}" data-k="${k}">${esc(l)}</button>`).join("")}</div>` : "";
    const qLimit = quick("price", buy ? [[0, tr("Pool")], [-2, "−2%"], [-5, "−5%"], [-10, "−10%"]] : [[0, tr("Pool")], [2, "+2%"], [5, "+5%"], [10, "+10%"]]);
    let fields = "";
    if (ty === "limit") fields = field("aor-price", "Price", qs, F.price, S.spot ? fp(S.spot) : "0", qLimit) + field("aor-amount", "Amount", sym, F.amount) + pctRow() + field("aor-total", "Total", qs, F.total);
    else if (ty === "market") fields = (buy ? field("aor-total", "Spend", qs, F.total) : field("aor-amount", "Sell", sym, F.amount)) + pctRow();
    else if (ty === "stop") fields = field("aor-trigger", buy ? "Buy when the price rises to" : "Sell when the price falls to", qs, F.trigger, S.spot ? fp(S.spot) : "0", quick("trigger", buy ? [[5, "+5%"], [10, "+10%"], [20, "+20%"]] : [[-5, "−5%"], [-10, "−10%"], [-20, "−20%"]])) + field("aor-amount", "Amount", sym, F.amount) + pctRow();
    else if (ty === "tpsl") fields = field("aor-amount", "Amount", sym, F.amount) + pctRow() +
      field("aor-tp", "Take profit at", qs, F.tp, S.spot ? fp(S.spot * 1.2) : "0", quick("tp", [[10, "+10%"], [25, "+25%"], [50, "+50%"], [100, "+100%"]])) +
      field("aor-sl", "Stop loss at", qs, F.sl, S.spot ? fp(S.spot * 0.85) : "0", quick("sl", [[-5, "−5%"], [-10, "−10%"], [-15, "−15%"], [-25, "−25%"]]));
    else if (ty === "trail") fields = field("aor-amount", "Amount", sym, F.amount) + pctRow() +
      `<label class="aor-f"><small>${T("Trail by")}</small><div class="aor-quick wide">${["3", "5", "10", "15", "20"].map((v) => `<button type="button" data-trailpct="${v}" aria-pressed="${F.trail === v}" data-no-i18n>${v}%</button>`).join("")}</div></label>` +
      field("aor-floor", "Never sell below", qs, F.floor, S.spot ? fp(S.spot * (1 - Number(F.trail) / 100) * 0.8) : "0");
    else if (ty === "twap") fields = (buy ? field("aor-total", "Spend in total", qs, F.total) : field("aor-amount", "Sell in total", sym, F.amount)) + pctRow() +
      `<div class="aor-row2"><label class="aor-f half"><small>${T("Over")}</small><select id="aor-dur">${[["3600", "1 hour"], ["21600", "6 hours"], ["86400", "24 hours"], ["259200", "3 days"], ["604800", "7 days"], ["2592000", "30 days"]].map(([v, l]) => `<option value="${v}"${F.dur === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>
        <label class="aor-f half"><small>${T("In parts")}</small><select id="aor-parts">${["4", "6", "12", "24", "48"].map((v) => `<option value="${v}"${F.parts === v ? " selected" : ""} data-no-i18n>${v}</option>`).join("")}</select></label></div>` +
      field("aor-cap", buy ? "Never pay more than" : "Never sell below", qs, F.cap, S.spot ? fp(S.spot * (buy ? 1.5 : 0.6)) : "0");
    const slipSel = `<label class="aor-f half"><small>${T("Slippage limit")}</small><select id="aor-slip">${["1", "3", "5", "10", "20"].map((v) => `<option value="${v}"${F.slip === v ? " selected" : ""} data-no-i18n>${v}%</option>`).join("")}</select></label>`;
    const expSel = `<label class="aor-f half"><small>${T("Expires")}</small><select id="aor-exp">${[["86400", "1 day"], ["604800", "7 days"], ["2592000", "30 days"], ["7776000", "90 days"]].map(([v, l]) => `<option value="${v}"${F.expiry === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>`;
    const opts = ty === "market" ? slipSel : ty === "stop" || ty === "tpsl" ? expSel + slipSel : ty === "twap" ? "" : expSel;
    const connected = !!me();
    const label = ty === "tpsl" ? tr("Place take-profit and stop-loss") : ty === "trail" ? tr("Place trailing stop") : ty === "twap" ? `${tr(buy ? "Start buying" : "Start selling")} ${sym}` : `${tr(buy ? "Buy" : "Sell")} ${sym}`;
    const btn = !tk ? `<button type="button" class="aor-submit" disabled>${T("Open a market first")}</button>`
      : !LIVE() ? `<button type="button" class="aor-submit" disabled>${T("Opens once the contract is live")}</button>`
        : !connected ? `<button type="button" class="aor-submit go" data-act="connect">${T("Connect wallet")}</button>`
          : `<button type="button" class="aor-submit ${buy ? "buy" : "sell"}" data-act="submit" id="aor-submit"${S.busy ? " disabled" : ""}>${S.busy ? `<span class="aor-spin"></span>${T(S.busy)}` : `${S.editing ? T("Replace order") : esc(label)}`}</button>`;
    const notes = { limit: "Signed in your wallet — no gas. Your tokens stay with you until the order fills.", market: "Swaps now through the pool, from your wallet.",
      stop: "Waits for the pool price to cross the trigger, then fills at market — never below your slippage limit.",
      tpsl: "Two signed orders on the same tokens: when one fills, the other is cancelled — on-chain, not just here.",
      trail: "The executor follows the pool price up and sells once it falls back by your trail. The floor is signed, so it never sells below it.",
      twap: "Released evenly over the period and filled in parts from the pool — never above your price limit. One signature." };
    el.innerHTML = `
      ${S.editing ? `<div class="aor-editing"><span>${T("Editing an order — placing this one cancels the old one.")}</span><button type="button" class="aor-link" data-act="editcancel">${T("Stop editing")}</button></div>` : ""}
      <div class="aor-side" role="radiogroup" aria-label="${T("Side")}" data-side="${S.side}"><i class="aor-side-pill" aria-hidden="true"></i><button type="button" role="radio" class="buy" data-setside="buy" aria-checked="${buy}"${sellOnly(ty) ? " disabled" : ""}>${T("Buy")}</button><button type="button" role="radio" class="sell" data-setside="sell" aria-checked="${!buy}">${T("Sell")}</button></div>
      <div class="aor-types" role="tablist">${TYPES_UI.map(([k, l]) => `<button type="button" role="tab" data-type="${k}" aria-selected="${ty === k}">${T(l)}</button>`).join("")}</div>
      <button type="button" class="aor-avail" data-pct="100" title="${T("Use all of it")}"><small>${T("Available")}</small><b data-no-i18n>${bal != null ? `${fmtU(bal, sellTok.decimals)} ${esc(sellTok === tk ? sym : qs)}` : "—"}</b></button>
      ${fields}
      ${opts ? `<div class="aor-row2">${opts}</div>` : ""}
      <div class="aor-sum" id="aor-sum">${summary()}</div>
      ${S.steps ? stepsHtml() : ""}
      ${LIVE() && connected && ty !== "market" ? `<label class="aor-more"><input type="checkbox" id="aor-approvemore"${F.approveMore ? " checked" : ""}> <span>${T("Approve a larger amount so later orders skip this step")}</span></label>` : ""}
      ${btn}
      <p class="aor-note">${T(notes[ty])}</p>
      <div id="aor-msg">${S.msg ? `<div class="aor-msg ${S.msg.k}">${S.msg.html || T(S.msg.t)}</div>` : ""}</div>`;
    const sl = $("aor-slider"); if (sl) sl.style.setProperty("--v", (S.pct || 0) + "%");
    // on a phone the form lives in a sheet: results of actions taken outside it come as a toast
    if (S.msg && S.msg !== S.toasted && innerWidth <= 720 && !S.sheet && (S.msg.k === "ok" || S.msg.k === "bad")) { S.toasted = S.msg; const d = document.createElement("div"); d.innerHTML = S.msg.html || T(S.msg.t); toast(d.textContent, S.msg.k === "bad" ? "bad" : "fill"); }
  }
  function stepsHtml() {
    return `<ol class="aor-steps">${S.steps.list.map((s, i) => `<li class="${i < S.steps.at ? "done" : i === S.steps.at ? "now" : ""}"><i>${i < S.steps.at ? ICON.check : `<span data-no-i18n>${i + 1}</span>`}</i><span>${T(s)}</span></li>`).join("")}</ol>`;
  }
  const setStep = (at) => { if (S.steps) { S.steps.at = at; form(); } };

  /// what the form builds right now: { legs: [{ o, body }], rows, warn } or { err }; amounts in raw units
  function build() {
    const tk = S.tok, q = S.quote, p = pool();
    if (!tk || !p) return { err: "" };
    const buy = S.side === "buy", ty = S.type, td = tk.decimals, qd = q.decimals;
    const n = (v) => Number(String(v).replace(/,/g, ""));
    const slip = n(F.slip) / 100, sym = (t) => (t === tk ? "$" + t.symbol : t.symbol);
    const warn = [], tax = S.tax || 0;
    const row = (k, v, cls = "") => ({ k, v, cls });
    if (ty === "market") {
      const amt = buy ? units(F.total, qd) : units(F.amount, td);
      if (!amt) return { err: buy ? "Enter how much to spend." : "Enter an amount." };
      return { market: true, sell: buy ? q : tk, buy: buy ? tk : q, sellAmount: amt, slip };
    }
    if (ty === "limit") {
      const P = n(F.price);
      if (!(P > 0)) return { err: "Enter a price." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const gross = qOf(amt, P, td, qd);
      if (gross === 0n) return { err: "That order is too small." };
      const o = buy ? { sell: q.address, buy: tk.address, sellAmount: qOf(amt, P, td, qd, true), buyAmount: (amt * 999n) / 1000n } : { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (gross * 999n) / 1000n };
      const taker = S.spot && (buy ? P >= S.spot * (1 + tax / 200) : P <= S.spot * (1 - tax / 200));
      if (taker) warn.push({ k: "taker", t: buy ? "This price is above the pool price — it would fill right away from the pool." : "This price is below the pool price — it would fill right away from the pool." });
      else if (!buy && tax > 1.5) warn.push({ k: "tax", t: `${tr("Fills from the pool need the pool price about")} ${(tax / 2).toFixed(1)}% ${tr("above your price (pool fee and token tax). Wallet-to-wallet matches don't pay them.")}` });
      return { legs: [{ o, body: {} }], kind: taker ? "taker" : "maker", rows: [
        row(buy ? "You pay" : "You sell", `${fmtU(o.sellAmount, buy ? qd : td)} ${sym(buy ? q : tk)}`),
        row("You receive at least", `${fmtU(o.buyAmount, buy ? td : qd)} ${sym(buy ? tk : q)}`),
        feeRow(),
        ...(S.spot ? [row("vs pool price", pc(((P - S.spot) / S.spot) * 100), "dim")] : []),
      ], warn };
    }
    if (ty === "stop") {
      const Pt = n(F.trigger);
      if (!(Pt > 0)) return { err: "Enter a trigger price." };
      if (S.spot && (buy ? Pt <= S.spot : Pt >= S.spot)) return { err: buy ? "A stop buy triggers above the pool price." : "A stop sell triggers below the pool price." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const grossQ = qOf(amt, Pt, td, qd);
      if (grossQ === 0n) return { err: "That order is too small." };
      const sl = BigInt(Math.round(slip * 10000));
      const below = !buy === !!p.tokenIs0;
      const o = !buy ? { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (grossQ * (10000n - sl) * 999n) / 10000n / 1000n }
        : { sell: q.address, buy: tk.address, sellAmount: grossQ, buyAmount: (amt * 10000n * 999n) / (10000n + sl) / 1000n };
      Object.assign(o, { triggerSqrtP: trigOf(Pt, p), triggerBelow: below, poolId: p.id });
      if (tax / 2 > slip * 100) warn.push({ k: "slip", t: `${tr("Raise the slippage limit above")} ${(tax / 2).toFixed(1)}% — ${tr("this pool's fee and token tax take that much.")}` });
      return { legs: [{ o, body: { triggerPrice: Pt } }], rows: [
        row(buy ? "You pay up to" : "You sell", `${fmtU(o.sellAmount, buy ? qd : td)} ${sym(buy ? q : tk)}`),
        row("You receive at least", `${fmtU(o.buyAmount, buy ? td : qd)} ${sym(buy ? tk : q)}`), feeRow(),
      ], warn };
    }
    if (ty === "tpsl") {
      const amt = units(F.amount, td), Ptp = n(F.tp), Psl = n(F.sl);
      if (!amt) return { err: "Enter an amount." };
      if (!(Ptp > 0)) return { err: "Enter a take-profit price." };
      if (!(Psl > 0)) return { err: "Enter a stop-loss price." };
      if (S.spot && Ptp <= S.spot) return { err: "The take-profit goes above the pool price." };
      if (S.spot && Psl >= S.spot) return { err: "The stop-loss goes below the pool price." };
      const sl = BigInt(Math.round(slip * 10000));
      const tpO = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Ptp, td, qd) * 999n) / 1000n };
      const slO = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Psl, td, qd) * (10000n - sl) * 999n) / 10000n / 1000n, triggerSqrtP: trigOf(Psl, p), triggerBelow: !!p.tokenIs0, poolId: p.id };
      if (tax / 2 > slip * 100) warn.push({ k: "slip", t: `${tr("Raise the slippage limit above")} ${(tax / 2).toFixed(1)}% — ${tr("this pool's fee and token tax take that much.")}` });
      return { legs: [{ o: tpO, body: { leg: "tp" }, name: "take-profit" }, { o: slO, body: { leg: "sl", triggerPrice: Psl }, name: "stop-loss" }], group: true, rows: [
        row("You sell", `${fmtU(amt, td)} ${sym(tk)}`),
        row("Take profit: at least", `${fmtU(tpO.buyAmount, qd)} ${q.symbol}`, "up"),
        row("Stop loss: at least", `${fmtU(slO.buyAmount, qd)} ${q.symbol}`, "dn"),
        feeRow(),
      ], warn };
    }
    if (ty === "trail") {
      const amt = units(F.amount, td), pct = n(F.trail), Pf = n(F.floor) || (S.spot ? S.spot * (1 - pct / 100) * 0.8 : 0);
      if (!amt) return { err: "Enter an amount." };
      if (!(Pf > 0)) return { err: "Enter the lowest price you'd sell at." };
      if (S.spot && Pf >= S.spot * (1 - pct / 100)) return { err: "The floor goes below where the trail would sell." };
      const o = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Pf, td, qd) * 999n) / 1000n, poolId: p.id };
      return { legs: [{ o, body: { trail: pct } }], rows: [
        row("You sell", `${fmtU(amt, td)} ${sym(tk)}`), row("Sells when the price falls", `${pct}% ${tr("under its peak")}`),
        ...(S.spot ? [row("Today that's", `${fp(S.spot * (1 - pct / 100))} ${q.symbol}`, "dim")] : []),
        row("You receive at least", `${fmtU(o.buyAmount, qd)} ${q.symbol}`), feeRow(),
      ], warn };
    }
    // timed (DCA / TWAP)
    const cap = n(F.cap) || (S.spot ? S.spot * (buy ? 1.5 : 0.6) : 0), dur = n(F.dur), parts = n(F.parts);
    if (!(cap > 0)) return { err: buy ? "Enter the most you'd pay per token." : "Enter the least you'd sell for per token." };
    const amt = buy ? units(F.total, qd) : units(F.amount, td);
    if (!amt) return { err: buy ? "Enter how much to spend." : "Enter an amount." };
    const o = buy ? { sell: q.address, buy: tk.address, sellAmount: amt, buyAmount: (tOf(amt, cap, td, qd) * 999n) / 1000n } : { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, cap, td, qd) * 999n) / 1000n };
    if (o.buyAmount === 0n) return { err: "That order is too small." };
    const start = now() + 30;
    Object.assign(o, { start: BigInt(start), duration: dur, expiry: BigInt(start + dur + 86400) });
    const each = Number(amt) / parts / 10 ** (buy ? qd : td);
    return { legs: [{ o, body: { parts } }], timed: true, rows: [
      row(buy ? "You spend" : "You sell", `${fmtU(amt, buy ? qd : td)} ${sym(buy ? q : tk)}`),
      row("Each part", `≈ ${num(each)} ${sym(buy ? q : tk)} · ${tr("every")} ${dur / parts >= 3600 ? (dur / parts / 3600).toFixed(1) + "h" : Math.round(dur / parts / 60) + "m"}`),
      row(buy ? "Never above" : "Never below", `${fp(cap)} ${q.symbol}`), feeRow(),
    ], warn };
  }
  /// the fee line: 0% for holders of enough $ARCIRCLE (the contract's fee policy), else 0.1% with how to get to 0
  const feeRow = () => (S.feeFree ? { k: "Fee", v: `0% · ${tr("you hold")} ${num(S.freeMin || FREE_HOLD())}+ $ARCIRCLE`, cls: "up" } : { k: "Fee", v: "0.1% · " + tr("of what you receive"), cls: "", hint: true });
  const feeHint = () => (S.feeFree ? "" : `<div class="aor-free">${T("Hold")} <b data-no-i18n>${num(S.freeMin || FREE_HOLD())} $ARCIRCLE</b> ${T("and every order is fee-free.")} <a href="#arcircle" data-no-i18n>$ARCIRCLE →</a></div>`);
  const net = (out) => (S.feeFree ? out : (out * 999n) / 1000n);
  function summary() {
    if (!S.tok) return "";
    const o = build();
    if (o.err !== undefined) return `<div class="aor-sl"><span>${T("You receive at least")}</span><b>—</b></div><div class="aor-sl ${feeRow().cls}"><span>${T("Fee")}</span><b data-no-i18n>${esc(feeRow().v)}</b></div>${feeHint()}`;
    const sym = (t) => (t === S.tok ? "$" + t.symbol : t.symbol);
    if (o.market) {
      const est = S.quoteOut != null && S.quoteFor === `${o.sell.address}:${o.sellAmount}` ? S.quoteOut : null;
      const impact = est != null && S.spot ? (() => { const inH = human(o.sellAmount, o.sell.decimals), outH = human(est, o.buy.decimals); const px = o.sell === S.quote ? inH / outH : outH / inH; return ((px - S.spot) / S.spot) * 100 * (o.sell === S.quote ? 1 : -1); })() : null;
      return `<div class="aor-sl"><span>${T("Estimated")}</span><b data-no-i18n>${est != null ? `${fmtU(net(est), o.buy.decimals)} ${esc(sym(o.buy))}` : "…"}</b></div>
        <div class="aor-sl"><span>${T("You receive at least")}</span><b data-no-i18n>${est != null ? `${fmtU(minNet(est, o.slip), o.buy.decimals)} ${esc(sym(o.buy))}` : "—"}</b></div>
        ${impact != null ? `<div class="aor-sl dim"><span>${T("Price impact")}</span><b data-no-i18n class="${impact > 5 ? "warn" : ""}">${pc(impact)}</b></div>` : ""}
        <div class="aor-sl ${feeRow().cls}"><span>${T("Fee")}</span><b data-no-i18n>${esc(feeRow().v)}</b></div>${feeHint()}`;
    }
    const kind = o.kind ? `<div class="aor-kind ${o.kind}"><i></i><span>${T(o.kind === "taker" ? "Fills now (taker)" : "Waits in the book (maker)")}</span>${o.kind === "taker" ? `<button type="button" class="aor-link" data-type="market">${T("Use Market instead")}</button>` : ""}</div>` : "";
    return kind + o.rows.map((r) => `<div class="aor-sl ${r.cls}"><span>${T(r.k)}</span><b data-no-i18n>${esc(r.v)}</b></div>`).join("") + feeHint() +
      (o.warn || []).map((w) => `<div class="aor-warn">${T(w.t)}</div>`).join("");
  }
  const minNet = (out, slip) => (net(out) * BigInt(Math.round((1 - slip) * 10000))) / 10000n;
  let qTimer = 0;
  function requote() {
    clearTimeout(qTimer);
    if (S.type !== "market" || !LIVE()) return;
    qTimer = setTimeout(async () => {
      const o = build(); const p = pool();
      if (o.err !== undefined || !p) return;
      const key = `${o.sell.address}:${o.sellAmount}`;
      const out = await quoteOut(p, o.sell.address, o.sellAmount).catch(() => null);
      S.quoteOut = out; S.quoteFor = out != null ? key : null;
      const sum = $("aor-sum"); if (sum) sum.innerHTML = summary();
    }, 350);
  }

  // ---------------- placing ----------------
  /// the contract may pull `need` of `token`: already (an approval, or a Permit2 allowance), with a Permit2 signature
  /// (no gas — for wallets that approved Permit2 before, as Uniswap asks), or with an approval transaction.
  /// Returns a signed permit to send with the order, or null.
  async function ensureAllowance(s, token, need, { permitOk = false, until = 0 } = {}) {
    const c = new ethers.Contract(token.address, ERC20, rp());
    const a = await c.allowance(me(), ORDERS());
    if (a >= need) return null;
    const toP2 = await c.allowance(me(), PERMIT2()).catch(() => 0n);
    if (toP2 >= need) {
      const al = await new ethers.Contract(PERMIT2(), P2_ABI, rp()).allowance(me(), token.address, ORDERS()).catch(() => null);
      if (al && al.amount >= need && Number(al.expiration) > now() + 120) return null;
      if (permitOk && al) {
        S.busy = "Sign the Permit2 allowance in your wallet…"; form();
        const exp = Math.max(now() + 180 * 86400, until + 86400);
        const permit = { details: { token: token.address, amount: F.approveMore ? (1n << 160n) - 1n : need, expiration: exp, nonce: Number(al.nonce) }, spender: ORDERS(), sigDeadline: exp };
        const sig = await s.signTypedData({ name: "Permit2", chainId: CHAIN(), verifyingContract: PERMIT2() }, P2_TYPES, permit);
        return { details: { ...permit.details, amount: permit.details.amount.toString() }, spender: permit.spender, sigDeadline: String(permit.sigDeadline), sig };
      }
    }
    S.busy = "Approve in your wallet…"; form();
    const tx = await new ethers.Contract(token.address, ERC20, s).approve(ORDERS(), F.approveMore ? ethers.MaxUint256 : need);
    S.busy = "Waiting for the approval…"; form();
    await tx.wait();
    return null;
  }
  /// what the maker's other open orders already need from this token (the approval covers them all)
  function openNeed(tokenAddr) {
    let n = 0n;
    for (const o of ((S.mine && S.mine.orders) || [])) if ((o.status === "open" || o.status === "unfunded") && o.order && lc(o.order.sell) === tokenAddr) n += BigInt(o.order.sellAmount) - BigInt(o.filled || 0);
    return n;
  }
  const post = async (body) => {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ? tr(j.error) : `HTTP ${r.status}`);
    return j;
  };
  const jsonOrder = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  async function submit() {
    if (S.busy) return;
    const b = build();
    if (b.err !== undefined) { S.msg = { k: "bad", t: b.err || "Open a market first." }; form(); return; }
    const p = pool();
    S.msg = null;
    try {
      const s = await signer();
      const maker = me();
      if (b.market) {
        S.steps = { list: ["Approve", "Swap"], at: 0 }; form();
        const bal = await new ethers.Contract(b.sell.address, ERC20, rp()).balanceOf(maker);
        if (bal < b.sellAmount) throw new Error(tr("Not enough balance for this order."));
        await ensureAllowance(s, b.sell, b.sellAmount);
        setStep(1);
        S.busy = "Getting the price…"; form();
        const out = await quoteOut(p, b.sell.address, b.sellAmount);
        if (out == null) throw new Error(tr("Couldn't read a price from the pool right now."));
        S.busy = "Confirm the swap in your wallet…"; form();
        const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).swapMarket(keyOf(p), b.sell.address, b.buy.address, b.sellAmount, minNet(out, b.slip));
        S.busy = "Swapping…"; form();
        const rc = await tx.wait();
        setStep(2);
        post({ action: "orderfilled", tx: rc.hash || tx.hash }).catch(() => null);
        S.msg = { k: "ok", html: `${T("Swapped.")} ${txa(rc.hash || tx.hash, tr("View transaction"))}` };
        F.amount = ""; F.total = ""; S.pct = 0;
        celebrate();
      } else {
        const legs = b.legs, sellTok = lc(legs[0].o.sell) === S.tok.address ? S.tok : S.quote;
        const list = ["Approve", ...(legs.length > 1 ? legs.map((l) => "Sign the " + l.name) : ["Sign"]), "Place", ...(S.editing ? ["Cancel the old order"] : [])];
        S.steps = { list, at: 0 }; form();
        const need = legs.reduce((m, l) => (l.o.sellAmount > m ? l.o.sellAmount : m), 0n);
        const bal = await new ethers.Contract(sellTok.address, ERC20, rp()).balanceOf(maker);
        if (bal < need) throw new Error(tr("Not enough balance for this order."));
        const exp0 = now() + Number(F.expiry || 604800);
        const permit = await ensureAllowance(s, sellTok, need + openNeed(sellTok.address) - (S.editing ? BigInt(S.editing.rem || 0) : 0n), { permitOk: true, until: b.timed ? Number(legs[0].o.expiry) : exp0 });
        setStep(1);
        const epoch = Number(await new ethers.Contract(ORDERS(), ORDERS_ABI, rp()).epochOf(maker));
        const grp = b.group ? BigInt(ethers.hexlify(ethers.randomBytes(8))) : 0n;
        const exp = BigInt(exp0);
        const signed = [];
        for (const [i, l] of legs.entries()) {
          S.busy = legs.length > 1 ? (i ? "Sign the stop-loss in your wallet…" : "Sign the take-profit in your wallet…") : "Sign the order in your wallet…"; form();
          const order = { maker, triggerSqrtP: 0n, triggerBelow: false, poolId: ZERO32, expiry: exp, start: 0n, duration: 0, group: grp, epoch, salt: BigInt(ethers.hexlify(ethers.randomBytes(16))), ...l.o };
          const sig = await s.signTypedData({ name: "ARCIRCLE Orders", version: "1", chainId: CHAIN(), verifyingContract: ORDERS() }, TYPES, order);
          signed.push({ order, sig, body: l.body });
          setStep(1 + i + 1);
        }
        S.busy = "Placing…"; form();
        for (const x of signed) await post({ action: "orderplace", token: S.t, key: keyOf(p), sig: x.sig, order: jsonOrder(x.order), ...x.body, ...(permit ? { permit } : {}) });
        setStep(list.length - (S.editing ? 1 : 0));
        if (S.editing) {
          S.busy = "Sign to cancel the old order…"; form();
          const old = S.editing;
          const sig = await s.signMessage(`Cancel ARCIRCLE order ${old.hash}`);
          await post({ action: "ordercancel", token: old.token, hash: old.hash, sig });
          S.editing = null; setStep(list.length);
        }
        S.msg = { k: "ok", t: { stop: "Stop order placed — it waits for its trigger.", tpsl: "Take-profit and stop-loss placed — when one fills, the other is cancelled.", trail: "Trailing stop placed — it follows the price up.", twap: "Timed order placed — the first part fills once it's released." }[S.type] || "Order placed — it fills as soon as a wallet or the pool meets your price." };
        F.amount = ""; F.total = ""; S.pct = 0;
        flyToMine();
      }
    } catch (e) {
      S.msg = { k: "bad", t: errText(e) };
    }
    S.busy = false;
    setTimeout(() => { S.steps = null; form(); }, 2600);
    await Promise.all([loadBook(), loadMine(), loadBal(), loadSpot()]);
    market(); bookView(); chartView(); form(); mineView();
  }
  /// the summary flies down into "Open orders"
  function flyToMine() {
    const from = $("aor-sum"), to = $("aor-mine");
    if (reduce || !from || !to) return;
    const a = from.getBoundingClientRect(), bRect = to.getBoundingClientRect();
    const ghost = from.cloneNode(true);
    ghost.className = "aor-sum aor-ghost";
    Object.assign(ghost.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px" });
    document.body.appendChild(ghost);
    requestAnimationFrame(() => { ghost.style.transform = `translate(${bRect.left + 20 - a.left}px, ${bRect.top + 10 - a.top}px) scale(.35)`; ghost.style.opacity = "0"; });
    setTimeout(() => ghost.remove(), 900);
  }
  function celebrate() {
    const e = panel.querySelector(".aor-emblem");
    if (!e || reduce) return;
    e.classList.remove("fire"); void e.offsetWidth; e.classList.add("fire");
  }

  // ---------------- my orders ----------------
  const STATUS = { open: "Open", unfunded: "Needs balance or approval", filled: "Filled", cancelled: "Cancelled", expired: "Expired" };
  const TYPE_NAME = { limit: "Limit", stop: "Stop order", trail: "Trailing stop", twap: "Timed (DCA)" };
  function ring(pct) {
    const r = 9, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, pct || 0));
    return `<svg class="aor-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" class="bg"/><circle cx="12" cy="12" r="${r}" class="fg" style="stroke-dasharray:${((f / 100) * c).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
  }
  function mineView() {
    const el = $("aor-mine"); if (!el) return;
    const cx = $("aor-cxall"), cm = $("aor-cxmkt");
    if (!me()) { el.innerHTML = `<div class="aor-empty">${T("Connect a wallet to see your orders.")}</div>`; if (cx) cx.hidden = true; if (cm) cm.hidden = true; return; }
    if (S.locked) {
      el.innerHTML = `<div class="aor-lock"><b>${T("Your orders are private")}</b><span>${T("Sign once (free, no gas) to see them here for 30 days.")}</span><button type="button" class="aor-btn go" data-act="unlock">${T("Show my orders")}</button></div>`;
      if (cx) cx.hidden = !LIVE(); if (cm) cm.hidden = true; return;
    }
    const all = ((S.mine && S.mine.orders) || []).filter((o) => S.myScope === "all" || lc(o.token.address || o.token) === S.t);
    const isOpen = (o) => o.status === "open" || o.status === "unfunded";
    const open = all.filter(isOpen), hist = all.filter((o) => !isOpen(o));
    if ($("aor-n-open")) $("aor-n-open").textContent = open.length ? String(open.length) : "";
    if ($("aor-n-hist")) $("aor-n-hist").textContent = hist.length ? String(hist.length) : "";
    const list = S.myTab === "open" ? open : hist;
    if (cx) cx.hidden = !(LIVE() && open.length);
    if (cm) cm.hidden = !(S.t && open.some((o) => lc(o.token.address || o.token) === S.t));
    if (!list.length) { el.innerHTML = `<div class="aor-empty">${T(S.myTab === "open" ? "No open orders." : "Nothing here yet.")}</div>`; return; }
    el.innerHTML = `<div class="aor-mt"><div class="aor-mt-h"><span>${T("Market")}</span><span>${T("Type")}</span><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Filled")}</span><span>${T("Status")}</span><span></span></div>${list.map((o) => {
      const tk = o.token || {}, q = o.quote || {};
      const amt = o.side === "sell" ? human(o.sellAmount, tk.decimals) : o.type === "twap" ? human(o.sellAmount, q.decimals) : human(o.buyAmount, tk.decimals) / (1 - FEE);
      const amtSym = o.side === "buy" && o.type === "twap" ? q.symbol : "";
      const st = o.expiry && o.expiry < now() && o.status === "open" ? "expired" : o.status;
      const px = o.type === "stop" && o.trigger && o.trigger.price ? o.trigger.price : o.type === "trail" && o.trail ? o.trail.at : o.price;
      const sub = o.type === "stop" ? tr("trigger") : o.type === "trail" && o.trail ? `${tr("trails")} ${o.trail.pct}% · ${tr("peak")} ${fp(o.trail.peak)}` : o.type === "twap" && o.twap ? `${tr("released")} ${o.twap.releasedPct}% · ${o.twap.parts} ${tr("parts")}` : o.type === "limit" && o.side === "buy" ? tr("or lower") : o.type === "limit" ? tr("or higher") : "";
      const note = o.note === "oco" ? tr("its pair filled") : o.retry && st === "open" ? `${tr("retrying in")} ${inT(o.retry.next)}` : "";
      const leg = o.leg ? `<em class="aor-leg ${o.leg}" data-no-i18n>${o.leg === "tp" ? "TP" : "SL"}</em>` : "";
      return `<div class="aor-mr${S.pulse && S.pulse.has(o.hash) ? " pulse" : ""}" data-h="${esc(o.hash)}" data-tk="${esc(tk.address)}">
        <span class="aor-mr-m"><button type="button" class="aor-link" data-t="${esc(tk.address)}" data-no-i18n>$${esc(tk.symbol)}/${esc(q.symbol)}</button><small>${ago(o.at)}</small></span>
        <span class="aor-mr-t ${o.side === "buy" ? "up" : "dn"}">${T(o.side === "buy" ? "Buy" : "Sell")} · ${T(TYPE_NAME[o.type] || o.type)}${leg}</span>
        <span data-no-i18n>${fp(px)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
        <span data-no-i18n>${num(amt)}${amtSym ? ` ${esc(amtSym)}` : ""}</span>
        <span class="aor-mr-f">${ring(o.filledPct)}<small data-no-i18n>${(o.filledPct || 0).toFixed(o.filledPct > 0 && o.filledPct < 1 ? 2 : 0)}%</small></span>
        <span class="aor-st ${st}">${T(STATUS[st] || st)}${note ? `<small>${esc(note)}</small>` : ""}</span>
        <span class="aor-mr-a">${isOpen(o) && st !== "expired" ? `${o.type === "limit" && !o.group && LIVE() ? `<button type="button" class="aor-btn sm ghost" data-act="edit">${T("Edit")}</button>` : ""}<button type="button" class="aor-btn sm" data-act="cancel">${T("Cancel")}</button>${LIVE() && o.order ? `<button type="button" class="aor-btn sm ghost" data-act="cancelchain" title="${T("Cancel on-chain: final even if this site were offline (costs a little gas)")}">${T("On-chain")}</button>` : ""}` : o.filledPct > 0 ? `<button type="button" class="aor-btn sm ghost aor-ic" data-act="share" aria-label="${T("Save image")}" title="${T("Save image")}">${ICON.share}</button>` : ""}</span>
      </div>`;
    }).join("")}</div>`;
  }
  async function unlock() {
    try {
      const s = await signer(), w = me(), until = now() + 30 * 86400;
      const sig = await s.signMessage(`ARCIRCLE Orders: show my orders\n${w}\nuntil ${until}`);
      store.set(viewKey(w), { until, sig });
      await loadMine(); mineView(); bookView(); draw();
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; form(); }
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
        await post({ action: "ordercancel", token: o.token.address, hash: h, sig });
        S.msg = { k: "ok", t: "Order cancelled." };
      }
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook()]);
    bookView(); form(); mineView(); market(); draw();
  }
  async function cancelMarketAll() {
    try {
      const s = await signer(), w = me(), at = now();
      const sig = await s.signMessage(`Cancel all my ARCIRCLE orders in ${S.t}\n${w}\n${at}`);
      const j = await post({ action: "ordercancelall", token: S.t, maker: w, at, sig });
      S.msg = { k: "ok", html: `${T("Cancelled your orders in this market:")} <b data-no-i18n>${j.cancelled}</b>` };
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook()]);
    bookView(); form(); mineView(); market(); draw();
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
    bookView(); form(); mineView(); market(); draw();
  }
  function edit(h) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    if (lc(o.token.address) !== S.t) { open(o.token.address).then(() => edit(h)); return; }
    S.type = "limit"; S.side = o.side;
    const tok = human(o.side === "sell" ? BigInt(o.sellAmount) - BigInt(o.filled || 0) : BigInt(o.remainingToken || 0), S.tok.decimals);
    F.price = dstr(o.price); F.amount = dstr(tok, Math.min(8, S.tok.decimals)); syncTotal("amount");
    S.editing = { hash: o.hash, token: o.token.address, rem: BigInt(o.order ? BigInt(o.order.sellAmount) - BigInt(o.filled || 0) : 0n) };
    S.msg = null; form();
    if (innerWidth <= 720) sheet(true); else $("aor-formc").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
  /// a share card for a filled order
  function shareImg(h) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    const tk = o.token, q = o.quote, cv = document.createElement("canvas"); cv.width = 1200; cv.height = 630;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, "#071019"); bg.addColorStop(1, "#0b1f24"); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    g.strokeStyle = "rgba(77,212,255,.35)"; g.lineWidth = 2; g.strokeRect(30, 30, 1140, 570);
    const up = o.side === "buy";
    g.fillStyle = "#4dd4ff"; g.font = "700 30px Sora, sans-serif"; g.fillText("ARCIRCLE Orders", 80, 110);
    g.fillStyle = up ? "#39ff88" : "#ff6e5a"; g.font = "800 84px Sora, sans-serif"; g.fillText(`${up ? "Bought" : "Sold"} $${tk.symbol}`, 80, 250);
    const amt = o.side === "sell" ? human(o.filled, tk.decimals) : human(BigInt(o.buyAmount) * BigInt(Math.round(o.filledPct * 100)) / 10000n, tk.decimals) / (1 - FEE);
    g.fillStyle = "#eef3f7"; g.font = "600 44px Inter, sans-serif"; g.fillText(`${num(amt)} $${tk.symbol} at ${fp(o.price)} ${q.symbol}`, 80, 340);
    g.fillStyle = "#9fb0bd"; g.font = "500 30px Inter, sans-serif"; g.fillText(`${TYPE_NAME[o.type] || "Limit"} order · ${o.filledPct}% filled · ${new Date((o.last || o.at) * 1000).toLocaleDateString()}`, 80, 400);
    g.fillStyle = "#6f7e8a"; g.font = "500 24px Inter, sans-serif"; g.fillText("arcircle.app/arc#orders · signed in the wallet, filled on Arc · not financial advice", 80, 560);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `arcircle-orders-${(tk.symbol || "fill").toLowerCase()}.png`, { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { /* fall back to a download */ }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, "image/png");
  }

  // ---------------- notifications ----------------
  /// between two reads of my orders: what filled, triggered or got cancelled with its pair
  function diffMine(prev, next) {
    if (!prev || !next) return;
    const before = new Map((prev.orders || []).map((o) => [o.hash, o]));
    S.pulse = new Set();
    for (const o of next.orders || []) {
      const b = before.get(o.hash); if (!b) continue;
      const sym = "$" + ((o.token && o.token.symbol) || "?");
      let msg = null;
      if ((o.filledPct || 0) > (b.filledPct || 0)) msg = `${tr(o.status === "filled" ? "Filled" : "Part filled")}: ${tr(o.side === "buy" ? "Buy" : "Sell")} ${sym} · ${o.filledPct}%`;
      else if (o.status === "cancelled" && b.status !== "cancelled" && o.note === "oco") msg = `${sym}: ${tr("the other leg was cancelled — its pair filled")}`;
      else if (o.trail && o.trail.armed && !(b.trail && b.trail.armed)) msg = `${sym}: ${tr("trailing stop triggered — selling")}`;
      if (msg) { S.pulse.add(o.hash); toast(msg, "fill"); notify("ARCIRCLE Orders", msg); }
    }
  }
  function toast(text, kind = "") {
    let box = $("aor-toasts");
    if (!box) { box = document.createElement("div"); box.id = "aor-toasts"; box.className = "aor-toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "aor-toast " + kind; t.innerHTML = `<i></i><span data-no-i18n>${esc(text)}</span>`;
    box.appendChild(t); setTimeout(() => t.classList.add("out"), 6000); setTimeout(() => t.remove(), 6600);
  }
  function notify(title, body) {
    if (!notifyOn() || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    try { new Notification(title, { body, icon: "/images/arcircle-mark-sm.png" }); } catch { /* fine */ }
  }

  // ---------------- phones: the buy / sell sheet ----------------
  function sheet(on) {
    S.sheet = !!on;
    panel.classList.toggle("aor-sheet-open", S.sheet);
    const sc = $("aor-scrim"); if (sc) sc.hidden = !S.sheet;
    document.documentElement.classList.toggle("aor-noscroll", S.sheet);
  }

  // ---------------- events ----------------
  function setPct(pct) {
    S.pct = pct;
    const buy = S.side === "buy";
    const sellTok = buy ? S.quote : S.tok;
    const bal = sellTok && S.bal[sellTok.address];
    if (bal == null) { form(); return; }
    const part = (bal * BigInt(pct)) / 100n;
    if (S.type === "market" || S.type === "twap") { if (buy) F.total = ethers.formatUnits(part, S.quote.decimals); else F.amount = ethers.formatUnits(part, S.tok.decimals); }
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
    if (id === "aor-pool") { S.pi = Number(e.target.value) || 0; S.spot = pool().price; S.candles = null; S.tax = null; Promise.all([loadSpot(), loadCandles()]).then(() => { market(); bookView(); chartView(); form(); loadTax().then(() => { market(); form(); }); }); return; }
    if (id === "aor-prec") { S.prec = Number(e.target.value) || 0; S.prevLevels = new Map(); bookView(); if (S.center === "depth") chartView(); return; }
    if (id === "aor-exp") { F.expiry = e.target.value; return; }
    if (id === "aor-dur" || id === "aor-parts") { F[id === "aor-dur" ? "dur" : "parts"] = e.target.value; const s = $("aor-sum"); if (s) s.innerHTML = summary(); return; }
    if (id === "aor-slip") { F.slip = e.target.value; const s = $("aor-sum"); if (s) s.innerHTML = summary(); return; }
    if (id === "aor-approvemore") { F.approveMore = e.target.checked; store.set("arcircle.orders.approvemore", F.approveMore); return; }
    if (id === "aor-notify") {
      store.set(NK, e.target.checked);
      if (e.target.checked && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      return;
    }
    if (id === "aor-slider") {
      if (e.type !== "input") return;
      e.target.style.setProperty("--v", e.target.value + "%");
      clearTimeout(S.slT); const v = Number(e.target.value); S.slT = setTimeout(() => setPct(v), 60);
      return;
    }
    const map = { "aor-price": "price", "aor-amount": "amount", "aor-total": "total", "aor-trigger": "trigger", "aor-tp": "tp", "aor-sl": "sl", "aor-floor": "floor", "aor-cap": "cap" };
    if (!map[id] || e.type !== "input") return;
    F[map[id]] = e.target.value;
    if (map[id] === "amount" || map[id] === "total") S.pct = 0;
    syncTotal(map[id]);
    if (S.type === "limit") { if (map[id] !== "total" && $("aor-total")) $("aor-total").value = F.total; if (map[id] === "total" && $("aor-amount")) $("aor-amount").value = F.amount; }
    const s = $("aor-sum"); if (s) s.innerHTML = summary();
    requote();
  }
  function onClick(e) {
    const b = e.target.closest("button, a"); if (!b || !panel.contains(b)) return;
    const d = b.dataset;
    if (d.t && b.tagName === "BUTTON") { open(d.t); if (S.showMarkets) { S.showMarkets = false; marketsView(); } return; }
    if (d.setside) { S.side = d.setside; S.msg = null; form(); requote(); return; }
    if (d.sheet) { S.side = d.sheet; if (sellOnly(S.type) && d.sheet === "buy") S.type = "limit"; form(); sheet(true); return; }
    if (d.type) { S.type = d.type; S.msg = null; if (sellOnly(S.type)) S.side = "sell"; form(); requote(); return; }
    if (d.pct) { setPct(Number(d.pct)); return; }
    if (d.quick) {
      const k = Number(d.k), base = S.spot;
      if (!base) return;
      const v = dstr(Number((base * (1 + k / 100)).toPrecision(4))); // four significant figures, like the book
      F[d.quick] = v; if (d.quick === "price") syncTotal("price");
      form(); return;
    }
    if (d.trailpct) { F.trail = d.trailpct; F.floor = ""; form(); return; }
    if (d.price) {
      F.price = dstr(Number(d.price)); if (S.type !== "limit") S.type = "limit";
      if (d.sug) S.side = d.sug;
      syncTotal("price"); form();
      if (innerWidth <= 720) sheet(true); else if (innerWidth <= 1200) $("aor-formc").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
      return;
    }
    if (d.left) { S.left = d.left; seg("left", d.left); bookView(); return; }
    if (d.center) { S.center = d.center; seg("center", d.center); chartView(); return; }
    if (d.tf) { S.tf = Number(d.tf); panel.querySelectorAll("[data-tf]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.tf) === S.tf))); draw(); return; }
    if (d.my) { S.myTab = d.my; seg("my", d.my); mineView(); return; }
    if (d.scope) { S.myScope = d.scope; panel.querySelectorAll("[data-scope]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.scope === S.myScope))); mineView(); return; }
    if (d.mt) {
      seg("mt", d.mt); $("aor-grid").dataset.mt = d.mt;
      if (d.mt === "trades" || d.mt === "book") { S.left = d.mt; seg("left", d.mt); bookView(); } else draw();
      return;
    }
    if (d.alertdel != null) { const list = alertsFor(S.t), x = list[Number(d.alertdel)]; store.set(AK, alertsAll().filter((a) => a !== x && !(a.t === x.t && a.price === x.price && a.dir === x.dir))); market(); return; }
    const act = d.act;
    if (act === "markets") { S.showMarkets = !S.showMarkets; marketsView(); if (S.showMarkets) loadMarkets(); return; }
    if (act === "alerts") { S.alertsOpen = !S.alertsOpen; market(); if (S.alertsOpen && $("aor-al-price")) $("aor-al-price").focus(); return; }
    if (act === "alertadd") {
      const v = Number(String(($("aor-al-price") || {}).value || "").replace(/,/g, ""));
      if (!(v > 0) || !S.spot) return;
      store.set(AK, [...alertsAll(), { t: S.t, sym: S.tok.symbol, price: v, dir: v >= S.spot ? "up" : "down" }].slice(-30));
      if ("Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      market(); return;
    }
    if (act === "connect") { (async () => { try { await signer(); } catch (err) { S.msg = { k: "bad", t: errText(err) }; } await Promise.all([loadBal(), loadMine()]); form(); mineView(); bookView(); })(); return; }
    if (act === "submit") { submit(); return; }
    if (act === "unlock") { unlock(); return; }
    if (act === "sheetclose") { sheet(false); return; }
    if (act === "editcancel") { S.editing = null; form(); return; }
    if (act === "cancel" || act === "cancelchain" || act === "edit" || act === "share") {
      const r = b.closest("[data-h]"); if (!r) return;
      if (act === "edit") edit(r.dataset.h); else if (act === "share") shareImg(r.dataset.h); else cancel(r.dataset.h, act === "cancelchain");
      return;
    }
    if (act === "cancelmarket") { cancelMarketAll(); return; }
    if (act === "cancelall") { cancelAll(); return; }
  }
  document.addEventListener("click", (e) => { if (S.sheet && e.target && e.target.id === "aor-scrim") sheet(false); });

  // ---------------- boot ----------------
  async function tick(n) {
    if (!panel.classList.contains("active") || document.hidden) return;
    const acct = me();
    if (acct !== S.acct) { S.acct = acct; await Promise.all([loadBal(), loadMine()]); form(); mineView(); }
    if (!S.tok) return;
    await loadBook();
    if (n % 2 === 0) { await loadSpot(); checkAlerts(); }
    if (n % 3 === 0 && acct) { await Promise.all([loadMine(), loadBal()]); mineView(); if (!S.busy && !panel.querySelector(".aor-formc input:focus")) form(); }
    if (n % 6 === 0) { await Promise.all([loadCandles(), loadStatus()]); }
    if (n % 12 === 0) loadMarkets();
    market(); bookView(); draw();
    if (S.center === "depth") chartView();
  }
  function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      loadMarkets(); loadStatus().then(market);
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      open(m ? m[1] : ARCIRCLE());
      S.acct = me(); loadMine().then(mineView);
    }
    clearInterval(S.timer);
    let n = 0;
    S.timer = setInterval(() => tick(++n), 5000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") show(); else { clearInterval(S.timer); if (S.sheet) sheet(false); } });
  window.addEventListener("hashchange", () => { const m = /^#orders\?t=(0x[0-9a-fA-F]{40})/.exec(location.hash); if (m && S.booted && lc(m[1]) !== S.t) open(m[1]); });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); if (S.t) { market(); bookView(); form(); } } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcOrders = { open, state: S, form: F, lang };
})();
