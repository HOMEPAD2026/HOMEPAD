/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-agent.js — ARCIA AGENT, an ARCIRCLE PAD utility (arcpad.html#agent).
// Paste an Arc token's address and ARCIA works on it:
//   · report     Token Scanner v3 read in full, ARCIA's own take, the numbers that matter (GET /api/desk?agent=0x…)
//   · the call   Safe / Caution / Risky for the next 24h, recorded with a hash and graded in public (?agent=record)
//   · vaults     per-token burn vaults (contracts/contracts/ArciaAgent.sol, ?agent=vaults&t=): anyone funds with USDC,
//                ARCIA decides when to buy, and everything bought goes to 0x…dEaD; the owner sets limits and can
//                pause, turn ARCIA off or withdraw at any time
//   · actions    every buy & burn ARCIA made for the token, with its transaction
// Nothing on this page can make ARCIA buy: only a vault's on-chain limits and the agent's rules (api/_agent.mjs) do.
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
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h, label) => (h ? `<a class="ag-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const addrA = (a) => (a ? `<a class="ag-tx" href="${EXPL("address", a)}" target="_blank" rel="noopener" data-no-i18n>${short(a)} ↗</a>` : "—");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big$ = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : usd(n, n < 10 ? 2 : 0));
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const pc = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m` : `${Math.floor(d / 86400)}d`; };
  const inT = (s) => { const d = Math.max(0, s - Date.now() / 1000); return d < 3600 ? `${Math.ceil(d / 60)}m` : `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`; };
  const API = "/api/desk";
  const USDC = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const AV = "/images/arcia-avatar-96.jpg";
  const CALLS = { safe: ["Safe", "safe"], caution: ["Caution", "caution"], risky: ["Risky", "risky"] };
  const S = { t: null, rep: null, rec: null, vs: null, tab: "overview", busy: false, booted: false, timer: 0, seenActs: null, liq: null, ownOpen: new Set() };

  // ---------------- a per-viewer watchlist (convenience only) ----------------
  const WK = "arcircle.agent.watch";
  const watch = () => { try { const l = JSON.parse(localStorage.getItem(WK) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
  const saveWatch = (l) => { try { localStorage.setItem(WK, JSON.stringify(l.slice(0, 12))); } catch { /* private window */ } };
  const watching = (t) => watch().some((w) => w.t === lc(t));

  // ---------------- skeleton ----------------
  function frame() {
    $("ag-body").innerHTML = `
      <div class="ag-summon" id="ag-summon">
        <div class="ag-sum-av"><img src="${AV}" alt="" width="56" height="56"><i></i></div>
        <form class="ag-form" id="ag-form" autocomplete="off">
          <input id="ag-in" type="text" inputmode="text" spellcheck="false" placeholder="${T("Paste an Arc token address (0x…)")}" aria-label="${T("Arc token address")}">
          <button type="submit" class="ag-go" id="ag-go"><span>${T("Wake ARCIA")}</span></button>
        </form>
        <div class="ag-chips" id="ag-chips"></div>
      </div>
      <div class="ag-think" id="ag-think" hidden></div>
      <div class="ag-res" id="ag-res"></div>
      <div class="ams-card ag-board" id="ag-board"></div>`;
    $("ag-form").addEventListener("submit", (e) => { e.preventDefault(); wake($("ag-in").value.trim()); });
    $("ag-in").addEventListener("paste", () => setTimeout(() => { const v = $("ag-in").value.trim(); if (isAddr(v)) wake(v); }, 0));
    if (!S.wired) { S.wired = true; panel.addEventListener("click", onClick); }
    chips();
    board();
  }
  function chips() {
    const l = watch();
    $("ag-chips").innerHTML = `<button type="button" class="ag-chip ag-chip-arc" data-ag-t="${ARCIRCLE}" data-no-i18n>$ARCIRCLE</button>` +
      l.map((w) => `<button type="button" class="ag-chip ${w.call ? "c-" + w.call : ""}" data-ag-t="${esc(w.t)}"><span data-no-i18n>${esc(w.sym || short(w.t))}</span>${w.call ? `<i>${T(CALLS[w.call] ? CALLS[w.call][0] : w.call)}</i>` : ""}</button>`).join("");
  }
  function onClick(e) {
    const t = e.target.closest("[data-ag-t]");
    if (t) { $("ag-in").value = t.dataset.agT; wake(t.dataset.agT); return; }
    const tab = e.target.closest("[data-ag-tab]");
    if (tab) { S.tab = tab.dataset.agTab; tabs(); return; }
    const f = e.target.closest("[data-ag-follow]");
    if (f) { follow(); return; }
    const cp = e.target.closest("[data-ag-copy]");
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.agCopy); cp.classList.add("done"); setTimeout(() => cp.classList.remove("done"), 1200); } catch { /* no clipboard */ } }
  }
  function follow() {
    if (!S.rep) return;
    let l = watch();
    if (watching(S.t)) l = l.filter((w) => w.t !== S.t);
    else l = [{ t: S.t, sym: S.rep.sym, call: S.rep.call && S.rep.call.call, at: Date.now() }, ...l];
    saveWatch(l); chips(); card();
  }

  // ---------------- wake: the thought stream while the report loads ----------------
  const THOUGHTS = ["Reading the contract", "Checking who holds it", "Reading its pools and liquidity", "Running Token Scanner v3", "Weighing the risks", "Making my call"];
  async function wake(t) {
    t = String(t || "").trim();
    if (!isAddr(t)) { think([], "Paste a token's contract address — 0x followed by 40 characters."); return; }
    if (S.busy) return;
    S.busy = true; S.t = lc(t); S.rep = null; S.vs = null; S.seenActs = null;
    try { history.replaceState(null, "", "#agent?t=" + S.t); } catch { /* fine */ }
    $("ag-res").innerHTML = ""; $("ag-summon").classList.add("waking");
    let i = 0;
    const tick = setInterval(() => { i = Math.min(THOUGHTS.length - 1, i + 1); think(THOUGHTS.slice(0, i + 1)); }, reduce ? 50 : 650);
    think(THOUGHTS.slice(0, 1));
    let rep = null, err = null;
    try {
      const [r1, r2] = await Promise.all([fetch(`${API}?agent=${S.t}`), fetch(`${API}?agent=vaults&t=${S.t}`).catch(() => null)]);
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
    setTimeout(() => { $("ag-think").hidden = true; render(); }, reduce ? 0 : 350);
  }
  function think(lines, error = null, done = false) {
    const el = $("ag-think");
    el.hidden = false;
    el.innerHTML = error ? `<div class="ag-th bad">${T(error)}</div>` : lines.map((l, k) => `<div class="ag-th ${done || k < lines.length - 1 ? "ok" : "now"}"><i></i>${T(l)}…</div>`).join("");
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
  }
  function card() {
    const r = S.rep, c = r.call || {}, k = CALLS[c.call] || ["—", ""];
    const el = $("ag-card");
    const graded = c.graded;
    el.className = `ams-card ag-card k-${k[1]}`;
    el.innerHTML = `
      <div class="ag-c-top"><div class="ag-av k-${k[1]}"><img src="${AV}" alt="" width="64" height="64"></div>
        <div class="ag-c-id"><b data-no-i18n>${esc(r.sym || short(r.t))}</b><small data-no-i18n>${esc(r.name || "")}</small>${addrA(r.t)}</div>
        <button type="button" class="ag-follow ${watching(r.t) ? "on" : ""}" data-ag-follow aria-pressed="${watching(r.t)}">${T(watching(r.t) ? "Following" : "Follow")}</button></div>
      <div class="ag-call"><span class="ag-stamp k-${k[1]}">${T(k[0])}</span><div><small>${T("ARCIA's 24-hour safety call")}</small><ul>${(c.why || []).map((w) => `<li data-no-i18n>${esc(w)}</li>`).join("")}</ul></div></div>
      <p class="ag-take" id="ag-take" data-no-i18n></p>
      <div class="ag-c-meta">
        <span>${T("Called by ARCIA")} <b data-no-i18n>${ago(c.at)}</b></span>
        <span>${graded ? `${T("Graded result")}: <b class="${graded.right === true ? "up" : graded.right === false ? "dn" : ""}">${T(graded.right === true ? "called right" : graded.right === false ? "called wrong" : "not graded")}</b>` : `${T("Graded in")} <b data-no-i18n>${inT(c.until)}</b>`}</span>
        ${c.hash ? `<button type="button" class="ag-hash" data-ag-copy="${esc(c.hash)}" title="${T("The call's hash, recorded before the outcome")}"><span data-no-i18n>#${esc(c.hash.slice(2, 10))}</span></button>` : ""}
      </div>
      <p class="ag-small">${T("A call is about risk over the next 24 hours, never about price direction — not a signal to buy or sell.")}</p>`;
    typeTake((r.take && r.take.text) || "");
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
      ${f.critical && f.critical.length ? `<div class="ag-crit"><b>${T("Critical")}</b>${f.critical.map((c) => `<span>${T(c)}</span>`).join("")}</div>` : ""}
      ${(r.checks || []).length ? `<h4>${T("What ARCIA would watch")}</h4><ul class="ag-issues">${r.checks.map((c) => `<li class="s-${esc(c.status)}"><b>${T(c.title)}</b>${c.detail ? `<small>${T(c.detail)}</small>` : ""}</li>`).join("")}</ul>` : `<p class="ag-small">${T("No warnings from the scanner.")}</p>`}
      <p class="ag-small"><a href="/arc#scanner?t=${esc(r.t)}" data-arc-tab="scanner">${T("Open the full Token Scanner report")} →</a> · ${T("read by ARCIA")} <span data-no-i18n>${ago(r.at)}</span></p>`;
    if (!reduce) requestAnimationFrame(() => el.querySelector(".ag-r-fg").classList.add("on"));
    else el.querySelector(".ag-r-fg").classList.add("on");
  }

  // ---------------- the public record ----------------
  async function loadRecord() {
    try { const r = await fetch(`${API}?agent=record`); S.rec = r.ok ? await r.json() : null; } catch { S.rec = null; }
  }
  function statLine(st) {
    const p = (x) => (x.n ? Math.round((x.right / x.n) * 100) + "%" : "—");
    return `<div class="ag-stats"><div><small>${T("Safe calls right")}</small><b data-no-i18n>${p(st.safe)}</b><span data-no-i18n>${st.safe.right}/${st.safe.n}</span></div>
      <div><small>${T("Risky calls right")}</small><b data-no-i18n>${p(st.risky)}</b><span data-no-i18n>${st.risky.right}/${st.risky.n}</span></div>
      <div><small>${T("Calls made")}</small><b data-no-i18n>${st.total}</b><span><span data-no-i18n>${st.open}</span> ${T("still open")}</span></div></div>`;
  }
  function callRow(c) {
    const k = CALLS[c.call] || ["—", ""], g = c.graded;
    const res = !g ? `<em class="ag-wait">${T("still open")} · <span data-no-i18n>${inT(c.until)}</span></em>` : g.void ? `<em>${T("no market to grade")}</em>` : g.right == null ? `<em>${T("not graded")}</em>`
      : `<em class="${g.right ? "up" : "dn"}">${T(g.right ? "called right" : "called wrong")} <span data-no-i18n>${pc(g.dPx, 0)}</span></em>`;
    return `<button type="button" class="ag-callrow ${g ? "flip" : ""}" data-ag-t="${esc(c.t)}"><span class="ag-stamp sm k-${k[1]}">${T(k[0])}</span><b data-no-i18n>${esc(c.sym || short(c.t))}</b><small data-no-i18n>${ago(c.at)}</small>${res}</button>`;
  }
  async function record(el) {
    el.innerHTML = `<div class="ag-skel"><i></i><i></i></div>`;
    await loadRecord();
    if (S.tab !== "record") return;
    const R = S.rec;
    if (!R) { el.innerHTML = `<div class="ag-empty">${T("The record isn't reachable right now.")}</div>`; return; }
    const mine = R.calls.filter((c) => c.t === S.t);
    el.innerHTML = statLine(R.stats) +
      (mine.length ? `<h4>${T("This token")}</h4><div class="ag-calls">${mine.map(callRow).join("")}</div>` : "") +
      `<h4>${T("Latest calls")}</h4><div class="ag-calls">${R.calls.slice(0, 20).map(callRow).join("") || `<div class="ag-empty">${T("No calls yet.")}</div>`}</div>
      <p class="ag-small">${T("Safe is right if the token didn't go bad in 24 hours; Risky is right if it did. \"Bad\" = the price fell 60% or more, or the liquidity 50% or more. Each call's hash is recorded before the outcome.")}</p>`;
  }
  async function board() {
    await loadRecord();
    const el = $("ag-board");
    if (!el) return;
    if (!S.rec || !S.rec.stats.total) { el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3></div><div class="ag-empty">${T("ARCIA's calls start with the first token someone pastes here.")}</div>`; return; }
    el.innerHTML = `<div class="dk-h"><h3>${T("ARCIA's record")}</h3><span class="dk-sub">${T("every safety call, graded in public")}</span></div>${statLine(S.rec.stats)}<div class="ag-calls">${S.rec.calls.slice(0, 8).map(callRow).join("")}</div>`;
  }

  // ---------------- vaults ----------------
  const FACT_ABI = ["function createVault((address,address,uint24,int24,address),uint256,uint256,uint256) returns (address)", "function createBurn() view returns (uint256)"];
  const VAULT_ABI = ["function fund(uint256)", "function setPaused(bool)", "function setAgentOn(bool)", "function setLimits(uint256,uint256,uint256)", "function applyLimits()", "function withdraw(address,uint256)"];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => (e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("Cancelled in your wallet.") : String((e && (e.shortMessage || e.reason || e.message)) || tr("The transaction didn't go through.")).slice(0, 180));
  const parse6 = (v) => { try { const a = ethers.parseUnits(String(v || "").trim() || "0", 6); return a > 0n ? a : null; } catch { return null; } };
  async function loadVaults() { try { const r = await fetch(`${API}?agent=vaults&t=${S.t}`, { cache: "no-store" }); S.vs = r.ok ? await r.json() : S.vs; } catch { /* keep */ } }
  function tank(v) {
    const full = Math.max(v.dailyCap * 2, v.usdc, 1), f = Math.min(1, v.usdc / full);
    return `<div class="ag-tank" style="--f:${(f * 100).toFixed(1)}%"><i></i><b data-no-i18n>${usd(v.usdc)}</b><small>${T("USDC ready")}</small></div>`;
  }
  function vaultCard(v) {
    const dec = (S.rep && S.rep.dec) || 18;
    const burned = Number(v.burned) / 10 ** dec;
    const mine = me() === v.owner;
    const st = v.status;
    const pend = v.pending;
    const due = pend && Date.now() / 1000 >= pend.readyAt;
    return `<div class="ag-v" data-v="${esc(v.vault)}">
      <div class="ag-v-h"><b>${T("Vault")} ${addrA(v.vault)}</b><span class="ag-pill ${v.paused ? "off" : v.agentOn ? "on" : "off"}">${T(v.paused ? "Paused" : v.agentOn ? "ARCIA on" : "ARCIA off")}</span><small>${T("owner")} ${addrA(v.owner)}${mine ? ` <em>${T("you")}</em>` : ""}</small></div>
      <div class="ag-v-body">${tank(v)}
        <div class="ag-v-st"><div><small>${T("Burned so far")}</small><b data-no-i18n>${num(burned)}</b><span data-no-i18n>${esc((S.rep && S.rep.sym) || "")}</span></div>
          <div><small>${T("Spent")}</small><b data-no-i18n>${usd(v.spent)}</b><span><span data-no-i18n>${v.buys}</span> ${T("buys")}</span></div>
          <div><small>${T("Vault limits")}</small><b data-no-i18n>${usd(v.maxBuy, 0)} / ${usd(v.dailyCap, 0)}</b><span>${T("per buy / per day")} · ${T("one buy every")} <span data-no-i18n>${Math.round(v.cooldown / 60)}m</span></span></div></div></div>
      ${st ? `<div class="ag-v-why"><img src="${AV}" alt="" width="20" height="20"><span>${T(st.why)}</span><em data-no-i18n>${ago(st.at)}</em></div>` : ""}
      ${pend ? `<div class="ag-v-pend">${T("Looser limits queued")}: <b data-no-i18n>${usd(pend.maxBuy, 0)} / ${usd(pend.dailyCap, 0)} · ${Math.round(pend.cooldown / 60)}m</b> — ${due ? `<button type="button" class="ag-btn sm" data-vact="apply">${T("Apply now")}</button>` : `${T("from")} <span data-no-i18n>${inT(pend.readyAt)}</span>`}</div>` : ""}
      <div class="ag-row"><input type="number" min="0" step="any" inputmode="decimal" placeholder="USDC" data-vin="fund" aria-label="${T("USDC to add")}"><button type="button" class="ag-btn go" data-vact="fund">${T("Fund vault")}</button></div>
      ${mine ? `<details class="ag-own"${S.ownOpen.has(v.vault) ? " open" : ""}><summary>${T("Owner controls")}</summary>
        <div class="ag-row"><button type="button" class="ag-btn" data-vact="pause">${T(v.paused ? "Resume" : "Pause")}</button><button type="button" class="ag-btn" data-vact="agent">${T(v.agentOn ? "Turn ARCIA off" : "Turn ARCIA on")}</button></div>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="${T("per buy")}" data-vin="lb"><input type="number" min="0" step="any" placeholder="${T("per day")}" data-vin="ld"><input type="number" min="1" step="1" placeholder="${T("minutes")}" data-vin="lc"><button type="button" class="ag-btn" data-vact="limits">${T("Set limits")}</button></div>
        <p class="ag-small">${T("Tighter limits apply at once; looser ones wait an hour.")}</p>
        <div class="ag-row"><input type="number" min="0" step="any" placeholder="USDC" data-vin="wd"><button type="button" class="ag-btn" data-vact="max">${T("Max")}</button><button type="button" class="ag-btn out" data-vact="withdraw">${T("Withdraw")}</button></div>
        <p class="ag-small">${T("Always to your own wallet, at any time, paused or not.")}</p></details>` : ""}
      ${msgOf(v.vault)}</div>`;
  }
  // the last message stays through the refresh that follows an action
  const msgOf = (k) => { const m = S.vmsg && S.vmsg.v === k ? S.vmsg : null; return `<p class="ag-msg ${m ? m.cls : ""}" aria-live="polite">${m ? m.h : ""}</p>`; };
  function vaults(el) {
    const V = S.vs;
    if (!V || !V.live) {
      el.innerHTML = `<div class="ag-empty ag-soon"><b>${T("Burn vaults are coming")}</b><span>${T("They open once the ARCIA AGENT contracts are deployed on Arc — the date isn't decided yet. Everything else here works now.")}</span></div>` + vaultHow();
      return;
    }
    el.innerHTML = (V.paused ? `<div class="ag-crit"><b>${T("Paused by the team")}</b><span>${T("Every vault waits; owners can still withdraw.")}</span></div>` : "") +
      (V.vaults.length ? V.vaults.map(vaultCard).join("") : `<div class="ag-empty">${T("No vault for this token yet.")}</div>`) +
      `<div class="ag-open" id="ag-open">${openForm()}</div>` + vaultHow();
    wireVaults(el);
  }
  const vaultHow = () => `<ol class="ag-how"><li>${T("Anyone funds the vault with USDC.")}</li><li>${T("ARCIA watches the price and buys in dips — never after a pump, never more than a 3% price move.")}</li><li>${T("Everything she buys goes straight to 0x…dEaD. The vault can't sell.")}</li></ol>`;
  function openForm() {
    const fee = S.vs && S.vs.createBurn && S.vs.createBurn !== "0" ? Number(ethers.formatEther(S.vs.createBurn)) : 0;
    return `<details${S.vs && S.vs.vaults.length ? "" : " open"}><summary>${T("Open a burn vault for this token")}</summary>
      <div class="ag-pools" id="ag-pools"><button type="button" class="ag-btn" data-vact="pools">${T("Find its USDC pool")}</button></div>
      <div class="ag-row"><label>${T("per buy")}<input type="number" min="0" step="any" value="5" data-oin="b"></label><label>${T("per day")}<input type="number" min="0" step="any" value="25" data-oin="d"></label><label>${T("every (minutes)")}<input type="number" min="1" step="1" value="10" data-oin="c"></label></div>
      ${fee ? `<p class="ag-small">${T("Opening a vault burns")} <b data-no-i18n>${num(fee)} $ARCIRCLE</b>.</p>` : ""}
      <button type="button" class="ag-btn go" data-vact="create" disabled>${T("Open vault")}</button>${msgOf("open")}</details>`;
  }
  function wireVaults(el) {
    el.querySelectorAll("[data-vact]").forEach((b) => b.addEventListener("click", () => vaultAct(b)));
    // the owner's controls stay open across refreshes
    el.querySelectorAll(".ag-own").forEach((d) => d.addEventListener("toggle", () => { const v = d.closest(".ag-v").dataset.v; if (d.open) S.ownOpen.add(v); else S.ownOpen.delete(v); }));
  }
  async function findPools(box) {
    box.innerHTML = `<div class="ag-skel"><i></i></div>`;
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
      if (k === "create") {
        const p = S.liq && S.liq[Number((panel.querySelector('input[name="ag-pool"]:checked') || {}).value || 0)];
        const mb = parse6(val("b")), md = parse6(val("d")), cd = Math.round(Number(val("c")) * 60);
        if (!p || !mb || !md || !(cd >= 60)) { msg(T("Pick a pool and set the limits (at least 1 minute between buys)."), "bad"); return; }
        if (md < mb) { msg(T("The day's limit can't be below one buy."), "bad"); return; }
        const f = new ethers.Contract(S.vs.factory, FACT_ABI, sg);
        const fee = BigInt(S.vs.createBurn || "0");
        if (fee > 0n) {
          const a = new ethers.Contract(ARCIRCLE, ERC20, sg);
          if ((await a.allowance(state.account, S.vs.factory)) < fee) { msg(T("Approve the $ARCIRCLE to burn in your wallet…")); await (await a.approve(S.vs.factory, fee)).wait(); }
        }
        msg(T("Confirm in your wallet…"));
        const key = [p.key.currency0, p.key.currency1, p.key.fee, p.key.tickSpacing, p.key.hooks];
        const tx = await f.createVault(key, mb, md, cd);
        msg(`${T("Opening…")} ${txa(tx.hash)}`);
        await tx.wait();
        msg(`${T("Vault open. Fund it and ARCIA starts watching.")} ${txa(tx.hash)}`, "ok");
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
      } else {
        const c = new ethers.Contract(v, VAULT_ABI, sg), x = S.vs.vaults.find((y) => y.vault === v);
        let tx;
        msg(T("Confirm in your wallet…"));
        if (k === "pause") tx = await c.setPaused(!x.paused);
        else if (k === "agent") tx = await c.setAgentOn(!x.agentOn);
        else if (k === "apply") tx = await c.applyLimits();
        else if (k === "limits") {
          const mb = parse6(val("lb")), md = parse6(val("ld")), cd = Math.round(Number(val("lc")) * 60);
          if (!mb || !md || !(cd >= 60) || md < mb) { msg(T("Per buy, per day (not below one buy) and at least 1 minute between buys."), "bad"); return; }
          tx = await c.setLimits(mb, md, cd);
        } else if (k === "withdraw") {
          const amt = parse6(val("wd"));
          if (!amt) { msg(T("Enter an amount of USDC."), "bad"); return; }
          tx = await c.withdraw((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || USDC, amt);
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
    el.innerHTML = `<div class="ag-acts">${acts.map((a) => `<div class="ag-act${seen && !seen.has(a.tx) && !reduce ? " fresh" : ""}"><i class="ag-flame" aria-hidden="true"></i><div><b>${T("Bought and burned")} <span data-no-i18n>${num(Number(a.burned) / 10 ** dec)} ${esc((S.rep && S.rep.sym) || "")}</span></b><small><span data-no-i18n>${usd(a.usd)}</span> · ${T(String(a.why || "").split(" · ")[0])} · <span data-no-i18n>${ago(a.ts)}</span></small></div>${txa(a.tx, "tx")}</div>`).join("")}</div>`;
  }

  // ---------------- boot ----------------
  function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      if (m) { $("ag-in").value = m[1]; wake(m[1]); }
    }
    clearInterval(S.timer);
    S.timer = setInterval(async () => {
      if (!panel.classList.contains("active") || document.hidden || !S.t || !S.rep) return;
      await loadVaults();
      if (S.tab === "vault" && !S.acting && !panel.querySelector(".ag-v input:focus, .ag-open input:focus")) tabs();
      if (S.tab === "actions") tabs();
    }, 30000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "agent") show(); else clearInterval(S.timer); });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); if (S.rep) render(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcAgent = { wake, state: S };
})();
