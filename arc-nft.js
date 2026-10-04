/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, WagmiCoreRef, wagmiConfigRef */
// arc-nft.js — ARCIRCLE NFT Vault v2 (arcpad.html#nft; api/_nft.mjs; contracts/ArcircleNft.sol on Robinhood Chain):
//   · a coin's Pons creator fees go to the router: 50% the NFT Vault, 50% the treasury (anyone can trigger the split)
//   · the vault buys NFTs of listed collections (Seaport only) and raffles each one to $ARCIRCLE holders on Arc,
//     weighted by wallet $ARCIRCLE + locked in ARCIRCLE Staking + veARCIRCLE; $ARCIA is the NFT ecosystem's flagship
//   · v2 (4 Oct 2026): where the vault is (six steps, also the empty state), the keeper's last run, the fee pipeline with
//     the 7-day rate and an estimate to the next NFT, fee sources and $ARCIA, a what-if odds calculator, each raffle's
//     on-chain timeline (from the vault's own events) with "check my ticket" (the Merkle proof checked here, in the
//     browser, against the root on-chain), the winner reveal, a winners gallery, share cards (/nft/<n>), collections
//     with floor sparklines, the curator's collection check and history, and the vault's latest on-chain activity
// Until the contracts are live (no vault from the API) the page explains it.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-nft");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const body = $("nft-body");
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const API = "/api/desk";
  const NC = (typeof CONFIG !== "undefined" && CONFIG.NFT) || {};
  const ARCIA_RH = (typeof CONFIG !== "undefined" && CONFIG.ARCIA_RH_TOKEN) || "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25";
  const ARCIA_BUY = `https://www.ponsfamily.com/launchpad/${lc(ARCIA_RH)}`;
  const CHAIN = Number(NC.CHAIN_ID || 4663), CHAIN_HEX = "0x" + CHAIN.toString(16);
  const EXPL = (k, x) => `${NC.EXPLORER || "https://robinhoodchain.blockscout.com"}/${k}/${x}`;
  const ADD = { chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [NC.RPC || "https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: [NC.EXPLORER || "https://robinhoodchain.blockscout.com"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const SITE = location.origin;
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const ethS = (n) => (n == null || !isFinite(n) ? "—" : fmt(n, n > 0 && n < 0.01 ? 5 : n < 1 ? 4 : 3) + " ETH");
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e3 ? fmt(n / 1e3, 1) + "K" : fmt(n, 2));
  const usd = (v) => (v == null ? "—" : v >= 1e6 ? "$" + fmt(v / 1e6, 2) + "M" : v >= 1e3 ? "$" + fmt(v / 1e3, 1) + "K" : v < 0.001 ? "$" + Number(v).toPrecision(3) : "$" + fmt(v, v < 1 ? 6 : 2));
  const left = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const ago = (s) => { s = Math.max(0, Math.floor(s)); return s < 90 ? tr("just now") : s < 3600 ? `${Math.floor(s / 60)}m ${tr("ago")}` : s < 86400 ? `${Math.floor(s / 3600)}h ${tr("ago")}` : `${Math.floor(s / 86400)}d ${tr("ago")}`; };
  const day = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VAULT_ABI = ["function proposeCollection(address collection, uint128 maxPrice)", "function lowerCap(address collection, uint128 maxPrice)", "function removeCollection(address collection)", "function setKeeper(address next)",
    "error NotCurator()", "error NotAllowed()", "error ZeroAddress()"];
  const ROUTER_ABI = ["function claim() returns (uint256 toVault, uint256 toTreasury)", "error Reentered()", "error PayFailed(address to)"];
  const SEEN_KEY = "arcircle.nft.seen.v2";
  const S = { st: null, me: null, busy: false, msg: {}, skew: 0, loaded: false, f: { col: "", cap: "", keeper: "" }, calc: { amt: "10000", mode: "hold" },
    tickets: {}, open: new Set(), arcia: null, col: null, first: true, seen: null, reveal: new Set(), booted: false };
  const PIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17.5l4.6-4.4 3.4 3 3.2-3.6 4.8 5"/></svg>';
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/></svg>',
    dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  };
  // a picture for an NFT without one: its collection's colours and token number
  const art = (c, id) => {
    const x = parseInt(String(c || "0x0").slice(2, 8), 16) || 0, a = x % 360, b = (a + 70 + (x >> 7) % 90) % 360;
    return `<span class="nft-art" style="--a:${a};--b:${b}" aria-hidden="true"><b data-no-i18n>${id != null && id !== "" ? "#" + esc(String(id).slice(0, 6)) : esc(String(c || "?").slice(2, 4).toUpperCase())}</b></span>`;
  };
  const pic = (src, c, id) => (src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'nft-art-x'}))">` : art(c, id));

  // ---------------- data ----------------
  async function loadState() {
    try { const r = await fetch(`${API}?nft=state`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j) { S.st = j; if (j.now) S.skew = j.now - Math.floor(Date.now() / 1000); } } catch { /* keep */ }
    S.loaded = true;
  }
  async function loadMe() {
    const u = me();
    if (!u || !S.st || !S.st.live) { S.me = null; return; }
    try { const r = await fetch(`${API}?nft=me&u=${u}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.live) S.me = j; } catch { /* keep */ }
  }
  async function loadArcia() {
    if (S.arcia && Date.now() - S.arcia.at < 120e3) return;
    try { const r = await fetch("/api/arcia", { cache: "no-store" }); const j = r.ok ? await r.json() : null; S.arcia = { at: Date.now(), v: (j && j.live && j.live.arcia) || null }; } catch { S.arcia = { at: Date.now(), v: null }; }
  }
  async function refresh() { const prev = S.st && S.st.balance; await loadState(); await Promise.all([loadMe(), loadArcia()]); render(); grew(prev); }
  const live = () => !!(S.st && S.st.live);
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);
  function loadSeen() { if (S.seen) return S.seen; try { S.seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "null") || { p: {} }; } catch { S.seen = { p: {} }; } return S.seen; }
  function saveSeen() { const st = S.st; if (!st || !st.prizes) return; const p = {}; st.prizes.forEach((x) => { p[x.i] = x.status; }); S.seen = { p, at: Date.now() }; try { localStorage.setItem(SEEN_KEY, JSON.stringify(S.seen)); } catch { /* private mode */ } }
  const evs = () => (S.st && S.st.log && Array.isArray(S.st.log.events) ? S.st.log.events : []);

  // ---------------- view: the top ----------------
  function keeperPill() {
    const st = S.st || {}, k = st.keeperRun || { at: st.keeperAt || 0 };
    if (!live()) return "";
    const age = k.at ? nowS() - k.at : Infinity;
    const cls = k.note ? "warn" : age < 3 * 3600 ? "ok" : age < 24 * 3600 ? "idle" : "warn";
    const txt = k.note ? tr("The keeper can't act yet: its wallet isn't the vault's keeper") : k.at ? `${tr("Keeper ran")} ${ago(age)}` : tr("The keeper hasn't run yet");
    // the keeper's own log line is English: shown as it is, in English only
    const last = Array.isArray(k.last) && k.last.length && !(window.arcI18n && window.arcI18n.get() !== "en") ? ` · <span data-no-i18n>${esc(k.last[0])}</span>` : "";
    return `<p class="nft-keeper ${cls}" title="${T("The keeper claims fees, buys NFTs and runs the draws. Anyone can check every step on-chain.")}"><i aria-hidden="true"></i><span>${esc(txt)}</span>${last}</p>`;
  }
  function etaLine(st, nx) {
    const f = st.flow;
    if (!nx || !(nx.price > 0)) return f && f.perDay > 0 ? `<span class="nft-eta">${T("Fees in the last 7 days")}: <b data-no-i18n>${ethS(f.d7)}</b></span>` : "";
    const need = Math.max(0, nx.price - (st.balance || 0));
    if (need <= 0) return `<span class="nft-eta ok">${T("The vault can pay for the next NFT — the keeper buys it on its next run.")}</span>`;
    if (!f || !(f.perDay > 0)) return `<span class="nft-eta">${T("No fees in the last 7 days — the estimate shows once fees come in.")}</span>`;
    const d = need / f.perDay;
    return `<span class="nft-eta">${T("At the last 7 days' pace")} (<b data-no-i18n>${ethS(f.perDay)}</b> ${T("a day")}): <b data-no-i18n>≈ ${d < 1 ? "<1" : fmt(d, d < 10 ? 1 : 0)}</b> ${T(d < 1 ? "day" : "days")} ${T("to the next NFT")} <em>${T("(an estimate)")}</em></span>`;
  }
  function ring(p) {
    // the open raffle's challenge window as a ring: 6 hours from open to draw
    // the ring drains as the window runs out
    const r = p.raffle, t = nowS(), span = 6 * 3600, rest = Math.max(0, r.drawAfter - t), C = 2 * Math.PI * 42;
    return `<a class="nft-ring" href="#nft?prize=${p.i}" data-nft-jump="${p.i}" data-nft-ring="${r.drawAfter}"><span class="nft-ring-g"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="bg"/><circle cx="50" cy="50" r="42" class="fg" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${(C * (1 - Math.min(1, rest / span))).toFixed(1)}"/></svg><span class="nft-ring-img">${pic(p.image, p.collection, p.tokenId)}</span></span>
      <span class="nft-ring-t"><small>${T(rest > 0 ? "Draw in" : "Drawing")}</small><b data-no-i18n data-nft-until="${r.drawAfter}">${rest > 0 ? left(rest) : "…"}</b><span>${T("Raffle")} <span data-no-i18n>#${p.i} · ${esc(p.title || `${p.name || short(p.collection)} #${p.tokenId}`)}</span></span>${r.holders != null ? `<span><span data-no-i18n>${fmt(r.holders, 0)}</span> ${T("wallets in the draw")}</span>` : ""}</span></a>`;
  }
  function head() {
    const st = S.st || {}, nx = st.next;
    const pct = nx && nx.price > 0 ? Math.min(1, (st.balance || 0) / nx.price) : 0;
    const open = (st.prizes || []).find((p) => p.status === "open");
    const gw = S.first && !reduce() ? 0 : pct * 100;
    const side = open ? ring(open)
      : `<div class="nft-next"><div class="nft-next-img">${nx ? pic(nx.image, nx.collection, nx.tokenId) : `<span class="nft-ph breathe">${PIC}</span>`}</div><div class="nft-next-t"><small>${T("Next NFT")}</small>
        <b data-no-i18n>${nx ? esc((nx.title || nx.name || short(nx.collection)) + (nx.tokenId && !nx.title ? " #" + nx.tokenId : "")) : "—"}</b>
        <span>${nx ? (nx.cap ? T("Up to") + ` <b data-no-i18n>${ethS(nx.price)}</b>` : `<b data-no-i18n>${ethS(nx.price)}</b> · ${T("cheapest listing under the cap")}`) : T("Bought automatically when the vault can pay for it")}</span></div></div>`;
    const ch = (k, v, cls = "") => `<div class="nft-chip ${cls}"><small>${T(k)}</small><b data-no-i18n${typeof v === "number" ? ` data-nft-count="${v}"` : ""}>${typeof v === "number" ? (S.first && !reduce() ? "0" : fmt(v, 0)) : v}</b></div>`;
    return `<section class="nft-hd">
      <div class="nft-vault${live() && !(st.balance > 0) ? " empty" : ""}"><small>${T("NFT Vault")}</small><b data-nft-bal data-no-i18n data-v="${st.balance || 0}">${live() ? ethS(S.first && !reduce() ? 0 : st.balance) : "—"}</b>
        <div class="nft-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}"><i data-w="${(pct * 100).toFixed(1)}" style="width:${gw.toFixed(1)}%"></i></div>
        <span>${nx ? `<b data-no-i18n>${ethS(st.balance)} / ${ethS(nx.price)}</b> · <span data-no-i18n>${fmt(pct * 100, 1)}%</span> ${T(nx.cap ? "of the next NFT's price cap" : "of the next NFT")}` : T(live() ? "The first collection is being chosen — the vault fills meanwhile." : "Fills from trading fees once it's live")}</span>
        ${live() ? etaLine(st, nx) : ""}${keeperPill()}</div>
      ${side}
      <div class="nft-chipg"><span class="nft-chipg-k">${T("Money")}</span>${ch("Fees in", st.fees ? ethS(st.fees.total) : "—")}${ch("To the vault", st.fees ? ethS(st.fees.toVault) : "—")}${ch("To the treasury", st.fees ? ethS(st.fees.toTreasury) : "—")}</div>
      <div class="nft-chipg"><span class="nft-chipg-k">${T("NFTs")}</span>${ch("Bought", live() ? st.bought || 0 : "—")}${ch("Won", live() ? st.won || 0 : "—", "g")}${ch("In the draw", st.holders ? st.holders.count : "—")}</div></section>`;
  }

  // ---------------- view: where the vault is (six steps — also the empty state) ----------------
  function stepsCard() {
    const st = S.st || {}, t = nowS(), ps = st.prizes || [], cols = st.collections || [];
    const waiting = cols.filter((c) => c.listed && !c.active).sort((a, b) => a.activeAt - b.activeAt)[0];
    const S6 = [
      { k: "Fees come in", d: (st.fees && st.fees.total > 0) || (st.coins || []).length > 0, sub: (st.coins || []).length ? `${(st.coins || []).length} ${tr((st.coins || []).length === 1 ? "fee source" : "fee sources")}` : tr("from Pons coins that name the router") },
      { k: "The vault fills", d: (st.totalIn || 0) > 0 || (st.balance || 0) > 0, sub: live() ? ethS(st.balance) : "—" },
      { k: "A collection is listed", d: cols.some((c) => c.active), sub: waiting ? `${tr("buyable in")} <span data-no-i18n data-nft-until="${waiting.activeAt}">${left(waiting.activeAt - t)}</span>` : cols.length ? `${cols.filter((c) => c.active).length} ${tr("buyable")}` : tr("24h after listing") },
      { k: "An NFT is bought", d: (st.bought || 0) > 0 || ps.length > 0, sub: st.next && st.balance >= st.next.price ? tr("affordable now") : st.next ? `${fmt(Math.min(100, ((st.balance || 0) / (st.next.price || 1)) * 100), 0)}%` : "—" },
      { k: "Holder snapshot", d: ps.some((p) => p.status !== "held"), sub: ps.some((p) => p.status === "held") ? tr("being taken") : tr("Merkle root on-chain") },
      { k: "Drawn on-chain", d: (st.won || 0) > 0, sub: ps.some((p) => p.status === "open") ? tr("6h challenge window") : (st.won || 0) > 0 ? `${st.won} ${tr("won")}` : tr("commit → reveal") },
    ];
    const cur = S6.findIndex((x) => !x.d);
    const pct = cur < 0 ? 100 : (cur / (S6.length - 1)) * 100;
    return `<section class="ams-card nft-card nft-steps"><div class="nft-h"><h3>${T("Where the vault is")}</h3>${cur >= 0 ? `<span class="nft-tag">${T("Now")}: ${T(S6[cur].k)}</span>` : `<span class="nft-tag g">${T("Running")}</span>`}</div>
      <ol class="nft-st6" style="--p:${pct.toFixed(1)}%">${S6.map((x, i) => `<li class="${x.d ? "done" : i === cur ? "now" : ""}" style="--i:${i}"><span class="dot">${x.d ? ICON.ok : i + 1}</span><b>${T(x.k)}</b><small>${x.sub}</small></li>`).join("")}</ol></section>`;
  }

  // ---------------- view: the fee pipeline, sources, $ARCIA ----------------
  function spark(series, w = 220, h = 44) {
    if (!series || series.length < 2) return "";
    const xs = series.map((p) => p[0]), ys = series.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, y0 = Math.min(...ys, 0), y1 = Math.max(...ys) || 1;
    const pts = series.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * w, h - 4 - ((y - y0) / (y1 - y0 || 1)) * (h - 8)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    return `<svg class="nft-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d}L${w},${h}L0,${h}Z"/><path class="l" d="${d}"/></svg>`;
  }
  function flow() {
    const st = S.st || {}, coins = st.coins || [], f = st.flow, fee = st.fees || {};
    const moving = (fee.pending > 0) || (f && f.d7 > 0);
    const node = (cls, a, b) => `<div class="nft-node ${cls}"><b>${a}</b><small>${T(b)}</small></div>`;
    const src = coins.length ? coins.slice(0, 3).map((c) => `<a href="${EXPL("token", c.token)}" target="_blank" rel="noopener" data-no-i18n>$${esc(c.sym || short(c.token))}</a>`).join(" · ") : esc(tr("Pons coins"));
    const pend = fee.pending > 0
      ? `<div class="nft-pend"><span>${T("Waiting at the router")}: <b data-no-i18n>${ethS(fee.pending)}</b> → <b data-no-i18n>${ethS(fee.pending / 2)}</b> ${T("to the vault")} · <b data-no-i18n>${ethS(fee.pending / 2)}</b> ${T("to the treasury")}</span><button type="button" class="nft-btn sm go" data-nft-act="split"${st.router ? "" : " disabled"}>${T("Split it now")}</button></div>`
      : live() ? `<p class="nft-note sm">${T("Nothing is waiting at the router. Anyone can split it once fees come in — the keeper does it hourly.")}</p>` : "";
    const A = S.arcia && S.arcia.v, feeds = coins.some((c) => lc(c.token) === lc(ARCIA_RH));
    const arcia = `<div class="nft-flag"><span class="nft-flag-k">${T("Flagship token")}</span><div class="nft-flag-t"><b data-no-i18n>$ARCIA</b><span>${T("ARCIA's own coin on Robinhood Chain — the flagship of the ARCIRCLE NFT ecosystem.")}</span></div>
      <dl><div><dt>${T("Price")}</dt><dd data-no-i18n>${A && A.price != null ? usd(A.price) : "—"}</dd></div><div><dt>${T("Market cap")}</dt><dd data-no-i18n>${A && A.mcap != null ? usd(A.mcap) : "—"}</dd></div><div><dt>${T("Holders")}</dt><dd data-no-i18n>${A && A.holders != null ? fmt(A.holders, 0) : "—"}</dd></div></dl>
      <div class="nft-flag-a"><a class="nft-btn sm" href="${esc(ARCIA_BUY)}" target="_blank" rel="noopener">${T("$ARCIA on Pons")} ↗</a><button type="button" class="nft-btn sm ghost" data-nft-copy="${esc(ARCIA_RH)}" data-no-i18n>${short(ARCIA_RH)}</button></div>
      <small>${T(feeds ? "Its creator fees feed this vault." : "Fee sources are listed above as they join.")}</small></div>`;
    return `<section class="ams-card nft-card nft-flowc"><div class="nft-h"><h3>${T("Where the ETH comes from")}</h3>${f && f.total > 0 ? `<span class="nft-tag">${T("7 days")}: <b data-no-i18n>${ethS(f.d7)}</b></span>` : ""}</div>
      <div class="nft-pipe${moving && !reduce() ? " moving" : ""}">
        ${node("src", src, "trade on Pons")}<i class="nft-wire" aria-hidden="true"></i>
        ${node("fee", esc(tr("Creator fees")), "fixed at launch")}<i class="nft-wire" aria-hidden="true"></i>
        <div class="nft-node split"><b>${T("Router")}</b><small>${T("50 / 50")}</small><span class="nft-fork"><em class="v">${T("NFT Vault")}</em><em class="t">${T("Treasury")}</em></span></div><i class="nft-wire" aria-hidden="true"></i>
        ${node("vault", esc(tr("NFT Vault")), "buys an NFT")}<i class="nft-wire" aria-hidden="true"></i>
        ${node("raffle", esc(tr("Raffle")), "on-chain draw")}<i class="nft-wire" aria-hidden="true"></i>
        ${node("win", "$ARCIRCLE", "a holder wins it")}
      </div>
      ${f && f.series && f.series.length > 1 ? `<div class="nft-flowline"><span>${T("ETH into the vault, all time")}: <b data-no-i18n>${ethS(f.total)}</b></span>${spark(f.series)}</div>` : ""}
      ${pend}
      <p class="nft-msg ${S.msg.split ? S.msg.split.cls : ""}" aria-live="polite">${S.msg.split ? S.msg.split.h : ""}</p>
      ${arcia}</section>`;
  }

  // ---------------- view: your odds + the what-if calculator ----------------
  function chanceOf(w, total) { return total > 0 ? (w / total) * 100 : null; }
  function calcHtml(base) {
    const st = S.st || {}, H = st.holders, total = H && H.total ? Number(BigInt(H.total) / 10n ** 14n) / 1e4 : 0;
    const amt = Number(S.calc.amt) || 0, mult = S.calc.mode === "max" ? 2 : 1, add = amt * mult;
    const w0 = base ? base.weight : 0, inBase = !!(base && base.inList);
    const w = w0 + add, eligible = (base ? (base.held || 0) + (base.locked || 0) : 0) + amt >= 1000;
    const tot = total + (inBase ? add : w);
    const c = eligible && tot > 0 ? chanceOf(w, tot) : null;
    const slider = Math.round(amt > 0 ? Math.log10(Math.max(1000, amt)) * 100 : 300);
    return `<div class="nft-calc"><div class="nft-calc-h"><b>${T(base && base.inList ? "What if I add more?" : "Odds calculator")}</b><small>${T("An estimate against the latest holder list")}</small></div>
      <label class="nft-f"><small>${T(base && base.inList ? "Extra $ARCIRCLE" : "$ARCIRCLE you hold or lock")}</small><span class="nft-in"><input id="nft-calc-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="10000" value="${esc(S.calc.amt)}"><em data-no-i18n>$ARCIRCLE</em></span></label>
      <input id="nft-calc-r" class="nft-range" type="range" min="300" max="800" step="1" value="${slider}" aria-label="${T("Amount")}">
      <div class="nft-seg" role="radiogroup" aria-label="${T("How you hold it")}">${[["hold", "Hold"], ["max", "Max lock in Staking (×2)"]].map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.calc.mode === k}" class="${S.calc.mode === k ? "on" : ""}" data-nft-mode="${k}">${T(l)}</button>`).join("")}</div>
      <div class="nft-calc-out"><div><small>${T("Weight")}</small><b data-no-i18n>${big(w)}</b></div><div><small>${T("Chance per NFT")}</small><b data-no-i18n class="${c != null ? "hl" : ""}">${c == null ? "—" : fmt(c, c < 1 ? 3 : 2) + "%"}</b></div></div>
      <p class="nft-note sm">${!eligible && amt > 0 ? T("Below 1,000 $ARCIRCLE (held plus locked) a wallet isn't in the list.") : total > 0 ? `${T("Against")} <span data-no-i18n>${big(total)}</span> ${T("total weight in the latest list — other wallets move too, so it's a guide, not a promise.")}` : T("The odds show once the keeper builds the first holder list.")}</p></div>`;
  }
  function oddsCard() {
    const m = S.me;
    let h = `<section class="ams-card nft-card nft-odds"><h3>${T("Your odds")}</h3>`;
    if (!me()) return h + `<p class="nft-note">${T("Connect the wallet that holds your $ARCIRCLE on Arc to see your weight in the draw — or try the calculator.")}</p><button type="button" class="nft-btn go" data-nft-act="connect">${T("Connect wallet")}</button>${live() ? calcHtml(null) : ""}</section>`;
    if (!live()) return h + `<p class="nft-note">${T("Your odds show up here once the vault is live.")}</p></section>`;
    if (!m || !m.list) return h + `<p class="nft-note">${T("The first holder list is being built — check back shortly.")}</p>${calcHtml(null)}</section>`;
    if (!m.inList) h += `<div class="nft-out"><b>${T("Not in the draw yet")}</b><span>${T("Hold or lock at least")} <b data-no-i18n>${fmt(m.minHold || 1000, 0)} $ARCIRCLE</b> ${T("in this wallet to be in the next list.")}</span></div>`;
    else {
      const parts = [["Held", m.held], ["Locked in Staking", m.locked], ["veARCIRCLE boost", m.ve]];
      const tot = m.weight || 1;
      h += `<div class="nft-chance"><div><small>${T("Chance per NFT")}</small><b data-no-i18n>${fmt(m.chance, m.chance < 1 ? 3 : 2)}%</b></div><div><small>${T("Your weight")}</small><b data-no-i18n>${big(m.weight)}</b></div></div>
        <div class="nft-wbar">${parts.map(([, v], i) => `<i class="p${i}" style="flex:${Math.max(0, v)}"></i>`).join("")}</div>
        <ul class="nft-wleg">${parts.map(([k, v], i) => `<li><i class="p${i}"></i><span>${T(k)}</span><b data-no-i18n>${big(v)}</b><em data-no-i18n>${fmt((v / tot) * 100, 0)}%</em></li>`).join("")}</ul>`;
    }
    h += calcHtml(m);
    h += `<p class="nft-note">${T("Locking in ARCIRCLE Staking counts your $ARCIRCLE and adds your veARCIRCLE on top — a max lock counts double.")} <a href="/arc#staking" data-arc-tab="staking">${T("ARCIRCLE Staking")} →</a></p>`;
    h += `<p class="nft-note sm">${T("List")}: <span data-no-i18n>${esc(m.list)}</span> · ${T("Arc block")} <span data-no-i18n>${fmt(m.block, 0)}</span> · <span data-no-i18n>${fmt(m.count, 0)}</span> ${T("wallets")}</p>`;
    return h + "</section>";
  }

  // ---------------- view: raffles, each with its on-chain timeline ----------------
  function statusOf(p) {
    const r = p.raffle, t = nowS();
    if (p.status === "won") return [`${T("Won by")} <a href="${EXPL("address", r.winner)}" target="_blank" rel="noopener" data-no-i18n data-nft-winner="${esc(r.winner)}">${short(r.winner)}${lc(r.winner) === me() ? ` (${esc(tr("you"))})` : ""}</a>`, "won"];
    if (p.status === "drawn") return [T("Drawn — sending it to the winner"), "drawn"];
    if (p.status === "open") return r.drawAfter > t ? [`${T("Draw in")} <b data-no-i18n data-nft-until="${r.drawAfter}">${left(r.drawAfter - t)}</b>`, "open"] : [T("Drawing…"), "drawing"];
    return [T("Holder snapshot next"), "held"];
  }
  function timeline(p) {
    const E = evs().filter((e) => e.prize === p.i).slice().reverse(); // oldest first
    const at = (k) => E.filter((e) => e.k === k);
    const r = p.raffle || {}, t = nowS();
    const tx = (e) => (e && e.tx ? `<a href="${EXPL("tx", e.tx)}" target="_blank" rel="noopener" data-no-i18n>${short(e.tx)} ↗</a>` : "");
    const when = (e) => (e && e.ts ? `<time data-no-i18n>${esc(day(e.ts))}</time>` : "");
    const bought = at("bought")[0] || at("donated")[0], opened = at("opened").slice(-1)[0], commits = at("committed"), drawn = at("drawn").slice(-1)[0], won = at("won")[0];
    const challengeDone = r.drawAfter && t >= r.drawAfter;
    const rows = [
      { k: p.donated ? "Donated to the vault" : "Bought", d: !!bought || p.status !== "none", body: p.donated ? "" : `<b data-no-i18n>${ethS(p.paid)}</b>`, e: bought },
      { k: "Holder snapshot · Merkle root on-chain", d: !!opened || !!r.root, body: r.root || (opened && opened.root) ? `<code data-no-i18n title="${esc(r.root || opened.root)}">${short(r.root || opened.root)}</code>${r.holders != null ? ` · <span data-no-i18n>${fmt(r.holders, 0)}</span> ${T("wallets")}` : ""}` : "", e: opened },
      { k: "6-hour challenge window", d: !!challengeDone && p.status !== "held", now: p.status === "open" && !challengeDone, body: r.drawAfter ? (challengeDone ? T("closed — anyone could check the list") : `${T("ends in")} <b data-no-i18n data-nft-until="${r.drawAfter}">${left(r.drawAfter - t)}</b>`) : "" },
      { k: "Commit", d: commits.length > 0 || p.status === "drawn" || p.status === "won", body: commits.length ? `${T("attempts")} <span data-no-i18n>${commits.length}</span>` : "", e: commits.slice(-1)[0] },
      { k: "Reveal · ticket drawn", d: !!drawn || p.status === "drawn" || p.status === "won", body: drawn ? `${T("drawn ticket")} <b data-no-i18n>#${esc(drawn.ticket)}</b>${drawn.forced ? ` · ${T("forced after a week")}` : ""}` : r.ticket != null ? `${T("drawn ticket")} <b data-no-i18n>#${esc(r.ticket)}</b>` : "", e: drawn },
      { k: "Sent to the winner", d: p.status === "won", body: p.status === "won" ? `<span data-no-i18n>${short(r.winner)}</span>` : "", e: won },
    ];
    const cur = rows.findIndex((x) => !x.d);
    return `<ol class="nft-tl">${rows.map((x, i) => `<li class="${x.d ? "done" : i === cur || x.now ? "now" : ""}"><span class="dot" aria-hidden="true"></span><div><b>${T(x.k)}</b>${x.body ? `<span>${x.body}</span>` : ""}<span class="m">${when(x.e)}${x.e && x.e.tx ? " · " + tx(x.e) : ""}</span></div></li>`).join("")}</ol>`;
  }
  function ticketHtml(p) {
    const k = S.tickets[p.i];
    const listUrl = `${API}?nft=list&prize=${p.i}`;
    const acts = `<div class="nft-pact">${p.raffle ? `<button type="button" class="nft-btn sm" data-nft-ticket="${p.i}">${ICON.lock}${T("Check my ticket")}</button><a class="nft-btn sm ghost" href="${listUrl}" target="_blank" rel="noopener" download="arcircle-nft-raffle-${p.i}.json">${ICON.dl}${T("The list (JSON)")}</a>` : ""}<button type="button" class="nft-btn sm ghost" data-nft-share="${p.i}">${ICON.share}${T("Share")}</button></div>`;
    if (!k) return acts;
    if (k.busy) return acts + `<p class="nft-tk">${T("Checking your proof…")}</p>`;
    if (k.err) return acts + `<p class="nft-tk err">${esc(k.err)}</p>`;
    if (!k.in) return acts + `<p class="nft-tk">${T("This wallet isn't in this raffle's list.")}</p>`;
    const span = BigInt(k.end) - BigInt(k.start), pctv = k.total ? Number((span * 1000000n) / BigInt(k.total)) / 1e4 : 0;
    return acts + `<div class="nft-tk ${k.ok ? "ok" : "err"}"><b>${k.ok ? ICON.ok + esc(tr("Your proof checks out against the root on-chain")) : esc(tr("The proof doesn't match the root — tell the team"))}</b>
      <span>${T("Tickets")} <code data-no-i18n>${esc(fmt(Number(BigInt(k.start) / 10n ** 14n) / 1e4, 0))} – ${esc(fmt(Number(BigInt(k.end) / 10n ** 14n) / 1e4, 0))}</code> / <code data-no-i18n>${esc(fmt(Number(BigInt(k.total) / 10n ** 14n) / 1e4, 0))}</code> · <span data-no-i18n>${fmt(pctv, pctv < 1 ? 3 : 2)}%</span>${k.won ? ` · <b class="g">${T("the drawn ticket is yours")}</b>` : ""}</span></div>`;
  }
  function prizeHtml(p) {
    const [stt, cls] = statusOf(p);
    const seen = loadSeen().p || {}, was = seen[p.i];
    const changed = S.seen && S.seen.at && was !== undefined && was !== p.status;
    const fresh = S.seen && S.seen.at && was === undefined;
    const openD = S.open.has(p.i) || (p.status === "open" && !S.open.has("x" + p.i));
    return `<article class="nft-prize ${cls}${changed ? " changed" : ""}" id="nft-prize-${p.i}" data-prize="${p.i}">
      <div class="nft-pimg nft-tilt">${pic(p.image, p.collection, p.tokenId)}<em data-no-i18n>#${p.i}</em>${fresh ? `<span class="nft-newb">${T("New")}</span>` : changed ? `<span class="nft-newb was">${T(`was ${was}`)}</span>` : ""}</div>
      <div class="nft-pt"><b data-no-i18n>${esc(p.title || `${p.name || short(p.collection)} #${p.tokenId}`)}</b>
        <span>${p.donated ? T("Donated") : `${T("Bought for")} <b data-no-i18n>${ethS(p.paid)}</b>`} · <a class="nft-pl" href="${EXPL("token", p.collection)}" target="_blank" rel="noopener" data-no-i18n>${short(p.collection)} ↗</a></span>
        <span class="nft-st ${cls}">${stt}</span>
        ${p.raffle ? `<span class="nft-pl">${p.raffle.holders != null ? `<span data-no-i18n>${fmt(p.raffle.holders, 0)}</span> ${T("wallets")} · ` : ""}${T("attempts")} <span data-no-i18n>${p.raffle.attempts}</span></span>` : ""}
      </div>
      <details class="nft-fair" data-fair="${p.i}"${openD ? " open" : ""}><summary>${T("How this draw ran")}<small>${T("every step on-chain")}</small></summary>${timeline(p)}${ticketHtml(p)}</details></article>`;
  }
  function rafflesCard() {
    const ps = ((S.st && S.st.prizes) || []).slice();
    const order = { open: 0, drawing: 0, drawn: 1, held: 2, won: 3 };
    ps.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || b.i - a.i);
    let h = `<section class="ams-card nft-card nft-raf"><div class="nft-h"><h3>${T("Raffles")}</h3>${ps.length ? `<span class="nft-tag">${ps.length}</span>` : ""}</div>`;
    if (!ps.length) return h + `<div class="nft-empty"><span class="nft-ph breathe">${PIC}</span><span>${T("No NFT yet. The first one is bought when the vault can pay for it, and its raffle opens right after.")}</span></div>
      <ul class="nft-howto"><li><b>${T("Snapshot")}</b><span>${T("Every $ARCIRCLE wallet with 1,000+ held or locked gets tickets by weight.")}</span></li><li><b>${T("6 hours")}</b><span>${T("The list's Merkle root sits on-chain so anyone can check it.")}</span></li><li><b>${T("Commit → reveal")}</b><span>${T("A secret plus the next block's hash picks the ticket — nobody can steer it.")}</span></li></ul></section>`;
    return h + `<div class="nft-prizes">${ps.map(prizeHtml).join("")}</div></section>`;
  }
  function wonBanner() {
    const u = me(), ps = (S.st && S.st.prizes) || [];
    const mine = u ? ps.filter((p) => p.status === "won" && p.raffle && lc(p.raffle.winner) === u) : [];
    if (!mine.length) return "";
    const p = mine[0];
    return `<section class="nft-youwon"><div class="nft-youwon-img nft-tilt">${pic(p.image, p.collection, p.tokenId)}</div><div><small>${T("You won")}</small><b data-no-i18n>${esc(p.title || `${p.name || "NFT"} #${p.tokenId}`)}</b>
      <span>${T("It's already in your wallet on Robinhood Chain — the same address that holds your $ARCIRCLE on Arc.")}</span>
      <div class="nft-row"><a class="nft-btn sm go" href="${EXPL("token", p.collection)}/instance/${esc(p.tokenId)}" target="_blank" rel="noopener">${T("See it on the explorer")} ↗</a><button type="button" class="nft-btn sm" data-nft-share="${p.i}">${ICON.share}${T("Share")}</button></div></div></section>`;
  }
  function gallery() {
    const ps = ((S.st && S.st.prizes) || []).filter((p) => p.status === "won");
    if (!ps.length) return "";
    const wonAt = (i) => { const e = evs().find((x) => x.k === "won" && x.prize === i); return e ? e.ts : 0; };
    return `<section class="ams-card nft-card nft-gal"><div class="nft-h"><h3>${T("Winners")}</h3><span class="nft-tag g">${ps.length}</span></div>
      <div class="nft-galg">${ps.map((p) => `<a class="nft-gi nft-tilt" href="${SITE}/nft/${p.i}" target="_blank" rel="noopener"><span class="nft-gi-img">${pic(p.image, p.collection, p.tokenId)}</span>
        <b data-no-i18n>${esc(p.title || `${p.name || short(p.collection)} #${p.tokenId}`)}</b><span data-no-i18n>${short(p.raffle && p.raffle.winner)}${lc(p.raffle && p.raffle.winner) === me() ? ` · ${esc(tr("you"))}` : ""}</span><small data-no-i18n>${p.donated ? "" : ethS(p.paid)}${wonAt(p.i) ? " · " + esc(day(wonAt(p.i))) : ""}</small></a>`).join("")}</div></section>`;
  }

  // ---------------- view: collections, activity, curator ----------------
  function collectionsCard() {
    const st = S.st || {}, cs = st.collections || [], t = nowS(), fl = st.floors || {};
    let h = `<section class="ams-card nft-card nft-cols"><h3>${T("Collections the vault buys")}</h3>`;
    if (!cs.length) h += `<p class="nft-note">${T("None listed yet. A collection becomes buyable 24 hours after it's listed, so everyone sees it first.")}</p>`;
    else h += `<ul class="nft-cl">${cs.map((c) => {
      const under = c.floor != null && c.floor <= c.maxPrice, afford = c.floor != null && (st.balance || 0) >= c.floor;
      const badge = !c.listed ? ["off", "Removed"] : !c.active ? ["wait", "Cooling"] : c.floor == null ? ["on", "Buyable"] : under ? ["on", afford ? "Buyable now" : "Buyable"] : ["warn", "Floor above the cap"];
      return `<li class="${badge[0]}">${art(c.address, "")}<div class="nft-cl-t"><b data-no-i18n>${esc(c.name || short(c.address))}</b><a href="${EXPL("token", c.address)}" target="_blank" rel="noopener" data-no-i18n>${short(c.address)} ↗</a></div>
        <div class="nft-cl-n"><span>${T("Cap")} <b data-no-i18n>${ethS(c.maxPrice)}</b></span>${c.floor != null ? `<span>${T("Floor")} <b data-no-i18n>${ethS(c.floor)}</b></span>` : ""}</div>
        ${fl[c.address] && fl[c.address].length > 1 ? spark(fl[c.address], 90, 28) : "<span></span>"}
        <em>${!c.active && c.listed ? `${T("Buyable in")} <span data-no-i18n data-nft-until="${c.activeAt}">${left(c.activeAt - t)}</span>` : T(badge[1])}</em></li>`;
    }).join("")}</ul>`;
    if (st.vault) h += `<p class="nft-note sm">${T("Vault")} <a href="${EXPL("address", st.vault)}" target="_blank" rel="noopener" data-no-i18n>${short(st.vault)} ↗</a>${st.router ? ` · ${T("Router")} <a href="${EXPL("address", st.router)}" target="_blank" rel="noopener" data-no-i18n>${short(st.router)} ↗</a>` : ""} · ${T("Robinhood Chain")}</p>`;
    return h + "</section>";
  }
  const EVT = { funded: "ETH in", listed: "Collection listed", capLowered: "Cap lowered", removed: "Collection removed", keeper: "Keeper named", curator: "Curator named", bought: "NFT bought", donated: "NFT donated", opened: "Raffle opened", cancelled: "Raffle cancelled", committed: "Draw committed", drawn: "Ticket drawn", won: "Won" };
  function activityCard() {
    const E = evs().slice(0, 12);
    let h = `<section class="ams-card nft-card nft-act"><h3>${T("Latest on-chain")}</h3>`;
    if (!live()) return "";
    if (!E.length) return h + `<p class="nft-note">${S.st.log ? T("Nothing has happened in the vault yet — the first fees show up here.") : T("The vault's history couldn't be read right now.")}</p></section>`;
    return h + `<ul class="nft-ev">${E.map((e) => {
      const what = e.k === "funded" ? `<b data-no-i18n>+${ethS(e.eth)}</b>` : e.k === "bought" ? `<span data-no-i18n>#${esc(e.id)} · ${ethS(e.eth)}</span>` : e.k === "won" ? `<span data-no-i18n>#${e.prize} → ${short(e.a)}</span>` : e.prize != null ? `<span data-no-i18n>#${e.prize}</span>` : e.c ? `<span data-no-i18n>${short(e.c)}${e.cap != null ? " · " + ethS(e.cap) : ""}</span>` : e.a ? `<span data-no-i18n>${short(e.a)}</span>` : "";
      return `<li class="k-${e.k}"><i aria-hidden="true"></i><span>${T(EVT[e.k] || e.k)}</span>${what}<a href="${EXPL("tx", e.tx)}" target="_blank" rel="noopener" data-no-i18n>${e.ts ? esc(ago(nowS() - e.ts)) : short(e.tx)} ↗</a></li>`;
    }).join("")}</ul></section>`;
  }
  function curatorCard() {
    const st = S.st;
    if (!live() || !me() || lc(st.curator) !== me()) return "";
    const f = S.f, keeperHint = st.serverKeeper && lc(st.serverKeeper) !== lc(st.keeper) ? st.serverKeeper : "";
    const c = S.col, cap = Number(f.cap) || 0;
    const chk = !isAddr(f.col) ? "" : !c || c.addr !== lc(f.col) ? `<p class="nft-chk">${T("Checking the collection…")}</p>` : c.err ? `<p class="nft-chk err">${esc(c.err)}</p>`
      : `<div class="nft-chk ${c.v.contract && c.v.erc721 ? "ok" : "err"}"><b data-no-i18n>${esc(c.v.name || short(c.v.address))}${c.v.symbol ? " · " + esc(c.v.symbol) : ""}</b>
        <span>${c.v.contract ? (c.v.erc721 ? `${ICON.ok}${T("ERC-721 on Robinhood Chain")}` : T("Not an ERC-721 — the vault can't buy it")) : T("No contract at this address on Robinhood Chain")}</span>
        ${c.v.floor != null ? `<span>${T("Floor")} <b data-no-i18n>${ethS(c.v.floor)}</b>${cap > 0 ? ` · ${T(c.v.floor <= cap ? "under your cap" : "above your cap")}` : ""}${c.v.listings != null ? ` · <span data-no-i18n>${c.v.listings}</span> ${T("listings")}` : ""}</span>` : `<span>${T(c.v.opensea ? "No OpenSea listings right now" : "Floor unknown (no OpenSea key on the server)")}</span>`}
        ${c.v.vault && c.v.vault.listed ? `<span>${T("Already listed")} · ${T("Cap")} <b data-no-i18n>${ethS(c.v.vault.maxPrice)}</b></span>` : ""}</div>`;
    const hist = evs().filter((e) => ["listed", "capLowered", "removed", "keeper", "curator"].includes(e.k)).slice(0, 6);
    return `<section class="ams-card nft-card nft-cur"><h3>${T("Curator")}</h3>
      <p class="nft-note">${T("Only this wallet sees this. Listing a collection (or raising its cap) takes 24 hours to apply; lowering a cap or removing one applies at once.")}</p>
      <label class="nft-f"><small>${T("Collection address")}</small><input id="nft-col" type="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${esc(f.col)}"></label>
      ${chk}
      <label class="nft-f"><small>${T("Price cap")}</small><span class="nft-in"><input id="nft-cap" type="text" inputmode="decimal" autocomplete="off" placeholder="0.05" value="${esc(f.cap)}"><em data-no-i18n>ETH</em></span></label>
      <div class="nft-row"><button type="button" class="nft-btn go" data-nft-act="propose">${T("List / raise cap")}</button><button type="button" class="nft-btn" data-nft-act="lower">${T("Lower cap")}</button><button type="button" class="nft-btn" data-nft-act="remove">${T("Remove")}</button></div>
      <label class="nft-f"><small>${T("Keeper")} · ${T("now")} <span data-no-i18n>${short(st.keeper)}</span></small><input id="nft-keeper" type="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${esc(f.keeper || keeperHint)}"></label>
      ${keeperHint ? `<p class="nft-note sm">${T("The server's keeper wallet is")} <span data-no-i18n>${short(keeperHint)}</span> — ${T("name it so the raffles run on their own.")}</p>` : ""}
      <button type="button" class="nft-btn" data-nft-act="keeper">${T("Set keeper")}</button>
      <p class="nft-msg ${S.msg.cur ? S.msg.cur.cls : ""}" aria-live="polite">${S.msg.cur ? S.msg.cur.h : ""}</p>
      ${hist.length ? `<div class="nft-hist"><small>${T("History")}</small><ul class="nft-ev">${hist.map((e) => `<li class="k-${e.k}"><i aria-hidden="true"></i><span>${T(EVT[e.k])}</span><span data-no-i18n>${short(e.c || e.a)}${e.cap != null ? " · " + ethS(e.cap) : ""}</span><a href="${EXPL("tx", e.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(day(e.ts))} ↗</a></li>`).join("")}</ul></div>` : ""}</section>`;
  }
  function render() {
    if (!body) return;
    const ae = document.activeElement, focus = ae && ae.id && body.contains(ae) ? { id: ae.id, s: ae.selectionStart } : null;
    const pre = !S.loaded ? `<div class="nft-empty"><span class="nft-ph breathe">${PIC}</span><span>${T("Reading the vault on Robinhood Chain…")}</span></div>` : !live() ? `<div class="nft-soon"><b>${T("Opens soon")}</b><span>${T("The NFT Vault contracts are being deployed on Robinhood Chain. Everything below shows how it will work.")}</span></div>` : "";
    body.classList.toggle("intro", S.first && S.loaded);
    body.innerHTML = `${pre}${wonBanner()}${head()}${stepsCard()}${flow()}<div class="nft-grid">${oddsCard()}${rafflesCard()}</div>${gallery()}<div class="nft-grid g2">${collectionsCard()}${activityCard()}</div>${curatorCard()}`;
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { if (el.type !== "range") el.setSelectionRange(focus.s, focus.s); } catch { /* fine */ } } }
    if (S.loaded && live()) afterPaint();
  }
  // one-time motion after the first paint: the gauge fills, the numbers count up; then the winner reveal
  function afterPaint() {
    if (S.first) {
      S.first = false;
      setTimeout(() => body.classList.remove("intro"), 1600); // entrance motion plays once, not on every refresh
      if (!reduce()) {
        requestAnimationFrame(() => {
          body.querySelectorAll(".nft-gauge i[data-w]").forEach((i) => { i.style.width = i.dataset.w + "%"; });
          countUp(body.querySelector("[data-nft-bal]"), Number((S.st || {}).balance || 0), (v) => ethS(v));
          body.querySelectorAll("[data-nft-count]").forEach((el) => countUp(el, Number(el.dataset.nftCount), (v) => fmt(Math.round(v), 0)));
        });
      }
      jumpToPrize();
    }
    revealWinners();
    saveSeen();
  }
  function countUp(el, to, f) {
    if (!el) return;
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = f(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function jumpToPrize() {
    const m = /[?&]prize=(\d+)/.exec(location.hash || "");
    if (!m) return;
    const el = $("nft-prize-" + m[1]);
    if (!el) return;
    S.open.add(Number(m[1]));
    const d = el.querySelector("details"); if (d) d.open = true;
    setTimeout(() => { el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" }); el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2400); }, 250);
  }
  // a prize that turned "won" since your last visit (or in the last day on a first visit): the address rolls, then lands
  function revealWinners() {
    const seen = (S.seen && S.seen.p) || {}, first = !(S.seen && S.seen.at);
    const recent = (i) => { const e = evs().find((x) => x.k === "won" && x.prize === i); return e && e.ts && nowS() - e.ts < 86400; };
    ((S.st && S.st.prizes) || []).filter((p) => p.status === "won" && !S.reveal.has(p.i) && (first ? recent(p.i) : seen[p.i] !== undefined && seen[p.i] !== "won")).forEach((p) => {
      S.reveal.add(p.i);
      const a = body.querySelector(`#nft-prize-${p.i} [data-nft-winner]`);
      if (!a) return;
      const mine = lc(p.raffle.winner) === me();
      if (reduce()) { if (mine) confetti(); return; }
      const fin = a.textContent, hex = "0123456789abcdef";
      a.classList.add("rolling");
      let n = 0;
      const iv = setInterval(() => {
        a.textContent = "0x" + Array.from({ length: 4 }, () => hex[Math.floor(Math.random() * 16)]).join("") + "…" + Array.from({ length: 4 }, () => hex[Math.floor(Math.random() * 16)]).join("");
        if (++n > 18) { clearInterval(iv); a.textContent = fin; a.classList.remove("rolling"); a.classList.add("landed"); if (mine) confetti(); }
      }, 70);
    });
  }
  function confetti() {
    if (reduce()) return;
    const box = document.createElement("div");
    box.className = "nft-confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["#ff8bd8", "#b58bff", "#4dd4ff", "#39ff88", "#ffd36b"];
    box.innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}vw;--d:${(0.9 + Math.random() * 1.4).toFixed(2)}s;--r:${Math.floor(Math.random() * 720 - 360)}deg;--c:${cols[i % cols.length]};--w:${(Math.random() * 30 - 15).toFixed(1)}vw"></i>`).join("");
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2800);
  }
  function grew(prev) {
    if (prev == null || !S.st || !(S.st.balance > prev + 1e-9) || reduce()) return;
    const box = body.querySelector(".nft-vault");
    if (box) { box.classList.add("grew"); setTimeout(() => box.classList.remove("grew"), 1600); }
  }
  function tickClocks() {
    const t = nowS();
    body.querySelectorAll("[data-nft-until]").forEach((el) => { el.textContent = left(Number(el.dataset.nftUntil) - t); });
    body.querySelectorAll("[data-nft-ring]").forEach((el) => {
      const end = Number(el.dataset.nftRing), rest = Math.max(0, end - t), C = 2 * Math.PI * 42, fg = el.querySelector(".fg");
      if (fg) fg.style.strokeDashoffset = (C * (1 - Math.min(1, rest / (6 * 3600)))).toFixed(1);
    });
  }

  // ---------------- check my ticket: the proof, verified here ----------------
  const leafOf = (a, s, e) => ethers.keccak256(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [a, s, e])));
  const pairOf = (x, y) => (BigInt(x) < BigInt(y) ? ethers.keccak256(ethers.concat([x, y])) : ethers.keccak256(ethers.concat([y, x])));
  function verify(proof, root, a, s, e) { let h = leafOf(a, s, e); for (const p of proof) h = pairOf(h, p); return BigInt(h) === BigInt(root); }
  async function checkTicket(i) {
    const u = me();
    if (!u) { if (typeof connectWallet === "function") { try { await connectWallet(); } catch { /* closed */ } } if (!me()) return; }
    const p = ((S.st && S.st.prizes) || []).find((x) => x.i === i);
    if (!p || !p.raffle) return;
    S.tickets[i] = { busy: true }; S.open.add(i); render();
    try {
      const r = await fetch(`${API}?nft=list&prize=${i}&u=${me()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j) throw new Error(tr("This raffle's list isn't available yet."));
      if (!j.proof) { S.tickets[i] = { in: false }; render(); return; }
      const root = p.raffle.root;
      const ok = verify(j.proof.proof, root, me(), j.proof.start, j.proof.end) && BigInt(j.root) === BigInt(root);
      const tk = p.raffle.ticket != null ? BigInt(p.raffle.ticket) : null;
      S.tickets[i] = { in: true, ok, start: j.proof.start, end: j.proof.end, total: j.total, won: tk != null && tk >= BigInt(j.proof.start) && tk < BigInt(j.proof.end) };
    } catch (e) { S.tickets[i] = { err: String((e && e.message) || e).slice(0, 160) }; }
    render();
  }
  function share(i) {
    const p = ((S.st && S.st.prizes) || []).find((x) => x.i === i);
    const url = `${SITE}/nft/${i}`;
    const mine = p && p.raffle && lc(p.raffle.winner) === me();
    const text = !p ? "ARCIRCLE NFT Vault" : mine ? `I won ${p.title || `${p.name || "an NFT"} #${p.tokenId}`} in the ARCIRCLE NFT Vault raffle — trading fees bought it, $ARCIRCLE holders drew it on-chain.` : p.status === "open" ? `ARCIRCLE NFT Vault raffle #${i} is open — every $ARCIRCLE holder with 1,000+ is in it.` : `ARCIRCLE NFT Vault raffle #${i}: ${p.title || `${p.name || "NFT"} #${p.tokenId}`}`;
    const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    if (navigator.share && window.matchMedia && matchMedia("(max-width: 700px)").matches) { navigator.share({ title: "ARCIRCLE NFT Vault", text, url }).catch(() => {}); return; }
    window.open(x, "_blank", "noopener");
  }

  // ---------------- writes (Robinhood Chain) ----------------
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  function holdChain(on) { if (on) { clearTimeout(holdChain.t); window.arcChainSwitching = true; } else holdChain.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000); }
  async function rhSigner() {
    if ((typeof state === "undefined" || !state.account) && typeof connectWallet === "function") await connectWallet();
    if (!me()) throw new Error(tr("Connect a wallet first."));
    let done = false;
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try { const acc = WagmiCoreRef.getAccount(wagmiConfigRef); if (acc && acc.isConnected) { if (Number(acc.chainId) !== CHAIN) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CHAIN, addEthereumChainParameter: ADD }); done = true; } } catch (e) { if (rejected(e)) throw e; }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
    if (!done && Number.parseInt(await p.request({ method: "eth_chainId" }), 16) !== CHAIN) {
      try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
      catch (e) { if (rejected(e)) throw e; await p.request({ method: "wallet_addEthereumChain", params: [ADD] }); await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }).catch(() => {}); }
    }
    const bp = new ethers.BrowserProvider(p, "any");
    for (let i = 0; i < 6; i++) { if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me()); await new Promise((r) => setTimeout(r, 500)); }
    throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
  }
  const errText = (e) => {
    if (rejected(e)) return tr("Cancelled in your wallet.");
    const s = String((e && e.revert && e.revert.name) || (e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NotCurator: "Only the curator's wallet can do that.", NotAllowed: "That collection isn't listed (or the new cap isn't lower).", ZeroAddress: "Enter an address.", insufficient: "Not enough ETH on Robinhood Chain for gas." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const say = (k, h, cls = "") => { S.msg[k] = { h, cls }; const el = body.querySelector(k === "split" ? ".nft-flowc .nft-msg" : ".nft-cur .nft-msg"); if (el) { el.className = "nft-msg " + cls; el.innerHTML = h; } };
  async function run(k, fn, btn) {
    if (S.busy) return;
    S.busy = true;
    holdChain(true);
    if (btn) btn.classList.add("busy");
    try {
      const sg = await rhSigner();
      say(k, T("Confirm in your wallet…"));
      const tx = await fn(sg);
      say(k, T("Confirming…"));
      await tx.wait();
      say(k, `${T("Done")} · <a href="${EXPL("tx", tx.hash)}" target="_blank" rel="noopener" data-no-i18n>${short(tx.hash)} ↗</a>`, "ok");
      await refresh();
      if (k === "split" && !reduce()) { const g = body.querySelectorAll(".nft-chipg .nft-chip"); g.forEach((c, i) => { if (i < 3) { c.classList.add("pulse"); setTimeout(() => c.classList.remove("pulse"), 1400); } }); }
    } catch (e) { say(k, esc(errText(e)), "err"); }
    finally { S.busy = false; holdChain(false); if (btn) btn.classList.remove("busy"); try { if (typeof ensureArcForWrite === "function") await ensureArcForWrite(); } catch { /* stays on Robinhood Chain */ } }
  }
  function act(a, btn) {
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(refresh).catch(() => {}); return; }
    if (!live()) return;
    const V = S.st.vault;
    if (a === "split") return run("split", (sg) => new ethers.Contract(S.st.router, ROUTER_ABI, sg).claim(), btn);
    const col = String(S.f.col || "").trim(), cap = String(S.f.cap || "").trim(), keeper = String(S.f.keeper || "").trim() || (S.st.serverKeeper || "");
    const bad = (m) => say("cur", T(m), "err");
    if (a === "propose" || a === "lower") {
      if (!isAddr(col)) return bad("Enter the collection's contract address.");
      if (!(Number(cap) > 0)) return bad("Enter a price cap in ETH.");
      if (a === "propose" && S.col && S.col.addr === lc(col) && S.col.v && !(S.col.v.contract && S.col.v.erc721)) return bad("That address isn't an ERC-721 collection on Robinhood Chain.");
      const w = ethers.parseEther(cap);
      return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg)[a === "propose" ? "proposeCollection" : "lowerCap"](col, w), btn);
    }
    if (a === "remove") { if (!isAddr(col)) return bad("Enter the collection's contract address."); return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg).removeCollection(col), btn); }
    if (a === "keeper") { if (!isAddr(keeper)) return bad("Enter the keeper's address."); return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg).setKeeper(keeper), btn); }
  }
  let colT = null;
  function checkCol() {
    clearTimeout(colT);
    const a = lc(String(S.f.col || "").trim());
    if (!isAddr(a)) return;
    if (S.col && S.col.addr === a) return;
    colT = setTimeout(async () => {
      try { const r = await fetch(`${API}?nft=col&c=${a}`); const j = await r.json(); S.col = j && !j.error ? { addr: a, v: j } : { addr: a, err: (j && j.error) || tr("Couldn't check it right now.") }; }
      catch { S.col = { addr: a, err: tr("Couldn't check it right now.") }; }
      render();
    }, 400);
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-nft-act]");
    if (b && !b.disabled) { act(b.dataset.nftAct, b); return; }
    const tk = e.target.closest("[data-nft-ticket]");
    if (tk) { checkTicket(Number(tk.dataset.nftTicket)); return; }
    const sh = e.target.closest("[data-nft-share]");
    if (sh) { share(Number(sh.dataset.nftShare)); return; }
    const md = e.target.closest("[data-nft-mode]");
    if (md) { S.calc.mode = md.dataset.nftMode; render(); return; }
    const jp = e.target.closest("[data-nft-jump]");
    if (jp) { e.preventDefault(); const i = Number(jp.dataset.nftJump); S.open.add(i); S.open.delete("x" + i); const el = $("nft-prize-" + i); if (el) { const d = el.querySelector("details"); if (d) d.open = true; el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" }); el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2000); } return; }
    const cp = e.target.closest("[data-nft-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.nftCopy); cp.classList.add("copied"); setTimeout(() => cp.classList.remove("copied"), 1200); } catch { /* denied */ } }
  });
  body.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.matches || !d.matches("details[data-fair]")) return;
    const i = Number(d.dataset.fair);
    if (d.open) { S.open.add(i); S.open.delete("x" + i); } else { S.open.delete(i); S.open.add("x" + i); }
  }, true);
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "nft-col") { S.f.col = t.value; checkCol(); }
    else if (t.id === "nft-cap") S.f.cap = t.value;
    else if (t.id === "nft-keeper") S.f.keeper = t.value;
    else if (t.id === "nft-calc-amt") { S.calc.amt = t.value.replace(/[^\d.]/g, ""); paintCalc(); }
    else if (t.id === "nft-calc-r") { S.calc.amt = String(Math.round(Math.pow(10, Number(t.value) / 100) / 100) * 100); paintCalc(true); }
  });
  // the calculator repaints alone, so typing and dragging never lose their place
  function paintCalc(fromRange) {
    const box = body.querySelector(".nft-calc");
    if (!box) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = calcHtml(S.me && S.me.inList ? S.me : null);
    const nb = tmp.firstElementChild;
    ["nft-calc-out"].forEach((c) => { const o = box.querySelector("." + c), n = nb.querySelector("." + c); if (o && n) o.replaceWith(n); });
    const on = box.querySelector(".nft-note.sm"), nn = nb.querySelector(".nft-note.sm"); if (on && nn) on.replaceWith(nn);
    if (fromRange) { const i = box.querySelector("#nft-calc-amt"); if (i) i.value = S.calc.amt; }
    else { const r = box.querySelector("#nft-calc-r"), nr = nb.querySelector("#nft-calc-r"); if (r && nr) r.value = nr.value; }
  }
  // a card that leans toward the pointer (desktop only)
  body.addEventListener("pointermove", (e) => {
    if (reduce() || e.pointerType !== "mouse") return;
    const c = e.target.closest(".nft-tilt");
    if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg"); c.style.setProperty("--ry", (x * 12).toFixed(2) + "deg"); c.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(0) + "%");
  });
  body.addEventListener("pointerout", (e) => { const c = e.target.closest && e.target.closest(".nft-tilt"); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); } });

  // ---------------- life ----------------
  let timer = null, clock = null, acct = null;
  async function tick() {
    if (S.busy) return;
    const ae = document.activeElement, typing = ae && body.contains(ae) && /INPUT|SELECT/.test(ae.tagName);
    if (me() !== acct) { acct = me(); S.tickets = {}; await loadMe(); if (!typing) render(); return; }
    if (!typing) await refresh();
  }
  function show() {
    if (!S.booted) { S.booted = true; loadSeen(); render(); acct = me(); refresh(); }
    else if (/[?&]prize=\d+/.test(location.hash || "")) jumpToPrize();
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(tick, 20000);
    clock = setInterval(tickClocks, 1000);
    setTimeout(tick, 2500);
  }
  // a one-line NFT Vault strip on the Staking tab: locking there raises your odds here
  async function mini() {
    const el = $("nft-mini");
    if (!el) return;
    if (!S.st) await loadState();
    const st = S.st;
    if (!st || !st.live) { el.hidden = true; return; }
    const open = (st.prizes || []).find((p) => p.status === "open");
    el.innerHTML = `<span class="nft-mini-i" aria-hidden="true">${PIC}</span><span><b>${T("ARCIRCLE NFT Vault")}</b> · ${T("Locked $ARCIRCLE counts in every raffle — a max lock counts double.")}</span><em data-no-i18n>${ethS(st.balance)}${open ? ` · #${open.i} ${esc(left(Math.max(0, open.raffle.drawAfter - nowS())))}` : ""}</em>`;
    el.hidden = false;
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "staking") mini(); if (e.detail && e.detail.tab === "nft") show(); else { clearInterval(timer); clearInterval(clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) render(); });
  const lede = panel.querySelector(".nft-hero .bp-lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("open"));
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) panel.querySelectorAll(".nft-guide details[open]").forEach((d) => d.removeAttribute("open"));
  if (panel.classList.contains("active")) show();
  window.arcNft = { get state() { return S; }, refresh, verify };
})();
