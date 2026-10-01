/* global ethers, CONFIG, state, withRetry, connectWallet, ensureArcForWrite, renderArcpadExploreGrid, fmtUsd, WagmiCoreRef, wagmiConfigRef */
// arc-pons.js — "Launch on Pons" through ArcPad (Robinhood Chain), and those coins in Explore.
//
// The launch form's platform switch (arc-argus.js) has a third choice, Pons. It launches an ordinary Pons V2 coin
// (PonsV2LaunchFactory.launchToken, a bonding curve that graduates into a locked Uniswap v4 pool) from the creator's
// own wallet on Robinhood Chain, in one signature. The only ArcPad part is the coin's creatorFeeRecipient: the
// creator's ArcPadPonsSplitter (contracts/contracts/ArcPadPonsSplits.sol) — every creator fee and creator tax Pons
// credits to it is paid out 70% to the creator, 30% to the ARCIRCLE PAD treasury, for the life of the coin. The
// splitter's address is known before it exists (CREATE2), so nothing is deployed at launch; the first claim does it.
//   1. read the factory (launch fee, who may launch, the launch config, Pons's economics hash) and ArcPadPonsSplits
//   2. switch the wallet to Robinhood Chain, launch, read the token from TokenLaunched
//   3. report it to /api/social (ponsreg), which checks the chain and lists it in Explore
// Support (Dexscreener info at $20K, marketing at $100K, refused on manipulation) is ARCIRCLE PAD's own policy.
(function () {
  "use strict";
  const P = typeof CONFIG !== "undefined" && CONFIG.PONS;
  const panel = document.getElementById("bp-panel-launch");
  const fields = document.getElementById("pon-fields");
  if (!P || !panel || !fields || typeof ethers === "undefined") return;

  // ---------------- basics ----------------
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());
  const usd = (n) => (n == null || !isFinite(n) ? "—" : typeof fmtUsd === "function" ? fmtUsd(n) : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const ethS = (wei, d) => Number(ethers.formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: d == null ? 5 : d });
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CHAIN = Number(P.CHAIN_ID || 4663), CHAIN_HEX = "0x" + CHAIN.toString(16);
  const FACTORY = P.FACTORY, SPLITS = P.SPLITS || "", TREASURY = P.TREASURY || (CONFIG.ARGUS_V5 && CONFIG.ARGUS_V5.PLATFORM_WALLET) || "";
  const PLATFORM_BPS = P.PLATFORM_BPS || 3000;
  const SUP = P.SUPPORT || { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 };
  const EXPL = (kind, x) => `${P.EXPLORER}/${kind}/${x}`;
  const PONS_URL = (t) => `${P.APP}/${t}`;
  const ADD = { chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [P.RPC], blockExplorerUrls: [P.EXPLORER], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const ready = () => isAddr(SPLITS);

  // ---------------- ABIs (pons-labs contractsV2/src/v2, ArcPadPonsSplits.sol) ----------------
  const SOCIALS_T = "tuple(string twitter, string telegram, string discord, string website, string farcaster)";
  const PARAMS_T = `tuple(string name, string symbol, string logo, string description, ${SOCIALS_T} socials, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, bytes32 expectedEconomics, bytes32 salt)`;
  const FACTORY_ABI = [
    "function launchConfigCount() view returns (uint256)",
    "function getLaunchConfig(uint256 id) view returns (tuple(uint256 supply, uint256 curveFeeBps, uint256 phantomQuote, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, bool enabled))",
    "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
    "function launchFee() view returns (uint256)", "function canLaunch(address) view returns (bool)", "function maxCreatorTaxBps() view returns (uint256)", "function feeEscrow() view returns (address)",
    `function launchToken(${PARAMS_T} params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)`,
    "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
    "error AlreadySet()", "error CombinedFeeTooHigh()", "error CreatorTaxTooHigh()", "error CurveFeeTooHigh()", "error CurveNotQuotable()", "error ExemptionListTooLong()",
    "error InvalidLaunchConfigId()", "error InvalidTokenParams()", "error LaunchConfigDisabled()", "error LaunchDependenciesNotWired()", "error LaunchDeployerNotSet()",
    "error LaunchEconomicsMismatch(bytes32 expected, bytes32 actual)", "error LaunchFeeNotPaid()", "error MetadataTooLong()", "error NotWhitelisted()", "error PairTokenNotApproved()",
    "error SupplyTooHigh()", "error SupplyTooLow()", "error TokenNotFound()", "error ZeroAddress()",
  ];
  const SPLITS_ABI = [
    "function splitterOf(address creator) view returns (address)", "function claimFor(address creator) returns (uint256 toCreator, uint256 toTreasury)",
    "function escrow() view returns (address)", "function ponsFactory() view returns (address)", "function treasury() view returns (address)", "function platformBps() view returns (uint16)",
    "error BadBps()", "error NotCreator()", "error PayFailed(address to)", "error Reentered()",
  ];
  const ESCROW_ABI = ["function balanceOf(address recipient) view returns (uint256)"];
  const FI = new ethers.Interface(FACTORY_ABI), SI = new ethers.Interface(SPLITS_ABI);
  const ERR = {
    NotWhitelisted: "Pons only lets whitelisted wallets launch right now.", LaunchFeeNotPaid: "The launch fee wasn't paid — try again.",
    LaunchEconomicsMismatch: "Pons changed its launch terms a moment ago — try again.", LaunchConfigDisabled: "This Pons launch setup was switched off — try again.",
    CreatorTaxTooHigh: "The creator tax is above Pons's cap.", CombinedFeeTooHigh: "The creator tax plus Pons's fee is above Pons's cap — lower the tax.",
    MetadataTooLong: "A field is too long for Pons — shorten the description or a link.", InvalidTokenParams: "Pons rejected the name, symbol or links.",
    PayFailed: "A payout wallet refused the ETH.",
  };
  function why(err) {
    if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return tr("Cancelled in your wallet.");
    const data = err && (err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data));
    if (typeof data === "string" && data.length >= 10) {
      for (const I of [FI, SI]) { try { const e = I.parseError(data); if (e) return tr(ERR[e.name] || e.name); } catch { /* not this one */ } }
    }
    const m = String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    const hit = Object.keys(ERR).find((k) => m.includes(k));
    if (hit) return tr(ERR[hit]);
    if (/insufficient funds/i.test(m)) return tr("Not enough ETH on Robinhood Chain for the launch fee and gas.");
    return m.slice(0, 200);
  }

  // ---------------- Robinhood Chain: reads and the wallet ----------------
  let rp = null;
  const rpc = () => (rp = rp || new ethers.JsonRpcProvider(P.RPC, ethers.Network.from(CHAIN), { staticNetwork: true, batchMaxCount: 1 }));
  const rd = (addr, abi) => new ethers.Contract(addr, abi, rpc());
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  // keeps the page from reloading (arc-shared.js) and AppKit from pulling the wallet back to Arc mid-launch
  function holdChain(on) {
    if (on) { clearTimeout(holdChain.t); window.arcChainSwitching = true; try { sessionStorage.setItem("wallet.autoSwitch." + me(), "1"); } catch { /* fine */ } }
    else holdChain.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000);
  }
  async function toRobinhood() {
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) {
          if (Number(acc.chainId) !== CHAIN) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CHAIN, addEthereumChainParameter: ADD });
          return;
        }
      } catch (e) { if (rejected(e)) throw e; /* fall back to the raw provider */ }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
    const cur = Number.parseInt(await p.request({ method: "eth_chainId" }), 16);
    if (cur === CHAIN) return;
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
    catch (e) {
      if (rejected(e)) throw e;
      await p.request({ method: "wallet_addEthereumChain", params: [ADD] });
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }).catch(() => {});
    }
  }
  async function rhSigner() {
    await toRobinhood();
    const bp = new ethers.BrowserProvider(walletProv(), "any");
    for (let i = 0; i < 6; i++) { // some wallets report the new chain a moment after the switch resolves
      if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me());
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
  }
  async function backToArc() { try { if (typeof ensureArcForWrite === "function") await ensureArcForWrite(); } catch { /* the wallet stays on Robinhood Chain; the next Arc action asks */ } }

  // ---------------- what Pons and ArcPadPonsSplits say ----------------
  let ctx = null, ctxAt = 0;
  async function chain(force) {
    if (ctx && !force && Date.now() - ctxAt < 3 * 60e3) return ctx;
    const F = rd(FACTORY, FACTORY_ABI);
    const [fee, maxTax, count] = await Promise.all([retry(() => F.launchFee()), retry(() => F.maxCreatorTaxBps()), retry(() => F.launchConfigCount())]);
    let cfg = null;
    for (let id = 0; id < Number(count) && !cfg; id++) {
      const c = await retry(() => F.getLaunchConfig(id));
      if (c.enabled) cfg = { id, supply: BigInt(c.supply), curveFeeBps: Number(c.curveFeeBps), graduation: BigInt(c.graduationThreshold) };
    }
    ctx = { fee: BigInt(fee), maxTax: Number(maxTax), cfg };
    ctxAt = Date.now();
    return ctx;
  }
  // ArcPadPonsSplits must be the one this page was built for: Pons's factory and escrow, the treasury, 30%
  async function checkSplits() {
    const S = rd(SPLITS, SPLITS_ABI), F = rd(FACTORY, FACTORY_ABI);
    const [code, esc0, fac, tre, bps, fesc] = await Promise.all([rpc().getCode(SPLITS), retry(() => S.escrow()), retry(() => S.ponsFactory()), retry(() => S.treasury()), retry(() => S.platformBps()), retry(() => F.feeEscrow())]);
    if (!code || code === "0x") throw new Error(tr("ArcPad's fee splitter isn't on Robinhood Chain — stopped before launching."));
    if (lc(fac) !== lc(FACTORY) || lc(esc0) !== lc(fesc) || lc(tre) !== lc(TREASURY) || Number(bps) !== PLATFORM_BPS) throw new Error(tr("ArcPad's fee splitter doesn't match this page — stopped before launching."));
  }

  // ---------------- the form ----------------
  function paintGate() {
    const box = $("pon-gate");
    if (!box) return;
    if (!ready()) { box.className = "pon-gate wait"; box.innerHTML = `<b>${T("Being set up")}</b><span>${T("ArcPad's fee splitter for Pons is being deployed. The Pons option opens here as soon as it's live.")}</span>`; return; }
    box.className = "pon-gate";
    box.innerHTML = `<span class="pon-gate-l">${T("Reading Pons…")}</span>`;
    chain().then(async (c) => {
      const can = me() ? await retry(() => rd(FACTORY, FACTORY_ABI).canLaunch(me())).catch(() => null) : null;
      const cells = [
        ["Launch fee", c.fee === 0n ? tr("Free") : `${ethS(c.fee)} ETH`],
        ["Graduates at", c.cfg ? `${ethS(c.cfg.graduation, 3)} ETH` : "—"],
        ["Pons curve fee", c.cfg ? `${(c.cfg.curveFeeBps / 100).toString()}%` : "—"],
      ];
      box.className = "pon-gate" + (can === false ? " no" : "");
      box.innerHTML = `<div class="pon-gate-cells">${cells.map(([k, v]) => `<div><small>${T(k)}</small><b data-no-i18n>${esc(v)}</b></div>`).join("")}</div>` +
        (can === false ? `<p class="pon-gate-no">${T("Pons only lets whitelisted wallets launch right now — this wallet isn't on its list.")}</p>` : !c.cfg ? `<p class="pon-gate-no">${T("Pons has no open launch setup right now.")}</p>` : "");
      const tax = $("pon-tax");
      if (tax) { tax.max = String(c.maxTax / 100); const h = $("pon-tax-hint"); if (h) h.textContent = tr("0–{n}%. An extra fee on every trade, on top of Pons's own, paid to the coin's fee recipient — 70% you, 30% ARCIRCLE PAD. Fixed at launch.").replace("{n}", String(c.maxTax / 100)); }
      balance();
    }).catch(() => { box.className = "pon-gate no"; box.innerHTML = `<p class="pon-gate-no">${T("Couldn't read Pons on Robinhood Chain right now — try again in a moment.")}</p>`; });
  }
  async function balance() {
    const el = $("pon-balance");
    if (!el) return;
    if (!me() || !ready()) { el.textContent = ""; return; }
    try {
      const [bal, c] = await Promise.all([rpc().getBalance(me()), chain()]);
      const ok = BigInt(bal) > c.fee;
      el.className = "ap-launch-balance pon-only " + (ok ? "ok" : "short");
      el.textContent = tr(ok ? "Wallet on Robinhood Chain: {b} ETH · the launch needs {n} ETH plus gas" : "Not enough ETH on Robinhood Chain — the launch needs {n} ETH plus gas; this wallet has {b} ETH there.")
        .replace("{b}", ethS(bal)).replace("{n}", ethS(c.fee));
    } catch { el.textContent = ""; }
  }
  function readForm() {
    const v = (id) => String(($(id) || {}).value || "").trim();
    const f = {
      name: v("ap-name"), symbol: v("ap-symbol").toUpperCase(), logo: v("ap-logo"), description: v("ap-description"),
      website: v("ap-website"), twitter: v("ap-twitter"), telegram: v("ap-telegram"), discord: v("ap-discord"),
      tax: Math.round(Number(v("pon-tax") || "0") * 100), buyback: !!($("pon-buyback") || {}).checked,
    };
    const bad = (m) => ({ ok: false, msg: tr(m) });
    if (!ready()) return bad("ArcPad's fee splitter for Pons is being deployed — the Pons option opens as soon as it's live.");
    if (!f.name || !f.symbol) return bad("Name and symbol are required.");
    if (f.name.length > 64 || f.symbol.length > 16) return bad("The name or symbol is too long for Pons.");
    if (f.logo && !/^https:\/\//i.test(f.logo)) return bad("Pons needs a hosted logo link — upload the file (it's hosted for you) or paste an https:// image URL.");
    if (f.logo.length > 512) return bad("That logo link is too long for Pons — upload the file instead.");
    if (f.description.length > 2048) return bad("The description is too long for Pons.");
    for (const k of ["website", "twitter", "telegram", "discord"]) if (f[k].length > 256) return bad("A link is too long for Pons.");
    if (!(f.tax >= 0) || !isFinite(f.tax) || (ctx && f.tax > ctx.maxTax)) return bad("The creator tax is above Pons's cap.");
    if (!$("pon-agree").checked) return bad("Tick the box to confirm you've read how it works.");
    return { ok: true, f };
  }

  // ---------------- steps ----------------
  const STEPS = [["read", "Read Pons and ArcPad's fee splitter"], ["switch", "Switch to Robinhood Chain"], ["launch", "Launch on Pons"], ["list", "List it on ArcPad"]];
  function steps(show) {
    const ol = $("pon-steps");
    ol.hidden = !show;
    if (show) ol.innerHTML = STEPS.map(([k, l]) => `<li data-step="${k}"><i aria-hidden="true"></i><span><b>${T(l)}</b><small></small></span></li>`).join("");
  }
  function step(k, st, note) {
    const li = $("pon-steps").querySelector(`[data-step="${k}"]`);
    if (!li) return;
    li.className = st;
    if (note != null) li.querySelector("small").textContent = note;
  }
  const status = (html, kind) => { $("ap-launch-status").innerHTML = html ? `<div class="status ${kind || "pending"}">${html}</div>` : ""; };

  // ---------------- the launch ----------------
  let busy = false;
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
    let cur = "read", switched = false;
    try {
      const creator = ethers.getAddress(me());
      step("read", "doing");
      const [c] = await Promise.all([chain(true), checkSplits()]);
      if (!c.cfg) throw new Error(tr("Pons has no open launch setup right now."));
      if (f.tax > c.maxTax) throw new Error(tr("The creator tax is above Pons's cap."));
      const F = rd(FACTORY, FACTORY_ABI);
      const [can, econ, splitter, bal] = await Promise.all([
        retry(() => F.canLaunch(creator)), retry(() => F.previewLaunchEconomics(c.cfg.id, ethers.ZeroAddress)),
        retry(() => rd(SPLITS, SPLITS_ABI).splitterOf(creator)), rpc().getBalance(creator),
      ]);
      if (!can) throw new Error(tr("Pons only lets whitelisted wallets launch right now — this wallet isn't on its list."));
      if (BigInt(bal) <= c.fee) throw new Error(tr("Not enough ETH on Robinhood Chain for the launch fee and gas."));
      step("read", "ok", tr("Fee recipient: your ArcPad splitter {a} · 70% you, 30% ARCIRCLE PAD").replace("{a}", short(splitter)));

      cur = "switch"; step("switch", "doing", tr("Confirm in your wallet if it asks…"));
      holdChain(true); switched = true;
      const sg = await rhSigner();
      step("switch", "ok");

      cur = "launch"; step("launch", "doing", tr("Checking…"));
      const params = {
        name: f.name, symbol: f.symbol, logo: f.logo, description: f.description,
        socials: { twitter: f.twitter, telegram: f.telegram, discord: f.discord, website: f.website, farcaster: "" },
        creatorFeeRecipient: ethers.getAddress(splitter), creatorTaxBps: f.tax, buybackEnabled: f.buyback, expectedEconomics: econ,
        salt: ethers.hexlify(crypto.getRandomValues(new Uint8Array(32))),
      };
      const data = FI.encodeFunctionData("launchToken", [params, c.cfg.id, ethers.ZeroAddress]);
      const gas = await rpc().estimateGas({ from: creator, to: FACTORY, data, value: c.fee });
      step("launch", "doing", tr("Confirm in your wallet…"));
      const tx = await sg.sendTransaction({ to: FACTORY, data, value: c.fee, gasLimit: (BigInt(gas) * 12n) / 10n });
      step("launch", "doing", tr("Launching…"));
      const rc = await waitTx(tx);
      const token = tokenFrom(rc);
      if (!token) throw new Error(tr("The launch confirmed but its token couldn't be read — check the transaction."));
      step("launch", "ok", `$${f.symbol} · ${short(token)}`);

      cur = "list"; step("list", "doing");
      let ok = false, last = "";
      for (let i = 0; i < 4 && !ok; i++) {
        if (i) await new Promise((res) => setTimeout(res, 3000));
        const res = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ponsreg", token, tx: tx.hash }) }).catch(() => null);
        const j = res ? await res.json().catch(() => ({})) : {};
        ok = !!(res && res.ok && j.ok); last = j.error || "";
      }
      if (ok) step("list", "ok", tr("In Explore under Pons")); else step("list", "bad", tr("The server couldn't list it yet ({e}) — it's picked up from the chain within a few minutes.").replace("{e}", last || "offline"));
      done(token, f.symbol, tx.hash);
      PN.at = 0; loadList();
    } catch (e) {
      console.warn("pons launch", e);
      step(cur, "bad", why(e));
      status(esc(why(e)), "error");
    } finally {
      if (switched) { await backToArc(); holdChain(false); }
      busy = false; btn.disabled = false; btn.classList.remove("is-busy");
      if (lbl) lbl.textContent = tr(active() ? "Launch on Pons" : "Launch coin");
      balance();
    }
  }
  // the wallet's provider sometimes can't follow a chain it just added: wait on the public RPC as well
  async function waitTx(tx) {
    const viaRpc = (async () => { for (let i = 0; i < 120; i++) { const r = await rpc().getTransactionReceipt(tx.hash).catch(() => null); if (r) return r; await new Promise((res) => setTimeout(res, 2000)); } return null; })();
    const rc = await Promise.race([tx.wait().catch(() => viaRpc), viaRpc]);
    if (!rc) throw new Error(tr("The launch hasn't confirmed yet — check the transaction on Blockscout."));
    if (rc.status === 0) throw new Error(tr("The launch transaction failed on Robinhood Chain."));
    return rc;
  }
  function tokenFrom(rc) {
    for (const l of (rc && rc.logs) || []) {
      if (lc(l.address) !== lc(FACTORY)) continue;
      try { const p = FI.parseLog(l); if (p && p.name === "TokenLaunched") return lc(p.args.token); } catch { /* another event */ }
    }
    return null;
  }
  function done(token, sym, tx) {
    status(`<b>${T("Your coin is live on Pons.")}</b> <span data-no-i18n>$${esc(sym || "")}</span> · ${T("It trades on its Pons bonding curve until it graduates into a locked Uniswap v4 pool. Your 70% of the creator fees is claimed from the coin's card in Explore.")}
      <span class="agl-links"><a href="${esc(PONS_URL(token))}" target="_blank" rel="noopener">Pons ↗</a><a href="#explore?plat=pons&coin=${esc(token)}">${T("See it in Explore")}</a><a href="${esc(EXPL("tx", tx))}" target="_blank" rel="noopener">Blockscout ↗</a></span>`, "success");
    if (typeof window.arcConfetti === "function") window.arcConfetti();
  }

  // ---------------- the platform switch (arc-argus.js calls this) ----------------
  function active() { return panel.dataset.plat === "pons" && !fields.hidden; }
  function onPlat(p, quiet) {
    fields.hidden = p !== "pons";
    if (p !== "pons") return;
    paintGate(); balance();
    if (!quiet && !reduce) { fields.classList.remove("in"); void fields.offsetWidth; fields.classList.add("in"); }
  }

  // =====================================================================
  // Explore: coins launched on Pons through ArcPad
  // =====================================================================
  const PN = { items: [], at: 0, busy: false };
  function rowOf(x) {
    return {
      platform: "pons", chain: "robinhood", token: lc(x.token), name: x.name || "", symbol: x.symbol || "", creator: lc(x.creator), splitter: lc(x.splitter), curve: lc(x.curve),
      quoteToken: ethers.ZeroAddress, imageUrl: x.image || "", description: x.description || "", launchedAt: x.launchedAt || 0,
      twitter: x.twitter || "", telegram: x.telegram || "", discord: "", website: x.website || "",
      quoteSymbol: "ETH", quoteDecimals: 18, quoteIsUsdc: false, priceUsdc: x.priceUsd, priceInQuote: x.priceEth, marketCapUsd: x.mcapUsd, isLivePrice: x.priceUsd != null,
      progress: x.progress, graduated: !!x.graduated, phase: x.phase, graduationThreshold: x.graduationThreshold, creatorTaxBps: x.creatorTaxBps, tx: x.tx, active: x.active,
    };
  }
  async function loadList() {
    if (PN.busy || Date.now() - PN.at < 45e3) return PN.items;
    PN.busy = true;
    try {
      const r = await fetch("/api/social?ponsarc=list", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && Array.isArray(j.items)) { PN.items = j.items.filter((x) => x.active !== false && isAddr(x.token)).map(rowOf); PN.at = Date.now(); }
    } catch { /* keep what we had */ }
    PN.busy = false;
    if (typeof renderArcpadExploreGrid === "function" && document.getElementById("ap-explore-grid") && typeof ARC !== "undefined" && ARC.launchesLoaded) renderArcpadExploreGrid();
    deepLink();
    return PN.items;
  }
  function deepLink() {
    const dl = /^#explore\b.*[?&]coin=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (dl && PN.opened !== lc(dl[1]) && PN.items.some((x) => x.token === lc(dl[1]))) { PN.opened = lc(dl[1]); openSheet(dl[1]); }
  }
  // graduation: the curve's real ETH against Pons's threshold; a graduated coin trades in its v4 pool
  function gradHtml(l, kind) {
    const p = l.graduated ? 100 : Math.max(0, Math.min(100, Number(l.progress) || 0));
    const thr = l.graduationThreshold ? Number(BigInt(l.graduationThreshold)) / 1e18 : null;
    const lab = l.graduated ? tr("Graduated · Uniswap v4") : `${p.toFixed(p < 10 ? 1 : 0)}% ${tr("to graduation")}`;
    return `<div class="pon-grad ${kind || ""}${l.graduated ? " done" : ""}" style="--p:${p.toFixed(1)}%" role="img" aria-label="${esc(lab)}"><div class="trk"><i></i></div><small><span>${esc(lab)}</span>${thr && kind === "lg" && !l.graduated ? `<span data-no-i18n>${(thr * p / 100).toFixed(3)} / ${thr.toFixed(2)} ETH</span>` : ""}</small></div>`;
  }
  function cardHtml(l, img) {
    const age = typeof actAgo === "function" && l.launchedAt ? actAgo(l.launchedAt) : "";
    return `
    <button type="button" class="launch-card card-type-curve ap-launch-card is-pons" data-token="${esc(l.token)}" data-platform="pons" style="text-align:left;cursor:pointer;border:1px solid var(--line);font:inherit;">
      <div class="ap-card-top">${img}<span class="ap-plat-tag pons">Pons</span><span class="ap-card-age">${esc(age)}</span></div>
      <div class="sym">$${esc(l.symbol)} <span class="ap-pair-tag">/ ETH</span></div>
      <div class="name">${esc(l.name)}</div>
      ${gradHtml(l, "card")}
      <div class="meta"><span>${l.marketCapUsd != null ? usd(l.marketCapUsd) : "—"} mcap</span><span class="pon-chain">Robinhood</span></div>
    </button>`;
  }

  // the coin's sheet: numbers, graduation, the fee split, links
  let sheet = null;
  function openSheet(token) {
    const l = PN.items.find((x) => x.token === lc(token));
    if (!l) return false;
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "agl-sheet pon-sheet"; sheet.hidden = true;
      sheet.innerHTML = `<div class="agl-sh-bg" data-sh-close></div><div class="agl-sh-box" role="dialog" aria-modal="true" aria-labelledby="pon-sh-t"></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (e) => { if (e.target.closest("[data-sh-close]")) closeSheet(); const c = e.target.closest("[data-pon-claim]"); if (c) claim(c.dataset.ponClaim); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    }
    const m = l.marketCapUsd, lo = SUP.DEX_INFO_MCAP, hi = SUP.MARKETING_MCAP;
    const logo = /^https:\/\//i.test(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="" onerror="this.remove()">` : `<span>${esc(String(l.symbol || "?").slice(0, 1))}</span>`;
    const ms = (need, label, sub) => { const on = m != null && m >= need; return `<li class="${on ? "on" : ""}"><i aria-hidden="true">${on ? "✓" : ""}</i><span><b>${T(label)}</b><small>${T(sub)}</small></span></li>`; };
    const mine = me() && me() === l.creator;
    sheet.querySelector(".agl-sh-box").innerHTML = `
      <button type="button" class="agl-sh-x" data-sh-close aria-label="${T("Close")}">×</button>
      <div class="agl-sh-h"><div class="agl-sh-logo">${logo}</div><div><h3 id="pon-sh-t" data-no-i18n>$${esc(l.symbol)} <small>${esc(l.name)}</small></h3><span class="agl-sh-tag">${T("Launched on Pons via ArcPad · Robinhood Chain")}</span></div></div>
      <div class="agl-sh-stats"><div><small>${T("Price")}</small><b data-no-i18n>${l.priceUsdc != null ? usd(l.priceUsdc) : "—"}</b></div><div><small>${T("Market cap")}</small><b data-no-i18n>${usd(m)}</b></div><div><small>${T("Creator")}</small><b data-no-i18n><a href="${esc(EXPL("address", l.creator))}" target="_blank" rel="noopener">${esc(short(l.creator))}</a></b></div></div>
      ${gradHtml(l, "lg")}
      <div class="pon-fees" id="pon-fees"><div><b>${T("Creator fees")}</b><small>${T("Paid to this coin's ArcPad splitter: 70% the creator, 30% ARCIRCLE PAD — set at launch, for good.")}</small></div><span class="pon-fees-v" id="pon-fees-v" data-no-i18n>…</span>${mine ? `<button type="button" class="ams-mini" data-pon-claim="${esc(l.token)}">${T("Claim my 70%")}</button>` : ""}</div>
      <p class="pon-fees-msg" id="pon-fees-msg" aria-live="polite"></p>
      ${window.arcArgus && window.arcArgus.progress ? window.arcArgus.progress(m, "lg") : ""}
      <ul class="agl-sh-ms">${ms(lo, "Dexscreener info support", "From a $20K market cap: we help update the coin's Dexscreener info.")}${ms(hi, "Marketing support", "From a $100K market cap: boosts, calls and promotion, case by case.")}</ul>
      <p class="agl-sh-note">${T("Support may be refused if our Token Scanner finds signs of manipulation. It is ARCIRCLE PAD's own policy, not a contract. Pons V2 is unaudited — trade with care.")}</p>
      ${l.description ? `<p class="agl-sh-desc" data-no-i18n>${esc(l.description)}</p>` : ""}
      <div class="agl-sh-acts"><a class="bp-btn-primary" href="${esc(PONS_URL(l.token))}" target="_blank" rel="noopener">${T("Trade on Pons")} ↗</a><a class="bp-btn-ghost" href="${esc(EXPL("token", l.token))}" target="_blank" rel="noopener">Blockscout ↗</a>${l.website && /^https?:\/\//i.test(l.website) ? `<a class="bp-btn-ghost" href="${esc(l.website)}" target="_blank" rel="noopener nofollow">${T("Website")} ↗</a>` : ""}${l.twitter && /^https?:\/\//i.test(l.twitter) ? `<a class="bp-btn-ghost" href="${esc(l.twitter)}" target="_blank" rel="noopener nofollow">X ↗</a>` : ""}</div>`;
    sheet.hidden = false;
    document.documentElement.classList.add("agl-sh-open");
    requestAnimationFrame(() => sheet.classList.add("in"));
    pendingFees(l);
    return true;
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("in");
    document.documentElement.classList.remove("agl-sh-open");
    setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 200);
  }
  // what's waiting: the splitter's credit in Pons's escrow plus any ETH already at the splitter
  async function pendingFees(l) {
    const el = $("pon-fees-v");
    if (!el || !isAddr(l.splitter)) return;
    try {
      const escAddr = P.FEE_ESCROW;
      const [inEscrow, held] = await Promise.all([retry(() => rd(escAddr, ESCROW_ABI).balanceOf(l.splitter)), rpc().getBalance(l.splitter)]);
      const tot = BigInt(inEscrow) + BigInt(held);
      const you = tot - (tot * BigInt(PLATFORM_BPS)) / 10000n;
      el.innerHTML = `${ethS(tot, 6)} ETH <small>${T("waiting")} · ${esc(ethS(you, 6))} ETH ${T("is the creator's")}</small>`;
      const b = sheet && sheet.querySelector("[data-pon-claim]");
      if (b) b.disabled = tot === 0n;
    } catch { el.textContent = "—"; }
  }
  async function claim(token) {
    const l = PN.items.find((x) => x.token === lc(token));
    const msg = (h, k) => { const el = $("pon-fees-msg"); if (el) { el.className = "pon-fees-msg " + (k || ""); el.innerHTML = h; } };
    if (!l || busy || !ready()) return;
    if (me() !== l.creator) { msg(T("Connect the wallet that launched this coin."), "bad"); return; }
    busy = true; holdChain(true);
    const b = sheet.querySelector("[data-pon-claim]"); if (b) b.disabled = true;
    try {
      msg(T("Switch your wallet to Robinhood Chain if it asks…"));
      const sg = await rhSigner();
      const data = SI.encodeFunctionData("claimFor", [ethers.getAddress(l.creator)]);
      const gas = await rpc().estimateGas({ from: me(), to: SPLITS, data });
      msg(T("Confirm in your wallet…"));
      const tx = await sg.sendTransaction({ to: SPLITS, data, gasLimit: (BigInt(gas) * 13n) / 10n });
      msg(`${T("Claiming…")} <a href="${esc(EXPL("tx", tx.hash))}" target="_blank" rel="noopener">tx ↗</a>`);
      await waitTx(tx);
      msg(`${T("Paid out: 70% to you, 30% to ARCIRCLE PAD.")} <a href="${esc(EXPL("tx", tx.hash))}" target="_blank" rel="noopener">Blockscout ↗</a>`, "ok");
      pendingFees(l);
    } catch (e) { msg(esc(why(e)), "bad"); if (b) b.disabled = false; }
    finally { await backToArc(); holdChain(false); busy = false; }
  }

  // ---------------- wiring ----------------
  const tax = $("pon-tax");
  if (tax) tax.addEventListener("input", () => { if (ctx && Number(tax.value) * 100 > ctx.maxTax) tax.value = String(ctx.maxTax / 100); });
  let last = me();
  setInterval(() => { if (me() !== last) { last = me(); if (active()) { paintGate(); balance(); } } }, 1500);
  document.addEventListener("arc:lang", () => { if (active()) paintGate(); });
  window.arcPons = { active, submit, rows: () => PN.items, load: loadList, openSheet, onPlat, card: cardHtml, ready };
  if (panel.dataset.plat === "pons") onPlat("pons", true);
  window.addEventListener("hashchange", () => { if (/[?&]coin=0x/.test(location.hash)) { if (PN.items.length) deepLink(); else loadList(); } });
  document.addEventListener("arcpad:tab", (e) => { const t = e.detail && e.detail.tab; if (t === "explore" || t === "home") loadList(); });
  setTimeout(loadList, 1400);
})();
