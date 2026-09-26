/* global ethers, CONFIG, state, readProvider, connectWallet, ensureArcForWrite, apcErrText */
// arc-liquidity.js — Liquidity Manager (arcpad.html#liquidity, /liquidity).
// Paste a token: every Uniswap v4 pool it trades in, with price, depth, every
// LP position and how much of the liquidity is locked, burned or free. With a
// wallet: add liquidity (Uniswap's PositionManager through Permit2), remove it,
// collect fees, and lock a position in ArcLPLock until a date.
// The read side is /api/social?liq= (api/_liquidity.mjs); the math is
// api/_liq-core.mjs (window.ArcLiqCore). Launch → Liquidity → Lock → Scanner.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-liquidity");
  const Lq = window.ArcLiqCore;
  if (!panel || !Lq || typeof CONFIG === "undefined") return;
  const API = "/api/social";
  const PM = Lq.LIQ_ADDR.positions, PERMIT2 = Lq.LIQ_ADDR.permit2;
  const LPLOCK = String(CONFIG.LPLOCK_ADDRESS || "").toLowerCase();
  const NATIVE = Lq.ZERO_ADDR;
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const now = () => Math.floor(Date.now() / 1000);
  const DAY = 86400;
  const me = () => (state && state.account ? lc(state.account) : "");
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  const errText = (e, fb) => (typeof apcErrText === "function" ? apcErrText(e, fb) : (e && (e.shortMessage || e.reason || e.message)) || fb);
  const date = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const B = (x) => { try { return BigInt(x || 0); } catch { return 0n; } };

  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const P2 = ["function allowance(address,address,address) view returns (uint160 amount, uint48 expiration, uint48 nonce)", "function approve(address token, address spender, uint160 amount, uint48 expiration)"];
  const POSM = [
    "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
    "function safeTransferFrom(address from, address to, uint256 id, bytes data)",
    "function nextTokenId() view returns (uint256)",
    "function multicall(bytes[] data) payable returns (bytes[] results)",
    "function initializePool(tuple(address,address,uint24,int24,address) key, uint160 sqrtPriceX96) payable returns (int24)",
    "function permitBatch(address owner, tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce)[] details, address spender, uint256 sigDeadline) _permitBatch, bytes signature) payable returns (bytes err)",
  ];
  const LOCK_ABI = [
    "function collectFees(uint256 lockId)", "function extend(uint256 lockId, uint64 newUnlockAt)", "function withdraw(uint256 lockId)",
  ];
  const coder = () => ethers.AbiCoder.defaultAbiCoder();
  const KEY_T = "tuple(address,address,uint24,int24,address)";
  const kt = (k) => [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks];

  // ---- modifyLiquidities payloads (v4-periphery Actions) ----
  const A = { INCREASE: 0x00, DECREASE: 0x01, MINT: 0x02, BURN: 0x03, SETTLE_PAIR: 0x0d, TAKE_PAIR: 0x11, SWEEP: 0x14 };
  const pack = (acts, params) => coder().encode(["bytes", "bytes[]"], ["0x" + acts.map((a) => a.toString(16).padStart(2, "0")).join(""), params]);
  function mintData(k, tl, tu, liq, m0, m1, owner) {
    const acts = [A.MINT, A.SETTLE_PAIR], params = [
      coder().encode([KEY_T, "int24", "int24", "uint256", "uint128", "uint128", "address", "bytes"], [kt(k), tl, tu, liq, m0, m1, owner, "0x"]),
      coder().encode(["address", "address"], [k.currency0, k.currency1]),
    ];
    if (lc(k.currency0) === NATIVE) { acts.push(A.SWEEP); params.push(coder().encode(["address", "address"], [NATIVE, owner])); }
    return pack(acts, params);
  }
  function increaseData(k, id, liq, m0, m1, owner) {
    const acts = [A.INCREASE, A.SETTLE_PAIR], params = [
      coder().encode(["uint256", "uint256", "uint128", "uint128", "bytes"], [id, liq, m0, m1, "0x"]),
      coder().encode(["address", "address"], [k.currency0, k.currency1]),
    ];
    if (lc(k.currency0) === NATIVE) { acts.push(A.SWEEP); params.push(coder().encode(["address", "address"], [NATIVE, owner])); }
    return pack(acts, params);
  }
  function decreaseData(k, id, liq, min0, min1, to, burn) {
    const first = burn ? coder().encode(["uint256", "uint128", "uint128", "bytes"], [id, min0, min1, "0x"]) : coder().encode(["uint256", "uint256", "uint128", "uint128", "bytes"], [id, liq, min0, min1, "0x"]);
    return pack([burn ? A.BURN : A.DECREASE, A.TAKE_PAIR], [first, coder().encode(["address", "address", "address"], [k.currency0, k.currency1, to])]);
  }

  // ---- number display ----
  function fmtRaw(raw, dec, max = 4) {
    const n = Number(ethers.formatUnits(B(raw), dec));
    return fmtNum(n, max);
  }
  function fmtNum(n, max = 4) {
    if (!isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    if (a > 0 && a < 1e-4) return n.toPrecision(3);
    return n.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 6 : max });
  }
  const fmtPrice = (p) => (!isFinite(p) || !p ? "—" : p >= 1 ? fmtNum(p, 4) : p.toPrecision(4));
  const usd = (n) => (n == null ? "—" : "$" + fmtNum(n, 2));

  // ---- state ----
  let D = null, busyLoad = false, tokenAddr = "", pollT = null;
  let skew = 0; // the chain's clock minus this device's (locks end on chain time)
  const cnow = () => now() + skew;
  const prevStats = new Map(); // pool id → last shown stats, to flash what changed
  const prevCounts = new Map(); // count-up start values
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const poolView = new Map(); // pool id → { sort, all }
  // slippage, per viewer (this browser only)
  const SLIPS = [50, 100, 300];
  let slipBps = 100;
  try { const v = Number(localStorage.getItem("arcircle.liq.slip")); if (SLIPS.includes(v)) slipBps = v; } catch { /* default */ }
  const setSlip = (v) => { slipBps = v; try { localStorage.setItem("arcircle.liq.slip", String(v)); } catch { /* per session */ } };
  const slipHtml = () => `<div class="alq-slip"><span>${T("Max price move")}</span>${SLIPS.map((v) => `<button type="button" data-slip="${v}" aria-pressed="${v === slipBps}" data-no-i18n>${v / 100}%</button>`).join("")}</div>`;
  const priceAtTick = (p, t) => Lq.priceOf(Lq.sqrtAtTick(t), p.tokenIs0, p.key ? decimals0(p) : 18, p.key ? decimals1(p) : 18);
  const decimals0 = (p) => (p.tokenIs0 ? D.token.decimals : p.quote.decimals);
  const decimals1 = (p) => (p.tokenIs0 ? p.quote.decimals : D.token.decimals);

  // ================= shell =================
  panel.querySelector("#alq-out").innerHTML = "";
  $("alq-form").addEventListener("submit", (e) => { e.preventDefault(); load($("alq-addr").value.trim()); });
  const chips = [];
  if (CONFIG.ARCIRCLE_TOKEN) chips.push(["$ARCIRCLE", CONFIG.ARCIRCLE_TOKEN]);
  $("alq-chips").innerHTML = chips.map(([l, a]) => `<button type="button" class="ams-chip" data-t="${esc(a)}" data-no-i18n>${esc(l)}</button>`).join("");
  $("alq-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { $("alq-addr").value = b.dataset.t; load(b.dataset.t); } });

  function status(html, kind) {
    const el = $("alq-status");
    el.hidden = !html; el.className = "alq-status" + (kind ? " " + kind : ""); el.innerHTML = html || "";
  }

  async function load(addr, { quiet = false } = {}) {
    addr = lc(addr);
    if (!/^0x[0-9a-f]{40}$/.test(addr)) { status(T("Paste a token contract address (0x…)."), "bad"); return; }
    if (busyLoad) return;
    busyLoad = true; tokenAddr = addr;
    if (quiet) feedMem.delete(addr); // after a transaction here: the activity list is out of date
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#liquidity?token=${addr}`);
    if (!quiet) { status(`<span class="alq-spin"></span>${T("Reading pools and positions…")}`); if (!D || D.token.address !== addr) $("alq-out").innerHTML = skeleton(); }
    try {
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`${API}?liq=${addr}${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (j.done) { D = j; if (j.at) skew = Math.abs(j.at - now()) > 90 ? j.at - now() : 0; break; }
        if (!quiet) status(`<span class="alq-spin"></span>${T("Indexing liquidity positions…")} <b data-no-i18n>${Math.round((j.progress || 0) * 100)}%</b><small>${T("The first look at a token reads every position on Arc — later visits are instant.")}</small>`);
      }
      if (!D || D.token.address !== addr) throw new Error("the index is still catching up — try again in a minute");
      status("");
      const fresh = !prevStats.size || [...prevStats.keys()].every((k) => !D.pools.some((p) => p.id === k));
      if (fresh) { prevStats.clear(); prevCounts.clear(); }
      $("alq-out").classList.toggle("alq-quiet", !fresh); // a reload of the same token: no entrance replay
      render();
      if (!fresh) flashChanges();
      for (const p of D.pools) prevStats.set(p.id, statsOf(p));
    } catch (e) {
      status(`${T("Couldn't read this token's liquidity")} — <span data-no-i18n>${esc(String(e.message || e).slice(0, 140))}</span>`, "bad");
    } finally { busyLoad = false; }
  }
  const skeleton = () => `<div class="alq-skel"><i></i><i></i><i></i></div>`;

  // ================= render =================
  function kindChip(q) {
    if (q.kind === "locked") return `<span class="alq-chip lock">${T("Locked until")} <b data-no-i18n>${esc(date(q.lock.unlockAt))}</b></span>`;
    if (q.kind === "unlocking") return `<span class="alq-chip warn">${T("Lock ended")}</span>`;
    if (q.kind === "forever") return `<span class="alq-chip lock">${T("Locked forever")}</span>`;
    if (q.kind === "burn") return `<span class="alq-chip burn">${T("Burned")}</span>`;
    return `<span class="alq-chip free">${T("Unlocked")}</span>`;
  }
  function rangeText(p, q) {
    if (q.full) return T("Full range");
    const a = priceAtTick(p, q.tl), b = priceAtTick(p, q.tu);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return `<span data-no-i18n>${fmtPrice(lo)} – ${fmtPrice(hi)}</span>`;
  }
  function bar(sh) {
    const seg = (cls, v, label) => (v > 0 ? `<i class="${cls}" style="width:${Math.max(v, 0.6)}%" title="${esc(tr(label))} ${v.toFixed(1)}%"></i>` : "");
    return `<div class="alq-bar">${seg("lock", sh.locked, "Locked")}${seg("burn", sh.burned, "Burned")}${seg("free", sh.free, "Unlocked")}</div>
      <div class="alq-legend"><span class="lock"><i></i>${T("Locked")} <b data-no-i18n>${sh.locked.toFixed(1)}%</b></span><span class="burn"><i></i>${T("Burned")} <b data-no-i18n>${sh.burned.toFixed(1)}%</b></span><span class="free"><i></i>${T("Unlocked")} <b data-no-i18n>${sh.free.toFixed(1)}%</b></span></div>`;
  }
  function poolCard(p, i) {
    const sym = esc(D.token.symbol), qs = p.quote ? esc(p.quote.symbol) : "?";
    const zeroFee = p.key && p.key.fee === 0;
    // per-pool view: sort + how many rows
    const pv = poolView.get(p.id) || { sort: "size", all: false };
    const rank = { locked: 0, forever: 0, burn: 1, unlocking: 2, wallet: 3 };
    const list = p.positions.slice().sort((a, b) => pv.sort === "locked" ? (rank[a.kind] - rank[b.kind]) || (B(b.liquidity) > B(a.liquidity) ? 1 : -1)
      : pv.sort === "mine" ? (Number(b.mine) - Number(a.mine)) || (B(b.liquidity) > B(a.liquidity) ? 1 : -1) : 0);
    const shown = pv.all ? list : list.slice(0, 8);
    const L = (k) => ` data-l="${T(k)}"`;
    const posRows = shown.map((q) => `
      <tr class="${q.mine ? "mine" : ""}" data-pos="${q.id}">
        <td${L("Position")} data-no-i18n><a href="${explorer("nft", PM)}/${q.id}" target="_blank" rel="noopener">#${q.id}</a></td>
        <td${L("Owner")}>${q.mine ? `<b>${T("You")}</b>` : q.label ? T(q.label) : `<a href="${explorer("address", q.owner)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(q.owner))}</a>`}</td>
        <td${L("Price range")}>${rangeText(p, q)}${q.inRange ? "" : ` <em class="alq-out-range">${T("out of range")}</em>`}</td>
        <td${L("Holds")} data-no-i18n>${fmtRaw(q.token, D.token.decimals)} ${sym}<br><small>${fmtRaw(q.quote, p.quote ? p.quote.decimals : 18)} ${qs}</small></td>
        <td${L("Status")}>${kindChip(q)}</td>
      </tr>`).join("");
    const sorts = p.positions.length > 1 ? `<div class="alq-sort" role="group">${[["size", "Largest first"], ["locked", "Locked first"], ["mine", "Mine first"]].map(([k, l]) => `<button type="button" data-sort="${k}" data-pool-id="${esc(p.id)}" aria-pressed="${pv.sort === k}">${T(l)}</button>`).join("")}</div>` : "";
    const more = p.positions.length > 8 ? `<button type="button" class="alq-more-btn" data-all="${esc(p.id)}">${pv.all ? T("Show fewer") : `${T("Show all")} <b data-no-i18n>${p.positions.length}</b>`}</button>` : "";
    const notes = [];
    if (p.share.launch > 0) notes.push(T("Includes the ArcPad launch liquidity — held by the factory, which has no way to withdraw it."));
    if (p.share.other > 0) notes.push(T("Part of the liquidity isn't a position NFT (added straight to the pool) — counted as unlocked."));
    if (zeroFee) notes.push(T("This pool's LP fee is 0% — ArcPad's hook takes the trading fee, so liquidity added here earns nothing."));
    return `<article class="alq-pool" data-pool="${esc(p.id)}" style="--d:${i * 70}ms">
      <div class="alq-pool-h">
        <div class="alq-pair"><span class="alq-av a">${sym.slice(0, 1)}</span><span class="alq-av b">${qs.slice(0, 1)}</span><h3 data-no-i18n>${sym} / ${qs}</h3></div>
        <div class="alq-tags"><span class="alq-tag">${T(p.venue)}</span>${p.feePct != null ? `<span class="alq-tag" data-no-i18n>${p.feePct}%</span>` : `<span class="alq-tag">${T("Dynamic fee")}</span>`}
          <button type="button" class="alq-id" data-copy="${esc(p.id)}" title="${T("Copy pool id")}" data-no-i18n>${esc(p.id.slice(0, 10))}…</button></div>
      </div>
      <div class="alq-stats">
        <div data-stat="price"><small>${T("Price")}</small><b data-no-i18n>${fmtPrice(p.price)} ${qs}</b><span data-no-i18n>1 ${sym}</span></div>
        <div data-stat="liq"><small>${T("Liquidity")}</small><b data-no-i18n>${p.dex ? usd(p.dex.liqUsd) : "—"}</b><span>${p.dex ? T("Dexscreener") : T("not listed yet")}</span></div>
        <div data-stat="held"><small>${T("In LP positions")}</small><b data-no-i18n>${fmtRaw(p.inPositions.token, D.token.decimals)} ${sym}</b><span data-no-i18n>${fmtRaw(p.inPositions.quote, p.quote ? p.quote.decimals : 18)} ${qs}</span></div>
        <div data-stat="count"><small>${T("Positions")}</small><b data-no-i18n>${p.positionCount}</b><span>${p.dex && p.dex.vol ? `<span data-no-i18n>${usd(p.dex.vol)}</span> ${T("24h volume")}` : "&nbsp;"}</span></div>
      </div>
      <div class="alq-lockbox"><div class="alq-lockhead"><b>${T("Who can pull this liquidity")}</b><small>${T("Share of the liquidity trading at the current price")}</small></div>${bar(p.share)}${notes.length ? `<ul class="alq-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}</div>
      ${depth(p)}
      ${p.positions.length ? `${sorts}<div class="alq-tablewrap"><table class="alq-table"><thead><tr><th>${T("Position")}</th><th>${T("Owner")}</th><th>${T("Price range")}</th><th>${T("Holds")}</th><th>${T("Status")}</th></tr></thead><tbody>${posRows}</tbody></table>${more}</div>` : `<p class="alq-empty">${T("No position NFTs in this pool yet.")}</p>`}
      <div class="alq-pool-f">
        ${p.manageable ? `<button type="button" class="bp-btn-primary" data-add="${esc(p.id)}">${T("Add liquidity")}</button>` : `<span class="alq-muted">${T("This pool's settings couldn't be read, so it can't be managed here.")}</span>`}
        ${p.dex && p.dex.url ? `<a class="bp-btn-ghost" href="${esc(p.dex.url)}" target="_blank" rel="noopener">${T("Chart")} ↗</a>` : ""}
      </div>
    </article>`;
  }
  function myCard(p, q) {
    const sym = esc(D.token.symbol), qs = p.quote ? esc(p.quote.symbol) : "?";
    const locked = q.kind === "locked" || q.kind === "unlocking";
    let acts = "";
    if (!locked && q.kind === "wallet") {
      acts = `<button type="button" class="alq-act" data-increase="${q.id}">${T("Add more")}</button><button type="button" class="alq-act" data-remove="${q.id}">${T("Remove")}</button><button type="button" class="alq-act" data-collect="${q.id}">${T("Collect fees")}</button>` +
        (LPLOCK ? `<button type="button" class="alq-act lock" data-lock="${q.id}">${T("Lock")}</button>` : "");
    } else if (locked && q.lock) {
      acts = `<button type="button" class="alq-act" data-lcollect="${q.lock.lockId}">${T("Collect fees")}</button>` +
        (q.kind === "unlocking" ? `<button type="button" class="alq-act lock" data-lwithdraw="${q.lock.lockId}">${T("Withdraw")}</button>` : `<button type="button" class="alq-act" data-lextend="${q.lock.lockId}" data-at="${q.lock.unlockAt}">${T("Extend +90 days")}</button>`) +
        `<button type="button" class="alq-act share" data-lshare="${q.lock.lockId}">${T("Share the lock")}</button>`;
    }
    return `<div class="alq-mine-card${locked ? " locked" : ""}" data-pos="${q.id}">
      <div class="alq-mine-top"><b data-no-i18n>#${q.id}</b><span data-no-i18n>${sym} / ${qs}</span>${kindChip(q)}${locked && q.lock ? ring(q.lock) : ""}</div>
      <div class="alq-mine-amt" data-no-i18n><b>${fmtRaw(q.token, D.token.decimals)} ${sym}</b><span>+ ${fmtRaw(q.quote, p.quote ? p.quote.decimals : 18)} ${qs}</span></div>
      ${q.fees && (B(q.fees.token) > 0n || B(q.fees.quote) > 0n) ? `<div class="alq-fees"><small>${T("Unclaimed fees")}</small><b data-no-i18n>${fmtRaw(q.fees.token, D.token.decimals)} ${sym} + ${fmtRaw(q.fees.quote, p.quote ? p.quote.decimals : 18)} ${qs}</b></div>` : ""}
      <div class="alq-mine-meta">${rangeText(p, q)}${q.inRange ? ` · <span class="alq-earn">${T("earning")}</span>` : ` · <em class="alq-out-range">${T("out of range")}</em>`}</div>
      <div class="alq-mine-acts">${acts}</div>
    </div>`;
  }
  function render() {
    if (!D) return;
    const t = D.token;
    const mine = [];
    for (const p of D.pools) for (const q of p.positions) if (q.mine) mine.push([p, q]);
    const launch = D.launch ? `<span class="alq-tag">${T("Launched on")} <b data-no-i18n>${esc(D.launch.venue)}</b></span>` : "";
    $("alq-out").innerHTML = `
      <div class="alq-token">
        <div><h2 data-no-i18n>${esc(t.symbol)} <small>${esc(t.name)}</small></h2><a href="${explorer("token", t.address)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(t.address))} ↗</a> ${launch}</div>
        <div class="alq-token-links">
          <a class="alq-link" href="#scanner?t=${esc(t.address)}" data-go="scanner">${T("Scan this token")}</a>
          <a class="alq-link" href="#locker?token=${esc(t.address)}" data-go="locker">${T("Token locks")}</a>
          <button type="button" class="alq-link" data-create>${T("New pool")}</button>
          <button type="button" class="alq-link" data-refresh>${T("Refresh")}</button>
        </div>
      </div>
      ${D.pools.length ? summary() + `<div id="alq-alert"></div>` + timeline() : ""}
      ${me() ? `<section class="alq-mine"><h3>${T("Your positions")} <b data-no-i18n>${mine.length}</b></h3>${mine.length ? `<div class="alq-mine-grid">${mine.map(([p, q]) => myCard(p, q)).join("")}</div>` : `<p class="alq-empty">${T("This wallet has no liquidity positions in these pools yet.")}</p>`}</section>` : `<p class="alq-connect">${T("Connect a wallet to add liquidity or manage your own positions.")} <button type="button" class="ams-mini" data-connect>${T("Connect wallet")}</button></p>`}
      ${D.pools.length ? D.pools.map(poolCard).join("") : `<div class="alq-none"><b>${T("No Uniswap v4 pool found for this token.")}</b><p>${T("Launch it on ArcPad and it gets a pool right away.")}</p><div class="alq-none-acts"><button type="button" class="bp-btn-primary" data-create>${T("Create a pool")}</button><a class="bp-btn-ghost" href="#launch" data-go="launch">${T("Launch a coin")}</a></div></div>`}
      ${D.pools.some((p) => p.key) ? `<section class="alq-feed" id="alq-feed"><div class="alq-feed-h"><b>${T("Liquidity activity")}</b><small>${T("Last 24 hours · adds, removals and LP locks in these pools")}</small></div><div class="alq-feed-body"><span class="alq-spin"></span></div></section>` : ""}
      ${D.external.length ? `<p class="alq-muted">${T("Also trading on")}: ${D.external.map((x) => `<a href="${esc(x.url || "#")}" target="_blank" rel="noopener" data-no-i18n>${esc(x.dex)}</a>`).join(", ")}</p>` : ""}
      ${LPLOCK ? "" : `<p class="alq-muted alq-soon">${T("LP locking opens once the ArcLPLock contract is live. Locks by launchpads and burned positions already show here.")}</p>`}`;
    countUp($("alq-out"));
    tickRings();
    paintFeed();
    if (focusLock != null) {
      const id = focusLock; focusLock = null;
      for (const p of D.pools) {
        const q = p.positions.find((x) => x.lock && x.lock.lockId === id);
        const row = q && $("alq-out").querySelector(`tr[data-pos="${q.id}"], .alq-mine-card[data-pos="${q.id}"]`);
        if (row) { row.classList.add("alq-focus"); setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "center" }), 300); break; }
      }
    }
  }

  // re-draw one pool card in place (sort / show all) without replaying the entrance animations
  function repaintPool(id) {
    const i = D.pools.findIndex((x) => x.id === id);
    const el = [...$("alq-out").querySelectorAll("article.alq-pool")].find((a) => a.dataset.pool === id);
    if (i < 0 || !el) { render(); return; }
    const tmp = document.createElement("div");
    tmp.innerHTML = poolCard(D.pools[i], i);
    const card = tmp.firstElementChild;
    card.classList.add("alq-still");
    el.replaceWith(card);
  }

  // ================= moments =================
  const mineIds = () => (D ? D.pools.flatMap((p) => p.positions.filter((q) => q.mine).map((q) => q.id)) : []);
  // a drop falls into the position that just grew (or a lock clicks shut on it)
  function celebrate(kind, id) {
    document.dispatchEvent(new CustomEvent("arc:liquidity", { detail: { kind, id } }));
    const card = id != null && $("alq-out").querySelector(`.alq-mine-card[data-pos="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
    if (reduce()) return;
    const cls = kind === "lock" ? "alq-locked-now" : "alq-drop";
    card.classList.remove(cls); void card.offsetWidth; card.classList.add(cls);
    if (kind !== "lock") { const d = document.createElement("span"); d.className = "alq-droplet"; d.setAttribute("aria-hidden", "true"); card.appendChild(d); }
    setTimeout(() => { card.classList.remove(cls); card.querySelectorAll(".alq-droplet").forEach((x) => x.remove()); }, 1800);
  }
  // numbers roll up to their value (from what was shown last time)
  function countUp(root) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      const to = Number(el.dataset.count), key = el.dataset.key || "", fmt = el.dataset.fmt;
      const show = (v) => (fmt === "pct" ? v.toFixed(1) + "%" : fmt === "usd" ? usd(v) : fmtNum(Math.round(v), 0));
      const from = prevCounts.has(key) ? prevCounts.get(key) : 0;
      prevCounts.set(key, to);
      if (reduce() || from === to || !isFinite(to)) { el.textContent = show(to); return; }
      const t0 = performance.now(), dur = 800;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = show(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
      el.textContent = show(from); requestAnimationFrame(step);
    });
  }
  // pool numbers that moved since the last look glow for a moment
  const statsOf = (p) => ({ price: String(p.sqrtP), liq: p.dex ? String(p.dex.liqUsd) : "", held: `${p.inPositions.token}|${p.inPositions.quote}`, count: String(p.positionCount) });
  function flashChanges() {
    if (reduce()) return;
    for (const p of D.pools) {
      const was = prevStats.get(p.id), s2 = statsOf(p);
      if (!was) continue;
      const card = [...$("alq-out").querySelectorAll("article.alq-pool")].find((a) => a.dataset.pool === p.id);
      if (!card) continue;
      for (const k of Object.keys(s2)) if (was[k] !== s2[k]) { const el = card.querySelector(`[data-stat="${k}"]`); if (el) { el.classList.add("alq-flash"); setTimeout(() => el.classList.remove("alq-flash"), 1600); } }
    }
  }
  // ---- time left on a lock ----
  const leftText = (sec) => {
    if (sec <= 0) return tr("ended");
    const d = Math.floor(sec / DAY), h = Math.floor((sec % DAY) / 3600), m = Math.floor((sec % 3600) / 60);
    return d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
  };
  const ringPct = (l) => Math.max(0, Math.min(100, ((cnow() - l.lockedAt) / Math.max(1, l.unlockAt - l.lockedAt)) * 100));
  function ring(l) {
    const pc = ringPct(l);
    return `<span class="alq-ring" data-until="${l.unlockAt}" data-from="${l.lockedAt}" title="${T("Time until it unlocks")}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.9"/><circle class="fg" cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="${(100 - pc).toFixed(2)} 100"/></svg><b data-no-i18n>${esc(leftText(l.unlockAt - cnow()))}</b></span>`;
  }
  function tickRings() {
    $("alq-out").querySelectorAll("[data-until]").forEach((el) => {
      const l = { unlockAt: Number(el.dataset.until), lockedAt: Number(el.dataset.from || 0) };
      const b = el.querySelector("b"), fg = el.querySelector(".fg");
      if (b) b.textContent = leftText(l.unlockAt - cnow());
      if (fg && el.dataset.from) fg.setAttribute("stroke-dasharray", `${(100 - ringPct(l)).toFixed(2)} 100`);
    });
  }
  setInterval(() => { if (D && panel.classList.contains("active")) tickRings(); }, 30000);

  // ================= liquidity activity =================
  // adds and removals (PoolManager ModifyLiquidity) and ArcLPLock locks in
  // this token's pools; a removal of 20%+ of a pool's liquidity is flagged.
  const feedMem = new Map(); // token → { at, data | null, busy }
  let feedAll = false;
  function paintFeed() {
    const box = $("alq-feed");
    if (!box || !D) return;
    const t = D.token.address, f = feedMem.get(t);
    if (!f || (!f.busy && Date.now() - f.at > 30e3)) { loadFeed(t); if (!f || !f.data) return; }
    if (f.data) drawFeed(f.data); else if (f.err) box.querySelector(".alq-feed-body").innerHTML = `<p class="alq-muted">${T("Couldn't read recent activity right now.")}</p>`;
  }
  async function loadFeed(t) {
    const f = feedMem.get(t) || { at: 0, data: null };
    if (f.busy) return; f.busy = true; feedMem.set(t, f);
    try {
      const ids = D.pools.filter((p) => p.key).map((p) => p.id).join(",");
      const r = await fetch(`${API}?liqfeed=${ids}&h=24`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      f.data = j; f.err = null;
    } catch (e) { f.err = String(e.message || e); }
    f.busy = false; f.at = Date.now();
    if (D && D.token.address === t) { if (f.data) drawFeed(f.data); else paintFeed(); }
  }
  function drawFeed(F) {
    const box = $("alq-feed");
    if (!box) return;
    const byId = new Map(), byLock = new Map();
    for (const p of D.pools) for (const q of p.positions) { byId.set(q.id, [p, q]); if (q.lock) byLock.set(q.lock.lockId, [p, q]); }
    const tsOf = (b) => F.anchor.ts - (F.anchor.block - b) * F.spb;
    const ago = (b) => { const s2 = Math.max(0, Date.now() / 1000 + skew - tsOf(b)); return s2 < 90 ? tr("just now") : s2 < 5400 ? `${Math.round(s2 / 60)}${tr("m ago")}` : `${Math.round(s2 / 3600)}${tr("h ago")}`; };
    let pulled = 0;
    const rows = [];
    for (const e of F.events) {
      if (e.k === "add" || e.k === "remove") {
        const p = D.pools.find((x) => x.id === e.pool);
        if (!p || !p.key) continue;
        const [a0, a1] = Lq.amountsFor(B(p.sqrtP), e.tl, e.tu, B(e.liq));
        const tokAmt = p.tokenIs0 ? a0 : a1, qAmt = p.tokenIs0 ? a1 : a0;
        const inR = e.tl <= p.tick && p.tick < e.tu, act = B(p.liquidity);
        // share of the pool's liquidity at today's price (for a removal: of what was there before it)
        const share = inR && act > 0n ? Number((B(e.liq) * 10000n) / (e.k === "remove" ? act + B(e.liq) : act)) / 100 : 0;
        const big = e.k === "remove" && share >= 20;
        if (e.k === "remove") pulled += share;
        const who = e.id != null ? (byId.has(e.id) && byId.get(e.id)[1].mine ? tr("You") : `#${e.id}`) : e.sender && lc(e.sender) === lc(Lq.LIQ_ADDR.arcpadFactory) ? tr("ArcPad launch") : short(e.sender);
        rows.push(`<li class="${e.k}${big ? " big" : ""}"><i class="alq-fi" aria-hidden="true">${e.k === "add" ? "+" : "−"}</i>
          <div><b>${T(e.k === "add" ? "Added" : "Removed")}</b> <span data-no-i18n>${fmtRaw(tokAmt, D.token.decimals)} ${esc(D.token.symbol)} + ${fmtRaw(qAmt, p.quote.decimals)} ${esc(p.quote.symbol)}</span>${big ? ` <span class="alq-chip warn">${T("Large removal")}</span>` : ""}
          <small><span data-no-i18n>${esc(who)}</span>${share ? ` · <span data-no-i18n>${share < 0.1 ? "<0.1" : share.toFixed(1)}%</span> ${T("of the pool")}` : ""} · ${T("≈ at today's price")}</small></div>
          <a href="${explorer("tx", e.h)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(e.b))} ↗</a></li>`);
      } else {
        const hit = e.id != null ? byId.get(e.id) : byLock.get(e.lockId);
        if (!hit) continue;
        const [, q] = hit;
        const label = e.k === "lock" ? `${tr("Locked until")} ${date(e.unlockAt)}` : e.k === "extend" ? `${tr("Lock extended to")} ${date(e.unlockAt)}` : tr("Lock withdrawn");
        rows.push(`<li class="${e.k}"><i class="alq-fi" aria-hidden="true">${e.k === "withdraw" ? "!" : "L"}</i>
          <div><b data-no-i18n>${esc(label)}</b><small data-no-i18n>#${q.id}${q.mine ? ` · ${esc(tr("You"))}` : ""}</small></div>
          <a href="${explorer("tx", e.h)}" target="_blank" rel="noopener" data-no-i18n>${esc(ago(e.b))} ↗</a></li>`);
      }
    }
    const many = rows.length > 8;
    box.querySelector(".alq-feed-body").innerHTML = rows.length ? `<ul class="alq-feed-list${feedAll ? " all" : ""}">${rows.slice(0, 30).join("")}</ul>${many ? `<button type="button" class="alq-more-btn" data-feed-all>${feedAll ? T("Show fewer") : `${T("Show all")} <b data-no-i18n>${Math.min(30, rows.length)}</b>`}</button>` : ""}` : `<p class="alq-muted">${T("No liquidity was added or removed in the last 24 hours.")}</p>`;
    const al = $("alq-alert");
    if (al) al.innerHTML = pulled >= 20 ? `<div class="alq-rug" role="alert"><b>${T("Liquidity was pulled")}</b><span><span data-no-i18n>${Math.min(100, pulled).toFixed(0)}%</span> ${T("of a pool's liquidity was removed in the last 24 hours.")}</span><button type="button" class="alq-link" data-jump-feed>${T("See activity")}</button></div>` : "";
  }

  // ================= overview =================
  // one card over all pools: how much can't be pulled, how deep, what unlocks next
  function summary() {
    const pools = D.pools.filter((p) => p.key);
    if (!pools.length) return "";
    const withUsd = pools.filter((p) => p.dex && p.dex.liqUsd > 0);
    const w = (p) => (withUsd.length ? (p.dex && p.dex.liqUsd > 0 ? p.dex.liqUsd : 0) : p === pools[0] ? 1 : 0);
    const W = pools.reduce((a, p) => a + w(p), 0) || 1;
    const safe = pools.reduce((a, p) => a + w(p) * (p.share.locked + p.share.burned), 0) / W;
    const liqUsd = withUsd.reduce((a, p) => a + p.dex.liqUsd, 0);
    const count = pools.reduce((a, p) => a + p.positionCount, 0);
    const locks = pools.flatMap((p) => p.positions.filter((q) => q.lock && q.lock.unlockAt > cnow()));
    const next = locks.sort((a, b) => a.lock.unlockAt - b.lock.unlockAt)[0];
    const tone = safe >= 80 ? "good" : safe >= 40 ? "mid" : "bad";
    const verdict = safe >= 80 ? "Most of the liquidity can't be pulled" : safe >= 40 ? "Part of the liquidity can be pulled" : "Most of the liquidity can be pulled";
    const key = D.token.address;
    return `<section class="alq-sum ${tone}">
      <div class="alq-gauge" style="--v:${safe.toFixed(2)}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${safe.toFixed(2)} 100"/></svg>
        <div><b data-count="${safe.toFixed(2)}" data-fmt="pct" data-key="${key}:safe" data-no-i18n>${safe.toFixed(1)}%</b><small>${T("locked or burned")}</small></div></div>
      <div class="alq-sum-body">
        <b class="alq-sum-verdict">${T(verdict)}</b>
        <div class="alq-sum-grid">
          <div><small>${T("Liquidity")}</small><b data-no-i18n ${liqUsd ? `data-count="${liqUsd}" data-fmt="usd" data-key="${key}:usd"` : ""}>${liqUsd ? usd(liqUsd) : "—"}</b></div>
          <div><small>${T("Pools")}</small><b data-no-i18n>${pools.length}</b></div>
          <div><small>${T("Positions")}</small><b data-no-i18n data-count="${count}" data-fmt="int" data-key="${key}:count">${count}</b></div>
          <div><small>${T("Next unlock")}</small>${next ? `<b data-no-i18n data-until="${next.lock.unlockAt}"><b>${esc(leftText(next.lock.unlockAt - cnow()))}</b></b>` : `<b>${T("No time locks")}</b>`}</div>
        </div>
      </div>
    </section>`;
  }
  // every lock on one line: when each unlocks, and how much of its pool it holds
  function timeline() {
    const items = [], forever = [];
    for (const p of D.pools) for (const q of p.positions) {
      const share = q.inRange && B(p.liquidity) > 0n ? Number((B(q.liquidity) * 10000n) / B(p.liquidity)) / 100 : 0;
      if (q.kind === "forever") forever.push({ q, p, share });
      else if (q.lock) items.push({ q, p, share, at: q.lock.unlockAt });
    }
    if (!items.length && !forever.length) return "";
    const t0 = cnow();
    const end = Math.max(t0 + 30 * DAY, ...items.map((x) => x.at)) + 3 * DAY;
    const x = (t) => Math.max(0, Math.min(100, ((t - t0) / (end - t0)) * 100));
    const sym = esc(D.token.symbol);
    const dots = items.map((it) => {
      const sz = Math.round(10 + Math.min(14, Math.sqrt(it.share) * 2.2));
      const past = it.at <= t0;
      return `<button type="button" class="alq-tl-dot${past ? " past" : ""}${it.q.mine ? " mine" : ""}" style="left:${x(it.at).toFixed(2)}%;--s:${sz}px" data-focus-pos="${it.q.id}" title="#${it.q.id} · ${esc(date(it.at))} · ${it.share.toFixed(1)}%" data-no-i18n></button>`;
    }).join("");
    const soon = items.filter((it) => it.at > t0).sort((a, b) => a.at - b.at).slice(0, 4);
    const month = (k) => `<span class="alq-tl-tick" style="left:${x(t0 + k * 30 * DAY).toFixed(2)}%" data-no-i18n>${esc(new Date((t0 + k * 30 * DAY) * 1000).toLocaleDateString(undefined, { month: "short", year: "2-digit" }))}</span>`;
    const months = []; for (let k = 1; t0 + k * 30 * DAY < end - 10 * DAY && k < 60; k += Math.max(1, Math.ceil((end - t0) / (30 * DAY) / 6))) months.push(month(k));
    return `<section class="alq-tl">
      <div class="alq-tl-h"><b>${T("Unlock timeline")}</b><small>${T("Each dot is a locked position — bigger means more of its pool's liquidity.")}</small></div>
      <div class="alq-tl-track"><span class="alq-tl-now">${T("Now")}</span>${months.join("")}${dots}${forever.length ? `<span class="alq-tl-forever">${T("Forever")} <b data-no-i18n>${forever.length}</b></span>` : ""}</div>
      ${soon.length ? `<ul class="alq-tl-list">${soon.map((it) => `<li><button type="button" data-focus-pos="${it.q.id}"><b data-no-i18n>${esc(date(it.at))}</b><span data-no-i18n>#${it.q.id} · ${sym} / ${esc(it.p.quote ? it.p.quote.symbol : "?")}</span><em data-no-i18n>${it.share.toFixed(1)}%</em><i data-until="${it.at}"><b data-no-i18n>${esc(leftText(it.at - t0))}</b></i></button></li>`).join("")}</ul>` : ""}
    </section>`;
  }

  // ================= depth chart =================
  // liquidity at every price near the current one: the pool's own curve
  // (PoolManager ticks), split into what the position NFTs there are —
  // locked, burned, free — and what isn't an NFT (an ArcPad launch).
  const charts = new Map(); // pool id → { cols, a, b, flip }
  function depth(p) {
    if (!p.key) return "";
    const ts = p.key.tickSpacing, cur = p.tick, minU = Lq.minUsable(ts), maxU = Lq.maxUsable(ts);
    const cv = p.curve && p.curve.ticks && p.curve.ticks.length > 1 ? p.curve : null;
    const edges = cv ? cv.ticks : p.positions.flatMap((q) => [q.tl, q.tu]);
    const MAXW = 69078, MINW = 13863; // ×1000 and ×4 in price
    let wd = 0; for (const t of edges) if (t > minU && t < maxU && Math.abs(t - cur) <= MAXW) wd = Math.max(wd, Math.abs(t - cur));
    wd = Math.min(MAXW, Math.max(MINW, wd * 1.15));
    const a = cur - wd, b = cur + wd, N = 96;
    const at = (t) => { if (!cv) return 0; const T = cv.ticks; let lo = 0, hi = T.length - 1; if (t < T[0] || t >= T[hi]) return 0; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return Number(cv.liq[lo] || 0); };
    const cols = [];
    for (let k = 0; k < N; k++) {
      const t = a + ((k + 0.5) * (b - a)) / N;
      const c = { t, lock: 0, burn: 0, free: 0, mine: 0 };
      for (const q of p.positions) {
        if (!(q.tl <= t && t < q.tu)) continue;
        const L = Number(q.liquidity);
        if (q.kind === "locked" || q.kind === "forever") c.lock += L; else if (q.kind === "burn") c.burn += L; else c.free += L;
        if (q.mine) c.mine += L;
      }
      const nft = c.lock + c.burn + c.free;
      c.total = Math.max(at(t), nft); c.rest = c.total - nft;
      cols.push(c);
    }
    const max = Math.max(...cols.map((c) => c.total));
    if (!(max > 0)) return "";
    const flip = !p.tokenIs0; // prices rise left → right
    const X = (t) => { const f = (t - a) / (b - a); return (flip ? 1 - f : f) * 600; };
    const H = 140, cw = 600 / N;
    const restCls = p.venue === "ArcPad" ? "launch" : "other";
    let rects = "";
    cols.forEach((c, k) => {
      const x0 = (flip ? N - 1 - k : k) * cw;
      let y = H;
      for (const [cls, v] of [["lock", c.lock], ["burn", c.burn], [restCls, c.rest], ["free", c.free]]) {
        if (v <= 0) continue;
        const h = Math.max(0.6, (v / max) * (H - 8));
        y -= h; rects += `<rect class="${cls}" x="${(x0 + 0.5).toFixed(2)}" y="${y.toFixed(2)}" width="${(cw - 1).toFixed(2)}" height="${h.toFixed(2)}"/>`;
      }
    });
    const mineBands = p.positions.filter((q) => q.mine && q.tu > a && q.tl < b).map((q) => {
      const x1 = X(Math.max(q.tl, a)), x2 = X(Math.min(q.tu, b));
      return `<rect class="mine" x="${Math.min(x1, x2).toFixed(2)}" y="0" width="${Math.abs(x2 - x1).toFixed(2)}" height="${H}"/>`;
    }).join("");
    charts.set(p.id, { cols, a, b, flip, p });
    const qs = esc(p.quote.symbol);
    const lo = priceAtTick(p, flip ? b : a), hi = priceAtTick(p, flip ? a : b);
    const has = (k) => cols.some((c) => c[k] > 0);
    const leg = [["lock", "Locked"], ["burn", "Burned"], [restCls, restCls === "launch" ? "ArcPad launch" : "Not a position NFT"], ["free", "Unlocked"]].filter(([k]) => has(k === restCls ? "rest" : k));
    return `<div class="alq-depth" data-depth="${esc(p.id)}">
      <div class="alq-depth-h"><b>${T("Liquidity by price")}</b><small class="alq-depth-read" data-no-i18n>${esc(tr("Hover the chart for a price"))}</small></div>
      <svg viewBox="0 0 600 ${H}" preserveAspectRatio="none" role="img" aria-label="${T("Liquidity by price")}"><g class="alq-cols">${rects}</g>${mineBands}<line class="now" x1="${X(cur).toFixed(2)}" x2="${X(cur).toFixed(2)}" y1="0" y2="${H}"/><line class="hover" x1="-10" x2="-10" y1="0" y2="${H}"/></svg>
      <div class="alq-depth-x" data-no-i18n><span>${fmtPrice(lo)}</span><span class="now" style="left:${(X(cur) / 6).toFixed(2)}%">${fmtPrice(p.price)} ${qs}</span><span>${fmtPrice(hi)}</span></div>
      <div class="alq-legend alq-depth-leg">${leg.map(([k, l]) => `<span class="${k}"><i></i>${T(l)}</span>`).join("")}${mineBands ? `<span class="mine"><i></i>${T("Your range")}</span>` : ""}</div>
    </div>`;
  }
  function depthHover(e) {
    const box = e.target.closest(".alq-depth");
    if (!box) return;
    const ch = charts.get(box.dataset.depth), svg = box.querySelector("svg");
    if (!ch || !svg) return;
    const r = svg.getBoundingClientRect();
    const f = Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width));
    const k = Math.floor((ch.flip ? 1 - f : f) * ch.cols.length);
    const c = ch.cols[Math.max(0, Math.min(ch.cols.length - 1, k))];
    const ln = svg.querySelector("line.hover"); ln.setAttribute("x1", (f * 600).toFixed(1)); ln.setAttribute("x2", (f * 600).toFixed(1));
    const pr = priceAtTick(ch.p, c.t);
    const pc = (v) => (c.total > 0 ? ((v / c.total) * 100).toFixed(0) : "0") + "%";
    box.querySelector(".alq-depth-read").textContent = c.total > 0
      ? `${fmtPrice(pr)} ${ch.p.quote.symbol} · ${tr("Locked")} ${pc(c.lock + (ch.p.venue === "ArcPad" ? c.rest : 0))} · ${tr("Unlocked")} ${pc(c.free + (ch.p.venue === "ArcPad" ? 0 : c.rest))}${c.burn ? ` · ${tr("Burned")} ${pc(c.burn)}` : ""}`
      : `${fmtPrice(pr)} ${ch.p.quote.symbol} · ${tr("No liquidity at this price")}`;
  }
  $("alq-out").addEventListener("pointermove", depthHover);
  $("alq-out").addEventListener("pointerdown", depthHover);

  // ================= modal =================
  function modal(title, body) {
    close();
    const m = document.createElement("div");
    m.className = "alq-modal"; m.id = "alq-modal";
    m.innerHTML = `<div class="alq-modal-bg" data-close></div><div class="alq-modal-box" role="dialog" aria-modal="true" aria-labelledby="alq-mt"><div class="alq-modal-h"><h3 id="alq-mt">${title}</h3><button type="button" class="alq-x" data-close aria-label="${T("Close")}">×</button></div><div class="alq-modal-body">${body}</div></div>`;
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add("in"));
    m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
    return m;
  }
  function close() { const m = $("alq-modal"); if (m) { m.classList.remove("in"); setTimeout(() => m.remove(), 200); } }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  async function needWallet() {
    if (!state.account || !state.signer) { if (typeof connectWallet === "function") await connectWallet(); }
    if (!state.account || !state.signer) return false;
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    return true;
  }
  const deadline = () => cnow() + 20 * 60;
  const erc = (a) => new ethers.Contract(a, ERC20, state.signer);

  // ---- add liquidity ----
  const RANGES = [[0, "Full range"], [50, "±50%"], [20, "±20%"], [10, "±10%"]];
  const USD_LIKE = (q) => q && (lc(q.address) === "0x3600000000000000000000000000000000000000" || /usd/i.test(q.symbol || ""));
  // the Token Scanner's verdict for this token (taxes, blocked sells), once per token
  const safeMem = new Map();
  const safety = (t) => { if (!safeMem.has(t)) safeMem.set(t, fetch(`${API}?liqsafe=${t}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return safeMem.get(t); };
  function warnings(p, startPrice) {
    const out = [];
    if (p.key.fee === 0) out.push(T("This pool's LP fee is 0% — ArcPad's hook takes the trading fee, so liquidity added here earns nothing."));
    if (p.venue === "Uniswap v4 · hook") out.push(`${T("This pool runs a hook contract ARCIRCLE PAD doesn't recognise. A hook can change swaps, fees or withdrawals — only add liquidity if you trust it.")} <a href="${explorer("address", p.key.hooks)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(p.key.hooks))} ↗</a>`);
    // pool price vs. the market (Dexscreener), when the pool is priced in dollars
    const mkt = D.pools.map((x) => x.dex && x.dex.price).find((x) => x > 0);
    const here = startPrice != null ? startPrice : p.price;
    if (mkt && here > 0 && USD_LIKE(p.quote)) {
      const dev = Math.abs(here - mkt) / mkt * 100;
      if (dev >= 5) out.push(`${T(startPrice != null ? "Your starting price is far from the market price" : "This pool's price is far from the market price")}: <b data-no-i18n>${fmtPrice(here)}</b> ${T("vs")} <b data-no-i18n>$${fmtPrice(mkt)}</b> (<span data-no-i18n>${dev.toFixed(1)}%</span>). ${T("Arbitrage bots will trade it back to the market price, at your deposit's expense.")}`);
    }
    return out;
  }
  async function taxWarning(el) {
    const d = await safety(D.token.address);
    if (!d || !el.isConnected) return;
    const bad = (d.trade || []).map((x) => x.split("|")).filter(([st, t]) => (st === "risk" || st === "warn") && /tax|fail/i.test(t));
    const lines = [];
    if (bad.length) lines.push(`${T("The Token Scanner found")}: <b>${bad.map(([, t]) => T(t)).join(" · ")}</b>. ${T("A taxed token loses part of every deposit and withdrawal to the tax, and pool math can break.")}`);
    else if (d.k && d.k !== "ok" && d.score != null) lines.push(`${T("Token Scanner verdict")}: <b>${T(d.t)}</b> <span data-no-i18n>(${d.score}/100)</span> — <a href="#scanner?t=${esc(D.token.address)}" data-go="scanner">${T("see why")}</a>`);
    if (lines.length) { el.innerHTML = lines.map((l) => `<p class="alq-warn">${l}</p>`).join(""); el.hidden = false; }
  }
  // pos: add to an existing position of yours (its range is fixed) instead of minting a new one
  // p.create: the pool doesn't exist yet — PositionManager.initializePool first, in the same transaction
  function openAdd(p, pos = null) {
    const sym = esc(D.token.symbol), qs = esc(p.quote.symbol);
    const title = p.create ? T("Create pool") : pos ? T("Add to position") : T("Add liquidity");
    const m = modal(`${title} · <span data-no-i18n>${pos ? `#${pos.id}` : `${sym} / ${qs}`}</span>`, `
      ${warnings(p, p.create ? p.price : null).map((w) => `<p class="alq-warn">${w}</p>`).join("")}
      <div id="alq-safety" hidden></div>
      ${p.create ? `<p class="alq-range">${T("Starting price")}: <b data-no-i18n>1 ${sym} = ${fmtPrice(p.price)} ${qs}</b> · <span data-no-i18n>${p.feePct}%</span></p>` : ""}
      ${pos ? "" : `<div class="alq-seg" role="radiogroup">${RANGES.map(([v, l], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-range="${v}">${esc(tr(l))}</button>`).join("")}</div>`}
      <p class="alq-range" id="alq-rangetxt"></p>
      <label class="alq-in"><span>${sym}</span><input type="text" inputmode="decimal" id="alq-a-tok" placeholder="0" autocomplete="off"><small id="alq-b-tok"></small></label>
      <label class="alq-in"><span>${qs}</span><input type="text" inputmode="decimal" id="alq-a-q" placeholder="0" autocomplete="off"><small id="alq-b-q"></small></label>
      ${slipHtml()}
      <ol class="alq-steps" id="alq-steps"></ol>
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-go">${title}</button>
      <p class="alq-fine">${T("Uses Uniswap's own PositionManager on Arc. If the price moves more than the limit above before your transaction lands, it's cancelled and nothing is spent.")}</p>`);
    taxWarning($("alq-safety"));
    const s = { range: 0, side: "tok", liq: 0n, a0: 0n, a1: 0n };
    const sqrtP = B(p.sqrtP);
    const ticks = () => (pos ? [pos.tl, pos.tu] : Lq.rangeAround(p.tick, s.range, p.key.tickSpacing));
    const tokIs0 = p.tokenIs0;
    function recompute() {
      const [tl, tu] = ticks();
      const lo = priceAtTick(p, tl), hi = priceAtTick(p, tu);
      $("alq-rangetxt").innerHTML = pos ? `${T("Same range as the position")}: <b data-no-i18n>${pos.full ? esc(tr("Full range")) : `${fmtPrice(Math.min(lo, hi))} – ${fmtPrice(Math.max(lo, hi))} ${qs}`}</b>`
        : s.range ? `${T("Price range")}: <b data-no-i18n>${fmtPrice(Math.min(lo, hi))} – ${fmtPrice(Math.max(lo, hi))} ${qs}</b>` : T("Earns on every trade at any price, like a classic pool.");
      const src = s.side === "tok" ? $("alq-a-tok") : $("alq-a-q");
      const dec = s.side === "tok" ? D.token.decimals : p.quote.decimals;
      const raw = Lq.parseUnits(src.value, dec);
      if (raw == null || raw <= 0n) { s.liq = 0n; (s.side === "tok" ? $("alq-a-q") : $("alq-a-tok")).value = ""; steps(); return; }
      const side01 = (s.side === "tok") === tokIs0 ? 0 : 1;
      const o = Lq.otherSide(sqrtP, tl, tu, side01, raw);
      s.liq = o.liquidity; s.a0 = o.amount0; s.a1 = o.amount1;
      const other = s.side === "tok" ? (tokIs0 ? o.amount1 : o.amount0) : (tokIs0 ? o.amount0 : o.amount1);
      const odec = s.side === "tok" ? p.quote.decimals : D.token.decimals;
      (s.side === "tok" ? $("alq-a-q") : $("alq-a-tok")).value = other > 0n ? ethers.formatUnits(other, odec).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1") : "0";
      steps();
    }
    let bal = { tok: null, q: null };
    async function balances() {
      if (!me()) return;
      const rp = readProvider();
      const get = (a) => (lc(a) === NATIVE ? rp.getBalance(me()) : new ethers.Contract(a, ERC20, rp).balanceOf(me()));
      try {
        [bal.tok, bal.q] = await Promise.all([get(D.token.address), get(p.quote.address)]);
        $("alq-b-tok").innerHTML = `${T("Balance")} <b data-no-i18n>${fmtRaw(bal.tok, D.token.decimals)}</b>`;
        $("alq-b-q").innerHTML = `${T("Balance")} <b data-no-i18n>${fmtRaw(bal.q, p.quote.decimals)}</b>`;
      } catch { /* shown without balances */ }
    }
    const withSlip = (x) => x + (x * BigInt(slipBps)) / 10000n + 1n;
    // what's missing before the deposit can go through:
    //   approvals — a one-time ERC-20 approve of Permit2 (a transaction per token, ever)
    //   permits   — Permit2 → PositionManager allowances, all granted by ONE signature
    //               that rides along in the deposit transaction (no gas, no extra step)
    async function needs() {
      const out = { approvals: [], permits: [] };
      if (!me()) return out;
      const rp = readProvider(), p2 = new ethers.Contract(PERMIT2, P2, rp);
      for (const [cur, amt] of [[p.key.currency0, withSlip(s.a0)], [p.key.currency1, withSlip(s.a1)]]) {
        if (lc(cur) === NATIVE || amt <= 0n) continue;
        const sym2 = lc(cur) === lc(D.token.address) ? D.token.symbol : p.quote.symbol;
        const [a20, a2] = await Promise.all([new ethers.Contract(cur, ERC20, rp).allowance(me(), PERMIT2), p2.allowance(me(), cur, PM)]);
        if (a20 < amt) out.approvals.push({ cur, sym: sym2 });
        if (B(a2.amount) < amt || Number(a2.expiration) <= cnow() + 60) out.permits.push({ cur, sym: sym2, nonce: Number(a2.nonce) });
      }
      return out;
    }
    let pending = { approvals: [], permits: [] };
    const goLabel = () => (pending.approvals.length ? `${tr("Approve")} ${pending.approvals[0].sym} (1/${pending.approvals.length + (pending.permits.length ? 2 : 1)})` : pending.permits.length ? tr("Sign & add") : tr(p.create ? "Create pool" : pos ? "Add to position" : "Add liquidity"));
    async function steps() {
      const el = $("alq-steps");
      if (!el) return;
      if (!me() || s.liq <= 0n) { el.innerHTML = ""; $("alq-go").textContent = me() ? tr(p.create ? "Create pool" : pos ? "Add to position" : "Add liquidity") : tr("Connect wallet"); return; }
      pending = await needs().catch(() => ({ approvals: [], permits: [] }));
      el.innerHTML = pending.approvals.map((n) => `<li><span>${T("Allow Permit2 to use")}</span> <b data-no-i18n>${esc(n.sym)}</b> <small>${T("once per token")}</small></li>`).join("")
        + (pending.permits.length ? `<li class="sig"><span>${T("Sign one permission for")}</span> <b data-no-i18n>${pending.permits.map((n) => esc(n.sym)).join(" + ")}</b> <small>${T("no gas")}</small></li>` : "")
        + `<li class="last"><span>${T(p.create ? "Create the pool and add liquidity" : "Add liquidity")}</span></li>`;
      $("alq-go").textContent = goLabel();
    }
    m.addEventListener("click", (e) => {
      const sl = e.target.closest("[data-slip]");
      if (sl) { setSlip(Number(sl.dataset.slip)); m.querySelectorAll("[data-slip]").forEach((b) => b.setAttribute("aria-pressed", String(b === sl))); steps(); return; }
      const r = e.target.closest("[data-range]");
      if (r) { s.range = Number(r.dataset.range); m.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-checked", String(b === r))); recompute(); }
    });
    $("alq-a-tok").addEventListener("input", () => { s.side = "tok"; recompute(); });
    $("alq-a-q").addEventListener("input", () => { s.side = "q"; recompute(); });
    $("alq-go").addEventListener("click", async () => {
      const btn = $("alq-go");
      if (!(await needWallet())) return;
      if (s.liq <= 0n) { toast("Enter an amount first.", "info"); return; }
      btn.disabled = true;
      try {
        await balances();
        if (bal.tok != null && B(bal.tok) < (tokIs0 ? s.a0 : s.a1)) throw new Error(`${tr("Not enough")} ${D.token.symbol}`);
        if (bal.q != null && B(bal.q) < (tokIs0 ? s.a1 : s.a0)) throw new Error(`${tr("Not enough")} ${p.quote.symbol}`);
        pending = await needs();
        for (const n of pending.approvals) {
          btn.textContent = `${tr("Confirm in wallet…")} (${n.sym})`;
          const tx = await erc(n.cur).approve(PERMIT2, ethers.MaxUint256);
          btn.textContent = tr("Confirming…");
          await tx.wait();
        }
        const [tl, tu] = ticks();
        const posm = new ethers.Contract(PM, POSM, state.signer);
        const value = lc(p.key.currency0) === NATIVE ? withSlip(s.a0) : 0n;
        const body = pos ? increaseData(p.key, pos.id, s.liq, withSlip(s.a0), withSlip(s.a1), state.account) : mintData(p.key, tl, tu, s.liq, withSlip(s.a0), withSlip(s.a1), state.account);
        const calls = [];
        if (p.create) calls.push(posm.interface.encodeFunctionData("initializePool", [kt(p.key), sqrtP]));
        if (pending.permits.length) {
          btn.textContent = tr("Sign in wallet…");
          const exp = cnow() + 30 * DAY, sigDeadline = cnow() + 30 * 60;
          const batch = { details: pending.permits.map((n) => ({ token: n.cur, amount: (1n << 160n) - 1n, expiration: exp, nonce: n.nonce })), spender: PM, sigDeadline };
          const sig = await state.signer.signTypedData({ name: "Permit2", chainId: 5042, verifyingContract: PERMIT2 }, PERMIT_TYPES, batch);
          calls.push(posm.interface.encodeFunctionData("permitBatch", [state.account, [batch.details.map((d) => [d.token, d.amount, d.expiration, d.nonce]), batch.spender, batch.sigDeadline], sig]));
        }
        btn.textContent = tr("Confirm in wallet…");
        let tx;
        if (!calls.length) tx = await posm.modifyLiquidities(body, deadline(), { value });
        else {
          calls.push(posm.interface.encodeFunctionData("modifyLiquidities", [body, deadline()]));
          // an explicit gas limit: initializePool swallows its own failures, so a tight estimate
          // could leave the pool uninitialised — give the whole batch room
          const est = await posm.multicall.estimateGas(calls, { value });
          tx = await posm.multicall(calls, { value, gasLimit: (est * 14n) / 10n + 150000n });
        }
        btn.textContent = tr("Confirming…");
        await tx.wait();
        close();
        const had = new Set(mineIds());
        toast(p.create ? "Pool created — your position is below." : pos ? "Added to your position." : "Liquidity added — your position is below.", "ok");
        await load(tokenAddr, { quiet: true });
        celebrate("add", pos ? pos.id : mineIds().find((x) => !had.has(x)));
        loadMine();
      } catch (e) {
        toast(errText(e, "Adding liquidity failed or was rejected."), "info");
        btn.disabled = false; steps();
      }
    });
    recompute(); balances(); steps();
  }
  const PERMIT_TYPES = {
    PermitBatch: [{ name: "details", type: "PermitDetails[]" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
    PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
  };

  // ---- a new pool: pick the pair, fee and first price, then the first deposit ----
  const TIERS = [[500, 10, "0.05%"], [3000, 60, "0.3%"], [10000, 200, "1%"]];
  const USDC20 = "0x3600000000000000000000000000000000000000";
  function openCreate() {
    const sym = esc(D.token.symbol);
    const mkt = D.pools.map((x) => x.dex && x.dex.price).find((x) => x > 0);
    const m = modal(`${T("Create pool")} · <span data-no-i18n>${sym}</span>`, `
      <p class="alq-range">${T("A new Uniswap v4 pool on Arc, with no hook. You set its first price and make the first deposit.")}</p>
      <small class="alq-lab">${T("Paired with")}</small>
      <div class="alq-seg" role="radiogroup"><button type="button" role="radio" aria-checked="true" data-quote="${USDC20}" data-no-i18n>USDC</button><button type="button" role="radio" aria-checked="false" data-quote="custom">${T("Another token")}</button></div>
      <label class="alq-in" id="alq-cq-wrap" hidden><span>${T("Token")}</span><input type="text" id="alq-cq" placeholder="0x…" autocomplete="off" spellcheck="false"></label>
      <small class="alq-lab">${T("Fee tier")}</small>
      <div class="alq-seg" role="radiogroup">${TIERS.map(([f, , l], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-tier="${f}" data-no-i18n>${l}</button>`).join("")}</div>
      <label class="alq-in"><span data-no-i18n>1 ${sym} =</span><input type="text" inputmode="decimal" id="alq-cp" placeholder="0" autocomplete="off" value="${mkt ? String(Number(mkt.toPrecision(6))) : ""}"><small id="alq-cp-q" data-no-i18n>USDC</small></label>
      ${mkt ? `<p class="alq-fine">${T("Market price now")}: <b data-no-i18n>$${fmtPrice(mkt)}</b></p>` : `<p class="alq-warn">${T("There's no market price for this token yet — you're setting it. Get it wrong and arbitrage bots take the difference from your deposit.")}</p>`}
      <p class="alq-warn" id="alq-cerr" hidden></p>
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-cgo">${T("Continue")}</button>`);
    const st = { quote: USDC20, tier: TIERS[1] };
    m.addEventListener("click", (e) => {
      const q = e.target.closest("[data-quote]");
      if (q) { st.quote = q.dataset.quote; m.querySelectorAll("[data-quote]").forEach((b) => b.setAttribute("aria-checked", String(b === q))); $("alq-cq-wrap").hidden = st.quote !== "custom"; $("alq-cp-q").textContent = st.quote === "custom" ? "" : "USDC"; }
      const t = e.target.closest("[data-tier]");
      if (t) { st.tier = TIERS.find((x) => String(x[0]) === t.dataset.tier); m.querySelectorAll("[data-tier]").forEach((b) => b.setAttribute("aria-checked", String(b === t))); }
    });
    const fail = (msg) => { const el = $("alq-cerr"); el.textContent = tr(msg); el.hidden = false; };
    $("alq-cgo").addEventListener("click", async () => {
      $("alq-cerr").hidden = true;
      const quoteAddr = lc(st.quote === "custom" ? $("alq-cq").value.trim() : st.quote);
      if (!/^0x[0-9a-f]{40}$/.test(quoteAddr) || quoteAddr === lc(D.token.address)) return fail("Paste the other token's address (0x…).");
      const price = Number($("alq-cp").value.replace(/,/g, ""));
      if (!(price > 0) || !isFinite(price)) return fail("Enter a starting price.");
      const btn = $("alq-cgo"); btn.disabled = true;
      try {
        const rp = readProvider();
        const qc = new ethers.Contract(quoteAddr, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], rp);
        const [qsym, qdec] = await Promise.all([qc.symbol(), qc.decimals()]).catch(() => [null, null]);
        if (qdec == null) throw new Error(tr("That address isn't a token on Arc."));
        const tok = lc(D.token.address), [c0, c1] = tok < quoteAddr ? [tok, quoteAddr] : [quoteAddr, tok];
        const key = { currency0: c0, currency1: c1, fee: st.tier[0], tickSpacing: st.tier[1], hooks: NATIVE };
        const id = lc(Lq.poolIdOf(key, ethers.keccak256));
        const [s0] = await Promise.all([new ethers.Contract(Lq.LIQ_ADDR.poolManager, ["function extsload(bytes32) view returns (bytes32)"], rp).extsload(Lq.poolSlot(id, ethers.keccak256))]);
        if (Lq.decodeSlot0(s0).sqrtP > 0n) {
          const known = D.pools.find((x) => x.id === id);
          close();
          if (known) { toast("That pool already exists — add to it here.", "info"); openAdd(known); } else { toast("That pool already exists — loading it.", "info"); load(tokenAddr); }
          return;
        }
        const tokenIs0 = c0 === tok, quote = { address: quoteAddr, symbol: qsym || "?", decimals: Number(qdec) };
        const d0 = tokenIs0 ? D.token.decimals : quote.decimals, d1 = tokenIs0 ? quote.decimals : D.token.decimals;
        const tick = Math.max(Lq.minUsable(key.tickSpacing), Math.min(Lq.maxUsable(key.tickSpacing), Lq.tickForPrice(price, tokenIs0, d0, d1)));
        const sq = Lq.sqrtAtTick(tick);
        openAdd({ id, key, tokenIs0, quote, tick, sqrtP: sq.toString(), price: Lq.priceOf(sq, tokenIs0, d0, d1), feePct: Lq.feePct(key.fee), venue: "Uniswap v4", positions: [], dex: null, create: true });
      } catch (e) { fail(errText(e, "Couldn't read that token.")); btn.disabled = false; }
    });
  }

  // ---- remove ----
  function openRemove(p, q) {
    const sym = esc(D.token.symbol), qs = esc(p.quote.symbol);
    const m = modal(`${T("Remove liquidity")} · <span data-no-i18n>#${q.id}</span>`, `
      <div class="alq-seg" role="radiogroup">${[25, 50, 75, 100].map((v) => `<button type="button" role="radio" aria-checked="${v === 100}" data-pct="${v}" data-no-i18n>${v}%</button>`).join("")}</div>
      <div class="alq-get" id="alq-get"></div>
      ${slipHtml()}
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-go">${T("Remove liquidity")}</button>
      <p class="alq-fine">${T("Fees the position has earned come out with it. At 100% the position NFT is burned.")}</p>`);
    let pct = 100;
    const show = () => {
      $("alq-get").innerHTML = `<small>${T("You receive about")}</small><b data-no-i18n>${fmtRaw((B(q.token) * BigInt(pct)) / 100n, D.token.decimals)} ${sym}</b><b data-no-i18n>${fmtRaw((B(q.quote) * BigInt(pct)) / 100n, p.quote.decimals)} ${qs}</b>${q.fees && (B(q.fees.token) > 0n || B(q.fees.quote) > 0n) ? `<small>${T("Unclaimed fees")}: <span data-no-i18n>${fmtRaw(q.fees.token, D.token.decimals)} ${sym} + ${fmtRaw(q.fees.quote, p.quote.decimals)} ${qs}</span></small>` : `<small>${T("plus unclaimed fees")}</small>`}`;
    };
    m.addEventListener("click", (e) => { const sl = e.target.closest("[data-slip]"); if (sl) { setSlip(Number(sl.dataset.slip)); m.querySelectorAll("[data-slip]").forEach((x) => x.setAttribute("aria-pressed", String(x === sl))); return; } const b = e.target.closest("[data-pct]"); if (b) { pct = Number(b.dataset.pct); m.querySelectorAll("[data-pct]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); show(); } });
    $("alq-go").addEventListener("click", async () => {
      const btn = $("alq-go");
      if (!(await needWallet())) return;
      btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
      try {
        const liq = (B(q.liquidity) * BigInt(pct)) / 100n;
        const [t0, t1] = p.tokenIs0 ? [B(q.token), B(q.quote)] : [B(q.quote), B(q.token)];
        const min = (x) => (x * BigInt(pct) * BigInt(10000 - slipBps)) / 1000000n; // the chosen max price move, on today's amounts
        const tx = await new ethers.Contract(PM, POSM, state.signer).modifyLiquidities(decreaseData(p.key, q.id, liq, min(t0), min(t1), state.account, pct === 100), deadline());
        btn.textContent = tr("Confirming…");
        await tx.wait();
        close(); toast("Liquidity removed.", "ok");
        await load(tokenAddr, { quiet: true });
      } catch (e) { toast(errText(e, "Removing liquidity failed or was rejected."), "info"); btn.disabled = false; btn.textContent = tr("Remove liquidity"); }
    });
    show();
  }

  // ---- lock ----
  const LOCK_DAYS = [[30, "30 days"], [90, "90 days"], [180, "6 months"], [365, "1 year"]];
  function openLock(p, q) {
    const sym = esc(D.token.symbol), qs = esc(p.quote.symbol);
    const m = modal(`${T("Lock liquidity")} · <span data-no-i18n>#${q.id}</span>`, `
      <p class="alq-lead" data-no-i18n>${fmtRaw(q.token, D.token.decimals)} ${sym} + ${fmtRaw(q.quote, p.quote.decimals)} ${qs}</p>
      <div class="alq-seg" role="radiogroup">${LOCK_DAYS.map(([d, l], i) => `<button type="button" role="radio" aria-checked="${i === 1}" data-days="${d}">${esc(tr(l))}</button>`).join("")}</div>
      <label class="alq-in date"><span>${T("Or pick a date")}</span><input type="date" id="alq-date"></label>
      <p class="alq-until" id="alq-until"></p>
      <ul class="alq-rules"><li>${T("Nobody can move the position before that date — not you, not ARCIRCLE PAD.")}</li><li>${T("You keep collecting the trading fees it earns while it's locked.")}</li><li>${T("You can push the date further out later, never closer.")}</li></ul>
      <label class="alq-agree"><input type="checkbox" id="alq-ok"> <span>${T("I understand I can't withdraw it early.")}</span></label>
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-go" disabled>${T("Lock position")}</button>`);
    let until = cnow() + 90 * DAY;
    const show = () => { $("alq-until").innerHTML = `${T("Locked until")} <b data-no-i18n>${esc(date(until))}</b>`; };
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-days]"); if (b) { until = cnow() + Number(b.dataset.days) * DAY; $("alq-date").value = ""; m.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); show(); } });
    $("alq-date").addEventListener("change", (e) => { const t = Math.floor(new Date(e.target.value + "T23:59:00").getTime() / 1000); if (t > cnow() + 3600) { until = t; m.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-checked", "false")); show(); } });
    $("alq-ok").addEventListener("change", (e) => { $("alq-go").disabled = !e.target.checked; });
    $("alq-go").addEventListener("click", async () => {
      const btn = $("alq-go");
      if (!(await needWallet())) return;
      btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
      try {
        const tx = await new ethers.Contract(PM, POSM, state.signer).safeTransferFrom(state.account, LPLOCK, q.id, coder().encode(["uint64"], [until]));
        btn.textContent = tr("Confirming…");
        const rc = await tx.wait();
        // the lock id from ArcLPLock's Locked(lockId, owner, tokenId, unlockAt) event
        const LOCKED = ethers.id("Locked(uint256,address,uint256,uint64)");
        const log = rc && rc.logs ? rc.logs.find((l) => lc(l.address) === LPLOCK && l.topics[0] === LOCKED) : null;
        close(); toast("Position locked.", "ok");
        await load(tokenAddr, { quiet: true });
        celebrate("lock", q.id);
        if (log) openCert(Number(BigInt(log.topics[1])), true);
      } catch (e) { toast(errText(e, "Locking failed or was rejected."), "info"); btn.disabled = false; btn.textContent = tr("Lock position"); }
    });
    show();
  }

  // ---- the lock's certificate: share card + link (/lplock/<id>) ----
  function openCert(lockId, fresh) {
    const link = `https://www.arcircle.app/lplock/${lockId}`;
    const img = `/api/og?lplock=${lockId}&v=${Date.now() % 1e6}`;
    const sym = D && D.token ? D.token.symbol : "";
    const text = `$${sym} liquidity is locked on Arc with ArcLPLock — nobody can pull it before the date. Check it on-chain:`;
    const m = modal(`${T("Lock certificate")} · <span data-no-i18n>#${lockId}</span>`, `
      <div class="alq-cert${fresh ? " fresh" : ""}"><div class="alq-cert-lock" aria-hidden="true"><i></i><b></b></div><img src="${esc(img)}" alt="" loading="lazy"></div>
      <p class="alq-fine">${T("Anyone can check this lock on-chain.")}</p>
      <div class="alq-cert-acts">
        <a class="bp-btn-primary" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${T("Share on X")}</a>
        <button type="button" class="bp-btn-ghost" data-certcopy>${T("Copy link")}</button>
        <a class="bp-btn-ghost" href="${esc(img)}" download="lp-lock-${lockId}.png" target="_blank" rel="noopener">${T("Save the image")}</a>
      </div>`);
    m.querySelector("[data-certcopy]").addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(link); e.target.textContent = tr("Copied"); } catch { /* denied */ } });
  }

  async function simpleTx(btn, fn, okMsg, failMsg) {
    if (!(await needWallet())) return;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
    try { const tx = await fn(); btn.textContent = tr("Confirming…"); await tx.wait(); toast(okMsg, "ok"); await load(tokenAddr, { quiet: true }); }
    catch (e) { toast(errText(e, failMsg), "info"); btn.disabled = false; btn.textContent = orig; }
  }

  // ================= events =================
  const findPos = (id) => { for (const p of D.pools) { const q = p.positions.find((x) => String(x.id) === String(id)); if (q) return [p, q]; } return [null, null]; };
  $("alq-out").addEventListener("click", async (e) => {
    const t = e.target;
    const go = t.closest("[data-go]");
    if (go) { e.preventDefault(); location.hash = go.getAttribute("href"); return; }
    if (t.closest("[data-connect]")) { if (typeof connectWallet === "function") await connectWallet(); return; }
    if (t.closest("[data-refresh]")) { load(tokenAddr); return; }
    const cp = t.closest("[data-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast("Copied", "ok"); } catch { /* denied */ } return; }
    if (t.closest("[data-feed-all]")) { feedAll = !feedAll; const f = feedMem.get(D.token.address); if (f && f.data) drawFeed(f.data); return; }
    if (t.closest("[data-jump-feed]")) { const f = $("alq-feed"); if (f) f.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); return; }
    if (t.closest("[data-create]")) { if (!(await needWallet())) return; openCreate(); return; }
    const fp = t.closest("[data-focus-pos]");
    if (fp) {
      const id = fp.dataset.focusPos, out = $("alq-out");
      let el = out.querySelector(`.alq-mine-card[data-pos="${id}"]`) || out.querySelector(`tr[data-pos="${id}"]`);
      if (!el) { // behind "show all"
        const p = D.pools.find((x) => x.positions.some((q) => String(q.id) === id));
        if (p) { const v = poolView.get(p.id) || { sort: "size", all: false }; v.all = true; poolView.set(p.id, v); repaintPool(p.id); el = out.querySelector(`tr[data-pos="${id}"]`); }
      }
      if (el) { el.classList.remove("alq-focus"); void el.offsetWidth; el.classList.add("alq-focus"); el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" }); setTimeout(() => el.classList.remove("alq-focus"), 3400); }
      return;
    }
    const so = t.closest("[data-sort]");
    if (so) { const v = poolView.get(so.dataset.poolId) || { sort: "size", all: false }; v.sort = so.dataset.sort; poolView.set(so.dataset.poolId, v); repaintPool(so.dataset.poolId); return; }
    const al = t.closest("[data-all]");
    if (al) { const v = poolView.get(al.dataset.all) || { sort: "size", all: false }; v.all = !v.all; poolView.set(al.dataset.all, v); repaintPool(al.dataset.all); return; }
    const inc = t.closest("[data-increase]");
    if (inc) { const [p, q] = findPos(inc.dataset.increase); if (p) { if (!(await needWallet())) return; openAdd(p, q); } return; }
    const add = t.closest("[data-add]");
    if (add) { if (!(await needWallet())) return; const p = D.pools.find((x) => x.id === add.dataset.add); if (p) openAdd(p); return; }
    const rm = t.closest("[data-remove]");
    if (rm) { const [p, q] = findPos(rm.dataset.remove); if (p) openRemove(p, q); return; }
    const lk = t.closest("[data-lock]");
    if (lk) { const [p, q] = findPos(lk.dataset.lock); if (p) openLock(p, q); return; }
    const col = t.closest("[data-collect]");
    if (col) { const [p] = findPos(col.dataset.collect); if (p) simpleTx(col, () => new ethers.Contract(PM, POSM, state.signer).modifyLiquidities(decreaseData(p.key, Number(col.dataset.collect), 0n, 0n, 0n, state.account, false), deadline()), "Fees collected.", "Collecting fees failed or was rejected."); return; }
    const lc2 = t.closest("[data-lcollect]");
    if (lc2) { simpleTx(lc2, () => new ethers.Contract(LPLOCK, LOCK_ABI, state.signer).collectFees(Number(lc2.dataset.lcollect)), "Fees collected.", "Collecting fees failed or was rejected."); return; }
    const ext = t.closest("[data-lextend]");
    if (ext) { const at = Math.max(Number(ext.dataset.at), cnow()) + 90 * DAY; simpleTx(ext, () => new ethers.Contract(LPLOCK, LOCK_ABI, state.signer).extend(Number(ext.dataset.lextend), at), "Lock extended.", "Extending failed or was rejected."); return; }
    const sh = t.closest("[data-lshare]");
    if (sh) { openCert(Number(sh.dataset.lshare), false); return; }
    const wd = t.closest("[data-lwithdraw]");
    if (wd) { simpleTx(wd, () => new ethers.Contract(LPLOCK, LOCK_ABI, state.signer).withdraw(Number(wd.dataset.lwithdraw)), "Position withdrawn to your wallet.", "Withdrawing failed or was rejected."); }
  });

  // deep links: #liquidity?token=0x…
  let focusLock = null;
  function fromHash() {
    const fl = /[?&]lock=(\d+)/.exec(location.hash);
    focusLock = fl ? Number(fl[1]) : null;
    const m = /^#liquidity\?(?:.*&)?(?:token|t)=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m && lc(m[1]) !== tokenAddr) { $("alq-addr").value = m[1]; load(m[1]); }
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();
  // a wallet connecting mid-visit: its own positions
  // ---- the connected wallet's positions across every token (/api/social?liqmine=) ----
  let mineSeq = 0;
  async function loadMine() {
    const box = $("alq-minechips"), w = me(), seq = ++mineSeq;
    if (!box) return;
    if (!w) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = `<small>${T("Your liquidity")}</small><span class="alq-muted"><span class="alq-spin"></span>${T("Finding your positions on Arc…")}</span>`;
    try {
      let j = null;
      for (let i = 0; i < 30 && seq === mineSeq; i++) {
        const r = await fetch(`${API}?liqmine=${w}`, { cache: "no-store" });
        j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.status);
        if (j.done) break;
      }
      if (seq !== mineSeq) return;
      if (!j || !j.done) throw new Error("still indexing");
      box.innerHTML = `<small>${T("Your liquidity")}</small>` + (j.pools.length ? j.pools.map((g) => `<button type="button" class="ams-chip alq-mc" data-t="${esc(g.token.address)}" data-no-i18n>${esc(g.token.symbol)} / ${esc(g.quote.symbol)}${g.feePct != null ? ` <em>${g.feePct}%</em>` : ""} <b>${g.positions}</b>${g.locked ? ` <i class="alq-mc-lock" title="${T("Locked")}">${g.locked}</i>` : ""}</button>`).join("")
        : `<span class="alq-muted">${T("No liquidity positions in this wallet yet.")}</span>`);
    } catch { if (seq === mineSeq) box.innerHTML = `<small>${T("Your liquidity")}</small><span class="alq-muted">${T("Couldn't list your positions right now.")}</span>`; }
  }
  if ($("alq-minechips")) $("alq-minechips").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { $("alq-addr").value = b.dataset.t; load(b.dataset.t); } });
  let lastMe = me();
  if (lastMe) loadMine();
  setInterval(() => { if (me() !== lastMe) { lastMe = me(); loadMine(); if (tokenAddr) load(tokenAddr, { quiet: true }); } }, 1500);
  document.addEventListener("arc:lang", () => render());
  window.arcLiquidity = { load, get data() { return D; } };
})();
