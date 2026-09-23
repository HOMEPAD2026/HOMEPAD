/* global ethers, CONFIG, ARC, ACT, APC, ARCIRCLE, state, readProvider, multicallRead, withRetry, ERC20_ABI,
          arcActStats, arcChangeSinceLaunch, arcpadRenderPair, arcPaintCard, actPaint, apcRenderHeader, apcRenderData, apcResetView,
          refreshAccountDependentViews, renderArcpadExplore, renderArcpadExploreGrid, arcExploreSort, connectWallet, openArcCoin */
// arc-extras.js — the "trust and convenience" layer on ArcPad:
//   • watchlist (★ on cards and the coin page, a Watchlist filter in Explore)
//   • duplicate-ticker warnings (cards, coin page, launch form)
//   • HOT badge (most-traded coins in the last hour) and a top-coin banner
//   • safety panel on every coin page — LP locked, fixed supply, creator
//     holdings, top-10 concentration — read live from Arc
//   • Portfolio tab: your ArcPad coins + $ARCIRCLE, and the coins you launched
//   • phone trade bar with a bottom-sheet swap
//   • toasts (+ a short vibration) when a launch or trade confirms
//   • launch form: live card preview, dev-buy quick amounts, uppercase ticker
// Everything hooks into the existing page scripts by wrapping their global
// render functions, so arcpad.js / arcpad-coin.js stay unaware of it.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const usd = (n) => {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    if (n >= 1) return "$" + n.toFixed(2);
    if (n === 0) return "$0";
    return "$" + n.toPrecision(2);
  };
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e4 ? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n) : n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 }));
  const safeImg = (u) => /^https?:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u || "");
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.6l6-.9z"/></svg>';
  const SUPPLY = 1_000_000_000;
  const TREASURY = "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8";
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  // ================= toasts =================
  function toast(msg, kind = "ok") {
    let host = $("arc-toasts");
    if (!host) { host = document.createElement("div"); host.id = "arc-toasts"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
    const el = document.createElement("div");
    el.className = `arc-toast ${kind}`;
    el.innerHTML = `<span class="arc-toast-dot" aria-hidden="true"></span><span>${esc(msg)}</span>`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 350); }, 3200);
    if (kind === "ok" && navigator.vibrate) { try { navigator.vibrate(30); } catch { /* not allowed */ } }
  }
  window.arcToast = toast;
  // Success messages already rendered by the page scripts → toast.
  const watchStatus = (id, sel, label) => {
    const el = $(id);
    if (!el) return;
    new MutationObserver(() => {
      const m = el.querySelector(sel);
      if (!m || m.__toasted) return;
      m.__toasted = true;
      toast(typeof label === "function" ? label(m) : label);
    }).observe(el, { childList: true, subtree: true });
  };
  watchStatus("ap-launch-status", ".status.success", "Your coin is live");
  watchStatus("apc-status", ".ac2-msg.success", "Trade confirmed");
  watchStatus("ac2-status", ".ac2-msg.success", "Trade confirmed");
  watchStatus("ap-trade-status", ".status.success", "Trade confirmed");

  // ================= watchlist =================
  const WL_KEY = "arcpad.watchlist.v1";
  let wl = new Set();
  try { wl = new Set((JSON.parse(localStorage.getItem(WL_KEY) || "[]") || []).map(lc)); } catch { /* storage blocked */ }
  const isWatched = (t) => wl.has(lc(t));
  window.arcIsWatched = isWatched;
  function saveWl() { try { localStorage.setItem(WL_KEY, JSON.stringify([...wl])); } catch { /* fine */ } }
  function paintWatchState() {
    document.querySelectorAll("[data-star]").forEach((s) => {
      const on = isWatched(s.dataset.star);
      s.classList.toggle("on", on);
      s.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const chip = document.querySelector(".ap-watch-chip");
    if (chip) {
      let n = chip.querySelector(".ap-watch-n");
      if (!n) { n = document.createElement("span"); n.className = "ap-watch-n"; chip.appendChild(n); }
      const count = ARC.launches.filter((l) => isWatched(l.token)).length;
      n.textContent = count ? String(count) : "";
    }
    const star = $("apc-star");
    if (star && typeof APC !== "undefined" && APC.token) {
      const on = isWatched(APC.token);
      star.setAttribute("aria-pressed", on ? "true" : "false");
      star.classList.toggle("on", on);
      const sp = star.querySelector("span");
      if (sp) sp.textContent = on ? "Watching" : "Watch";
    }
  }
  function toggleWatch(token) {
    const k = lc(token);
    const on = !wl.has(k);
    if (on) wl.add(k); else wl.delete(k);
    saveWl();
    paintWatchState();
    toast(on ? "Added to watchlist" : "Removed from watchlist", "info");
    if (typeof arcExploreSort !== "undefined" && arcExploreSort === "watch") renderArcpadExploreGrid();
    if ($("bp-panel-portfolio") && $("bp-panel-portfolio").classList.contains("active")) renderPortfolio();
  }
  // Capture phase: the star sits inside the card <button>, whose own click
  // opens the coin page — stop that before it happens.
  document.addEventListener("click", (e) => {
    const s = e.target.closest && e.target.closest("[data-star]");
    if (!s) return;
    e.preventDefault(); e.stopPropagation();
    toggleWatch(s.dataset.star);
  }, true);
  document.addEventListener("keydown", (e) => {
    const s = e.target.closest && e.target.closest("[data-star]");
    if (s && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); toggleWatch(s.dataset.star); }
  }, true);
  if ($("apc-star")) $("apc-star").addEventListener("click", () => { if (APC.token) toggleWatch(APC.token); });

  // ================= duplicate tickers =================
  let symMemo = { n: -1, m: null };
  function symCounts() {
    if (symMemo.n === ARC.launches.length && symMemo.m) return symMemo.m;
    const m = new Map([["ARCIRCLE", [{ token: ARCIRCLE_TOKEN(), launchedAt: 0, core: true }]]]);
    for (const l of ARC.launches) {
      const k = String(l.symbol || "").trim().toUpperCase();
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    }
    symMemo = { n: ARC.launches.length, m };
    return m;
  }
  function ARCIRCLE_TOKEN() { return typeof ARCIRCLE !== "undefined" ? ARCIRCLE.token : "0x933a94b475fa9d8ef94fa564e38dda400a595aa1"; }
  const sameTicker = (sym) => symCounts().get(String(sym || "").trim().toUpperCase()) || [];

  // ================= HOT (most traded in the last hour) =================
  let hotMemo = { stats: null, set: new Set() };
  function hotSet() {
    if (typeof ACT === "undefined") return hotMemo.set;
    if (hotMemo.stats === ACT.stats) return hotMemo.set;
    const rows = [...ACT.stats.entries()].filter(([, s]) => (s.trades1h || 0) >= 2 && (s.vol1h || 0) > 0)
      .sort((a, b) => b[1].vol1h - a[1].vol1h).slice(0, 3).map(([k]) => k);
    hotMemo = { stats: ACT.stats, set: new Set(rows) };
    return hotMemo.set;
  }

  // ================= card decorations =================
  function decorateCard(card) {
    const token = card.dataset.token;
    if (!token) return;
    const top = card.querySelector(".ap-card-top");
    if (top && !top.querySelector("[data-star]")) {
      const s = document.createElement("span");
      s.className = "ap-star"; s.dataset.star = token; s.setAttribute("role", "button"); s.tabIndex = 0;
      s.setAttribute("aria-label", "Watch"); s.title = "Watchlist";
      s.innerHTML = STAR;
      top.appendChild(s);
    }
    const star = card.querySelector("[data-star]");
    if (star) { const on = isWatched(token); star.classList.toggle("on", on); star.setAttribute("aria-pressed", on ? "true" : "false"); }
    // HOT
    const hot = hotSet().has(lc(token));
    let hb = card.querySelector(".ap-hot");
    if (hot && !hb && top) { hb = document.createElement("span"); hb.className = "ap-hot"; hb.textContent = "HOT"; hb.title = "Among the most-traded coins in the last hour"; top.insertBefore(hb, top.querySelector(".ap-card-age")); }
    else if (!hot && hb) hb.remove();
    card.classList.toggle("is-hot", hot);
    // same ticker
    const l = ARC.launches.find((x) => lc(x.token) === lc(token));
    const dup = l ? sameTicker(l.symbol).length : 0;
    let db = card.querySelector(".ap-dup");
    if (dup > 1 && !db) {
      const sym = card.querySelector(".sym");
      if (sym) { db = document.createElement("span"); db.className = "ap-dup"; sym.appendChild(db); }
    }
    if (db) {
      if (dup > 1) { db.textContent = `Same ticker ×${dup}`; db.title = `${dup} coins use $${l.symbol} — check the contract address`; } else db.remove();
    }
  }
  if (typeof arcPaintCard === "function") {
    const orig = arcPaintCard;
    // eslint-disable-next-line no-global-assign
    arcPaintCard = function (card) { orig(card); try { decorateCard(card); } catch (e) { console.warn(e); } };
  }

  // ================= top coin banner =================
  function paintTopCoin() {
    const a = $("ap-topcoin");
    if (!a || typeof ACT === "undefined") return;
    let best = null, bestS = null;
    for (const l of ARC.launches) {
      const s = ACT.stats.get(lc(l.token));
      if (s && s.vol > 0 && (!bestS || s.vol > bestS.vol)) { best = l; bestS = s; }
    }
    if (!best) { a.hidden = true; return; }
    const chg = typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(best) : null;
    const img = safeImg(best.imageUrl) ? `<img src="${esc(best.imageUrl)}" alt="">` : `<span class="ap-topcoin-ph" style="${avatarBg(best.token)}">${esc(String(best.symbol || "?").slice(0, 1).toUpperCase())}</span>`;
    a.href = `/arc#coin/${best.token}`;
    a.hidden = false;
    const html = `<span class="ap-topcoin-crown" aria-hidden="true"></span>${img}
      <span class="ap-topcoin-copy"><small>Most traded · 24h</small><b>$${esc(best.symbol)}</b></span>
      <span class="ap-topcoin-stats"><span><small>Volume</small><b>${usd(bestS.vol)}</b></span><span><small>Trades</small><b>${bestS.trades}</b></span>${chg != null ? `<span><small>Since launch</small><b class="${chg > 0 ? "up" : chg < 0 ? "down" : ""}">${chg > 0 ? "+" : ""}${(chg * 100).toFixed(Math.abs(chg) < 0.1 ? 1 : 0)}%</b></span>` : ""}</span>
      <span class="ap-topcoin-go" aria-hidden="true">→</span>`;
    if (a.__html !== html) { a.innerHTML = html; a.__html = html; }
  }
  if (typeof actPaint === "function") {
    const orig = actPaint;
    // eslint-disable-next-line no-global-assign
    actPaint = function () { orig(); try { paintTopCoin(); paintWatchState(); if (portfolioActive()) renderPortfolio({ quiet: true }); } catch (e) { console.warn(e); } };
  }
  // A deterministic two-colour gradient from an address, for coins with no logo.
  function avatarBg(addr) {
    const h = parseInt(lc(addr).slice(2, 8) || "0", 16);
    const a = h % 360, b = (a + 40 + (h >> 9) % 80) % 360;
    return `background:linear-gradient(135deg,hsl(${a} 70% 52%),hsl(${b} 75% 40%))`;
  }
  window.arcAvatarBg = avatarBg;

  // ================= coin page: safety + duplicate notice =================
  const safetyCache = new Map(); // token -> {creatorBal, supply}
  async function loadSafety(token, creator) {
    const k = lc(token);
    if (safetyCache.has(k)) return safetyCache.get(k);
    const t = new ethers.Contract(token, ERC20_ABI, readProvider());
    const calls = [{ contract: t, method: "totalSupply" }];
    if (creator) calls.push({ contract: t, method: "balanceOf", args: [creator] });
    const r = await withRetry(() => multicallRead(calls)).catch(() => []);
    const v = { supply: r[0] != null ? BigInt(r[0]) : null, creatorBal: r[1] != null ? BigInt(r[1]) : null, at: Date.now() };
    if (v.supply != null) safetyCache.set(k, v);
    return v;
  }
  function renderSafety() {
    const panel = $("bp-panel-coin");
    if (!panel || typeof APC === "undefined" || !APC.l) return;
    let box = $("apc-safety");
    if (!box) {
      const stats = panel.querySelector(".ac2-stats");
      if (!stats) return;
      box = document.createElement("div");
      box.id = "apc-safety"; box.className = "apc-safety";
      stats.parentNode.insertBefore(box, stats.nextSibling);
    }
    const l = APC.l, token = APC.token;
    const sc = safetyCache.get(lc(token));
    const items = [];
    items.push(["ok", "Liquidity locked", "The pool position is held by the factory, which has no function to remove it."]);
    if (sc && sc.supply != null) {
      const fixed = sc.supply === 10n ** 27n;
      items.push([fixed ? "ok" : "warn", fixed ? "Fixed supply" : "Unusual supply", fixed ? "1,000,000,000 minted once at launch. The token has no mint function and no owner." : `Total supply reads ${num(Number(ethers.formatUnits(sc.supply, 18)))}.`]);
    } else items.push(["wait", "Fixed supply", "Checking…"]);
    if (sc && sc.creatorBal != null) {
      const pct = Number(ethers.formatUnits(sc.creatorBal, 18)) / SUPPLY * 100;
      items.push([pct <= 5 ? "ok" : pct <= 15 ? "warn" : "bad", `Creator holds ${pct === 0 ? "0" : pct < 0.01 ? "<0.01" : pct.toFixed(pct < 10 ? 2 : 1)}%`, pct <= 5 ? "Small or no creator bag." : pct <= 15 ? "A sizeable creator bag — watch for sells." : "The creator holds a large share of supply."]);
    } else if (!l.creator) items.push(["wait", "Creator holdings", "—"]);
    else items.push(["wait", "Creator holdings", "Checking…"]);
    if (APC.holders) {
      const skip = new Set([CONFIG.POOL_MANAGER_ADDRESS, CONFIG.ARCPAD_HOOK_ADDRESS, CONFIG.ARCPAD_FACTORY_ADDRESS, TREASURY].map(lc));
      const top = APC.holders.filter(([a]) => !skip.has(lc(a))).slice(0, 10);
      const pct = top.reduce((s, [, raw]) => s + Number(ethers.formatUnits(raw, 18)), 0) / SUPPLY * 100;
      items.push([pct <= 30 ? "ok" : pct <= 50 ? "warn" : "bad", `Top 10 hold ${pct.toFixed(1)}%`, "Excludes the pool, the fee hook and the 8% platform allocation."]);
    } else items.push(["wait", "Top 10 holders", "Indexing transfers…"]);
    const fee = Number(APC.feeBps || 100) / 100;
    items.push(["info", `Trade fee ${fee}%`, l.extraFeeBps ? `1% base + ${l.extraFeeBps / 100}% creator add-on.` : "1% base — 70% of it goes to the creator."]);
    const icon = { ok: "M5 12.5l4.2 4.2L19 7", warn: "M12 7v6M12 16.5v.5", bad: "M7 7l10 10M17 7L7 17", wait: "M12 7v5l3 2", info: "M12 11v6M12 7.5v.5" };
    const html = `<div class="apc-sf-head"><b>Safety check</b><small>Read live from Arc</small></div><div class="apc-sf-grid">`
      + items.map(([k, t, d]) => `<div class="apc-sf ${k}"><span class="apc-sf-ico"><svg viewBox="0 0 24 24"><path d="${icon[k]}"/></svg></span><span class="apc-sf-copy"><b>${esc(t)}</b><small>${esc(d)}</small></span></div>`).join("")
      + `</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  function renderDupNotice() {
    const panel = $("bp-panel-coin");
    if (!panel || typeof APC === "undefined" || !APC.l) return;
    const same = sameTicker(APC.l.symbol);
    let el = $("apc-dup-note");
    if (same.length <= 1) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "apc-dup-note"; el.className = "apc-dup-note";
      const row = panel.querySelector(".ac2-ca-row");
      if (!row) return;
      row.parentNode.insertBefore(el, row.nextSibling);
    }
    const others = same.filter((x) => lc(x.token) !== lc(APC.token));
    const first = [...same].sort((a, b) => a.launchedAt - b.launchedAt)[0];
    const isFirst = first && lc(first.token) === lc(APC.token);
    const link = (x) => x.core ? `<a href="/arc#arcircle">$ARCIRCLE (core coin)</a>` : `<a href="/arc#coin/${x.token}">${x.token.slice(0, 6)}…${x.token.slice(-4)}</a>`;
    el.innerHTML = `<b>${same.length} coins use $${esc(APC.l.symbol)}.</b> ${isFirst ? "This is the first one launched." : "This is not the first — check the contract address before you buy."} <span class="apc-dup-others">Others: ${others.slice(0, 4).map(link).join(", ")}${others.length > 4 ? "…" : ""}</span>`;
  }
  async function refreshSafety() {
    if (typeof APC === "undefined" || !APC.l) return;
    const fb = $("apc-logo-fallback");
    if (fb) fb.style.background = avatarBg(APC.token).replace(/^background:/, "");
    const token = APC.token;
    renderSafety(); renderDupNotice(); paintWatchState();
    await loadSafety(token, APC.l.creator);
    if (APC.token === token) renderSafety();
  }
  if (typeof apcRenderHeader === "function") {
    const orig = apcRenderHeader;
    // eslint-disable-next-line no-global-assign
    apcRenderHeader = function () { orig(); refreshSafety().catch((e) => console.warn(e)); };
  }
  if (typeof apcRenderData === "function") {
    const orig = apcRenderData;
    // eslint-disable-next-line no-global-assign
    apcRenderData = function () { orig(); try { renderSafety(); } catch (e) { console.warn(e); } };
  }
  if (typeof apcResetView === "function") {
    const orig = apcResetView;
    // eslint-disable-next-line no-global-assign
    apcResetView = function () { orig(); const b = $("apc-safety"); if (b) { b.innerHTML = ""; b.__html = ""; } const d = $("apc-dup-note"); if (d) d.remove(); };
  }

  // ================= Portfolio =================
  const PF = { seq: 0, data: null, account: null, timer: null, busy: false };
  const portfolioActive = () => { const p = $("bp-panel-portfolio"); return !!(p && p.classList.contains("active")); };
  async function loadPortfolio(account) {
    const p = readProvider();
    const launches = ARC.launches.slice();
    const tokens = launches.map((l) => new ethers.Contract(l.token, ERC20_ABI, p));
    const arcTok = new ethers.Contract(ARCIRCLE_TOKEN(), ERC20_ABI, p);
    const curve = new ethers.Contract("0xa37A96C43e2335553BD79171DE6dB2806414AC64", ["function getReserves() view returns (uint256,uint256)"], p);
    const calls = tokens.map((c) => ({ contract: c, method: "balanceOf", args: [account] }));
    calls.push({ contract: arcTok, method: "balanceOf", args: [account] }, { contract: curve, method: "getReserves" });
    const r = await withRetry(() => multicallRead(calls));
    const native = await p.getBalance(account).catch(() => null);
    const n = launches.length;
    const res = r[n + 1];
    const arcPrice = res ? Number(ethers.formatUnits(res[0], 6)) / Number(ethers.formatUnits(res[1], 18)) : null;
    const rows = launches.map((l, i) => {
      const amt = r[i] != null ? Number(ethers.formatUnits(r[i], 18)) : 0;
      return { l, amt, value: l.priceUsdc != null ? amt * l.priceUsdc : null };
    }).filter((x) => x.amt > 0);
    const arcAmt = r[n] != null ? Number(ethers.formatUnits(r[n], 18)) : 0;
    if (arcAmt > 0) rows.push({ core: true, amt: arcAmt, value: arcPrice != null ? arcAmt * arcPrice : null });
    rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    return { rows, usdc: native != null ? Number(ethers.formatEther(native)) : null, at: Date.now() };
  }
  function pfRowHtml(x) {
    if (x.core) {
      return `<a class="pf-row" href="/arc#arcircle"><img class="pf-logo" src="images/arcircle-mark-sm.png" alt="">
        <span class="pf-who"><b>$ARCIRCLE</b><small>Core coin</small></span>
        <span class="pf-amt">${num(x.amt)}</span><span class="pf-val">${usd(x.value)}</span><span class="pf-chg"></span></a>`;
    }
    const l = x.l;
    const chg = typeof arcChangeSinceLaunch === "function" ? arcChangeSinceLaunch(l) : null;
    const img = safeImg(l.imageUrl) ? `<img class="pf-logo" src="${esc(l.imageUrl)}" alt="">` : `<span class="pf-logo ph" style="${avatarBg(l.token)}">${esc(String(l.symbol || "?").slice(0, 1).toUpperCase())}</span>`;
    return `<a class="pf-row" href="/arc#coin/${l.token}">${img}
      <span class="pf-who"><b>$${esc(l.symbol)}</b><small>${esc(l.name)}</small></span>
      <span class="pf-amt">${x.watch ? "" : num(x.amt)}</span><span class="pf-val">${x.watch ? `${usd(l.marketCapUsd)} mcap` : usd(x.value)}</span>
      <span class="pf-chg ${chg > 0 ? "up" : chg < 0 ? "down" : ""}">${chg == null ? "" : `${chg > 0 ? "+" : ""}${(chg * 100).toFixed(Math.abs(chg) < 0.1 ? 1 : 0)}%`}</span></a>`;
  }
  function renderPortfolio(opts = {}) {
    const body = $("pf-body");
    if (!body) return;
    const acct = state.account;
    if (!acct) {
      body.innerHTML = `<div class="pf-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/></svg><b>Connect a wallet to see your portfolio</b><span>Your ArcPad coins, $ARCIRCLE and the coins you launched, read straight from Arc.</span><button type="button" class="pf-connect">Connect wallet</button></div>`;
      body.querySelector(".pf-connect").addEventListener("click", () => { if (typeof connectWallet === "function") connectWallet(); });
      PF.data = null; PF.account = null;
      return;
    }
    if (!ARC.launches.length && !opts.quiet) { body.innerHTML = `<div class="empty-state">Loading…</div>`; }
    const stale = !PF.data || PF.account !== lc(acct) || Date.now() - PF.data.at > 25_000;
    if (PF.data && PF.account === lc(acct)) paintPortfolio();
    else if (!opts.quiet) body.innerHTML = `<div class="pf-skel"><i></i><i></i><i></i></div>`;
    if (stale && !PF.busy && ARC.launches.length) {
      PF.busy = true;
      const seq = ++PF.seq;
      loadPortfolio(acct).then((d) => {
        if (seq !== PF.seq || lc(state.account) !== lc(acct)) return;
        PF.data = d; PF.account = lc(acct);
        paintPortfolio();
      }).catch((err) => {
        console.warn("portfolio load failed", err);
        if (!PF.data) body.innerHTML = `<div class="empty-state">Couldn't read your balances from Arc — try again in a moment.</div>`;
      }).finally(() => { PF.busy = false; });
    }
  }
  function paintPortfolio() {
    const body = $("pf-body");
    const d = PF.data;
    if (!body || !d) return;
    const acct = lc(state.account);
    const total = d.rows.reduce((s, x) => s + (x.value || 0), 0);
    const mine = ARC.launches.filter((l) => lc(l.creator) === acct);
    const watched = ARC.launches.filter((l) => isWatched(l.token));
    const st = (l) => (typeof arcActStats === "function" && arcActStats(l.token)) || { vol: 0, trades: 0 };
    let feeTotal = 0;
    const mineHtml = mine.map((l) => {
      const s = st(l);
      const fee = (s.vol || 0) * (0.007 + (l.extraFeeBps || 0) / 10000);
      feeTotal += fee;
      const img = safeImg(l.imageUrl) ? `<img class="pf-logo" src="${esc(l.imageUrl)}" alt="">` : `<span class="pf-logo ph" style="${avatarBg(l.token)}">${esc(String(l.symbol || "?").slice(0, 1).toUpperCase())}</span>`;
      return `<a class="pf-launch" href="/arc#coin/${l.token}">
        <div class="pf-launch-top">${img}<span class="pf-who"><b>$${esc(l.symbol)}</b><small>${esc(l.name)}</small></span></div>
        <dl><div><dt>Market cap</dt><dd>${usd(l.marketCapUsd)}</dd></div><div><dt>Volume 24h</dt><dd>${usd(s.vol)}</dd></div>
        <div><dt>Trades 24h</dt><dd>${s.trades || 0}</dd></div><div><dt>Your fees 24h</dt><dd class="pf-fee">≈ ${usd(fee)}</dd></div></dl></a>`;
    }).join("");
    const html = `
      <div class="pf-summary">
        <div class="pf-sum-main"><small>Holdings value</small><strong>${usd(total)}</strong><span class="pf-addr" data-no-i18n>${esc(state.account.slice(0, 6))}…${esc(state.account.slice(-4))}</span></div>
        <div class="pf-sum-stat"><small>USDC (gas)</small><b>${d.usdc == null ? "—" : num(d.usdc)}</b></div>
        <div class="pf-sum-stat"><small>Coins held</small><b>${d.rows.length}</b></div>
        <div class="pf-sum-stat"><small>Coins launched</small><b>${mine.length}</b></div>
        <div class="pf-sum-stat"><small>Creator fees 24h</small><b>≈ ${usd(feeTotal)}</b></div>
      </div>
      <h3 class="pf-h">Holdings</h3>
      ${d.rows.length ? `<div class="pf-table"><div class="pf-row pf-head"><span></span><span>Coin</span><span class="pf-amt">Amount</span><span class="pf-val">Value</span><span class="pf-chg">Since launch</span></div>${d.rows.map(pfRowHtml).join("")}</div>`
        : `<div class="empty-state">No ArcPad coins in this wallet yet. <button type="button" class="bp-card-link" data-pf-go="explore">Explore coins →</button></div>`}
      <h3 class="pf-h">Your launches</h3>
      ${mine.length ? `<div class="pf-launches">${mineHtml}</div><p class="pf-note">Fees are an estimate from the last 24h of trades: 70% of the 1% base fee plus your add-on. They are paid out by the fee hook as trades happen.</p>`
        : `<div class="empty-state">You haven't launched a coin from this wallet. <button type="button" class="bp-card-link" data-pf-go="launch">Launch a coin →</button></div>`}
      ${watched.length ? `<h3 class="pf-h">Watchlist</h3><div class="pf-table">${watched.map((l) => pfRowHtml({ l, watch: true })).join("")}</div>` : ""}`;
    if (body.__html !== html) {
      body.innerHTML = html; body.__html = html;
      body.querySelectorAll("[data-pf-go]").forEach((b) => b.addEventListener("click", () => window.arcpadShowTab && window.arcpadShowTab(b.dataset.pfGo)));
    }
  }
  document.addEventListener("arcpad:tab", (e) => {
    if (e.detail && e.detail.tab === "portfolio") renderPortfolio();
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.pf-row, a.pf-launch, a.ap-topcoin");
    if (!a) return;
    const m = /#coin\/(0x[0-9a-fA-F]{40})$/.exec(a.getAttribute("href") || "");
    if (m && typeof openArcCoin === "function") { e.preventDefault(); openArcCoin(m[1]); }
    else if (/#arcircle$/.test(a.getAttribute("href") || "") && window.arcpadShowTab) { e.preventDefault(); window.arcpadShowTab("arcircle"); }
  });
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () {
      orig();
      try {
        if (portfolioActive()) renderPortfolio();
        if (typeof APC !== "undefined" && APC.l) renderSafety();
      } catch (e) { console.warn(e); }
    };
  }
  if (typeof renderArcpadExplore === "function") {
    const orig = renderArcpadExplore;
    // eslint-disable-next-line no-global-assign
    renderArcpadExplore = function () {
      orig();
      symMemo.n = -1;
      paintWatchState();
      if (portfolioActive()) renderPortfolio();
      if (typeof APC !== "undefined" && APC.l) renderDupNotice();
    };
  }
  setInterval(() => { if (portfolioActive() && !document.hidden) renderPortfolio({ quiet: true }); }, 30_000);
  if (portfolioActive()) renderPortfolio();

  // ================= phone trade bar + bottom sheet =================
  const bar = document.createElement("div");
  bar.className = "mtb"; bar.id = "mtb";
  bar.innerHTML = `<div class="mtb-info"><b class="mtb-sym"></b><span class="mtb-price"></span></div>
    <button type="button" class="mtb-btn mtb-buy" data-mtb="buy">Buy</button><button type="button" class="mtb-btn mtb-sell" data-mtb="sell">Sell</button>`;
  document.body.appendChild(bar);
  const sheet = document.createElement("div");
  sheet.className = "msheet"; sheet.id = "msheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="msheet-backdrop"></div><div class="msheet-panel" role="dialog" aria-modal="true" aria-label="Trade"><div class="msheet-grip" aria-hidden="true"></div><button type="button" class="msheet-x" aria-label="Close">&times;</button><div class="msheet-body"></div></div>`;
  document.body.appendChild(sheet);
  let moved = null; // {card, parent, next}
  function activeTradePanel() {
    const coin = $("bp-panel-coin"), arc = $("bp-panel-arcircle");
    if (coin && coin.classList.contains("active")) return { kind: "coin", card: $("apc-swap"), sym: ($("apc-sym") || {}).textContent, price: ($("apc-price") || {}).textContent };
    if (arc && arc.classList.contains("active")) {
      const pr = arc.querySelector('[data-ac2="price"]');
      return { kind: "arcircle", card: $("ac2-swap"), sym: "$ARCIRCLE", price: pr ? pr.textContent : "" };
    }
    return null;
  }
  function updateBar() {
    const t = activeTradePanel();
    const on = !!(t && t.card && isMobile());
    bar.classList.toggle("on", on);
    document.body.classList.toggle("mtb-on", on);
    if (!on) { if (!sheet.hidden) closeSheet(); return; }
    bar.querySelector(".mtb-sym").textContent = (t.sym || "").trim() || "—";
    bar.querySelector(".mtb-price").textContent = (t.price || "").trim();
    const dock = document.querySelector("nav.ax-dock");
    const r = dock && dock.getBoundingClientRect();
    const bottom = r && r.height && getComputedStyle(dock).display !== "none" ? Math.max(12, window.innerHeight - r.top + 10) : 14;
    bar.style.bottom = `${bottom}px`;
  }
  function openSheet(side) {
    const t = activeTradePanel();
    if (!t || !t.card) return;
    if (moved) closeSheet();
    const card = t.card;
    moved = { card, parent: card.parentNode, next: card.nextSibling };
    sheet.querySelector(".msheet-body").appendChild(card);
    sheet.hidden = false;
    document.documentElement.classList.add("msheet-open");
    requestAnimationFrame(() => sheet.classList.add("in"));
    const tab = card.querySelector(`.ac2-swap-tabs button[data-side="${side}"]`);
    if (tab && !tab.classList.contains("active")) tab.click();
    setTimeout(() => { const inp = card.querySelector("input[type=text],input[inputmode],input"); if (inp && side === "buy") inp.focus({ preventScroll: true }); }, 320);
  }
  function closeSheet() {
    sheet.classList.remove("in");
    document.documentElement.classList.remove("msheet-open");
    if (moved) {
      const { card, parent, next } = moved;
      if (next && next.parentNode === parent) parent.insertBefore(card, next); else parent.appendChild(card);
      moved = null;
    }
    setTimeout(() => { if (!sheet.classList.contains("in")) sheet.hidden = true; }, 260);
  }
  bar.addEventListener("click", (e) => { const b = e.target.closest("[data-mtb]"); if (b) openSheet(b.dataset.mtb); });
  sheet.querySelector(".msheet-backdrop").addEventListener("click", closeSheet);
  sheet.querySelector(".msheet-x").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  // swipe down on the grip to close
  (() => {
    let y0 = null;
    const panel = sheet.querySelector(".msheet-panel");
    panel.addEventListener("touchstart", (e) => { if (e.target.closest(".msheet-grip") || panel.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener("touchmove", (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) panel.style.transform = `translateY(${dy}px)`; }, { passive: true });
    panel.addEventListener("touchend", (e) => {
      if (y0 == null) return;
      const dy = (e.changedTouches[0] || {}).clientY - y0;
      panel.style.transform = "";
      y0 = null;
      if (dy > 90) closeSheet();
    });
  })();
  document.addEventListener("arcpad:tab", () => setTimeout(updateBar, 0));
  window.addEventListener("resize", updateBar);
  window.addEventListener("hashchange", () => setTimeout(updateBar, 0));
  setInterval(() => { if (bar.classList.contains("on")) updateBar(); }, 3000);
  setTimeout(updateBar, 0);

  // ================= launch form =================
  const symIn = $("ap-symbol");
  function checkSymbol() {
    if (!symIn) return;
    const up = symIn.value.toUpperCase();
    if (symIn.value !== up) {
      const p = symIn.selectionStart;
      symIn.value = up;
      try { symIn.setSelectionRange(p, p); } catch { /* number inputs etc. */ }
    }
    const warn = $("ap-sym-warn");
    if (!warn) return;
    const v = up.trim().replace(/^\$/, "");
    const same = v ? sameTicker(v) : [];
    if (v === "ARCIRCLE") { warn.hidden = false; warn.className = "ap-sym-warn bad"; warn.textContent = "$ARCIRCLE is the platform's core coin — pick another ticker so buyers aren't misled."; }
    else if (same.length) { warn.hidden = false; warn.className = "ap-sym-warn"; warn.textContent = `$${v} is already used by ${same.length} coin${same.length === 1 ? "" : "s"} on ArcPad. You can still launch, but buyers may mix them up.`; }
    else warn.hidden = true;
  }
  if (symIn) symIn.addEventListener("input", checkSymbol);

  const devIn = $("ap-devbuy");
  const quick = $("ap-devbuy-quick");
  function paintQuick() {
    if (!quick || !devIn) return;
    const v = devIn.value.trim();
    quick.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === v || (!v && b.dataset.v === "")));
  }
  if (quick && devIn) {
    quick.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      devIn.value = b.dataset.v;
      devIn.dispatchEvent(new Event("input", { bubbles: true }));
      paintQuick();
    });
    devIn.addEventListener("input", paintQuick);
    paintQuick();
  }

  function renderPreview() {
    const card = $("ap-lp-card");
    if (!card) return;
    const name = ($("ap-name") || {}).value || "";
    const sym = (($("ap-symbol") || {}).value || "").trim().replace(/^\$/, "").toUpperCase();
    const logo = (($("ap-logo") || {}).value || "").trim();
    const desc = (($("ap-description") || {}).value || "").trim();
    const extra = Number((($("ap-extrafee") || {}).value) || 0);
    const pair = (typeof ARC !== "undefined" && ARC.pair && ARC.pair.meta) ? ARC.pair.meta.symbol : "USDC";
    const img = safeImg(logo) ? `<img class="ap-card-logo" src="${esc(logo)}" alt="">`
      : `<span class="ap-card-logo ph" style="${avatarBg("0x" + Array.from(sym || "X").map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(6, "0"))}">${esc((sym || "?").slice(0, 1))}</span>`;
    card.innerHTML = `
      <div class="ap-card-top">${img}<span class="ap-card-age">now</span></div>
      <div class="sym">$${esc(sym || "TICKER")}${pair !== "USDC" ? ` <span class="ap-pair-tag">/ ${esc(pair)}</span>` : ""}</div>
      <div class="name">${esc(name || "Your coin name")}</div>
      <svg class="ap-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0,20 L20,18 L40,15 L60,12 L80,8 L100,4"/></svg>
      <div class="meta"><span>≈ $4.3K mcap</span><span class="ap-chg flat">new</span></div>
      <div class="ap-card-vol">Fee ${1 + extra / 100}%${extra ? ` · ${extra / 100}% to you` : ""}</div>
      ${desc ? `<p class="ap-lp-desc">${esc(desc.slice(0, 120))}${desc.length > 120 ? "…" : ""}</p>` : ""}`;
  }
  let pvT;
  const queuePreview = () => { clearTimeout(pvT); pvT = setTimeout(renderPreview, 120); };
  ["ap-name", "ap-symbol", "ap-logo", "ap-description", "ap-extrafee"].forEach((id) => { const el = $(id); if (el) { el.addEventListener("input", queuePreview); el.addEventListener("change", queuePreview); } });
  const lf = $("ap-logo-file");
  if (lf) lf.addEventListener("change", () => { setTimeout(renderPreview, 700); setTimeout(renderPreview, 1800); });
  if (typeof arcpadRenderPair === "function") {
    const orig = arcpadRenderPair;
    // eslint-disable-next-line no-global-assign
    arcpadRenderPair = function () { orig.apply(this, arguments); try { renderPreview(); } catch (e) { console.warn(e); } };
  }
  renderPreview();
})();
