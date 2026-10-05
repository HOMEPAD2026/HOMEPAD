/* global CONFIG */
// arc-orders-sol.js — ARCIRCLE Orders on Solana: the third side of the Orders page's chain switch (arc-orders.js hands
// this module its body when Solana is picked). The program is solana/arcircle-orders; the server side api/_orders-sol.mjs.
//   · limit   "buy N tokens at P SOL" / "sell N tokens for at least P SOL each". Nothing is deposited: the order is a
//             program account, and the program's delegate may move exactly the order's amount out of the wallet
//             (wrapped SOL for a buy, the token for a sell). The ARCIRCLE keeper fills it through Jupiter once the market
//             reaches the price — the program itself checks the owner gets at least their price.
//   · market  a Jupiter swap from the wallet
// 0.1% of the SOL side goes to the ARCIRCLE PAD treasury. Orders can be cancelled any time (their rent comes back).
(function () {
  "use strict";
  const C = (typeof CONFIG !== "undefined" && CONFIG.ORDERS_SOL) || {};
  const PUMP = (typeof CONFIG !== "undefined" && CONFIG.PUMP) || {};
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
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
  const S = { root: null, mint: null, book: null, markets: [], mine: null, status: null, side: "buy", type: "limit", msg: null, busy: false, timer: null, bal: null, quote: null, tab: "open" };
  const F = { price: "", amount: "", total: "", spend: "", expiry: "0" };

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
        ${b.pair ? `<a class="aor-btn sm ghost" href="https://dexscreener.com/solana/${esc(b.pair)}" target="_blank" rel="noopener" data-no-i18n>Dexscreener ↗</a>` : ""}</div>`;
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
      ${bids.length ? bids.map((x) => row(x, "bid")).join("") : `<div class="aos-lv none">${T("No buy orders")}</div>`}`;
  }

  // ---------------- the form ----------------
  const fee = () => ((S.book && S.book.feeBps) || 10) / 10000;
  /// a limit order from the form → { amountIn, minOut } in raw units, or why not
  function limitOrder() {
    const b = S.book; if (!b) return { why: "" };
    const dec = b.decimals, p = Number(String(F.price).replace(/,/g, ""));
    const n = units(F.amount, dec);
    if (!(p > 0)) return { why: tr("Set a price.") };
    if (!n) return { why: tr("Set an amount.") };
    const tokens = Number(n) / 10 ** dec;
    if (S.side === "buy") {
      const solNet = p * tokens, lam = BigInt(Math.ceil((solNet / (1 - fee())) * LAMPORTS));
      return { amountIn: lam, minOut: n, pay: lam, get: n, tokens, sol: Number(lam) / LAMPORTS };
    }
    const lam = BigInt(Math.floor(p * tokens * LAMPORTS));
    if (lam <= 0n) return { why: tr("That's less than one lamport.") };
    return { amountIn: n, minOut: lam, pay: n, get: lam, tokens, sol: Number(lam) / LAMPORTS };
  }
  function formView() {
    const el = $("aos-formc"); if (!el) return;
    const b = S.book, buy = S.side === "buy", sym = b && b.symbol ? "$" + b.symbol : tr("tokens");
    const dis = !LIVE() || !b || b.error;
    let sum = "", btn = "";
    if (S.type === "limit") {
      const o = limitOrder();
      sum = o.why != null ? `<p class="aos-hint">${esc(o.why)}</p>` : buy
        ? `<div class="aos-sum"><div><span>${T("You pay")}</span><b data-no-i18n>${solS(o.pay, 6)} SOL</b></div><div><span>${T("You get at least")}</span><b data-no-i18n>${num(o.tokens)} ${esc(sym)}</b></div><div><span>${T("Fee")}</span><b data-no-i18n>0.1%</b></div></div>`
        : `<div class="aos-sum"><div><span>${T("You sell")}</span><b data-no-i18n>${num(o.tokens)} ${esc(sym)}</b></div><div><span>${T("You get at least")}</span><b data-no-i18n>${solS(o.get, 6)} SOL</b></div><div><span>${T("Fee")}</span><b data-no-i18n>0.1%</b></div></div>`;
      btn = buy ? tr("Place buy order") : tr("Place sell order");
    } else {
      const q = S.quote;
      sum = q && q.side === S.side ? `<div class="aos-sum"><div><span>${T("Expected")}</span><b data-no-i18n>${buy ? num(Number(q.outAmount) / 10 ** b.decimals) + " " + esc(sym) : solS(q.outAmount, 6) + " SOL"}</b></div><div><span>${T("At least")}</span><b data-no-i18n>${buy ? num(Number(q.minOut) / 10 ** b.decimals) + " " + esc(sym) : solS(q.minOut, 6) + " SOL"}</b></div><div><span>${T("Route")}</span><b data-no-i18n>${esc((q.route || []).join(" → ") || "Jupiter")}</b></div></div>` : `<p class="aos-hint">${T("A swap through Jupiter, from your wallet. 1% slippage limit.")}</p>`;
      btn = buy ? tr("Buy now") : tr("Sell now");
    }
    const balLine = S.bal && b && !b.error ? (buy ? `${T("Available")}: <b data-no-i18n>${solS(S.bal.sol)} SOL</b>${S.bal.wsol && S.bal.wsol.amount > 0n ? ` <span data-no-i18n>+ ${solS(S.bal.wsol.amount)} wSOL</span>` : ""}` : `${T("Available")}: <b data-no-i18n>${S.bal.tok ? num(Number(S.bal.tok.amount) / 10 ** b.decimals) : "0"} ${esc(sym)}</b>`) : "";
    el.innerHTML = `
      <div class="aos-sides" role="tablist"><button type="button" data-aos-side="buy" aria-selected="${buy}" class="buy">${T("Buy")}</button><button type="button" data-aos-side="sell" aria-selected="${!buy}" class="sell">${T("Sell")}</button></div>
      <div class="aor-seg aos-types" role="tablist"><button type="button" data-aos-type="limit" aria-selected="${S.type === "limit"}">${T("Limit")}</button><button type="button" data-aos-type="market" aria-selected="${S.type === "market"}">${T("Market")}</button></div>
      ${S.type === "limit" ? `
        <label class="aos-f"><span>${T("Price")} <small>${T("SOL per token")}</small></span><input id="aos-price" inputmode="decimal" value="${esc(F.price)}" placeholder="0.0"></label>
        <label class="aos-f"><span>${T("Amount")} <small data-no-i18n>${esc(sym)}</small></span><input id="aos-amount" inputmode="decimal" value="${esc(F.amount)}" placeholder="0"></label>
        <label class="aos-f"><span>${T("Expires")}</span><select id="aos-exp">${[["0", "Never"], ["86400", "1 day"], ["604800", "7 days"], ["2592000", "30 days"]].map(([v, l]) => `<option value="${v}"${F.expiry === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>`
      : `<label class="aos-f"><span>${buy ? T("Spend") : T("Sell")} <small data-no-i18n>${buy ? "SOL" : esc(sym)}</small></span><input id="aos-spend" inputmode="decimal" value="${esc(F.spend)}" placeholder="0.0"></label>`}
      <p class="aos-bal">${balLine}</p>
      ${sum}
      <button type="button" class="aor-btn go aos-submit ${buy ? "buy" : "sell"}" data-aos="submit"${dis || S.busy ? " disabled" : ""}>${esc(S.busy || btn)}</button>
      ${S.msg ? `<div class="aor-msg ${S.msg.k || ""}">${S.msg.html || esc(S.msg.t)}</div>` : ""}`;
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === "aos-price") F.price = t.value;
    else if (t.id === "aos-amount") F.amount = t.value;
    else if (t.id === "aos-exp") F.expiry = t.value;
    else if (t.id === "aos-spend") { F.spend = t.value; S.quote = null; clearTimeout(onInput.t); onInput.t = setTimeout(quoteMarket, 600); }
    else return;
    const keep = t.id, pos = t.selectionStart;
    if (t.tagName === "INPUT") { formView(); const n = $(keep); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* fine */ } } }
  }

  // ---------------- actions ----------------
  async function onClick(e) {
    const t = e.target.closest("[data-aos],[data-aos-side],[data-aos-type],[data-aos-mint],[data-aos-tab],[data-aos-cancel],[data-aos-price]");
    if (!t) return;
    if (t.dataset.aosSide) { S.side = t.dataset.aosSide; S.quote = null; S.msg = null; formView(); return; }
    if (t.dataset.aosType) { S.type = t.dataset.aosType; S.quote = null; S.msg = null; formView(); return; }
    if (t.dataset.aosMint) { open(t.dataset.aosMint); return; }
    if (t.dataset.aosTab) { S.tab = t.dataset.aosTab; S.root.querySelectorAll("[data-aos-tab]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.aosTab === S.tab))); mineView(); return; }
    if (t.dataset.aosPrice) { F.price = fp(Number(t.dataset.aosPrice)); S.type = "limit"; formView(); return; }
    if (t.dataset.aosCancel) { cancel(t.dataset.aosCancel); return; }
    const a = t.dataset.aos;
    if (a === "connect") { try { await needWallet(); await Promise.all([loadMine(), loadBal()]); paintAll(); } catch (err) { S.msg = { k: "bad", t: why(err) }; formView(); } }
    else if (a === "submit") { if (S.type === "limit") placeLimit(); else swapMarket(); }
    else if (a === "unwrap") unwrap();
  }
  const done = (html) => { S.msg = { k: "ok", html }; };
  const txLink = (sig) => `<a href="${esc(SCAN("tx", sig))}" target="_blank" rel="noopener">Solscan ↗</a>`;
  /// what the open orders already hold from one source account (the delegate approval is set to the total)
  function committed(side, mint) {
    return ((S.mine && S.mine.open) || []).filter((x) => x.side === side && (side === "buy" || x.mint === mint)).reduce((s, x) => s + BigInt(x.amountIn), 0n);
  }
  async function placeLimit() {
    if (S.busy) return;
    const o = limitOrder();
    if (o.why != null) { S.msg = { k: "bad", t: o.why }; formView(); return; }
    S.busy = tr("Confirm in your wallet…"); S.msg = null; formView();
    try {
      const owner58 = await needWallet();
      await Promise.all([loadMine(), loadBal()]);
      const K = await kit(), c = await conn(), O = await ord();
      const owner = new K.PublicKey(owner58), mint = new K.PublicKey(S.mint), TP = new K.PublicKey(S.book.tokenProgram);
      const buy = S.side === "buy";
      const cap = S.status && S.status.config ? BigInt(S.status.config.maxIn) : 0n;
      if (cap > 0n && (buy ? o.amountIn : o.minOut) > cap) throw new Error(tr("Above the per-order cap of {n} SOL.").replace("{n}", solS(cap)));
      const ixs = [];
      let source, approveTo;
      if (buy) {
        // wrapped SOL for every open buy plus this one; the delegate approval covers them all
        const wAta = K.spl.getAssociatedTokenAddressSync(K.NATIVE_MINT, owner, true);
        const need = committed("buy") + o.amountIn, have = S.bal && S.bal.wsol ? S.bal.wsol.amount : 0n;
        ixs.push(K.spl.createAssociatedTokenAccountIdempotentInstruction(owner, wAta, owner, K.NATIVE_MINT));
        if (need > have) {
          if (BigInt(S.bal ? S.bal.sol : 0) < need - have + 10000000n) throw new Error(tr("Not enough SOL for this and the network fee."));
          ixs.push(K.SystemProgram.transfer({ fromPubkey: owner, toPubkey: wAta, lamports: need - have }), K.spl.createSyncNativeInstruction(wAta));
        }
        ixs.push(K.spl.createApproveCheckedInstruction(wAta, K.NATIVE_MINT, O.authPda, owner, need, 9));
        // the token account the fill pays into, made now so the keeper doesn't have to
        ixs.push(K.spl.createAssociatedTokenAccountIdempotentInstruction(owner, K.spl.getAssociatedTokenAddressSync(mint, owner, true, TP), owner, mint, TP));
        source = wAta; approveTo = need;
      } else {
        const tAta = K.spl.getAssociatedTokenAddressSync(mint, owner, true, TP);
        const need = committed("sell", S.mint) + o.amountIn, have = S.bal && S.bal.tok ? S.bal.tok.amount : 0n;
        if (have < need) throw new Error(tr("Not enough tokens: your open sell orders and this one need more than the wallet holds."));
        ixs.push(K.spl.createApproveCheckedInstruction(tAta, mint, O.authPda, owner, need, S.book.decimals, [], TP));
        source = tAta; approveTo = need;
      }
      const nonce = BigInt.asUintN(64, BigInt("0x" + Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, "0")).join("")));
      const exp = Number(F.expiry) > 0 ? Math.floor(Date.now() / 1000) + Number(F.expiry) : 0;
      ixs.push(O.place({ owner, nonce, side: buy ? 0 : 1, mint, source, amountIn: o.amountIn, minOut: o.minOut, expiry: exp }));
      const bh = await c.getLatestBlockhash("confirmed");
      const tx = new K.Transaction({ feePayer: owner, recentBlockhash: bh.blockhash }).add(...ixs);
      const [signed] = await sign([tx]);
      S.busy = tr("Placing…"); formView();
      const sig = await sendAndConfirm(signed, bh.lastValidBlockHeight);
      void approveTo;
      done(`${T(buy ? "Buy order placed." : "Sell order placed.")} ${T("It fills when the market reaches your price.")} ${txLink(sig)}`);
      F.amount = "";
    } catch (err) { console.warn("orders sol place", err); S.msg = { k: "bad", t: why(err) }; }
    S.busy = false;
    await sleep(800);
    await Promise.all([loadMine(), loadBal(), loadBook()]);
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
    el.innerHTML = m.open.length ? `<div class="aos-rows">${m.open.map((x) => `<div class="aos-row"><span class="aos-side ${x.side}">${T(x.side === "buy" ? "Buy" : "Sell")}</span><span data-no-i18n>$${esc(x.symbol || short(x.mint))}</span><span data-no-i18n>${num(x.tokens)} @ ${fp(x.price)} SOL</span><span data-no-i18n>${num(x.sol)} SOL</span><span>${x.expiry ? T("until") + " " + esc(new Date(x.expiry * 1000).toLocaleDateString()) : T("no expiry")}</span><button type="button" class="aor-btn sm ghost" data-aos-cancel="${esc(x.address)}"${S.busy ? " disabled" : ""}>${T("Cancel")}</button></div>`).join("")}</div>` : `<p class="aos-empty">${T("No open orders.")}</p>`;
  }

  document.addEventListener("arc:solwallet", async () => { if (!S.root || !document.body.contains(S.root)) return; await Promise.all([loadMine(), loadBal()]); paintAll(); });
  window.arcOrdersSol = { mount, unmount: () => { clearInterval(S.timer); S.root = null; }, open, state: S, program: () => PROGRAM };
})();
