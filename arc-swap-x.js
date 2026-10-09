/* global ethers */
// arc-swap-x.js — ARCIRCLE Swap's other views (arcpad.html#swap?v=…; arc-swap.js is the Swap view and shares its
// helpers through window.arcSwap.api):
//   · Pools     Arc's busiest Uniswap v4 pools (GeckoTerminal through /api/social?liqtop): liquidity, 24h volume,
//               24h LP fees, the fee yield (24h fees × 365 ÷ liquidity), Swap and Add liquidity (the Liquidity
//               Manager); My positions (/api/social?liqmine) with Manage
//   · Tokens    every token those pools and ArcPad know about: price, 24h change, volume, liquidity, market cap;
//               sort, search, pages; Buy opens the Swap view paying with $ARCIRCLE
//   · Activity  ArcircleSwap's Swapped events — your swaps or everyone's: paid, received, fee, burned, the transaction
//   · Send & Receive  send any token on Arc to an address (checksum, contract and typo checks before it goes); your
//               address with a QR code to receive
(function () {
  "use strict";
  let A = null; // window.arcSwap.api
  const X = { pools: { tab: "all", q: "", sort: "liq", mine: null, mineAt: 0 }, tokens: { q: "", sort: "vol", page: 0 }, act: { tab: "mine", rows: null, loading: false, err: null, at: 0, who: "" }, send: { tok: null, amt: "", to: "", step: "edit", msg: null, warn: [], bal: null, hash: null }, qr: null };
  const $ = (id) => document.getElementById(id);
  const PAGE = 25;

  function boot() {
    if (A || !window.arcSwap || !window.arcSwap.api) return;
    A = window.arcSwap.api;
    document.addEventListener("arcswap:view", (e) => render(e.detail && e.detail.view));
    document.addEventListener("arcswap:swapped", () => { X.act.at = 0; });
    const host = document.getElementById("sw-body");
    host.addEventListener("click", click);
    host.addEventListener("input", input);
    if (A.S.view !== "swap") render(A.S.view);
    // a wallet connected, switched or disconnected while one of these views is open
    let who = A.me();
    setInterval(() => { if (A.me() !== who) { who = A.me(); X.pools.mine = null; X.act.rows = null; X.send.bal = null; if (A.S.view !== "swap" && document.getElementById("bp-panel-swap").classList.contains("active")) render(A.S.view); } }, 2500);
  }
  document.addEventListener("arcswap:ready", boot);
  boot();

  function render(v) {
    if (!A || !v) return;
    if (v === "pools") pools();
    else if (v === "tokens") tokens();
    else if (v === "activity") activity();
    else if (v === "send") send();
  }
  const stat = (label, value, sub) => `<div class="swx-stat"><span>${A.T(label)}</span><b data-no-i18n>${A.esc(value)}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const chg = (c) => (c == null || !isFinite(c) ? `<span class="swx-mute">—</span>` : `<span class="${c >= 0 ? "up" : "dn"}" data-no-i18n>${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(2)}%</span>`);
  const metaOf = (addr, sym) => { const t = A.lc(addr); return A.META.get(t) || { address: t, symbol: sym || A.short(t), name: "", decimals: null, logo: null }; };
  const logoFor = (addr, sym, cls) => {
    const m = metaOf(addr, sym), l = A.launches().find((x) => A.lc(x.token) === A.lc(addr));
    return A.logoHtml(l && A.okImg(l.imageUrl) && !m.logo ? { ...m, logo: l.imageUrl } : m, cls || "sw-logo sm");
  };

  // ---------------- Pools ----------------
  async function pools() {
    const el = $("sw-pools");
    if (!el) return;
    if (!A.S.top) { el.innerHTML = `<div class="swx-load"><span class="sw-spin"></span>${A.T("Reading Arc's pools…")}</div>`; await A.loadTop(); }
    if (A.me() && (!X.pools.mine || Date.now() - X.pools.mineAt > 60000)) loadMine();
    paintPools();
  }
  async function loadMine() {
    const w = A.me();
    X.pools.mineAt = Date.now();
    for (let i = 0; i < 8; i++) {
      const j = await fetch(`/api/social?liqmine=${w}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (A.me() !== w) return;
      if (j && j.done) { X.pools.mine = j.pools || []; break; }
      X.pools.mine = { progress: j && j.progress };
      if (A.S.view === "pools") paintPools();
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (A.S.view === "pools") paintPools();
  }
  function poolRows() {
    const q = X.pools.q.trim().toLowerCase().replace(/^\$/, "");
    const list = ((A.S.top && A.S.top.pools) || []).filter((p) => !q || A.lc(p.name).includes(q) || A.lc((p.base || {}).symbol).includes(q) || A.lc((p.quote || {}).symbol).includes(q) || A.lc((p.base || {}).address) === q);
    const k = X.pools.sort;
    const key = (p) => (k === "vol" ? p.vol : k === "apr" ? p.apr : k === "fees" ? p.fees24 : p.liqUsd) || 0;
    return list.slice().sort((a, b) => key(b) - key(a));
  }
  function paintPools() {
    const el = $("sw-pools");
    if (!el || A.S.view !== "pools") return;
    const all = (A.S.top && A.S.top.pools) || [];
    const sum = (f) => all.reduce((s, p) => s + (Number(p[f]) || 0), 0);
    const mine = Array.isArray(X.pools.mine) ? X.pools.mine : null;
    const tab = X.pools.tab;
    const rows = poolRows();
    const sorts = [["liq", "Liquidity"], ["vol", "Volume"], ["fees", "Fees"], ["apr", "APR"]];
    const tr = (p) => {
      const b = p.base || {}, q = p.quote || {};
      return `<tr>
        <td class="swx-pairc"><div class="swx-pair"><span class="swx-logos">${logoFor(b.address, b.symbol)}${logoFor(q.address, q.symbol)}</span><span><b data-no-i18n>${A.esc(b.symbol || "?")} / ${A.esc(q.symbol || "?")}</b><small data-no-i18n>${A.esc(p.dex || "")}${p.feePct != null ? ` · ${A.esc(p.feePct)}%` : p.v4 ? ` · ${A.T("dynamic fee")}` : ""}</small></span></div></td>
        <td data-label="${A.T("Liquidity")}" data-no-i18n>${A.esc(A.usdK(p.liqUsd) || "—")}</td>
        <td data-label="${A.T("Volume 24h")}" data-no-i18n>${A.esc(A.usdK(p.vol) || "—")}</td>
        <td data-label="${A.T("Fees 24h")}" data-no-i18n>${p.fees24 != null ? A.esc(A.usd(p.fees24)) : "—"}</td>
        <td data-label="${A.T("APR")}" data-no-i18n title="${A.T("24h fees × 365 ÷ liquidity — yesterday's pace, not a promise")}">${p.apr != null ? A.esc(p.apr.toFixed(p.apr >= 100 ? 0 : 1)) + "%" : "—"}</td>
        <td data-label="${A.T("24h")}">${chg(p.change)}</td>
        <td class="swx-actc"><div class="swx-acts">${A.isAddr(b.address) && A.isAddr(q.address) ? `<button type="button" data-swx-pair="${A.esc(q.address)},${A.esc(b.address)}">${A.T("Swap")}</button>` : ""}${A.isAddr(b.address) ? `<a href="/arc#liquidity?token=${A.esc(b.address)}">${A.T("Add liquidity")}</a>` : ""}</div></td>
      </tr>`;
    };
    const mineRows = mine ? mine.map((p) => `<tr>
        <td class="swx-pairc"><div class="swx-pair"><span class="swx-logos">${logoFor(p.token.address, p.token.symbol)}${logoFor(p.quote.address, p.quote.symbol)}</span><span><b data-no-i18n>${A.esc(p.token.symbol)} / ${A.esc(p.quote.symbol)}</b><small data-no-i18n>${p.feePct != null ? A.esc(p.feePct) + "%" : ""}</small></span></div></td>
        <td data-label="${A.T("Positions")}" data-no-i18n>${A.esc(p.positions)}</td>
        <td data-label="${A.T("Locked")}" data-no-i18n>${A.esc(p.locked)}</td>
        <td class="swx-actc"><div class="swx-acts"><a href="/arc#liquidity?token=${A.esc(p.token.address)}">${A.T("Manage")}</a><button type="button" data-swx-pair="${A.esc(p.quote.address)},${A.esc(p.token.address)}">${A.T("Swap")}</button></div></td></tr>`).join("") : "";
    el.innerHTML = `<div class="swx">
      <div class="swx-stats">
        ${stat("Pools tracked", String(all.length))}
        ${stat("Liquidity", A.usdK(sum("liqUsd")) || "—")}
        ${stat("Volume 24h", A.usdK(sum("vol")) || "—")}
        ${stat("LP fees 24h", A.usd(sum("fees24")) || "—")}
      </div>
      <div class="swx-bar">
        <div class="swx-tabs" role="tablist"><button type="button" role="tab" aria-selected="${tab === "all"}" data-swx-ptab="all">${A.T("All pools")}</button><button type="button" role="tab" aria-selected="${tab === "mine"}" data-swx-ptab="mine">${A.T("My positions")}${mine ? ` <i data-no-i18n>${mine.length}</i>` : ""}</button></div>
        ${tab === "all" ? `<input class="swx-q" id="swx-pq" type="search" placeholder="${A.T("Search a pool or token")}" value="${A.esc(X.pools.q)}" aria-label="${A.T("Search pools")}"><div class="swx-sort" role="radiogroup" aria-label="${A.T("Sort by")}">${sorts.map(([k, l]) => `<button type="button" role="radio" aria-checked="${X.pools.sort === k}" data-swx-psort="${k}">${A.T(l)}</button>`).join("")}</div>` : ""}
        <a class="swx-add" href="/arc#liquidity">${A.T("+ Add liquidity")}</a>
      </div>
      ${tab === "all" ? (all.length ? `<div class="swx-tw"><table class="swx-t"><thead><tr><th>${A.T("Pool")}</th><th>${A.T("Liquidity")}</th><th>${A.T("Volume 24h")}</th><th>${A.T("Fees 24h")}</th><th>${A.T("APR")}</th><th>${A.T("24h")}</th><th></th></tr></thead><tbody>${rows.map(tr).join("") || `<tr><td colspan="7" class="swx-none">${A.T("No pool matches that.")}</td></tr>`}</tbody></table></div>
          <p class="swx-src">${A.T("Arc's busiest Uniswap v4 pools by 24h volume and GeckoTerminal's trending list. APR is the last 24 hours of LP fees × 365 ÷ liquidity — a pace, not a promise.")}</p>`
          : `<p class="swx-none">${A.T("Pool data didn't load. It retries when you come back to this tab.")}</p>`)
        : !A.me() ? `<p class="swx-none">${A.T("Connect a wallet to see your liquidity positions.")}</p>`
        : !mine ? `<div class="swx-load"><span class="sw-spin"></span>${A.T("Finding your positions…")}${X.pools.mine && X.pools.mine.progress != null ? ` <span data-no-i18n>${Math.round(X.pools.mine.progress * 100)}%</span>` : ""}</div>`
        : !mine.length ? `<p class="swx-none">${A.T("No liquidity positions in this wallet yet.")} <a href="/arc#liquidity">${A.T("Add liquidity")}</a></p>`
        : `<div class="swx-tw"><table class="swx-t mine"><thead><tr><th>${A.T("Pool")}</th><th>${A.T("Positions")}</th><th>${A.T("Locked")}</th><th></th></tr></thead><tbody>${mineRows}</tbody></table></div>`}
    </div>`;
    if (X.pools.focus) { const i = $("swx-pq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } X.pools.focus = false; }
  }

  // ---------------- Tokens ----------------
  function tokenRows() {
    const by = new Map();
    const put = (addr, o) => { const t = A.lc(addr); if (!A.isAddr(t) || t === A.USDC()) return; const cur = by.get(t) || { address: t, symbol: "", name: "", price: null, change: null, vol: 0, liq: 0, mcap: null, liqBest: -1 }; o(cur); by.set(t, cur); };
    for (const p of (A.S.top && A.S.top.pools) || []) {
      const b = p.base || {};
      put(b.address, (r) => {
        r.symbol = r.symbol || b.symbol; r.vol += Number(p.vol) || 0; r.liq += Number(p.liqUsd) || 0;
        if ((p.liqUsd || 0) > r.liqBest) { r.liqBest = p.liqUsd || 0; r.price = p.price; r.change = p.change; r.mcap = p.mcap || r.mcap; }
      });
    }
    for (const l of A.launches()) put(l.token, (r) => { r.symbol = r.symbol || l.symbol; r.name = r.name || l.name || ""; if (r.price == null && l.priceUsdc > 0) r.price = l.priceUsdc; if (r.mcap == null && l.marketCapUsd > 0) r.mcap = l.marketCapUsd; r.arcpad = true; });
    put(A.ARCIRCLE(), (r) => { r.symbol = "ARCIRCLE"; r.name = "ARCIRCLE"; if (r.price == null) r.price = A.usdOf(A.ARCIRCLE()); });
    const q = X.tokens.q.trim().toLowerCase().replace(/^\$/, "");
    const k = X.tokens.sort;
    const list = [...by.values()].filter((r) => r.symbol && (!q || A.lc(r.symbol).includes(q) || A.lc(r.name).includes(q) || r.address.startsWith(q)));
    const val = (r) => (k === "liq" ? r.liq : k === "mcap" ? r.mcap : k === "chg" ? r.change : r.vol);
    return k === "az" ? list.sort((a, b) => a.symbol.localeCompare(b.symbol)) : list.sort((a, b) => (val(b) == null ? -1e18 : val(b)) - (val(a) == null ? -1e18 : val(a)) || (b.mcap || 0) - (a.mcap || 0));
  }
  async function tokens() {
    const el = $("sw-tokens");
    if (!el) return;
    if (!A.S.top) { el.innerHTML = `<div class="swx-load"><span class="sw-spin"></span>${A.T("Reading Arc's tokens…")}</div>`; await A.loadTop(); }
    paintTokens();
  }
  function paintTokens() {
    const el = $("sw-tokens");
    if (!el || A.S.view !== "tokens") return;
    const all = tokenRows();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    X.tokens.page = Math.min(X.tokens.page, pages - 1);
    const rows = all.slice(X.tokens.page * PAGE, (X.tokens.page + 1) * PAGE);
    const sorts = [["vol", "Volume"], ["liq", "Liquidity"], ["mcap", "Market cap"], ["chg", "24h change"], ["az", "A–Z"]];
    const favs = A.S.favs || [];
    el.innerHTML = `<div class="swx">
      <div class="swx-stats">
        ${stat("Tokens listed", String(all.length))}
        ${stat("Volume 24h", A.usdK(all.reduce((s, r) => s + (r.vol || 0), 0)) || "—")}
        ${stat("$ARCIRCLE", A.usdOf(A.ARCIRCLE()) ? "$" + A.fmt(A.usdOf(A.ARCIRCLE())) : "—")}
      </div>
      <div class="swx-bar">
        <input class="swx-q" id="swx-tq" type="search" placeholder="${A.T("Search a symbol or paste an address")}" value="${A.esc(X.tokens.q)}" aria-label="${A.T("Search tokens")}">
        <div class="swx-sort" role="radiogroup" aria-label="${A.T("Sort by")}">${sorts.map(([k, l]) => `<button type="button" role="radio" aria-checked="${X.tokens.sort === k}" data-swx-tsort="${k}">${A.T(l)}</button>`).join("")}</div>
      </div>
      <div class="swx-tw"><table class="swx-t tok"><thead><tr><th>#</th><th>${A.T("Token")}</th><th>${A.T("Price")}</th><th>${A.T("24h")}</th><th>${A.T("Volume 24h")}</th><th>${A.T("Liquidity")}</th><th>${A.T("Market cap")}</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr>
        <td class="swx-n" data-no-i18n>${X.tokens.page * PAGE + i + 1}</td>
        <td class="swx-pairc"><div class="swx-pair"><button type="button" class="sw-pk-fav${favs.includes(r.address) ? " on" : ""}" data-sw-fav="${A.esc(r.address)}" aria-pressed="${favs.includes(r.address)}" aria-label="${A.T("Add to favorites")}">${A.svg("star", "sw-i sm")}</button>${logoFor(r.address, r.symbol, "sw-logo")}<span><b data-no-i18n>${A.esc(r.symbol)}</b><small data-no-i18n>${A.esc(r.name || A.short(r.address))}${r.arcpad ? " · ArcPad" : ""}</small></span></div></td>
        <td data-label="${A.T("Price")}" data-no-i18n>${r.price ? "$" + A.esc(A.fmt(r.price)) : "—"}</td>
        <td data-label="${A.T("24h")}">${chg(r.change)}</td>
        <td data-label="${A.T("Volume 24h")}" data-no-i18n>${r.vol ? A.esc(A.usdK(r.vol)) : "—"}</td>
        <td data-label="${A.T("Liquidity")}" data-no-i18n>${r.liq ? A.esc(A.usdK(r.liq)) : "—"}</td>
        <td data-label="${A.T("Market cap")}" data-no-i18n>${r.mcap ? A.esc(A.usdK(r.mcap)) : "—"}</td>
        <td class="swx-actc"><div class="swx-acts"><button type="button" data-swx-buy="${A.esc(r.address)}">${A.T(r.address === A.ARCIRCLE() ? "Buy" : "Buy with $ARCIRCLE")}</button></div></td>
      </tr>`).join("") || `<tr><td colspan="8" class="swx-none">${A.T("No token matches that.")}</td></tr>`}
      </tbody></table></div>
      ${pages > 1 ? `<div class="swx-pg"><button type="button" data-swx-pg="-1" ${X.tokens.page === 0 ? "disabled" : ""}>${A.T("Previous")}</button><span data-no-i18n>${X.tokens.page + 1} / ${pages}</span><button type="button" data-swx-pg="1" ${X.tokens.page >= pages - 1 ? "disabled" : ""}>${A.T("Next")}</button></div>` : ""}
      <p class="swx-src">${A.T("Prices, volume and liquidity from GeckoTerminal for Arc's busiest pools; ArcPad coins from ArcPad itself.")}</p>
    </div>`;
    if (X.tokens.focus) { const i = $("swx-tq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } X.tokens.focus = false; }
  }

  // ---------------- Activity ----------------
  async function activity() {
    const el = $("sw-act");
    if (!el) return;
    const who = X.act.tab === "mine" ? A.me() : "*";
    if (A.LIVE() && (X.act.who !== who || Date.now() - X.act.at > 30000) && !X.act.loading && (who || X.act.tab === "all")) loadAct(who);
    paintAct();
  }
  async function loadAct(who) {
    X.act.loading = true; X.act.err = null; X.act.who = who; paintAct();
    try {
      const p = A.rp(), topic = A.SW_I.getEvent("Swapped").topicHash;
      const latest = await p.getBlockNumber();
      const from0 = Number(A.CFG().SWAP_FROM_BLOCK || 0);
      const topics = who && who !== "*" ? [topic, ethers.zeroPadValue(who, 32)] : [topic];
      const logs = [];
      for (let hi = latest, k = 0; k < 10 && hi > from0 && logs.length < 50; k++) {
        const lo = Math.max(from0, hi - 9999);
        const part = await p.getLogs({ address: A.ROUTER(), topics, fromBlock: lo, toBlock: hi });
        logs.push(...part.reverse());
        hi = lo - 1;
      }
      const rows = logs.slice(0, 50).map((l) => { const ev = A.SW_I.parseLog(l); return { b: l.blockNumber, hash: l.transactionHash, user: A.lc(ev.args.user), tin: A.lc(ev.args.tokenIn), tout: A.lc(ev.args.tokenOut), ain: ev.args.amountIn, aout: ev.args.amountOut, ftok: A.lc(ev.args.feeToken), fee: ev.args.fee, hops: Number(ev.args.hops) }; });
      await Promise.all([...new Set(rows.flatMap((r) => [r.tin, r.tout, r.ftok]))].map((t) => A.meta(t).catch(() => null)));
      const blocks = [...new Set(rows.map((r) => r.b))].slice(0, 30);
      const ts = new Map();
      await Promise.all(blocks.map((b) => p.getBlock(b).then((x) => x && ts.set(b, x.timestamp)).catch(() => null)));
      rows.forEach((r) => { r.t = ts.get(r.b) || null; });
      if (X.act.who === who) { X.act.rows = rows; X.act.at = Date.now(); }
    } catch (e) { X.act.err = A.errText(e); }
    X.act.loading = false;
    paintAct();
  }
  function paintAct() {
    const el = $("sw-act");
    if (!el || A.S.view !== "activity") return;
    const t = X.act.tab;
    const amt = (raw, tok) => { const m = A.META.get(tok) || {}; return `<b data-no-i18n>${A.esc(m.decimals != null ? A.fmtRaw(raw, m.decimals) : "?")}</b> <span data-no-i18n>${A.esc(m.symbol || A.short(tok))}</span>`; };
    const when = (s) => (s ? new Date(s * 1000).toLocaleString(A.lang() === "ko" ? "ko-KR" : A.lang() === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
    const rows = X.act.rows || [];
    const body = !A.LIVE() ? `<p class="swx-none">${A.T("Swap's history starts once its contract is live on Arc.")}</p>`
      : t === "mine" && !A.me() ? `<p class="swx-none">${A.T("Connect a wallet to see your swaps.")}</p>`
      : X.act.err ? `<p class="swx-none">${A.esc(X.act.err)} <button type="button" class="swx-link" data-swx-areload>${A.T("Try again")}</button></p>`
      : X.act.loading && !X.act.rows ? `<div class="swx-load"><span class="sw-spin"></span>${A.T("Reading swaps from Arc…")}</div>`
      : !rows.length ? `<p class="swx-none">${A.T(t === "mine" ? "No swaps from this wallet in the last day or so." : "No swaps in the last day or so.")}</p>`
      : `<div class="swx-tw"><table class="swx-t act"><thead><tr><th>${A.T("Time")}</th>${t === "all" ? `<th>${A.T("Wallet")}</th>` : ""}<th>${A.T("Paid")}</th><th>${A.T("Received")}</th><th>${A.T("Fee")}</th><th></th></tr></thead><tbody>${rows.map((r) => {
          const burned = r.ftok === A.ARCIRCLE() && r.fee > 0n ? (r.fee * BigInt(A.S.burnBps || 5000)) / 10000n : 0n;
          return `<tr><td data-no-i18n>${A.esc(when(r.t))}</td>${t === "all" ? `<td data-label="${A.T("Wallet")}" data-no-i18n>${A.esc(A.short(r.user))}</td>` : ""}<td data-label="${A.T("Paid")}">${amt(r.ain, r.tin)}</td><td data-label="${A.T("Received")}">${amt(r.aout, r.tout)}</td><td data-label="${A.T("Fee")}">${r.fee > 0n ? amt(r.fee, r.ftok) + (burned > 0n ? ` <span class="swx-burn">${A.svg("flame", "sw-fl")}<span data-no-i18n>${A.esc(A.fmtRaw(burned, 18))}</span></span>` : "") : `<span class="swx-mute">${A.T("fee-free")}</span>`}</td><td class="swx-actc"><div class="swx-acts"><a href="${A.esc(A.EXPL())}/tx/${A.esc(r.hash)}" target="_blank" rel="noopener">${A.T("View")}${A.svg("ext", "sw-i sm")}</a></div></td></tr>`;
        }).join("")}</tbody></table></div>`;
    el.innerHTML = `<div class="swx">
      <div class="swx-bar"><div class="swx-tabs" role="tablist"><button type="button" role="tab" aria-selected="${t === "mine"}" data-swx-atab="mine">${A.T("My swaps")}</button><button type="button" role="tab" aria-selected="${t === "all"}" data-swx-atab="all">${A.T("Everyone")}</button></div>${X.act.loading && X.act.rows ? `<span class="sw-spin"></span>` : ""}</div>
      ${body}
    </div>`;
  }

  // ---------------- Send & Receive ----------------
  function sendTok() { return X.send.tok || A.USDC(); }
  async function send() {
    const el = $("sw-send");
    if (!el) return;
    A.pickHooks.send = (t) => { X.send.tok = t; X.send.amt = ""; X.send.step = "edit"; X.send.msg = null; loadSendBal(); paintSend(); };
    await A.meta(sendTok()).catch(() => null);
    loadSendBal();
    paintSend();
    loadQr();
  }
  async function loadSendBal() {
    const w = A.me(), t = sendTok();
    X.send.bal = w ? await new ethers.Contract(t, A.ERC20, A.rp()).balanceOf(w).catch(() => null) : null;
    if (A.S.view === "send") paintSend();
  }
  function loadQr() {
    if (window.qrcode || X.qr === "loading") { paintSend(); return; }
    X.qr = "loading";
    const s = document.createElement("script");
    s.src = "/vendor/qrcode-generator-1.4.4.min.js";
    s.onload = () => { X.qr = "ok"; if (A.S.view === "send") paintSend(); };
    s.onerror = () => { X.qr = "bad"; };
    document.head.appendChild(s);
  }
  /// what's wrong with the recipient (blocking) and what to double-check (warnings)
  async function checkTo() {
    const to = X.send.to.trim(), t = sendTok();
    const bad = [], warn = [];
    if (!to) bad.push(A.tr("Paste the address to send to."));
    else if (!/^0x[0-9a-fA-F]{40}$/.test(to)) bad.push(A.tr("That isn't an Arc address (0x followed by 40 characters)."));
    else {
      try { ethers.getAddress(to); } catch { bad.push(A.tr("That address has a typo — its capital letters don't match its checksum.")); }
      if (/^0x0{40}$/i.test(to) || A.lc(to) === "0x000000000000000000000000000000000000dead") bad.push(A.tr("That's a burn address — tokens sent there are gone for good."));
      if (A.lc(to) === A.lc(t)) bad.push(A.tr("That's the token's own contract — tokens sent there are usually lost."));
      if (A.lc(to) === A.me()) warn.push(A.tr("That's your own address."));
      if (!bad.length) { const code = await A.rp().getCode(to).catch(() => "0x"); if (code && code !== "0x") warn.push(A.tr("That address is a contract. Make sure it can receive and pass on tokens.")); }
    }
    return { bad, warn };
  }
  function paintSend() {
    const el = $("sw-send");
    if (!el || A.S.view !== "send") return;
    const keepId = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
    const t = sendTok(), m = A.META.get(t) || { symbol: A.short(t), decimals: null };
    const s = X.send, w = A.me();
    const amount = m.decimals != null ? A.units(s.amt, m.decimals) : null;
    const over = amount != null && s.bal != null && amount > s.bal;
    const val = amount && A.usdOf(t) ? A.human(amount, m.decimals) * A.usdOf(t) : null;
    const qr = w && window.qrcode ? (() => { try { const q = window.qrcode(0, "M"); q.addData(ethers.getAddress(w)); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { return ""; } })() : "";
    el.innerHTML = `<div class="swx swx-send">
      <section class="swx-card">
        <h3>${A.T("Send")}</h3>
        ${s.step === "done" ? `<div class="sw-rv-done">${A.svg("check", "sw-i")}<div><b>${A.T("Sent")}</b><span data-no-i18n>${A.esc(s.doneText || "")}</span></div></div><div class="sw-rv-acts"><a class="sw-cta ghost" href="${A.esc(A.EXPL())}/tx/${A.esc(s.hash)}" target="_blank" rel="noopener">${A.T("View on ArcScan")}${A.svg("ext", "sw-i sm")}</a><button type="button" class="sw-cta" data-swx-snew>${A.T("Send more")}</button></div>` : `
        <div class="sw-box">
          <div class="sw-box-h"><label for="swx-samt">${A.T("Amount")}</label>${s.bal != null && m.decimals != null ? `<span class="sw-bal">${A.T("Balance")} <b data-no-i18n>${A.esc(A.fmtRaw(s.bal, m.decimals))}</b><button type="button" data-swx-smax>${A.T("Max")}</button></span>` : ""}</div>
          <div class="sw-box-r"><input id="swx-samt" class="sw-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${A.esc(s.amt)}" aria-label="${A.T("Amount to send")}" ${s.step === "confirm" ? "disabled" : ""}><button type="button" class="sw-tokbtn" data-swx-stok ${s.step === "confirm" ? "disabled" : ""}>${A.logoHtml(m)}<b data-no-i18n>${A.esc(m.symbol)}</b>${A.svg("down", "sw-i sm")}</button></div>
          <div class="sw-box-f" data-no-i18n>${val != null ? "≈ " + A.esc(A.usd(val)) : "&nbsp;"}</div>
        </div>
        <label class="swx-to"><span>${A.T("To")}</span><input id="swx-sto" autocomplete="off" spellcheck="false" placeholder="0x…" value="${A.esc(s.to)}" aria-label="${A.T("Recipient address")}" ${s.step === "confirm" ? "disabled" : ""}></label>
        ${s.step === "confirm" ? `<div class="swx-confirm"><p>${A.L3(`Send ${A.fmtRaw(amount || 0n, m.decimals)} ${m.symbol} to`, `${A.fmtRaw(amount || 0n, m.decimals)} ${m.symbol}를 다음 주소로 보냅니다`, `发送 ${A.fmtRaw(amount || 0n, m.decimals)} ${m.symbol} 到`)}</p><code data-no-i18n>${A.esc(s.to.trim())}</code>${s.warn.length ? `<ul class="swx-warns">${s.warn.map((x) => `<li>${A.esc(x)}</li>`).join("")}</ul>` : ""}<p class="swx-mute">${A.T("Transfers can't be undone. Check the address before you confirm.")}</p></div>` : ""}
        ${s.msg ? `<p class="sw-msg ${A.esc(s.msg.k)}" role="status">${A.esc(s.msg.t)}</p>` : ""}
        ${!w ? `<button type="button" class="sw-cta" data-sw="connect">${A.T("Connect a wallet")}</button>`
          : s.step === "confirm" ? `<div class="sw-rv-acts"><button type="button" class="sw-cta ghost" data-swx-sback>${A.T("Edit")}</button><button type="button" class="sw-cta" data-swx-sgo ${X.busy ? "disabled" : ""}>${A.T(X.busy ? "Sending…" : "Confirm send")}</button></div>`
          : `<button type="button" class="sw-cta" data-swx-sreview ${!amount || over ? "disabled" : ""}>${over ? `${A.T("Not enough")} ${A.esc(m.symbol)}` : A.T("Review send")}</button>`}`}
      </section>
      <section class="swx-card">
        <h3>${A.T("Receive to this wallet")}</h3>
        ${w ? `<div class="swx-qr">${qr || `<span class="sw-spin"></span>`}</div><code class="swx-addr" data-no-i18n>${A.esc(ethers.getAddress(w))}</code><button type="button" class="sw-cta ghost" data-swx-copy>${A.T("Copy address")}</button>
          <p class="swx-mute">${A.L3(`Only send tokens on Arc (chain ${Number(A.CFG().CHAIN_ID_DECIMAL || 5042)}) to this address. Tokens sent from another chain don't arrive here.`, `이 주소로는 Arc(체인 ${Number(A.CFG().CHAIN_ID_DECIMAL || 5042)})의 토큰만 보내세요. 다른 체인에서 보낸 토큰은 여기로 오지 않습니다.`, `只能向这个地址发送 Arc（链 ${Number(A.CFG().CHAIN_ID_DECIMAL || 5042)}）上的代币。从其他链发送的代币不会到达这里。`)}</p>`
          : `<p class="swx-none">${A.T("Connect a wallet to show your address and its QR code.")}</p>`}
        <a class="swx-bridge" href="/arc#bridge">${A.T("Bring USDC to Arc from another chain")} →</a>
      </section>
    </div>`;
    if (keepId) { const i = $(keepId); if (i && !i.disabled) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch { /* fine */ } } }
  }
  async function sendGo() {
    const t = sendTok(), m = A.META.get(t), amount = A.units(X.send.amt, m.decimals);
    X.busy = true; X.send.msg = { k: "info", t: A.tr("Confirm in your wallet…") }; paintSend();
    try {
      const chk = await checkTo();
      if (chk.bad.length) throw new Error(chk.bad[0]);
      const s = await A.signer();
      const tx = await new ethers.Contract(t, A.ERC20.concat(["function transfer(address,uint256) returns (bool)"]), s).transfer(ethers.getAddress(X.send.to.trim()), amount);
      X.send.msg = { k: "info", t: A.tr("Waiting for Arc…") }; paintSend();
      const rc = await tx.wait();
      Object.assign(X.send, { step: "done", hash: rc.hash, doneText: `${A.fmtRaw(amount, m.decimals)} ${m.symbol} → ${A.short(X.send.to.trim())}`, msg: null, amt: "" });
      loadSendBal();
    } catch (e) { X.send.msg = { k: "bad", t: A.errText(e) }; }
    X.busy = false; paintSend();
  }

  // ---------------- events ----------------
  function click(e) {
    if (!A) return;
    const b = e.target.closest("[data-swx-ptab],[data-swx-psort],[data-swx-pair],[data-swx-tsort],[data-swx-buy],[data-swx-pg],[data-swx-atab],[data-swx-areload],[data-swx-stok],[data-swx-smax],[data-swx-sreview],[data-swx-sback],[data-swx-sgo],[data-swx-snew],[data-swx-copy],[data-sw-fav]");
    if (!b) return;
    const d = b.dataset;
    if (d.swxPtab) { X.pools.tab = d.swxPtab; if (d.swxPtab === "mine" && A.me() && !Array.isArray(X.pools.mine)) loadMine(); paintPools(); }
    else if (d.swxPsort) { X.pools.sort = d.swxPsort; paintPools(); }
    else if (d.swxPair) { const [a, z] = d.swxPair.split(","); A.pair(a, z); }
    else if (d.swxTsort) { X.tokens.sort = d.swxTsort; X.tokens.page = 0; paintTokens(); }
    else if (d.swxBuy) A.buy(d.swxBuy);
    else if (d.swxPg) { X.tokens.page += Number(d.swxPg); paintTokens(); const el = $("sw-tokens"); if (el) el.scrollIntoView({ block: "start" }); }
    else if (d.swxAtab) { X.act.tab = d.swxAtab; X.act.rows = null; activity(); }
    else if (d.swxAreload != null && "swxAreload" in d) { X.act.at = 0; activity(); }
    else if ("swxStok" in d) A.openPicker("send");
    else if ("swxSmax" in d) { const m = A.META.get(sendTok()); let v = X.send.bal || 0n; if (sendTok() === A.USDC()) v = v > A.GAS_KEEP ? v - A.GAS_KEEP : 0n; X.send.amt = v > 0n ? A.plain(v, m.decimals) : ""; paintSend(); }
    else if ("swxSreview" in d) { checkTo().then((c) => { if (c.bad.length) { X.send.msg = { k: "bad", t: c.bad[0] }; } else { X.send.msg = null; X.send.warn = c.warn; X.send.step = "confirm"; } paintSend(); }); }
    else if ("swxSback" in d) { X.send.step = "edit"; X.send.msg = null; paintSend(); }
    else if ("swxSgo" in d) { if (!X.busy) sendGo(); }
    else if ("swxSnew" in d) { X.send.step = "edit"; X.send.to = ""; paintSend(); }
    else if ("swxCopy" in d) { const w = A.me(); if (w && navigator.clipboard) navigator.clipboard.writeText(ethers.getAddress(w)).then(() => { b.textContent = A.tr("Copied"); setTimeout(() => paintSend(), 1500); }).catch(() => {}); }
    else if (d.swFav && A.S.view === "tokens") { setTimeout(paintTokens, 0); }
  }
  function input(e) {
    if (!A) return;
    const id = e.target.id;
    if (id === "swx-pq") { X.pools.q = e.target.value; X.pools.focus = true; paintPools(); }
    else if (id === "swx-tq") { X.tokens.q = e.target.value; X.tokens.page = 0; X.tokens.focus = true; paintTokens(); }
    else if (id === "swx-samt") { const v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"); X.send.amt = v; X.send.msg = null; paintSend(); }
    else if (id === "swx-sto") { X.send.to = e.target.value; X.send.msg = null; }
  }
  window.arcSwapX = { _X: X, render };
})();
