/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, ensureAltForWrite, readProvider, ARC_ALT_NET */
// arc-agent.js — ARCIA AGENT, an ARCIRCLE PAD utility (arcpad.html#agent).
// Paste an Arc token's address and ARCIA works on it:
//   · report     Token Scanner v3 read in full, ARCIA's own take, the numbers that matter (GET /api/desk?agent=0x…)
//   · the call   Safe / Caution / Risky for the next 24h, recorded with a hash and graded in public (?agent=record)
//   · vaults     per-token burn vaults (contracts/contracts/ArciaAgent.sol, ?agent=vaults&t=): anyone funds with USDC,
//                ARCIA decides when to buy, and everything bought goes to 0x…dEaD; the owner sets limits and can
//                pause, turn ARCIA off or withdraw at any time
//   · actions    every buy & burn ARCIA made for the token, with its transaction
// Nothing on this page can make ARCIA buy: only a vault's on-chain limits and the agent's rules (api/_agent.mjs) do.
// Robinhood Chain (Oct 2026): an Arc | Robinhood switch over the address box. The same report and call (chain=rh), and
// vaults from ArciaAgentRH.sol funded with ETH, buying in the token's Uniswap v3 (WETH) or v4 (ETH / WETH) pool.
// Deep link: #agent?c=rh&t=0x… · the record holds both chains' calls, each with its chain.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-agent");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ---------------- the chain: Arc or Robinhood Chain ----------------
  const RHN = (typeof ARC_ALT_NET !== "undefined" && ARC_ALT_NET) || { explorer: "https://robinhoodchain.blockscout.com" };
  const CK = "arcircle.agent.chain";
  let CH = /^#agent\?(?:.*&)?c=rh\b/.test(location.hash) ? "rh" : (() => { try { return localStorage.getItem(CK) === "rh" && !/^#agent\?(?:.*&)?t=/.test(location.hash) ? "rh" : "arc"; } catch { return "arc"; } })();
  const RH = () => CH === "rh";
  const CQ = (c = CH) => (c === "rh" ? "&chain=rh" : "");
  const EXPLon = (c) => (kind, x) => `${c === "rh" ? RHN.explorer : (typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const EXPL = (kind, x) => EXPLon(CH)(kind, x);
  const txa = (h, label, c) => (h ? `<a class="ag-tx" href="${EXPLon(c || CH)("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const addrA = (a) => (a ? `<a class="ag-tx" href="${EXPL("address", a)}" target="_blank" rel="noopener" data-no-i18n>${short(a)} ↗</a>` : "—");
  const rhTag = (c) => (c === "rh" ? `<i class="ag-chtag" title="Robinhood Chain" data-no-i18n><b class="aor-cdot rh" aria-hidden="true"></b>RH</i>` : "");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big$ = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : usd(n, n < 10 ? 2 : 0));
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const pc = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m` : `${Math.floor(d / 86400)}d`; };
  const inT = (s) => { const d = Math.max(0, s - Date.now() / 1000); return d < 3600 ? `${Math.ceil(d / 60)}m` : `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`; };
  const API = "/api/desk";
  const USDC = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE_ARC = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const ARCIRCLE_RH = (typeof CONFIG !== "undefined" && CONFIG.OMNI && CONFIG.OMNI.ROBINHOOD_OFT) || "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4";
  const arcircleOf = () => (RH() ? ARCIRCLE_RH : ARCIRCLE_ARC);
  // v3: $ARCIA's home is Robinhood Chain (its quick chip there)
  const ARCIA_RH = "0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25";
  // money in a vault's own unit: USDC on Arc, ETH on Robinhood Chain (with its dollars)
  const ethTxt = (n) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 3 : n >= 0.01 ? 4 : 6 }) + " ETH");
  const money = (n, V) => (V && V.unit === "ETH" ? ethTxt(n) : usd(n));
  const moneyUsd = (n, V) => (V && V.unit === "ETH" && V.ethUsd && n != null ? ` <small class="ag-usd" data-no-i18n>≈ ${usd(n * V.ethUsd, n * V.ethUsd < 10 ? 2 : 0)}</small>` : "");
  const AV = "/images/arcia-avatar-96.jpg";
  const CALLS = { safe: ["Safe", "safe"], caution: ["Caution", "caution"], risky: ["Risky", "risky"] };
  const S = { t: null, rep: null, rec: null, vs: null, tab: "overview", busy: false, booted: false, timer: 0, seenActs: null, liq: null, ownOpen: new Set(), lastStatus: {}, lastBuys: {} };

  // ---------------- a per-viewer watchlist (convenience only) ----------------
  const WK = "arcircle.agent.watch";
  const watch = () => { try { const l = JSON.parse(localStorage.getItem(WK) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
  const saveWatch = (l) => { try { localStorage.setItem(WK, JSON.stringify(l.slice(0, 12))); } catch { /* private window */ } };
  const watching = (t) => watch().some((w) => w.t === lc(t));
  const NK = "arcircle.agent.notify", SK = "arcircle.agent.seen";
  const notifyOn = () => { try { return localStorage.getItem(NK) === "1"; } catch { return false; } };
  // v3: news for a followed token with the tab closed — one Web Push topic per token and chain (agent-arc-0x… / agent-rh-0x…)
  const topicOf = (w) => `agent-${w.ch === "rh" ? "rh" : "arc"}-${lc(w.t)}`;
  const b64b = (s) => { const t = String(s).replace(/-/g, "+").replace(/_/g, "/"); const b = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  let pushKey;
  async function pushSub() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (pushKey === undefined) { try { const r = await fetch("/api/social?orders=pushkey"); pushKey = r.ok ? (await r.json()).key || null : null; } catch { pushKey = null; } }
    if (!pushKey) return null;
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 4000))]);
    if (!reg || !reg.pushManager) return null;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64b(pushKey) }));
    return sub ? sub.toJSON() : null;
  }
  /// subscribe (or drop) these followed tokens' topics; false when this browser can't take pushes (the page's own alerts remain)
  async function pushTopics(list, remove = false) {
    try {
      const sub = await pushSub(); if (!sub) return false;
      const rs = await Promise.all(list.map((w) => fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pushtopic", topic: topicOf(w), sub, ...(remove ? { remove: true } : {}) }) }).then((r) => r.ok).catch(() => false)));
      return rs.every(Boolean);
    } catch { return false; }
  }

  // ---------------- skeleton ----------------
  function frame() {
    // v3: the burn totals on top, one row to summon her (chain · address · button), the landing folds away under a report
    $("ag-body").innerHTML = `
      <div class="ag-totals" id="ag-totals" hidden></div>
      <div class="ag-summon" id="ag-summon">
        <div class="ag-sum-av"><img src="${AV}" alt="" width="56" height="56"><i></i></div>
        <div class="ag-bar">
          <div class="aor-chain ag-chainsw" id="ag-chain" role="radiogroup" aria-label="Chain" data-chain="${CH}"><i class="aor-chain-pill" aria-hidden="true"></i><button type="button" role="radio" data-agchain="arc" aria-checked="${!RH()}"><span class="aor-cdot arc" aria-hidden="true"></span><span data-no-i18n>Arc</span></button><button type="button" role="radio" data-agchain="rh" aria-checked="${RH()}"><span class="aor-cdot rh" aria-hidden="true"></span><span data-no-i18n>Robinhood</span></button></div>
          <form class="ag-form" id="ag-form" autocomplete="off">
            <input id="ag-in" type="text" inputmode="text" spellcheck="false" placeholder="${T(RH() ? "Paste a Robinhood Chain token address (0x…)" : "Paste an Arc token address (0x…)")}" aria-label="${T(RH() ? "Robinhood Chain token address" : "Arc token address")}">
            <button type="submit" class="ag-go" id="ag-go"><span>${T("Wake ARCIA")}</span></button>
          </form>
        </div>
        <div class="ag-chips" id="ag-chips"></div>
        <i class="ag-beam" aria-hidden="true"></i>
      </div>
      <div class="ag-think" id="ag-think" hidden></div>
      <div class="ag-res" id="ag-res"></div>
      <button type="button" class="ag-landtog" id="ag-landtog" hidden>${T("Show ARCIA's record, burns and vaults")}</button>
      <div class="ag-landwrap" id="ag-landwrap">
        <div class="ag-land" id="ag-land"></div>
        <div class="ams-card ag-board" id="ag-board"></div>
        <div class="ams-card ag-vboard" id="ag-vboard"></div>
      </div>`;
    $("ag-landtog").addEventListener("click", () => { const o = panel.classList.toggle("ag-landopen"); $("ag-landtog").textContent = tr(o ? "Hide ARCIA's record, burns and vaults" : "Show ARCIA's record, burns and vaults"); });
    $("ag-form").addEventListener("submit", (e) => { e.preventDefault(); wake($("ag-in").value.trim()); });
    $("ag-in").addEventListener("paste", () => setTimeout(() => { const v = $("ag-in").value.trim(); if (isAddr(v)) wake(v); }, 0));
    if (!S.wired) { S.wired = true; panel.addEventListener("click", onClick); }
    chips();
    land();
    board();
    vboard();
    totals();
  }
  // ---------------- the landing: how it works, what people read, the notification switch ----------------
  async function land() {
    const el = $("ag-land");
    if (!el) return;
    const step = (n, t, d) => `<div class="ag-step"><i data-no-i18n>${n}</i><b>${T(t)}</b><span>${T(d)}</span></div>`;
    el.innerHTML = `<div class="ag-steps">${step(1, "Read", "The whole token: contract, holders, pools, market.")}<em aria-hidden="true"></em>${step(2, "Call", "Safe, Caution or Risky for 24 hours — graded in public.")}<em aria-hidden="true"></em>${step(3, "Burn", "From a vault anyone funds: bought in dips, sent to 0x…dEaD.")}</div>
      <div class="ag-trend" id="ag-trend"></div>
      <label class="ag-notify"><input type="checkbox" id="ag-notify"${notifyOn() ? " checked" : ""}> <span>${T("Notify me about the tokens I follow")}</span></label>`;
    $("ag-notify").addEventListener("change", async (e) => {
      if (e.target.checked && "Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch { /* fine */ } }
      try { localStorage.setItem(NK, e.target.checked ? "1" : "0"); } catch { /* private window */ }
      // v3: and the followed tokens' news with this tab closed (Web Push), where the browser can
      if (watch().length) { const ok = await pushTopics(watch(), !e.target.checked); if (e.target.checked) toast(tr(ok ? "Done — their news reaches this browser even with the tab closed." : "On while this tab is open. With it closed: /agentwatch on the ARCIA bot.")); }
    });
    try {
      const r = await fetch(`/api/social?scans=top${CQ()}`);
      const j = r.ok ? await r.json() : null;
      const top = ((j && j.top) || []).slice(0, 8);
      if (top.length) $("ag-trend").innerHTML = `<small>${T("Read most this week")}</small>` + top.map((x) => `<button type="button" class="ag-chip" data-ag-t="${esc(x.token)}"><span data-no-i18n>${esc(x.symbol || short(x.token))}</span></button>`).join("");
    } catch { /* optional */ }
  }
  // ---------------- every vault, by what it has burned, and the latest burns ----------------
  async function vboard() {
    const el = $("ag-vboard");
    if (!el) return;
    let V = null;
    try { const r = await fetch(`${API}?agent=vaults${CQ()}`); V = r.ok ? await r.json() : null; } catch { V = null; }
    if (!V || !V.live || !V.vaults.length) { el.hidden = true; return; }
    el.hidden = false;
    const list = V.vaults.slice().sort((a, b) => b.spent - a.spent).slice(0, 10);
    // v3: each row with its chain, how much is left to spend (a small gauge) and an Empty state; the latest burns as one tape
    const pill = (v) => (v.paused ? ["off", "Paused"] : v.empty ? ["dry", "Empty · refill"] : v.agentOn ? ["on", "ARCIA on"] : ["off", "ARCIA off"]);
    el.innerHTML = `<div class="dk-h"><h3>${T("Burn vaults")}</h3><span class="dk-sub">${T("by what ARCIA has burned")}</span></div>
      <div class="ag-vlist">${list.map((v, i) => { const p = pill(v), f = Math.max(0, Math.min(1, v.usdc / Math.max(v.maxBuy * 4, 1e-12))); return `<button type="button" class="ag-vrow${v.empty ? " dry" : ""}" data-ag-t="${esc(v.token)}" data-ag-c="${V.chain === "rh" ? "rh" : "arc"}"><em data-no-i18n>${i + 1}</em><b data-no-i18n>${esc(v.sym || short(v.token))}${rhTag(V.chain)}</b><span data-no-i18n>${num(Number(v.burned) / 10 ** (v.dec || 18))}</span><small><span data-no-i18n>${money(v.spent, V)}</span> · <span data-no-i18n>${v.buys}</span> ${T("buys")}</small><i class="ag-mini" title="${T("left to spend")}" style="--f:${(f * 100).toFixed(0)}%"><b></b></i><i class="ag-pill ${p[0]}">${T(p[1])}</i></button>`; }).join("")}</div>
      ${V.recent.length ? `<h4>${T("Latest burns")}</h4><div class="ag-tape"><div class="ag-tape-r${V.recent.length >= 6 && !reduce ? " loop" : ""}">${tapeRow(V.recent.slice(0, 12))}${V.recent.length >= 6 && !reduce ? `<span aria-hidden="true">${tapeRow(V.recent.slice(0, 12))}</span>` : ""}</div></div>` : ""}`;
  }
  const tapeRow = (l) => l.map((a) => `<a class="ag-tk" href="${EXPLon(a.ch === "rh" || CH === "rh" ? "rh" : "arc")("tx", a.tx)}" target="_blank" rel="noopener"><i class="ag-flame" aria-hidden="true"></i><b data-no-i18n>${num(Number(a.burned) / 10 ** (a.dec || 18))} ${esc(a.sym || "")}</b><span data-no-i18n>${usd(a.usd)}</span><small data-no-i18n>${ago(a.ts)}</small></a>`).join("");
  // ---------------- v3: everything ARCIA has burned, both chains, rolling up ----------------
  async function totals() {
    const el = $("ag-totals"); if (!el) return;
    let A = null, R = null;
    try { const [a, r] = await Promise.all([fetch(`${API}?agent=vaults`), fetch(`${API}?agent=vaults&chain=rh`)]); A = a.ok ? await a.json() : null; R = r.ok ? await r.json() : null; } catch { /* keep hidden */ }
    const tiles = [];
    for (const [V, ch] of [[A, "arc"], [R, "rh"]]) {
      if (!V || !V.live || !V.vaults.length) continue;
      const by = {};
      for (const v of V.vaults) { const k = v.token; const b = (by[k] = by[k] || { token: k, sym: v.sym, dec: v.dec || 18, supply: v.supply, burned: 0n, spent: 0, buys: 0 }); b.burned += BigInt(v.burned || "0"); b.spent += v.spent || 0; b.buys += v.buys || 0; }
      const top = Object.values(by).sort((x, y) => (y.burned > x.burned ? 1 : -1));
      const t = top[0]; if (!t || t.burned === 0n) continue;
      const amt = Number(t.burned) / 10 ** t.dec, sup = t.supply ? Number(BigInt(t.supply)) / 10 ** t.dec : null;
      tiles.push(`<div class="ag-tot ${ch}"><i class="ag-flame" aria-hidden="true"></i><div><small>${T(ch === "rh" ? "Burned by ARCIA · Robinhood Chain" : "Burned by ARCIA · Arc")}</small><b data-no-i18n><span class="ag-roll" data-to="${amt}">${num(amt)}</span> $${esc(t.sym || "")}</b><em data-no-i18n>${ch === "rh" ? ethTxt(t.spent) : usd(t.spent, 0)} · ${t.buys} ${esc(tr("buys"))}${sup ? ` · ${(amt / sup * 100).toFixed(2)}% ${esc(tr("of supply"))}` : ""}${top.length > 1 ? ` · +${top.length - 1} ${esc(tr("more tokens"))}` : ""}</em></div></div>`);
    }
    if (!tiles.length) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = tiles.join("");
    el.querySelectorAll(".ag-roll").forEach((b) => roll(b, Number(b.dataset.to)));
  }
  /// a number rolls up from where this browser last saw it (from 0 the first time) and the flame flares meanwhile
  function roll(b, to) {
    const key = "arcircle.agent.roll." + b.closest(".ag-tot").className.split(" ").pop();
    let from = 0; try { from = Number(localStorage.getItem(key)) || 0; localStorage.setItem(key, String(to)); } catch { /* fine */ }
    if (reduce || from === to) { b.textContent = num(to); return; }
    const box = b.closest(".ag-tot"); box.classList.add("rolling");
    const t0 = performance.now(), D = from ? 900 : 1500;
    const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); b.textContent = num(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else box.classList.remove("rolling"); };
    requestAnimationFrame(step);
  }
  function chips() {
    const l = watch();
    $("ag-chips").innerHTML = (RH() ? `<button type="button" class="ag-chip ag-chip-arc ag-chip-arcia" data-ag-t="${ARCIA_RH}" data-ag-c="rh" data-no-i18n>$ARCIA</button>` : "") + `<button type="button" class="ag-chip ag-chip-arc" data-ag-t="${arcircleOf()}" data-ag-c="${CH}" data-no-i18n>$ARCIRCLE</button>` +
      l.map((w) => `<button type="button" class="ag-chip ${w.call ? "c-" + w.call : ""}" data-ag-t="${esc(w.t)}" data-ag-c="${w.ch === "rh" ? "rh" : "arc"}"><span data-no-i18n>${esc(w.sym || short(w.t))}</span>${rhTag(w.ch)}${w.call ? `<i>${T(CALLS[w.call] ? CALLS[w.call][0] : w.call)}</i>` : ""}</button>`).join("");
  }
  function onClick(e) {
    const sw = e.target.closest("[data-agchain]");
    if (sw) { setChain(sw.dataset.agchain); try { history.replaceState(null, "", RH() ? "#agent?c=rh" : "#agent"); } catch { /* fine */ } return; }
    const t = e.target.closest("[data-ag-t]");
    if (t) { const c = t.dataset.agC || CH; if (c !== CH) setChain(c); $("ag-in").value = t.dataset.agT; wake(t.dataset.agT); return; }
    const tab = e.target.closest("[data-ag-tab]");
    if (tab) { S.tab = tab.dataset.agTab; tabs(); return; }
    const f = e.target.closest("[data-ag-follow]");
    if (f) { follow(); return; }
    const sh = e.target.closest("[data-ag-share]");
    if (sh) { if (sh.dataset.agShare === "week") weekImage(); else shareImage(sh.dataset.agShare, sh.dataset.v); return; }
    if (e.target.closest("[data-ag-ask]") && S.rep) {
      const r = S.rep, c = r.call || {};
      const q = `${tr("Explain ARCIA AGENT's read of")} $${r.sym || short(r.t)}: ${tr("scanner score")} ${r.facts.score ?? "—"}/100, ${tr("safety call")} ${c.pending ? tr("still reading the holders") : tr((CALLS[c.call] || [c.call])[0])} (${(c.why || []).join("; ")}).`;
      if (window.arcArcia && window.arcArcia.ask) window.arcArcia.ask(q); else location.hash = "#arcia";
      return;
    }
    const cp = e.target.closest("[data-ag-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.agCopy); cp.classList.add("done"); setTimeout(() => cp.classList.remove("done"), 1200); } catch { /* no clipboard */ } }
  }
  function follow() {
    if (!S.rep) return;
    let l = watch();
    const on = !watching(S.t), w = { t: S.t, ...(RH() ? { ch: "rh" } : {}), sym: S.rep.sym, call: S.rep.call && S.rep.call.call, at: Date.now() };
    if (!on) l = l.filter((x) => x.t !== S.t);
    else l = [w, ...l];
    // v3: the chip flies from the button to the row of chips; the button pops
    const from = panel.querySelector(".ag-follow"), r0 = from && from.getBoundingClientRect();
    saveWatch(l); chips(); card();
    if (on && !reduce && r0) {
      const btn = panel.querySelector(".ag-follow"); if (btn) btn.classList.add("pop");
      const to = $("ag-chips").querySelector(`[data-ag-t="${S.t}"]`), r1 = to && to.getBoundingClientRect();
      if (r1) { const g = document.createElement("span"); g.className = "ag-fly"; g.textContent = S.rep.sym ? "$" + S.rep.sym : short(S.t); g.style.cssText = `left:${r0.left}px;top:${r0.top}px;--dx:${r1.left - r0.left}px;--dy:${r1.top - r0.top}px`; document.body.appendChild(g); to.classList.add("ag-landed"); setTimeout(() => { g.remove(); to.classList.remove("ag-landed"); }, 900); }
    }
    if (notifyOn()) pushTopics([w], !on);
  }

  // ---------------- wake: the thought stream while the report loads ----------------
  const THOUGHTS = ["Reading the contract", "Checking who holds it", "Reading its pools and liquidity", "Running Token Scanner v3", "Weighing the risks", "Making my call"];
  async function wake(t) {
    if (!S.booted) { show(); if (S.t === lc(String(t || "").trim())) return; }
    t = String(t || "").trim();
    if (!isAddr(t)) { think([], "Paste a token's contract address — 0x followed by 40 characters."); return; }
    if (S.busy) return;
    S.busy = true; S.t = lc(t); S.rep = null; S.vs = null; S.seenActs = null;
    try { history.replaceState(null, "", `#agent?${RH() ? "c=rh&" : ""}t=${S.t}`); } catch { /* fine */ }
    $("ag-res").innerHTML = ""; $("ag-summon").classList.add("waking");
    let i = 0;
    const tick = setInterval(() => { i = Math.min(THOUGHTS.length - 1, i + 1); think(THOUGHTS.slice(0, i + 1)); }, reduce ? 50 : 650);
    think(THOUGHTS.slice(0, 1));
    let rep = null, err = null;
    try {
      const [r1, r2] = await Promise.all([fetch(`${API}?agent=${S.t}${CQ()}`), fetch(`${API}?agent=vaults&t=${S.t}${CQ()}`).catch(() => null)]);
      rep = await r1.json().catch(() => null);
      S.vs = r2 && r2.ok ? await r2.json().catch(() => null) : null;
      if (!r1.ok || !rep || rep.error) err = (rep && rep.error) || "ARCIA couldn't read that token right now.";
    } catch { err = "ARCIA couldn't read that token right now."; }
    clearInterval(tick);
    S.busy = false; $("ag-summon").classList.remove("waking");
    if (err) { think([], err); return; }
    think(THOUGHTS, null, true);
    S.rep = rep;
    // a followed token keeps its latest call on the chip
    if (watching(S.t)) { saveWatch(watch().map((w) => (w.t === S.t ? { ...w, sym: rep.sym, call: rep.call && rep.call.call } : w))); chips(); }
    setTimeout(() => { $("ag-think").hidden = true; render(); afterRender(); }, reduce ? 0 : 350);
  }
  /// ARCIA's words come after the report (a separate request), and a call waiting for the holders is asked again
  async function afterRender() {
    const t = S.t, r = S.rep;
    if (!r) return;
    if (!r.take) {
      try { const x = await fetch(`${API}?agent=take&t=${t}${CQ()}`); const j = x.ok ? await x.json() : null; if (S.t === t && j && j.take) { S.rep.take = j.take; typeTake(j.take.text); } } catch { /* the rules line stays */ }
    }
    clearTimeout(S.retry);
    if (r.call && r.call.pending && (S.tries = (S.tries || 0) + 1) <= 12) {
      S.retry = setTimeout(async () => {
        if (S.t !== t) return;
        try { const x = await fetch(`${API}?agent=${t}&n=${S.tries}${CQ()}`); const j = x.ok ? await x.json() : null; if (j && !j.error && S.t === t) { const tk = S.rep.take; S.rep = j; if (!j.take) S.rep.take = tk; card(); if (S.tab === "overview") tabs(); afterRender(); } } catch { /* next time */ }
      }, 15000);
    } else if (!(r.call && r.call.pending)) S.tries = 0;
  }
  function think(lines, error = null, done = false) {
    const el = $("ag-think");
    el.hidden = false;
    // v3: a bar fills as she works through her steps
    const pct = error ? 0 : done ? 100 : Math.round((lines.length / (THOUGHTS.length + 1)) * 100);
    el.innerHTML = (error ? `<div class="ag-th bad">${T(error)}</div>` : lines.map((l, k) => `<div class="ag-th ${done || k < lines.length - 1 ? "ok" : "now"}"><i></i>${T(l)}…</div>`).join("")) + (error ? "" : `<div class="ag-thbar"><i style="width:${pct}%"></i></div>`);
  }

  // ---------------- the result ----------------
  function render() {
    $("ag-res").innerHTML = `
      <div class="ag-grid">
        <div class="ams-card ag-card" id="ag-card"></div>
        <div class="ams-card ag-main">
          <div class="ag-tabs" role="tablist">${[["overview", "Overview"], ["record", "Record"], ["vault", "Vault"], ["actions", "ARCIA's actions"]].map(([k, l]) => `<button type="button" role="tab" data-ag-tab="${k}" aria-selected="${S.tab === k}">${T(l)}</button>`).join("")}</div>
          <div id="ag-tab"></div>
        </div>
      </div>`;
    card(); tabs();
    if (!reduce) { const c = $("ag-card"); c.classList.add("ag-scan"); setTimeout(() => c.classList.remove("ag-scan"), 1500); }
    // v3: the landing folds away under a report (a button brings it back)
    panel.classList.add("ag-hasrep"); const lt = $("ag-landtog"); if (lt) lt.hidden = false;
  }
  function card() {
    const r = S.rep, c = r.call || {}, k = c.pending ? ["Reading", "pending"] : CALLS[c.call] || ["—", ""];
    const el = $("ag-card");
    const graded = c.graded;
    el.className = `ams-card ag-card k-${k[1]}`;
    el.innerHTML = `
      <div class="ag-c-top"><div class="ag-av k-${k[1]} mood-${k[1]}"><img src="${AV}" alt="" width="64" height="64"></div>
        <div class="ag-c-id"><b data-no-i18n>${esc(r.sym || short(r.t))}${rhTag(r.ch)}</b><small data-no-i18n>${esc(r.name || "")}</small>${addrA(r.t)}</div>
        <button type="button" class="ag-follow ${watching(r.t) ? "on" : ""}" data-ag-follow aria-pressed="${watching(r.t)}">${T(watching(r.t) ? "Following" : "Follow")}</button></div>
      <div class="ag-call"><span class="ag-stamp k-${k[1]}">${c.pending ? `<i class="ag-spin" aria-hidden="true"></i>` : ""}${T(k[0])}</span><div><small>${T(c.pending ? "The call waits for the holders" : "ARCIA's 24-hour safety call")}</small><ul>${(c.why || []).map((w) => `<li>${T(w)}</li>`).join("")}</ul></div></div>
      <p class="ag-take" id="ag-take" data-no-i18n></p>
      <div class="ag-c-meta">
        ${c.pending ? `<span>${T("Reading the balance sheet — the call comes as soon as the holders are known.")}</span>` : `<span>${T("Called by ARCIA")} <b data-no-i18n>${ago(c.at)}</b></span>`}
        ${c.pending ? "" : `<span>`}${c.pending ? "" : graded ? `${T("Graded result")}: <b class="${graded.right === true ? "up" : graded.right === false ? "dn" : ""}">${T(graded.right === true ? "called right" : graded.right === false ? "called wrong" : c.call === "caution" ? (graded.bad ? "went bad" : "held") : "not graded")}</b>` : `${cdRing(c)}${T("Graded in")} <b data-no-i18n data-ag-cd="${c.until}">${inT(c.until)}</b>`}${c.pending ? "" : `</span>`}
        ${c.hash ? `<button type="button" class="ag-hash" data-ag-copy="${esc(c.hash)}" title="${T("The call's hash, recorded before the outcome")}"><span data-no-i18n>#${esc(c.hash.slice(2, 10))}</span></button>` : ""}
      </div>
      <div class="ag-c-acts"><button type="button" class="ag-btn sm" data-ag-share="call">${T("Save image")}</button><button type="button" class="ag-btn sm" data-ag-ask>${T("Ask ARCIA about it")}</button></div>
      <p class="ag-small">${T("A call is about risk over the next 24 hours, never about price direction — not a signal to buy or sell.")}</p>`;
    typeTake((r.take && r.take.text) || "");
  }
  /// v3: how much of the 24 hours is left, as a small ring
  function cdRing(c) {
    const span = Math.max(1, (c.until || 0) - (c.at || 0)), left = Math.max(0, Math.min(1, ((c.until || 0) - Date.now() / 1000) / span)), C = 2 * Math.PI * 7;
    return `<svg class="ag-cd" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7"/><circle class="f" cx="9" cy="9" r="7" style="stroke-dasharray:${C.toFixed(2)};stroke-dashoffset:${(C * (1 - left)).toFixed(2)}"/></svg>`;
  }
  function typeTake(text) {
    const el = $("ag-take");
    if (!el) return;
    if (reduce || !text) { el.textContent = text; return; }
    let i = 0;
    el.classList.add("typing");
    const step = () => { i = Math.min(text.length, i + 3); el.textContent = text.slice(0, i); if (i < text.length && document.body.contains(el)) setTimeout(step, 16); else el.classList.remove("typing"); };
    step();
  }
  function tabs() {
    panel.querySelectorAll("[data-ag-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.agTab === S.tab)));
    const el = $("ag-tab");
    if (!el) return;
    el.classList.remove("ag-in"); void el.offsetWidth; if (!reduce) el.classList.add("ag-in");
    if (S.tab === "overview") overview(el);
    else if (S.tab === "record") record(el);
    else if (S.tab === "vault") vaults(el);
    else actions(el);
  }
  function overview(el) {
    const r = S.rep, f = r.facts || {};
    const sc = f.score == null ? null : Math.max(0, Math.min(100, f.score));
    const C = 2 * Math.PI * 34;
    const col = sc == null ? "#8c98a6" : sc >= 75 ? "#39ff88" : sc >= 50 ? "#ffc861" : "#ff6e5a";
    const tile = (label, v, sub = "") => `<div class="ag-f"><small>${T(label)}</small><b data-no-i18n>${v}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    el.innerHTML = `
      <div class="ag-ov">
        <div class="ag-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="ag-r-bg" cx="40" cy="40" r="34"/><circle class="ag-r-fg" cx="40" cy="40" r="34" style="stroke:${col};--c:${C.toFixed(1)};--o:${sc == null ? C : (C * (1 - sc / 100)).toFixed(1)}"/></svg>
          <div><b data-no-i18n>${sc == null ? "—" : sc}</b><small>${T("scanner score")}</small></div></div>
        <div class="ag-facts">
          ${tile("Liquidity", big$(f.liq))}${tile("Market cap", big$(f.mcap))}${tile("Holders", f.holders == null ? "—" : num(f.holders))}${tile("Top 10 hold", f.top10 == null ? "—" : Math.round(f.top10) + "%", f.linked ? `${T("linked wallets")} <em data-no-i18n>${Math.round(f.linked)}%</em>` : "")}
        </div>
      </div>
      ${f.critical && f.critical.length ? `<div class="ag-crit${reduce ? "" : " shake"}"><b>${T("Critical")}</b>${f.critical.map((c) => `<span>${T(c)}</span>`).join("")}</div>` : ""}
      ${(r.checks || []).length ? `<h4>${T("What ARCIA would watch")}</h4><div class="ag-wchips">${r.checks.map((c) => `<span class="s-${esc(c.status)}">${T(c.title)}</span>`).join("")}</div><details class="ag-wmore"><summary>${T("Details")}</summary><ul class="ag-issues">${r.checks.map((c) => `<li class="s-${esc(c.status)}"><b>${T(c.title)}</b>${c.detail ? `<small>${T(c.detail)}</small>` : ""}</li>`).join("")}</ul></details>` : `<p class="ag-small">${T("No warnings from the scanner.")}</p>`}
      <p class="ag-small"><a href="/arc#scanner?${RH() ? "c=rh&" : ""}t=${esc(r.t)}" data-arc-tab="scanner">${T("Open the full Token Scanner report")} →</a> · <a href="/arc#orders?${RH() ? "c=rh&" : ""}t=${esc(r.t)}">${T("Set a limit order")} →</a> · ${T("read by ARCIA")} <span data-no-i18n>${ago(r.at)}</span></p>`;
    if (!reduce) requestAnimationFrame(() => el.querySelector(".ag-r-fg").classList.add("on"));
    else el.querySelector(".ag-r-fg").classList.add("on");
    // the number counts up with the ring
    const b = el.querySelector(".ag-ring b");
    if (b && sc != null && !reduce) { const t0 = performance.now(); const go = (t) => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); b.textContent = Math.round(sc * e); if (k < 1) requestAnimationFrame(go); }; requestAnimationFrame(go); }
  }

  // ---------------- the public record ----------------
  async function loadRecord() {
    try { const r = await fetch(`${API}?agent=record`); S.rec = r.ok ? await r.json() : null; } catch { S.rec = null; }
  }
  /// v3: a hit rate shows as a percentage only from `minSample` graded calls; Caution shows how often it held
  function statLine(st) {
    const min = st.minSample || 5;
    const rate = (x) => (x.n >= min ? `<b data-no-i18n>${Math.round((x.right / x.n) * 100)}%</b><span data-no-i18n>${x.right}/${x.n}</span>`
      : `<b class="few" data-no-i18n>${x.n ? `${x.right}/${x.n}` : "—"}</b><span>${x.n ? `${T("too few to rate yet")}` : T("none graded yet")}</span>`);
    const cu = st.caution || { n: 0, held: 0, bad: 0, open: 0 };
    return `<div class="ag-stats four"><div><small>${T("Safe calls right")}</small>${rate(st.safe)}</div>
      <div><small>${T("Risky calls right")}</small>${rate(st.risky)}</div>
      <div><small>${T("Caution calls held")}</small><b data-no-i18n>${cu.n ? `${cu.held}/${cu.n}` : "—"}</b><span>${cu.n ? `<span data-no-i18n>${cu.bad}</span> ${T("went bad")}` : T("none graded yet")}</span>${cu.n ? `<i class="ag-cbar"><b style="width:${((cu.held / cu.n) * 100).toFixed(0)}%"></b></i>` : ""}</div>
      <div><small>${T("Calls made")}</small><b data-no-i18n>${st.total}</b><span><span data-no-i18n>${st.open}</span> ${T("still open")}</span></div></div>`;
  }
  // which graded calls this browser has already seen (a newly graded one flips in)
  const GK = "arcircle.agent.graded";
  const gSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(GK) || "[]")); } catch { return new Set(); } };
  function markGraded(calls) { try { const s0 = gSeen(); calls.filter((c) => c.graded).forEach((c) => s0.add(c.id)); localStorage.setItem(GK, JSON.stringify([...s0].slice(-400))); } catch { /* fine */ } }
  function callRow(c, seen) {
    const k = CALLS[c.call] || ["—", ""], g = c.graded;
    // v3: a Caution call has an outcome too — it held, or the token went bad
    const res = !g ? `<em class="ag-wait">${T("still open")} · <span data-no-i18n>${inT(c.until)}</span></em>` : g.void ? `<em>${T("no market to grade")}</em>`
      : g.right == null ? (g.bad == null ? `<em>${T("not graded")}</em>` : `<em class="${g.bad ? "dn" : "held"}">${T(g.bad ? "went bad" : "held")} <span data-no-i18n>${pc(g.dPx, 0)}</span></em>`)
      : `<em class="${g.right ? "up" : "dn"}">${T(g.right ? "called right" : "called wrong")} <span data-no-i18n>${pc(g.dPx, 0)}</span></em>`;
    const fresh = g && seen && !seen.has(c.id) && !reduce;
    return `<button type="button" class="ag-callrow${fresh ? " flip now" : ""}${g ? (g.right === true ? " r-up" : g.right === false || g.bad ? " r-dn" : "") : ""}" data-ag-t="${esc(c.t)}" data-ag-c="${c.ch === "rh" ? "rh" : "arc"}"><span class="ag-stamp sm k-${k[1]}">${T(k[0])}</span><b data-no-i18n>${esc(c.sym || short(c.t))}${rhTag(c.ch)}</b><small data-no-i18n>${new Date(c.at * 1000).toISOString().slice(5, 16).replace("T", " ")} · ${ago(c.at)}</small>${res}</button>`;
  }
  async function record(el) {
    el.innerHTML = `<div class="ag-skel"><i></i><i></i></div>`;
    await loadRecord();
    if (S.tab !== "record") return;
    const R = S.rec;
    if (!R) { el.innerHTML = `<div class="ag-empty">${T("The record isn't reachable right now.")}</div>`; return; }
    const mine = R.calls.filter((c) => c.t === S.t && (c.ch === "rh" ? "rh" : "arc") === CH);
    const seen = gSeen(), first = !seen.size;
    const row = (c) => callRow(c, first ? null : seen);
    el.innerHTML = statLine(R.stats) + series(R.series, R.stats.minSample) + buckets(R.buckets) +
      (mine.length ? `<h4>${T("This token")}</h4>${history(mine)}<div class="ag-calls">${mine.map(row).join("")}</div>` : "") +
      `<h4>${T("Latest calls")}</h4><div class="ag-calls">${R.calls.slice(0, 20).map(row).join("") || `<div class="ag-empty">${T("No calls yet.")}</div>`}</div>
      <p class="ag-small">${T("Safe is right if the token didn't go bad in 24 hours; Risky is right if it did. \"Bad\" = the price fell 60% or more, or the liquidity 50% or more. Each call's hash is recorded before the outcome.")}</p>` + anchors(R.anchors);
    el.querySelectorAll("[data-ag-verify]").forEach((b) => b.addEventListener("click", () => verifyAnchor(b)));
    markGraded(R.calls);
  }
  /// v3: this token over ARCIA's calls — the scanner score and the liquidity each time she called it
  function history(list) {
    const pts = list.filter((c) => c.score0 != null || c.liq0 != null).slice().reverse();
    if (pts.length < 2) return "";
    const W = 300, H = 70, X = (i) => 8 + (i / (pts.length - 1)) * (W - 16);
    const lmax = Math.max(...pts.map((c) => c.liq0 || 0), 1);
    const sc = pts.map((c, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${(H - 6 - ((c.score0 ?? 0) / 100) * (H - 12)).toFixed(1)}`).join("");
    const bars = pts.map((c, i) => { const h = ((c.liq0 || 0) / lmax) * (H - 18); return `<rect x="${(X(i) - 5).toFixed(1)}" y="${(H - 4 - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" rx="2"/>`; }).join("");
    const last = pts[pts.length - 1];
    return `<div class="ag-hist"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><g class="liq">${bars}</g><path d="${sc}"/></svg>
      <div class="ag-hist-k"><span class="s"><i></i>${T("Scanner score")} <b data-no-i18n>${last.score0 ?? "—"}</b></span><span class="l"><i></i>${T("Liquidity")} <b data-no-i18n>${big$(last.liq0)}</b></span><small><span data-no-i18n>${pts.length}</span> ${T("calls")}</small></div></div>`;
  }
  /// the hit rate over time (Safe + Risky), as graded
  function series(pts, min = 5) {
    if (!pts || pts.length < Math.max(2, min)) return ""; // v3: a line needs enough graded calls to mean something
    const W = 300, H = 60, xs = pts.map((p) => p[0]), x0 = xs[0], x1 = xs[xs.length - 1] || x0 + 1;
    const X = (x) => 4 + ((x - x0) / Math.max(1, x1 - x0)) * (W - 8), Y = (y) => H - 4 - (y / 100) * (H - 8);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    return `<div class="ag-series"><small>${T("Hit rate over time")}</small><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${W}" y1="${Y(50)}" y2="${Y(50)}"/><path d="${d}"/></svg><b data-no-i18n>${pts[pts.length - 1][1]}%</b></div>`;
  }
  /// how often tokens went bad, by the scanner score when ARCIA called them
  function buckets(B) {
    if (!B || !B.some((x) => x.n)) return "";
    return `<h4>${T("Went bad within 24 hours, by scanner score")}</h4><div class="ag-bk">${B.map((x) => { const p = x.n ? (x.bad / x.n) * 100 : 0; return `<div><span data-no-i18n>${esc(x.label)}</span><i><b style="width:${p.toFixed(1)}%"></b></i><em data-no-i18n>${x.n ? Math.round(p) + "%" : "—"}</em><small data-no-i18n>${x.bad}/${x.n}</small></div>`; }).join("")}</div>`;
  }
  /// each day's calls, rolled into one hash and written on Arc by ARCIA's key — checked here, in the browser
  function anchors(A) {
    const rows = (A || []).filter((a) => a.tx);
    if (!rows.length) return `<p class="ag-small">${T("Once a day, ARCIA writes the day's call hashes on Arc as one root, so anyone can check the calls came before their outcomes. The first one is written the day after the first calls.")}</p>`;
    return `<h4>${T("Written on Arc")}</h4><div class="ag-anc">${rows.slice(0, 7).map((a) => `<div class="ag-anc-r"><b data-no-i18n>${esc(a.date)}</b><span><span data-no-i18n>${a.n}</span> ${T("calls")}</span>${txa(a.tx, "tx", "arc")}<button type="button" class="ag-btn sm" data-ag-verify="${esc(a.day)}">${T("Check")}</button><em class="ag-anc-m" data-no-i18n></em></div>`).join("")}</div>`;
  }
  async function verifyAnchor(b) {
    const day = Number(b.dataset.agVerify), a = (S.rec.anchors || []).find((x) => x.day === day), out = b.parentElement.querySelector(".ag-anc-m");
    out.textContent = "…";
    try {
      const r = await fetch(`${API}?agent=record&day=${day}`); const j = r.ok ? await r.json() : null;
      const hashes = ((j && j.dayCalls) || []).map((c) => c.hash);
      const root = ethers.keccak256("0x" + hashes.map((h) => h.replace(/^0x/, "")).join(""));
      const tx = await readProvider().getTransaction(a.tx);
      const want = "0x" + Array.from(new TextEncoder().encode(`ARCIA AGENT calls ${a.date}:`), (x) => x.toString(16).padStart(2, "0")).join("") + root.slice(2);
      const good = tx && lc(tx.data) === lc(want) && root === a.root;
      out.className = "ag-anc-m " + (good ? "up" : "dn");
      out.textContent = good ? `✓ ${tr("matches")} · ${hashes.length} ${tr("calls")}` : `✗ ${tr("doesn't match")}`;
    } catch { out.textContent = tr("couldn't check right now"); }
  }
  async function board() {
    await loadRecord();
    const el = $("ag-board");
    if (!el) return;
    if (!S.rec || !S.rec.stats || !S.rec.stats.total) { el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3></div><div class="ag-empty">${T("ARCIA's calls start with the first token someone pastes here.")}</div>`; return; }
    el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3><span class="dk-sub">${T("every safety call, graded in public")}</span><button type="button" class="ag-btn sm ag-weekbtn" data-ag-share="week">${T("Save the week as an image")}</button></div>${statLine(S.rec.stats)}<div class="ag-calls">${S.rec.calls.slice(0, 8).map((c) => callRow(c, null)).join("")}</div>`;
  }

  // ---------------- vaults ----------------
  const FACT_ABI = ["function createVault((address,address,uint24,int24,address),uint256,uint256,uint256) returns (address)", "function createBurn() view returns (uint256)"];
  const VAULT_ABI = ["function fund(uint256)", "function setPaused(bool)", "function setAgentOn(bool)", "function setLimits(uint256,uint256,uint256)", "function applyLimits()", "function withdraw(address,uint256)"];
  // Robinhood Chain (ArciaAgentRH.sol): ETH in, a v3 pool or a v4 key
  const FACT_RH_ABI = ["function createVault3(address,uint256,uint256,uint256) returns (address)", "function createVault4((address,address,uint24,int24,address),uint256,uint256,uint256) returns (address)"];
  const VAULT_RH_ABI = ["function fund() payable", "function setPaused(bool)", "function setAgentOn(bool)", "function setLimits(uint256,uint256,uint256)", "function applyLimits()", "function withdrawETH(uint256)"];
  const isRhV = () => !!(S.vs && S.vs.chain === "rh");
  const parseAmt = (v) => (isRhV() ? parse18(v) : parse6(v));
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (RH()) { if (typeof ensureAltForWrite === "function") await ensureAltForWrite(); }
    else if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => (e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("Cancelled in your wallet.") : String((e && (e.shortMessage || e.reason || e.message)) || tr("The transaction didn't go through.")).slice(0, 180));
  const parse6 = (v) => { try { const a = ethers.parseUnits(String(v || "").trim() || "0", 6); return a > 0n ? a : null; } catch { return null; } };
  const parse18 = (v) => { try { const a = ethers.parseEther(String(v || "").trim() || "0"); return a > 0n ? a : null; } catch { return null; } };
  async function loadVaults() { try { const r = await fetch(`${API}?agent=vaults&t=${S.t}${CQ()}`, { cache: "no-store" }); S.vs = r.ok ? await r.json() : S.vs; } catch { /* keep */ } }
  function tank(v) {
    const full = Math.max(v.dailyCap * 2, v.usdc, v.unit === "ETH" ? 1e-9 : 1), f = Math.min(1, v.usdc / full);
    // v3: a 0x…dEaD mark the flames fly to after a buy
    return `<div class="ag-tank${v.empty ? " dry" : ""}" style="--f:${(f * 100).toFixed(1)}%"><i></i><span class="ag-dead" aria-hidden="true" data-no-i18n>0x…dEaD</span><b data-no-i18n>${v.unit === "ETH" ? ethTxt(v.usdc) + moneyUsd(v.usdc, S.vs) : usd(v.usdc)}</b><small>${T(v.empty ? "Empty — refill it" : v.unit === "ETH" ? "ETH ready" : "USDC ready")}</small></div>`;
  }
  /// v3: what a top-up would do — about how many buys, over about how long, with these limits
  function preview(amt, maxBuy, dailyCap, cooldown, mode, unit) {
    if (!(amt > 0) || !(maxBuy > 0) || !(cooldown > 0)) return "";
    const n = Math.max(1, Math.floor(amt / maxBuy + 1e-9)), perDay = Math.max(1, Math.min(Math.floor(dailyCap / maxBuy + 1e-9) || 1, Math.floor(86400 / cooldown)));
    const hrs = Math.max((n * cooldown) / 3600, (n / perDay) * 24);
    const span = hrs < 1 ? `${Math.max(1, Math.round(hrs * 60))}m` : hrs < 48 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`;
    const L = (o) => o[(window.arcI18n && window.arcI18n.get()) || "en"] || o.en;
    const each = `<b data-no-i18n>${unit === "ETH" ? ethTxt(maxBuy) : usd(maxBuy)}</b>`;
    return L({ en: `About <b data-no-i18n>${n}</b> buy${n === 1 ? "" : "s"} of ${each}, over at least <b data-no-i18n>${span}</b>`, ko: `${each}씩 약 <b data-no-i18n>${n}</b>회 매수, 최소 <b data-no-i18n>${span}</b>`, zh: `每次 ${each}，约 <b data-no-i18n>${n}</b> 次买入，至少 <b data-no-i18n>${span}</b>` })
      + (mode === "dip" || mode === "volume" || !mode ? ` — ${T("dips only, so it can take longer")}` : "") + ".";
  }
  const MILES = [1e6, 1e7, 1e8, 1e9];
  const quick = (v) => (v.unit === "ETH" ? [0.005, 0.01, 0.025] : [5, 10, 25]);
  const MODE_TXT = { dip: ["Dips only", "never after a pump"], steady: ["Steady", "one buy each interval"], volume: ["By volume", "each buy ≤ 2% of hourly volume"] };
  function vaultCard(v) {
    const dec = v.dec || (S.rep && S.rep.dec) || 18;
    const burned = Number(v.burned) / 10 ** dec;
    const mine = me() === v.owner;
    const st = v.status;
    const pend = v.pending;
    const due = pend && Date.now() / 1000 >= pend.readyAt;
    const next = v.lastBuyAt ? v.lastBuyAt + v.cooldown : 0;
    // a scan line when ARCIA looked again since the last paint
    const seen = S.lastStatus[v.vault], looked = st && seen != null && st.at !== seen && !reduce;
    S.lastStatus[v.vault] = st ? st.at : null;
    const m = MODE_TXT[v.mode] || MODE_TXT.dip;
    // v3: burned as a share of the supply, and the next milestone
    const sup = v.supply ? Number(BigInt(v.supply)) / 10 ** dec : null, mNext = MILES.find((x) => x > burned), mPrev = [...MILES].reverse().find((x) => x <= burned) || 0;
    const toNext = Math.max(0, Math.min(1, v.usdc / Math.max(v.maxBuy, 1e-12)));
    return `<div class="ag-v${looked ? " ag-looked" : ""}${v.empty ? " dry" : ""}" data-v="${esc(v.vault)}">
      <div class="ag-v-h"><b>${T("Vault")} ${addrA(v.vault)}</b><span class="ag-pill ${v.paused ? "off" : v.empty ? "dry" : v.agentOn ? "on" : "off"}">${T(v.paused ? "Paused" : v.empty ? "Empty · refill" : v.agentOn ? "ARCIA on" : "ARCIA off")}</span><small>${T("owner")} ${addrA(v.owner)}${mine ? ` <em>${T("you")}</em>` : ""}</small></div>
      <div class="ag-v-body">${tank(v)}
        <div class="ag-v-st"><div><small>${T("Burned so far")}</small><b data-no-i18n>${num(burned)}</b><span data-no-i18n>${esc(v.sym || (S.rep && S.rep.sym) || "")}${sup ? ` · ${(burned / sup * 100).toFixed(2)}% ${esc(tr("of supply"))}` : ""}</span>${mNext ? `<i class="ag-mile" title="${T("next milestone")}" style="--f:${(((burned - mPrev) / (mNext - mPrev)) * 100).toFixed(1)}%"><b></b><em data-no-i18n>${num(mNext)}</em></i>` : ""}</div>
          <div><small>${T("Spent")}</small><b data-no-i18n>${money(v.spent, v.unit === "ETH" ? S.vs : null)}</b><span><span data-no-i18n>${v.buys}</span> ${T("buys")}</span></div>
          <div><small>${T("Vault limits")}</small><b data-no-i18n>${v.unit === "ETH" ? `${ethTxt(v.maxBuy)} / ${ethTxt(v.dailyCap)}` : `${usd(v.maxBuy, 0)} / ${usd(v.dailyCap, 0)}`}</b><span>${T("per buy / per day")} · ${T("one buy every")} <span data-no-i18n>${Math.round(v.cooldown / 60)}m</span></span></div></div></div>
      <div class="ag-v-meta"><span class="ag-mode">${T("Strategy")}: <b>${T(m[0])}</b> <small>${T(m[1])}</small></span>${next > Date.now() / 1000 ? `<span>${T("Next buy possible in")} <b data-no-i18n data-ag-cd="${next}">${inT(next)}</b></span>` : `<span>${T("Can buy now")}</span>`}</div>
      ${st ? `<div class="ag-v-why"><span class="ag-eye" aria-hidden="true"><img src="${AV}" alt="" width="20" height="20"><i></i></span><span>${T(st.why)}</span><em>${T("checked")} <span data-no-i18n>${ago(st.at)}</span></em></div>` : ""}
      ${pend ? `<div class="ag-v-pend">${T("Looser limits queued")}: <b data-no-i18n>${v.unit === "ETH" ? `${ethTxt(pend.maxBuy)} / ${ethTxt(pend.dailyCap)}` : `${usd(pend.maxBuy, 0)} / ${usd(pend.dailyCap, 0)}`} · ${Math.round(pend.cooldown / 60)}m</b> — ${due ? `<button type="button" class="ag-btn sm" data-vact="apply">${T("Apply now")}</button>` : `${T("from")} <span data-no-i18n>${inT(pend.readyAt)}</span>`}</div>` : ""}
      <div class="ag-next"><small>${T(v.empty ? "Refill to wake her up — until her next buy" : "Ready for her next buy")}</small><i style="--f:${(toNext * 100).toFixed(0)}%"><b></b></i><span data-no-i18n>${v.unit === "ETH" ? ethTxt(Math.min(v.usdc, v.maxBuy)) : usd(Math.min(v.usdc, v.maxBuy))} / ${v.unit === "ETH" ? ethTxt(v.maxBuy) : usd(v.maxBuy)}</span></div>
      <div class="ag-quick">${quick(v).map((q) => `<button type="button" class="ag-btn sm" data-vquick="${q}">+${v.unit === "ETH" ? q + " ETH" : "$" + q}</button>`).join("")}</div>
      <div class="ag-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="${v.unit === "ETH" ? "ETH" : "USDC"}" data-vin="fund" aria-label="${T(v.unit === "ETH" ? "ETH to add" : "USDC to add")}"><button type="button" class="ag-btn go" data-vact="fund">${T("Fund vault")}</button>${v.buys ? `<button type="button" class="ag-btn" data-ag-share="vault" data-v="${esc(v.vault)}">${T("Save image")}</button>` : ""}</div>
      <p class="ag-prev" data-vprev></p>
      ${(v.funders || []).length ? `<div class="ag-fund"><small>${T("Top funders")}</small>${v.funders.map((x, i) => `<span><em data-no-i18n>${i + 1}</em>${addrA(x.a)}<b data-no-i18n>${v.unit === "ETH" ? ethTxt(x.amt) : usd(x.amt)}</b>${me() === x.a ? ` <i>${T("you")}</i>` : ""}</span>`).join("")}</div>` : ""}
      ${mine ? `<details class="ag-own"${S.ownOpen.has(v.vault) ? " open" : ""}><summary>${T("Owner controls")}</summary>
        <div class="ag-row"><button type="button" class="ag-btn" data-vact="pause">${T(v.paused ? "Resume" : "Pause")}</button><button type="button" class="ag-btn" data-vact="agent">${T(v.agentOn ? "Turn ARCIA off" : "Turn ARCIA on")}</button></div>
        <div class="ag-row ag-modes ag-seg">${Object.keys(MODE_TXT).map((k) => `<button type="button" class="ag-btn${v.mode === k || (!v.mode && k === "dip") ? " on" : ""}" data-vact="mode" data-mode="${k}">${T(MODE_TXT[k][0])}</button>`).join("")}</div>
        <p class="ag-small">${T("Strategy is signed by your wallet (no gas).")}</p>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="${T("per buy")}" data-vin="lb"><input type="number" min="0" step="any" placeholder="${T("per day")}" data-vin="ld"><input type="number" min="1" step="1" placeholder="${T("minutes")}" data-vin="lc"><button type="button" class="ag-btn" data-vact="limits">${T("Set limits")}</button></div>
        <p class="ag-small">${T("Tighter limits apply at once; looser ones wait an hour.")}</p>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="${v.unit === "ETH" ? "ETH" : "USDC"}" data-vin="wd"><button type="button" class="ag-btn" data-vact="max">${T("Max")}</button><button type="button" class="ag-btn out" data-vact="withdraw">${T("Withdraw")}</button></div>
        <p class="ag-small">${T("Always to your own wallet, at any time, paused or not.")}</p></details>` : ""}
      ${msgOf(v.vault)}</div>`;
  }
  // the last message stays through the refresh that follows an action
  const msgOf = (k) => { const m = S.vmsg && S.vmsg.v === k ? S.vmsg : null; return `<p class="ag-msg ${m ? m.cls : ""}" aria-live="polite">${m ? m.h : ""}</p>`; };
  function vaults(el) {
    const V = S.vs;
    if (!V || !V.live) {
      el.innerHTML = `<div class="ag-empty ag-soon"><b>${T("Burn vaults are coming")}</b><span>${T(RH() ? "On Robinhood Chain they open once ARCIA AGENT's Robinhood contracts are deployed — funded with ETH. The report and the safety call work now." : "They open once the ARCIA AGENT contracts are deployed on Arc — the date isn't decided yet. Everything else here works now.")}</span></div>` + vaultHow();
      return;
    }
    const h = V.health || {};
    const hb = !h.key || !h.match ? `<div class="ag-health bad"><i></i><span>${T("ARCIA's key isn't connected on the server yet — vaults wait until it is.")}${h.key ? ` <small>${!h.valid ? T("The server's ARCIA_AGENT_KEY isn't a valid private key (64 hex characters, no quotes or spaces).") : `${T("The server's key belongs to")} <b data-no-i18n>${esc(h.keyAddr)}</b>, ${T("not ARCIA's operator")} <b data-no-i18n>${short(V.operator)}</b>.`}</small>` : ""}</span></div>`
      : h.low ? `<div class="ag-health warn"><i></i><span>${T("ARCIA is connected, but her wallet is low on gas")} <b data-no-i18n>(${h.gas} ${h.unit || "USDC"})</b></span></div>`
      : `<div class="ag-health ok"><i></i><span>${T("ARCIA is connected")}</span><small data-no-i18n>${short(V.operator)} · ${h.gas} ${h.unit || "USDC"} gas</small></div>`;
    el.innerHTML = hb + (V.paused ? `<div class="ag-crit"><b>${T("Paused by the team")}</b><span>${T("Every vault waits; owners can still withdraw.")}</span></div>` : "") +
      (V.vaults.length ? V.vaults.map(vaultCard).join("") : `<div class="ag-empty">${T("No vault for this token yet.")}</div>`) +
      `<div class="ag-open" id="ag-open">${openForm()}</div>` + vaultHow();
    wireVaults(el);
  }
  const vaultHow = () => `<ol class="ag-how"><li>${T(RH() ? "Anyone funds the vault with ETH." : "Anyone funds the vault with USDC.")}</li><li>${T("ARCIA watches the price and buys in dips — never after a pump, never more than a 3% price move.")}</li><li>${T("Everything she buys goes straight to 0x…dEaD. The vault can't sell.")}</li></ol>`;
  function openForm() {
    const fee = S.vs && S.vs.createBurn && S.vs.createBurn !== "0" ? Number(ethers.formatEther(S.vs.createBurn)) : 0;
    return `<details${S.vs && S.vs.vaults.length ? "" : " open"}><summary>${T("Open a burn vault for this token")}</summary>
      <div class="ag-pools" id="ag-pools"><button type="button" class="ag-btn" data-vact="pools">${T(isRhV() ? "Find its ETH pools" : "Find its USDC pool")}</button></div>
      <div class="ag-row"><label>${T("per buy")}${isRhV() ? " (ETH)" : ""}<input type="number" min="0" step="any" value="${isRhV() ? "0.005" : "5"}" data-oin="b"></label><label>${T("per day")}${isRhV() ? " (ETH)" : ""}<input type="number" min="0" step="any" value="${isRhV() ? "0.025" : "25"}" data-oin="d"></label><label>${T("every (minutes)")}<input type="number" min="1" step="1" value="10" data-oin="c"></label></div>
      <p class="ag-prev" data-oprev></p>
      ${fee ? `<p class="ag-small">${T("Opening a vault burns")} <b data-no-i18n>${num(fee)} $ARCIRCLE</b>.</p>` : ""}
      <button type="button" class="ag-btn go" data-vact="create" disabled>${T("Open vault")}</button>${msgOf("open")}</details>`;
  }
  function wireVaults(el) {
    el.querySelectorAll("[data-vact]").forEach((b) => b.addEventListener("click", () => vaultAct(b)));
    // v3: quick top-ups fill the box; every amount shows what it would buy
    const vOf = (card) => S.vs && S.vs.vaults.find((y) => y.vault === card.dataset.v);
    const prevOf = (card) => { const v = vOf(card), i = card.querySelector('[data-vin="fund"]'), out = card.querySelector("[data-vprev]"); if (v && i && out) out.innerHTML = preview(Number(i.value), v.maxBuy, v.dailyCap, v.cooldown, v.mode, v.unit); };
    el.querySelectorAll("[data-vquick]").forEach((b) => b.addEventListener("click", () => { const card = b.closest(".ag-v"), i = card.querySelector('[data-vin="fund"]'); i.value = b.dataset.vquick; i.focus(); prevOf(card); }));
    el.querySelectorAll('[data-vin="fund"]').forEach((i) => i.addEventListener("input", () => prevOf(i.closest(".ag-v"))));
    const op = el.querySelector(".ag-open");
    if (op) { const go = () => { const g = (k) => Number((op.querySelector(`[data-oin="${k}"]`) || {}).value); const out = op.querySelector("[data-oprev]"); if (out) out.innerHTML = g("d") ? `${T("A day's limit of")} <b data-no-i18n>${isRhV() ? ethTxt(g("d")) : usd(g("d"))}</b>: ${preview(g("d"), g("b"), g("d"), g("c") * 60, "dip", isRhV() ? "ETH" : "USDC")}` : ""; }; op.querySelectorAll("[data-oin]").forEach((i) => i.addEventListener("input", go)); go(); }
    // a new buy since the last paint: flames fly from the tank to 0x…dEaD; a milestone crossed: confetti
    for (const card of el.querySelectorAll(".ag-v")) {
      const v = vOf(card); if (!v) continue;
      const was = S.lastBuys[v.vault]; S.lastBuys[v.vault] = v.buys;
      if (was != null && v.buys > was && !reduce) flames(card.querySelector(".ag-tank"));
      const dec = v.dec || (S.rep && S.rep.dec) || 18, b = Number(v.burned) / 10 ** dec, mk = "arcircle.agent.mile." + v.vault;
      let seen = null; try { seen = Number(localStorage.getItem(mk)); localStorage.setItem(mk, String(b)); } catch { /* fine */ }
      if (seen && !reduce && MILES.some((x) => seen < x && b >= x)) confetti(card);
    }
    // the tank fills with a splash right after someone funds it
    if (S.splash) { const t = el.querySelector(`.ag-v[data-v="${S.splash}"] .ag-tank`); if (t && !reduce) t.classList.add("ag-splash"); S.splash = null; }
    // the owner's controls stay open across refreshes
    el.querySelectorAll(".ag-own").forEach((d) => d.addEventListener("toggle", () => { const v = d.closest(".ag-v").dataset.v; if (d.open) S.ownOpen.add(v); else S.ownOpen.delete(v); }));
  }
  async function findPools(box) {
    box.innerHTML = `<div class="ag-skel"><i></i></div>`;
    if (isRhV()) {
      // Robinhood Chain: its v3 WETH pools and its v4 ETH / WETH pools (api/_agent.mjs poolsRh)
      let r = null;
      try { const x = await fetch(`${API}?agent=pools&t=${S.t}&chain=rh`, { cache: "no-store" }); r = x.ok ? await x.json() : null; } catch { r = null; }
      const pools = (r && r.pools) || [];
      S.liq = pools;
      if (!pools.length) { box.innerHTML = `<div class="ag-empty">${T("No Uniswap pool against ETH found for this token.")}</div>`; return; }
      box.innerHTML = pools.map((p, i) => `<label class="ag-pool"><input type="radio" name="ag-pool" value="${i}"${i === 0 ? " checked" : ""}><b>${T(p.venue || (p.v === 3 ? "Uniswap v3" : "Uniswap v4"))}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.liqUsd ? " · " + big$(p.liqUsd) : ""}</span><small data-no-i18n>${short(p.v === 3 ? p.pool : p.id)}</small></label>`).join("");
      const c = panel.querySelector('[data-vact="create"]'); if (c) c.disabled = false;
      return;
    }
    let j = null;
    for (let i = 0; i < 8; i++) {
      try { const r = await fetch(`/api/social?liq=${S.t}`, { cache: "no-store" }); j = r.ok ? await r.json() : null; } catch { j = null; }
      if (j && j.done) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    const usdcA = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC);
    const pools = ((j && j.pools) || []).filter((p) => p.key && [p.key.currency0, p.key.currency1].map(lc).includes(usdcA));
    S.liq = pools;
    if (!pools.length) { box.innerHTML = `<div class="ag-empty">${T("No Uniswap v4 pool against USDC found for this token.")}</div>`; return; }
    box.innerHTML = pools.map((p, i) => `<label class="ag-pool"><input type="radio" name="ag-pool" value="${i}"${i === 0 ? " checked" : ""}><b>${T(p.venue || "Uniswap v4")}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.dex && p.dex.liqUsd ? " · " + big$(p.dex.liqUsd) : ""}</span><small data-no-i18n>${short(p.id)}</small></label>`).join("");
    const c = panel.querySelector('[data-vact="create"]'); if (c) c.disabled = false;
  }
  async function vaultAct(b) {
    const k = b.dataset.vact, card = b.closest(".ag-v"), open = b.closest(".ag-open");
    const msgEl = (card || open || b.parentElement).querySelector(".ag-msg");
    const msg = (h, cls = "") => { S.vmsg = { v: card ? card.dataset.v : "open", h, cls }; if (msgEl) { msgEl.className = "ag-msg " + cls; msgEl.innerHTML = h; } };
    if (k === "pools") { findPools($("ag-pools")); return; }
    const v = card ? card.dataset.v : null;
    const val = (n) => { const i = (card || open).querySelector(`[data-vin="${n}"],[data-oin="${n}"]`); return i ? i.value : ""; };
    if (k === "max") { const x = S.vs.vaults.find((y) => y.vault === v); if (x) card.querySelector('[data-vin="wd"]').value = x.usdc; return; }
    if (S.acting) { msg(T("Wait for the last transaction to finish."), "bad"); return; }
    S.acting = true;
    panel.querySelectorAll(".ag-v .ag-btn, .ag-open .ag-btn").forEach((x) => { x.disabled = true; });
    try {
      const sg = await signer();
      if (k === "mode") {
        const mode = b.dataset.mode, issued = new Date().toISOString();
        msg(T("Sign in your wallet…"));
        const signature = await sg.signMessage(`ARCIRCLE PAD — ARCIA AGENT vault strategy\nVault: ${lc(v)}\nStrategy: ${mode}\nIssued: ${issued}`);
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "agent-mode", vault: v, mode, issued, signature, ...(isRhV() ? { chain: "rh" } : {}) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { msg(esc(j.error || T("Couldn't save — try again.")), "bad"); return; }
        const x = S.vs.vaults.find((y) => y.vault === v); if (x) x.mode = mode;
        msg(T("Strategy saved. ARCIA uses it from her next check."), "ok");
        if (S.tab === "vault") tabs();
        return;
      }
      if (k === "create") {
        const p = S.liq && S.liq[Number((panel.querySelector('input[name="ag-pool"]:checked') || {}).value || 0)];
        const mb = parseAmt(val("b")), md = parseAmt(val("d")), cd = Math.round(Number(val("c")) * 60);
        if (!p || !mb || !md || !(cd >= 60)) { msg(T("Pick a pool and set the limits (at least 1 minute between buys)."), "bad"); return; }
        if (md < mb) { msg(T("The day's limit can't be below one buy."), "bad"); return; }
        const f = new ethers.Contract(S.vs.factory, isRhV() ? FACT_RH_ABI : FACT_ABI, sg);
        const fee = BigInt(S.vs.createBurn || "0");
        if (fee > 0n) {
          const a = new ethers.Contract(arcircleOf(), ERC20, sg);
          if ((await a.allowance(state.account, S.vs.factory)) < fee) { msg(T("Approve the $ARCIRCLE to burn in your wallet…")); await (await a.approve(S.vs.factory, fee)).wait(); }
        }
        msg(T("Confirm in your wallet…"));
        const key = p.key ? [p.key.currency0, p.key.currency1, p.key.fee, p.key.tickSpacing, p.key.hooks] : null;
        const tx = isRhV() ? (p.v === 3 ? await f.createVault3(p.pool, mb, md, cd) : await f.createVault4(key, mb, md, cd)) : await f.createVault(key, mb, md, cd);
        msg(`${T("Opening…")} ${txa(tx.hash)}`);
        await tx.wait();
        msg(`${T("Vault open. Fund it and ARCIA starts watching.")} ${txa(tx.hash)}`, "ok");
        vboard();
      } else if (k === "fund" && isRhV()) {
        // Robinhood Chain: ETH straight in (the vault keeps it as WETH)
        const amt = parse18(val("fund"));
        if (!amt) { msg(T("Enter an amount of ETH."), "bad"); return; }
        if ((await sg.provider.getBalance(state.account)) < amt) { msg(T("This wallet doesn't hold that much ETH."), "bad"); return; }
        msg(T("Confirm in your wallet…"));
        const tx = await new ethers.Contract(v, VAULT_RH_ABI, sg).fund({ value: amt });
        await tx.wait();
        msg(`${T("Added.")} ${txa(tx.hash)}`, "ok");
        S.splash = v;
      } else if (k === "fund") {
        const amt = parse6(val("fund"));
        if (!amt) { msg(T("Enter an amount of USDC."), "bad"); return; }
        const u = new ethers.Contract((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC, ERC20, sg);
        if ((await u.balanceOf(state.account)) < amt) { msg(T("This wallet doesn't hold that much USDC."), "bad"); return; }
        if ((await u.allowance(state.account, v)) < amt) { msg(T("Approve the USDC in your wallet…")); await (await u.approve(v, amt)).wait(); }
        msg(T("Confirm in your wallet…"));
        const tx = await new ethers.Contract(v, VAULT_ABI, sg).fund(amt);
        await tx.wait();
        msg(`${T("Added.")} ${txa(tx.hash)}`, "ok");
        S.splash = v;
      } else {
        const c = new ethers.Contract(v, isRhV() ? VAULT_RH_ABI : VAULT_ABI, sg), x = S.vs.vaults.find((y) => y.vault === v);
        let tx;
        msg(T("Confirm in your wallet…"));
        if (k === "pause") tx = await c.setPaused(!x.paused);
        else if (k === "agent") tx = await c.setAgentOn(!x.agentOn);
        else if (k === "apply") tx = await c.applyLimits();
        else if (k === "limits") {
          const mb = parseAmt(val("lb")), md = parseAmt(val("ld")), cd = Math.round(Number(val("lc")) * 60);
          if (!mb || !md || !(cd >= 60) || md < mb) { msg(T("Per buy, per day (not below one buy) and at least 1 minute between buys."), "bad"); return; }
          tx = await c.setLimits(mb, md, cd);
        } else if (k === "withdraw") {
          const amt = parseAmt(val("wd"));
          if (!amt) { msg(T(isRhV() ? "Enter an amount of ETH." : "Enter an amount of USDC."), "bad"); return; }
          tx = isRhV() ? await c.withdrawETH(amt) : await c.withdraw((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC, amt);
        }
        if (tx) { await tx.wait(); msg(`${T("Done.")} ${txa(tx.hash)}`, "ok"); }
      }
      await loadVaults();
      if (S.tab === "vault") tabs(); // the message survives the refresh (msgOf)
    } catch (e) { msg(esc(errText(e)), "bad"); }
    finally {
      S.acting = false;
      // whatever is on the page now (a refresh may have replaced the buttons)
      panel.querySelectorAll(".ag-v .ag-btn, .ag-open .ag-btn").forEach((x) => { x.disabled = x.dataset.vact === "create" && !(S.liq && S.liq.length); });
    }
  }

  // ---------------- actions ----------------
  function actions(el) {
    const acts = (S.vs && S.vs.recent) || [];
    const dec = (S.rep && S.rep.dec) || 18;
    const seen = S.seenActs; S.seenActs = new Set(acts.map((a) => a.tx));
    if (!acts.length) { el.innerHTML = `<div class="ag-empty">${T(S.vs && S.vs.live ? "No buy & burn yet for this token. Once a vault is funded, ARCIA's buys show here with their transactions." : "ARCIA's buys & burns show here once vaults are open.")}</div>`; return; }
    const fresh = seen ? acts.filter((a) => !seen.has(a.tx)) : [];
    el.innerHTML = `<div class="ag-acts">${acts.map((a) => `<div class="ag-act${seen && !seen.has(a.tx) && !reduce ? " fresh" : ""}"><i class="ag-flame" aria-hidden="true"></i><div><b>${T("Bought and burned")} <span data-no-i18n>${num(Number(a.burned) / 10 ** dec)} ${esc((S.rep && S.rep.sym) || "")}</span></b><small><span data-no-i18n>${usd(a.usd)}${a.eth ? " · " + ethTxt(a.eth) : ""}</span> · ${T(String(a.why || "").split(" · ")[0])} · <span data-no-i18n>${ago(a.ts)}</span></small></div>${txa(a.tx, "tx", a.ch)}</div>`).join("")}</div>`;
    // the token's very first burn gets a little celebration
    if (fresh.length && acts.length === fresh.length && !reduce) confetti(el);
  }
  function flames(tank) {
    if (!tank) return;
    for (let i = 0; i < 6; i++) { const f = document.createElement("i"); f.className = "ag-ember"; f.style.cssText = `left:${30 + Math.random() * 40}%;animation-delay:${i * 0.08}s;--dx:${(Math.random() - 0.5) * 30}px`; tank.appendChild(f); setTimeout(() => f.remove(), 1600); }
    const d = tank.querySelector(".ag-dead"); if (d) { d.classList.remove("hit"); void d.offsetWidth; d.classList.add("hit"); }
  }
  function confetti(host) {
    const box = document.createElement("div");
    box.className = "ag-confetti"; box.setAttribute("aria-hidden", "true");
    const cols = ["#39ff88", "#5b8cff", "#35d8d0", "#ffc861", "#ff9b5a"];
    for (let i = 0; i < 36; i++) { const b = document.createElement("i"); b.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.25}s`; box.appendChild(b); }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  }

  // ---------------- share images (drawn here, saved or shared as a PNG) ----------------
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function shareImage(kind, vaultAddr) {
    const r = S.rep; if (!r) return;
    const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#050a14"); bg.addColorStop(1, "#071410"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, rad, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    glow(160, 120, 520, "rgba(91,140,255,.22)"); glow(1100, 560, 520, "rgba(57,255,136,.16)");
    const av = await loadImg(AV);
    if (av) { g.save(); g.beginPath(); g.arc(150, 150, 70, 0, Math.PI * 2); g.clip(); g.drawImage(av, 80, 80, 140, 140); g.restore(); g.lineWidth = 5; g.strokeStyle = "#39ff88"; g.beginPath(); g.arc(150, 150, 72, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#8fe9bd"; g.font = "700 26px Sora, sans-serif"; g.fillText("ARCIA AGENT", 250, 128);
    g.fillStyle = "#ffffff"; g.font = "800 64px Sora, sans-serif"; g.fillText("$" + (r.sym || "TOKEN"), 250, 196);
    const c = r.call || {}, k = CALLS[c.call] || ["Reading", ""];
    const col = { safe: "#39ff88", caution: "#ffc861", risky: "#ff6e5a" }[c.call] || "#9dcbff";
    if (kind === "vault") {
      const v = (S.vs && S.vs.vaults || []).find((x) => x.vault === vaultAddr) || {};
      const burned = Number(v.burned || 0) / 10 ** (v.dec || r.dec || 18);
      g.fillStyle = "#ffc861"; g.font = "800 92px Sora, sans-serif"; g.fillText(num(burned), 80, 360);
      g.fillStyle = "#dbe6ee"; g.font = "600 34px Inter, sans-serif"; g.fillText(`$${r.sym} bought and burned by ARCIA`, 80, 414);
      g.fillStyle = "#9fb0bd"; g.font = "500 28px Inter, sans-serif"; g.fillText(`${v.unit === "ETH" ? ethTxt(v.spent) : usd(v.spent)} spent · ${v.buys || 0} buys · every token sent to 0x…dEaD`, 80, 466);
    } else {
      g.lineWidth = 6; g.strokeStyle = col; g.fillStyle = "rgba(255,255,255,.04)";
      const txt = tr(k[0]).toUpperCase(); g.font = "800 60px Sora, sans-serif"; const tw = g.measureText(txt).width;
      g.beginPath(); g.roundRect(80, 270, tw + 60, 96, 18); g.fill(); g.stroke();
      g.fillStyle = col; g.fillText(txt, 110, 340);
      g.fillStyle = "#dbe6ee"; g.font = "600 30px Inter, sans-serif"; g.fillText("24-hour safety call · graded in public", tw + 170, 312);
      g.fillStyle = "#9fb0bd"; g.font = "500 26px Inter, sans-serif"; (c.why || []).slice(0, 3).forEach((w, i) => g.fillText("· " + w, tw + 170, 354 + i * 36));
      if (c.hash) { g.fillStyle = "#6f7e8a"; g.font = "500 22px ui-monospace, monospace"; g.fillText("hash " + c.hash.slice(0, 18) + "…", 80, 420); }
    }
    g.fillStyle = "#6f7e8a"; g.font = "500 24px Inter, sans-serif"; g.fillText("arcircle.app/arc#agent · not financial advice", 80, 580);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `arcia-agent-${(r.sym || "token").toLowerCase()}.png`, { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { /* fall back to a download */ }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, "image/png");
  }

  /// v3: ARCIA's week as an image — her calls by kind, how they were graded, and the vaults' buys & burns
  async function weekImage() {
    let w = null; try { const r = await fetch(`${API}?agent=week`); w = r.ok ? await r.json() : null; } catch { w = null; }
    if (!w) { toast(tr("The week isn't reachable right now.")); return; }
    const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#050a14"); bg.addColorStop(1, "#071410"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, rad, c) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    glow(160, 120, 520, "rgba(91,140,255,.22)"); glow(1100, 560, 520, "rgba(57,255,136,.16)");
    const av = await loadImg(AV);
    if (av) { g.save(); g.beginPath(); g.arc(130, 130, 60, 0, Math.PI * 2); g.clip(); g.drawImage(av, 70, 70, 120, 120); g.restore(); g.lineWidth = 5; g.strokeStyle = "#39ff88"; g.beginPath(); g.arc(130, 130, 62, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#8fe9bd"; g.font = "700 26px Sora, sans-serif"; g.fillText("ARCIA AGENT · MY WEEK", 220, 110);
    g.fillStyle = "#ffffff"; g.font = "800 54px Sora, sans-serif"; g.fillText(`${w.calls.total} safety calls`, 220, 170);
    const frac = (a, b) => (b ? `${a}/${b}` : "—"), G = w.graded;
    [["SAFE", w.calls.safe, `right ${frac(G.safeRight, G.safe)}`, "#39ff88"], ["CAUTION", w.calls.caution, `held ${frac(G.cautionHeld, G.caution)}`, "#ffc861"], ["RISKY", w.calls.risky, `right ${frac(G.riskyRight, G.risky)}`, "#ff6e5a"], ["BUY & BURNS", w.buys, "from the vaults", "#ffd88a"]].forEach(([k, v, sub, col], i) => {
      const x = 70 + i * 270, y = 250;
      g.fillStyle = "rgba(255,255,255,.04)"; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, 250, 190, 22); g.fill(); g.stroke();
      g.fillStyle = col; g.font = "700 20px Sora, sans-serif"; g.fillText(k, x + 24, y + 44);
      g.fillStyle = "#fff"; g.font = "800 64px Sora, sans-serif"; g.fillText(String(v), x + 24, y + 120);
      g.fillStyle = "#9fb0bd"; g.font = "500 22px Inter, sans-serif"; g.fillText(sub, x + 24, y + 160);
    });
    const b0 = (w.burns || [])[0];
    g.fillStyle = "#dbe6ee"; g.font = "600 26px Inter, sans-serif"; g.fillText(b0 ? `${num(Number(BigInt(b0.burned)) / 1e18)} burned this week${b0.ch === "rh" ? " on Robinhood Chain" : " on Arc"} · ${usd(b0.usd)}` : "Every call's hash is written on Arc before its outcome", 70, 510);
    g.fillStyle = "#6f7e8a"; g.font = "500 24px Inter, sans-serif"; g.fillText("arcircle.app/arc#agent · not financial advice", 70, 580);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "arcia-agent-week.png", { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { /* download instead */ }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, "image/png");
  }

  // ---------------- followed tokens: new calls and burns (in-page, and as notifications when allowed) ----------------
  function toast(text) {
    let box = $("ag-toasts");
    if (!box) { box = document.createElement("div"); box.id = "ag-toasts"; box.className = "ag-toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "ag-toast"; t.innerHTML = `<img src="${AV}" alt="" width="28" height="28"><span data-no-i18n>${esc(text)}</span>`;
    box.appendChild(t); setTimeout(() => t.classList.add("out"), 6000); setTimeout(() => t.remove(), 6600);
  }
  async function checkFollows() {
    const l = watch(); if (!l.length) return;
    let seen = {}; try { seen = JSON.parse(localStorage.getItem(SK) || "{}") || {}; } catch { seen = {}; }
    const first = !seen.init;
    let R = null, V = null;
    try {
      const [a, b, c] = await Promise.all([fetch(`${API}?agent=record`), fetch(`${API}?agent=vaults`), l.some((w) => w.ch === "rh") ? fetch(`${API}?agent=vaults&chain=rh`) : null]);
      R = a.ok ? await a.json() : null; V = b.ok ? await b.json() : null;
      const V2 = c && c.ok ? await c.json() : null;
      if (V2 && V2.live) V = { live: true, recent: [...((V && V.live && V.recent) || []), ...V2.recent.map((x) => ({ ...x, ch: "rh" }))] };
    } catch { return; }
    const out = [];
    for (const w of l) {
      const wc = w.ch === "rh" ? "rh" : "arc";
      const c = R && R.calls.find((x) => x.t === w.t && (x.ch === "rh" ? "rh" : "arc") === wc);
      if (c) {
        const key = c.id + (c.graded ? ":g" : "");
        if (!first && seen["c:" + w.t] !== key) out.push(c.graded ? `${c.sym || short(w.t)}: ${tr("ARCIA's call was graded")} — ${tr(c.graded.right ? "called right" : c.graded.right === false ? "called wrong" : c.graded.bad ? "went bad" : c.graded.bad === false ? "held" : "not graded")}` : `${c.sym || short(w.t)}: ${tr("new safety call")} — ${tr((CALLS[c.call] || [c.call])[0])}`);
        seen["c:" + w.t] = key;
      }
      const acts = V && V.live ? V.recent.filter((a) => a.token === w.t && (a.ch === "rh" ? "rh" : "arc") === wc) : [];
      if (acts.length) {
        if (!first && seen["a:" + w.t] !== acts[0].tx) out.push(`${acts[0].sym || short(w.t)}: ${tr("ARCIA bought and burned")} ${num(Number(acts[0].burned) / 10 ** (acts[0].dec || 18))}`);
        seen["a:" + w.t] = acts[0].tx;
      }
    }
    seen.init = 1;
    try { localStorage.setItem(SK, JSON.stringify(seen)); } catch { /* fine */ }
    for (const m of out.slice(0, 4)) {
      toast(m);
      if (notifyOn() && "Notification" in window && Notification.permission === "granted" && document.hidden) { try { new Notification("ARCIA AGENT", { body: m, icon: AV }); } catch { /* fine */ } }
    }
  }

  // ---------------- boot ----------------
  function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      const lm = $("ag-lede-more"); if (lm) lm.addEventListener("click", () => { const h = lm.closest(".ag-hero"); h.classList.toggle("open"); lm.textContent = tr(h.classList.contains("open") ? "Less" : "More"); });
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      if (m) { $("ag-in").value = m[1]; wake(m[1]); }
    }
    if (!S.cd) {
      S.cd = setInterval(() => { panel.querySelectorAll("[data-ag-cd]").forEach((e) => { e.textContent = inT(Number(e.dataset.agCd)); }); }, 1000);
      setInterval(checkFollows, 90000); setTimeout(checkFollows, 4000);
    }
    clearInterval(S.timer);
    S.timer = setInterval(async () => {
      if (!panel.classList.contains("active") || document.hidden || !S.t || !S.rep) return;
      await loadVaults();
      if (S.tab === "vault" && !S.acting && !panel.querySelector(".ag-v input:focus, .ag-open input:focus")) tabs();
      if (S.tab === "actions") tabs();
      if ((S.vbN = (S.vbN || 0) + 1) % 4 === 0) vboard();
    }, 30000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "agent") show(); else clearInterval(S.timer); });
  // another page sends a token here (/arc#agent?t=0x…: the scanner, a coin page)
  window.addEventListener("hashchange", () => {
    const m = /^#agent\?(.*)$/.exec(location.hash);
    if (!m || !S.booted) return;
    const q = new URLSearchParams(m[1]), t = q.get("t"), c = q.get("c") === "rh" ? "rh" : "arc";
    if (!t || !isAddr(t)) { if (c === "rh" && !RH()) setChain("rh"); return; }
    if (c !== CH) setChain(c);
    if (lc(t) !== S.t || !S.rep) { $("ag-in").value = t; wake(t); }
  });
  /// the switch: a different chain starts a fresh page (the record stays the same — it holds both)
  function setChain(c) {
    c = c === "rh" ? "rh" : "arc";
    if (c === CH) return;
    CH = c;
    try { localStorage.setItem(CK, CH); } catch { /* private window */ }
    clearTimeout(S.retry);
    S.t = null; S.rep = null; S.vs = null; S.liq = null; S.seenActs = null; S.tries = 0; S.busy = false; S.vmsg = null;
    panel.classList.remove("ag-hasrep", "ag-landopen");
    if (S.booted) frame();
  }
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); if (S.rep) render(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcAgent = { wake, state: S, setChain, chain: () => CH };
})();
