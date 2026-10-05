/* global CONFIG */
// arc-orders-sol.js — ARCIRCLE Orders on Solana: the third side of the Orders page's chain switch (arc-orders.js hands
// this module its body when Solana is picked). The program is solana/arcircle-orders; the server side api/_orders-sol.mjs.
//   · limit   "buy N tokens at P SOL" / "sell N tokens for at least P SOL each". Nothing is deposited: the order is a
//             program account, and the program's delegate may move exactly the order's amount out of the wallet
//             (wrapped SOL for a buy, the token for a sell). The ARCIRCLE keeper fills it through Jupiter once the market
//             reaches the price — the program itself checks the owner gets at least their price.
//   · market  a Jupiter swap from the wallet
//   v8 — order types the keeper waits for (api/_orders-sol-cond.mjs); each is still a program order with its floor:
//   · stop    sell when the price falls to a trigger (or buy when it rises to it), down to your worst price
//   · tpsl    one sell, two exits: take profit or stop the loss
//   · trail   a sell that follows the price up and fills once it drops your trail below the highest price seen
//   · dca     Timed: a buy (or sell) split into steps, one every interval, never above (below) your price cap
//   · grad    a Pump.fun coin: when its bonding curve completes
//   · curve   a Pump.fun coin: when its curve reaches a mark
//   · Start after (Launch guard): any order can wait N minutes before it may fill
//   The condition is a message you sign in your wallet (no fee) before the order is placed.
// 0.1% of the SOL side goes to the ARCIRCLE PAD treasury. Orders can be cancelled any time (their rent comes back).
(function () {
  "use strict";
  const C = (typeof CONFIG !== "undefined" && CONFIG.ORDERS_SOL) || {};
  const PUMP = (typeof CONFIG !== "undefined" && CONFIG.PUMP) || {};
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const L3 = (en, ko, zh) => { const l = (window.arcI18n && window.arcI18n.get()) || "en"; return l === "ko" ? ko : l === "zh" ? zh : en; };
  const isMint = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${String(a).slice(0, 4)}…${String(a).slice(-4)}` : "—");
  const API = "/api/social";
  const SCAN = (k, x) => `${C.EXPLORER || "https://solscan.io"}/${k}/${x}`;
  const PROGRAM = String(C.PROGRAM || "");
  const LIVE = () => isMint(PROGRAM) && S.status && S.status.live;
  const W = () => window.arcSol || null;
  const LAMPORTS = 1e9;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const KEY = "arcircle.orders.sol.mint";
  // the coin each market opens on first: the last one, else ArcPad's first Pump.fun coin
  const S = { root: null, mint: null, book: null, markets: [], mine: null, status: null, side: "buy", type: "limit", msg: null, busy: false, timer: null, bal: null, quote: null, tab: "open", more: false, auth: "" };
  const F = { price: "", amount: "", total: "", spend: "", expiry: "0", trig: "", tp: "", sl: "", trail: "8", slip: "5", steps: "4", every: "3600", cap: "", start: "0", curve: "80" };
  // v8: the types (Limit and Market up front, the rest under More), and what each one is for
  const TYPES = [["limit", "Limit"], ["market", "Market"], ["stop", "Stop"], ["tpsl", "TP / SL"], ["trail", "Trailing stop"], ["dca", "Timed (DCA)"], ["grad", "At graduation"], ["curve", "Curve mark"]];
  const TYPE_TAG = { stop: "Trigger, then fill down to your worst price", tpsl: "Profit and stop together, one order", trail: "Follows the price up", dca: "Equal steps over time", grad: "Pump.fun: when the curve completes", curve: "Pump.fun: when the curve reaches a mark" };
  const SELL_ONLY = ["tpsl", "trail"], PUMP_ONLY = ["grad", "curve"];
  const HEAD = "ARCIRCLE Orders on Solana — order conditions"; // api/_orders-sol-cond.mjs: the message the owner signs

  // ---------------- numbers ----------------
  function fp(p) {
    if (p == null || !isFinite(p) || p <= 0) return "—";
    if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const d = Math.min(14, -Math.floor(Math.log10(p)) + 3);
    return p.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
  }
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }));
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n < 0.01 ? fp(n) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const pc = (n) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2) + "%");
  const solS = (lam, d = 4) => (Number(lam) / LAMPORTS).toLocaleString("en-US", { maximumFractionDigits: d });
  /// a decimal string → raw units (BigInt), extra decimals cut
  function units(v, dec) {
    const s = String(v == null ? "" : v).trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
    const [i, f = ""] = s.split(".");
    const r = BigInt((i || "0") + (f + "0".repeat(dec)).slice(0, dec));
    return r > 0n ? r : null;
  }
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };

  // ---------------- the kit, the RPC, the wallet ----------------
  let kitP = null, connP = null, Oc = null;
  function kit() {
    if (window.ArcPumpKit) return Promise.resolve(window.ArcPumpKit);
    if (kitP) return kitP;
    kitP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = PUMP.KIT || "/vendor/pump-kit.js"; s.async = true;
      s.onload = () => (window.ArcPumpKit ? res(window.ArcPumpKit) : rej(new Error("the Solana kit didn't load")));
      s.onerror = () => { kitP = null; rej(new Error(tr("Couldn't load the Solana kit — check your connection and try again."))); };
      document.head.appendChild(s);
    });
    return kitP;
  }
  const conn = () => (connP = connP || kit().then((K) => new K.Connection(new URL(PUMP.RPC || "/api/social?solrpc=1", location.origin).href, { commitment: "confirmed", disableRetryOnRateLimit: true })));
  const ord = async () => { const K = await kit(); return (Oc = Oc || K.orders(PROGRAM)); };
  const me = () => (W() && W().key) || "";
  async function needWallet() {
    const w = W();
    if (!w) throw new Error(tr("Solana wallets aren't available on this page."));
    if (w.key) return w.key;
    if (await w.quiet()) return w.key;
    const list = w.providers();
    if (!list.length) throw new Error(tr("No Solana wallet found — open this page in Phantom, Solflare or MetaMask."));
    await w.connect(0);
    return w.key;
  }
  async function sign(txs) {
    const p = W() && W().p;
    if (!p) throw new Error(tr("Connect a Solana wallet first."));
    if (typeof p.signAllTransactions === "function") return p.signAllTransactions(txs);
    const out = []; for (const t of txs) out.push(await p.signTransaction(t)); return out;
  }
  const raw = (t) => (typeof t.serialize === "function" ? t.serialize() : t);
  async function sendAndConfirm(signed, lastValid) {
    const c = await conn();
    const bytes = raw(signed);
    const sig = await c.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 });
    for (let i = 0; i < 90; i++) {
      await sleep(i < 4 ? 1200 : 2000);
      const st = await c.getSignatureStatuses([sig]).then((r) => r && r.value && r.value[0]).catch(() => null);
      if (st && st.err) throw Object.assign(new Error(tr("The transaction failed on Solana.")), { sig, logs: [JSON.stringify(st.err)] });
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
      if (i % 3 === 2) {
        const h = await c.getBlockHeight("confirmed").catch(() => null);
        if (h != null && lastValid && h > lastValid) throw Object.assign(new Error(tr("The transaction expired before it landed — try again.")), { sig });
        c.sendRawTransaction(bytes, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
      }
    }
    throw Object.assign(new Error(tr("Not confirmed yet — check it on Solscan.")), { sig });
  }
  const ERR = {
    6001: "Orders are paused for a moment.", 6005: "Above the per-order cap.", 6006: "That expiry is already past.", 6009: "Approve the order's amount first.",
    6010: "Not enough balance for this order.",
  };
  function why(e) {
    if (!e) return "";
    if (e.code === 4001 || /reject|denied|cancel/i.test(String(e.message || ""))) return tr("Cancelled in your wallet.");
    const logs = (e.logs || e.transactionLogs || []).join("\n"), m = String(e.message || e);
    const am = /Error Number: (\d+)\. Error Message: ([^\n.]+)/.exec(logs + "\n" + m);
    if (am) return tr(ERR[am[1]] || am[2]);
    const cu = /"Custom":(\d+)|custom program error: 0x([0-9a-f]+)/i.exec(logs + "\n" + m);
    if (cu) { const n = cu[1] ? Number(cu[1]) : parseInt(cu[2], 16); if (ERR[n]) return tr(ERR[n]); if (n === 1) return tr("Not enough SOL for this and the network fee."); }
    if (/insufficient lamports|insufficient funds|Attempt to debit/i.test(logs + m)) return tr("Not enough SOL for this and the network fee.");
    return m.slice(0, 200);
  }

  // ---------------- reads ----------------
  const get = (q) => fetch(`${API}?${q}&chain=sol`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  async function loadStatus() { S.status = await get("orders=status"); }
  async function loadMarkets() { const j = await get("orders=markets"); S.markets = (j && j.markets) || []; }
  async function loadBook() { if (!S.mint) return; const j = await get(`orders=book&token=${S.mint}`); if (j && j.mint === S.mint) S.book = j; }
  async function loadMine() { const a = me(); if (!a) { S.mine = null; return; } const j = await get(`orders=mine&wallet=${a}`); if (j && j.wallet === a) S.mine = j; }
  /// SOL, wSOL, the token (and the token account's address and program)
  async function loadBal() {
    const a = me();
    if (!a || !S.book) { S.bal = null; return; }
    try {
      const K = await kit(), c = await conn(), owner = new K.PublicKey(a);
      const TP = new K.PublicKey(S.book.tokenProgram), mint = new K.PublicKey(S.mint);
      const wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true), tAta = K.spl.getAssociatedTokenAddressSync(mint, owner, true, TP);
      const [sol, accs] = await Promise.all([c.getBalance(owner), c.getMultipleAccountsInfo([wAta, tAta])]);
      const un = (info, addr, prog) => { try { return info ? K.spl.unpackAccount(addr, info, prog) : null; } catch { return null; } };
      S.bal = { sol, wsol: un(accs[0], wAta, K.TOKEN_PROGRAM_ID), tok: un(accs[1], tAta, TP), wAta: wAta.toBase58(), tAta: tAta.toBase58() };
      if (LIVE() && !S.auth) { try { S.auth = (await ord()).authPda.toBase58(); } catch { /* later */ } }
    } catch { S.bal = null; }
  }

  // ---------------- render ----------------
  function mount(root) {
    S.root = root;
    root.innerHTML = `
      <div class="ams-preview aor-preview" id="aos-preview" hidden></div>
      <div class="ams-card aor-bar aos-bar">
        <div class="aos-wallet" id="aos-wallet"></div>
        <div class="aor-pickrow">
          <form class="aor-pick" id="aos-form" autocomplete="off">
<span class="aor-q"><input id="aos-in" type="text" spellcheck="false" placeholder="${T("Paste a Solana token address (mint)")}" aria-label="${T("Solana token address")}"><button type="button" class="aor-qx" data-qx aria-label="${T("Clear")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>
            <button type="submit" class="aor-btn go aor-openbtn" aria-label="${T("Open market")}"><span>${T("Open market")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
          </form>
        </div>
        <div class="aor-chips" id="aos-chips"></div>
        <div class="aos-mkt" id="aos-mkt"></div>
      </div>
      <div class="aos-grid">
        <section class="ams-card aos-bookc"><div class="aos-h"><b>${T("Open orders on this market")}</b><small>${T("Price in SOL")}</small></div><div id="aos-book" class="aos-book"></div></section>
        <section class="ams-card aos-formc" id="aos-formc" aria-label="${T("Place an order")}"></section>
      </div>
      <section class="ams-card aor-mine aos-mine">
        <div class="aor-mine-h"><div class="aor-seg" role="tablist"><button type="button" data-aos-tab="open" aria-selected="${S.tab === "open"}">${T("Open orders")} <em id="aos-n-open" data-no-i18n></em></button><button type="button" data-aos-tab="history" aria-selected="${S.tab === "history"}">${T("History")}</button></div>
          <span class="aor-mine-acts"><button type="button" class="aor-btn sm ghost" data-aos="unwrap" id="aos-unwrap" hidden>${T("Unwrap SOL")}</button></span></div>
        <div id="aos-mine"></div>
      </section>
      <p class="aos-note">${T("Orders stay in your wallet until they fill: the order is an account on Solana, and the program may move only its amount. The ARCIRCLE keeper fills it through Jupiter once the market reaches your price — the program checks you get at least your price, or nothing moves. 0.1% of the SOL side goes to ARCIRCLE PAD. New and unaudited — start small.")}</p>`;
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    $("aos-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("aos-in").value.trim(); if (isMint(v)) open(v); });
    $("aos-in").addEventListener("paste", () => setTimeout(() => { const v = $("aos-in").value.trim(); if (isMint(v)) open(v); }, 0));
    $("aos-form").addEventListener("click", (e) => { if (!e.target.closest("[data-qx]")) return; const i = $("aos-in"); i.value = ""; i.focus(); });
    paintAll();
    boot();
  }
  async function boot() {
    await Promise.all([loadStatus(), loadMarkets()]);
    let m = (/[?&]t=([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(location.hash) || [])[1];
    if (!m) { try { m = localStorage.getItem(KEY) || ""; } catch { m = ""; } }
    if (!isMint(m)) m = (S.markets[0] && S.markets[0].mint) || "";
    paintAll();
    if (isMint(m)) open(m);
    if (W() && !W().key) W().quiet();
    start();
  }
  function start() { clearInterval(S.timer); let n = 0; S.timer = setInterval(() => { if (!S.root || !document.body.contains(S.root)) { clearInterval(S.timer); return; } refresh(++n); }, 5000); }
  async function refresh(n) {
    await loadBook();
    if (n % 2 === 0) { await Promise.all([loadMine(), loadBal()]); mineView(); }
    if (n % 12 === 0) { await Promise.all([loadStatus(), loadMarkets()]); chips(); }
    marketView(); bookView(); if (!S.busy && !S.root.querySelector(".aos-formc input:focus")) formView();
  }
  async function open(mint) {
    mint = String(mint || "").trim();
    if (!isMint(mint)) return;
    S.mint = mint; S.book = null; S.bal = null; S.quote = null; S.msg = null; F.price = ""; F.amount = ""; F.total = ""; F.spend = "";
    try { localStorage.setItem(KEY, mint); } catch { /* fine */ }
    if (history.replaceState && /^#orders/.test(location.hash)) history.replaceState(null, "", `${location.pathname}${location.search}#orders?c=sol&t=${mint}`);
    paintAll();
    await loadBook();
    if (S.book && S.book.priceSol && !F.price) F.price = fp(S.book.priceSol);
    await Promise.all([loadMine(), loadBal()]);
    paintAll();
  }
  function paintAll() { previewView(); walletView(); chips(); marketView(); bookView(); formView(); mineView(); }
  function previewView() {
    const el = $("aos-preview"); if (!el) return;
    el.hidden = !!LIVE();
    el.innerHTML = `<i class="ams-preview-ico"></i><div><b>${T("Preview — ARCIRCLE Orders opens on Solana once its program is live")}</b><span>${T("You can browse markets and prices now; placing orders turns on with the program.")}</span></div>`;
  }
  function walletView() {
    const el = $("aos-wallet"); if (!el) return;
    const w = W();
    if (w && w.key) {
      el.innerHTML = `<i class="on" aria-hidden="true"></i><span><small>${T("Solana wallet")} · ${esc(w.name)}</small><b data-no-i18n>${esc(short(w.key))}</b></span>${S.bal ? `<span class="aos-sol" data-no-i18n>${solS(S.bal.sol)} SOL</span>` : ""}`;
    } else {
      el.innerHTML = `<i aria-hidden="true"></i><span><small>${T("Solana wallet")}</small><b>${T("Not connected")}</b></span><button type="button" class="aor-btn sm" data-aos="connect">${T("Connect")}</button>`;
    }
  }
  function chips() {
    const el = $("aos-chips"); if (!el) return;
    el.innerHTML = S.markets.slice(0, 12).map((m) => `<button type="button" class="aor-chip${m.mint === S.mint ? " on" : ""}" data-aos-mint="${esc(m.mint)}"><span data-no-i18n>$${esc(m.symbol || short(m.mint))}</span>${m.open ? `<em data-no-i18n>${m.open}</em>` : ""}${m.arcpad ? `<i class="aos-pf">Pump.fun</i>` : ""}</button>`).join("");
  }
  function marketView() {
    const el = $("aos-mkt"); if (!el) return;
    const b = S.book;
    if (!S.mint) { el.innerHTML = `<p class="aos-empty">${T("Paste a token's mint address, or pick a market above.")}</p>`; return; }
    if (!b) { el.innerHTML = `<p class="aos-empty">${T("Reading the market…")}</p>`; return; }
    if (b.error) { el.innerHTML = `<p class="aos-empty bad">${T("That isn't a token on Solana.")}</p>`; return; }
    const ch = b.change24h;
    el.innerHTML = `<div class="aos-pair">${b.image ? `<img src="${esc(b.image)}" alt="" onerror="this.remove()">` : ""}<div><b data-no-i18n>$${esc(b.symbol || short(b.mint))} <small>/ SOL</small></b><span data-no-i18n>${esc(b.name || "")} · <a href="${esc(SCAN("token", b.mint))}" target="_blank" rel="noopener">${esc(short(b.mint))} ↗</a></span></div></div>
      <div class="aos-stats"><div><small>${T("Price")}</small><b data-no-i18n>${fp(b.priceSol)} SOL</b><span data-no-i18n>${usd(b.priceUsd)}</span></div>
        <div><small>24h</small><b class="${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${pc(ch)}</b></div>
        <div><small>${T("Liquidity")}</small><b data-no-i18n>${usd(b.liqUsd)}</b></div>
        <div><small>${T("Open orders")}</small><b data-no-i18n>${b.open || 0}</b></div>
        ${b.pair ? `<a class="aor-btn sm ghost" href="https://dexscreener.com/solana/${esc(b.pair)}" target="_blank" rel="noopener" data-no-i18n>Dexscreener ↗</a>` : ""}</div>
      ${b.pump ? (b.pump.phase === "curve"
        ? `<div class="aos-curve" title="${T("Orders keep working when it graduates: the keeper fills through Jupiter, which routes the bonding curve and, after it, the coin's pool.")}"><span><b>${T("Pump.fun bonding curve")}</b> <em data-no-i18n>${b.pump.progress != null ? b.pump.progress + "%" : ""}</em></span><i style="--p:${Math.max(2, Math.min(100, b.pump.progress || 0))}%"></i><small>${T("Orders keep working when it graduates.")}</small></div>`
        : `<div class="aos-curve done"><span><b>${T("Graduated")}</b></span><small>${T("It left the Pump.fun curve — orders fill through its pool now.")}</small></div>`) : ""}`;
  }
  function bookView() {
    const el = $("aos-book"); if (!el) return;
    const b = S.book;
    if (!b || b.error) { el.innerHTML = ""; return; }
    const row = (x, side) => `<div class="aos-lv ${side}" data-aos-price="${x.price}"><span data-no-i18n>${fp(x.price)}</span><span data-no-i18n>${num(x.tokens)}</span><span data-no-i18n>${num(x.sol)} SOL</span></div>`;
    const asks = (b.asks || []).slice().reverse(), bids = b.bids || [];
    el.innerHTML = `<div class="aos-lv hd"><span>${T("Price")}</span><span>${T("Tokens")}</span><span>${T("Total")}</span></div>
      ${asks.length ? asks.map((x) => row(x, "ask")).join("") : `<div class="aos-lv none">${T("No sell orders")}</div>`}
      <div class="aos-spot" data-no-i18n>${fp(b.priceSol)} SOL <small>${T("market")}</small></div>
      ${bids.length ? bids.map((x) => row(x, "bid")).join("") : `<div class="aos-lv none">${T("No buy orders")}</div>`}
      ${b.conditional ? `<p class="aos-cond-n">${T("Waiting for a condition (stop, TP / SL, trailing, timed, curve):")} <b data-no-i18n>${b.conditional}</b></p>` : ""}`;
  }

  // ---------------- the form ----------------
  const fee = () => ((S.book && S.book.feeBps) || 10) / 10000;
  const nOf = (v) => Number(String(v == null ? "" : v).replace(/,/g, ""));
  const lamOf = (sol) => BigInt(Math.max(0, Math.round(sol * LAMPORTS)));
  /// the form → the orders to place: [{ side, amountIn, minOut, cond? }] plus a summary, or { why }
  function build() {
    const b = S.book; if (!b || b.error) return { why: "" };
    const dec = b.decimals, buy = S.side === "buy", t = S.type, now = Math.floor(Date.now() / 1000);
    const slip = Math.min(50, Math.max(0.5, nOf(F.slip) || 5)) / 100;
    const startAfter = Number(F.start) > 0 ? now + Number(F.start) : 0;
    const withStart = (c) => (startAfter ? { ...c, notBefore: startAfter } : c);
    const tokUnits = () => units(F.amount, dec);
    if (t === "limit") {
      const p = nOf(F.price), n = tokUnits();
      if (!(p > 0)) return { why: tr("Set a price.") };
      if (!n) return { why: tr("Set an amount.") };
      const tokens = Number(n) / 10 ** dec;
      const o = buy ? { side: "buy", amountIn: BigInt(Math.ceil(((p * tokens) / (1 - fee())) * LAMPORTS)), minOut: n } : { side: "sell", amountIn: n, minOut: lamOf(p * tokens) };
      if (o.minOut <= 0n || o.amountIn <= 0n) return { why: tr("That's less than one lamport.") };
      if (startAfter) o.cond = { kind: "time", notBefore: startAfter };
      return { orders: [o], tokens, sol: Number(buy ? o.amountIn : o.minOut) / LAMPORTS, worst: p };
    }
    if (t === "stop") {
      const trig = nOf(F.trig), n = tokUnits();
      if (!(trig > 0)) return { why: tr("Set the trigger price.") };
      if (!n) return { why: tr("Set an amount.") };
      const tokens = Number(n) / 10 ** dec, worst = buy ? trig * (1 + slip) : trig * (1 - slip);
      const o = buy ? { side: "buy", amountIn: BigInt(Math.ceil(((worst * tokens) / (1 - fee())) * LAMPORTS)), minOut: n } : { side: "sell", amountIn: n, minOut: lamOf(worst * tokens) };
      if (o.minOut <= 0n) return { why: tr("That's less than one lamport.") };
      o.cond = withStart({ kind: "stop", trig });
      return { orders: [o], tokens, sol: Number(buy ? o.amountIn : o.minOut) / LAMPORTS, worst, trig };
    }
    if (t === "tpsl") {
      const tp = nOf(F.tp), sl = nOf(F.sl), n = tokUnits();
      if (!(tp > 0) || !(sl > 0)) return { why: tr("Set take profit and stop loss.") };
      if (!(tp > sl)) return { why: tr("Take profit must be above the stop loss.") };
      if (!n) return { why: tr("Set an amount.") };
      const tokens = Number(n) / 10 ** dec, worst = sl * (1 - slip);
      const o = { side: "sell", amountIn: n, minOut: lamOf(worst * tokens), cond: withStart({ kind: "tpsl", tp, sl }) };
      if (o.minOut <= 0n) return { why: tr("That's less than one lamport.") };
      return { orders: [o], tokens, sol: Number(o.minOut) / LAMPORTS, worst, tp, sl };
    }
    if (t === "trail") {
      const tr8 = nOf(F.trail), n = tokUnits(), hi = b.priceSol;
      if (!(tr8 >= 0.5 && tr8 <= 50)) return { why: tr("Set a trail between 0.5% and 50%.") };
      if (!hi) return { why: tr("No market price yet.") };
      if (!n) return { why: tr("Set an amount.") };
      const tokens = Number(n) / 10 ** dec, worst = hi * (1 - tr8 / 100) * (1 - slip);
      const o = { side: "sell", amountIn: n, minOut: lamOf(worst * tokens), cond: withStart({ kind: "trail", trail: Math.round(tr8 * 100), hi }) };
      if (o.minOut <= 0n) return { why: tr("That's less than one lamport.") };
      return { orders: [o], tokens, worst, trailPct: tr8, hi };
    }
    if (t === "dca") {
      const steps = Math.max(2, Math.min(12, Math.round(nOf(F.steps)) || 4)), every = Number(F.every) || 3600, cap = nOf(F.cap);
      if (!(cap > 0)) return { why: tr(buy ? "Set the highest price you'd pay." : "Set the lowest price you'd take.") };
      const orders = [];
      if (buy) {
        const total = nOf(F.spend);
        if (!(total > 0)) return { why: tr("Set how much SOL to spend.") };
        const per = total / steps;
        for (let i = 0; i < steps; i++) orders.push({ side: "buy", amountIn: lamOf(per), minOut: BigInt(Math.floor(((per * (1 - fee())) / cap) * 10 ** dec)), cond: { kind: "time", notBefore: now + 30 + i * every } });
        if (orders.some((o) => o.minOut <= 0n)) return { why: tr("Each step is too small.") };
        return { orders, steps, every, per, total, cap };
      }
      const n = tokUnits();
      if (!n) return { why: tr("Set an amount.") };
      const per = n / BigInt(steps);
      if (per <= 0n) return { why: tr("Each step is too small.") };
      for (let i = 0; i < steps; i++) orders.push({ side: "sell", amountIn: per, minOut: lamOf((Number(per) / 10 ** dec) * cap), cond: { kind: "time", notBefore: now + 30 + i * every } });
      if (orders.some((o) => o.minOut <= 0n)) return { why: tr("Each step is too small.") };
      return { orders, steps, every, per: Number(per) / 10 ** dec, total: Number(n) / 10 ** dec, cap };
    }
    if (t === "grad" || t === "curve") {
      if (!b.pump) return { why: tr("Not a Pump.fun coin.") };
      if (b.pump.phase === "graduated") return { why: tr("This coin has already graduated — use a limit order.") };
      const cap = nOf(F.cap);
      if (!(cap > 0)) return { why: tr(buy ? "Set the highest price you'd pay." : "Set the lowest price you'd take.") };
      const cond = withStart(t === "grad" ? { kind: "grad" } : { kind: "curve", curve: Math.max(1, Math.min(99, Math.round(nOf(F.curve)) || 80)) });
      if (buy) {
        const spend = nOf(F.spend);
        if (!(spend > 0)) return { why: tr("Set how much SOL to spend.") };
        const o = { side: "buy", amountIn: lamOf(spend), minOut: BigInt(Math.floor(((spend * (1 - fee())) / cap) * 10 ** dec)), cond };
        if (o.minOut <= 0n) return { why: tr("That's less than one token.") };
        return { orders: [o], spend, cap };
      }
      const n = tokUnits();
      if (!n) return { why: tr("Set an amount.") };
      const o = { side: "sell", amountIn: n, minOut: lamOf((Number(n) / 10 ** dec) * cap), cond };
      if (o.minOut <= 0n) return { why: tr("That's less than one lamport.") };
      return { orders: [o], tokens: Number(n) / 10 ** dec, cap };
    }
    return { why: "" };
  }
  const EVERY = [["300", "5 min"], ["900", "15 min"], ["3600", "1 hour"], ["14400", "4 hours"], ["86400", "1 day"]];
  const START = [["0", "Now"], ["300", "5 min"], ["900", "15 min"], ["3600", "1 hour"], ["21600", "6 hours"]];
  const field = (id, label, val, hint = "", ph = "0.0") => `<label class="aos-f"><span>${T(label)}${hint ? ` <small>${hint}</small>` : ""}</span><input id="${id}" inputmode="decimal" value="${esc(val)}" placeholder="${ph}"></label>`;
  const pick = (id, label, val, opts) => `<label class="aos-f"><span>${T(label)}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${String(val) === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>`;
  function typeTabs() {
    const main = TYPES.slice(0, 2), more = TYPES.slice(2).filter(([k]) => !(PUMP_ONLY.includes(k) && !(S.book && S.book.pump && S.book.pump.phase === "curve")));
    const inMore = !["limit", "market"].includes(S.type);
    return `<div class="aos-typebar"><div class="aor-seg aos-types" role="tablist">${main.map(([k, l]) => `<button type="button" data-aos-type="${k}" aria-selected="${S.type === k}">${T(l)}</button>`).join("")}<button type="button" data-aos="more" aria-expanded="${!!S.more}" class="${inMore ? "on" : ""}">${inMore ? T(TYPES.find((x) => x[0] === S.type)[1]) : T("More")} ▾</button></div>
      ${S.more ? `<div class="aos-more" role="listbox">${more.map(([k, l]) => `<button type="button" data-aos-type="${k}" aria-selected="${S.type === k}"><b>${T(l)}</b><small>${T(TYPE_TAG[k] || "")}</small></button>`).join("")}</div>` : ""}</div>`;
  }
  function fieldsFor(buy, sym) {
    const t = S.type, px = S.book && S.book.priceSol;
    const pxHint = T("SOL per token");
    const amt = field("aos-amount", "Amount", F.amount, `<span data-no-i18n>${esc(sym)}</span>`, "0");
    const exp = pick("aos-exp", "Expires", F.expiry, [["0", "Never"], ["86400", "1 day"], ["604800", "7 days"], ["2592000", "30 days"]]);
    const start = pick("aos-start", "Start after", F.start, START);
    const slip = field("aos-slip", "Worst price", F.slip, T(buy ? "% above the trigger" : "% under the trigger"), "5");
    if (t === "limit") return field("aos-price", "Price", F.price, pxHint) + amt + `<div class="aos-two">${exp}${start}</div>`;
    if (t === "stop") return field("aos-trig", "Trigger price", F.trig, pxHint) + amt + `<div class="aos-two">${slip}${exp}</div>` + start;
    if (t === "tpsl") return `<div class="aos-two">${field("aos-tp", "Take profit", F.tp, pxHint)}${field("aos-sl", "Stop loss", F.sl, pxHint)}</div>` + amt + `<div class="aos-two">${field("aos-slip", "Worst price", F.slip, T("% under the stop loss"), "5")}${exp}</div>`;
    if (t === "trail") return field("aos-trail", "Trail", F.trail, T("% under the highest price"), "8") + amt + `<div class="aos-two">${field("aos-slip", "Worst price", F.slip, T("% under the trail"), "5")}${exp}</div>` + `<p class="aos-hint">${T("Starts from the market price now")}: <b data-no-i18n>${fp(px)} SOL</b></p>`;
    if (t === "dca") return (buy ? field("aos-spend", "Spend in total", F.spend, "SOL") : amt) + `<div class="aos-two">${field("aos-steps", "Steps", F.steps, "2–12", "4")}${pick("aos-every", "Every", F.every, EVERY)}</div>` + field("aos-cap", buy ? "Highest price" : "Lowest price", F.cap, pxHint);
    if (t === "grad" || t === "curve") return (t === "curve" ? field("aos-curve", "Curve mark", F.curve, "%", "80") : "") + (buy ? field("aos-spend", "Spend", F.spend, "SOL") : amt) + field("aos-cap", buy ? "Highest price" : "Lowest price", F.cap, pxHint) + start;
    return "";
  }
  function summary(o, buy, sym) {
    if (o.why != null) return `<p class="aos-hint">${esc(o.why)}</p>`;
    const row = (k, v) => `<div><span>${T(k)}</span><b data-no-i18n>${v}</b></div>`;
    const net = (sol) => `${solS(lamOf(sol), 6)} SOL`;
    const t = S.type, rows = [];
    if (t === "limit") { if (buy) { rows.push(row("You pay", net(o.sol)), row("You get at least", `${num(o.tokens)} ${esc(sym)}`)); } else { rows.push(row("You sell", `${num(o.tokens)} ${esc(sym)}`), row("You get at least", net(o.sol))); } }
    else if (t === "stop") rows.push(row("When the price", `${buy ? "≥" : "≤"} ${fp(o.trig)} SOL`), row(buy ? "You pay at most" : "You get at least", net(o.sol)), row(buy ? "You get" : "You sell", `${num(o.tokens)} ${esc(sym)}`));
    else if (t === "tpsl") rows.push(row("Take profit", `≥ ${fp(o.tp)} SOL`), row("Stop loss", `≤ ${fp(o.sl)} SOL`), row("You get at least", net(o.sol)));
    else if (t === "trail") rows.push(row("Fills after a drop of", `${o.trailPct}%`), row("Floor now", `${fp(o.worst)} SOL`));
    else if (t === "dca") rows.push(row("Steps", `${o.steps} × ${buy ? `${num(o.per)} SOL` : `${num(o.per)} ${esc(sym)}`}`), row("Every", T((EVERY.find((x) => x[0] === String(o.every)) || [, ""])[1])), row(buy ? "Never above" : "Never under", `${fp(o.cap)} SOL`));
    else if (t === "grad" || t === "curve") { const cm = Math.round(nOf(F.curve)) || 80; rows.push(row("Fills", t === "grad" ? tr("when the curve completes") : L3(`at ${cm}% of the curve`, `커브 ${cm}% 지점에서`, `在曲线 ${cm}% 处`)), row(buy ? "Never above" : "Never under", `${fp(o.cap)} SOL`)); }
    if (o.orders && o.orders.length) {
      const rent = o.orders.length * 0.0018;
      rows.push(row("Fee", "0.1%"), row("Order rent", `~${rent.toFixed(4)} SOL · ${tr("back when it fills or you cancel")}`));
      if (o.orders.some((x) => x.cond)) rows.push(`<div class="aos-sign"><span>${T("You'll sign a message for the condition first — no fee.")}</span></div>`);
    }
    return `<div class="aos-sum">${rows.join("")}</div>`;
  }
  function formView() {
    const el = $("aos-formc"); if (!el) return;
    const b = S.book;
    if (SELL_ONLY.includes(S.type)) S.side = "sell";
    const buy = S.side === "buy", sym = b && b.symbol ? "$" + b.symbol : tr("tokens");
    const dis = !LIVE() || !b || b.error;
    let sum = "", btn = "";
    if (S.type === "market") {
      const q = S.quote;
      sum = q && q.side === S.side ? `<div class="aos-sum"><div><span>${T("Expected")}</span><b data-no-i18n>${buy ? num(Number(q.outAmount) / 10 ** b.decimals) + " " + esc(sym) : solS(q.outAmount, 6) + " SOL"}</b></div><div><span>${T("At least")}</span><b data-no-i18n>${buy ? num(Number(q.minOut) / 10 ** b.decimals) + " " + esc(sym) : solS(q.minOut, 6) + " SOL"}</b></div><div><span>${T("Route")}</span><b data-no-i18n>${esc((q.route || []).join(" → ") || "Jupiter")}</b></div></div>` : `<p class="aos-hint">${T("A swap through Jupiter, from your wallet. 1% slippage limit.")}</p>`;
      btn = buy ? tr("Buy now") : tr("Sell now");
    } else {
      const o = b && !b.error ? build() : { why: "" };
      sum = summary(o, buy, sym);
      const n = o.orders ? o.orders.length : Math.max(2, Math.min(12, Math.round(nOf(F.steps)) || 4));
      btn = S.type === "dca" ? tr("Place {n} timed orders").replace("{n}", String(n)) : buy ? tr("Place buy order") : tr("Place sell order");
    }
    const balLine = S.bal && b && !b.error ? (buy ? `${T("Available")}: <b data-no-i18n>${solS(S.bal.sol)} SOL</b>${S.bal.wsol && S.bal.wsol.amount > 0n ? ` <span data-no-i18n>+ ${solS(S.bal.wsol.amount)} wSOL</span>` : ""}` : `${T("Available")}: <b data-no-i18n>${S.bal.tok ? num(Number(S.bal.tok.amount) / 10 ** b.decimals) : "0"} ${esc(sym)}</b>${S.bal.tok && S.bal.tok.amount > 0n ? ` <span class="aos-pcts">${[25, 50, 75, 100].map((x) => `<button type="button" data-aos-pct="${x}">${x === 100 ? T("Max") : x + "%"}</button>`).join("")}</span>` : ""}`) : "";
    el.innerHTML = `
      <div class="aos-sides" role="tablist"><button type="button" data-aos-side="buy" aria-selected="${buy}" class="buy${SELL_ONLY.includes(S.type) ? " dim" : ""}"${SELL_ONLY.includes(S.type) ? ` title="${T("This type is a sell — Buy switches to a limit order")}"` : ""}>${T("Buy")}</button><button type="button" data-aos-side="sell" aria-selected="${!buy}" class="sell">${T("Sell")}</button></div>
      ${typeTabs()}
      ${S.type === "market" ? `<label class="aos-f"><span>${buy ? T("Spend") : T("Sell")} <small data-no-i18n>${buy ? "SOL" : esc(sym)}</small></span><input id="aos-spend" inputmode="decimal" value="${esc(F.spend)}" placeholder="0.0"></label>` : fieldsFor(buy, sym)}
      <p class="aos-bal">${balLine}</p>
      ${sum}
      <button type="button" class="aor-btn go aos-submit ${buy ? "buy" : "sell"}" data-aos="submit"${dis || S.busy ? " disabled" : ""}>${esc(S.busy || btn)}</button>
      ${S.msg ? `<div class="aor-msg ${S.msg.k || ""}">${S.msg.html || esc(S.msg.t)}</div>` : ""}`;
  }
  const IDS = { "aos-price": "price", "aos-amount": "amount", "aos-exp": "expiry", "aos-trig": "trig", "aos-tp": "tp", "aos-sl": "sl", "aos-trail": "trail", "aos-slip": "slip", "aos-steps": "steps", "aos-every": "every", "aos-cap": "cap", "aos-start": "start", "aos-curve": "curve" };
  function onInput(e) {
    const t = e.target;
    if (t.id === "aos-spend") { F.spend = t.value; if (S.type === "market") { S.quote = null; clearTimeout(onInput.t); onInput.t = setTimeout(quoteMarket, 600); } }
    else if (IDS[t.id]) F[IDS[t.id]] = t.value;
    else return;
    const keep = t.id, pos = t.selectionStart;
    if (t.tagName === "INPUT") { formView(); const n = $(keep); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* fine */ } } }
    else formView();
  }

  // ---------------- actions ----------------
  async function onClick(e) {
    const t = e.target.closest("[data-aos],[data-aos-side],[data-aos-type],[data-aos-mint],[data-aos-tab],[data-aos-cancel],[data-aos-price],[data-aos-pct],[data-aos-fix]");
    if (!t) return;
    if (t.dataset.aosSide) { S.side = t.dataset.aosSide; if (S.side === "buy" && SELL_ONLY.includes(S.type)) S.type = "limit"; S.quote = null; S.msg = null; formView(); return; }
    if (t.dataset.aosType) { S.type = t.dataset.aosType; S.more = false; S.quote = null; S.msg = null; prefill(); formView(); return; }
    if (t.dataset.aosMint) { open(t.dataset.aosMint); return; }
    if (t.dataset.aosTab) { S.tab = t.dataset.aosTab; S.root.querySelectorAll("[data-aos-tab]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.aosTab === S.tab))); mineView(); return; }
    if (t.dataset.aosPrice) { const v = fp(Number(t.dataset.aosPrice)); if (S.type === "stop") F.trig = v; else { F.price = v; if (S.type !== "limit") S.type = "limit"; } formView(); return; }
    if (t.dataset.aosPct) { const b = S.book, tok = S.bal && S.bal.tok; if (b && tok) { const free = tok.amount - committed("sell", S.mint); const v = ((free > 0n ? free : 0n) * BigInt(t.dataset.aosPct)) / 100n; F.amount = String(Number(v) / 10 ** b.decimals); formView(); } return; }
    if (t.dataset.aosCancel) { cancel(t.dataset.aosCancel); return; }
    if (t.dataset.aosFix) { fixFunding(t.dataset.aosFix); return; }
    const a = t.dataset.aos;
    if (a === "connect") { try { await needWallet(); await Promise.all([loadMine(), loadBal()]); paintAll(); } catch (err) { S.msg = { k: "bad", t: why(err) }; formView(); } }
    else if (a === "more") { S.more = !S.more; formView(); }
    else if (a === "submit") { if (S.type === "market") swapMarket(); else placeOrders(); }
    else if (a === "unwrap") unwrap();
  }
  /// sensible starting values from the market price when a type is picked
  function prefill() {
    const p = S.book && S.book.priceSol;
    if (!p) return;
    if (S.type === "stop" && !F.trig) F.trig = fp(S.side === "buy" ? p * 1.1 : p * 0.9);
    if (S.type === "tpsl") { if (!F.tp) F.tp = fp(p * 1.5); if (!F.sl) F.sl = fp(p * 0.8); }
    if ((S.type === "dca" || S.type === "grad" || S.type === "curve") && !F.cap) F.cap = fp(S.side === "buy" ? p * 1.5 : p * 0.6);
  }
  const done = (html) => { S.msg = { k: "ok", html }; };
  const txLink = (sig) => `<a href="${esc(SCAN("tx", sig))}" target="_blank" rel="noopener">Solscan ↗</a>`;
  /// what the open orders already hold from one source account (the delegate approval is set to the total)
  function committed(side, mint) {
    return ((S.mine && S.mine.open) || []).filter((x) => x.side === side && (side === "buy" || x.mint === mint)).reduce((s, x) => s + BigInt(x.amountIn), 0n);
  }
  const b64 = (u8) => { let s0 = ""; for (const x of u8) s0 += String.fromCharCode(x); return btoa(s0); };
  /// v8: the conditions, signed in the wallet (a message, no fee) and handed to the keeper before the orders exist
  async function signConds(owner58, items) {
    const at = Math.floor(Date.now() / 1000);
    const msg = [HEAD, `owner: ${owner58}`, `at: ${at}`, ...items.map((x) => `${x.order} ${JSON.stringify(x.cond)}`)].join("\n");
    S.busy = tr("Sign the order's condition in your wallet (no fee)…"); formView();
    const sig = await W().signMessage(new TextEncoder().encode(msg));
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "solcond", owner: owner58, msg, sig: b64(sig) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !j.ok) throw new Error(j.error || tr("Couldn't save the order's condition — nothing was placed."));
  }
  async function placeOrders() {
    if (S.busy) return;
    const o = build();
    if (o.why != null) { S.msg = { k: "bad", t: o.why }; formView(); return; }
    S.busy = tr("Confirm in your wallet…"); S.msg = null; formView();
    try {
      const owner58 = await needWallet();
      await Promise.all([loadMine(), loadBal()]);
      const K = await kit(), c = await conn(), Ox = await ord();
      const owner = new K.PublicKey(owner58), mint = new K.PublicKey(S.mint), TP = new K.PublicKey(S.book.tokenProgram);
      const cap = S.status && S.status.config ? BigInt(S.status.config.maxIn) : 0n;
      for (const x of o.orders) if (cap > 0n && (x.side === "buy" ? x.amountIn : x.minOut) > cap) throw new Error(tr("Above the per-order cap of {n} SOL.").replace("{n}", solS(cap)));
      const rnd = () => BigInt.asUintN(64, BigInt("0x" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, "0")).join("")));
      const list = o.orders.map((x) => ({ ...x, nonce: rnd() }));
      for (const x of list) x.order = Ox.orderPda(owner, x.nonce).toBase58();
      const exp = Number(F.expiry) > 0 && S.type !== "dca" ? Math.floor(Date.now() / 1000) + Number(F.expiry) : 0;
      // the funding: wrapped SOL for every open buy plus these, or the token for every open sell plus these
      const head = [];
      const buys = list.filter((x) => x.side === "buy").reduce((s0, x) => s0 + x.amountIn, 0n), sells = list.filter((x) => x.side === "sell").reduce((s0, x) => s0 + x.amountIn, 0n);
      const wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true), tAta = K.spl.getAssociatedTokenAddressSync(mint, owner, true, TP);
      if (buys > 0n) {
        const need = committed("buy") + buys, have = S.bal && S.bal.wsol ? S.bal.wsol.amount : 0n;
        head.push(K.spl.createAssociatedTokenAccountIdempotentInstruction(owner, wAta, owner, K.NATIVE_MINT));
        if (need > have) {
          const rent = BigInt(list.length) * 2000000n;
          if (BigInt(S.bal ? S.bal.sol : 0) < need - have + 10000000n + rent) throw new Error(tr("Not enough SOL for this and the network fee."));
          head.push(K.SystemProgram.transfer({ fromPubkey: owner, toPubkey: wAta, lamports: need - have }), K.spl.createSyncNativeInstruction(wAta));
        }
        head.push(K.spl.createApproveCheckedInstruction(wAta, K.NATIVE_MINT, Ox.authPda, owner, need, 9));
        head.push(K.spl.createAssociatedTokenAccountIdempotentInstruction(owner, tAta, owner, mint, TP));
      }
      if (sells > 0n) {
        const need = committed("sell", S.mint) + sells, have = S.bal && S.bal.tok ? S.bal.tok.amount : 0n;
        if (have < need) throw new Error(tr("Not enough tokens: your open sell orders and this one need more than the wallet holds."));
        head.push(K.spl.createApproveCheckedInstruction(tAta, mint, Ox.authPda, owner, need, S.book.decimals, [], TP));
      }
      // the conditions first (signed, no fee), then the orders
      const conds = list.filter((x) => x.cond).map((x) => ({ order: x.order, cond: { ...x.cond, side: x.side, nonce: x.nonce.toString() } }));
      if (conds.length) await signConds(owner58, conds);
      const places = list.map((x) => Ox.place({ owner, nonce: x.nonce, side: x.side === "buy" ? 0 : 1, mint, source: x.side === "buy" ? wAta : tAta, amountIn: x.amountIn, minOut: x.minOut, expiry: exp }));
      const groups = [[...head, ...places.slice(0, 3)]];
      for (let i = 3; i < places.length; i += 4) groups.push(places.slice(i, i + 4));
      const bh = await c.getLatestBlockhash("confirmed");
      const txs = groups.map((g) => new K.Transaction({ feePayer: owner, recentBlockhash: bh.blockhash }).add(...g));
      S.busy = tr("Confirm in your wallet…"); formView();
      const signed = await sign(txs);
      S.busy = tr("Placing…"); formView();
      let sig = null;
      for (const t of signed) sig = await sendAndConfirm(t, bh.lastValidBlockHeight);
      done(`${T(list.length > 1 ? "Orders placed." : list[0].side === "buy" ? "Buy order placed." : "Sell order placed.")} ${T(S.type === "limit" && !list[0].cond ? "It fills when the market reaches your price." : list.length > 1 ? "The keeper fills each one once its condition holds." : "The keeper fills it once its condition holds.")} ${txLink(sig)}`);
      F.amount = ""; F.spend = "";
      if (window.arcOrdersFx) window.arcOrdersFx.placed(S.type);
    } catch (err) { console.warn("orders sol place", err); S.msg = { k: "bad", t: why(err) }; }
    S.busy = false;
    await sleep(800);
    await Promise.all([loadMine(), loadBal(), loadBook()]);
    paintAll();
  }
  /// v8: an order the wallet no longer covers (tokens moved, approval changed): top the approval (and wSOL) back up
  async function fixFunding(side) {
    if (S.busy) return;
    S.busy = tr("Confirm in your wallet…"); S.msg = null; formView();
    try {
      const owner58 = await needWallet();
      await Promise.all([loadMine(), loadBal()]);
      const K = await kit(), c = await conn(), Ox = await ord(), owner = new K.PublicKey(owner58);
      const ixs = [];
      if (side === "buy") {
        const wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true), need = committed("buy"), have = S.bal && S.bal.wsol ? S.bal.wsol.amount : 0n;
        ixs.push(K.spl.createAssociatedTokenAccountIdempotentInstruction(owner, wAta, owner, K.NATIVE_MINT));
        if (need > have) { if (BigInt(S.bal ? S.bal.sol : 0) < need - have + 5000000n) throw new Error(tr("Not enough SOL for this and the network fee.")); ixs.push(K.SystemProgram.transfer({ fromPubkey: owner, toPubkey: wAta, lamports: need - have }), K.spl.createSyncNativeInstruction(wAta)); }
        ixs.push(K.spl.createApproveCheckedInstruction(wAta, K.NATIVE_MINT, Ox.authPda, owner, need, 9));
      } else {
        const mint = new K.PublicKey(S.mint), TP = new K.PublicKey(S.book.tokenProgram), tAta = K.spl.getAssociatedTokenAddressSync(mint, owner, true, TP);
        ixs.push(K.spl.createApproveCheckedInstruction(tAta, mint, Ox.authPda, owner, committed("sell", S.mint), S.book.decimals, [], TP));
      }
      const bh = await c.getLatestBlockhash("confirmed");
      const [signed] = await sign([new K.Transaction({ feePayer: owner, recentBlockhash: bh.blockhash }).add(...ixs)]);
      const sig = await sendAndConfirm(signed, bh.lastValidBlockHeight);
      done(`${T("Your orders are covered again.")} ${txLink(sig)}`);
    } catch (err) { S.msg = { k: "bad", t: why(err) }; }
    S.busy = false;
    await Promise.all([loadMine(), loadBal()]);
    paintAll();
  }
  async function cancel(address) {
    if (S.busy) return;
    const x = ((S.mine && S.mine.open) || []).find((y) => y.address === address);
    if (!x) return;
    S.busy = tr("Confirm in your wallet…"); S.msg = null; formView();
    try {
      const owner58 = await needWallet();
      const K = await kit(), c = await conn(), O = await ord();
      const owner = new K.PublicKey(owner58);
      const ixs = [O.cancel({ owner, order: new K.PublicKey(address) })];
      // the approval drops to what the other open orders on that account still need
      const left = committed(x.side, x.mint) - BigInt(x.amountIn);
      if (x.side === "buy") {
        const wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true);
        ixs.push(left > 0n ? K.spl.createApproveCheckedInstruction(wAta, K.NATIVE_MINT, O.authPda, owner, left, 9) : K.spl.createRevokeInstruction(wAta, owner));
      } else {
        const info = await c.getAccountInfo(new K.PublicKey(x.mint));
        const TP = info.owner, dec = info.data[44];
        const tAta = K.spl.getAssociatedTokenAddressSync(new K.PublicKey(x.mint), owner, true, TP);
        ixs.push(left > 0n ? K.spl.createApproveCheckedInstruction(tAta, new K.PublicKey(x.mint), O.authPda, owner, left, dec, [], TP) : K.spl.createRevokeInstruction(tAta, owner, [], TP));
      }
      const bh = await c.getLatestBlockhash("confirmed");
      const [signed] = await sign([new K.Transaction({ feePayer: owner, recentBlockhash: bh.blockhash }).add(...ixs)]);
      S.busy = tr("Cancelling…"); formView();
      const sig = await sendAndConfirm(signed, bh.lastValidBlockHeight);
      done(`${T("Order cancelled — its rent is back in your wallet.")} ${txLink(sig)}`);
    } catch (err) { S.msg = { k: "bad", t: why(err) }; }
    S.busy = false;
    await sleep(800);
    await Promise.all([loadMine(), loadBal(), loadBook()]);
    paintAll();
  }
  /// wrapped SOL no open buy needs: the wSOL account closed, all of it back as SOL (only with no open buys)
  async function unwrap() {
    if (S.busy || committed("buy") > 0n) return;
    S.busy = tr("Confirm in your wallet…"); formView();
    try {
      const owner58 = await needWallet();
      const K = await kit(), c = await conn();
      const owner = new K.PublicKey(owner58), wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true);
      const bh = await c.getLatestBlockhash("confirmed");
      const [signed] = await sign([new K.Transaction({ feePayer: owner, recentBlockhash: bh.blockhash }).add(K.spl.createCloseAccountInstruction(wAta, owner, owner))]);
      const sig = await sendAndConfirm(signed, bh.lastValidBlockHeight);
      done(`${T("Unwrapped to SOL.")} ${txLink(sig)}`);
    } catch (err) { S.msg = { k: "bad", t: why(err) }; }
    S.busy = false;
    await loadBal(); paintAll();
  }
  /// a market order: the server asks Jupiter for the swap (its key stays there), the wallet signs it
  function marketAmount() {
    const b = S.book; if (!b) return null;
    return S.side === "buy" ? units(F.spend, 9) : units(F.spend, b.decimals);
  }
  async function quoteMarket() {
    const amt = marketAmount();
    if (!amt || !me() || !LIVE()) { formView(); return; }
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "solswap", wallet: me(), mint: S.mint, side: S.side, amount: amt.toString(), slippageBps: 100 }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r && r.ok && j.ok) S.quote = { ...j, side: S.side, amount: amt.toString(), at: Date.now() };
    else S.msg = { k: "bad", t: j.error || tr("Couldn't get a quote right now.") };
    formView();
  }
  async function swapMarket() {
    if (S.busy) return;
    const amt = marketAmount();
    if (!amt) { S.msg = { k: "bad", t: tr("Set an amount.") }; formView(); return; }
    S.busy = tr("Getting the route…"); S.msg = null; formView();
    try {
      await needWallet();
      // a fresh swap: a quote older than ~20s may have expired
      if (!S.quote || S.quote.side !== S.side || S.quote.amount !== amt.toString() || Date.now() - S.quote.at > 20000) { S.quote = null; await quoteMarket(); }
      if (!S.quote) throw new Error((S.msg && S.msg.t) || tr("Couldn't get a quote right now."));
      const K = await kit();
      const vt = K.VersionedTransaction.deserialize(K.Buffer.from(S.quote.tx, "base64"));
      S.busy = tr("Confirm in your wallet…"); formView();
      const [signed] = await sign([vt]);
      S.busy = tr("Swapping…"); formView();
      const sig = await sendAndConfirm(signed, S.quote.lastValidBlockHeight);
      done(`${T(S.side === "buy" ? "Bought." : "Sold.")} ${txLink(sig)}`);
      F.spend = ""; S.quote = null;
    } catch (err) { S.msg = { k: "bad", t: why(err) }; S.quote = null; }
    S.busy = false;
    await sleep(800);
    await Promise.all([loadBal(), loadBook()]);
    paintAll();
  }

  // ---------------- my orders ----------------
  function mineView() {
    const el = $("aos-mine"); if (!el) return;
    const n = $("aos-n-open"), ub = $("aos-unwrap");
    if (!me()) { el.innerHTML = `<p class="aos-empty">${T("Connect a Solana wallet to see your orders.")}</p>`; if (n) n.textContent = ""; if (ub) ub.hidden = true; return; }
    const m = S.mine;
    if (!m) { el.innerHTML = `<p class="aos-empty">${T("Reading your orders…")}</p>`; return; }
    if (n) n.textContent = m.open.length ? String(m.open.length) : "";
    if (ub) ub.hidden = !(S.bal && S.bal.wsol && S.bal.wsol.amount > 0n && committed("buy") === 0n);
    if (S.tab === "history") {
      el.innerHTML = m.history.length ? `<div class="aos-rows">${m.history.map((h) => `<div class="aos-row"><span class="aos-side ${h.side}">${T(h.side === "buy" ? "Buy" : "Sell")}</span><span data-no-i18n>$${esc(h.symbol || short(h.mint))}</span><span data-no-i18n>${h.side === "buy" ? solS(h.amountIn) + " SOL" : ""}${h.side === "sell" ? solS(h.got) + " SOL" : ""}</span><span>${T("Filled")} ${esc(ago(h.at))}</span>${txLink(h.sig)}</div>`).join("")}</div>` : `<p class="aos-empty">${T("No fills yet.")}</p>`;
      return;
    }
    const fund = funding();
    const KIND = { stop: "Stop", tpsl: "TP / SL", trail: "Trailing", time: "Timed", grad: "Graduation", curve: "Curve" };
    const open = m.open.slice().sort((a, c) => ((a.cond && a.cond.notBefore) || a.created || 0) - ((c.cond && c.cond.notBefore) || c.created || 0));
    el.innerHTML = open.length ? `${fund.bad.length ? `<div class="aos-fix">${fund.bad.map((k) => `<span>${T(k === "buy" ? "Your open buys need more wrapped SOL or a fresh approval." : "Your open sells on this coin need the tokens or a fresh approval.")}</span><button type="button" class="aor-btn sm" data-aos-fix="${k}">${T("Fix")}</button>`).join("")}</div>` : ""}<div class="aos-rows">${open.map((x) => {
      const c = x.cond, kind = c ? KIND[c.kind] || "" : "";
      const away = !c && x.priceNow && x.price ? (x.price / x.priceNow - 1) * 100 : null;
      const note = c ? `<span class="aos-wait" title="${esc(x.condLabel || "")}">${T("Waits")}: ${esc(waitText(c, x))}</span>` : away != null ? `<span class="aos-wait">${Math.abs(away) < 0.5 ? T("At the market — fills on the next keeper run") : esc(L3(`${pc(away)} from the market`, `시장가 대비 ${pc(away)}`, `距市价 ${pc(away)}`))}</span>` : "";
      const unfunded = fund.bad.includes(x.side) && (x.side === "buy" || x.mint === S.mint);
      return `<div class="aos-row${unfunded ? " unfunded" : ""}"><span class="aos-side ${x.side}">${T(x.side === "buy" ? "Buy" : "Sell")}${kind ? `<i>${T(kind)}</i>` : ""}</span><span data-no-i18n>$${esc(x.symbol || short(x.mint))}</span><span data-no-i18n>${c ? `${num(x.tokens)} · ${esc(x.side === "buy" ? L3("cap", "상한", "上限") : L3("floor", "하한", "下限"))} ${fp(x.price)} SOL` : `${num(x.tokens)} @ ${fp(x.price)} SOL`}</span><span>${note}</span><span>${x.expiry ? T("until") + " " + esc(new Date(x.expiry * 1000).toLocaleDateString()) : T("no expiry")}</span><button type="button" class="aor-btn sm ghost" data-aos-cancel="${esc(x.address)}"${S.busy ? " disabled" : ""}>${T("Cancel")}</button></div>`;
    }).join("")}</div>` : `<p class="aos-empty">${T("No open orders.")}</p>`;
  }

  /// v8: what a conditional order waits for, in a few words
  function waitText(c, x) {
    const dt = (t) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    if (c.notBefore && Date.now() / 1000 < c.notBefore && c.kind === "time") return L3(`starts ${dt(c.notBefore)}`, `${dt(c.notBefore)} 시작`, `${dt(c.notBefore)} 开始`);
    const p = x.priceNow, gap = (v) => (p && v ? ` (${pc((v / p - 1) * 100)})` : "");
    if (c.kind === "stop") return `${c.side === "sell" ? "≤" : "≥"} ${fp(c.trig)} SOL${gap(c.trig)}`;
    if (c.kind === "tpsl") return `TP ${fp(c.tp)}${gap(c.tp)} · SL ${fp(c.sl)}${gap(c.sl)}`;
    if (c.kind === "trail") return L3(`${c.trail / 100}% under ${fp(c.hi)} SOL`, `${fp(c.hi)} SOL보다 ${c.trail / 100}% 아래`, `低于 ${fp(c.hi)} SOL 的 ${c.trail / 100}%`);
    if (c.kind === "grad") return tr("the coin to graduate");
    if (c.kind === "curve") return L3(`${c.curve}% of the curve`, `커브 ${c.curve}%`, `曲线 ${c.curve}%`);
    return c.notBefore ? L3(`starts ${dt(c.notBefore)}`, `${dt(c.notBefore)} 시작`, `${dt(c.notBefore)} 开始`) : "";
  }
  /// v8: do the wallet's balances and approvals still cover the open orders? → { bad: ["buy"?, "sell"?] }
  function funding() {
    const bad = [];
    if (!S.bal || !S.auth) return { bad };
    const ok = (acc, need) => need === 0n || (acc && acc.amount >= need && acc.delegate && acc.delegate.toBase58() === S.auth && acc.delegatedAmount >= need);
    if (!ok(S.bal.wsol, committed("buy"))) bad.push("buy");
    if (S.mint && !ok(S.bal.tok, committed("sell", S.mint))) bad.push("sell");
    return { bad };
  }
  document.addEventListener("arc:solwallet", async () => { if (!S.root || !document.body.contains(S.root)) return; await Promise.all([loadMine(), loadBal()]); paintAll(); });
  window.arcOrdersSol = { mount, unmount: () => { clearInterval(S.timer); S.root = null; }, open, state: S, program: () => PROGRAM };
})();
