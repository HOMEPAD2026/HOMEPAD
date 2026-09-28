/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite */
// arc-arcia402.js — ARCIA 402, an ARCIRCLE PAD utility (arcpad.html#arcia402).
// ARCIA as an economic agent on Arc: she sells her intelligence per call over x402 (HTTP 402
// Payment Required, USDC on Arc), hires other agents' x402 services with her own wallet, and keeps
// public books. Everything here reads /api/arcia402 (api/arcia402.mjs):
//   · the loop           THINK → DISCOVER → PAY → ACT → EARN → LEARN
//   · her wallet         address, USDC, $ARCIRCLE, earned / spent / net, tasks sold / services bought
//   · P&L                the last 14 days, earned up and spent down
//   · the storefront     four paid services; "Pay & run" sends the USDC from your wallet (arc-tx)
//                        and shows ARCIA's answer
//   · the ledger         every sale, every hire (with what she learned), every "looked, none fit"
//   · for agents         how to call it: 402 → pay (exact / arc-tx) → JSON
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-arcia402");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arcscan.app"}/${kind}/${x}`;
  const USDC = (typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000";
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, n !== 0 && Math.abs(n) < 0.1 ? 3 : d) }));
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? tr("just now") : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  async function fetchJson(url, opts = {}, ms = 45000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const S = { stats: null, at: 0, busy: {}, input: {}, results: {}, booted: false, timer: 0 };
  const LOOP = [["Think", "reads the question"], ["Discover", "finds a service on Arc"], ["Pay", "USDC, per call"], ["Act", "runs the job"], ["Earn", "other agents pay her"], ["Learn", "keeps what she got"]];

  // ---------------- skeleton ----------------
  function frame() {
    $("a4-body").innerHTML = `
      <div class="a4-loop" aria-label="${T("How ARCIA works")}">${LOOP.map(([k, s], i) => `<div class="a4-step" style="--i:${i}"><b>${T(k)}</b><small>${T(s)}</small></div>`).join('<i class="a4-arrow" aria-hidden="true"></i>')}</div>
      <div class="a4-grid">
        <div class="ams-card a4-wallet" id="a4-wallet"><div class="a4-skel"><i></i><i></i><i></i></div></div>
        <div class="ams-card a4-pl" id="a4-pl"><div class="a4-skel"><i></i><i></i></div></div>
      </div>
      <h2 class="a4-h">${T("ARCIA's storefront")} <small>${T("Pay per call in USDC on Arc — people and AI agents alike")}</small></h2>
      <div class="a4-shop" id="a4-shop"></div>
      <div class="a4-grid b">
        <div class="ams-card a4-ledger"><div class="a4-card-h"><h3>${T("The books")}</h3><span class="a4-live"><i></i>${T("Live")}</span></div><div id="a4-ledger"></div></div>
        <div class="ams-card a4-dev"><div class="a4-card-h"><h3>${T("For AI agents")}</h3></div><div id="a4-dev"></div></div>
      </div>
      <div class="ams-card a4-road" id="a4-road"></div>`;
  }

  // ---------------- data ----------------
  async function load(force) {
    if (!force && S.stats && Date.now() - S.at < 15000) return;
    const r = await fetchJson("/api/arcia402?stats=1", {}, 20000);
    if (r.ok && r.j) { S.stats = r.j; S.at = Date.now(); }
    paint();
  }
  function paint() {
    paintWallet(); paintPL(); paintShop(); paintLedger(); paintDev(); paintRoad();
  }
  function paintWallet() {
    const box = $("a4-wallet"), d = S.stats;
    if (!box) return;
    if (!d) { box.innerHTML = `<p class="a4-muted">${T("Couldn't read ARCIA's books right now — try again in a moment.")}</p>`; return; }
    const t = d.totals || {}, b = d.balances || {};
    const net = t.net || 0;
    box.innerHTML = `<div class="a4-card-h"><h3>${T("ARCIA's wallet")}</h3><span class="a4-chip ${d.canPay ? "on" : ""}">${T(d.canPay ? "Can pay other agents" : "Earning only")}</span></div>
      ${d.wallet ? `<div class="a4-addr"><code data-no-i18n>${esc(d.wallet)}</code><button type="button" class="ams-mini" data-a4-copy="${esc(d.wallet)}">${T("Copy")}</button><a class="ams-mini" href="${EXPL("address", d.wallet)}" target="_blank" rel="noopener">${T("Explorer")} ↗</a></div>` : `<p class="a4-muted">${T("ARCIA's wallet isn't set up yet.")}</p>`}
      <div class="a4-bal"><div><small>USDC</small><b data-no-i18n data-a4-count="${b.usdc ?? ""}">${b.usdc == null ? "—" : usd(b.usdc)}</b></div><div><small>$ARCIRCLE</small><b data-no-i18n>${b.arcircle == null ? "—" : num(b.arcircle)}</b></div></div>
      <div class="a4-kpis">
        <div class="up"><small>${T("x402 earned")}</small><b data-no-i18n>${usd(t.earned)}</b></div>
        <div class="down"><small>${T("x402 spent")}</small><b data-no-i18n>${usd(t.spent)}</b></div>
        <div class="${net >= 0 ? "up" : "down"} net"><small>${T("Net")}</small><b data-no-i18n>${net >= 0 ? "+" : "−"}${usd(Math.abs(net))}</b></div>
        <div><small>${T("Tasks sold")}</small><b data-no-i18n>${t.sold || 0}</b></div>
        <div><small>${T("Services bought")}</small><b data-no-i18n>${t.bought || 0}</b></div>
      </div>`;
  }
  function paintPL() {
    const box = $("a4-pl"), d = S.stats;
    if (!box || !d) return;
    // 14 days, today last; earned up (green), spent down (pink)
    const byDay = new Map((d.days || []).map((x) => [x.day, x]));
    const days = Array.from({ length: 14 }, (_, i) => { const k = new Date(Date.now() - (13 - i) * 86400e3).toISOString().slice(0, 10); return byDay.get(k) || { day: k, earned: 0, spent: 0 }; });
    const max = Math.max(0.01, ...days.map((x) => Math.max(x.earned, x.spent)));
    const today = days[13];
    box.innerHTML = `<div class="a4-card-h"><h3>${T("ARCIA P&L")}</h3><small class="a4-muted">${T("last 14 days")}</small></div>
      <div class="a4-today"><div><small>${T("Revenue today")}</small><b class="up" data-no-i18n>${usd(today.earned)}</b></div><div><small>${T("Expenses today")}</small><b class="down" data-no-i18n>${usd(today.spent)}</b></div><div><small>${T("Net today")}</small><b data-no-i18n class="${today.earned - today.spent >= 0 ? "up" : "down"}">${today.earned - today.spent >= 0 ? "+" : "−"}${usd(Math.abs(today.earned - today.spent))}</b></div></div>
      <div class="a4-bars" role="img" aria-label="${T("Earned and spent per day")}">${days.map((x, i) => `<div class="a4-bar" style="--i:${i}" title="${esc(x.day)} · +${usd(x.earned)} / −${usd(x.spent)}"><i class="e" style="--h:${((x.earned / max) * 100).toFixed(1)}%"></i><i class="s" style="--h:${((x.spent / max) * 100).toFixed(1)}%"></i><span data-no-i18n>${esc(x.day.slice(8))}</span></div>`).join("")}</div>
      <div class="a4-legend"><span><i class="e"></i>${T("Earned")}</span><span><i class="s"></i>${T("Spent")}</span></div>`;
  }
  function paintShop() {
    const box = $("a4-shop"), d = S.stats;
    if (!box || !d) return;
    const html = (d.services || []).map((s) => {
      const res = S.results[s.id], busy = S.busy[s.id];
      return `<div class="ams-card a4-svc" data-svc="${esc(s.id)}">
        <div class="a4-svc-top"><span class="a4-price" data-no-i18n>${usd(s.price, 2)}</span><span class="a4-per">${T("per call")}</span></div>
        <h3>${T(s.title)}</h3><p>${T(s.desc)}</p>
        <code class="a4-ep" data-no-i18n>GET /arcia402/${esc(s.id)}${s.input ? `?${esc(s.input)}=0x…` : ""}</code>
        ${s.input ? `<input type="text" class="a4-in" data-a4-in="${esc(s.id)}" spellcheck="false" autocomplete="off" placeholder="${esc(tr(s.input === "wallet" ? "Wallet address (0x…)" : "Token address (0x…)"))}" value="${esc(S.input[s.id] || "")}">` : ""}
        <button type="button" class="ams-btn a4-go" data-a4-run="${esc(s.id)}"${busy ? " disabled" : ""}>${busy ? `<span class="a4-spin"></span>${T(busy)}` : `${T("Pay")} <b data-no-i18n>${usd(s.price, 2)}</b> ${T("& run")}`}</button>
        ${res ? resultHtml(s, res) : ""}
      </div>`;
    }).join("");
    if (box.__html !== html) {
      const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.a4In : null;
      box.innerHTML = html; box.__html = html;
      if (focus) { const el = box.querySelector(`[data-a4-in="${focus}"]`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
    }
  }
  function resultHtml(s, res) {
    if (res.error) return `<div class="a4-res bad"><b>${esc(res.error)}</b>${res.tx ? ` <a href="${EXPL("tx", res.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</div>`;
    const r = res.result || {};
    const facts = [];
    if (r.score != null) facts.push([tr("Score"), `${r.score}/100 · ${r.verdict || ""}`]);
    if (r.market && r.market.price_usd != null) facts.push([tr("Price"), "$" + Number(r.market.price_usd).toPrecision(3)]);
    if (r.market_cap_usd != null) facts.push([tr("Market cap"), usd(r.market_cap_usd, 0)]);
    if (r.holders && r.holders.count != null) facts.push([tr("Holders"), num(r.holders.count)]);
    if (r.usdc != null) facts.push(["USDC", usd(r.usdc)]);
    if (typeof r.arcircle === "number") facts.push(["$ARCIRCLE", num(r.arcircle)]);
    if (Array.isArray(r.airdrops_received)) facts.push([tr("Airdrops"), String(r.airdrops_received.length)]);
    if (r.arcircle && r.arcircle.price_usd != null) facts.push(["$ARCIRCLE", "$" + Number(r.arcircle.price_usd).toPrecision(3)]);
    if (Array.isArray(r.newest_launches)) facts.push([tr("New launches"), String(r.newest_launches.length)]);
    return `<div class="a4-res">
      <div class="a4-res-h"><img src="/images/arcia-avatar-96.jpg" alt="" width="28" height="28"><b>ARCIA</b><span class="a4-paid">${T("Paid")} <a href="${EXPL("tx", res.paid && res.paid.transaction || "")}" target="_blank" rel="noopener">tx ↗</a></span></div>
      ${r.arcia ? `<p class="a4-say" data-no-i18n>${esc(r.arcia)}</p>` : ""}
      ${facts.length ? `<dl class="a4-facts">${facts.slice(0, 6).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-no-i18n>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
      <details class="a4-json"><summary>${T("Full JSON")}</summary><pre data-no-i18n>${esc(JSON.stringify(r, null, 2).slice(0, 12000))}</pre></details></div>`;
  }
  function paintLedger() {
    const box = $("a4-ledger"), d = S.stats;
    if (!box || !d) return;
    const items = (d.items || []).slice(0, 20);
    box.innerHTML = items.length ? `<ol class="a4-feed">${items.map((e, i) => {
      if (e.kind === "earn") return `<li class="earn" style="--i:${i}"><i aria-hidden="true">+</i><div><b>${T("Sold")} <span data-no-i18n>${esc(e.svc)}</span></b><small data-no-i18n>${esc(short(e.from))}${e.tx ? ` · <a href="${EXPL("tx", e.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</small></div><em data-no-i18n>+${usd(e.amount, 2)}</em><time>${esc(ago(e.t))}</time></li>`;
      if (e.kind === "spend") return `<li class="spend" style="--i:${i}"><i aria-hidden="true">−</i><div><b>${T("Hired")} <span data-no-i18n>${esc(e.provider || e.svc)}</span></b><small data-no-i18n>${esc(e.note || e.category || "")}</small></div><em data-no-i18n>−${usd(e.amount, 2)}</em><time>${esc(ago(e.t))}</time></li>`;
      return `<li class="look" style="--i:${i}"><i aria-hidden="true">·</i><div><b>${T("Looked for an agent to hire")}</b><small>${T(e.note || "")}</small></div><em></em><time>${esc(ago(e.t))}</time></li>`;
    }).join("")}</ol>` : `<p class="a4-muted">${T("No sales or hires yet — be ARCIA's first customer above.")}</p>`;
  }
  function paintDev() {
    const box = $("a4-dev"), d = S.stats;
    if (!box || !d) return;
    const ex = `curl -i ${location.origin}/arcia402/arc-intelligence
# → 402 Payment Required: scheme "exact", network eip155:5042,
#   asset USDC 0x3600…0000, payTo ${d.wallet ? short(d.wallet) : "ARCIA"}, 10000 (= $0.01)
curl ${location.origin}/arcia402/arc-intelligence \\
  -H "X-PAYMENT: <base64 x402 payment>"`;
    box.innerHTML = `<p>${T("ARCIA is an x402 seller on Arc. Call an endpoint, get HTTP 402 with the terms, pay in USDC, call again with X-PAYMENT — the answer comes back as JSON.")}</p>
      <pre class="a4-code" data-no-i18n>${esc(ex)}</pre>
      <ul class="a4-ways"><li><b>exact</b> — ${T("a signed EIP-3009 authorization (any standard x402 client); ARCIA settles it on Arc")}</li><li><b>arc-tx</b> — ${T("send the USDC yourself, then pass the transaction hash")}</li></ul>
      <div class="a4-links"><a class="ams-mini" href="/arcia402" target="_blank" rel="noopener">${T("Storefront JSON")} ↗</a><a class="ams-mini" href="/api/arcia402?stats=1" target="_blank" rel="noopener">${T("Books JSON")} ↗</a><a class="ams-mini" href="/api/arcia402?discover=1" target="_blank" rel="noopener">${T("Agents ARCIA can hire")} ↗</a></div>
      ${d.budget ? `<p class="a4-muted">${T("ARCIA's hiring budget")}: <span data-no-i18n>${usd(d.budget.perCall)} ${esc(tr("per call"))} · ${usd(d.budget.perDay)} ${esc(tr("per day"))}</span></p>` : ""}`;
  }
  function paintRoad() {
    const box = $("a4-road");
    if (!box) return;
    const steps = [["on", "ARCIA Wallet", "Her own wallet on Arc, public books"], ["on", "x402 Earn", "Four paid endpoints, USDC per call"], ["on", "x402 Hire", "Finds and pays other agents on Arc"],
      ["", "ARCIA Tools", "Scanner, Locker, Multisender, Snapshot, Bridge, ArcPad — by asking ARCIA"], ["", "ARCIA Market", "Other developers list their agents here"], ["", "ARCIA SDK · ElizaOS plugin", "ARCIA.scan(), .pay(), .hire() for any agent"], ["", "Agent Factory", "Create your own agent with its own Arc wallet"]];
    box.innerHTML = `<div class="a4-card-h"><h3>${T("Where ARCIA 402 is going")}</h3><small class="a4-muted">${T("Next steps: details not decided yet")}</small></div>
      <ol class="a4-road-l">${steps.map(([st, t, s], i) => `<li class="${st}" style="--i:${i}"><i aria-hidden="true">${st ? "✓" : i + 1}</i><b>${T(t)}</b><small>${T(s)}</small></li>`).join("")}</ol>
      <p class="a4-tag">${T("Eliza gave agents a mind. ARCIA gives them an economy.")}</p>`;
  }

  // ---------------- pay & run ----------------
  async function payAndRun(id) {
    const s = (S.stats && S.stats.services || []).find((x) => x.id === id);
    if (!s || S.busy[id]) return;
    const input = s.input ? String(S.input[id] || "").trim() : "";
    if (s.input && !isAddr(input)) { S.results[id] = { error: tr(s.input === "wallet" ? "Enter a wallet address (0x…)." : "Enter a token address (0x…).") }; paintShop(); return; }
    const url = `/api/arcia402?svc=${encodeURIComponent(id)}${s.input ? `&${s.input}=${encodeURIComponent(input)}` : ""}`;
    const set = (b) => { S.busy[id] = b; paintShop(); };
    try {
      set("Checking the price…");
      const q = await fetchJson(url, {}, 20000);
      if (q.status !== 402 || !q.j || !q.j.accepts) { S.results[id] = { error: (q.j && q.j.error) || tr("The service didn't answer — try again.") }; return; }
      const terms = q.j.accepts[0];
      if (!state.account) { set("Connect a wallet…"); if (typeof connectWallet === "function") await connectWallet(); }
      if (!state.account || !state.signer) { S.results[id] = { error: tr("Connect a wallet to pay.") }; return; }
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      set("Confirm in your wallet…");
      const c = new ethers.Contract(USDC, ["function transfer(address to, uint256 value) returns (bool)"], state.signer);
      const tx = await c.transfer(terms.payTo, BigInt(terms.maxAmountRequired));
      set("Paying on Arc…");
      await tx.wait();
      set("ARCIA is working…");
      const pay = btoa(JSON.stringify({ x402Version: 1, scheme: "arc-tx", network: "eip155:5042", payload: { txHash: tx.hash } }));
      let r = null;
      for (let i = 0; i < 6; i++) {
        r = await fetchJson(url, { headers: { "X-PAYMENT": pay } }, 60000);
        if (r.status === 402 && r.j && r.j.retry) { await sleep(2000); continue; }
        break;
      }
      if (r && r.ok && r.j) { S.results[id] = { result: r.j.result, paid: r.j.paid }; if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti(); load(true); }
      else S.results[id] = { error: (r && r.j && r.j.error) || tr("ARCIA couldn't finish — your payment is on-chain; contact the team with the transaction."), tx: tx.hash };
    } catch (e) {
      const m = e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("You cancelled in your wallet.") : String(e && (e.shortMessage || e.message) || e).slice(0, 160);
      S.results[id] = { error: m };
    } finally { S.busy[id] = null; paintShop(); }
  }

  // ---------------- wiring ----------------
  panel.addEventListener("click", (e) => {
    const run = e.target.closest("[data-a4-run]");
    if (run) { payAndRun(run.dataset.a4Run); return; }
    const cp = e.target.closest("[data-a4-copy]");
    if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.a4Copy).then(() => toast("Copied")).catch(() => {}); }
  });
  panel.addEventListener("input", (e) => { const i = e.target.closest("[data-a4-in]"); if (i) S.input[i.dataset.a4In] = i.value; });
  function show() {
    if (!S.booted) { S.booted = true; frame(); }
    load(false);
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (panel.classList.contains("active") && !document.hidden) load(true); }, 30000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "arcia402") show(); else clearInterval(S.timer); });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); paint(); } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  window.arcArcia402 = { load, state: S };
})();
