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
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#liquidity?token=${addr}`);
    if (!quiet) { status(`<span class="alq-spin"></span>${T("Reading pools and positions…")}`); if (!D || D.token.address !== addr) $("alq-out").innerHTML = skeleton(); }
    try {
      for (let i = 0; i < 40; i++) {
        const r = await fetch(`${API}?liq=${addr}${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (j.done) { D = j; break; }
        if (!quiet) status(`<span class="alq-spin"></span>${T("Indexing liquidity positions…")} <b data-no-i18n>${Math.round((j.progress || 0) * 100)}%</b><small>${T("The first look at a token reads every position on Arc — later visits are instant.")}</small>`);
      }
      if (!D || D.token.address !== addr) throw new Error("the index is still catching up — try again in a minute");
      status("");
      render();
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
    const posRows = p.positions.slice(0, 8).map((q) => `
      <tr class="${q.mine ? "mine" : ""}" data-pos="${q.id}">
        <td data-no-i18n><a href="${explorer("nft", PM)}/${q.id}" target="_blank" rel="noopener">#${q.id}</a></td>
        <td>${q.mine ? `<b>${T("You")}</b>` : q.label ? T(q.label) : `<a href="${explorer("address", q.owner)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(q.owner))}</a>`}</td>
        <td>${rangeText(p, q)}${q.inRange ? "" : ` <em class="alq-out-range">${T("out of range")}</em>`}</td>
        <td data-no-i18n>${fmtRaw(q.token, D.token.decimals)} ${sym}<br><small>${fmtRaw(q.quote, p.quote ? p.quote.decimals : 18)} ${qs}</small></td>
        <td>${kindChip(q)}</td>
      </tr>`).join("");
    const more = p.positionCount > 8 ? `<p class="alq-more"><span data-no-i18n>${p.positionCount - 8}</span> ${T("more positions")}</p>` : "";
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
        <div><small>${T("Price")}</small><b data-no-i18n>${fmtPrice(p.price)} ${qs}</b><span data-no-i18n>1 ${sym}</span></div>
        <div><small>${T("Liquidity")}</small><b data-no-i18n>${p.dex ? usd(p.dex.liqUsd) : "—"}</b><span>${p.dex ? T("Dexscreener") : T("not listed yet")}</span></div>
        <div><small>${T("In LP positions")}</small><b data-no-i18n>${fmtRaw(p.inPositions.token, D.token.decimals)} ${sym}</b><span data-no-i18n>${fmtRaw(p.inPositions.quote, p.quote ? p.quote.decimals : 18)} ${qs}</span></div>
        <div><small>${T("Positions")}</small><b data-no-i18n>${p.positionCount}</b><span>${p.dex && p.dex.vol ? `<span data-no-i18n>${usd(p.dex.vol)}</span> ${T("24h volume")}` : "&nbsp;"}</span></div>
      </div>
      <div class="alq-lockbox"><div class="alq-lockhead"><b>${T("Who can pull this liquidity")}</b><small>${T("Share of the liquidity trading at the current price")}</small></div>${bar(p.share)}${notes.length ? `<ul class="alq-notes">${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : ""}</div>
      ${p.positions.length ? `<div class="alq-tablewrap"><table class="alq-table"><thead><tr><th>${T("Position")}</th><th>${T("Owner")}</th><th>${T("Price range")}</th><th>${T("Holds")}</th><th>${T("Status")}</th></tr></thead><tbody>${posRows}</tbody></table>${more}</div>` : `<p class="alq-empty">${T("No position NFTs in this pool yet.")}</p>`}
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
      acts = `<button type="button" class="alq-act" data-remove="${q.id}">${T("Remove")}</button><button type="button" class="alq-act" data-collect="${q.id}">${T("Collect fees")}</button>` +
        (LPLOCK ? `<button type="button" class="alq-act lock" data-lock="${q.id}">${T("Lock")}</button>` : "");
    } else if (locked && q.lock) {
      acts = `<button type="button" class="alq-act" data-lcollect="${q.lock.lockId}">${T("Collect fees")}</button>` +
        (q.kind === "unlocking" ? `<button type="button" class="alq-act lock" data-lwithdraw="${q.lock.lockId}">${T("Withdraw")}</button>` : `<button type="button" class="alq-act" data-lextend="${q.lock.lockId}" data-at="${q.lock.unlockAt}">${T("Extend +90 days")}</button>`) +
        `<button type="button" class="alq-act share" data-lshare="${q.lock.lockId}">${T("Share the lock")}</button>`;
    }
    const left = q.lock ? q.lock.unlockAt - now() : 0;
    return `<div class="alq-mine-card${locked ? " locked" : ""}" data-pos="${q.id}">
      <div class="alq-mine-top"><b data-no-i18n>#${q.id}</b><span data-no-i18n>${sym} / ${qs}</span>${kindChip(q)}</div>
      <div class="alq-mine-amt" data-no-i18n><b>${fmtRaw(q.token, D.token.decimals)} ${sym}</b><span>+ ${fmtRaw(q.quote, p.quote ? p.quote.decimals : 18)} ${qs}</span></div>
      ${q.fees && (B(q.fees.token) > 0n || B(q.fees.quote) > 0n) ? `<div class="alq-fees"><small>${T("Unclaimed fees")}</small><b data-no-i18n>${fmtRaw(q.fees.token, D.token.decimals)} ${sym} + ${fmtRaw(q.fees.quote, p.quote ? p.quote.decimals : 18)} ${qs}</b></div>` : ""}
      <div class="alq-mine-meta">${rangeText(p, q)}${q.inRange ? ` · <span class="alq-earn">${T("earning")}</span>` : ` · <em class="alq-out-range">${T("out of range")}</em>`}</div>
      ${locked && q.lock && left > 0 ? `<div class="alq-mine-lock"><i style="width:${Math.max(3, Math.min(100, 100 - (left / Math.max(1, q.lock.unlockAt - q.lock.lockedAt)) * 100))}%"></i></div>` : ""}
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
          <button type="button" class="alq-link" data-refresh>${T("Refresh")}</button>
        </div>
      </div>
      ${me() ? `<section class="alq-mine"><h3>${T("Your positions")} <b data-no-i18n>${mine.length}</b></h3>${mine.length ? `<div class="alq-mine-grid">${mine.map(([p, q]) => myCard(p, q)).join("")}</div>` : `<p class="alq-empty">${T("This wallet has no liquidity positions in these pools yet.")}</p>`}</section>` : `<p class="alq-connect">${T("Connect a wallet to add liquidity or manage your own positions.")} <button type="button" class="ams-mini" data-connect>${T("Connect wallet")}</button></p>`}
      ${D.pools.length ? D.pools.map(poolCard).join("") : `<div class="alq-none"><b>${T("No Uniswap v4 pool found for this token.")}</b><p>${T("Launch it on ArcPad and it gets a pool right away.")}</p><a class="bp-btn-primary" href="#launch" data-go="launch">${T("Launch a coin")}</a></div>`}
      ${D.external.length ? `<p class="alq-muted">${T("Also trading on")}: ${D.external.map((x) => `<a href="${esc(x.url || "#")}" target="_blank" rel="noopener" data-no-i18n>${esc(x.dex)}</a>`).join(", ")}</p>` : ""}
      ${LPLOCK ? "" : `<p class="alq-muted alq-soon">${T("LP locking opens once the ArcLPLock contract is live. Locks by launchpads and burned positions already show here.")}</p>`}`;
    if (focusLock != null) {
      const id = focusLock; focusLock = null;
      for (const p of D.pools) {
        const q = p.positions.find((x) => x.lock && x.lock.lockId === id);
        const row = q && $("alq-out").querySelector(`tr[data-pos="${q.id}"], .alq-mine-card[data-pos="${q.id}"]`);
        if (row) { row.classList.add("alq-focus"); setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "center" }), 300); break; }
      }
    }
  }

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
  const deadline = () => now() + 20 * 60;
  const erc = (a) => new ethers.Contract(a, ERC20, state.signer);

  // ---- add liquidity ----
  const RANGES = [[0, "Full range"], [50, "±50%"], [20, "±20%"], [10, "±10%"]];
  function openAdd(p) {
    const sym = esc(D.token.symbol), qs = esc(p.quote.symbol);
    const m = modal(`${T("Add liquidity")} · <span data-no-i18n>${sym} / ${qs}</span>`, `
      ${p.key.fee === 0 ? `<p class="alq-warn">${T("This pool's LP fee is 0% — ArcPad's hook takes the trading fee, so liquidity added here earns nothing.")}</p>` : ""}
      <div class="alq-seg" role="radiogroup">${RANGES.map(([v, l], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-range="${v}">${esc(tr(l))}</button>`).join("")}</div>
      <p class="alq-range" id="alq-rangetxt"></p>
      <label class="alq-in"><span>${sym}</span><input type="text" inputmode="decimal" id="alq-a-tok" placeholder="0" autocomplete="off"><small id="alq-b-tok"></small></label>
      <label class="alq-in"><span>${qs}</span><input type="text" inputmode="decimal" id="alq-a-q" placeholder="0" autocomplete="off"><small id="alq-b-q"></small></label>
      <ol class="alq-steps" id="alq-steps"></ol>
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-go">${T("Add liquidity")}</button>
      <p class="alq-fine">${T("Uses Uniswap's own PositionManager on Arc. Amounts can move up to 1% if the price shifts before your transaction lands.")}</p>`);
    const s = { range: 0, side: "tok", liq: 0n, a0: 0n, a1: 0n };
    const sqrtP = B(p.sqrtP);
    const ticks = () => Lq.rangeAround(p.tick, s.range, p.key.tickSpacing);
    const tokIs0 = p.tokenIs0;
    function recompute() {
      const [tl, tu] = ticks();
      const lo = priceAtTick(p, tl), hi = priceAtTick(p, tu);
      $("alq-rangetxt").innerHTML = s.range ? `${T("Price range")}: <b data-no-i18n>${fmtPrice(Math.min(lo, hi))} – ${fmtPrice(Math.max(lo, hi))} ${qs}</b>` : T("Earns on every trade at any price, like a classic pool.");
      const src = s.side === "tok" ? $("alq-a-tok") : $("alq-a-q");
      const dec = s.side === "tok" ? D.token.decimals : p.quote.decimals;
      const raw = Lq.parseUnits(src.value, dec);
      if (raw == null || raw <= 0n) { s.liq = 0n; (s.side === "tok" ? $("alq-a-q") : $("alq-a-tok")).value = ""; return; }
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
    const withSlip = (x) => x + x / 100n + 1n;
    async function needs() {
      // what's missing before the mint can go through: ERC-20 → Permit2, Permit2 → PositionManager
      const out = [];
      if (!me()) return out;
      const rp = readProvider(), p2 = new ethers.Contract(PERMIT2, P2, rp);
      for (const [cur, amt] of [[p.key.currency0, withSlip(s.a0)], [p.key.currency1, withSlip(s.a1)]]) {
        if (lc(cur) === NATIVE || amt <= 0n) continue;
        const sym2 = lc(cur) === lc(D.token.address) ? D.token.symbol : p.quote.symbol;
        const [a20, a2] = await Promise.all([new ethers.Contract(cur, ERC20, rp).allowance(me(), PERMIT2), p2.allowance(me(), cur, PM)]);
        if (a20 < amt) out.push({ kind: "erc20", cur, sym: sym2 });
        if (B(a2.amount) < amt || Number(a2.expiration) <= now() + 60) out.push({ kind: "permit2", cur, sym: sym2 });
      }
      return out;
    }
    let pending = [];
    async function steps() {
      const el = $("alq-steps");
      if (!el) return;
      if (!me() || s.liq <= 0n) { el.innerHTML = ""; $("alq-go").textContent = tr(me() ? "Add liquidity" : "Connect wallet"); return; }
      pending = await needs().catch(() => []);
      el.innerHTML = pending.map((n) => `<li><span>${n.kind === "erc20" ? T("Allow Permit2 to use") : T("Allow the PositionManager (via Permit2) to use")}</span> <b data-no-i18n>${esc(n.sym)}</b></li>`).join("") + `<li class="last"><span>${T("Add liquidity")}</span></li>`;
      $("alq-go").textContent = pending.length ? `${tr("Approve")} ${pending[0].sym} (1/${pending.length + 1})` : tr("Add liquidity");
    }
    m.addEventListener("click", (e) => {
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
        const need0 = withSlip(s.a0), need1 = withSlip(s.a1);
        const [needTok, needQ] = tokIs0 ? [need0, need1] : [need1, need0];
        if (bal.tok != null && B(bal.tok) < (tokIs0 ? s.a0 : s.a1)) throw new Error(`${tr("Not enough")} ${D.token.symbol}`);
        if (bal.q != null && B(bal.q) < (tokIs0 ? s.a1 : s.a0)) throw new Error(`${tr("Not enough")} ${p.quote.symbol}`);
        void needTok; void needQ;
        pending = await needs();
        for (const n of pending) {
          btn.textContent = `${tr("Confirm in wallet…")} (${n.sym})`;
          const tx = n.kind === "erc20" ? await erc(n.cur).approve(PERMIT2, ethers.MaxUint256)
            : await new ethers.Contract(PERMIT2, P2, state.signer).approve(n.cur, PM, (1n << 160n) - 1n, now() + 30 * DAY);
          btn.textContent = tr("Confirming…");
          await tx.wait();
          await steps();
        }
        btn.textContent = tr("Confirm in wallet…");
        const [tl, tu] = ticks();
        const posm = new ethers.Contract(PM, POSM, state.signer);
        const value = lc(p.key.currency0) === NATIVE ? withSlip(s.a0) : 0n;
        const tx = await posm.modifyLiquidities(mintData(p.key, tl, tu, s.liq, withSlip(s.a0), withSlip(s.a1), state.account), deadline(), { value });
        btn.textContent = tr("Confirming…");
        await tx.wait();
        close();
        toast("Liquidity added — your position is below.", "ok");
        await load(tokenAddr, { quiet: true });
      } catch (e) {
        toast(errText(e, "Adding liquidity failed or was rejected."), "info");
        btn.disabled = false; steps();
      }
    });
    recompute(); balances(); steps();
  }

  // ---- remove ----
  function openRemove(p, q) {
    const sym = esc(D.token.symbol), qs = esc(p.quote.symbol);
    const m = modal(`${T("Remove liquidity")} · <span data-no-i18n>#${q.id}</span>`, `
      <div class="alq-seg" role="radiogroup">${[25, 50, 75, 100].map((v) => `<button type="button" role="radio" aria-checked="${v === 100}" data-pct="${v}" data-no-i18n>${v}%</button>`).join("")}</div>
      <div class="alq-get" id="alq-get"></div>
      <button type="button" class="bp-btn-primary bp-btn-block" id="alq-go">${T("Remove liquidity")}</button>
      <p class="alq-fine">${T("Fees the position has earned come out with it. At 100% the position NFT is burned.")}</p>`);
    let pct = 100;
    const show = () => {
      $("alq-get").innerHTML = `<small>${T("You receive about")}</small><b data-no-i18n>${fmtRaw((B(q.token) * BigInt(pct)) / 100n, D.token.decimals)} ${sym}</b><b data-no-i18n>${fmtRaw((B(q.quote) * BigInt(pct)) / 100n, p.quote.decimals)} ${qs}</b>${q.fees && (B(q.fees.token) > 0n || B(q.fees.quote) > 0n) ? `<small>${T("Unclaimed fees")}: <span data-no-i18n>${fmtRaw(q.fees.token, D.token.decimals)} ${sym} + ${fmtRaw(q.fees.quote, p.quote.decimals)} ${qs}</span></small>` : `<small>${T("plus unclaimed fees")}</small>`}`;
    };
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-pct]"); if (b) { pct = Number(b.dataset.pct); m.querySelectorAll("[data-pct]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); show(); } });
    $("alq-go").addEventListener("click", async () => {
      const btn = $("alq-go");
      if (!(await needWallet())) return;
      btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
      try {
        const liq = (B(q.liquidity) * BigInt(pct)) / 100n;
        const [t0, t1] = p.tokenIs0 ? [B(q.token), B(q.quote)] : [B(q.quote), B(q.token)];
        const min = (x) => (x * BigInt(pct) * 98n) / 10000n; // 2% slippage on the current amounts
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
    let until = now() + 90 * DAY;
    const show = () => { $("alq-until").innerHTML = `${T("Locked until")} <b data-no-i18n>${esc(date(until))}</b>`; };
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-days]"); if (b) { until = now() + Number(b.dataset.days) * DAY; $("alq-date").value = ""; m.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-checked", String(x === b))); show(); } });
    $("alq-date").addEventListener("change", (e) => { const t = Math.floor(new Date(e.target.value + "T23:59:00").getTime() / 1000); if (t > now() + 3600) { until = t; m.querySelectorAll("[data-days]").forEach((x) => x.setAttribute("aria-checked", "false")); show(); } });
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
    if (ext) { const at = Math.max(Number(ext.dataset.at), now()) + 90 * DAY; simpleTx(ext, () => new ethers.Contract(LPLOCK, LOCK_ABI, state.signer).extend(Number(ext.dataset.lextend), at), "Lock extended.", "Extending failed or was rejected."); return; }
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
  let lastMe = me();
  setInterval(() => { if (me() !== lastMe) { lastMe = me(); if (tokenAddr) load(tokenAddr, { quiet: true }); } }, 1500);
  document.addEventListener("arc:lang", () => render());
  window.arcLiquidity = { load, get data() { return D; } };
})();
