/* global ethers, CONFIG, state, readProvider, withRetry, connectWallet, ensureArcForWrite, arcpadTxErrorText, renderArcpadExploreGrid, fmtUsd */
// arc-argus.js — "Launch on Argus" through ArcPad, and those coins in Explore.
//
// The launch form has a platform switch. ArcPad keeps the ArcPad factory launch exactly as it
// was; Argus swaps in the Argus fields and launches on Argus Portal #8 (ArgusV5Portal) from the
// creator's own wallet:
//   1. read the Portal: its factories, Argus's fee share, the minimum opening buy
//   2. find a hook address with the flags Argus needs (Web Workers; the escrow address, and so
//      the hook's init code, changes with every salt)
//   3. cross-check the result with the Portal's own view functions — nothing is sent otherwise
//   4. approve the opening buy (USDC), dry-run the launch, launch
//   5. the creator (the coin's payout wallet) signs Argus's CreatorRegistry.setPayoutSplit:
//      70% creator, 30% the ARCIRCLE PAD treasury (CONFIG.ARGUS_V5.PLATFORM_WALLET)
//   6. report it to /api/social (argusreg), which checks the chain and lists it in Explore
// A launch whose split step was interrupted can be finished later (the card above the form).
// Support (Dexscreener info at $20K, marketing at $100K, refused on manipulation) is
// ARCIRCLE PAD's own policy, shown in the form and on the coin's sheet — not a contract.
(function () {
  "use strict";
  const AG = typeof CONFIG !== "undefined" && CONFIG.ARGUS_V5;
  const panel = document.getElementById("bp-panel-launch");
  if (!AG || !panel || typeof ethers === "undefined") return;

  // ---------------- basics ----------------
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  const EXPL = (kind, x) => `${CONFIG.BLOCK_EXPLORER || "https://arc.etherscan.io"}/${kind}/${x}`;
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());
  const usd = (n) => (n == null || !isFinite(n) ? "—" : typeof fmtUsd === "function" ? fmtUsd(n) : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const USDC = CONFIG.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
  const PORTAL = AG.PORTAL, REGISTRY = AG.CREATOR_REGISTRY, PLATFORM = AG.PLATFORM_WALLET;
  const PLATFORM_BPS = AG.PLATFORM_BPS || 3000, MIN_CREATOR = AG.MIN_CREATOR_ALLOC_BPS || 5000;
  const HOOK_FLAGS = BigInt(AG.HOOK_FLAGS || 0x20cc), HOOK_MASK = (1n << 14n) - 1n;
  const SUPPLY = 10n ** 27n; // 1,000,000,000 × 10^18, as every Argus launch
  const SUP = AG.SUPPORT || { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 };
  const ETHERS_URL = new URL("vendor/ethers-6.13.4.umd.min.js", location.origin + "/").href;

  // ---------------- ABIs (ArgusV5Portal / ArgusV5CreatorRegistry, verified on ArcScan) ----------------
  const LAUNCH_SIG = "function launch((string name, string symbol, uint256 totalSupply, uint16 buyTaxBps, uint16 sellTaxBps, uint16[5] alloc, address quoteAsset, address payoutAsset, uint16 kothBps, address payoutAddress, bytes32 identityProvider, uint256 identitySubject, (address to, uint128 amountQuote)[] bundle, address[] snipeExempt, (string imageURI, string website, string twitter, string telegram, string description) meta) p, bytes32 hookSalt) returns (address token)";
  const PORTAL_ABI = [
    "function creatorRegistry() view returns (address)", "function partsFactory() view returns (address)", "function hookFactory() view returns (address)",
    "function registry() view returns (address)", "function minSeedPpm() view returns (uint32)", "function treasuryBps() view returns (uint16)",
    "function hookInitCodeTemplate(address quote, uint16 buyTaxBps, uint16 sellTaxBps) view returns (bytes)",
    "function hookInitCodeHash(address creator, bytes32 hookSalt, address quote, uint16 buyTaxBps, uint16 sellTaxBps) view returns (bytes32)",
    "function predictEscrow(address creator, bytes32 hookSalt) view returns (address)",
    LAUNCH_SIG,
    "event Launched(address indexed token, address indexed creator, address hook, address escrow, address locker, uint256 positionId, int24 tickStart, int24 tickBond)",
    "error BundleCrossedTheBond(int24 tick, int24 bond)", "error BundleDuplicateRecipient(address to)", "error BundleEmptyEntry()", "error BundleRecipientRefused(address to)",
    "error BundleTooLong(uint256 n)", "error CreatorPayoutRefused(address to)", "error EconomicsMissing()", "error HookMismatch(address predicted, address deployed)",
    "error InvalidConfig()", "error KothAboveCeiling(uint16 asked, uint16 ceiling)", "error PayoutNotAllowed()", "error QuoteAdmissionRevoked(address quote)",
    "error Reentered()", "error SafeERC20FailedOperation(address token)", "error SeedBuyTooSmall(uint256 offered, uint256 required)", "error SeedFailed()",
    "error SharesMismatch(bytes32 escrowSays, bytes32 portalSays)", "error SharesNotWired()", "error ZeroAddress()",
  ];
  const REG_ABI = [
    "function payoutOf(address token) view returns (address)", "function payoutSplit(address token) view returns (address[] recipients, uint16[] bps)",
    "function setPayoutSplit(address token, (address recipient, uint16 bps)[] parts)",
    "error NotCreator()", "error SplitBpsNotFull(uint256 sum)", "error SplitDuplicate(address recipient)", "error SplitRecipientRefused(address recipient)",
    "error SplitTooLong(uint256 n)", "error SplitZeroShare(address recipient)",
  ];
  const PI = new ethers.Interface(PORTAL_ABI), RI = new ethers.Interface(REG_ABI);
  // the launch selector Argus's Portal #8 answers to (read off a live launch on ArcScan)
  if (PI.getFunction("launch").selector !== "0x206641c0") { console.warn("arc-argus: launch ABI drifted — Argus mode off"); return; }
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const rd = (addr, abi) => new ethers.Contract(addr, abi, readProvider());
  const ERR = {
    SeedBuyTooSmall: "The opening buy is below Argus's minimum.", BundleCrossedTheBond: "The opening buy is so large it would push the price past Argus's bonding mark — lower it.",
    InvalidConfig: "Argus rejected these settings (taxes, shares or supply).", HookMismatch: "The hook address didn't match — try again.", EconomicsMissing: "Argus has no price settings for USDC right now — try again later.",
    PayoutNotAllowed: "Argus refused this payout wallet.", CreatorPayoutRefused: "Argus refused this payout wallet.", QuoteAdmissionRevoked: "Argus isn't accepting USDC launches right now.",
    SafeERC20FailedOperation: "The USDC for the opening buy couldn't be pulled — approve it first.", SeedFailed: "The opening buy failed — try a smaller amount.",
    NotCreator: "Only the coin's payout wallet can set the split — switch to the wallet that launched it.", SplitBpsNotFull: "The split must add up to 100%.",
    SplitRecipientRefused: "Argus refused a wallet in the split.", SplitDuplicate: "The same wallet is in the split twice.",
  };
  function why(err) {
    if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return tr("Cancelled in your wallet.");
    const data = err && (err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data));
    if (typeof data === "string" && data.length >= 10) {
      for (const I of [PI, RI]) { try { const e = I.parseError(data); if (e) return tr(ERR[e.name] || e.name); } catch { /* not this one */ } }
    }
    const m = String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    const hit = Object.keys(ERR).find((k) => m.includes(k));
    if (hit) return tr(ERR[hit]);
    return typeof arcpadTxErrorText === "function" ? arcpadTxErrorText(err) : m.slice(0, 200);
  }

  // ---------------- state ----------------
  let plat = "arcpad";
  // a third choice, Pons (Robinhood Chain), is run by arc-pons.js, a fourth, Pump.fun (Solana), by arc-pump.js;
  // this switch only shows their fields
  const PLATS = ["arcpad", "argus"].concat(CONFIG.PONS ? ["pons"] : [], CONFIG.PUMP ? ["pump"] : []);
  try { const s = localStorage.getItem("arcircle.launch.platform"); if (PLATS.includes(s)) plat = s; } catch { /* default */ }
  { const h = /[?&]platform=(argus|pons|pump)\b/.exec(location.hash); if (h && PLATS.includes(h[1])) plat = h[1]; }
  const A = { creator: 70, burn: 10, dividend: 10, liquidity: 10 };
  let ctx = null, ctxAt = 0, busy = false;
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const pendKey = (a) => `arcircle.argus.pending.${a}`;
  const getPending = (a) => { try { return JSON.parse(localStorage.getItem(pendKey(a)) || "null"); } catch { return null; } };
  const setPending = (a, v) => { try { if (v) localStorage.setItem(pendKey(a), JSON.stringify(v)); else localStorage.removeItem(pendKey(a)); } catch { /* this visit */ } };

  // ---------------- the chain: what the Portal says ----------------
  async function chain(force) {
    if (ctx && !force && Date.now() - ctxAt < 5 * 60e3) return ctx;
    const P = rd(PORTAL, PORTAL_ABI);
    const [reg, parts, hooks, quotes, ppm, tb] = await Promise.all([
      retry(() => P.creatorRegistry()), retry(() => P.partsFactory()), retry(() => P.hookFactory()), retry(() => P.registry()), retry(() => P.minSeedPpm()), retry(() => P.treasuryBps()),
    ]);
    const econ = await retry(() => rd(quotes, ["function economicsFor(address quote) view returns (uint128 startFdvQuote, uint128 bondFdvQuote, uint8 decimals)"]).economicsFor(USDC));
    let minSeed = (BigInt(econ[1]) * BigInt(ppm)) / 1000000n;
    if (BigInt(ppm) > 0n && minSeed === 0n) minSeed = 1n;
    ctx = { registry: lc(reg), parts: ethers.getAddress(parts), hooks: ethers.getAddress(hooks), quotes, minSeed, treasuryBps: Number(tb), startFdv: BigInt(econ[0]), bondFdv: BigInt(econ[1]) };
    ctxAt = Date.now();
    return ctx;
  }

  // ---------------- the platform switch ----------------
  function setPlat(p, quiet) {
    plat = PLATS.includes(p) ? p : "arcpad";
    panel.dataset.plat = plat;
    try { localStorage.setItem("arcircle.launch.platform", plat); } catch { /* this visit */ }
    panel.querySelectorAll("#agl-plat [data-plat]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.plat === plat)));
    $("agl-fields").hidden = plat !== "argus";
    const h1 = panel.querySelector("h1");
    if (h1) h1.textContent = tr(plat === "argus" ? "Launch on Argus via ArcPad" : plat === "pons" ? "Launch on Pons via ArcPad" : plat === "pump" ? "Launch on Pump.fun via ArcPad" : "Launch on ArcPad");
    // the lede is about ArcPad's own pools; the other-chain venues say what they are instead
    const lede = panel.querySelector(".bp-lede");
    if (lede) {
      const L = { pons: "Launch on Pons V2, on Robinhood Chain, from your own wallet — 70% of the creator fees to you, 30% to ARCIRCLE PAD.", pump: "Launch on Pump.fun, on Solana, from your own Solana wallet — 70% of the creator fees to you, 30% to ARCIRCLE PAD, locked for good." }[plat];
      lede.textContent = tr(L || "Every launch gets a real Uniswap v4 pool in the same transaction — paired with USDC, Arc's own native currency, or with any Arc token you choose.");
    }
    const lbl = panel.querySelector("#ap-launch-submit .ap-launch-btn-label");
    if (lbl && !busy) lbl.textContent = tr(plat === "argus" ? "Launch on Argus" : plat === "pons" ? "Launch on Pons" : plat === "pump" ? "Launch on Pump.fun" : "Launch coin");
    if (window.arcPons && typeof window.arcPons.onPlat === "function") window.arcPons.onPlat(plat, quiet);
    if (window.arcPump && typeof window.arcPump.onPlat === "function") window.arcPump.onPlat(plat, quiet);
    if (plat === "argus") { paintAlloc(); paintFlow(); seedHint(); resumeCard(); balance(); }
    else $("agl-resume").hidden = true;
    if (!quiet && !reduce) { const f = $("agl-fields"); if (plat === "argus") { f.classList.remove("in"); void f.offsetWidth; f.classList.add("in"); } }
  }

  // ---------------- fields ----------------
  const ROWS = [["creator", "Creator", "Paid to the creator — 70% to you, 30% to ARCIRCLE PAD"], ["burn", "Buyback & burn", "Buys the coin back and burns it"], ["dividend", "Holder dividends", "Paid out to holders in USDC"], ["liquidity", "Liquidity", "Added to the pool"]];
  const sum = () => A.creator + A.burn + A.dividend + A.liquidity;
  function paintAlloc() {
    const box = $("agl-alloc");
    if (!box) return;
    if (!box.firstChild) {
      box.innerHTML = ROWS.map(([k, l, s]) => `<div class="agl-row" data-k="${k}"><span class="agl-dot ${k}" aria-hidden="true"></span><span class="agl-rl"><b>${T(l)}</b><small>${T(s)}</small></span>
        <input type="range" min="${k === "creator" ? MIN_CREATOR / 100 : 0}" max="100" step="5" data-alloc="${k}" aria-label="${T(l)}"><span class="agl-in sm"><input inputmode="numeric" data-alloc-n="${k}" aria-label="${T(l)}"><em>%</em></span></div>`).join("") +
        `<div class="agl-bar" aria-hidden="true">${ROWS.map(([k]) => `<i class="${k}"></i>`).join("")}</div><p class="agl-sum" id="agl-sum"></p>`;
    }
    for (const [k] of ROWS) {
      const r = box.querySelector(`[data-alloc="${k}"]`), n = box.querySelector(`[data-alloc-n="${k}"]`);
      if (document.activeElement !== r) r.value = A[k];
      if (document.activeElement !== n) n.value = A[k];
      box.querySelector(`.agl-bar .${k}`).style.flexGrow = A[k];
    }
    const s2 = sum(), ok = s2 === 100 && A.creator * 100 >= MIN_CREATOR;
    const el = $("agl-sum");
    el.className = "agl-sum" + (ok ? " ok" : " bad");
    el.innerHTML = ok ? `${T("Adds up to 100%")}` : s2 !== 100
      ? `${T("Adds up to")} <b data-no-i18n>${s2}%</b> — ${T("it must be exactly 100%.")} <button type="button" class="ams-mini" data-alloc-fix>${T("Fix it")}</button>`
      : `${T("The creator share must be at least 50%.")}`;
  }
  // after one share moves, the others make room so it stays at 100%
  function setShare(k, v) {
    v = Math.max(k === "creator" ? MIN_CREATOR / 100 : 0, Math.min(100, Math.round(Number(v) || 0)));
    A[k] = v;
  }
  function fixAlloc(keep) {
    let over = sum() - 100;
    const order = ["liquidity", "dividend", "burn", "creator"].filter((k) => k !== keep);
    for (const k of order) {
      if (!over) break;
      const floor = k === "creator" ? MIN_CREATOR / 100 : 0;
      const d = over > 0 ? Math.min(over, A[k] - floor) : over; // too little: the first one takes the rest
      A[k] -= d; over -= d;
    }
    if (over) A[keep] -= over;
  }
  function flowParts() {
    const tb = ctx ? ctx.treasuryBps / 100 : null;
    const rest = tb == null ? null : 100 - tb, c = rest == null ? null : (rest * A.creator) / 100;
    return { tb, rest, you: c == null ? null : c * (1 - PLATFORM_BPS / 10000), plat: c == null ? null : (c * PLATFORM_BPS) / 10000, burn: rest == null ? null : (rest * A.burn) / 100, div: rest == null ? null : (rest * A.dividend) / 100, liq: rest == null ? null : (rest * A.liquidity) / 100 };
  }
  function paintFlow() {
    const box = $("agl-flow");
    if (!box) return;
    const f = flowParts(), n = (v) => (v == null ? "…" : "$" + v.toFixed(v < 10 ? 2 : 1).replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1"));
    const seg = [["argus", "Argus", f.tb], ["you", "To you", f.you], ["plat", "ARCIRCLE PAD", f.plat], ["burn", "Buyback & burn", f.burn], ["div", "Holder dividends", f.div], ["liq", "Liquidity", f.liq]];
    box.innerHTML = `<small>${T("Of every $100 of tax collected")}</small><div class="agl-flow-bar">${seg.map(([k, , v]) => `<i class="${k}" style="flex-grow:${v || 0}"></i>`).join("")}</div>
      <ul>${seg.filter(([, , v]) => v == null || v > 0).map(([k, l, v]) => `<li class="${k}"><i aria-hidden="true"></i><span>${T(l)}</span><b data-no-i18n>${n(v)}</b></li>`).join("")}</ul>
      <p class="hint">${T("Argus's share is read live from the Portal. Creator fees wait on Argus until claimed — you and ARCIRCLE PAD each claim your own part at argus.world/claim.")}</p>`;
  }
  const seedRaw = () => { const v = String(($("agl-seed") || {}).value || "").trim(); if (!v) return null; try { return ethers.parseUnits(v, 6); } catch { return undefined; } };
  function seedHint() {
    const el = $("agl-seed-hint");
    chain().then((c) => {
      const min = Number(ethers.formatUnits(c.minSeed, 6));
      el.textContent = tr("Argus's minimum is {n} USDC. More buys you more of your coin at the opening price; Argus refuses an opening buy that would reach its bonding mark.").replace("{n}", min.toLocaleString("en-US", { maximumFractionDigits: 2 }));
      $("agl-seed").placeholder = `${min.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${tr("Minimum buy")})`;
      paintFlow(); balance();
    }).catch(() => { el.textContent = tr("Couldn't read Argus right now — try again in a moment."); });
  }
  async function balance() {
    const el = $("agl-balance");
    if (!el) return;
    if (!me()) { el.textContent = ""; return; }
    try {
      const [bal, c] = await Promise.all([retry(() => rd(USDC, ERC20).balanceOf(me())), chain()]);
      const s = seedRaw(), need = s && s > c.minSeed ? s : c.minSeed;
      const ok = BigInt(bal) >= need;
      el.className = "ap-launch-balance agl-only " + (ok ? "ok" : "short");
      el.textContent = tr(ok ? "Wallet: {b} USDC · the opening buy needs {n} USDC, plus gas" : "Not enough USDC — the opening buy needs {n} USDC plus gas; this wallet has {b} USDC on Arc.")
        .replace("{b}", Number(ethers.formatUnits(bal, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 })).replace("{n}", Number(ethers.formatUnits(need, 6)).toLocaleString("en-US", { maximumFractionDigits: 2 }));
    } catch { el.textContent = ""; }
  }

  // ---------------- steps ----------------
  const STEPS = [["read", "Read Argus Portal #8"], ["mine", "Find the hook address"], ["check", "Check it with the Portal"], ["approve", "Approve the opening buy (USDC)"], ["launch", "Launch on Argus"], ["split", "Set the 70 / 30 fee split"], ["list", "List it on ArcPad"]];
  function steps(show) {
    const ol = $("agl-steps");
    ol.hidden = !show;
    if (show) ol.innerHTML = STEPS.map(([k, l]) => `<li data-step="${k}"><i aria-hidden="true"></i><span><b>${T(l)}</b><small></small></span></li>`).join("");
  }
  function step(k, st, note) {
    const li = $("agl-steps").querySelector(`[data-step="${k}"]`);
    if (!li) return;
    li.className = st;
    if (note != null) li.querySelector("small").textContent = note;
  }
  const status = (html, kind) => { $("ap-launch-status").innerHTML = html ? `<div class="status ${kind || "pending"}">${html}</div>` : ""; };

  // ---------------- hook mining (Web Workers) ----------------
  // escrow = CREATE2(partsFactory, keccak(portal ‖ keccak("argus.v5.escrow" ‖ creator ‖ salt)), escrowInitCodeHash)
  // hook   = CREATE2(hookFactory, salt, keccak(template with the escrow in its constructor tail))
  // The Portal's own hookInitCodeHash / predictEscrow confirm the result before anything is sent.
  const WORKER = `self.onmessage=function(e){var d=e.data;importScripts(d.lib);var E=self.ethers,code=E.getBytes(d.template),off=d.offset,mask=BigInt(d.mask),flags=BigInt(d.flags);
for(var i=d.start;i<d.limit;i+=d.step){var salt=d.base+i.toString(16).padStart(16,"0");
var es=E.solidityPackedKeccak256(["string","address","bytes32"],["argus.v5.escrow",d.creator,salt]);
var c2=E.solidityPackedKeccak256(["address","bytes32"],[d.portal,es]);
var escrow=E.getCreate2Address(d.parts,c2,d.escrowHash);code.set(E.getBytes(E.zeroPadValue(escrow,32)),off);
var ih=E.keccak256(code),hook=E.getCreate2Address(d.hooks,salt,ih);
if((BigInt(hook)&mask)===flags){self.postMessage({found:true,salt:salt,hook:hook,escrow:escrow,initHash:ih,i:i});return;}
if(((i-d.start)/d.step)%1500===0)self.postMessage({tick:i});}
self.postMessage({done:true});};`;
  const TAIL = 11 * 32, ESCROW_WORD = 2;
  function mine(o, onTick) {
    const tpl = ethers.getBytes(o.template);
    const offset = tpl.length - TAIL + ESCROW_WORD * 32;
    if (offset < 0) return Promise.reject(new Error(tr("Argus's hook template isn't the expected shape — stopped before launching.")));
    for (let i = 0; i < 32; i++) if (tpl[offset + i] !== 0) return Promise.reject(new Error(tr("Argus's hook template isn't the expected shape — stopped before launching.")));
    // a random prefix: a creator's second launch never lands on the first one's salt
    const base = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1)), limit = 3000000;
    const job = { lib: ETHERS_URL, template: o.template, offset, mask: HOOK_MASK.toString(), flags: HOOK_FLAGS.toString(), base, creator: o.creator, portal: PORTAL, parts: o.parts, hooks: o.hooks, escrowHash: o.escrowHash, step: n, limit };
    return new Promise((resolve, reject) => {
      let url, ws = [], done = 0, tries = 0;
      const stop = () => { ws.forEach((w) => w.terminate()); if (url) URL.revokeObjectURL(url); };
      try { url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })); } catch (e) { reject(e); return; }
      for (let k = 0; k < n; k++) {
        let w;
        try { w = new Worker(url); } catch (e) { stop(); reject(e); return; }
        ws.push(w);
        w.onmessage = (ev) => {
          const d = ev.data;
          if (d.found) { stop(); resolve({ salt: d.salt, hook: d.hook, escrow: d.escrow, initHash: d.initHash, tries: d.i }); }
          else if (d.tick != null) { tries += 1500; if (onTick) onTick(tries); }
          else if (d.done && ++done === n) { stop(); reject(new Error(tr("No hook address found — try again."))); }
        };
        w.onerror = (e) => { stop(); reject(new Error(e.message || "worker failed")); };
        w.postMessage({ ...job, start: k });
      }
    });
  }

  // ---------------- validation ----------------
  function readForm() {
    const v = (id) => String(($(id) || {}).value || "").trim();
    const f = {
      name: v("ap-name"), symbol: v("ap-symbol").toUpperCase(), image: v("ap-logo"), description: v("ap-description"), website: v("ap-website"), twitter: v("ap-twitter"), telegram: v("ap-telegram"),
      buy: Math.round(Number(v("agl-buy")) * 100), sell: Math.round(Number(v("agl-sell")) * 100), seed: seedRaw(),
    };
    const bad = (m) => ({ ok: false, msg: tr(m) });
    if (!f.name || !f.symbol) return bad("Name and symbol are required.");
    if (f.image && !/^https:\/\//i.test(f.image)) return bad("Argus needs a hosted logo link — upload the file (it's hosted for you) or paste an https:// image URL.");
    if (f.image.length > 400) return bad("That logo link is too long for Argus — upload the file instead.");
    if (!(f.buy >= 0 && f.buy <= 1000 && f.sell >= 0 && f.sell <= 1000) || !isFinite(f.buy) || !isFinite(f.sell)) return bad("Each tax must be between 0% and 10%.");
    if (f.buy === 0 && f.sell === 0) return bad("Buy and sell tax can't both be 0%.");
    if (sum() !== 100) return bad("The four shares must add up to exactly 100%.");
    if (A.creator * 100 < MIN_CREATOR) return bad("The creator share must be at least 50%.");
    if (f.seed === undefined) return bad("That opening buy isn't a USDC amount.");
    if (!$("agl-agree").checked) return bad("Tick the box to confirm you've read how it works.");
    return { ok: true, f };
  }

  // ---------------- the launch ----------------
  async function submit() {
    if (busy) return;
    const r = readForm();
    if (!r.ok) { status(esc(r.msg), "error"); return; }
    const f = r.f;
    if (!me()) {
      status(T("Connect a wallet first…"));
      if (typeof connectWallet === "function") await connectWallet();
      if (!me()) { status(T("Connect a wallet to launch."), "error"); return; }
    }
    busy = true;
    const btn = $("ap-launch-submit"), lbl = btn.querySelector(".ap-launch-btn-label");
    btn.disabled = true; btn.classList.add("is-busy"); if (lbl) lbl.textContent = tr("Launching…");
    steps(true); status("");
    let cur = "read";
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      const creator = ethers.getAddress(me());
      step("read", "doing");
      const c = await chain(true);
      if (c.registry !== lc(REGISTRY)) throw new Error(tr("Argus's creator registry changed since this page was built — stopped before launching."));
      const seed = f.seed && f.seed > c.minSeed ? f.seed : c.minSeed;
      const bal = BigInt(await retry(() => rd(USDC, ERC20).balanceOf(creator)));
      if (bal < seed) throw new Error(tr("Not enough USDC for the opening buy ({n} USDC).").replace("{n}", ethers.formatUnits(seed, 6)));
      step("read", "ok", tr("Argus keeps {p}% of every fee · minimum opening buy {n} USDC").replace("{p}", (c.treasuryBps / 100).toString()).replace("{n}", ethers.formatUnits(c.minSeed, 6)));

      cur = "mine"; step("mine", "doing", tr("Searching…"));
      const P = rd(PORTAL, PORTAL_ABI);
      const [template, escrowHash] = await Promise.all([
        retry(() => P.hookInitCodeTemplate(USDC, f.buy, f.sell)),
        retry(() => rd(c.parts, ["function escrowInitCodeHash(address portal) view returns (bytes32)"]).escrowInitCodeHash(PORTAL)),
      ]);
      const t0 = performance.now();
      const found = await mine({ template, escrowHash, creator, parts: c.parts, hooks: c.hooks }, (n) => step("mine", "doing", tr("Searching… {n} tried").replace("{n}", n.toLocaleString("en-US"))));
      step("mine", "ok", `${short(found.hook)} · ${((performance.now() - t0) / 1000).toFixed(1)}s`);

      cur = "check"; step("check", "doing");
      const [remoteHash, remoteEscrow] = await Promise.all([retry(() => P.hookInitCodeHash(creator, found.salt, USDC, f.buy, f.sell)), retry(() => P.predictEscrow(creator, found.salt))]);
      if (lc(remoteHash) !== lc(found.initHash) || lc(remoteEscrow) !== lc(found.escrow)) throw new Error(tr("The Portal disagrees with the hook address found here — stopped before launching."));
      step("check", "ok", tr("Matches the Portal"));

      cur = "approve"; step("approve", "doing");
      const usdcW = new ethers.Contract(USDC, ERC20, state.signer);
      const allow = BigInt(await retry(() => rd(USDC, ERC20).allowance(creator, PORTAL)));
      if (allow < seed) { step("approve", "doing", tr("Confirm in your wallet…")); await (await usdcW.approve(PORTAL, seed)).wait(); }
      step("approve", "ok", `${ethers.formatUnits(seed, 6)} USDC`);

      cur = "launch"; step("launch", "doing", tr("Checking…"));
      const params = {
        name: f.name, symbol: f.symbol, totalSupply: SUPPLY, buyTaxBps: f.buy, sellTaxBps: f.sell,
        alloc: [A.creator * 100, A.burn * 100, A.dividend * 100, A.liquidity * 100, 0],
        quoteAsset: USDC, payoutAsset: USDC, kothBps: 0, payoutAddress: creator, identityProvider: ethers.ZeroHash, identitySubject: 0n,
        bundle: [{ to: creator, amountQuote: seed }], snipeExempt: [],
        meta: { imageURI: f.image, website: f.website, twitter: f.twitter, telegram: f.telegram, description: f.description },
      };
      const data = PI.encodeFunctionData("launch", [params, found.salt]);
      const gas = await readProvider().estimateGas({ from: creator, to: PORTAL, data });
      step("launch", "doing", tr("Confirm in your wallet…"));
      const tx = await state.signer.sendTransaction({ to: PORTAL, data, gasLimit: (BigInt(gas) * 12n) / 10n });
      setPending(lc(creator), { tx: tx.hash, sym: f.symbol, at: Date.now() });
      step("launch", "doing", tr("Launching…"));
      const rc = await tx.wait();
      const token = tokenFrom(rc);
      if (!token) throw new Error(tr("The launch confirmed but its token couldn't be read — check the transaction."));
      setPending(lc(creator), { tx: tx.hash, token, sym: f.symbol, at: Date.now() });
      step("launch", "ok", `$${f.symbol} · ${short(token)}`);

      cur = "split";
      await splitAndList(token, tx.hash, f.symbol);
    } catch (e) {
      console.warn("argus launch", e);
      step(cur, "bad", why(e));
      status(esc(why(e)), "error");
      resumeCard();
    } finally {
      busy = false; btn.disabled = false; btn.classList.remove("is-busy");
      if (lbl) lbl.textContent = tr(plat === "argus" ? "Launch on Argus" : "Launch coin");
    }
  }
  function tokenFrom(rc) {
    for (const l of (rc && rc.logs) || []) {
      if (lc(l.address) !== lc(PORTAL)) continue;
      try { const p = PI.parseLog(l); if (p && p.name === "Launched") return lc(p.args.token); } catch { /* another event */ }
    }
    return null;
  }
  // step 5 and 6 — also what the "finish" card runs for a launch whose split didn't happen
  async function splitAndList(token, tx, sym) {
    const creator = ethers.getAddress(me());
    step("split", "doing", tr("Checking…"));
    const R = rd(REGISTRY, REG_ABI);
    const payout = lc(await retry(() => R.payoutOf(token)));
    if (payout !== lc(creator)) throw new Error(tr("This coin's payout wallet is {w} — connect that wallet to set the split.").replace("{w}", short(payout)));
    const cur = await retry(() => R.payoutSplit(token)).catch(() => null);
    const has = cur && cur[0] && [...cur[0]].some((a, i) => lc(a) === lc(PLATFORM) && Number(cur[1][i]) >= PLATFORM_BPS);
    if (!has) {
      const parts = [{ recipient: creator, bps: 10000 - PLATFORM_BPS }, { recipient: ethers.getAddress(PLATFORM), bps: PLATFORM_BPS }];
      const data = RI.encodeFunctionData("setPayoutSplit", [token, parts]);
      const gas = await readProvider().estimateGas({ from: creator, to: REGISTRY, data });
      step("split", "doing", tr("Confirm in your wallet…"));
      await (await state.signer.sendTransaction({ to: REGISTRY, data, gasLimit: (BigInt(gas) * 13n) / 10n })).wait();
    }
    step("split", "ok", tr("70% you · 30% ARCIRCLE PAD"));
    step("list", "doing");
    let ok = false, last = "";
    for (let i = 0; i < 4 && !ok; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2500));
      const res = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "argusreg", token, tx }) }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      ok = !!(res && res.ok && j.ok); last = j.error || "";
    }
    if (ok) step("list", "ok", tr("In Explore under Argus")); else step("list", "bad", tr("The server couldn't list it yet ({e}) — it's picked up from the chain within a few minutes.").replace("{e}", last || "offline"));
    setPending(lc(creator), null);
    $("agl-resume").hidden = true;
    done(token, sym);
    AR.at = 0; loadList();
  }
  function done(token, sym) {
    status(`<b>${T("Your coin is live on Argus.")}</b> <span data-no-i18n>$${esc(sym || "")}</span> · ${T("Claim your 70% of the creator fees any time at argus.world/claim.")}
      <span class="agl-links"><a href="https://argus.world/token/${esc(token)}" target="_blank" rel="noopener">Argus ↗</a><a href="#scanner?t=${esc(token)}">${T("Scan it")}</a><a href="#liquidity?token=${esc(token)}">${T("Liquidity")}</a><a href="#explore">${T("See it in Explore")}</a><a href="${esc(EXPL("token", token))}" target="_blank" rel="noopener">${T("Explorer")} ↗</a></span>`, "success");
    if (typeof window.arcConfetti === "function") window.arcConfetti();
    if (typeof window.arcLaunchLive === "function") window.arcLaunchLive({ platform: "argus", token, symbol: sym, venue: `https://argus.world/token/${token}` });
  }
  // a launch that went out but whose split step didn't finish (closed tab, rejected, out of gas)
  async function resumeCard() {
    const box = $("agl-resume");
    if (!box) return;
    const a = me(), p = a && getPending(a);
    if (plat !== "argus" || !p || busy) { box.hidden = true; return; }
    let token = p.token;
    if (!token && p.tx) {
      try { const rc = await readProvider().getTransactionReceipt(p.tx); if (rc && rc.status === 1) { token = tokenFrom(rc); if (token) setPending(a, { ...p, token }); } else if (rc && rc.status === 0) { setPending(a, null); box.hidden = true; return; } } catch { /* try later */ }
    }
    if (!token) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<b>${T("One step left")}</b><span><span data-no-i18n>$${esc(p.sym || "")}</span> ${T("is live on Argus, but the 70 / 30 fee split isn't set yet — until it is, it isn't listed on ArcPad and has no ArcPad support.")}</span><button type="button" class="ams-mini" data-agl-finish>${T("Set the fee split")}</button>`;
    box.querySelector("[data-agl-finish]").onclick = async () => {
      if (busy) return;
      busy = true; steps(true);
      ["read", "mine", "check", "approve", "launch"].forEach((k) => step(k, "ok"));
      try { await splitAndList(token, p.tx, p.sym); }
      catch (e) { step("split", "bad", why(e)); status(esc(why(e)), "error"); }
      finally { busy = false; }
    };
  }

  // ---------------- wiring ----------------
  function wire() {
    $("agl-plat").addEventListener("click", (e) => { const b = e.target.closest("[data-plat]"); if (b) setPlat(b.dataset.plat); });
    const box = $("agl-alloc");
    paintAlloc();
    box.addEventListener("input", (e) => {
      const k = e.target.dataset.alloc || e.target.dataset.allocN;
      if (!k) return;
      setShare(k, e.target.value);
      if (e.target.dataset.alloc) fixAlloc(k); // the slider rebalances the others; typed numbers wait for "Fix it"
      paintAlloc(); paintFlow();
    });
    box.addEventListener("click", (e) => { if (e.target.closest("[data-alloc-fix]")) { fixAlloc("creator"); if (sum() !== 100) fixAlloc("liquidity"); paintAlloc(); paintFlow(); } });
    $("agl-seed-quick").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; $("agl-seed").value = b.dataset.v; balance(); });
    $("agl-seed").addEventListener("input", () => { clearTimeout(wire.t); wire.t = setTimeout(balance, 400); });
    for (const id of ["agl-buy", "agl-sell"]) $(id).addEventListener("input", paintFlow);
    let last = me();
    setInterval(() => { if (me() !== last) { last = me(); if (plat === "argus") { resumeCard(); balance(); } } }, 1500);
    document.addEventListener("arc:lang", () => { if (plat === "argus") { $("agl-alloc").innerHTML = ""; paintAlloc(); paintFlow(); seedHint(); } setPlat(plat, true); });
    setPlat(plat, true);
  }

  // =====================================================================
  // Explore: coins launched on Argus through ArcPad
  // =====================================================================
  const AR = { items: [], at: 0, busy: false };
  function rowOf(x) {
    return {
      platform: "argus", token: lc(x.token), name: x.name || "", symbol: x.symbol || "", creator: x.creator, quoteToken: USDC, imageUrl: x.image || "",
      description: x.description || "", launchedAt: x.launchedAt || 0, twitter: x.twitter || "", telegram: x.telegram || "", discord: "", website: x.website || "",
      quoteSymbol: "USDC", quoteDecimals: 6, quoteIsUsdc: true, priceUsdc: x.priceUsd, priceInQuote: x.priceUsd, marketCapUsd: x.mcapUsd, isLivePrice: x.priceUsd != null, hook: x.hook, tx: x.tx, active: x.active,
      // the opening price, from the pool's first tick (same maths as the server's priceFromSqrt)
      startPrice: Number.isFinite(x.tickStart) && typeof x.tokenIs0 === "boolean" ? (x.tokenIs0 ? Math.pow(1.0001, x.tickStart) * 1e12 : 1e12 / Math.pow(1.0001, x.tickStart)) : null,
    };
  }
  async function loadList() {
    if (AR.busy || Date.now() - AR.at < 45e3) return AR.items;
    AR.busy = true;
    try {
      const r = await fetch("/api/social?argusarc=list", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && Array.isArray(j.items)) { AR.items = j.items.filter((x) => x.active !== false && isAddr(x.token)).map(rowOf); AR.at = Date.now(); milestones(AR.items); }
    } catch { /* keep what we had */ }
    AR.busy = false;
    // only once ArcPad's own launches are in: before that (or if Arc couldn't be read) the grid keeps its skeleton / error
    if (typeof renderArcpadExploreGrid === "function" && document.getElementById("ap-explore-grid") && typeof ARC !== "undefined" && ARC.launchesLoaded) renderArcpadExploreGrid();
    deepLink();
    if (typeof window.arcActivityArgus === "function") window.arcActivityArgus(); // the live ticker
    return AR.items;
  }
  // a link straight to one coin (the Telegram launch card): #explore?plat=argus&coin=0x…
  function deepLink() {
    const dl = /^#explore\b.*[?&]coin=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (dl && AR.opened !== lc(dl[1]) && AR.items.some((x) => x.token === lc(dl[1]))) { AR.opened = lc(dl[1]); if (typeof window.openArcCoin === "function") window.openArcCoin(dl[1]); else openSheet(dl[1]); }
  }
  // market cap on a line from $0 to a bit past $100K: where the coin is now (the label rides the
  // dot), and the $20K / $100K support marks. "card" is the compact one on Explore cards.
  const kfmt = (v) => (v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : "$" + Math.round(v));
  // a coin that crossed $20K or $100K since this browser last looked: its bar bursts at the
  // mark and the card glows (once, for a few seconds). The first visit only records the levels.
  const MS_KEY = "arcircle.argus.ms.v1";
  const levelOf = (m) => (m != null && m >= SUP.MARKETING_MCAP ? 2 : m != null && m >= SUP.DEX_INFO_MCAP ? 1 : 0);
  function milestones(items) {
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(MS_KEY) || "null"); } catch { seen = null; }
    const first = !seen; seen = seen || {};
    AR.burst = AR.burst || new Map();
    for (const x of items) {
      const lv = levelOf(x.marketCapUsd), was = seen[x.token] || 0;
      if (lv > was && !first) {
        AR.burst.set(x.token, lv);
        setTimeout(() => AR.burst.delete(x.token), 6000);
        if (typeof window.arcTickerEvent === "function") window.arcTickerEvent({ kind: "milestone", token: x.token, sym: x.symbol, img: x.imageUrl, text: lv === 2 ? "$100K" : "$20K", argus: true });
      }
      if (lv > was || first) seen[x.token] = Math.max(lv, was);
    }
    try { localStorage.setItem(MS_KEY, JSON.stringify(seen)); } catch { /* private mode */ }
  }
  function progressHtml(m, kind, token) {
    const lo = SUP.DEX_INFO_MCAP, hi = SUP.MARKETING_MCAP, max = hi * 1.1;
    const x = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    const p = m == null || !isFinite(m) ? 0 : x(m), lab = Math.max(kind === "card" ? 12 : 8, Math.min(kind === "card" ? 88 : 92, p));
    const on = (v) => m != null && m >= v;
    const tick = (v, t) => `<em class="${on(v) ? "on" : ""}" style="left:${x(v).toFixed(1)}%">${t}</em>`;
    const burst = token && AR.burst && AR.burst.get(lc(token));
    return `<div class="agl-prog ${kind || ""}${reduce ? " still" : ""}${burst ? " burst b" + burst : ""}" style="--p:${p.toFixed(1)}%;--l:${lab.toFixed(1)}%" role="img" aria-label="${T("Market cap")} ${m != null ? kfmt(m) : "—"}">
      <b class="now" data-no-i18n>${m != null ? kfmt(m) : "—"}</b>
      <div class="trk"><i class="fill"></i><i class="tk${on(lo) ? " on" : ""}" style="left:${x(lo).toFixed(1)}%"></i><i class="tk${on(hi) ? " on" : ""}" style="left:${x(hi).toFixed(1)}%"></i><i class="dot"></i></div>
      ${tick(lo, "$20K")}${tick(hi, "$100K")}</div>`;
  }

  // the coin's sheet: numbers, the support milestones, links
  let sheet = null;
  function openSheet(token) {
    const l = AR.items.find((x) => x.token === lc(token));
    if (!l) return;
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "agl-sheet"; sheet.hidden = true;
      sheet.innerHTML = `<div class="agl-sh-bg" data-sh-close></div><div class="agl-sh-box" role="dialog" aria-modal="true" aria-labelledby="agl-sh-t"></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (e) => { if (e.target.closest("[data-sh-close]")) closeSheet(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    }
    const m = l.marketCapUsd, lo = SUP.DEX_INFO_MCAP, hi = SUP.MARKETING_MCAP;
    const logo = /^https:\/\//i.test(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="" onerror="this.remove()">` : `<span>${esc(String(l.symbol || "?").slice(0, 1))}</span>`;
    const ms = (need, label, sub) => { const on = m != null && m >= need; return `<li class="${on ? "on" : ""}"><i aria-hidden="true">${on ? "✓" : ""}</i><span><b>${T(label)}</b><small>${T(sub)}</small></span></li>`; };
    sheet.querySelector(".agl-sh-box").innerHTML = `
      <button type="button" class="agl-sh-x" data-sh-close aria-label="${T("Close")}">×</button>
      <div class="agl-sh-h"><div class="agl-sh-logo">${logo}</div><div><h3 id="agl-sh-t" data-no-i18n>$${esc(l.symbol)} <small>${esc(l.name)}</small></h3><span class="agl-sh-tag">${T("Launched on Argus via ArcPad")}</span></div></div>
      <div class="agl-sh-stats"><div><small>${T("Price")}</small><b data-no-i18n>${l.priceUsdc != null ? usd(l.priceUsdc) : "—"}</b></div><div><small>${T("Market cap")}</small><b data-no-i18n>${usd(m)}</b></div><div><small>${T("Creator")}</small><b data-no-i18n><a href="${esc(EXPL("address", l.creator))}" target="_blank" rel="noopener">${esc(short(l.creator))}</a></b></div></div>
      ${progressHtml(m, "lg", l.token)}
      <ul class="agl-sh-ms">${ms(lo, "Dexscreener info support", "From a $20K market cap: we help update the coin's Dexscreener info.")}${ms(hi, "Marketing support", "From a $100K market cap: boosts, calls and promotion, case by case.")}</ul>
      <p class="agl-sh-note">${T("Support may be refused if our Token Scanner finds signs of manipulation, or if the 70 / 30 fee split is removed. It is ARCIRCLE PAD's own policy, not a contract.")}</p>
      ${l.description ? `<p class="agl-sh-desc" data-no-i18n>${esc(l.description)}</p>` : ""}
      <div class="agl-sh-acts"><a class="bp-btn-primary" href="https://argus.world/token/${esc(l.token)}" target="_blank" rel="noopener">${T("Trade on Argus")} ↗</a><a class="bp-btn-ghost" href="#scanner?t=${esc(l.token)}" data-sh-close>${T("Scan it")}</a><a class="bp-btn-ghost" href="#liquidity?token=${esc(l.token)}" data-sh-close>${T("Liquidity")}</a><a class="bp-btn-ghost" href="https://dexscreener.com/arc/${esc(l.token)}" target="_blank" rel="noopener">${T("Chart")} ↗</a></div>`;
    sheet.hidden = false;
    document.documentElement.classList.add("agl-sh-open");
    requestAnimationFrame(() => sheet.classList.add("in"));
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("in");
    document.documentElement.classList.remove("agl-sh-open");
    setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 200);
  }

  window.arcArgus = { active: () => plat === "argus" && !$("agl-fields").hidden, submit, rows: () => AR.items, load: loadList, openSheet, setPlatform: setPlat, progress: progressHtml };
  wire();
  window.addEventListener("hashchange", () => { if (/[?&]coin=0x/.test(location.hash)) { if (AR.items.length) deepLink(); else loadList(); } });
  document.addEventListener("arcpad:tab", (e) => { const t = e.detail && e.detail.tab; if (t === "explore" || t === "home") loadList(); if (t === "launch") { const h = /[?&]platform=(argus|pons|pump)\b/.exec(location.hash); if (h) setPlat(h[1]); resumeCard(); } });
  setTimeout(loadList, 1200);
})();
