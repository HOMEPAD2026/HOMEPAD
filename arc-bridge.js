/* global ethers, CONFIG, state, readProvider, connectWallet, ensureArcForWrite, WagmiCoreRef, wagmiConfigRef */
// arc-bridge.js — Bridge, an ARCIRCLE PAD utility (arcpad.html#bridge).
// Moves USDC between Arc and other chains with Circle's CCTP V2:
//   1. approve + depositForBurnWithHook on the chain you send from (USDC is burned)
//   2. Circle's attestation service (Iris) signs the burn — polled through
//      /api/social?cctp=msg (api/_cctp.mjs)
//   3. Circle's Forwarding Service mints on the other chain, so the receiver
//      needs no gas there. If delivery ever stalls, "Finish on <chain>" calls
//      receiveMessage() with the attestation from the wallet itself.
// Contract addresses, domains and USDC addresses live in config-arc.js (BRIDGE).
// Transfers in progress are remembered in this browser only (localStorage),
// so the page can pick them up again after a reload.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-bridge");
  if (!panel || typeof CONFIG === "undefined" || !CONFIG.BRIDGE) return;
  const B = CONFIG.BRIDGE;
  const ARC = {
    key: "arc", name: "Arc", chainId: CONFIG.CHAIN_ID_DECIMAL, domain: B.ARC_DOMAIN, usdc: "0x3600000000000000000000000000000000000000",
    rpc: CONFIG.RPC_URL, explorer: CONFIG.BLOCK_EXPLORER, native: CONFIG.NATIVE_CURRENCY, color: "#35d8d0",
  };
  const CHAINS = B.CHAINS;
  const byKey = (k) => (k === "arc" ? ARC : CHAINS.find((c) => c.key === k) || null);
  // "cctp-forward" magic + version 0 + no extra data: ask Circle to deliver on the destination
  const HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000";
  const ZERO32 = "0x" + "00".repeat(32);
  const DEC = 6;
  const MSG_ABI = [
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
    "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
  ];
  const MT_ABI = ["function receiveMessage(bytes message, bytes attestation) returns (bool)"];
  const ERC20 = ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const ARC_GAS_KEEP = 100000n; // 0.10 USDC stays behind on Arc for gas when you press Max
  const STORE = "arcircle.bridge.v1";
  // Standard (no Fast fee) waits for the source chain's finality.
  const STD_ETA = { ethereum: "15–20 min", base: "15–20 min", arbitrum: "15–20 min", optimism: "15–20 min", unichain: "15–20 min", linea: "6–32 h", polygon: "about 8 min", avalanche: "under a minute", arc: "under a minute" };

  const ARCIRCLE_ON = /^0x[0-9a-fA-F]{40}$/.test(CONFIG.ARCIRCLE_TOKEN || "");
  const BUY_URL = CONFIG.ARCIRCLE_BUY_URL || "/arc#arcircle";
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (raw) => {
    if (raw == null) return "—";
    const n = Number(ethers.formatUnits(raw, DEC));
    return n.toLocaleString("en-US", { minimumFractionDigits: n > 0 && n < 0.01 ? 4 : 2, maximumFractionDigits: n > 0 && n < 0.01 ? 6 : 2 });
  };
  // fees: enough digits to see cents and fractions of a cent
  const fmtFee = (raw) => {
    const n = Number(ethers.formatUnits(raw, DEC));
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
  };
  const ago = (t) => {
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  };
  const chainDot = (c) => `<i class="abr-dot" style="--c:${c.color}">${esc(c.name.charAt(0))}</i>`;

  // ---------- state ----------
  let dir = "in";          // "in" = other chain → Arc, "out" = Arc → other chain
  let other = "base";
  let speed = "fast";
  let busy = false;
  let bal = { src: null, dst: null };
  const src = () => (dir === "in" ? byKey(other) : ARC);
  const dst = () => (dir === "in" ? ARC : byKey(other));

  // ---------- reads ----------
  const padAddr = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  async function rpc(chain, method, params) {
    if (chain.key === "arc" && typeof readProvider === "function") return readProvider().send(method, params);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(chain.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    } finally { clearTimeout(t); }
  }
  async function usdcBalance(chain, who) {
    const out = await rpc(chain, "eth_call", [{ to: chain.usdc, data: "0x70a08231" + padAddr(who) }, "latest"]);
    return BigInt(out && out !== "0x" ? out : "0x0");
  }
  // ---------- Circle's attestation service (Iris): every call goes through here ----------
  // so the page can tell people when Circle itself is slow or down, instead
  // of leaving them staring at "Waiting for Circle's signature".
  const IRIS_SLOW = 6000;
  const iris = { fails: 0, slow: 0, lastOk: 0 };
  async function irisGet(url) {
    const t0 = performance.now();
    let r, j;
    try {
      r = await fetch(url);
      j = await r.json().catch(() => null);
    } catch (e) { iris.fails++; paintIris(); throw e; }
    const ms = performance.now() - t0;
    if (!r.ok || !j) { iris.fails++; paintIris(); throw new Error((j && j.error) || "Circle didn't answer"); }
    iris.fails = 0; iris.lastOk = Date.now();
    iris.slow = ms > IRIS_SLOW ? iris.slow + 1 : 0;
    paintIris();
    return j;
  }
  let banner = null;
  function paintIris() {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "abr-banner"; banner.id = "abr-banner"; banner.hidden = true;
      banner.setAttribute("role", "status");
      const grid = panel.querySelector(".abr-grid");
      if (grid) grid.parentNode.insertBefore(banner, grid);
    }
    const down = iris.fails >= 2, slow = !down && iris.slow >= 1;
    const pending = all().some((r) => { const st = stageOf(r); return st === "burning" || st === "burned"; });
    const html = down
      ? `<span class="abr-banner-ico" aria-hidden="true"></span><div><b>${esc(tr("Circle's signing service isn't answering right now."))}</b><span>${esc(tr(pending ? "Transfers you've already sent are safe — they carry on automatically once it's back." : "Quotes and new transfers may fail for a moment. Nothing you've sent is at risk."))}</span></div>`
      : slow ? `<span class="abr-banner-ico" aria-hidden="true"></span><div><b>${esc(tr("Circle's signing service is slow right now."))}</b><span>${esc(tr("Signatures may take longer than usual. You don't need to do anything."))}</span></div>` : "";
    banner.className = "abr-banner" + (down ? " down" : slow ? " slow" : "");
    banner.hidden = !html;
    if (banner.__html !== html) { banner.innerHTML = html; banner.__html = html; }
  }
  const feeCache = new Map();
  async function fees(s, d) {
    const k = s.domain + ":" + d.domain, hit = feeCache.get(k);
    if (hit && Date.now() - hit.at < 60000) return hit.v;
    const j = await irisGet(`/api/social?cctp=fees&src=${s.domain}&dst=${d.domain}`);
    if (!j.fees) throw new Error(j.error || "no fee quote");
    feeCache.set(k, { at: Date.now(), v: j.fees });
    return j.fees;
  }

  // ---------- gas on the other chain (only needed to finish a transfer yourself) ----------
  const gasCache = new Map();
  /// → { have, need, ok } in the chain's native units (wei), or null if unknown
  async function gasCheck(chain, who) {
    const k = chain.key + ":" + lc(who), hit = gasCache.get(k);
    if (hit && Date.now() - hit.at < 30000) return hit.v;
    try {
      const [bal, price] = await Promise.all([rpc(chain, "eth_getBalance", [who, "latest"]), rpc(chain, "eth_gasPrice", [])]);
      const have = BigInt(bal || "0x0"), need = BigInt(price || "0x0") * 260000n; // receiveMessage ≈ 150–220k gas
      const v = { have, need, ok: have >= need };
      gasCache.set(k, { at: Date.now(), v });
      return v;
    } catch { return null; }
  }
  const nat = (c, wei) => `${Number(ethers.formatUnits(wei, (c.native && c.native.decimals) || 18)).toLocaleString("en-US", { maximumSignificantDigits: 2 })} ${(c.native && c.native.symbol) || ""}`.trim();
  function gasLine(c, g) {
    if (!g || g.ok) return "";
    const sym = (c.native && c.native.symbol) || "gas";
    return g.have === 0n
      ? tr(`You have no ${sym} on ${c.name} to pay for this. Add about ${nat(c, g.need)} first.`)
      : tr(`You may not have enough ${sym} on ${c.name} for this — about ${nat(c, g.need)} is needed, you have ${nat(c, g.have)}.`);
  }

  // ---------- quote ----------
  function parseAmount() {
    const v = $("abr-amount").value.trim();
    if (!/^\d*\.?\d{0,6}$/.test(v) || v === "" || v === ".") return null;
    try { const a = ethers.parseUnits(v, DEC); return a > 0n ? a : null; } catch { return null; }
  }
  /// fee maths — Circle charges at most maxFee, taken out of the amount
  function quoteFor(amount, rows, sp) {
    const thr = (sp || speed) === "fast" ? 1000 : 2000;
    const row = rows.find((r) => r.finalityThreshold === thr) || rows.find((r) => r.finalityThreshold === 2000);
    if (!row) return null;
    const bps1e3 = BigInt(Math.round((row.minimumFee || 0) * 1000)); // basis points × 1000
    const proto = bps1e3 > 0n ? (amount * bps1e3 + 9999999n) / 10000000n : 0n;
    const protoMax = proto > 0n ? (proto * 5n) / 4n + 1n : 0n;      // room for the rate moving before the burn lands
    const fw = row.forwardFee;
    const forward = !!(fw && fw.high > 0);
    const fwdEst = forward ? BigInt(Math.ceil(fw.med || fw.high)) : 0n;
    const fwdMax = forward ? BigInt(Math.ceil(fw.high * 1.1)) : 0n;
    const maxFee = protoMax + fwdMax;
    return { thr: row.finalityThreshold, proto, fwdEst, forward, maxFee, recvMin: amount - maxFee, recvEst: amount - proto - fwdEst };
  }

  // ---------- render ----------
  function chainSelect(id, fixedArc) {
    const box = $(id);
    if (fixedArc) { box.innerHTML = `<span class="abr-chain-fixed">${chainDot(ARC)}<b>Arc</b></span>`; return; }
    const c = byKey(other);
    box.innerHTML = `<button type="button" class="abr-chain-pick" data-pick aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(tr("Choose a chain"))}: ${esc(c.name)}">${chainDot(c)}<b>${esc(c.name)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>`;
  }

  // ---------- chain picker: every chain with your USDC on it ----------
  let picked = false;              // the person (or a link) chose the chain — don't auto-pick over it
  let allBal = { acct: null, at: 0, v: {}, p: null };
  function balancesAll(acct) {
    if (allBal.acct === acct && Date.now() - allBal.at < 60000 && allBal.p) return allBal.p;
    const cur = { acct, at: Date.now(), v: {}, p: null };
    allBal = cur;
    cur.p = Promise.all(CHAINS.map((c) => usdcBalance(c, acct)
      .then((v) => { cur.v[c.key] = v; }, () => { cur.v[c.key] = null; })
      .then(() => { if (sheet && !sheet.hidden) paintSheet(); })))
      .then(() => cur.v);
    return cur.p;
  }
  const richest = (v) => CHAINS.filter((c) => typeof v[c.key] === "bigint" && v[c.key] > 0n).sort((a, b) => (v[b.key] > v[a.key] ? 1 : v[b.key] < v[a.key] ? -1 : 0))[0] || null;
  let sheet = null, sheetFor = null;
  function openSheet(btn) {
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "abr-sheet"; sheet.id = "abr-sheet"; sheet.hidden = true;
      sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", tr("Choose a chain"));
      $("abr-form").appendChild(sheet);
      sheet.addEventListener("click", (e) => {
        const b = e.target.closest && e.target.closest("[data-chain]");
        if (b) { other = b.getAttribute("data-chain"); picked = true; closeSheet(); render(); refresh(); const pk = panel.querySelector("[data-pick]"); if (pk) pk.focus({ preventScroll: true }); return; }
        if (e.target.closest && e.target.closest("[data-close]")) closeSheet(true);
      });
      sheet.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); closeSheet(true); return; }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const items = [...sheet.querySelectorAll("[data-chain]")], i = items.indexOf(document.activeElement);
        e.preventDefault();
        (items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length] || items[0]).focus();
      });
    }
    sheetFor = btn;
    // phones: a bottom sheet over everything (the page's bottom dock included)
    const phone = !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
    const host = phone ? document.body : $("abr-form");
    if (sheet.parentNode !== host) host.appendChild(sheet);
    sheet.classList.toggle("abr-sheet-m", phone);
    const leg = btn.closest(".abr-leg");
    sheet.style.top = phone ? "" : leg ? leg.offsetTop + leg.offsetHeight - 6 + "px" : "0px";
    sheet.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    paintSheet();
    if (state.account) balancesAll(state.account);
    requestAnimationFrame(() => { sheet.classList.add("in"); const on = sheet.querySelector("[data-chain].on") || sheet.querySelector("[data-chain]"); if (on) on.focus({ preventScroll: true }); });
  }
  function closeSheet(focusBack) {
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("in"); sheet.hidden = true;
    if (sheetFor) sheetFor.setAttribute("aria-expanded", "false");
    const b = panel.querySelector("[data-pick]");
    if (focusBack && b) b.focus({ preventScroll: true });
  }
  function paintSheet() {
    if (!sheet) return;
    const acct = state.account, v = allBal.acct === acct ? allBal.v : {};
    const known = CHAINS.filter((c) => typeof v[c.key] === "bigint"), have = known.filter((c) => v[c.key] > 0n);
    const total = known.reduce((a, c) => a + v[c.key], 0n), top = richest(v);
    const head = !acct ? tr("Connect a wallet to see your USDC on each chain.")
      : known.length < CHAINS.length && !have.length ? tr("Checking your USDC on every chain…")
      : have.length ? tr(`You have ${fmt(total)} USDC on ${have.length} ${have.length === 1 ? "chain" : "chains"}.`) : tr("No USDC found on these chains yet.");
    const focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-chain");
    sheet.innerHTML = `<div class="abr-sheet-head"><b>${esc(tr(dir === "in" ? "Send from" : "Send to"))}</b><span>${esc(head)}</span><button type="button" class="abr-sheet-x" data-close aria-label="${esc(tr("Close"))}">×</button></div>
      <div class="abr-sheet-list" role="listbox">${CHAINS.map((c) => {
        const b = v[c.key], amt = !acct ? "" : b === undefined ? `<i class="abr-sk" aria-hidden="true"></i>` : b === null ? "—" : `${fmt(b)} <small>USDC</small>`;
        const pct = total > 0n && typeof b === "bigint" ? Number((b * 1000n) / total) / 10 : 0;
        return `<button type="button" role="option" data-chain="${c.key}" class="${c.key === other ? "on" : ""}${typeof b === "bigint" && b === 0n ? " zero" : ""}" aria-selected="${c.key === other}" style="--c:${c.color};--p:${pct}%">
          ${chainDot(c)}<span class="abr-sheet-name">${esc(c.name)}${top && top.key === c.key && have.length > 1 ? `<em>${esc(tr("Most USDC"))}</em>` : ""}</span><span class="abr-sheet-bal">${amt}</span><span class="abr-sheet-eta">${esc(tr(dir === "in" ? STD_ETA[c.key] || "15–20 min" : "About a minute"))}</span><i class="abr-sheet-bar" aria-hidden="true"></i></button>`;
      }).join("")}</div>`;
    if (focused) { const f = sheet.querySelector(`[data-chain="${focused}"]`); if (f) f.focus({ preventScroll: true }); }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#bp-panel-bridge [data-pick]");
    if (b) { if (sheet && !sheet.hidden) closeSheet(); else openSheet(b); return; }
    if (sheet && !sheet.hidden && !(e.target.closest && e.target.closest("#abr-sheet"))) closeSheet();
  });
  // first time a wallet shows up: start from the chain where its USDC is
  let autoFor = null;
  async function autoPick() {
    const acct = state.account;
    if (!acct || picked || dir !== "in" || autoFor === acct) return;
    autoFor = acct;
    const v = await balancesAll(acct).catch(() => ({}));
    if (picked || dir !== "in" || state.account !== acct) return;
    const top = richest(v);
    if (!top || top.key === other) return;
    if (typeof v[other] === "bigint" && v[other] > 0n) return; // you already have some where you are
    other = top.key;
    render(); refresh();
    if (!busy && !$("abr-status").textContent) status(esc(tr(`Starting from ${top.name} — that's where your USDC is.`)), "info");
  }
  function render() {
    chainSelect("abr-from-chain", dir === "out");
    chainSelect("abr-to-chain", dir === "in");
    panel.querySelectorAll('[data-abr="to-name"]').forEach((el) => { el.textContent = dst().name; });
    $("abr-std-eta").innerHTML = `<span>${esc(tr(STD_ETA[src().key] || "15–20 min"))}</span><span class="abr-nofee"> · <span>${esc(tr("no transfer fee"))}</span></span>`;
    panel.querySelectorAll(".abr-speed button").forEach((b) => b.setAttribute("aria-checked", b.dataset.speed === speed ? "true" : "false"));
    paintRoute();
  }
  // the little route strip: source dot → packet running along the line → destination dot
  function paintRoute() {
    const el = $("abr-route");
    if (!el) return;
    const s = src(), d = dst();
    el.style.setProperty("--a", s.color); el.style.setProperty("--b", d.color);
    el.innerHTML = `${chainDot(s)}<span class="abr-route-line"><i class="abr-route-pkt"></i><i class="abr-route-pkt p2"></i></span>${chainDot(d)}<span class="abr-route-txt"><b>${esc(s.name)} → ${esc(d.name)}</b><small>${esc(tr(speed === "fast" ? "About a minute" : STD_ETA[s.key] || "15–20 min"))}</small></span>`;
    el.classList.toggle("slow", speed !== "fast");
    el.classList.toggle("go", busy);
  }
  let quoteSeq = 0, lastQuote = null;
  async function refresh() {
    const seq = ++quoteSeq;
    const acct = state.account;
    bal = { src: null, dst: null };
    $("abr-from-bal").textContent = tr("Balance") + " —";
    $("abr-to-bal").textContent = tr("Balance") + " —";
    if (acct) {
      const s = src(), d = dst(), rcp = recipient() || acct;
      usdcBalance(s, acct).then((v) => { if (seq === quoteSeq) { bal.src = v; $("abr-from-bal").textContent = `${tr("Balance")} ${fmt(v)} USDC`; update(); } }).catch(() => { if (seq === quoteSeq) bal.src = null; });
      usdcBalance(d, rcp).then((v) => { if (seq === quoteSeq) { bal.dst = v; $("abr-to-bal").textContent = `${tr("Balance")} ${fmt(v)} USDC`; paintOnboard(); } }).catch(() => {});
      autoPick();
    }
    paintOnboard();
    update();
  }
  function recipient() {
    if (!$("abr-recip-on").checked) return state.account || null;
    const v = $("abr-recip").value.trim();
    return isAddr(v) ? v : null;
  }
  let feeRows = null, feeErr = false;
  async function update() {
    const s = src(), d = dst(), amount = parseAmount();
    const go = $("abr-go");
    const setGo = (text, on) => { go.textContent = tr(text); go.disabled = !on || busy; };
    try { feeRows = await fees(s, d); feeErr = false; } catch { feeRows = null; feeErr = true; }
    if (s !== src() || d !== dst()) return; // direction changed meanwhile
    const q = amount && feeRows ? quoteFor(amount, feeRows) : null;
    lastQuote = q;
    paintSpeedFees(amount);
    $("abr-q-fee").textContent = q ? (q.proto > 0n ? `${fmtFee(q.proto)} USDC` : tr("Free")) : feeErr ? tr("Unavailable") : "—";
    $("abr-q-fwd").textContent = q ? (q.forward ? `≈ ${fmtFee(q.fwdEst)} USDC` : tr("You claim it yourself")) : "—";
    $("abr-q-max").textContent = q ? `${fmtFee(q.maxFee)} USDC` : "—";
    $("abr-q-eta").textContent = speed === "fast" ? tr("About a minute") : tr(STD_ETA[s.key] || "15–20 min");
    $("abr-recv").textContent = q && q.recvMin > 0n ? `${fmt(q.recvMin)} USDC` : "—";
    paintRouteGas(q, d);
    if (busy) return;
    if (!state.account) return setGo("Connect wallet", true);
    if ($("abr-recip-on").checked && !recipient()) return setGo("Enter a valid recipient", false);
    if (!amount) return setGo("Enter an amount", false);
    if (feeErr) return setGo("Fee quote unavailable — try again", true);
    if (!q) return setGo("Getting a quote…", false);
    if (q.recvMin <= 0n) return setGo(`Minimum is about ${fmt(q.maxFee + 100000n)} USDC`, false);
    if (bal.src != null && amount > bal.src) return setGo(`Not enough USDC on ${s.name}`, false);
    setGo(`Bridge ${fmt(amount)} USDC to ${d.name}`, true);
  }

  // Fast vs Standard: what each would cost for this amount, right on the buttons
  function paintSpeedFees(amount) {
    const cost = (sp) => { const x = amount && feeRows ? quoteFor(amount, feeRows, sp) : null; return x ? x.proto + x.fwdEst : null; };
    const cf = cost("fast"), cs = cost("standard");
    panel.querySelectorAll(".abr-speed button").forEach((b) => {
      let em = b.querySelector(".abr-spfee");
      const c = b.dataset.speed === "fast" ? cf : cs;
      b.classList.toggle("has-fee", c != null);
      if (c == null) { if (em) em.remove(); return; }
      if (!em) { em = document.createElement("em"); em.className = "abr-spfee"; b.appendChild(em); }
      const save = b.dataset.speed === "standard" && cf != null && cf - c >= 10000n ? cf - c : 0n;
      em.innerHTML = `${esc(c > 0n ? `≈ ${fmtFee(c)} USDC` : tr("Free"))}${save ? ` <span class="abr-save">${esc(tr(`saves ${fmtFee(save)}`))}</span>` : ""}`;
    });
  }

  // New to Arc: USDC is the gas there — and one tap adds Arc to the wallet
  const ONBOARD_KEY = "arcircle.bridge.onboard";
  function paintOnboard() {
    const el = $("abr-onboard");
    if (!el) return;
    let off = false;
    try { off = localStorage.getItem(ONBOARD_KEY) === "1"; } catch { /* private mode */ }
    el.hidden = off || dir !== "in" || !state.account || bal.dst !== 0n;
  }
  async function addArc() {
    const btn = panel.querySelector("[data-addarc]"), p = walletProv();
    if (!p) { status(esc(tr("No wallet found.")), "err"); return; }
    try {
      await p.request({ method: "wallet_addEthereumChain", params: [addParams(ARC)] });
      if (btn) { btn.textContent = tr("Arc is in your wallet"); btn.disabled = true; btn.classList.add("done"); }
    } catch (e) { status(esc(errText(e)), "err"); }
  }

  // No delivery on this route → the person finishes on the other chain
  // themselves and needs a little of its gas token there. Say so up front.
  let gasSeq = 0;
  async function paintRouteGas(q, d) {
    const box = $("abr-gaswarn");
    if (!box) return;
    const my = ++gasSeq;
    if (!q || q.forward || !state.account) { box.hidden = true; return; }
    const g = await gasCheck(d, state.account);
    if (my !== gasSeq) return;
    const line = gasLine(d, g);
    box.hidden = !line;
    box.innerHTML = line ? `<b>${esc(tr(`Circle can't deliver on ${d.name} right now`))}</b><span>${esc(tr(`You'll finish this transfer on ${d.name} yourself.`))}</span> <span>${esc(line)}</span>` : "";
  }

  // ---------- wallet ----------
  const walletProv = () => state.walletProvider || window.ethereum || null;
  function addParams(c) {
    return { chainId: "0x" + c.chainId.toString(16), chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer], nativeCurrency: c.native };
  }
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  async function switchTo(c) {
    if (c.key === "arc") { await ensureArcForWrite(); return; }
    // AppKit / WalletConnect sessions: wagmi knows these chains (wallet-appkit.js)
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) {
          if (Number(acc.chainId) !== c.chainId) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: c.chainId, addEthereumChainParameter: addParams(c) });
          state.chainId = c.chainId;
          return;
        }
      } catch (e) { if (rejected(e)) throw e; /* fall back to the raw provider */ }
    }
    const p = walletProv();
    if (!p) throw new Error(`Switch your wallet to ${c.name} and try again.`);
    const cur = Number.parseInt(await p.request({ method: "eth_chainId" }), 16);
    if (cur !== c.chainId) {
      try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + c.chainId.toString(16) }] }); }
      catch (e) {
        if (rejected(e)) throw e;
        await p.request({ method: "wallet_addEthereumChain", params: [addParams(c)] });
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + c.chainId.toString(16) }] }).catch(() => {});
      }
    }
    state.chainId = c.chainId;
  }
  async function signerOn(c) {
    const p = walletProv();
    if (!p) throw new Error("No wallet found.");
    const bp = new ethers.BrowserProvider(p, "any");
    const net = await bp.getNetwork();
    if (Number(net.chainId) !== c.chainId) throw new Error(`Your wallet is still on another network — switch it to ${c.name} and try again.`);
    return bp.getSigner(state.account);
  }
  function errText(e) {
    if (rejected(e)) return tr("You cancelled in your wallet.");
    const m = String((e && (e.shortMessage || e.reason || e.message)) || e || "");
    if (/insufficient funds/i.test(m)) return tr("Not enough gas on this chain for the transaction.");
    return m.length > 180 ? m.slice(0, 180) + "…" : m || tr("Something went wrong.");
  }
  function steps(active, done) {
    panel.querySelectorAll("#abr-steps li").forEach((li) => {
      const k = li.dataset.step;
      li.classList.toggle("on", k === active);
      li.classList.toggle("done", done.indexOf(k) >= 0);
    });
    $("abr-steps").classList.toggle("show", !!active || done.length > 0);
  }
  const status = (html, kind) => { $("abr-status").innerHTML = html ? `<div class="abr-msg ${kind || ""}">${html}</div>` : ""; };

  async function go() {
    if (busy) return;
    if (!state.account) { try { await connectWallet(); } catch (e) { status(esc(errText(e)), "err"); } refresh(); return; }
    const s = src(), d = dst(), amount = parseAmount(), rcp = recipient();
    if (!amount || !rcp) return;
    busy = true;
    closeSheet();
    paintRoute();
    const btn = $("abr-go");
    btn.disabled = true;
    const done = [];
    try {
      steps("switch", done); status(esc(tr(`Switching your wallet to ${s.name}…`)), "wait");
      await switchTo(s);
      const signer = await signerOn(s);
      done.push("switch");
      // fresh quote right before signing
      feeCache.delete(s.domain + ":" + d.domain);
      const q = quoteFor(amount, await fees(s, d));
      if (!q || q.recvMin <= 0n) throw new Error(tr("The amount doesn't cover Circle's fees."));
      const usdc = new ethers.Contract(s.usdc, ERC20, signer);
      const have = await usdc.balanceOf(state.account);
      if (have < amount) throw new Error(tr(`Not enough USDC on ${s.name}.`));
      steps("approve", done);
      const allow = await usdc.allowance(state.account, B.TOKEN_MESSENGER);
      if (allow < amount) {
        status(esc(tr("Approve USDC in your wallet…")), "wait");
        const ap = await usdc.approve(B.TOKEN_MESSENGER, amount);
        status(`${esc(tr("Approving…"))} <a href="${s.explorer}/tx/${ap.hash}" target="_blank" rel="noopener">tx ↗</a>`, "wait");
        await ap.wait();
      }
      done.push("approve");
      steps("burn", done);
      let dstBal0 = null;
      try { dstBal0 = (await usdcBalance(d, rcp)).toString(); } catch { dstBal0 = null; }
      status(esc(tr("Confirm the transfer in your wallet…")), "wait");
      const m = new ethers.Contract(B.TOKEN_MESSENGER, MSG_ABI, signer);
      const recip32 = ethers.zeroPadValue(rcp, 32);
      const tx = q.forward
        ? await m.depositForBurnWithHook(amount, d.domain, recip32, s.usdc, ZERO32, q.maxFee, q.thr, HOOK)
        : await m.depositForBurn(amount, d.domain, recip32, s.usdc, ZERO32, q.maxFee, q.thr);
      const rec = {
        id: tx.hash, tx: tx.hash, src: s.key, dst: d.key, amount: amount.toString(), maxFee: q.maxFee.toString(), recipient: rcp,
        forward: q.forward, speed, at: Date.now(), dstBal0, stage: "burning",
      };
      save(rec);
      status(`${esc(tr("Sent — burning on"))} ${esc(s.name)}… <a href="${s.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`, "wait");
      const r = await tx.wait();
      rec.stage = r && r.status === 0 ? "failed" : "burned";
      save(rec);
      done.push("burn");
      steps(null, done);
      status(rec.stage === "failed" ? esc(tr("The burn transaction failed — your USDC didn't move.")) : `${esc(tr("Burned. Circle is on it — follow it under Your transfers."))}${alertOffer()}`, rec.stage === "failed" ? "err" : "ok");
      $("abr-amount").value = "";
      burst();
      track();
    } catch (e) {
      console.error("bridge", e);
      status(esc(errText(e)), "err");
      steps(null, []);
    } finally {
      busy = false;
      paintRoute();
      refresh();
    }
  }

  // ---------- transfers (this browser) ----------
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } }
  function save(rec) {
    const list = load().filter((x) => x.id !== rec.id);
    list.unshift(rec);
    put(list);
  }
  function put(list) {
    list = list.slice(0, 30);
    try { localStorage.setItem(STORE, JSON.stringify(list)); mem = null; } catch { /* private mode: in-memory only this visit */ mem = list; }
    renderList();
  }
  let mem = null;
  const all = () => mem || load();
  function stageOf(r) {
    if (r.stage === "failed") return "failed";
    if (r.delivered) return "delivered";
    if (r.attested) return "attested";
    return r.stage === "burning" ? "burning" : "burned";
  }
  function renderList() {
    const list = all();
    const box = $("abr-list");
    paintFind();
    if (!list.length) {
      box.innerHTML = `<div class="abr-empty"><p>${esc(tr("No transfers yet."))}</p><span>${esc(tr("Your transfers show up here step by step — burn, Circle's signature, arrival."))}</span><button type="button" class="abr-empty-cta" data-start>${esc(tr(dir === "in" ? "Bring USDC to Arc" : "Send USDC from Arc"))} →</button>${findNote ? `<p class="abr-find-note">${esc(findNote)}</p>` : ""}</div>`;
      paintBell();
      return;
    }
    box.innerHTML = (findNote ? `<p class="abr-find-note top" role="status">${esc(findNote)}</p>` : "") + list.map((r) => {
      const s = byKey(r.src), d = byKey(r.dst);
      if (!s || !d) return "";
      const st = stageOf(r);
      const age = Date.now() - (r.attestedAt || r.at);
      const canClaim = r.attested && !r.delivered && r.message && r.attestation && (!r.forward || age > 8 * 60000);
      const step = (on, ok, label, link) => `<li class="${ok ? "ok" : on ? "on" : ""}"><span class="abr-tick" aria-hidden="true"></span><span>${esc(tr(label))}</span>${link || ""}</li>`;
      const recv = r.received ? `${fmt(BigInt(r.received))} USDC` : "";
      const pct = { burning: 18, burned: 48, attested: 80, delivered: 100, failed: 100 }[st];
      const buy = st === "delivered" && d.key === "arc" && ARCIRCLE_ON;
      return `<div class="abr-tx st-${st}${r.recovered ? " rec" : ""}" data-id="${esc(r.id)}" style="--a:${s.color};--b:${d.color}">
        <div class="abr-tx-head">${chainDot(s)}<b class="abr-tx-amt">${fmt(BigInt(r.amount))} USDC</b><span class="abr-tx-route">${esc(s.name)} → ${esc(d.name)}</span>${r.recovered ? `<span class="abr-tx-tag">${esc(tr("Found on Arc"))}</span>` : ""}<time>${esc(ago(r.at))}</time></div>
        ${st !== "delivered" && st !== "failed" ? `<div class="abr-tx-bar" style="--p:${pct}%" aria-hidden="true"><i></i></div>` : ""}
        <ol class="abr-tx-steps">
          ${step(st === "burning", st !== "burning" && st !== "failed", st === "failed" ? "Burn failed" : "Burned on " + s.name, r.tx ? `<a href="${s.explorer}/tx/${r.tx}" target="_blank" rel="noopener">tx ↗</a>` : "")}
          ${step(st === "burned", !!r.attested, r.attested ? "Signed by Circle" : r.delay ? "Circle is waiting: " + r.delay.replace(/_/g, " ") : "Waiting for Circle's signature")}
          ${step(st === "attested", !!r.delivered, r.delivered ? (recv ? "Received " + recv + " on " + d.name : "Delivered on " + d.name) : r.forward ? "Delivering on " + d.name : "Ready to claim on " + d.name,
            r.dstTx ? `<a href="${d.explorer}/tx/${r.dstTx}" target="_blank" rel="noopener">tx ↗</a>` : r.delivered ? `<a href="${d.explorer}/address/${r.recipient}" target="_blank" rel="noopener">${esc(short(r.recipient))} ↗</a>` : "")}
        </ol>
        ${canClaim ? `<button type="button" class="abr-claim" data-claim="${esc(r.id)}">${esc(tr("Finish on " + d.name))}</button><p class="abr-claim-note">${esc(tr(r.forward ? "Delivery is taking longer than usual. You can mint it yourself — it needs a little gas on " + d.name + "." : "Mint it on " + d.name + " — it needs a little gas there."))}</p><p class="abr-gasline" data-gas="${esc(r.id)}" hidden></p>` : ""}
        ${buy ? `<div class="abr-next"><span>${esc(tr("Your USDC is on Arc. What next?"))}</span><a class="abr-next-buy" href="${esc(BUY_URL)}">${esc(tr("Buy $ARCIRCLE"))} →</a><a href="#scanner">${esc(tr("Scan a token first"))}</a></div>` : ""}
        ${st === "delivered" || st === "failed" ? `<button type="button" class="abr-x" data-remove="${esc(r.id)}" aria-label="${esc(tr("Remove"))}">×</button>` : ""}
      </div>`;
    }).join("");
    // gas check for every transfer waiting to be finished by hand
    list.forEach((r) => {
      const el = box.querySelector(`[data-gas="${CSS.escape(r.id)}"]`);
      const d = byKey(r.dst);
      if (!el || !d || !(state.account || r.recipient)) return;
      gasCheck(d, state.account || r.recipient).then((g) => { const line = gasLine(d, g); el.hidden = !line; el.textContent = line; });
    });
    paintBell();
  }

  // ---------- alerts: tab title + browser notification when a transfer moves on ----------
  const canNotify = () => "Notification" in window;
  function paintBell() {
    const head = panel.querySelector(".abr-hist-head");
    if (!head) return;
    let b = head.querySelector(".abr-bell");
    if (!canNotify()) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("button"); b.type = "button"; b.className = "abr-bell"; head.appendChild(b); b.addEventListener("click", askAlerts); }
    const p = Notification.permission;
    b.dataset.state = p;
    b.disabled = p !== "default";
    const label = p === "granted" ? tr("Alerts on") : p === "denied" ? tr("Alerts blocked in this browser") : tr("Notify me");
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg><span>${esc(label)}</span>`;
  }
  function askAlerts() {
    if (!canNotify() || Notification.permission !== "default") return;
    try { Notification.requestPermission().then(() => { paintBell(); const o = panel.querySelector(".abr-alert-offer"); if (o) o.remove(); }).catch(() => {}); } catch { /* old Safari */ }
  }
  function alertOffer() {
    if (!canNotify() || Notification.permission !== "default") return "";
    return ` <button type="button" class="abr-alert-offer" data-alerts>${esc(tr("Notify me when it lands"))}</button>`;
  }
  const baseTitle = document.title;
  let flashT = 0;
  function flashTitle(text) {
    clearInterval(flashT);
    if (!document.hidden) return;
    let n = 0;
    flashT = setInterval(() => {
      if (!document.hidden || n > 40) { clearInterval(flashT); document.title = baseTitle; return; }
      document.title = n++ % 2 ? baseTitle : `● ${text}`;
    }, 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { clearInterval(flashT); document.title = baseTitle; } });
  function notify(title, body, tag) {
    flashTitle(title);
    try { if (canNotify() && Notification.permission === "granted" && document.hidden) new Notification(title, { body, tag, icon: "/images/favicon-32.png" }); } catch { /* mobile browsers without the constructor */ }
    if (typeof window.arcHaptic === "function") window.arcHaptic("milestone");
  }
  // one alert per step per transfer, remembered with the transfer itself
  function announce(r) {
    const d = byKey(r.dst);
    if (!d) return;
    const amt = `${fmt(BigInt(r.amount))} USDC`;
    if (r.delivered && !r.nD) {
      r.nD = 1; r.nA = 1; save(r);
      arrived(r);
      notify(tr(`Arrived on ${d.name}`), tr(`${r.received ? fmt(BigInt(r.received)) + " USDC" : amt} is in your wallet on ${d.name}.`), "abr-" + r.id);
    } else if (r.attested && !r.nA) {
      r.nA = 1; save(r);
      logTransfer(r);
      if (r.forward) notify(tr("Signed by Circle"), tr(`${amt} is on its way to ${d.name}.`), "abr-" + r.id);
      else notify(tr(`Ready to claim on ${d.name}`), tr(`Circle signed your ${amt} transfer — finish it on ${d.name}.`), "abr-" + r.id);
    }
  }
  let trackT = 0, trackBusy = false;
  async function track() {
    clearTimeout(trackT);
    if (trackBusy) return;
    trackBusy = true;
    let pending = 0, soonest = 20000;
    try {
      const list = all();
      for (const r of list) {
        const st = stageOf(r);
        if (st === "delivered" || st === "failed" || (Date.now() - r.at > 3 * 86400000 && r.checked)) continue;
        if (Date.now() - r.at > 3 * 86400000) { r.checked = 1; save(r); }
        pending++;
        const s = byKey(r.src), d = byKey(r.dst);
        if (!s || !d) continue;
        let changed = false;
        if (!r.attested || (r.forward && !r.dstTx && !r.delivered)) {
          try {
            const j = await irisGet(`/api/social?cctp=msg&src=${s.domain}&tx=${r.tx}`);
            const m = j && j.messages && j.messages[0];
            if (m) {
              if (m.delayReason !== (r.delay || null)) { r.delay = m.delayReason || null; changed = true; }
              if (m.status === "complete" && m.attestation && m.message && !r.attested) {
                r.attested = true; r.attestedAt = Date.now(); r.message = m.message; r.attestation = m.attestation; r.stage = "burned"; changed = true;
                if (m.feeExecuted != null) r.fee = String(m.feeExecuted);
              }
              if (m.forwardTx && m.forwardTx !== r.dstTx) { r.dstTx = m.forwardTx; changed = true; }
              if (m.forwardState && /^(complete|completed|confirmed|success|succeeded|done|delivered)$/i.test(m.forwardState) && !r.delivered) { r.delivered = true; changed = true; }
            }
          } catch { /* try again next round */ }
        }
        if (r.attested && !r.delivered) {
          try {
            const now = await usdcBalance(d, r.recipient);
            if (r.dstBal0 != null) {
              const gained = now - BigInt(r.dstBal0);
              const want = BigInt(r.amount) - BigInt(r.maxFee);
              if (gained >= want) { r.delivered = true; r.received = (gained > BigInt(r.amount) ? BigInt(r.amount) : gained).toString(); changed = true; }
            } else if (r.dstTx) { r.delivered = true; changed = true; } // no starting balance (found on Arc later): Circle's delivery tx is the proof
          } catch { if (r.dstTx) { r.delivered = true; changed = true; } }
        }
        if (changed) { save(r); announce(r); }
        const age = Date.now() - r.at;
        soonest = Math.min(soonest, age < 5 * 60000 ? 5000 : 20000);
      }
    } finally { trackBusy = false; }
    if (pending) trackT = setTimeout(track, soonest);
  }
  async function claim(id) {
    const r = all().find((x) => x.id === id);
    if (!r || !r.message || !r.attestation) return;
    const d = byKey(r.dst);
    const btn = panel.querySelector(`[data-claim="${CSS.escape(id)}"]`);
    if (btn) { btn.disabled = true; btn.textContent = tr("Confirm in your wallet…"); }
    try {
      const g = await gasCheck(d, state.account || r.recipient);
      if (g && g.have === 0n) throw new Error(gasLine(d, g));
      await switchTo(d);
      const signer = await signerOn(d);
      const mt = new ethers.Contract(B.MESSAGE_TRANSMITTER, MT_ABI, signer);
      try { await mt.receiveMessage.staticCall(r.message, r.attestation); }
      catch (e) {
        // already minted (by Circle's delivery, or an earlier claim)
        if (/nonce already used|already received|used nonce/i.test(String(e && (e.shortMessage || e.reason || e.message)))) { r.delivered = true; save(r); return; }
        throw e;
      }
      const tx = await mt.receiveMessage(r.message, r.attestation);
      r.dstTx = tx.hash; save(r);
      await tx.wait();
      r.delivered = true; if (!r.nD) { r.nD = 1; r.nA = 1; } save(r);
      burst(); arrived(r);
    } catch (e) {
      console.error("bridge claim", e);
      status(esc(errText(e)), "err");
      renderList();
    } finally { refresh(); }
  }

  // a little arc of light across the bridge emblem when a transfer goes through
  function burst() {
    const em = panel.querySelector(".abr-emblem");
    if (!em || reduce) return;
    em.classList.remove("fire"); void em.offsetWidth; em.classList.add("fire");
  }

  // arrival: ring pulse on the card and the amount counting up to what landed
  function countUp(el, to, draw, ms) {
    if (!el) return;
    if (reduce) { el.textContent = draw(to); return; }
    const t0 = performance.now(), dur = ms || 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = draw(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function arrived(r) {
    const card = $("abr-list").querySelector(`.abr-tx[data-id="${CSS.escape(r.id)}"]`);
    burst();
    if (!card) return;
    card.classList.remove("arrived"); void card.offsetWidth; card.classList.add("arrived");
    const got = Number(ethers.formatUnits(BigInt(r.amount), DEC));
    const amt = card.querySelector(".abr-tx-amt");
    countUp(amt, got, (n) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`);
  }

  // ---------- "bridged with ARCIRCLE PAD" ----------
  // Counted server-side only after Circle's API confirms the transfer (api/_bridge.mjs).
  function logTransfer(r) {
    if (r.logged || r.recovered) return;
    const s = byKey(r.src);
    if (!s || !r.tx) return;
    r.logged = 1; save(r);
    fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bridgelog", tx: r.tx, src: s.domain }) })
      .then((x) => x.json()).then((j) => { if (!j || !j.ok) { r.logged = 0; save(r); } else statsAt = 0; }).catch(() => { r.logged = 0; save(r); });
  }
  let statsAt = 0;
  async function paintStats() {
    const el = $("abr-stats");
    if (!el || Date.now() - statsAt < 60000) return;
    statsAt = Date.now();
    try {
      const j = await (await fetch("/api/social?bridgestats=1")).json();
      if (!j || !(j.n > 0)) { el.hidden = true; return; }
      const first = el.hidden;
      el.hidden = false;
      el.innerHTML = `<span class="abr-stat"><b data-v="usd">$0</b><small>${esc(tr("bridged with ARCIRCLE PAD"))}</small></span><span class="abr-stat"><b data-v="n">0</b><small>${esc(tr(j.n === 1 ? "transfer" : "transfers"))}</small></span>`;
      const money = (n) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2, minimumFractionDigits: n >= 1000 ? 0 : 2 });
      countUp(el.querySelector('[data-v="usd"]'), j.usd, money, first ? 1100 : 400);
      countUp(el.querySelector('[data-v="n"]'), j.n, (n) => Math.round(n).toLocaleString("en-US"), first ? 1100 : 400);
    } catch { el.hidden = true; }
  }

  // ---------- "Find my transfers": rebuild the list from Arc itself ----------
  // Every transfer in or out of Arc leaves a trace on Arc (a burn when USDC
  // leaves, a mint when it arrives), so the server reads those for the wallet
  // (last 30 days) and they're merged into this browser's list.
  let finding = false, findNote = "";
  const byDomain = (n) => (n === ARC.domain ? ARC : CHAINS.find((c) => c.domain === n) || null);
  function paintFind() {
    const head = panel.querySelector(".abr-hist-head");
    if (!head) return;
    let b = head.querySelector(".abr-find");
    if (!state.account) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("button"); b.type = "button"; b.className = "abr-find"; b.setAttribute("data-find", ""); head.insertBefore(b, head.querySelector(".abr-bell")); }
    b.disabled = finding;
    b.classList.toggle("busy", finding);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><span>${esc(tr(finding ? "Looking on Arc…" : "Find my transfers"))}</span>`;
  }
  async function findTransfers(auto) {
    const acct = state.account;
    if (!acct || finding) return;
    finding = true; findNote = ""; paintFind();
    try {
      const r = await fetch(`/api/social?bridgehist=${acct}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.items)) throw new Error((j && j.error) || "couldn't read Arc right now");
      const n = merge(acct, j.items);
      findNote = j.complete === false
        ? (n ? tr(`Found ${n} ${n === 1 ? "transfer" : "transfers"} so far.`) + " " : "") + tr("Arc is a busy chain — press Find my transfers again to look further back.")
        : n ? tr(`Found ${n} ${n === 1 ? "transfer" : "transfers"} on Arc from the last ${j.days || 30} days.`)
        : tr(`No other transfers on Arc for this wallet in the last ${j.days || 30} days.`);
      if (n) track();
    } catch (e) {
      findNote = auto ? "" : tr("Couldn't look this up on Arc right now — try again in a moment.");
    } finally {
      finding = false;
      renderList();
    }
  }
  function merge(acct, items) {
    const list = all();
    const have = new Set(list.map((x) => lc(x.tx)).concat(list.map((x) => lc(x.dstTx))).filter(Boolean));
    let added = 0;
    for (const it of items) {
      if (!it || !it.tx || have.has(lc(it.tx))) continue;
      const at = it.ts ? it.ts * 1000 : Date.now();
      if (it.k === "out") {
        const d = byDomain(it.dst);
        if (!d || d.key === "arc") continue;
        list.push({ id: it.tx, tx: it.tx, src: "arc", dst: d.key, amount: String(it.amount), maxFee: String(it.maxFee || 0), recipient: isAddr(it.recipient) ? it.recipient : acct,
          forward: !!it.forward, speed: null, at, dstBal0: null, stage: "burned", recovered: 1, nA: 1, nD: 1 });
      } else if (it.k === "in") {
        const s = byDomain(it.src);
        if (!s || s.key === "arc") continue;
        // an arrival we already track from its source side (same amount, within an hour)
        const amt = BigInt(it.amount), fee = BigInt(it.fee || 0);
        if (list.some((x) => x.dst === "arc" && x.src === s.key && Math.abs((x.at || 0) - at) < 3600000 && x.received && BigInt(x.received) === amt)) continue;
        list.push({ id: "in:" + it.tx, tx: null, dstTx: it.tx, src: s.key, dst: "arc", amount: (amt + fee).toString(), maxFee: fee.toString(), received: amt.toString(), recipient: acct,
          forward: true, at, stage: "burned", attested: true, delivered: true, recovered: 1, nA: 1, nD: 1 });
      } else continue;
      have.add(lc(it.tx)); added++;
    }
    if (added) { list.sort((a, b) => (b.at || 0) - (a.at || 0)); put(list); }
    return added;
  }
  // once per wallet per visit, when this browser has nothing for it yet
  function autoFind() {
    const acct = state.account;
    if (!acct || !panel.classList.contains("active") || all().length) return;
    const k = "arcircle.bridge.found." + lc(acct);
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch { /* fine */ }
    findTransfers(true);
  }

  // ---------- share this route: #bridge?from=base&amount=100 ----------
  function shareUrl() {
    const q = new URLSearchParams();
    q.set(dir === "in" ? "from" : "to", other);
    const a = parseAmount();
    if (a) q.set("amount", ethers.formatUnits(a, DEC).replace(/\.0+$/, ""));
    if (speed === "standard") q.set("speed", "standard");
    return `${location.origin}${location.pathname}#bridge?${q.toString()}`;
  }
  async function copyShare() {
    const btn = $("abr-share"), url = shareUrl();
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      try { const t = document.createElement("textarea"); t.value = url; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); ok = document.execCommand("copy"); t.remove(); } catch { ok = false; }
    }
    if (!btn) return;
    btn.dataset.url = url;
    const lab = btn.querySelector("span");
    if (lab) lab.textContent = tr(ok ? "Link copied" : "Copy failed — the link is in the address bar");
    if (!ok && history.replaceState) history.replaceState(null, "", url);
    btn.classList.toggle("done", ok);
    clearTimeout(copyShare.t);
    copyShare.t = setTimeout(() => { if (lab) lab.textContent = tr("Copy link to this route"); btn.classList.remove("done"); }, 1800);
  }

  // ---------- wiring ----------
  $("abr-flip").addEventListener("click", () => {
    dir = dir === "in" ? "out" : "in";
    const f = $("abr-flip"); f.classList.remove("spin"); void f.offsetWidth; f.classList.add("spin");
    render(); refresh();
  });
  panel.querySelectorAll(".abr-speed button").forEach((b) => b.addEventListener("click", () => { speed = b.dataset.speed; render(); update(); }));
  $("abr-amount").addEventListener("input", (e) => {
    const v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const parts = v.split(".");
    e.target.value = parts.length > 1 ? parts[0] + "." + parts.slice(1).join("").slice(0, DEC) : v;
    update();
  });
  $("abr-max").addEventListener("click", () => {
    if (bal.src == null) return;
    let v = bal.src;
    if (src().key === "arc") v = v > ARC_GAS_KEEP ? v - ARC_GAS_KEEP : 0n;
    $("abr-amount").value = v > 0n ? ethers.formatUnits(v, DEC).replace(/\.0+$/, "") : "";
    update();
  });
  $("abr-recip-on").addEventListener("change", (e) => { $("abr-recip").hidden = !e.target.checked; refresh(); });
  $("abr-recip").addEventListener("input", () => refresh());
  $("abr-go").addEventListener("click", go);
  $("abr-status").addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-alerts]")) askAlerts(); });
  if ($("abr-share")) $("abr-share").addEventListener("click", copyShare);
  panel.addEventListener("click", (e) => {
    if (!e.target.closest) return;
    if (e.target.closest("[data-find]")) { findTransfers(false); return; }
    if (e.target.closest("[data-addarc]")) { addArc(); return; }
    if (e.target.closest("[data-onboard-x]")) { try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* private mode */ } $("abr-onboard").hidden = true; }
  });
  $("abr-list").addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-start]")) {
      $("abr-form").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      setTimeout(() => $("abr-amount").focus({ preventScroll: true }), reduce ? 0 : 350);
      return;
    }
    const c = e.target.closest && e.target.closest("[data-claim]");
    if (c) { claim(c.getAttribute("data-claim")); return; }
    const x = e.target.closest && e.target.closest("[data-remove]");
    if (x) {
      const id = x.getAttribute("data-remove");
      const list = all().filter((r) => r.id !== id);
      try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { mem = list; }
      renderList();
    }
  });
  // #bridge?from=base / #bridge?to=polygon, optionally &amount=100 and &speed=standard
  function fromHash() {
    const m = /^#bridge\?(.+)$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1]), f = q.get("from"), t = q.get("to"), a = q.get("amount"), sp = q.get("speed");
    if (f && f !== "arc" && byKey(f)) { dir = "in"; other = f; picked = true; }
    else if (t && t !== "arc" && byKey(t)) { dir = "out"; other = t; picked = true; }
    if (a && /^\d{1,12}(\.\d{1,6})?$/.test(a)) $("abr-amount").value = a;
    if (sp === "fast" || sp === "standard") speed = sp;
  }
  fromHash();
  window.addEventListener("hashchange", () => { if (/^#bridge\?/.test(location.hash)) { fromHash(); render(); refresh(); } });
  let seenAcct = state.account;
  setInterval(() => { if (state.account !== seenAcct) { seenAcct = state.account; findNote = ""; refresh(); renderList(); autoFind(); } }, 1500);
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "bridge") { refresh(); track(); paintStats(); renderList(); autoFind(); } });
  render();
  renderList();
  if (panel.classList.contains("active")) { refresh(); paintStats(); }
  track();
  setInterval(renderList, 30000); // "…ago" labels
  paintBell();
  window.arcBridge = { quoteFor, byKey, all, iris, gasCheck, announce, shareUrl, findTransfers, balancesAll };
})();
