// arc-orders-v5.js — ARCIRCLE Orders v5 extras (bundled after arc-orders-v4.js; works through window.arcOrders):
//   · Portfolio: what this wallet holds on this chain — balance, value, average Orders buy, unrealized change, open
//     orders — with "Protect" (a take-profit and stop-loss on what you hold, one tap from the form)
//   · the fee burn's dashboard: $ARCIRCLE burned by Orders fees, what's waiting for the next hourly burn against its
//     minimum, the last burn, the last 7 days (GET /api/social?orders=burns)
//   · the chain switch shows each chain's markets and whether its executor checked in lately
//   · Solana, before it opens: "tell me when it's live" — this browser (Web Push topic orders-sol) or Telegram
//   · the guide folds to its title once you know your way around
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const O = () => window.arcOrders;
  const CH = () => (O() ? O().chain() : "arc");
  const L3 = (en, ko, zh) => (O() ? O().L3(en, ko, zh) : en);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const V = { port: null, portKey: "", portBusy: false, burns: null, burnCh: null, burnShown: null, info: {}, infoAt: 0 };
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"];
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }));
  const ARCIA_ART = '<img class="aor-arcia-mini" src="/images/arcia-avatar-96.jpg" alt="" width="36" height="36" loading="lazy">';

  // ---------------- Portfolio ----------------
  /// the tokens worth checking on this chain: markets, my orders, ★, recent, the open one
  function candidates() {
    const A = O(), S = A.state, out = new Map();
    const add = (t, sym, dec) => { t = lc(t); if (!isAddr(t)) return; const x = out.get(t) || { t, sym: null, dec: null }; x.sym = x.sym || sym || null; x.dec = x.dec != null ? x.dec : dec != null ? Number(dec) : null; out.set(t, x); };
    if (S.tok) add(S.t, S.tok.symbol, S.tok.decimals);
    add(A.defaultMkt(), null, null);
    for (const m of S.markets || []) add(m.token.address || m.token, m.token.symbol, m.token.decimals);
    for (const o of (S.mine && S.mine.orders) || []) add(o.token.address || o.token, o.token.symbol, o.token.decimals);
    for (const f of A.favs()) add(f);
    for (const r of A.recent()) add(r.t, r.sym);
    return [...out.values()].slice(0, 30);
  }
  /// my average Orders buy and my open orders, per token
  function mineBy() {
    const S = O().state, by = new Map();
    for (const o of (S.mine && S.mine.orders) || []) {
      const t = lc(o.token.address || o.token), g = by.get(t) || { bT: 0, bQ: 0, open: 0 };
      if (o.side === "buy" && o.filledPct > 0 && o.price > 0) { const x = (Number(o.buyAmount) / 10 ** o.token.decimals / 0.999) * (o.filledPct / 100); g.bT += x; g.bQ += x * (o.fillPx > 0 ? o.fillPx : o.price); }
      if (o.status === "open" || o.status === "unfunded") g.open++;
      by.set(t, g);
    }
    return by;
  }
  /// v6: the trading journal — from my filled Orders, oldest first: each sell against the average buy before it gives a
  /// realized result (a win when it sold above that average); the days in a 5-week calendar; the time held (first buy
  /// fill to the sell). Orders fills only — not swaps made elsewhere.
  /// v7: with both chains on, Arc's and Robinhood Chain's fills together, every result in dollars (ETH at the server's price)
  function journal(both) {
    const S = O().state, fills = [], here = CH(), uOf = (ch) => (ch === "rh" ? V.ethUsd || S.ethUsd || null : 1);
    const src = [...((S.mine && S.mine.orders) || []).map((o) => [o, here]), ...(both && S.other ? (S.other.orders || []).map((o) => [o, S.other.ch]) : [])];
    for (const [o, ch] of src) {
      if (!(o.filledPct > 0) || !(o.price > 0) || !o.token) continue;
      const d = Number(o.token.decimals ?? 18), f = o.filledPct / 100, k = both ? uOf(ch) : 1;
      if (both && !k) continue;
      const tok = o.side === "buy" ? (Number(o.buyAmount) / 10 ** d / 0.999) * f : (Number(o.sellAmount) / 10 ** d) * f;
      fills.push({ t: ch + ":" + lc(o.token.address || o.token), sym: o.token.symbol, ch, side: o.side, tok, px: (o.fillPx > 0 ? o.fillPx : o.price) * k, at: o.last || o.at });
    }
    fills.sort((a, b) => a.at - b.at);
    const pos = new Map(), sells = [];
    for (const x of fills) {
      const p0 = pos.get(x.t) || { tok: 0, cost: 0, first: null };
      if (x.side === "buy") { p0.tok += x.tok; p0.cost += x.tok * x.px; if (p0.first == null) p0.first = x.at; }
      else if (p0.tok > 0) {
        const avg = p0.cost / p0.tok, q = Math.min(x.tok, p0.tok), pnl = q * (x.px - avg);
        sells.push({ t: x.t, sym: x.sym, ch: x.ch, at: x.at, pnl, pct: (x.px / avg - 1) * 100, held: p0.first != null ? x.at - p0.first : null });
        p0.cost -= avg * q; p0.tok -= q; if (p0.tok <= 1e-12) { p0.tok = 0; p0.cost = 0; p0.first = null; }
      }
      pos.set(x.t, p0);
    }
    const byM = new Map();
    for (const z of sells) { const g = byM.get(z.t) || { sym: z.sym, n: 0, w: 0, pnl: 0, held: 0, hn: 0 }; g.n++; if (z.pnl > 0) g.w++; g.pnl += z.pnl; if (z.held != null) { g.held += z.held; g.hn++; } byM.set(z.t, g); }
    const days = new Map(); for (const z of sells) { const k = new Date(z.at * 1000).toISOString().slice(0, 10); days.set(k, (days.get(k) || 0) + z.pnl); }
    return { sells, byM, days };
  }
  function journalHtml() {
    const A = O(), both = A.state.myScope === "both", j = journal(both);
    if (both && !V.ethUsd) loadEthUsd();
    if (!j.sells.length) return `<div class="aor-jn"><b>${T("Trading journal")}</b><p class="aor-note">${T("It fills in as your Orders sells fill after Orders buys.")}</p></div>`;
    const qs = both ? "USD" : A.state.quote ? A.state.quote.symbol : CH() === "rh" ? "ETH" : "USDC";
    V.jn = { j, qs, both };
    const tot = j.sells.reduce((a, z) => a + z.pnl, 0), wins = j.sells.filter((z) => z.pnl > 0).length;
    const hrs = (sec) => (sec == null ? "—" : sec < 3600 ? `${Math.max(1, Math.round(sec / 60))}m` : sec < 86400 ? `${(sec / 3600).toFixed(1)}h` : `${(sec / 86400).toFixed(1)}d`);
    // the last 35 days, a square each, coloured by the day's realized result
    const cells = [], today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const mx = Math.max(1e-18, ...[...j.days.values()].map(Math.abs));
    for (let i = 34; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400e3), k = d.toISOString().slice(0, 10), v = j.days.get(k); cells.push(`<i class="${v == null ? "" : v >= 0 ? "up" : "dn"}" style="--a:${v == null ? 0 : (0.25 + 0.75 * Math.min(1, Math.abs(v) / mx)).toFixed(2)}" title="${k}${v != null ? ` · ${v >= 0 ? "+" : "−"}${A.fp(Math.abs(v))} ${qs}` : ""}"></i>`); }
    const rows = [...j.byM.entries()].sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl)).slice(0, 8);
    return `<div class="aor-jn"><b>${T("Trading journal")}</b>
      <div class="aor-jn-k"><div><small>${T("Realized")}</small><b class="${tot >= 0 ? "up" : "dn"}" data-no-i18n>${tot >= 0 ? "+" : "−"}${esc(A.fp(Math.abs(tot)))} ${esc(qs)}</b></div><div><small>${T("Win rate")}</small><b data-no-i18n>${Math.round((wins / j.sells.length) * 100)}%</b><span data-no-i18n>${wins}/${j.sells.length}</span></div><div><small>${T("Average hold")}</small><b data-no-i18n>${hrs(j.sells.filter((z) => z.held != null).reduce((a, z, _, arr) => a + z.held / arr.length, 0) || null)}</b></div></div>
      <div class="aor-jn-cal" role="img" aria-label="${T("The last 5 weeks")}">${cells.join("")}</div>
      <div class="aor-jn-t"><span>${T("Market")}</span><span>${T("Sells")}</span><span>${T("Win rate")}</span><span>${T("Realized")}</span><span>${T("Average hold")}</span></div>
      ${rows.map(([t, g]) => `<div class="aor-jn-t"><button type="button" class="aor-link" data-t="${esc(String(t).split(":").pop())}" data-no-i18n>$${esc(g.sym)}</button><span data-no-i18n>${g.n}</span><span data-no-i18n>${Math.round((g.w / g.n) * 100)}%</span><span class="${g.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${g.pnl >= 0 ? "+" : "−"}${esc(A.fp(Math.abs(g.pnl)))}</span><span data-no-i18n>${hrs(g.hn ? g.held / g.hn : null)}</span></div>`).join("")}
      ${journalMore(j, qs)}
      <small class="aor-pf-n">${T(both ? "Each sell against your average Orders buy before it, on both chains, in dollars. Not advice." : "Each sell against your average Orders buy before it, on this chain. Not advice.")}</small></div>`;
  }
  /// v7: the week and the month, the best and the worst sell, the latest sells — and the journal as a card or a CSV
  function journalMore(j, qs) {
    const A = O(), now0 = Date.now() / 1000;
    const amt = (v) => (qs === "USD" || qs === "USDC" ? `${v < 0 ? "−" : "+"}${A.usd(Math.abs(v))}` : `${v < 0 ? "−" : "+"}${A.fp(Math.abs(v))} ${qs}`);
    const per = (sec) => { const z = j.sells.filter((x) => now0 - x.at <= sec); return { n: z.length, pnl: z.reduce((a, x) => a + x.pnl, 0), w: z.filter((x) => x.pnl > 0).length }; };
    const wk = per(7 * 86400), mo = per(30 * 86400);
    const best = j.sells.reduce((m, x) => (!m || x.pct > m.pct ? x : m), null), worst = j.sells.reduce((m, x) => (!m || x.pct < m.pct ? x : m), null);
    const last = [...j.sells].sort((a, b) => b.at - a.at).slice(0, 6);
    const when = (t) => { const d = new Date(t * 1000); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    return `<div class="aor-jn-p">${[[L3("7 days", "7일", "7天"), wk], [L3("30 days", "30일", "30天"), mo]].map(([l, x]) => `<div><small data-no-i18n>${esc(l)}</small><b class="${x.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${x.n ? esc(amt(x.pnl)) : "—"}</b><span data-no-i18n>${esc(L3(`${x.n} sells · ${x.w} wins`, `매도 ${x.n} · 수익 ${x.w}`, `${x.n} 笔卖出 · ${x.w} 笔盈利`))}</span></div>`).join("")}
      ${best ? `<div><small>${T("Best sell")}</small><b class="up" data-no-i18n>${esc(A.pc(best.pct, 1))}</b><span data-no-i18n>$${esc(best.sym)} · ${esc(when(best.at))}</span></div>` : ""}
      ${worst && worst !== best ? `<div><small>${T("Worst sell")}</small><b class="${worst.pct >= 0 ? "up" : "dn"}" data-no-i18n>${esc(A.pc(worst.pct, 1))}</b><span data-no-i18n>$${esc(worst.sym)} · ${esc(when(worst.at))}</span></div>` : ""}</div>
      <div class="aor-jn-l"><small>${T("Latest sells")}</small>${last.map((x) => `<div class="aor-jn-lr"><span data-no-i18n>${esc(when(x.at))}</span><b data-no-i18n>$${esc(x.sym)}${x.ch && V.jn && V.jn.both ? ` <i>${esc(x.ch === "rh" ? "RH" : "Arc")}</i>` : ""}</b><span class="${x.pct >= 0 ? "up" : "dn"}" data-no-i18n>${esc(A.pc(x.pct, 1))}</span><span class="${x.pnl >= 0 ? "up" : "dn"}" data-no-i18n>${esc(amt(x.pnl))}</span></div>`).join("")}</div>
      <div class="aor-jn-act"><button type="button" class="aor-btn sm ghost" data-jcard>${T("Share as an image")}</button><button type="button" class="aor-btn sm ghost" data-jcsv>${T("Download CSV")}</button></div>`;
  }
  async function loadEthUsd() {
    if (V.ethBusy) return; V.ethBusy = true;
    try { const r = await fetch("/api/social?orders=status&chain=rh", { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.ethUsd > 0) V.ethUsd = j.ethUsd; } catch { /* dollars wait */ }
    V.ethBusy = false;
    const el = $("aor-mine"); if (el && O().state.myTab === "port" && V.ethUsd) portfolio(el);
  }
  function journalCsv() {
    const x = V.jn; if (!x) return;
    const rows = [["date", "chain", "token", "vs_avg_buy_pct", "realized_" + x.qs, "held_hours"], ...x.j.sells.map((z) => [new Date(z.at * 1000).toISOString(), z.ch || CH(), z.sym, z.pct.toFixed(2), z.pnl.toPrecision(8), z.held != null ? (z.held / 3600).toFixed(2) : ""])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" })); a.download = `arcircle-orders-journal-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /// the journal as a 1200×630 card — realized, win rate, average hold, the best sell; no wallet address on it
  async function journalCard() {
    const x = V.jn, A = O(); if (!x || !x.j.sells.length) return;
    const j = x.j, tot = j.sells.reduce((a, z) => a + z.pnl, 0), wins = j.sells.filter((z) => z.pnl > 0).length, best = j.sells.reduce((m, z) => (!m || z.pct > m.pct ? z : m), null);
    const held = j.sells.filter((z) => z.held != null), hAvg = held.length ? held.reduce((a, z) => a + z.held, 0) / held.length : null;
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630; const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, "#06101a"); bg.addColorStop(1, "#071a14"); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    const glow = g.createRadialGradient(1000, 80, 10, 1000, 80, 520); glow.addColorStop(0, "rgba(77,212,255,.22)"); glow.addColorStop(1, "rgba(77,212,255,0)"); g.fillStyle = glow; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = "#4dd4ff"; g.font = "700 22px Sora, sans-serif"; g.fillText("ARCIRCLE ORDERS · TRADING JOURNAL", 64, 84);
    g.fillStyle = "#93a1b4"; g.font = "500 20px Inter, sans-serif"; g.fillText(x.both ? "Arc + Robinhood Chain" : CH() === "rh" ? "Robinhood Chain" : "Arc", 64, 118);
    const amt = (v) => (x.qs === "USD" || x.qs === "USDC" ? `${v < 0 ? "−" : "+"}${A.usd(Math.abs(v))}` : `${v < 0 ? "−" : "+"}${A.fp(Math.abs(v))} ${x.qs}`);
    g.fillStyle = tot >= 0 ? "#39ff88" : "#ff6e5a"; g.font = "800 96px Sora, sans-serif"; g.fillText(amt(tot), 64, 262);
    g.fillStyle = "#93a1b4"; g.font = "500 22px Inter, sans-serif"; g.fillText("Realized from Orders sells against Orders buys", 64, 302);
    const k = [["Win rate", `${Math.round((wins / j.sells.length) * 100)}%`], ["Sells", String(j.sells.length)], ["Average hold", hAvg == null ? "—" : hAvg < 3600 ? `${Math.max(1, Math.round(hAvg / 60))}m` : hAvg < 86400 ? `${(hAvg / 3600).toFixed(1)}h` : `${(hAvg / 86400).toFixed(1)}d`], ["Best sell", best ? `${A.pc(best.pct, 1)} $${best.sym}` : "—"]];
    k.forEach(([l, v], i) => { const x0 = 64 + i * 272; g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x0, 360, 248, 120); g.fillStyle = "#93a1b4"; g.font = "600 18px Inter, sans-serif"; g.fillText(l, x0 + 20, 398); g.fillStyle = "#eef3ff"; g.font = "700 30px Sora, sans-serif"; g.fillText(String(v).slice(0, 16), x0 + 20, 448); });
    g.fillStyle = "#5d6b7d"; g.font = "500 18px Inter, sans-serif"; g.fillText("Not advice. Orders fills only.", 64, 560);
    g.fillStyle = "#b9c6d6"; g.font = "600 20px 'JetBrains Mono', monospace"; g.fillText("arcircle.app/arc#orders", 860, 560);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = blob && new File([blob], "arcircle-orders-journal.png", { type: "image/png" });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: "My ARCIRCLE Orders journal" }); return; } catch { /* fall back to a download */ } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "arcircle-orders-journal.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function priceOf(t) {
    const S = O().state;
    if (t === S.t && S.spot) return S.spot;
    const m = (S.markets || []).find((x) => lc(x.token.address || x.token) === t);
    if (m && (m.spot || m.last)) return m.spot || m.last;
    const seen = store.get(`arcircle.orders.seen.${CH()}`, {})[t];
    return seen ? seen.p : null;
  }
  async function loadPort() {
    const A = O(), w = A.me(), prov = A.rp(), c0 = CH();
    if (!w || !prov || V.portBusy || typeof ethers === "undefined") return;
    V.portBusy = true;
    try {
      const list = candidates();
      const rows = await Promise.all(list.map(async (x) => {
        try {
          const c = new ethers.Contract(x.t, ERC20, prov);
          const [bal, dec, sym] = await Promise.all([c.balanceOf(w), x.dec != null ? x.dec : c.decimals().then(Number).catch(() => 18), x.sym ? x.sym : c.symbol().catch(() => "TOKEN")]);
          return { t: x.t, sym, dec, bal: Number(bal) / 10 ** dec };
        } catch { return null; }
      }));
      if (c0 !== CH() || w !== A.me()) return;
      V.port = { ch: c0, w, at: Date.now(), rows: rows.filter((r) => r && r.bal > 0) };
    } finally { V.portBusy = false; }
    const el = $("aor-mine"); if (el && O().state.myTab === "port") portfolio(el);
  }
  /// v7: the other chain's holdings, for "Both chains": tokens from my orders there (and its featured markets), read with
  /// that chain's RPC, priced from its markets, in dollars (ETH at the server's price)
  async function loadPortX() {
    const A = O(), S = A.state, w = A.me(), oc = CH() === "rh" ? "arc" : "rh";
    if (!w || V.portXBusy || !A.rpOf) return;
    V.portXBusy = true;
    try {
      if (!S.other || S.other.ch !== oc) await A.loadOther();
      const prov = A.rpOf(oc); if (!prov) return;
      if (!V.ethUsd) await loadEthUsd();
      const mk = await fetch(`/api/social?orders=markets${oc === "rh" ? "&chain=rh" : ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ms = (mk && mk.markets) || [], toks = new Map();
      for (const o of (S.other && S.other.orders) || []) { const t = lc(o.token.address || o.token); if (isAddr(t)) toks.set(t, { t, sym: o.token.symbol, dec: Number(o.token.decimals ?? 18) }); }
      for (const m of ms) if (m.featured) { const t = lc(m.token.address || m.token); if (!toks.has(t)) toks.set(t, { t, sym: m.token.symbol, dec: Number(m.token.decimals ?? 18) }); }
      const qU = oc === "rh" ? V.ethUsd || null : 1;
      const rows = await Promise.all([...toks.values()].slice(0, 20).map(async (x) => {
        try {
          const bal = Number(await new ethers.Contract(x.t, ERC20, prov).balanceOf(w)) / 10 ** x.dec;
          if (!(bal > 0)) return null;
          const m = ms.find((z) => lc(z.token.address || z.token) === x.t), px = m ? m.spot || m.last : null;
          return { ...x, bal, px, usd: px && qU ? bal * px * qU : null };
        } catch { return null; }
      }));
      if (w !== A.me()) return;
      V.portX = { ch: oc, w, at: Date.now(), rows: rows.filter(Boolean).sort((a, b) => (b.usd || 0) - (a.usd || 0)) };
    } finally { V.portXBusy = false; }
    const el = $("aor-mine"); if (el && O().state.myTab === "port") portfolio(el);
  }
  function bothHtml(totHere) {
    const A = O(), S = A.state, w = A.me();
    if (S.myScope !== "both") return "";
    if (!V.portX || V.portX.w !== w || V.portX.ch === CH() || Date.now() - V.portX.at > 60e3) loadPortX();
    const x = V.portX && V.portX.w === w && V.portX.ch !== CH() ? V.portX : null;
    const qU = CH() === "rh" ? V.ethUsd || S.ethUsd || null : 1, hereUsd = totHere != null && qU ? totHere * qU : null;
    const xUsd = x ? x.rows.reduce((a, r) => a + (r.usd || 0), 0) : null;
    const nm = (c) => (c === "rh" ? "Robinhood Chain" : "Arc");
    return `<div class="aor-pf-x"><div class="aor-pf-sum"><small>${T("Both chains, in dollars")}</small><b data-no-i18n>${hereUsd != null && xUsd != null ? esc(A.usd(hereUsd + xUsd)) : "…"}</b><span data-no-i18n>${esc(nm(CH()))} ${hereUsd != null ? esc(A.usd(hereUsd)) : "—"} · ${esc(nm(x ? x.ch : CH() === "rh" ? "arc" : "rh"))} ${xUsd != null ? esc(A.usd(xUsd)) : "…"}</span></div>
      ${x && x.rows.length ? `<div class="aor-pf-xr">${x.rows.map((r) => `<span data-no-i18n><b>$${esc(r.sym)}</b> ${esc(big(r.bal))}${r.usd != null ? ` · ${esc(A.usd(r.usd))}` : ""} <i>${esc(x.ch === "rh" ? "RH" : "Arc")}</i></span>`).join("")}</div>` : ""}</div>`;
  }
  /// v8: the third chain — a connected Solana wallet's open orders and what they hold, beside Arc and Robinhood Chain
  async function loadSolX() {
    const k = window.arcSol && window.arcSol.key;
    if (!k || V.solXBusy) return;
    V.solXBusy = true;
    try {
      const j = await fetch(`/api/social?orders=mine&chain=sol&wallet=${k}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (j && j.wallet === k) {
        const open = j.open || [], sol = open.reduce((a, x) => a + (x.side === "buy" ? Number(x.amountIn) / 1e9 : x.sol || 0), 0);
        V.solX = { w: k, at: Date.now(), n: open.length, sol, kinds: open.filter((x) => x.cond).length, fills: (j.history || []).length };
      }
    } finally { V.solXBusy = false; }
    const el = $("aor-mine"); if (el && O().state.myTab === "port") portfolio(el);
  }
  function solHtml() {
    const k = window.arcSol && window.arcSol.key;
    if (!k || !(typeof CONFIG !== "undefined" && CONFIG.ORDERS_SOL)) return "";
    if (!V.solX || V.solX.w !== k || Date.now() - V.solX.at > 60e3) loadSolX();
    const x = V.solX && V.solX.w === k ? V.solX : null;
    return `<div class="aor-pf-sol"><span class="aor-pf-solc" aria-hidden="true"></span><span><small>${T("Solana wallet")}</small><b data-no-i18n>${esc(k.slice(0, 4))}…${esc(k.slice(-4))}</b></span><span data-no-i18n>${x ? esc(`${x.n} ${O().lang() === "ko" ? "개 열린 주문" : O().lang() === "zh" ? "个挂单" : x.n === 1 ? "open order" : "open orders"} · ${x.sol.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`) : "…"}</span><button type="button" class="aor-link" data-setchain="sol">${T("Open Solana")} →</button></div>`;
  }
  function portfolio(el) {
    const A = O(); if (!A) return;
    const w = A.me(), S = A.state;
    if (!w) { el.innerHTML = `<div class="aor-empty arcia">${ARCIA_ART}<span>${T("Connect a wallet to see what you hold here.")}</span> <button type="button" class="aor-link" data-act="connect">${T("Connect wallet")}</button></div>`; return; }
    const fresh = V.port && V.port.ch === CH() && V.port.w === w;
    if (!fresh || Date.now() - V.port.at > 30e3) loadPort();
    if (!fresh) { el.innerHTML = `<div class="aor-skel" aria-hidden="true">${"<i></i>".repeat(4)}</div>`; return; }
    const qs = CH() === "rh" ? "ETH" : "USDC", qUsd = A.qUsd(), by = mineBy();
    const rows = V.port.rows.map((r) => {
      const px = priceOf(r.t), g = by.get(r.t), avg = g && g.bT ? g.bQ / g.bT : null;
      return { ...r, px, val: px ? r.bal * px : null, avg, vs: avg && px ? (px / avg - 1) * 100 : null, open: g ? g.open : 0 };
    }).sort((a, b) => (b.val || 0) - (a.val || 0));
    if (!rows.length) { el.innerHTML = `<div class="aor-empty arcia">${ARCIA_ART}<span>${T(CH() === "rh" ? "No tokens from these markets in this wallet on Robinhood Chain yet." : "No tokens from these markets in this wallet on Arc yet.")}</span></div>${journalHtml()}`; return; }
    const tot = rows.reduce((s, r) => s + (r.val || 0), 0), usd = (q) => (q != null && qUsd ? A.usd(q * qUsd) : "");
    const html = `<div class="aor-pf">${bothHtml(tot)}${solHtml()}
      <div class="aor-pf-sum"><small>${T("Held here, at the pool price")}</small><b data-no-i18n>${esc(A.qv(tot))}</b>${CH() === "rh" && usd(tot) ? `<span data-no-i18n>≈ ${esc(usd(tot))}</span>` : ""}<button type="button" class="aor-link" data-pfre>${T("Refresh")}</button></div>
      <div class="aor-pf-h"><span>${T("Token")}</span><span>${T("Balance")}</span><span>${T("Value")}</span><span>${T("Avg buy")}</span><span>${T("Now vs avg buy")}</span><span></span></div>
      ${rows.map((r) => `<div class="aor-pf-r${r.t === S.t ? " on" : ""}" data-pft="${esc(r.t)}">
        <button type="button" class="aor-link" data-t="${esc(r.t)}" data-no-i18n>$${esc(r.sym)}</button>
        <span data-no-i18n>${esc(big(r.bal))}</span>
        <span data-no-i18n>${r.val != null ? esc(A.qv(r.val)) : "—"}${r.val != null && CH() === "rh" && usd(r.val) ? `<small>${esc(usd(r.val))}</small>` : ""}</span>
        <span data-no-i18n>${r.avg ? esc(A.fp(r.avg)) : "—"}</span>
        <span class="${r.vs == null ? "" : r.vs >= 0 ? "up" : "dn"}" data-no-i18n>${r.vs == null ? "—" : esc(A.pc(r.vs, 1))}${r.open ? `<small>${esc(L3(`${r.open} open`, `미체결 ${r.open}`, `${r.open} 个挂单`))}</small>` : ""}</span>
        <span class="aor-pf-a"><button type="button" class="aor-btn sm go" data-protect="${esc(r.t)}" title="${T("A take-profit and a stop-loss on what you hold — you check it, then sign")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l7 3v5.3c0 4.4-3 8.1-7 9.3-4-1.2-7-4.9-7-9.3V6.2z"/></svg><span data-no-i18n>${esc(L3("Protect", "보호", "保护"))}</span></button></span>
      </div>`).join("")}
      <small class="aor-pf-n">${T("Balances read from the chain; average buy from your filled Orders buys only (not swaps made elsewhere). Not advice.")}</small>
      ${journalHtml()}
    </div>`;
    // redrawn only when something changed (the rows slide in once, not on every refresh)
    if (el.dataset.pf === html && el.querySelector(".aor-pf")) return;
    if (el.querySelector(".aor-pf")) el.classList.add("aor-pf-still"); else el.classList.remove("aor-pf-still");
    el.dataset.pf = html; el.innerHTML = html;
  }
  /// a take-profit +25% and a stop-loss −15% from the pool price on all of a held token — filled in, never placed
  function protect(t) {
    const A = O(); if (!A) return;
    const S = A.state, F = A.form;
    const go = () => {
      const r = V.port && V.port.rows.find((x) => x.t === t);
      if (!r || !(S.spot > 0)) return;
      if (!A.PRO()) A.setMode("pro");
      S.type = "tpsl"; S.side = "sell"; S.msg = null; S.editing = null; S.pct = 0;
      const d = (v) => { const n = Number(v.toPrecision(6)); return n.toFixed(Math.min(20, Math.max(0, 9 - Math.floor(Math.log10(n))))).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
      F.amount = d(r.bal * 0.999999); F.tp = d(S.spot * 1.25); F.sl = d(S.spot * 0.85);
      A.render(); A.flash();
      if (innerWidth <= 720) A.sheet(true); else { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
      A.toast(tr("Take-profit +25% and stop-loss −15% filled in"), "fill", tr("Change them if you like, then sign — when one fills, the other is cancelled."));
    };
    if (S.t === t && S.tok && S.spot) { go(); return; }
    A.open(t);
    const t0 = Date.now();
    (function wait() { if (S.t === t && S.tok && S.spot > 0 && !S.loadingMkt) { go(); return; } if (Date.now() - t0 < 15000) setTimeout(wait, 300); })();
  }

  // ---------------- the fee burn's dashboard ----------------
  async function loadBurns() {
    const c0 = CH(); if (c0 === "sol") return;
    try { const r = await fetch(`/api/social?orders=burns${c0 === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (c0 !== CH()) return; V.burns = j; V.burnCh = c0; } catch { /* keep */ }
    burnDash();
  }
  function burnDash() {
    const el = $("aor-burnd"), A = O();
    if (!el || !A) return;
    const b = V.burns;
    if (!b || !b.live || V.burnCh !== CH()) { el.hidden = true; return; }
    el.hidden = false;
    const open = store.get("arcircle.orders.burnopen", innerWidth > 720) === true, qs = b.quoteSym || (CH() === "rh" ? "ETH" : "USDC");
    const amt = (v) => (qs === "USDC" ? A.usd(v) : `${big(v)} ${qs}`);
    const p = b.pending, days = (b.last7 || []).slice(-7);
    const dmax = Math.max(1e-18, ...days.map((d) => d[1]));
    const nextTxt = p && p.nextIn != null ? (p.nextIn > 0 ? L3(`next check in ${Math.ceil(p.nextIn / 60)}m`, `다음 확인까지 ${Math.ceil(p.nextIn / 60)}분`, `${Math.ceil(p.nextIn / 60)} 分钟后检查`) : L3("checks with the next run", "다음 실행 때 확인", "下次运行时检查")) : "";
    const from = V.burnShown != null ? V.burnShown : 0, to = b.arcircle || 0;
    el.innerHTML = `<button type="button" class="aor-bd-h" data-bdt aria-expanded="${open}"><svg class="aor-flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.2-4.6.2 1.8 1 2.6 1.8 3C11 9 11.5 6 12 3z"/></svg><b>${T("Fee burn")}</b><span data-no-i18n><i class="aor-bdn">${esc(big(reduce || !open ? to : from))}</i> $ARCIRCLE</span><small>${T("Half of every Orders fee buys $ARCIRCLE and burns it")}</small><em aria-hidden="true">${open ? "▴" : "▾"}</em></button>` +
      (open ? `<div class="aor-bd-b">
        <div class="aor-bd-g">
          <div><small>${T("$ARCIRCLE burned")}</small><b data-no-i18n>${esc(big(to))}</b></div>
          <div><small>${T("Spent from fees")}</small><b data-no-i18n>${esc(amt(b.quote || 0))}</b></div>
          <div><small>${T("Burns")}</small><b data-no-i18n>${esc(String(b.n || 0))}</b></div>
          <div><small>${T("Last burn")}</small><b data-no-i18n>${b.last && b.last.at ? esc(A.ago(b.last.at)) : "—"}</b>${b.last && b.last.tx ? `<a class="aor-tx" href="${esc(A.explorer("tx", b.last.tx))}" target="_blank" rel="noopener" data-no-i18n>${esc(big(b.last.arcircle))} ↗</a>` : ""}</div>
        </div>
        ${p ? `<div class="aor-bd-next${p.ready ? " ready" : ""}"><div class="aor-bd-nt"><small>${T(p.ready ? "Ready for the next burn" : "Waiting for the next burn")}</small><span data-no-i18n>${esc(amt(p.quote))} / ${esc(amt(p.min))}${nextTxt ? ` · ${esc(nextTxt)}` : ""}</span></div><div class="aor-bd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.pct)}"><i style="--p:${Math.max(2, p.pct).toFixed(1)}%"></i></div><p>${T("Once the fee burn holds the minimum, the executor spends it on $ARCIRCLE (checked every hour): half burned, half to the treasury.")}</p></div>` : ""}
        ${days.length ? `<div class="aor-bd-days" aria-label="${T("Burned per day")}">${days.map((d) => `<span title="${esc(d[0])} · ${esc(big(d[1]))} $ARCIRCLE"><i style="--h:${Math.max(4, (d[1] / dmax) * 100).toFixed(0)}%"></i><small data-no-i18n>${esc(d[0].slice(5))}</small></span>`).join("")}</div>` : ""}
      </div>` : "");
    if (open) V.burnShown = to;
    if (open && !reduce && from !== to) {
      const n = el.querySelector(".aor-bdn"), t0 = performance.now(), D = from ? 900 : 1400;
      const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); if (n && n.isConnected) n.textContent = big(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
  }

  // ---------------- the chain switch: markets and the executor per chain ----------------
  async function loadInfo() {
    if (Date.now() - V.infoAt < 120e3) { paintInfo(); return; }
    V.infoAt = Date.now();
    await Promise.all(["arc", "rh"].map(async (c) => {
      const q = c === "rh" ? "&chain=rh" : "";
      try {
        const [st, mk] = await Promise.all([fetch(`/api/social?orders=status${q}`).then((r) => (r.ok ? r.json() : null)), fetch(`/api/social?orders=markets${q}`).then((r) => (r.ok ? r.json() : null))]);
        V.info[c] = { n: mk && mk.markets ? mk.markets.length : null, k: !st || !st.live ? null : !st.at ? "off" : st.low || st.ago > 900 ? "bad" : st.ago > 180 ? "warn" : "ok" };
      } catch { /* leave it */ }
    }));
    paintInfo();
  }
  function paintInfo() {
    panel.querySelectorAll(".aor-chain [data-setchain]").forEach((b) => {
      const c = b.dataset.setchain, x = V.info[c];
      let tag = b.querySelector(".aor-cinf");
      if (!x || (x.n == null && !x.k)) { if (tag) tag.remove(); return; }
      if (!tag) { tag = document.createElement("span"); tag.className = "aor-cinf"; tag.setAttribute("data-no-i18n", ""); b.appendChild(tag); }
      const kt = x.k === "ok" ? tr("Executor checked in") : x.k === "warn" ? tr("Executor a little late") : x.k ? tr("Executor not checking in") : "";
      tag.title = [x.n != null ? L3(`${x.n} markets`, `마켓 ${x.n}개`, `${x.n} 个市场`) : "", kt].filter(Boolean).join(" · ");
      tag.innerHTML = `${x.k ? `<i class="aor-hb ${x.k}" aria-hidden="true"></i>` : ""}${x.n != null ? `<em>${x.n}</em>` : ""}`;
    });
  }

  // ---------------- Solana: tell me when it opens ----------------
  const b64b = (x) => { const t = String(x).replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  async function pushTopic(topic) {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
      const k = await fetch("/api/social?orders=pushkey").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!k || !k.key) return false;
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return false;
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
      if (!reg || !reg.pushManager) return false;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(k.key) }));
      if (!sub) return false;
      const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic, sub: sub.toJSON(), lang: O() ? O().lang() : "en" }) });
      return r.ok;
    } catch { return false; }
  }
  function solWait() {
    const el = $("aor-solwait"); if (!el) return;
    const on = store.get("arcircle.orders.solwait", false) === true;
    el.innerHTML = `<div class="aor-sw-t">${ARCIA_ART}<div><b>${T("ARCIRCLE Orders on Solana opens soon")}</b><span>${T("Limit orders on any SPL token, signed in your wallet and filled through Jupiter. Want a heads-up when it's live?")}</span></div></div>
      <div class="aor-sw-b"><button type="button" class="aor-btn go${on ? " done" : ""}" data-solpush${on ? " disabled" : ""}>${on ? T("This browser will hear it") : T("Notify this browser")}</button><a class="aor-btn ghost" href="https://t.me/ARCIAonArc_bot?start=solorders" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11.2l6.2 2.1L19 7l-7.6 8.1.1 4.9 3.1-3.7 4.2 3.1z"/></svg><span>${T("Tell me on Telegram")}</span></a></div>`;
  }

  // ---------------- the guide folds ----------------
  function guideFold() {
    const g = panel.querySelector(".aor-guide"), h = g && g.querySelector("#aor-guide-h");
    if (!g || !h || g.dataset.fold) return;
    g.dataset.fold = "1";
    const visits = Number(store.get("arcircle.orders.visits", 0)) + 1;
    store.set("arcircle.orders.visits", visits);
    const b = document.createElement("button");
    b.type = "button"; b.className = "aor-gfold";
    h.appendChild(b);
    const set = (folded) => { g.classList.toggle("folded", folded); b.setAttribute("aria-expanded", String(!folded)); b.innerHTML = `<span data-no-i18n>${esc(folded ? L3("Show the guide", "가이드 보기", "显示指南") : L3("Fold", "접기", "收起"))}</span><i aria-hidden="true">${folded ? "▾" : "▴"}</i>`; };
    const saved = store.get("arcircle.orders.guidefold", null);
    set(saved != null ? saved === true : visits > 3);
    b.addEventListener("click", () => { const f = !g.classList.contains("folded"); store.set("arcircle.orders.guidefold", f); set(f); });
  }

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const t = e.target;
    const pr = t.closest && t.closest("[data-protect]"); if (pr) { protect(lc(pr.dataset.protect)); return; }
    if (t.closest && t.closest("[data-jcsv]")) { journalCsv(); return; }
    if (t.closest && t.closest("[data-jcard]")) { journalCard(); return; }
    if (t.closest && t.closest("[data-pfre]")) { V.port = V.port ? { ...V.port, at: 0 } : null; loadPort(); return; }
    if (t.closest && t.closest("[data-bdt]")) { store.set("arcircle.orders.burnopen", !(store.get("arcircle.orders.burnopen", innerWidth > 720) === true)); V.burnShown = null; burnDash(); return; }
    const sp = t.closest && t.closest("[data-solpush]");
    if (sp) { sp.disabled = true; pushTopic("orders-sol").then((ok) => { if (ok) store.set("arcircle.orders.solwait", true); else if (O()) O().toast(tr("This browser can't take notifications here — try Telegram."), "bad"); solWait(); }); return; }
    // the tape's burn total opens the dashboard below instead of leaving the page
    const bc = t.closest && t.closest("#aor-burnct"), bd = $("aor-burnd");
    if (bc && bd && !bd.hidden) { e.preventDefault(); store.set("arcircle.orders.burnopen", true); burnDash(); bd.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); bd.classList.remove("flash"); void bd.offsetWidth; bd.classList.add("flash"); }
  });
  let timer = 0;
  function loop() { clearInterval(timer); timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden && CH() !== "sol") { loadBurns(); loadInfo(); } }, 60e3); }
  function frame() {
    // the phone's layout (arc-orders-v4.js): make sure it knows the Orders tab is open, however the page was reached
    document.documentElement.classList.toggle("aor-live", panel.classList.contains("active"));
    guideFold();
    if (V.burnCh !== CH()) { V.burns = null; V.burnShown = null; }
    burnDash(); paintInfo();
    if (CH() !== "sol") loadBurns();
    loadInfo();
    loop();
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") loop(); else clearInterval(timer); });
  window.arcOrdersV5 = { frame, portfolio, protect, solWait, state: V, _burnDash: burnDash };
  if ($("aor-body") && $("aor-body").children.length) frame();
})();
