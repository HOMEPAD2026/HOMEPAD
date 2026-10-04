/* global ethers, CONFIG, ARC, ACT, APC, state, readProvider, withRetry, connectWallet, ensureArcForWrite, ERC20_ABI, ARC_SWAP_ROUTER_ABI,
          arcAllCoins, arcAnyStats, arcActStats, arcChangeSinceLaunch, arcPaintCard, actPaint, actAgo, fmtUsd, renderArcpadExploreGrid,
          apcRenderData, apcRenderChart, apcTsOf, apcSpot, apcUsdc, apcTok, apcToUsd, apcFmtPrice, apcExplorer, openArcCoin, arcIsWatched */
// arcpad-v6.js — ArcPad v6 (arcpad.html), on top of the core scripts:
//   Home      King of the Hill (the hottest coin right now, on any platform), "Trending now", live numbers,
//             upcoming scheduled launches; the static "how it works" cards fold away
//   Explore   grid | list view, quick buy ($1 / $5 / $10) on ArcPad cards, cards that pulse on a trade and drop in
//             when they're new, the same bottom line (24h volume, trades) on every platform
//   Coin      your position (average cost, P&L), the creator's other coins, comments (signed, holders and the creator
//             marked, the creator pins one), candles with volume, a splash for big buys
//   Portfolio P&L for the coins you hold, your invite link and what came through it, price alerts for your watchlist
//   Launch    steps (platform → basics → token → review), "use my last launch", name ideas from ARCIA, schedule a
//             launch (a countdown page on Home), one "Your coin is live" card for every platform
//   Creators  every platform, profile cards for the top three
// Server: /api/social (comments, refnote / refstats, launchplan(s): api/_arcpad-v6.mjs), /api/arcia {action:"names"}.
(function () {
  "use strict";
  if (typeof ARC === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const usd = (n) => (n == null || !isFinite(n) ? "—" : typeof fmtUsd === "function" ? fmtUsd(n) : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const pct = (x, d = 1) => (x == null || !isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`);
  const ago = (ts) => (typeof actAgo === "function" ? actAgo(ts) : "");
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const safeImg = (u) => /^https?:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u || "");
  const toast = (m, k) => (typeof window.arcToast === "function" ? window.arcToast(m, k) : null);
  const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } } };
  const coins = () => (typeof arcAllCoins === "function" ? arcAllCoins() : ARC.launches || []);
  const statsOf = (l) => (typeof arcAnyStats === "function" ? arcAnyStats(l) : null);
  const keyOf = (l) => (l.platform === "pump" ? String(l.token) : lc(l.token));
  const coinHref = (l) => (l.platform === "pons" || l.platform === "pump" ? `/arc#explore?plat=${l.platform}&coin=${l.token}` : `/arc#coin/${l.token}`);
  const PLAT = { arcpad: "ArcPad", argus: "Argus", pons: "Pons", pump: "Pump.fun" };
  const platOf = (l) => l.platform || "arcpad";
  const logoHtml = (l, cls) => (safeImg(l.imageUrl) ? `<img class="${cls}" src="${esc(l.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="${cls} ph" style="${typeof window.arcAvatarBg === "function" && l.platform !== "pump" ? window.arcAvatarBg(l.token) : ""}">${esc(String(l.symbol || "?").slice(0, 1).toUpperCase())}</span>`);
  function openCoin(l) {
    if (l.platform === "pons" && window.arcPons) { window.arcPons.openSheet(l.token); return; }
    if (l.platform === "pump" && window.arcPump) { window.arcPump.openSheet(l.token); return; }
    if (typeof openArcCoin === "function") openArcCoin(l.token);
  }
  const signText = async (text) => {
    if (!me()) { if (typeof connectWallet === "function") await connectWallet(); }
    if (!me() || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer.signMessage(text);
  };
  const post = async (body, url = "/api/social") => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  const keccakText = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  // =====================================================================
  // King of the Hill: the coin with the most going on in the last hour (any platform)
  // =====================================================================
  // score = last hour's volume + $25 a trade; the last day's volume breaks ties. A coin keeps the crown until another
  // one beats it by 10% — so it doesn't flip back and forth on one trade.
  const K = { king: store.get("arcpad.koth.v1", null), at: 0 };
  function kothPick() {
    let best = null, bestS = 0;
    for (const l of coins()) {
      const s = statsOf(l); if (!s) continue;
      const sc = (s.vol1h || 0) + 25 * (s.trades1h || 0) + (s.vol || 0) / 200;
      if (sc > bestS) { best = l; bestS = sc; }
    }
    if (!best || bestS <= 0) return null;
    const cur = K.king && coins().find((l) => keyOf(l) === K.king.k);
    if (cur && keyOf(cur) !== keyOf(best)) {
      const s = statsOf(cur), cs = s ? (s.vol1h || 0) + 25 * (s.trades1h || 0) + (s.vol || 0) / 200 : 0;
      if (cs * 1.1 >= bestS) return { l: cur, score: cs, changed: false };
    }
    const changed = !K.king || K.king.k !== keyOf(best);
    return { l: best, score: bestS, changed };
  }
  function paintKoth() {
    const box = $("v6-koth"); if (!box) return;
    const p = kothPick();
    if (!p) { box.hidden = true; return; }
    const l = p.l, s = statsOf(l) || {}, chg = l.platform === "pons" || l.platform === "pump" ? (s.chg24 != null ? s.chg24 : null) : (typeof arcChangeSinceLaunch === "function" ? (arcChangeSinceLaunch(l) == null ? null : arcChangeSinceLaunch(l) * 100) : null);
    box.hidden = false;
    const html = `<a class="v6-koth-in" href="${coinHref(l)}" data-v6-open="${esc(l.token)}">
        <span class="v6-crown" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/></svg></span>
        ${logoHtml(l, "v6-koth-logo")}
        <span class="v6-koth-t"><small>${T("King of the Hill · right now")}</small><b data-no-i18n>$${esc(l.symbol)}</b><span data-no-i18n>${esc(l.name || "")}</span><em class="v6-plat ${platOf(l)}" data-no-i18n>${PLAT[platOf(l)]}</em></span>
        <span class="v6-koth-s"><span><small>${T("Volume 1h")}</small><b data-no-i18n>${usd(s.vol1h || 0)}</b></span><span><small>${T("Trades 1h")}</small><b data-no-i18n>${(s.trades1h || 0).toLocaleString("en-US")}</b></span><span><small>${T("Market cap")}</small><b data-no-i18n>${usd(l.marketCapUsd)}</b></span>${chg != null ? `<span><small>${T(l.platform === "pons" || l.platform === "pump" ? "24h" : "Since launch")}</small><b class="${chg >= 0 ? "up" : "down"}" data-no-i18n>${pct(chg, Math.abs(chg) < 10 ? 1 : 0)}</b></span>` : ""}</span>
        <span class="v6-koth-go" aria-hidden="true">→</span></a>`;
    if (box.__html !== html) {
      box.innerHTML = html; box.__html = html;
      if (p.changed && K.king && !reduce) { box.classList.remove("v6-newking"); void box.offsetWidth; box.classList.add("v6-newking"); }
    }
    if (p.changed) { K.king = { k: keyOf(l), at: Date.now() }; store.set("arcpad.koth.v1", K.king); }
    const old = $("ap-topcoin"); if (old) old.classList.add("v6-hide");
  }

  // ---- Home: trending, live numbers, upcoming launches ----
  function paintTrending() {
    const box = $("v6-trend"); if (!box) return;
    const list = coins().map((l) => ({ l, s: statsOf(l) })).filter((x) => x.s && (x.s.vol || 0) > 0)
      .sort((a, b) => ((b.s.vol1h || 0) * 4 + (b.s.vol || 0)) - ((a.s.vol1h || 0) * 4 + (a.s.vol || 0))).slice(0, 6);
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    const html = `<div class="v6-sec-h"><h3>${T("Trending now")}</h3><button type="button" class="bp-card-link" data-tab-link="explore">${T("All coins")} →</button></div>
      <div class="v6-trend-grid">${list.map(({ l, s }, i) => `<a class="v6-tc" href="${coinHref(l)}" data-v6-open="${esc(l.token)}" style="--i:${i}">${logoHtml(l, "v6-tc-logo")}
        <span class="v6-tc-t"><b data-no-i18n>$${esc(l.symbol)}</b><em class="v6-plat ${platOf(l)}" data-no-i18n>${PLAT[platOf(l)]}</em></span>
        <span class="v6-tc-n"><span data-no-i18n>${usd(l.marketCapUsd)}</span><small>${T("Vol 24h")} <span data-no-i18n>${usd(s.vol)}</span></small></span></a>`).join("")}</div>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  function paintHomeStats() {
    const all = coins(), now = Date.now() / 1000;
    let vol = 0, trades = 0;
    for (const l of all) { const s = statsOf(l); if (s) { vol += s.vol || 0; trades += s.trades || 0; } }
    const today = all.filter((l) => l.launchedAt && now - l.launchedAt < 86400).length;
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) { el.textContent = v; if (!reduce) { el.classList.remove("v6-tick"); void el.offsetWidth; el.classList.add("v6-tick"); } } };
    set("ap-stat-count", String(all.length));
    if (typeof ACT !== "undefined" && ACT.hi != null) set("ap-stat-vol", usd(vol));
    set("v6-stat-today", String(today));
    set("v6-stat-trades", trades.toLocaleString("en-US"));
  }
  // scheduled launches (POST launchplan; GET ?launchplans=1)
  const PL = { items: [], at: 0 };
  async function loadPlans() {
    if (Date.now() - PL.at < 60e3) return;
    PL.at = Date.now();
    try { const r = await fetch("/api/social?launchplans=1"); const j = r.ok ? await r.json() : null; if (j && Array.isArray(j.items)) PL.items = j.items; } catch { /* keep */ }
    paintPlans();
  }
  const cd = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return d ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };
  function liveOf(p) { return coins().find((l) => lc(l.creator) === lc(p.creator) && String(l.symbol).toUpperCase() === p.symbol && (l.launchedAt || 0) >= p.created / 1000 - 3600) || null; }
  function paintPlans() {
    const box = $("v6-plans"); if (!box) return;
    const now = Date.now() / 1000, list = PL.items.filter((p) => p.at > now - 6 * 3600);
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    const rem = store.get("arcpad.planremind.v1", []);
    box.innerHTML = `<div class="v6-sec-h"><h3>${T("Upcoming launches")}</h3><small>${T("Scheduled by their creators — signed with the launching wallet")}</small></div>
      <div class="v6-plans">${list.map((p) => { const live = liveOf(p); return `<div class="v6-plan${live ? " live" : p.at <= now ? " due" : ""}" data-plan="${esc(p.id)}">
        ${safeImg(p.image) ? `<img class="v6-plan-logo" src="${esc(p.image)}" alt="" loading="lazy">` : `<span class="v6-plan-logo ph" data-no-i18n>${esc(p.symbol.slice(0, 1))}</span>`}
        <span class="v6-plan-t"><b data-no-i18n>$${esc(p.symbol)}</b><span data-no-i18n>${esc(p.name)}</span><em class="v6-plat ${esc(p.platform)}" data-no-i18n>${PLAT[p.platform] || "ArcPad"}</em></span>
        <span class="v6-plan-cd">${live ? `<a class="v6-plan-live" href="${coinHref(live)}" data-v6-open="${esc(live.token)}">${T("Live now")} →</a>` : p.at <= now ? `<b>${T("Any moment")}</b>` : `<small>${T("Launches in")}</small><b data-no-i18n data-cd="${p.at}">${cd(p.at - now)}</b>`}</span>
        ${!live && p.at > now ? `<button type="button" class="v6-remind${rem.includes(p.id) ? " on" : ""}" data-remind="${esc(p.id)}">${T(rem.includes(p.id) ? "Reminder set" : "Remind me")}</button>` : ""}
      </div>`; }).join("")}</div>`;
  }
  function tickPlans() {
    const now = Date.now() / 1000;
    document.querySelectorAll("[data-cd]").forEach((el) => { const s = Number(el.dataset.cd) - now; el.textContent = cd(s); if (s <= 0) PL.at = 0; });
    const rem = store.get("arcpad.planremind.v1", []);
    for (const p of PL.items) {
      if (!rem.includes(p.id)) continue;
      if (p.at - now <= 60 && p.at - now > -300 && !p.__told) { p.__told = true; notify(`$${p.symbol} ${tr("launches in a minute")}`, p.name); toast(`$${p.symbol} ${tr("launches in a minute")}`); }
    }
  }
  function notify(title, body) { try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/images/arcircle-mark-sm.png" }); } catch { /* not allowed */ } }
  function homeFrame() {
    const home = $("bp-panel-home"); if (!home || $("v6-koth")) return;
    // the hero gets shorter, so the King of the Hill and what's trending sit in the first screen
    const hero = home.querySelector(".bp-hero"); if (hero) hero.classList.add("v6-hero");
    const stats = $("ap-home-stats");
    if (stats) {
      // the two fixed cards (fee, add-on) become live numbers: launches today, trades in 24h
      const cards = stats.querySelectorAll(".ap-stat");
      if (cards[2]) cards[2].innerHTML = `<span class="ap-stat-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></span><strong id="v6-stat-today">—</strong><span>${T("Launched today")}</span>`;
      if (cards[3]) cards[3].innerHTML = `<span class="ap-stat-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h11l-3-3M20 17H9l3 3"/></svg></span><strong id="v6-stat-trades">—</strong><span>${T("Trades 24h")}</span>`;
      stats.insertAdjacentHTML("afterend", `<div class="v6-koth" id="v6-koth" hidden></div><div class="v6-plans-w" id="v6-plans" hidden></div><section class="v6-trend" id="v6-trend" hidden></section>`);
    }
    const row3 = home.querySelector(".bp-row3");
    if (row3 && !row3.closest("details")) {
      const d = document.createElement("details");
      d.className = "v6-how";
      d.innerHTML = `<summary>${T("How an ArcPad launch works")} <small>${T("the pool · fees · supply")}</small></summary>`;
      row3.parentNode.insertBefore(d, row3); d.appendChild(row3);
    }
  }

  // =====================================================================
  // Explore: grid | list, quick buy, live pulse, new coins drop in, one bottom line on every card
  // =====================================================================
  const VIEW = () => store.get("arcpad.exview.v1", "grid");
  function exploreFrame() {
    const tb = document.querySelector("#bp-panel-explore .cn-explore-toolbar");
    if (!tb || $("v6-view")) return;
    tb.insertAdjacentHTML("beforeend", `<div class="v6-view" id="v6-view" role="radiogroup" aria-label="${T("View")}"><button type="button" role="radio" data-v6-view="grid" aria-checked="${VIEW() === "grid"}" title="${T("Cards")}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button><button type="button" role="radio" data-v6-view="list" aria-checked="${VIEW() === "list"}" title="${T("List")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button></div>`);
  }
  function listView() {
    const grid = $("ap-explore-grid"); if (!grid) return;
    grid.classList.toggle("v6-list", VIEW() === "list");
    const old = $("v6-table"); if (old) old.remove();
    if (VIEW() !== "list") return;
    const cards = [...grid.querySelectorAll(".ap-launch-card[data-token]")];
    if (!cards.length) return;
    const all = coins();
    const rows = cards.map((c) => all.find((l) => keyOf(l) === (c.dataset.platform === "pump" ? c.dataset.token : lc(c.dataset.token)))).filter(Boolean);
    const t = document.createElement("div");
    t.id = "v6-table"; t.className = "v6-table";
    t.innerHTML = `<div class="v6-tr v6-th"><span>${T("Coin")}</span><span>${T("Platform")}</span><span class="r">${T("Market cap")}</span><span class="r">${T("Vol 24h")}</span><span class="r">${T("Trades 24h")}</span><span class="r">${T("Change")}</span><span class="r">${T("Age")}</span></div>
      ${rows.map((l) => { const s = statsOf(l) || {}; const ext = l.platform === "pons" || l.platform === "pump"; const chg = ext ? s.chg24 : (typeof arcChangeSinceLaunch === "function" && arcChangeSinceLaunch(l) != null ? arcChangeSinceLaunch(l) * 100 : null);
        return `<button type="button" class="v6-tr" data-v6-open="${esc(l.token)}">${logoHtml(l, "v6-tr-logo")}<span class="v6-tr-c"><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${esc(l.name || "")}</small></span>
          <span><em class="v6-plat ${platOf(l)}" data-no-i18n>${PLAT[platOf(l)]}</em></span><span class="r" data-no-i18n>${usd(l.marketCapUsd)}</span><span class="r" data-no-i18n>${usd(s.vol || 0)}</span><span class="r" data-no-i18n>${(s.trades || 0).toLocaleString("en-US")}</span>
          <span class="r ${chg == null ? "" : chg >= 0 ? "up" : "down"}" data-no-i18n title="${T(ext ? "24h" : "Since launch")}">${pct(chg, chg != null && Math.abs(chg) < 10 ? 1 : 0)}</span><span class="r" data-no-i18n>${esc(ago(l.launchedAt))}</span></button>`; }).join("")}`;
    grid.after(t);
  }
  // quick buy: ArcPad coins paired with USDC — one signature (plus an approval the first time)
  const QB = [1, 5, 10];
  async function quickBuy(token, amountUsd, btn) {
    const l = (ARC.launches || []).find((x) => lc(x.token) === lc(token));
    if (!l || !l.quoteIsUsdc) return;
    if (!me()) { if (typeof connectWallet === "function") await connectWallet(); if (!me()) return; }
    if (btn.classList.contains("busy")) return;
    btn.classList.add("busy");
    const ring = (p) => btn.style.setProperty("--qp", p + "%");
    try {
      ring(10);
      await ensureArcForWrite();
      const sg = state.signer;
      const amt = ethers.parseUnits(String(amountUsd), 6);
      const usdc = new ethers.Contract(CONFIG.USDC_ADDRESS, ERC20_ABI, sg);
      const bal = BigInt(await withRetry(() => new ethers.Contract(CONFIG.USDC_ADDRESS, ERC20_ABI, readProvider()).balanceOf(me())));
      if (bal < amt + ethers.parseUnits("0.05", 6)) throw new Error(tr("Not enough USDC (keep a little for gas)."));
      const al = BigInt(await withRetry(() => new ethers.Contract(CONFIG.USDC_ADDRESS, ERC20_ABI, readProvider()).allowance(me(), CONFIG.ARCPAD_ROUTER_ADDRESS)));
      if (al < amt) { toast(tr("Approve USDC for the ArcPad router — once")); ring(30); await (await usdc.approve(CONFIG.ARCPAD_ROUTER_ADDRESS, amt * 20n)).wait(); }
      ring(55);
      const router = new ethers.Contract(CONFIG.ARCPAD_ROUTER_ADDRESS, ARC_SWAP_ROUTER_ABI, sg);
      const out = BigInt(await router.buy.staticCall(l.token, amt, 0n));
      ring(70);
      const tx = await router.buy(l.token, amt, (out * 97n) / 100n);
      ring(85);
      const rc = await tx.wait();
      ring(100);
      btn.classList.add("ok");
      toast(`${tr("Bought")} $${l.symbol} · $${amountUsd}`, "ok");
      if (typeof window.arcFeedback === "function") window.arcFeedback("buy");
      flyTo(btn, '.bp-nav-item[data-tab="portfolio"]');
      refNote(rc.hash);
    } catch (err) {
      const m = String((err && (err.shortMessage || err.reason || err.message)) || err);
      toast(err && (err.code === "ACTION_REJECTED" || err.code === 4001) ? tr("You rejected the request in your wallet.") : m.slice(0, 120), "bad");
    } finally {
      setTimeout(() => { btn.classList.remove("busy", "ok"); btn.style.removeProperty("--qp"); }, 1400);
    }
  }
  function flyTo(from, sel) {
    if (reduce || !from) return;
    const to = document.querySelector(sel);
    const r = from.getBoundingClientRect(), t = to && to.offsetParent ? to.getBoundingClientRect() : { left: innerWidth - 40, top: 30, width: 0, height: 0 };
    const dot = document.createElement("div");
    dot.className = "v6-fly"; dot.style.left = r.left + r.width / 2 + "px"; dot.style.top = r.top + r.height / 2 + "px";
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = `translate(${t.left + t.width / 2 - (r.left + r.width / 2)}px, ${t.top + t.height / 2 - (r.top + r.height / 2)}px) scale(.35)`; dot.style.opacity = "0"; });
    setTimeout(() => dot.remove(), 800);
  }
  // card extras, painted every time a card is painted
  const SEEN = { set: null, last: new Map() };
  function decorate(card) {
    const tok = card.dataset.token; if (!tok) return;
    const plat = card.dataset.platform || "arcpad";
    card.classList.add("v6-c", "v6-" + plat);
    const l = coins().find((x) => keyOf(x) === (plat === "pump" ? tok : lc(tok)));
    if (!l) return;
    // the same bottom line everywhere: 24h volume and trades (Pons and Pump.fun from the server's Dexscreener read)
    if ((plat === "pons" || plat === "pump") && !card.querySelector("[data-act=vol]")) {
      const s = statsOf(l);
      let v = card.querySelector(".v6-vol");
      if (!v) { v = document.createElement("div"); v.className = "ap-card-vol v6-vol"; card.appendChild(v); }
      v.textContent = s ? `${tr("Vol 24h")} ${usd(s.vol)} · ${s.trades} ${tr(s.trades === 1 ? "trade" : "trades")}` : `${tr("Vol 24h")} —`;
      const g = card.querySelector(".pon-grad, .pmp-grad");
      if (g) { const p = Number((g.style.getPropertyValue("--p") || "0").replace("%", "")); g.classList.toggle("v6-soon", !l.graduated && p >= 90); }
    }
    // quick buy on ArcPad coins paired with USDC
    if (plat === "arcpad" && l.quoteIsUsdc && !card.querySelector(".v6-qb")) {
      const q = document.createElement("div");
      q.className = "v6-qb";
      q.innerHTML = `<span>${T("Quick buy")}</span>${QB.map((v) => `<span role="button" tabindex="0" class="v6-qbb" data-qb="${v}" aria-label="${T("Buy")} $${v}" data-no-i18n>$${v}</span>`).join("")}`;
      card.appendChild(q);
    }
    // a trade since the last paint: the card pulses green (buy) or red (sell)
    if (typeof ACT !== "undefined" && plat !== "pons" && plat !== "pump") {
      const s = arcActStats(l.token), k = lc(l.token), lb = s ? s.lastB : 0;
      const prev = SEEN.last.get(k);
      if (prev != null && lb > prev && !reduce) {
        const t = (ACT.ticker || []).find((x) => x.token && lc(x.token) === k);
        card.classList.remove("v6-pulse-buy", "v6-pulse-sell"); void card.offsetWidth;
        card.classList.add(t && !t.buy ? "v6-pulse-sell" : "v6-pulse-buy");
      }
      SEEN.last.set(k, lb);
    }
    // new since the page opened: it drops in
    if (SEEN.set && !SEEN.set.has(keyOf(l)) && !reduce) card.classList.add("v6-drop");
  }
  function markSeen() { SEEN.set = new Set(coins().map(keyOf)); }

  // =====================================================================
  // Coin page: position & P&L, creator's other coins, comments, candles, big buys, invite credit
  // =====================================================================
  const CP = { token: null, comments: null, cAt: 0, tab: null, mode: store.get("arcpad.chartmode.v1", "line"), bigSeen: new Set() };
  /// one wallet's trades → cost basis (average cost of what's still held), realized and unrealized P&L, in the pair token
  function pnlOf(trades, wallet, spot) {
    const mine = trades.filter((t) => t.trader && lc(t.trader) === wallet).slice().sort((a, b) => a.b - b.b || a.i - b.i);
    if (!mine.length) return null;
    let held = 0, cost = 0, realized = 0, bought = 0, spent = 0, sold = 0, got = 0;
    for (const t of mine) {
      if (t.side === "buy") { held += t.tok; cost += t.usdc; bought += t.tok; spent += t.usdc; }
      else { const avg = held > 0 ? cost / held : 0; const q = Math.min(t.tok, held); realized += t.usdc - avg * q; cost -= avg * q; held -= q; sold += t.tok; got += t.usdc; }
    }
    const avg = held > 0 ? cost / held : bought > 0 ? spent / bought : null;
    const value = spot != null ? held * spot : null;
    const unreal = value != null ? value - cost : null;
    return { n: mine.length, held, cost, avg, realized, unreal, value, bought, spent, sold, got, pct: cost > 0 && unreal != null ? (unreal / cost) * 100 : null };
  }
  function paintPosition() {
    const host = document.querySelector("#bp-panel-coin .ac2-side"); if (!host || typeof APC === "undefined" || !APC.l) return;
    let box = $("v6-pos");
    if (!box) { box = document.createElement("div"); box.id = "v6-pos"; box.className = "ac2-card v6-pos"; host.appendChild(box); }
    const w = me();
    if (!w) { box.innerHTML = `<h3>${T("Your position")}</h3><p class="v6-muted">${T("Connect a wallet to see what you paid and your P&L on this coin.")}</p>`; return; }
    const P = pnlOf(APC.trades || [], w, typeof apcSpot === "function" ? apcSpot() : null);
    const q = (v) => (v == null ? "—" : APC.q.usd != null ? usd(v * APC.q.usd) : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${esc(APC.q.symbol)}`);
    if (!P) { box.innerHTML = `<h3>${T("Your position")}</h3><p class="v6-muted">${T("No trades from this wallet on this coin yet.")}</p>`; return; }
    const cls = (v) => (v == null ? "" : v >= 0 ? "up" : "down");
    box.innerHTML = `<h3>${T("Your position")} <small data-no-i18n>${P.n} ${esc(tr(P.n === 1 ? "trade" : "trades"))}</small></h3>
      <div class="v6-pos-big ${cls(P.unreal)}"><b data-no-i18n>${P.unreal == null ? "—" : (P.unreal >= 0 ? "+" : "−") + q(Math.abs(P.unreal)).replace(/^\+|^−/, "")}</b><span data-no-i18n>${P.pct == null ? "" : pct(P.pct)}</span><small>${T("unrealized")}</small></div>
      <dl class="v6-pos-dl">
        <div><dt>${T("Holding")}</dt><dd data-no-i18n>${P.held.toLocaleString("en-US", { maximumFractionDigits: 0 })} $${esc(APC.l.symbol || "")}</dd></div>
        <div><dt>${T("Average cost")}</dt><dd data-no-i18n>${P.avg == null ? "—" : apcFmtPrice(APC.q.usd != null ? P.avg * APC.q.usd : P.avg)}</dd></div>
        <div><dt>${T("Value now")}</dt><dd data-no-i18n>${q(P.value)}</dd></div>
        <div><dt>${T("Realized")}</dt><dd class="${cls(P.realized)}" data-no-i18n>${P.realized ? (P.realized >= 0 ? "+" : "−") + q(Math.abs(P.realized)) : "—"}</dd></div>
      </dl><p class="v6-muted sm">${T("From this wallet's trades in the pool, after fees. Tokens received any other way count at zero cost. Not advice.")}</p>`;
  }
  function paintCreatorCoins() {
    const host = document.querySelector("#bp-panel-coin .ac2-side"); if (!host || typeof APC === "undefined" || !APC.l) return;
    const cr = lc(APC.l.creator);
    const others = coins().filter((l) => lc(l.creator) === cr && keyOf(l) !== keyOf(APC.l)).sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0));
    let box = $("v6-cc");
    if (!others.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "v6-cc"; box.className = "ac2-card v6-cc"; host.appendChild(box); }
    const best = Math.max(...others.map((l) => l.marketCapUsd || 0));
    box.innerHTML = `<h3>${T("This creator's other coins")} <small data-no-i18n>${others.length}</small></h3>
      <ul>${others.slice(0, 6).map((l) => `<li><a href="${coinHref(l)}" data-v6-open="${esc(l.token)}">${logoHtml(l, "v6-cc-logo")}<span><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${esc(ago(l.launchedAt))} · ${PLAT[platOf(l)]}</small></span><em data-no-i18n>${usd(l.marketCapUsd)}</em></a></li>`).join("")}</ul>
      <p class="v6-muted sm">${T("Best market cap among them")}: <b data-no-i18n>${usd(best)}</b> · ${T("check the Token Scanner for the rest of the wallet's history.")}</p>`;
  }
  // comments
  async function loadComments(force) {
    if (!CP.token) return;
    if (!force && CP.comments && Date.now() - CP.cAt < 20e3) { paintComments(); return; }
    const t = CP.token;
    try { const r = await fetch(`/api/social?comments=${t}`); const j = r.ok ? await r.json() : null; if (t !== CP.token) return; CP.comments = j && j.enabled !== false ? j : { items: [], pinned: null, off: true }; CP.cAt = Date.now(); } catch { CP.comments = CP.comments || { items: [], pinned: null }; }
    paintComments();
  }
  function commentsFrame() {
    const tabs = document.querySelector("#bp-panel-coin .ac2-tabs");
    if (!tabs || tabs.querySelector('[data-apctab="comments"]')) return;
    const b = document.createElement("button");
    b.type = "button"; b.dataset.apctab = "comments"; b.setAttribute("role", "tab");
    b.innerHTML = `${T("Comments")} <em class="v6-cn" id="v6-cn"></em>`;
    tabs.insertBefore(b, tabs.querySelector('[data-apctab="holders"]'));
    const panel = document.createElement("div");
    panel.className = "ac2-tabpanel"; panel.dataset.apcpanel = "comments"; panel.hidden = true; panel.id = "v6-comments";
    tabs.parentNode.insertBefore(panel, tabs.parentNode.querySelector('[data-apcpanel="holders"]'));
    tabs.addEventListener("click", (e) => { const t = e.target.closest("[data-apctab]"); if (!t) return; if (t.dataset.apctab === "comments") { tabs.querySelectorAll("[data-apctab]").forEach((x) => x.classList.toggle("active", x === t)); tabs.parentNode.querySelectorAll("[data-apcpanel]").forEach((p) => { p.hidden = p.dataset.apcpanel !== "comments"; }); loadComments(true); } else { panel.hidden = true; } });
  }
  function paintComments() {
    const p = $("v6-comments"), c = CP.comments; if (!p || !c) return;
    const cn = $("v6-cn"); if (cn) cn.textContent = c.items && c.items.length ? String(c.n || c.items.length) : "";
    if (c.off) { p.innerHTML = `<div class="ac2-empty">${T("Comments aren't switched on yet.")}</div>`; return; }
    const creator = APC.l ? lc(APC.l.creator) : "", w = me(), pinned = c.pinned ? (c.items || []).find((x) => x.id === c.pinned) : null;
    const item = (x, pin) => `<li class="v6-cm${pin ? " pin" : ""}${x.c ? " cr" : ""}" data-cm="${esc(x.id)}">
        <span class="v6-cm-a" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(x.w) : ""}" aria-hidden="true"></span>
        <div><p class="v6-cm-h"><a href="${apcExplorer("address", x.w)}" target="_blank" rel="noopener" data-no-i18n>${short(x.w)}</a>${x.c ? `<em class="v6-badge cr">${T("Creator")}</em>` : x.h ? `<em class="v6-badge h">${T("Holder")}</em>` : ""}${pin ? `<em class="v6-badge pin">${T("Pinned")}</em>` : ""}<time>${esc(ago(Math.floor(x.at / 1000)))}</time></p>
        <p class="v6-cm-t" data-no-i18n>${esc(x.t)}</p>
        <p class="v6-cm-acts"><button type="button" data-cm-reply="${esc(x.id)}">${T("Reply")}</button>${w && w === creator ? `<button type="button" data-cm-pin="${pin ? "" : esc(x.id)}">${T(pin ? "Unpin" : "Pin")}</button>` : ""}</p>
        ${x.r ? `<p class="v6-cm-re">${T("replying to")} <span data-no-i18n>${esc(((c.items || []).find((y) => y.id === x.r) || {}).t || "").slice(0, 60)}</span></p>` : ""}</div></li>`;
    const list = (c.items || []).filter((x) => x.id !== c.pinned);
    p.innerHTML = `<form class="v6-cm-form" id="v6-cm-form"><textarea id="v6-cm-text" maxlength="280" rows="2" placeholder="${T(w ? "Say something about this coin…" : "Connect a wallet to comment")}"></textarea>
        <div><small id="v6-cm-reply" hidden></small><span class="v6-muted sm">${T("Signed with your wallet — free, no transaction. Holders and the creator are marked.")}</span><button type="submit" class="bp-btn-primary sm">${T(w ? "Post" : "Connect wallet")}</button></div></form>
      ${pinned ? `<ul class="v6-cms">${item(pinned, true)}</ul>` : ""}
      ${list.length ? `<ul class="v6-cms">${list.map((x) => item(x, false)).join("")}</ul>` : `<div class="ac2-empty">${T("No comments yet — be the first.")}</div>`}`;
  }
  async function postComment() {
    const ta = $("v6-cm-text"); if (!ta) return;
    const text = ta.value.trim().slice(0, 280);
    if (!me()) { await connectWallet(); paintComments(); return; }
    if (!text) { ta.focus(); return; }
    const btn = $("v6-cm-form").querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const issued = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
      const msg = `ARCIRCLE PAD — comment\nCoin: ${lc(CP.token)}\nIssued: ${issued}\nText: ${keccakText(text)}`;
      const sig = await signText(msg);
      const j = await post({ action: "comment", coin: CP.token, wallet: me(), text, issued, signature: sig, reply: CP.reply || undefined });
      CP.reply = null;
      if (j.item && CP.comments) { CP.comments.items = [j.item, ...(CP.comments.items || [])]; CP.comments.n = (CP.comments.n || 0) + 1; }
      paintComments(); toast(tr("Comment posted"), "ok");
    } catch (err) { toast(String((err && (err.shortMessage || err.message)) || err).slice(0, 140), "bad"); }
    finally { btn.disabled = false; }
  }
  async function pinComment(id) {
    try {
      const issued = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
      const sig = await signText(`ARCIRCLE PAD — pin a comment\nCoin: ${lc(CP.token)}\nComment: ${id || "none"}\nIssued: ${issued}`);
      await post({ action: "commentpin", coin: CP.token, wallet: me(), id: id || null, issued, signature: sig });
      loadComments(true);
    } catch (err) { toast(String((err && err.message) || err).slice(0, 140), "bad"); }
  }
  // candles with volume (the on-chain chart's other mode)
  function chartFrame() {
    const tools = document.querySelector("#bp-panel-coin .ac2-chart-card .ac2-card-tools");
    if (!tools || $("v6-cmode")) return;
    tools.insertAdjacentHTML("afterbegin", `<div class="ac2-seg" id="v6-cmode"><button type="button" data-cmode="line" class="${CP.mode === "line" ? "active" : ""}">${T("Line")}</button><button type="button" data-cmode="candles" class="${CP.mode === "candles" ? "active" : ""}">${T("Candles")}</button></div>`);
  }
  function candles() {
    const box = $("apc-chart"); if (!box || typeof APC === "undefined" || APC.chartSrc !== "onchain") return;
    const k = APC.q.usd != null ? APC.q.usd : 1, now = Math.floor(Date.now() / 1000);
    const tr0 = (APC.trades || []).map((t) => ({ ts: apcTsOf(t.b), p: (t.after || t.price || 0) * k, v: (t.usdc || 0) * k, side: t.side })).filter((x) => x.ts && x.p > 0).sort((a, b) => a.ts - b.ts);
    const from = APC.range ? now - APC.range : tr0.length ? tr0[0].ts : now - 86400;
    const span = Math.max(600, now - from);
    const bucket = span <= 3600 ? 60 : span <= 86400 ? 900 : span <= 7 * 86400 ? 3600 : 4 * 3600;
    const B = new Map();
    let prev = null;
    for (const t of tr0) {
      if (t.ts < from) { prev = t.p; continue; }
      const k2 = Math.floor(t.ts / bucket) * bucket;
      let c = B.get(k2);
      if (!c) { const o = prev != null ? prev : t.p; c = { t: k2, o, h: Math.max(o, t.p), l: Math.min(o, t.p), c: t.p, v: 0, bv: 0 }; B.set(k2, c); }
      c.h = Math.max(c.h, t.p); c.l = Math.min(c.l, t.p); c.c = t.p; c.v += t.v; if (t.side === "buy") c.bv += t.v;
      prev = t.p;
    }
    const cs = [...B.values()].sort((a, b) => a.t - b.t);
    if (cs.length < 2) { box.innerHTML = `<div class="ac2-empty">${T("Not enough trades in this range for candles yet.")}</div>`; return; }
    const W = Math.max(320, box.clientWidth || 640), H = 300, padL = 10, padR = 76, padT = 14, padB = 26, VH = 54;
    const lo0 = Math.min(...cs.map((c) => c.l)), hi0 = Math.max(...cs.map((c) => c.h)), pad = (hi0 - lo0 || hi0 * 0.02) * 0.1;
    const lo = Math.max(0, lo0 - pad), hi = hi0 + pad, vmax = Math.max(...cs.map((c) => c.v), 1e-9);
    const n = cs.length, bw = (W - padL - padR) / Math.max(n, 12);
    const X = (i) => padL + (i + 0.5) * bw + (W - padL - padR - n * bw);
    const ph = H - padT - padB - VH - 6;
    const Y = (p) => padT + (1 - (p - lo) / (hi - lo)) * ph;
    const vy = H - padB;
    const fmt = (v) => (typeof apcFmtPrice === "function" ? apcFmtPrice(v) : String(v)).replace("$", "");
    const ticks = [0, 1, 2, 3].map((q) => lo + ((hi - lo) * q) / 3);
    const lab = (t) => { const d = new Date(t * 1000); return span > 2 * 86400 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };
    const every = Math.max(1, Math.round(n / 5));
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${T("Candles")}" class="v6-candles${reduce ? "" : " grow"}">
      ${ticks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="ac2-grid-line"/><text x="${W - padR + 8}" y="${(Y(v) + 4).toFixed(1)}" class="ac2-axis">${fmt(v)}</text>`).join("")}
      ${cs.map((c, i) => { const up = c.c >= c.o, x = X(i), y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c)); return `<g class="${up ? "up" : "dn"}" style="--i:${i}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c.h).toFixed(1)}" y2="${Y(c.l).toFixed(1)}"/><rect x="${(x - bw * 0.34).toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${Math.max(1.2, y2 - y1).toFixed(1)}" rx="1"/><rect class="vol" x="${(x - bw * 0.34).toFixed(1)}" y="${(vy - (c.v / vmax) * VH).toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${((c.v / vmax) * VH).toFixed(1)}"/></g>`; }).join("")}
      ${cs.map((c, i) => (i % every ? "" : `<text x="${X(i).toFixed(1)}" y="${H - 6}" class="ac2-axis" text-anchor="middle">${lab(c.t)}</text>`)).join("")}
      <text x="${padL}" y="${vy - VH - 2}" class="ac2-axis v6-vlab">${T("Volume")}</text></svg>`;
  }
  // a big buy floats up over the chart
  function bigBuys() {
    if (typeof APC === "undefined" || !APC.trades || !APC.trades.length) return;
    const t0 = APC.trades[0];
    const k = APC.q.usd != null ? APC.q.usd : 1, v = (t0.usdc || 0) * k;
    if (CP.bigSeen.size === 0) { APC.trades.slice(0, 20).forEach((t) => CP.bigSeen.add(t.h + ":" + t.i)); return; }
    for (const t of APC.trades.slice(0, 5)) {
      const id = t.h + ":" + t.i; if (CP.bigSeen.has(id)) continue; CP.bigSeen.add(id);
      const val = (t.usdc || 0) * k;
      if (t.side !== "buy" || !(val >= Math.max(100, (APC.l && APC.l.marketCapUsd ? APC.l.marketCapUsd * 0.01 : 100)))) continue;
      const card = document.querySelector("#bp-panel-coin .ac2-chart-card"); if (!card || reduce) continue;
      const el = document.createElement("div");
      el.className = "v6-whale"; el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13c2-4 7-6 11-5 3 .7 5 3 7 2-1 3-3 5-7 5H8l-2 3v-3c-1.5-.4-2.5-1-3-2z"/></svg><b data-no-i18n>+${usd(val)}</b><span>${T("big buy")}</span>`;
      card.appendChild(el); setTimeout(() => el.remove(), 3200);
    }
    void v;
  }
  function onCoinData() {
    if (typeof APC === "undefined" || !APC.token) return;
    if (CP.token !== lc(APC.token)) { CP.token = lc(APC.token); CP.comments = null; CP.bigSeen = new Set(); commentsFrame(); chartFrame(); const pc = $("v6-comments"); if (pc && !pc.hidden) loadComments(true); }
    paintPosition(); paintCreatorCoins(); bigBuys();
  }
  // a trade or launch through ArcPad from an invite link credits the inviter (the server checks the transaction)
  async function refNote(tx) {
    const ref = typeof window.arcRef === "function" ? window.arcRef() : null;
    if (!ref || !/^0x[0-9a-fA-F]{64}$/.test(String(tx || "")) || lc(ref) === me()) return;
    for (let i = 0; i < 3; i++) { try { await post({ action: "refnote", tx, ref }); return; } catch (e) { if (!/not found yet/.test(String(e.message))) return; await new Promise((r) => setTimeout(r, 4000)); } }
  }
  function watchTx(id, sel) {
    const el = $(id); if (!el || el.__v6) return;
    el.__v6 = true;
    new MutationObserver(() => { const ok = el.querySelector(sel); if (!ok || ok.__v6) return; ok.__v6 = true; const a = ok.querySelector('a[href*="/tx/"]'); const m = a && /\/tx\/(0x[0-9a-fA-F]{64})/.exec(a.href); if (m) refNote(m[1]); }).observe(el, { childList: true, subtree: true });
  }

  // =====================================================================
  // Portfolio: P&L per coin, invite link, watchlist alerts
  // =====================================================================
  const PF = { pnl: new Map(), busy: false, ref: null, refAt: 0 };
  // one coin's full history (api/holders.mjs, edge-cached) → this wallet's trades
  async function coinTrades(l) {
    const r = await fetch(`/api/holders?token=${l.token}`);
    const d = r.ok ? await r.json() : null;
    if (!d || !Array.isArray(d.recs)) return null;
    const tokenIs0 = !l.quoteIsCurrency0, dec = l.quoteDecimals != null ? l.quoteDecimals : 6;
    const fee = BigInt((ARC.baseFeeBps != null ? ARC.baseFeeBps : 100) + (l.extraFeeBps || 0));
    const pm = lc(CONFIG.POOL_MANAGER_ADDRESS), router = lc(CONFIG.ARCPAD_ROUTER_ADDRESS);
    const byTx = new Map();
    for (const x of d.recs) if (x.k === "T") { if (!byTx.has(x.h)) byTx.set(x.h, []); byTx.get(x.h).push(x); }
    const out = [];
    for (const x of d.recs) {
      if (x.k !== "S") continue;
      const a0 = BigInt(x.a0), a1 = BigInt(x.a1), tokD = tokenIs0 ? a0 : a1, qD = tokenIs0 ? a1 : a0, buy = tokD > 0n;
      const absT = tokD < 0n ? -tokD : tokD, absQ = qD < 0n ? -qD : qD;
      const tx = (byTx.get(x.h) || []).slice().sort((a, b) => a.i - b.i);
      let trader = null;
      if (buy) { const t = tx.filter((y) => lc(y.fr) === pm).pop(); trader = t ? t.to : null; } else { const t = tx.find((y) => lc(y.to) === router || lc(y.to) === pm); trader = t ? t.fr : null; }
      const tok = Number(ethers.formatUnits(buy ? absT - (absT * fee) / 10000n : absT, 18)), q = Number(ethers.formatUnits(buy ? absQ : absQ - (absQ * fee) / 10000n, dec));
      out.push({ side: buy ? "buy" : "sell", b: x.b, i: x.i, trader, tok, usdc: q });
    }
    return out;
  }
  async function portfolioPnl() {
    const w = me(); if (!w || PF.busy) return;
    const body = $("pf-body"); if (!body) return;
    const rows = [...body.querySelectorAll("a.pf-row[href*='#coin/']")];
    if (!rows.length) return;
    PF.busy = true;
    try {
      for (const a of rows) {
        const m = /#coin\/(0x[0-9a-fA-F]{40})/.exec(a.getAttribute("href") || ""); if (!m) continue;
        const l = (ARC.launches || []).find((x) => lc(x.token) === lc(m[1]));
        if (!l) continue; // Argus coins: their trades go through Argus's own router
        const key = `${w}:${lc(l.token)}`;
        let P = PF.pnl.get(key);
        if (!P || Date.now() - P.at > 120e3) {
          const tr0 = await coinTrades(l).catch(() => null);
          if (!tr0) continue;
          P = { at: Date.now(), v: pnlOf(tr0, w, l.priceInQuote), q: l.quoteUsd };
          PF.pnl.set(key, P);
        }
        let cell = a.querySelector(".v6-pf-pnl");
        if (!cell) { cell = document.createElement("span"); cell.className = "v6-pf-pnl"; a.appendChild(cell); }
        const v = P.v, k = P.q != null ? P.q : 1;
        cell.innerHTML = v && v.unreal != null ? `<b class="${v.unreal >= 0 ? "up" : "down"}" data-no-i18n>${v.unreal >= 0 ? "+" : "−"}${usd(Math.abs(v.unreal * k)).replace("$", "$")}</b><small data-no-i18n>${v.pct == null ? "" : pct(v.pct)} · ${T("avg")} ${typeof apcFmtPrice === "function" && v.avg != null ? apcFmtPrice(v.avg * k) : "—"}</small>` : `<small>${T("bought elsewhere")}</small>`;
      }
      const head = body.querySelector(".pf-row.pf-head");
      if (head && !head.querySelector(".v6-pf-pnl")) head.insertAdjacentHTML("beforeend", `<span class="v6-pf-pnl">${T("P&L")}</span>`);
    } finally { PF.busy = false; }
  }
  async function inviteCard() {
    const body = $("pf-body"), w = me(); if (!body || !w || body.querySelector("#v6-invite")) { if (body && $("v6-invite")) paintInvite(); return; }
    const box = document.createElement("div");
    box.id = "v6-invite"; box.className = "v6-invite";
    const sum = body.querySelector(".pf-summary"); if (sum) sum.after(box); else body.prepend(box);
    paintInvite();
    if (Date.now() - PF.refAt > 60e3) {
      PF.refAt = Date.now();
      try { const r = await fetch(`/api/social?refstats=${w}`); PF.ref = r.ok ? await r.json() : null; } catch { PF.ref = null; }
      paintInvite();
    }
  }
  function paintInvite() {
    const box = $("v6-invite"), w = me(); if (!box || !w) return;
    const link = `https://www.arcircle.app/arc?ref=${w}`, s = PF.ref && PF.ref.enabled !== false ? PF.ref : null;
    box.innerHTML = `<div class="v6-inv-t"><b>${T("Your invite link")}</b><span>${T("Trades and launches made on ArcPad by wallets that came through it are counted here (checked on Arc).")}</span></div>
      <div class="v6-inv-l"><code data-no-i18n>${esc(link.replace("https://", ""))}</code><button type="button" class="bp-btn-ghost sm" data-v6-copy="${esc(link)}">${T("Copy")}</button></div>
      <div class="v6-inv-s"><span><b data-no-i18n>${s ? s.wallets : "—"}</b><small>${T("Wallets")}</small></span><span><b data-no-i18n>${s ? s.trades : "—"}</b><small>${T("Trades")}</small></span><span><b data-no-i18n>${s ? s.launches : "—"}</b><small>${T("Launches")}</small></span><span><b data-no-i18n>${s ? usd(s.usd) : "—"}</b><small>${T("Volume")}</small></span></div>
      <p class="v6-muted sm">${T("A record for now — rewards for invites aren't decided yet.")}</p>`;
  }
  // watchlist price alerts: this browser checks the watched coins as their prices refresh
  const AL = () => store.get("arcpad.alerts.v1", { on: false, pct: 10, base: {} });
  function alertsCard() {
    const body = $("pf-body"); if (!body) return;
    const h = [...body.querySelectorAll("h3.pf-h")].find((x) => /Watchlist/.test(x.textContent));
    if (!h || h.querySelector(".v6-al")) return;
    const a = AL();
    h.insertAdjacentHTML("beforeend", ` <span class="v6-al"><label><input type="checkbox" id="v6-al-on"${a.on ? " checked" : ""}> <span>${T("Alert me")}</span></label><select id="v6-al-pct" aria-label="${T("Move")}">${[5, 10, 25, 50].map((v) => `<option value="${v}"${a.pct === v ? " selected" : ""} data-no-i18n>±${v}%</option>`).join("")}</select><a href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener" class="v6-al-tg">${T("Telegram: /watch")}</a></span>`);
  }
  function checkAlerts() {
    const a = AL(); if (!a.on || typeof arcIsWatched !== "function") return;
    let changed = false;
    for (const l of coins()) {
      if (!arcIsWatched(l.token) || !(l.priceUsdc > 0)) continue;
      const k = keyOf(l), b = a.base[k];
      if (!b) { a.base[k] = l.priceUsdc; changed = true; continue; }
      const mv = ((l.priceUsdc - b) / b) * 100;
      if (Math.abs(mv) >= a.pct) {
        const msg = `$${l.symbol} ${mv > 0 ? "▲" : "▼"} ${pct(mv)} · ${usd(l.marketCapUsd)} ${tr("mcap")}`;
        toast(msg, mv > 0 ? "ok" : "bad"); notify(`ArcPad · $${l.symbol}`, msg);
        a.base[k] = l.priceUsdc; changed = true;
      }
    }
    if (changed) store.set("arcpad.alerts.v1", a);
  }

  // =====================================================================
  // Launch: steps, last launch, name ideas, schedule, one success card
  // =====================================================================
  const STEPS = [["plat", "Platform"], ["basics", "Basics"], ["token", "Token"], ["review", "Review"]];
  const LS = { step: 0, built: false };
  function launchFrame() {
    const panel = $("bp-panel-launch"), form = $("ap-launch-form"); if (!panel || !form || LS.built) return;
    LS.built = true;
    // group the form into four steps without moving any field out of the form (the launch scripts read them by id)
    const kids = [...form.children];
    const first = kids.findIndex((k) => k.classList && (k.classList.contains("ap-only-group") || k.id === "agl-fields"));
    const prevIdx = kids.findIndex((k) => k.id === "ap-launch-preview");
    const wrap = (cls, arr) => { if (!arr.length) return null; const d = document.createElement("div"); d.className = "v6-step " + cls; d.dataset.v6step = cls; arr[0].before(d); arr.forEach((x) => d.appendChild(x)); return d; };
    wrap("basics", kids.slice(0, first < 0 ? kids.length : first));
    wrap("token", kids.slice(first < 0 ? kids.length : first, prevIdx < 0 ? kids.length : prevIdx));
    wrap("review", kids.slice(prevIdx < 0 ? kids.length : prevIdx));
    const plat = $("agl-plat");
    if (plat) { const d = document.createElement("div"); d.className = "v6-step plat"; d.dataset.v6step = "plat"; plat.before(d); d.appendChild(plat); const res = $("agl-resume"); if (res) d.appendChild(res); }
    const rail = document.createElement("div");
    rail.className = "v6-rail"; rail.id = "v6-rail";
    rail.innerHTML = `<ol>${STEPS.map(([k, l], i) => `<li><button type="button" data-v6go="${i}"><i data-no-i18n>${i + 1}</i><span>${T(l)}</span></button></li>`).join("")}</ol>
      <div class="v6-tools"><button type="button" class="bp-btn-ghost sm" data-v6-last>${T("Use my last launch")}</button><button type="button" class="bp-btn-ghost sm" data-v6-ideas>${T("Name ideas")}</button><button type="button" class="bp-btn-ghost sm" data-v6-sched>${T("Schedule it")}</button></div>
      <div class="v6-ideas" id="v6-ideas" hidden></div><div class="v6-sched" id="v6-sched" hidden></div>`;
    const lede = panel.querySelector(".bp-lede"); (lede || panel.querySelector("h1")).after(rail);
    const nav = document.createElement("div");
    nav.className = "v6-stepnav"; nav.id = "v6-stepnav";
    nav.innerHTML = `<button type="button" class="bp-btn-ghost" data-v6-prev>← ${T("Back")}</button><button type="button" class="bp-btn-primary" data-v6-next>${T("Next")} →</button>`;
    form.after(nav);
    setStep(0, true);
    // on a wide screen every step shows; the rail follows the scroll
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (innerWidth <= 720) return; for (const e of es) if (e.isIntersecting) { const i = STEPS.findIndex(([k]) => k === e.target.dataset.v6step); if (i >= 0) paintRail(i); } }, { rootMargin: "-35% 0px -55% 0px" });
      panel.querySelectorAll(".v6-step").forEach((s) => io.observe(s));
    }
  }
  function paintRail(i) { document.querySelectorAll("#v6-rail [data-v6go]").forEach((b, k) => { b.parentNode.classList.toggle("on", k === i); b.parentNode.classList.toggle("done", k < i); }); }
  function setStep(i, quiet) {
    LS.step = Math.max(0, Math.min(STEPS.length - 1, i));
    const panel = $("bp-panel-launch"); if (!panel) return;
    panel.dataset.v6step = STEPS[LS.step][0];
    paintRail(LS.step);
    const nav = $("v6-stepnav");
    if (nav) { nav.querySelector("[data-v6-prev]").hidden = LS.step === 0; nav.querySelector("[data-v6-next]").hidden = LS.step === STEPS.length - 1; }
    if (innerWidth <= 720) {
      panel.querySelectorAll(".v6-step").forEach((s) => { const on = s.dataset.v6step === STEPS[LS.step][0]; s.classList.toggle("v6-on", on); if (on && !quiet && !reduce) { s.classList.remove("v6-flip"); void s.offsetWidth; s.classList.add("v6-flip"); } });
      if (!quiet) { const r = $("v6-rail"); if (r) r.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    } else if (!quiet) {
      const s = panel.querySelector(`.v6-step[data-v6step="${STEPS[LS.step][0]}"]`); if (s) s.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }
  function stepOk() {
    if (STEPS[LS.step][0] !== "basics") return true;
    const n = $("ap-name"), s = $("ap-symbol");
    if (n && !n.value.trim()) { n.focus(); n.reportValidity && n.reportValidity(); return false; }
    if (s && !s.value.trim()) { s.focus(); s.reportValidity && s.reportValidity(); return false; }
    return true;
  }
  const LAST = "arcpad.lastlaunch.v1";
  const FIELDS = ["ap-name", "ap-symbol", "ap-logo", "ap-description", "ap-website", "ap-twitter", "ap-telegram", "ap-discord"];
  function saveLast() { const v = {}; FIELDS.forEach((id) => { const el = $(id); if (el) v[id] = el.value; }); const plat = document.querySelector('#agl-plat [aria-checked="true"]'); v.plat = plat ? plat.dataset.plat : "arcpad"; store.set(LAST, v); }
  function useLast() {
    const v = store.get(LAST, null);
    if (!v) { toast(tr("No earlier launch from this browser yet.")); return; }
    FIELDS.forEach((id) => { const el = $(id); if (el && v[id] != null && !/symbol|name/.test(id)) { el.value = v[id]; el.dispatchEvent(new Event("input", { bubbles: true })); } });
    toast(tr("Filled in from your last launch — give the new coin its own name and ticker."));
    const n = $("ap-name"); if (n) n.focus();
  }
  async function ideas() {
    const box = $("v6-ideas"); if (!box) return;
    box.hidden = false;
    box.innerHTML = `<form class="v6-ideas-f" id="v6-ideas-f"><input id="v6-theme" maxlength="120" placeholder="${T("A theme — e.g. a frog who loves stablecoins")}"><button type="submit" class="bp-btn-primary sm">${T("Ask ARCIA")}</button></form><div id="v6-ideas-l"></div>`;
    $("v6-theme").focus();
  }
  async function askIdeas() {
    const out = $("v6-ideas-l"); if (!out) return;
    out.innerHTML = `<p class="v6-muted">${T("ARCIA is thinking…")}</p>`;
    try {
      const j = await post({ action: "names", theme: ($("v6-theme") || {}).value || "", lang: window.arcI18n ? window.arcI18n.get() : "en" }, "/api/arcia");
      const list = (j && j.ideas) || [];
      out.innerHTML = list.length ? `<ul class="v6-idea-l">${list.map((x, i) => `<li><button type="button" data-v6-idea="${i}"><b data-no-i18n>${esc(x.name)}</b><em data-no-i18n>$${esc(x.symbol)}</em><small data-no-i18n>${esc(x.why)}</small></button></li>`).join("")}</ul><p class="v6-muted sm">${T("Ideas only — check nobody else uses the name before you launch.")}</p>` : `<p class="v6-muted">${T("No ideas came back — try another theme.")}</p>`;
      out.__ideas = list;
    } catch (e) { out.innerHTML = `<p class="v6-muted">${esc(String(e.message || e))}</p>`; }
  }
  function schedForm() {
    const box = $("v6-sched"); if (!box) return;
    box.hidden = !box.hidden;
    if (box.hidden) return;
    const d = new Date(Date.now() + 86400e3); d.setMinutes(0, 0, 0);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
    box.innerHTML = `<p>${T("Announce the launch first: it shows on ArcPad's Home with a countdown and a reminder button. Uses the name, ticker and logo above. Launch it yourself at that time — it turns into \"Live now\" when it's out.")}</p>
      <div class="v6-sched-r"><input type="datetime-local" id="v6-sched-at" value="${v}"><button type="button" class="bp-btn-primary sm" data-v6-sched-go>${T("Sign and schedule")}</button></div><p class="v6-muted sm" id="v6-sched-msg"></p>`;
  }
  async function schedule() {
    const msg = (t) => { const el = $("v6-sched-msg"); if (el) el.textContent = t; };
    const name = ($("ap-name") || {}).value || "", symbol = String(($("ap-symbol") || {}).value || "").toUpperCase().trim();
    const at = Math.floor(new Date(($("v6-sched-at") || {}).value).getTime() / 1000);
    if (!name.trim() || !symbol) { msg(tr("Fill in the name and ticker first.")); return; }
    if (!(at > Date.now() / 1000 + 300)) { msg(tr("Pick a time at least 5 minutes from now.")); return; }
    try {
      const plat = document.querySelector('#agl-plat [aria-checked="true"]');
      const p = { creator: me(), name: name.trim(), symbol, at, platform: plat ? plat.dataset.plat : "arcpad", description: ($("ap-description") || {}).value || "", image: /^https:\/\//.test(($("ap-logo") || {}).value || "") ? $("ap-logo").value : "", x: ($("ap-twitter") || {}).value || "" };
      if (!me()) { await connectWallet(); p.creator = me(); }
      const issued = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
      const sig = await signText(`ARCIRCLE PAD — scheduled launch\nCreator: ${lc(p.creator)}\nSymbol: ${p.symbol}\nAt: ${new Date(p.at * 1000).toISOString()}\nIssued: ${issued}`);
      const j = await post({ action: "launchplan", ...p, issued, signature: sig });
      msg(tr("Scheduled — it's on Home with a countdown."));
      toast(tr("Launch scheduled"), "ok");
      PL.at = 0; loadPlans();
      void j;
    } catch (e) { msg(String((e && e.message) || e).slice(0, 160)); }
  }
  // one "Your coin is live" card for Argus, Pons and Pump.fun launches (ArcPad's own opens the coin page with its banner)
  function successCard(o) {
    const old = $("v6-live"); if (old) old.remove();
    const url = o.platform === "argus" ? `https://www.arcircle.app/c/${o.token}${me() ? `?ref=${me()}` : ""}` : `https://www.arcircle.app/arc#explore?plat=${o.platform}&coin=${o.token}`;
    const el = document.createElement("div");
    el.id = "v6-live"; el.className = "v6-live";
    el.innerHTML = `<div class="v6-live-bg" data-v6-live-x></div><div class="v6-live-box" role="dialog" aria-modal="true">
      <div class="v6-live-burst" aria-hidden="true"></div>
      <span class="v6-plat ${esc(o.platform)}" data-no-i18n>${PLAT[o.platform]}</span>
      <h3>${T("Your coin is live.")}</h3><b class="v6-live-sym" data-no-i18n>$${esc(o.symbol || "")}</b>
      <p>${T("It's listed in ArcPad's Explore and announced on Telegram. Tell people where to find it.")}</p>
      <div class="v6-live-acts"><a class="bp-btn-primary" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(`$${o.symbol || ""} is live on ${PLAT[o.platform]}, launched through ArcPad 💚\n`)}&url=${encodeURIComponent(url)}&via=ARCIRCLEonArc">${T("Share on X")}</a>
        <button type="button" class="bp-btn-ghost" data-v6-copy="${esc(url)}">${T("Copy link")}</button>${o.venue ? `<a class="bp-btn-ghost" href="${esc(o.venue)}" target="_blank" rel="noopener" data-no-i18n>${esc(PLAT[o.platform])} ↗</a>` : ""}</div>
      <button type="button" class="v6-live-x" data-v6-live-x aria-label="${T("Close")}">×</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
  }
  window.arcLaunchLive = successCard;

  // =====================================================================
  // Creators: every platform, the top three as profile cards
  // =====================================================================
  function creatorsV6() {
    const body = $("cr-body"); if (!body) return;
    const by = new Map();
    for (const l of coins()) {
      const k = lc(l.creator); if (!k || !isAddr(k)) continue;
      const s = statsOf(l) || { vol: 0, trades: 0 };
      if (!by.has(k)) by.set(k, { creator: k, coins: [], vol: 0, trades: 0, best: 0, grad: 0, plats: new Set() });
      const r = by.get(k);
      r.coins.push(l); r.vol += s.vol || 0; r.trades += s.trades || 0; r.best = Math.max(r.best, l.marketCapUsd || 0); if (l.graduated) r.grad++; r.plats.add(platOf(l));
    }
    const rows = [...by.values()].map((r) => ({ ...r, score: r.vol + 5 * r.trades + r.best / 100 })).sort((a, b) => b.score - a.score || b.coins.length - a.coins.length);
    if (!rows.length) return;
    const w = me();
    const card = (r, i) => `<div class="v6-crp top${i + 1}${r.creator === w ? " me" : ""}"><span class="v6-crp-r" data-no-i18n>${i + 1}</span><span class="v6-crp-a" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(r.creator) : ""}" aria-hidden="true"></span>
      <a class="v6-crp-w" href="${CONFIG.BLOCK_EXPLORER}/address/${r.creator}" target="_blank" rel="noopener" data-no-i18n>${short(r.creator)}</a>
      <div class="v6-crp-p">${[...r.plats].map((p) => `<em class="v6-plat ${p}" data-no-i18n>${PLAT[p]}</em>`).join("")}</div>
      <dl><div><dt>${T("Coins")}</dt><dd data-no-i18n>${r.coins.length}</dd></div><div><dt>${T("Vol 24h")}</dt><dd data-no-i18n>${usd(r.vol)}</dd></div><div><dt>${T("Best mcap")}</dt><dd data-no-i18n>${usd(r.best)}</dd></div><div><dt>${T("Graduated")}</dt><dd data-no-i18n>${r.grad}</dd></div></dl>
      <div class="v6-crp-c">${r.coins.slice(0, 5).map((l) => `<a href="${coinHref(l)}" data-v6-open="${esc(l.token)}" title="$${esc(l.symbol)}">${logoHtml(l, "v6-crp-logo")}</a>`).join("")}</div></div>`;
    let pod = $("v6-podium");
    if (!pod) { pod = document.createElement("div"); pod.id = "v6-podium"; pod.className = "v6-podium"; body.before(pod); }
    const html = rows.slice(0, 3).map(card).join("");
    if (pod.__html !== html) { pod.innerHTML = html; pod.__html = html; }
  }

  // =====================================================================
  // wiring
  // =====================================================================
  document.addEventListener("click", (e) => {
    const o = e.target.closest && e.target.closest("[data-v6-open]");
    if (o && !e.target.closest("[data-qb]")) { const l = coins().find((x) => x.token === o.dataset.v6Open || lc(x.token) === lc(o.dataset.v6Open)); if (l) { e.preventDefault(); openCoin(l); return; } }
    const q = e.target.closest && e.target.closest("[data-qb]");
    if (q) { e.preventDefault(); e.stopPropagation(); const c = q.closest(".ap-launch-card"); if (c) quickBuy(c.dataset.token, Number(q.dataset.qb), q); return; }
    const v = e.target.closest && e.target.closest("[data-v6-view]");
    if (v) { store.set("arcpad.exview.v1", v.dataset.v6View); document.querySelectorAll("[data-v6-view]").forEach((b) => b.setAttribute("aria-checked", String(b === v))); listView(); return; }
    const cp = e.target.closest && e.target.closest("[data-v6-copy]");
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.v6Copy).then(() => toast(tr("Copied"), "ok"), () => {}); return; }
    if (e.target.closest && e.target.closest("[data-v6-live-x]")) { const el = $("v6-live"); if (el) { el.classList.remove("in"); setTimeout(() => el.remove(), 250); } return; }
    const rm = e.target.closest && e.target.closest("[data-remind]");
    if (rm) { const id = rm.dataset.remind, r = store.get("arcpad.planremind.v1", []); const on = !r.includes(id); store.set("arcpad.planremind.v1", on ? [...r, id] : r.filter((x) => x !== id)); if (on && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } } paintPlans(); toast(tr(on ? "We'll remind you here a minute before — keep a tab open" : "Reminder off")); return; }
    const cm = e.target.closest && e.target.closest("[data-cmode]");
    if (cm) { CP.mode = cm.dataset.cmode; store.set("arcpad.chartmode.v1", CP.mode); document.querySelectorAll("[data-cmode]").forEach((b) => b.classList.toggle("active", b === cm)); if (typeof apcRenderChart === "function") apcRenderChart(); return; }
    const rp = e.target.closest && e.target.closest("[data-cm-reply]");
    if (rp) { CP.reply = rp.dataset.cmReply; const s = $("v6-cm-reply"); if (s) { s.hidden = false; s.textContent = tr("Replying to a comment"); } const t = $("v6-cm-text"); if (t) t.focus(); return; }
    const pn = e.target.closest && e.target.closest("[data-cm-pin]");
    if (pn) { pinComment(pn.dataset.cmPin || null); return; }
    const go = e.target.closest && e.target.closest("[data-v6go]");
    if (go) { setStep(Number(go.dataset.v6go)); return; }
    if (e.target.closest && e.target.closest("[data-v6-next]")) { if (stepOk()) setStep(LS.step + 1); return; }
    if (e.target.closest && e.target.closest("[data-v6-prev]")) { setStep(LS.step - 1); return; }
    if (e.target.closest && e.target.closest("[data-v6-last]")) { useLast(); return; }
    if (e.target.closest && e.target.closest("[data-v6-ideas]")) { const b = $("v6-ideas"); if (b && !b.hidden) b.hidden = true; else ideas(); return; }
    const idea = e.target.closest && e.target.closest("[data-v6-idea]");
    if (idea) { const l = ($("v6-ideas-l") || {}).__ideas || [], x = l[Number(idea.dataset.v6Idea)]; if (x) { const n = $("ap-name"), s = $("ap-symbol"); if (n) { n.value = x.name; n.dispatchEvent(new Event("input", { bubbles: true })); } if (s) { s.value = x.symbol; s.dispatchEvent(new Event("input", { bubbles: true })); } toast(tr("Name and ticker filled in")); } return; }
    if (e.target.closest && e.target.closest("[data-v6-sched]")) { schedForm(); return; }
    if (e.target.closest && e.target.closest("[data-v6-sched-go]")) { schedule(); return; }
  }, true);
  document.addEventListener("keydown", (e) => { const q = e.target.closest && e.target.closest("[data-qb]"); if (q && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); const c = q.closest(".ap-launch-card"); if (c) quickBuy(c.dataset.token, Number(q.dataset.qb), q); } }, true);
  document.addEventListener("submit", (e) => {
    if (e.target.id === "v6-cm-form") { e.preventDefault(); postComment(); }
    if (e.target.id === "v6-ideas-f") { e.preventDefault(); askIdeas(); }
    if (e.target.id === "ap-launch-form") saveLast();
  }, true);
  document.addEventListener("change", (e) => {
    if (e.target.id === "v6-al-on" || e.target.id === "v6-al-pct") {
      const a = AL(); a.on = $("v6-al-on").checked; a.pct = Number($("v6-al-pct").value) || 10; a.base = {};
      store.set("arcpad.alerts.v1", a);
      if (a.on && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      toast(tr(a.on ? "Alerts on for your watchlist (this browser)" : "Alerts off"));
    }
  });
  // hooks into the core painters
  if (typeof arcPaintCard === "function") {
    const orig = arcPaintCard;
    // eslint-disable-next-line no-global-assign
    arcPaintCard = function (card) { orig(card); try { decorate(card); } catch (e) { console.warn(e); } };
  }
  if (typeof actPaint === "function") {
    const orig = actPaint;
    // eslint-disable-next-line no-global-assign
    actPaint = function () { orig(); try { paintKoth(); paintTrending(); paintHomeStats(); checkAlerts(); creatorsV6(); if (!SEEN.set && coins().length) setTimeout(markSeen, 4000); } catch (e) { console.warn(e); } };
  }
  if (typeof renderArcpadExploreGrid === "function") {
    const orig = renderArcpadExploreGrid;
    // eslint-disable-next-line no-global-assign
    renderArcpadExploreGrid = function () { orig(); try { exploreFrame(); listView(); paintKoth(); paintTrending(); paintHomeStats(); } catch (e) { console.warn(e); } };
  }
  if (typeof apcRenderData === "function") {
    const orig = apcRenderData;
    // eslint-disable-next-line no-global-assign
    apcRenderData = function () { orig(); try { onCoinData(); } catch (e) { console.warn(e); } };
  }
  if (typeof apcRenderChart === "function") {
    const orig = apcRenderChart;
    // eslint-disable-next-line no-global-assign
    apcRenderChart = function () { if (CP.mode === "candles" && typeof APC !== "undefined" && APC.chartSrc === "onchain") { try { candles(); return; } catch (e) { console.warn(e); } } orig(); };
  }
  document.addEventListener("arcpad:tab", (e) => {
    const t = e.detail && e.detail.tab;
    // the "your coin is live" card belongs to the launch it followed; moving on closes it
    if (t !== "launch") { const lv = $("v6-live"); if (lv) lv.remove(); }
    if (t === "home") { loadPlans(); paintKoth(); paintTrending(); }
    if (t === "portfolio") setTimeout(() => { inviteCard(); alertsCard(); portfolioPnl(); }, 600);
    if (t === "launch") launchFrame();
    if (t === "creators") creatorsV6();
  });
  // the portfolio repaints itself: put the extras back each time
  const pfb = $("pf-body");
  if (pfb) new MutationObserver(() => { if (!$("bp-panel-portfolio") || !$("bp-panel-portfolio").classList.contains("active")) return; clearTimeout(PF.t); PF.t = setTimeout(() => { inviteCard(); alertsCard(); portfolioPnl(); }, 300); }).observe(pfb, { childList: true });
  watchTx("apc-status", ".ac2-msg.success");
  watchTx("ap-launch-status", ".status.success");
  homeFrame(); exploreFrame(); loadPlans();
  setInterval(tickPlans, 1000);
  setInterval(() => { if (!document.hidden) loadPlans(); }, 60e3);
  if ($("bp-panel-launch") && $("bp-panel-launch").classList.contains("active")) launchFrame();
  window.addEventListener("resize", () => { if (LS.built) setStep(LS.step, true); });
  window.arcV6 = { pnlOf, kothPick, coins, setStep, successCard, refNote, quickBuy, state: { K, CP, PF, PL, LS } };
})();
