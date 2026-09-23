/* global ethers, CONFIG, ARC, ACT, AC2, ARCIRCLE, ARC_FACTORY_ABI, ERC20_ABI, state, readProvider, withRetry, multicallRead,
          arcActStats, ac2RenderData, ac2TsOf, actPaint */
// arc-growth.js — two read-only views on ArcPad:
//   • Treasury buybacks, on the $ARCIRCLE page: every $ARCIRCLE buy made by
//     the platform treasury / platform wallet, taken from the curve's own
//     trade history, plus what the treasury holds right now.
//   • Creators tab: a preview leaderboard of ArcPad creators from the last
//     24h of on-chain trading. Clearly a preview — no rewards are paid from it.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const usd = (n) => {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    if (n >= 1) return "$" + n.toFixed(2);
    return n === 0 ? "$0" : "$" + n.toPrecision(2);
  };
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e4 ? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n) : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const TREASURY_FALLBACK = "0xa066e6C5D1ac561A4065B9D6B00feF89C0bD02F8";

  // ================= Treasury buybacks =================
  const BB = { wallets: null, bal: null, balAt: 0, loading: false };
  async function bbLoad() {
    if (BB.loading) return;
    BB.loading = true;
    try {
      if (!BB.wallets) {
        const f = new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
        const r = await multicallRead([{ contract: f, method: "platformTreasury" }, { contract: f, method: "platformWallet" }]).catch(() => []);
        const real = (a) => a && !/^0x0{40}$/i.test(a);
        const list = [{ addr: real(r[0]) ? r[0] : TREASURY_FALLBACK, label: "Treasury" }];
        if (real(r[1]) && lc(r[1]) !== lc(list[0].addr)) list.push({ addr: r[1], label: "Platform wallet" });
        BB.wallets = list;
      }
      if (Date.now() - BB.balAt > 60_000) {
        const tok = new ethers.Contract(ARCIRCLE.token, ERC20_ABI, readProvider());
        const r = await withRetry(() => multicallRead(BB.wallets.map((w) => ({ contract: tok, method: "balanceOf", args: [w.addr] }))));
        BB.bal = r.reduce((s, v) => s + (v != null ? Number(ethers.formatUnits(v, 18)) : 0), 0);
        BB.balAt = Date.now();
      }
    } catch (err) { console.warn("buyback tracker", err); } finally { BB.loading = false; }
    renderBuybacks();
  }
  function renderBuybacks() {
    const panel = $("bp-panel-arcircle");
    if (!panel || typeof AC2 === "undefined") return;
    let box = $("ac2-buybacks");
    if (!box) {
      const grid = panel.querySelector(".ac2-grid");
      if (!grid) return;
      box = document.createElement("div");
      box.id = "ac2-buybacks"; box.className = "ac2-card ac2-buybacks";
      grid.parentNode.insertBefore(box, grid);
    }
    const wallets = BB.wallets || [{ addr: TREASURY_FALLBACK, label: "Treasury" }];
    const set = new Set(wallets.map((w) => lc(w.addr)));
    const buys = (AC2.trades || []).filter((t) => t.side === "buy" && set.has(lc(t.trader)));
    const spent = buys.reduce((s, t) => s + t.usdc, 0), got = buys.reduce((s, t) => s + t.tok, 0);
    const indexing = !AC2.logs || AC2.logs.lo > AC2.logs.launchBlock;
    const ago = (b) => { const ts = typeof ac2TsOf === "function" ? ac2TsOf(b) : null; if (!ts) return ""; const s = Math.max(0, Date.now() / 1000 - ts); return s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
    const html = `
      <div class="ac2-bb-head"><h3>Treasury buybacks</h3><small>${indexing ? "Indexing the curve's history…" : "Every $ARCIRCLE buy by the platform's wallets, read from the curve"}</small></div>
      <div class="ac2-bb-stats">
        <div><small>Buybacks</small><strong>${buys.length}</strong></div>
        <div><small>USDC spent</small><strong>${usd(spent)}</strong></div>
        <div><small>$ARCIRCLE bought</small><strong>${num(got)}</strong></div>
        <div><small>Treasury holds</small><strong>${BB.bal == null ? "…" : num(BB.bal)}</strong></div>
      </div>
      ${buys.length ? `<div class="ac2-bb-list">${buys.slice(0, 6).map((t) => `<a href="${explorer("tx", t.h)}" target="_blank" rel="noopener"><span class="ac2-type buy">Buy</span><b>${usd(t.usdc)}</b><span>${num(t.tok)} $ARCIRCLE</span><time>${ago(t.b)}</time><span class="ac2-tx">↗</span></a>`).join("")}</div>`
        : `<p class="ac2-bb-empty">${indexing ? "Checking every trade since launch…" : "No buybacks yet. The whitepaper roadmap puts the first treasury buybacks in Phase 1 (Q4 2026) — each one will appear here automatically."}</p>`}
      <p class="ac2-bb-wallets">Tracked: ${wallets.map((w) => `${esc(w.label)} <a href="${explorer("address", w.addr)}" target="_blank" rel="noopener" data-no-i18n>${short(w.addr)} ↗</a>`).join(" · ")}</p>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  if (typeof ac2RenderData === "function") {
    const orig = ac2RenderData;
    // eslint-disable-next-line no-global-assign
    ac2RenderData = function () { orig(); try { renderBuybacks(); if (!BB.wallets || Date.now() - BB.balAt > 60_000) bbLoad(); } catch (e) { console.warn(e); } };
  }

  // ================= Creators (preview leaderboard) =================
  const CR = { rendered: null };
  const creatorsActive = () => { const p = $("bp-panel-creators"); return !!(p && p.classList.contains("active")); };
  function creatorRows() {
    const by = new Map();
    for (const l of ARC.launches) {
      const k = lc(l.creator);
      if (!k) continue;
      const s = (typeof arcActStats === "function" && arcActStats(l.token)) || { vol: 0, trades: 0 };
      const boost = l.quoteToken && lc(l.quoteToken) === lc(ARCIRCLE.token) ? 1.25 : 1;
      const coinScore = ((s.vol || 0) + 5 * (s.trades || 0)) * boost;
      if (!by.has(k)) by.set(k, { creator: l.creator, coins: [], vol: 0, trades: 0, score: 0, boosted: false });
      const r = by.get(k);
      r.coins.push(l); r.vol += s.vol || 0; r.trades += s.trades || 0; r.score += coinScore; r.boosted = r.boosted || boost > 1;
    }
    return [...by.values()].sort((a, b) => b.score - a.score || b.coins.length - a.coins.length);
  }
  function renderCreators() {
    const body = $("cr-body");
    if (!body) return;
    if (!ARC.launches.length) { body.innerHTML = `<div class="empty-state">Loading…</div>`; return; }
    const rows = creatorRows();
    const me = lc(state.account);
    const scanning = typeof ACT === "undefined" || ACT.hi == null;
    const html = `<div class="cr-table">
      <div class="cr-row cr-head"><span>#</span><span>Creator</span><span>Coins</span><span class="r">Volume 24h</span><span class="r">Trades 24h</span><span class="r">Score</span></div>
      ${rows.map((r, i) => `<div class="cr-row${lc(r.creator) === me ? " is-me" : ""}${i < 3 && r.score > 0 ? ` top${i + 1}` : ""}">
        <span class="cr-rank">${i + 1}</span>
        <span class="cr-who"><a href="${explorer("address", r.creator)}" target="_blank" rel="noopener" data-no-i18n>${short(r.creator)}</a>${lc(r.creator) === me ? ' <span class="ac2-you">you</span>' : ""}</span>
        <span class="cr-coins">${r.coins.slice(0, 4).map((l) => `<a class="cr-coin" href="/arc#coin/${l.token}">$${esc(l.symbol)}</a>`).join("")}${r.coins.length > 4 ? `<span class="cr-more">+${r.coins.length - 4}</span>` : ""}</span>
        <span class="r">${scanning ? "…" : usd(r.vol)}</span>
        <span class="r">${scanning ? "…" : r.trades}</span>
        <span class="r cr-score">${scanning ? "…" : Math.round(r.score).toLocaleString("en-US")}${r.boosted ? '<i title="$ARCIRCLE-paired boost">×1.25</i>' : ""}</span>
      </div>`).join("")}
    </div>`;
    if (CR.rendered !== html) { body.innerHTML = html; CR.rendered = html; }
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "creators") renderCreators(); });
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.cr-coin");
    if (!a) return;
    const m = /#coin\/(0x[0-9a-fA-F]{40})$/.exec(a.getAttribute("href") || "");
    if (m && typeof window.openArcCoin === "function") { e.preventDefault(); window.openArcCoin(m[1]); }
  });
  if (typeof actPaint === "function") {
    const orig = actPaint;
    // eslint-disable-next-line no-global-assign
    actPaint = function () { orig(); try { if (creatorsActive()) renderCreators(); } catch (e) { console.warn(e); } };
  }
  if (typeof renderArcpadExplore === "function") {
    const orig = renderArcpadExplore;
    // eslint-disable-next-line no-global-assign
    renderArcpadExplore = function () { orig(); try { if (creatorsActive()) renderCreators(); } catch (e) { console.warn(e); } };
  }
  if (creatorsActive()) renderCreators();
})();
