/* global ethers, CONFIG, state, withRetry, connectWallet, ensureArcForWrite, renderArcpadExploreGrid, fmtUsd, WagmiCoreRef, wagmiConfigRef, updateNetworkBadge, actAgo, ARC */
// arc-arcpad-rh.js — ArcPad's own launches on Robinhood Chain (contracts/ArcPadFactoryRH.sol + ArcPadRouterRH.sol).
//
// The launch form's ArcPad mode gets a network switch: Arc (USDC pair, 1 USDC fee — arcpad.js, unchanged) or
// Robinhood Chain (ETH pair, a launch fee of about $1 in ETH). On Robinhood Chain the coin gets the same deal as on Arc:
// a real Uniswap v4 pool from the first block, liquidity locked for good, 8% of the supply to the ARCIRCLE PAD treasury,
// a 1% base trade fee (70% the creator, 30% the platform) plus the creator's own add-on fee, and the same opening market
// cap (a $4,000 virtual reserve, here in ETH). The veARCIRCLE Launch Drop covers these coins too (the RH vault,
// arc-launchdrop.js).
//   1. read the factory (launch fee) and the ETH price (/api/social?arcpadrh=list)
//   2. switch the wallet to Robinhood Chain, launch (or launch + dev buy) in one signature
//   3. the coin is in Explore straight from the chain — nothing to register
// Explore: rows from /api/social?arcpadrh=list, a card tagged "Robinhood", and a sheet that buys with ETH and sells
// for ETH through ArcPadRouterRH.
(function () {
  "use strict";
  const P = typeof CONFIG !== "undefined" && CONFIG.ARCPAD_RH;
  if (!P || typeof ethers === "undefined") return;
  const panel = document.getElementById("bp-panel-launch");

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
  const tokS = (raw) => Number(ethers.formatUnits(raw, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CHAIN = Number(P.CHAIN_ID || 4663), CHAIN_HEX = "0x" + CHAIN.toString(16);
  const FACTORY = P.FACTORY, ROUTER = P.ROUTER;
  const VUSD = Number(P.VIRTUAL_USD || 4000), SELLABLE = 920e6;
  const EXPL = (kind, x) => `${P.EXPLORER}/${kind}/${x}`;
  const ADD = { chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [P.RPC], blockExplorerUrls: [P.EXPLORER], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const live = () => isAddr(FACTORY) && isAddr(ROUTER);

  // ---------------- ABIs ----------------
  const META_T = "tuple(string imageUrl, string description, string twitter, string telegram, string discord, string website)";
  const FACTORY_ABI = [
    "function launchFee() view returns (uint256)", "function launchCount() view returns (uint256)",
    `function launch(string name_, string symbol_, address quoteToken_, uint256 initialVirtualQuote_, uint16 extraFeeBps_, ${META_T} meta_) payable returns (address)`,
    `function launchAndBuy(string name_, string symbol_, address quoteToken_, uint256 initialVirtualQuote_, uint16 extraFeeBps_, ${META_T} meta_, uint256 devBuyQuote) payable returns (address)`,
    "event Launched(address indexed token, address indexed creator, address indexed quoteToken, string name, string symbol, uint16 extraFeeBps, uint256 initialVirtualQuote, string imageUrl, string description)",
  ];
  const ROUTER_ABI = ["function buy(address token, uint256 minTokensOut) payable returns (uint256 amountOut)", "function sell(address token, uint256 tokenAmount, uint256 minEthOut) returns (uint256 amountOut)"];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const FI = new ethers.Interface(FACTORY_ABI), RI = new ethers.Interface(ROUTER_ABI);
  const ERR = {
    "launch fee: send at least launchFee": "The launch fee wasn't paid in full — try again.",
    "send launchFee + devBuyQuote": "The launch fee plus the dev buy didn't add up — try again.",
    "extra fee capped at 2%": "Your add-on fee can be at most 2%.",
    "slippage: less than minAmountOut": "The price moved more than 3% — try again.",
    "unknown token": "This coin isn't an ArcPad launch on Robinhood Chain.",
  };
  function why(err) {
    if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return tr("Cancelled in your wallet.");
    const m = String((err && (err.reason || err.shortMessage || err.message)) || err || "");
    const hit = Object.keys(ERR).find((k) => m.includes(k));
    if (hit) return tr(ERR[hit]);
    if (/insufficient funds/i.test(m)) return tr("Not enough ETH on Robinhood Chain for this plus gas.");
    return m.slice(0, 200);
  }

  // ---------------- Robinhood Chain: reads and the wallet ----------------
  let rp = null;
  const rpc = () => (rp = rp || new ethers.JsonRpcProvider(P.RPC, ethers.Network.from(CHAIN), { staticNetwork: true, batchMaxCount: 1 }));
  const rd = (addr, abi) => new ethers.Contract(addr, abi, rpc());
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
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
      } catch (e) { if (rejected(e)) throw e; }
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
    for (let i = 0; i < 6; i++) {
      if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me());
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
  }
  async function startedOnRh() { try { const p = walletProv(); return !!p && Number.parseInt(await p.request({ method: "eth_chainId" }), 16) === CHAIN; } catch { return false; } }
  async function backToArc() { try { if (typeof ensureArcForWrite === "function") await ensureArcForWrite(); } catch { /* the next Arc action asks */ } }
  async function waitTx(tx) {
    const viaRpc = (async () => { for (let i = 0; i < 120; i++) { const r = await rpc().getTransactionReceipt(tx.hash).catch(() => null); if (r) return r; await new Promise((res) => setTimeout(res, 2000)); } return null; })();
    const rc = await Promise.race([tx.wait().catch(() => viaRpc), viaRpc]);
    if (!rc) throw new Error(tr("It hasn't confirmed yet — check the transaction on Blockscout."));
    if (rc.status === 0) throw new Error(tr("The transaction failed on Robinhood Chain."));
    return rc;
  }

  // ---------------- what the chain says ----------------
  let fee = null, feeAt = 0;
  async function launchFee(force) {
    if (fee != null && !force && Date.now() - feeAt < 5 * 60e3) return fee;
    fee = BigInt(await retry(() => rd(FACTORY, FACTORY_ABI).launchFee())); feeAt = Date.now();
    return fee;
  }
  const L = { items: [], at: 0, busy: false, ethUsd: null };
  async function ethUsd() {
    if (L.ethUsd) return L.ethUsd;
    await loadList(true);
    return L.ethUsd;
  }
  const virtualWei = (px) => ethers.parseEther((VUSD / px).toFixed(8));

  // =====================================================================
  // the network switch (ArcPad mode only)
  // =====================================================================
  let net = "arc";
  try { if (localStorage.getItem("arcircle.launch.net") === "rh") net = "rh"; } catch { /* this visit */ }
  if (!live()) net = "arc";
  const plat = () => (panel ? panel.dataset.plat || "arcpad" : "");
  function active() { return !!panel && plat() === "arcpad" && net === "rh" && live(); }
  function paintNet() {
    const box = $("aprh-net");
    if (!box) return;
    box.hidden = plat() !== "arcpad";
    box.innerHTML = [
      ["arc", "Arc", "USDC pair · 1 USDC fee", false],
      ["rh", "Robinhood Chain", live() ? "ETH pair · about $1 in ETH" : "ETH pair · coming soon", !live()],
    ].map(([k, b, s, off]) => `<button type="button" role="radio" data-aprh-net="${k}" aria-checked="${net === k}"${off ? ' aria-disabled="true"' : ""}><b>${T(b)}</b><small>${T(s)}</small>${off ? `<em>${T("Soon")}</em>` : ""}</button>`).join("");
  }
  function setNet(n, quiet) {
    if (n === "rh" && !live()) { n = "arc"; }
    net = n;
    try { localStorage.setItem("arcircle.launch.net", net); } catch { /* fine */ }
    apply(quiet);
    if (window.arcV7 && typeof window.arcV7.paintCost === "function") window.arcV7.paintCost();
  }
  function apply(quiet) {
    if (!panel) return;
    const on = active();
    if (plat() === "arcpad") panel.dataset.net = on ? "rh" : "arc"; else delete panel.dataset.net;
    paintNet();
    const f = $("aprh-fields"), d = $("aprh-dev");
    if (f) f.hidden = !on;
    if (d) d.hidden = !on;
    if (plat() !== "arcpad") return;
    const h1 = panel.querySelector("h1"), lede = panel.querySelector(".bp-lede");
    if (h1) h1.textContent = tr(on ? "Launch on ArcPad · Robinhood Chain" : "Launch on ArcPad");
    if (lede) lede.textContent = tr(on ? "Your coin gets a real Uniswap v4 pool on Robinhood Chain in the same transaction, paired with ETH — the same deal as ArcPad on Arc, and veARCIRCLE holders get the same Launch Drop."
      : "Every launch gets a real Uniswap v4 pool in the same transaction — paired with USDC, Arc's own native currency, or with any Arc token you choose.");
    const lbl = panel.querySelector("#ap-launch-submit .ap-launch-btn-label");
    if (lbl && !busy) lbl.textContent = tr(on ? "Launch on Robinhood Chain" : "Launch coin");
    if (on) { paintFields(); paintDev(); balance(); if (!quiet && !reduce && f) { f.classList.remove("in"); void f.offsetWidth; f.classList.add("in"); } }
  }
  function onPlat() { apply(true); }

  // ---------------- the Robinhood Chain fields ----------------
  async function paintFields() {
    const box = $("aprh-fields");
    if (!box) return;
    if (!box.dataset.built) {
      box.dataset.built = "1";
      box.innerHTML = `<div class="aprh-cells" id="aprh-cells"></div>
        <p class="hint">${T("Same as ArcPad on Arc: liquidity locked for good, 8% of the supply to the ARCIRCLE PAD treasury, a 1% base trade fee (70% to you, 30% to the platform) plus your own add-on fee, paid in ETH on every trade. 4% of every coin goes to veARCIRCLE holders through the Launch Drop.")}</p>
        <ol class="agl-steps" id="aprh-steps" hidden></ol>`;
    }
    const cells = $("aprh-cells");
    cells.innerHTML = `<div><small>${T("Launch fee")}</small><b data-no-i18n>…</b></div><div><small>${T("Pair")}</small><b data-no-i18n>ETH</b></div><div><small>${T("Starting market cap")}</small><b data-no-i18n>…</b></div>`;
    try {
      const [f, px] = await Promise.all([launchFee(), ethUsd()]);
      const b = cells.querySelectorAll("b");
      b[0].textContent = `${ethS(f, 6)} ETH${px ? ` ≈ ${usd(Number(ethers.formatEther(f)) * px)}` : ""}`;
      b[2].textContent = `≈ ${usd(VUSD * 1e9 / SELLABLE)}`;
      devPreview();
      if (window.arcV7 && typeof window.arcV7.paintCost === "function") window.arcV7.paintCost();
    } catch { cells.innerHTML = `<p class="pon-gate-no">${T("Couldn't read ArcPad on Robinhood Chain right now — try again in a moment.")}</p>`; }
  }
  function paintDev() {
    const box = $("aprh-dev");
    if (!box || box.dataset.built) return;
    box.dataset.built = "1";
    box.innerHTML = `<label><span>${T("Dev buy")}</span> <span class="optional">${T("optional")}</span>
        <div class="cn-input-suffix-wrap"><input id="aprh-devbuy" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0"><span class="cn-input-suffix" data-no-i18n>ETH</span></div></label>
      <p class="hint">${T("Buy your own tokens in the same transaction as the launch, before anyone else can. Paid in ETH with the launch fee — no approval. Leave blank to skip.")}</p>
      <div class="ap-devbuy-quick" id="aprh-devbuy-quick"><button type="button" data-v="">${T("None")}</button>${["0.001", "0.005", "0.01", "0.05"].map((v) => `<button type="button" data-v="${v}" data-no-i18n>${v}</button>`).join("")}</div>
      <p class="hint" id="aprh-devbuy-preview"></p>`;
  }
  const devWei = () => { const s = String(($("aprh-devbuy") || {}).value || "").trim().replace(/,/g, ""); if (!s) return 0n; try { return Number(s) > 0 ? ethers.parseEther(s) : 0n; } catch { return null; } };
  function devPreview() {
    const el = $("aprh-devbuy-preview"); if (!el) return;
    const d = devWei();
    if (!d || !L.ethUsd) { el.textContent = ""; return; }
    const v = VUSD / L.ethUsd, x = Number(ethers.formatEther(d));
    const out = SELLABLE - (v * SELLABLE) / (v + x);
    el.textContent = tr("≈ {n} tokens ({p}% of the sellable supply) — approximate, before the trading fee.").replace("{n}", Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(out)).replace("{p}", ((out / SELLABLE) * 100).toFixed(2));
  }
  async function balance() {
    const el = $("aprh-balance");
    if (!el) return;
    if (!active() || !me()) { el.textContent = ""; return; }
    try {
      const [bal, f] = await Promise.all([rpc().getBalance(me()), launchFee()]);
      const need = f + (devWei() || 0n);
      const ok = BigInt(bal) > need;
      el.className = "ap-launch-balance aprh-only " + (ok ? "ok" : "short");
      el.textContent = tr(ok ? "Wallet on Robinhood Chain: {b} ETH · this launch needs {n} ETH plus gas" : "Not enough ETH on Robinhood Chain — this launch needs {n} ETH plus gas; this wallet has {b} ETH there.")
        .replace("{b}", ethS(bal)).replace("{n}", ethS(need, 6));
    } catch { el.textContent = ""; }
  }
  function readForm() {
    const v = (id) => String(($(id) || {}).value || "").trim();
    const f = {
      name: v("ap-name"), symbol: v("ap-symbol").toUpperCase(), logo: v("ap-logo"), description: v("ap-description"),
      website: v("ap-website"), twitter: v("ap-twitter"), telegram: v("ap-telegram"), discord: v("ap-discord"),
      extra: Number(v("ap-extrafee") || "0"), dev: devWei(),
    };
    const bad = (m) => ({ ok: false, msg: tr(m) });
    if (!live()) return bad("ArcPad on Robinhood Chain is coming soon.");
    if (!f.name || !f.symbol) return bad("Name and symbol are required.");
    if (f.logo && !/^https:\/\//i.test(f.logo)) return bad("Use a hosted logo — upload the file (it's hosted for you) or paste an https:// image URL.");
    if (f.logo.length > 2000) return bad("That logo link is too long — upload the file instead.");
    if (!(f.extra >= 0 && f.extra <= 200)) return bad("Your add-on fee can be at most 2%.");
    if (f.dev == null) return bad("Enter the dev buy as an ETH amount, e.g. 0.01.");
    return { ok: true, f };
  }

  // ---------------- the launch ----------------
  const STEPS = [["read", "Read ArcPad on Robinhood Chain"], ["switch", "Switch to Robinhood Chain"], ["launch", "Launch"], ["list", "In Explore"]];
  function steps(show) {
    const ol = $("aprh-steps"); if (!ol) return;
    ol.hidden = !show;
    if (show) ol.innerHTML = STEPS.map(([k, l]) => `<li data-step="${k}"><i aria-hidden="true"></i><span><b>${T(l)}</b><small></small></span></li>`).join("");
  }
  function step(k, st, note) {
    const li = ($("aprh-steps") || document).querySelector(`[data-step="${k}"]`);
    if (!li) return;
    li.className = st;
    if (note != null) li.querySelector("small").textContent = note;
  }
  const status = (html, kind) => { const el = $("ap-launch-status"); if (el) el.innerHTML = html ? `<div class="status ${kind || "pending"}">${html}</div>` : ""; };
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
    const stay = await startedOnRh();
    try {
      const creator = ethers.getAddress(me());
      step("read", "doing");
      const [code, lf, px, bal] = await Promise.all([rpc().getCode(FACTORY), launchFee(true), ethUsd(), rpc().getBalance(creator)]);
      if (!code || code === "0x") throw new Error(tr("ArcPad's factory isn't on Robinhood Chain — stopped before launching."));
      if (!px) throw new Error(tr("Couldn't read the ETH price, so the opening reserve can't be set — try again in a moment."));
      const dev = f.dev || 0n, value = lf + dev;
      if (BigInt(bal) <= value) throw new Error(tr("Not enough ETH on Robinhood Chain for this plus gas."));
      const vq = virtualWei(px);
      step("read", "ok", tr("Launch fee {f} ETH · opening reserve {v} ETH").replace("{f}", ethS(lf, 6)).replace("{v}", ethS(vq, 4)));

      cur = "switch"; step("switch", "doing", tr("Confirm in your wallet if it asks…"));
      holdChain(true); switched = true;
      const sg = await rhSigner();
      if (typeof state !== "undefined") state.chainId = CHAIN;
      step("switch", "ok");

      cur = "launch"; step("launch", "doing", tr("Checking…"));
      const meta = { imageUrl: f.logo, description: f.description, twitter: f.twitter, telegram: f.telegram, discord: f.discord, website: f.website };
      const data = dev > 0n ? FI.encodeFunctionData("launchAndBuy", [f.name, f.symbol, ethers.ZeroAddress, vq, f.extra, meta, dev]) : FI.encodeFunctionData("launch", [f.name, f.symbol, ethers.ZeroAddress, vq, f.extra, meta]);
      const gas = await rpc().estimateGas({ from: creator, to: FACTORY, data, value });
      step("launch", "doing", tr("Confirm in your wallet…"));
      const tx = await sg.sendTransaction({ to: FACTORY, data, value, gasLimit: (BigInt(gas) * 12n) / 10n });
      window.dispatchEvent(new CustomEvent("arc:tx", { detail: { h: tx.hash, s: "pending", ex: EXPL("tx", tx.hash) } }));
      step("launch", "doing", tr("Launching…"));
      const rc = await waitTx(tx);
      const token = tokenFrom(rc);
      if (!token) throw new Error(tr("The launch confirmed but its token couldn't be read — check the transaction."));
      step("launch", "ok", `$${f.symbol} · ${short(token)}`);

      cur = "list"; step("list", "doing");
      L.at = 0; await loadList(true);
      // the list is cached for a few seconds server-side: show the new coin right away from what was just launched
      if (!L.items.some((x) => x.token === token)) {
        L.items.unshift(rowOf({ token, creator: creator, name: f.name, symbol: f.symbol, imageUrl: f.logo, description: f.description, twitter: f.twitter, telegram: f.telegram, discord: f.discord, website: f.website, extraFeeBps: f.extra, launchedAt: Math.floor(Date.now() / 1000) }));
        if (typeof renderArcpadExploreGrid === "function" && document.getElementById("ap-explore-grid")) try { renderArcpadExploreGrid(); } catch { /* next refresh */ }
      }
      step("list", "ok", tr("Listed under ArcPad, tagged Robinhood"));
      done(token, f.symbol, tx.hash);
    } catch (e) {
      console.warn("arcpad rh launch", e);
      step(cur, "bad", why(e));
      status(esc(why(e)), "error");
    } finally {
      if (switched) { if (!stay) await backToArc(); else if (typeof updateNetworkBadge === "function") updateNetworkBadge(); holdChain(false); }
      busy = false; btn.disabled = false; btn.classList.remove("is-busy");
      if (lbl) lbl.textContent = tr(active() ? "Launch on Robinhood Chain" : "Launch coin");
      balance();
    }
  }
  function tokenFrom(rc) {
    for (const l of (rc && rc.logs) || []) {
      if (lc(l.address) !== lc(FACTORY)) continue;
      try { const p = FI.parseLog(l); if (p && p.name === "Launched") return lc(p.args.token); } catch { /* another event */ }
    }
    return null;
  }
  function done(token, sym, tx) {
    if (typeof window.arcLaunchLive === "function") setTimeout(() => window.arcLaunchLive({ platform: "arcpadrh", token, symbol: sym }), 400);
    status(`<b>${T("Your coin is live on Robinhood Chain.")}</b> <span data-no-i18n>$${esc(sym || "")}</span> · ${T("It trades in its Uniswap v4 pool, paired with ETH. Your share of every trade fee is paid to your wallet in ETH as people trade.")}
      <span class="agl-links"><a href="#explore?plat=arcpad&coin=${esc(token)}">${T("See it in Explore")}</a><a href="${esc(EXPL("tx", tx))}" target="_blank" rel="noopener">Blockscout ↗</a></span>`, "success");
    if (typeof window.arcConfetti === "function") window.arcConfetti();
  }

  // =====================================================================
  // Explore
  // =====================================================================
  function rowOf(x) {
    return {
      platform: "arcpadrh", chain: "robinhood", token: lc(x.token), name: x.name || "", symbol: x.symbol || "", creator: lc(x.creator),
      quoteToken: ethers.ZeroAddress, imageUrl: x.imageUrl || "", description: x.description || "", launchedAt: x.launchedAt || 0,
      twitter: x.twitter || "", telegram: x.telegram || "", discord: x.discord || "", website: x.website || "", extraFeeBps: x.extraFeeBps || 0,
      quoteSymbol: "ETH", quoteDecimals: 18, quoteIsUsdc: false, priceUsdc: x.priceUsd, priceInQuote: x.priceEth, marketCapUsd: x.marketCapUsd, isLivePrice: x.priceUsd != null,
    };
  }
  async function loadList(force) {
    if (!live() && !force) return L.items;
    if (L.busy || (!force && Date.now() - L.at < 45e3)) return L.items;
    L.busy = true;
    try {
      const r = await fetch("/api/social?arcpadrh=list", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && Array.isArray(j.coins)) { L.items = j.coins.filter((x) => isAddr(x.token)).map(rowOf); L.at = Date.now(); if (j.ethUsd) L.ethUsd = Number(j.ethUsd); }
    } catch { /* keep what we had */ }
    L.busy = false;
    if (L.items.length && typeof renderArcpadExploreGrid === "function" && document.getElementById("ap-explore-grid") && typeof ARC !== "undefined" && ARC.launchesLoaded) renderArcpadExploreGrid();
    deepLink();
    return L.items;
  }
  function deepLink() {
    const dl = /^#explore\b.*[?&]coin=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (dl && L.opened !== lc(dl[1]) && L.items.some((x) => x.token === lc(dl[1]))) { L.opened = lc(dl[1]); openSheet(dl[1]); }
  }
  function cardHtml(l, img) {
    const age = typeof actAgo === "function" && l.launchedAt ? actAgo(l.launchedAt) : "";
    return `
    <button type="button" class="launch-card ap-launch-card is-arcpadrh" data-token="${esc(l.token)}" data-platform="arcpadrh" style="text-align:left;cursor:pointer;border:1px solid var(--line);font:inherit;">
      <div class="ap-card-top">${img}<span class="ap-plat-tag rh">Robinhood</span><span class="ap-card-age">${esc(age)}</span></div>
      <div class="sym">$${esc(l.symbol)} <span class="ap-pair-tag">/ ETH</span></div>
      <div class="name">${esc(l.name)}</div>
      <div class="meta"><span>${l.marketCapUsd != null ? usd(l.marketCapUsd) : "—"} mcap</span><span class="aprh-chain">ArcPad · Robinhood Chain</span></div>
    </button>`;
  }

  // the coin's sheet: numbers, buy / sell, links
  let sheet = null;
  const PT = { side: "buy", l: null, out: null, bal: null, busy: false, qt: 0 };
  function openSheet(token) {
    const l = L.items.find((x) => x.token === lc(token));
    if (!l) return false;
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "agl-sheet pon-sheet aprh-sheet"; sheet.hidden = true;
      sheet.innerHTML = `<div class="agl-sh-bg" data-sh-close></div><div class="agl-sh-box" role="dialog" aria-modal="true" aria-labelledby="aprh-sh-t"></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (e) => {
        if (e.target.closest("[data-sh-close]")) closeSheet();
        const sd = e.target.closest("[data-pt-side]"); if (sd) { PT.side = sd.dataset.ptSide; PT.out = null; paintTrade(); ptQuote(); }
        const q = e.target.closest("[data-pt-q]"); if (q) ptQuick(q.dataset.ptQ);
        if (e.target.closest("[data-pt-go]")) ptGo();
      });
      sheet.addEventListener("input", (e) => { if (e.target.id === "aprh-amt") { clearTimeout(PT.qt); PT.qt = setTimeout(ptQuote, 300); } });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    }
    const logo = /^https:\/\//i.test(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="" onerror="this.remove()">` : `<span>${esc(String(l.symbol || "?").slice(0, 1))}</span>`;
    const fee = (1 + (Number(l.extraFeeBps) || 0) / 100).toFixed(2).replace(/\.?0+$/, "");
    sheet.querySelector(".agl-sh-box").innerHTML = `
      <button type="button" class="agl-sh-x" data-sh-close aria-label="${T("Close")}">×</button>
      <div class="agl-sh-h"><div class="agl-sh-logo">${logo}</div><div><h3 id="aprh-sh-t" data-no-i18n>$${esc(l.symbol)} <small>${esc(l.name)}</small></h3><span class="agl-sh-tag">${T("Launched on ArcPad · Robinhood Chain")}</span></div></div>
      <div class="agl-sh-stats"><div><small>${T("Price")}</small><b data-no-i18n>${l.priceUsdc != null ? usd(l.priceUsdc) : "—"}</b></div><div><small>${T("Market cap")}</small><b data-no-i18n>${usd(l.marketCapUsd)}</b></div><div><small>${T("Creator")}</small><b data-no-i18n><a href="${esc(EXPL("address", l.creator))}" target="_blank" rel="noopener">${esc(short(l.creator))}</a></b></div></div>
      <div class="pt-box" id="aprh-box"><div class="pt-tabs" role="radiogroup"><button type="button" role="radio" data-pt-side="buy" aria-checked="true">${T("Buy")}</button><button type="button" role="radio" data-pt-side="sell" aria-checked="false">${T("Sell")}</button></div>
        <label class="pt-in"><input id="aprh-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.0"><span id="aprh-unit" data-no-i18n>ETH</span></label>
        <div class="pt-quick" id="aprh-quick"></div>
        <p class="pt-q" id="aprh-q" aria-live="polite"></p>
        <button type="button" class="bp-btn-primary pt-go" data-pt-go id="aprh-go">${T("Buy")}</button>
        <p class="pt-msg" id="aprh-msg" aria-live="polite"></p>
        <small class="pt-note">${T("In the coin's Uniswap v4 pool on Robinhood Chain · trade fee {f}% · 3% slippage limit · your wallet switches to Robinhood Chain for it.").replace("{f}", fee)}</small></div>
      <p class="agl-sh-note">${T("Liquidity is locked for good. 4% of the supply goes to veARCIRCLE holders through the Launch Drop — the same rule as ArcPad on Arc.")}</p>
      ${l.description ? `<p class="agl-sh-desc" data-no-i18n>${esc(l.description)}</p>` : ""}
      <div class="agl-sh-acts"><a class="bp-btn-ghost" href="${esc(EXPL("token", l.token))}" target="_blank" rel="noopener">Blockscout ↗</a>${l.website && /^https?:\/\//i.test(l.website) ? `<a class="bp-btn-ghost" href="${esc(l.website)}" target="_blank" rel="noopener nofollow">${T("Website")} ↗</a>` : ""}${l.twitter && /^https?:\/\//i.test(l.twitter) ? `<a class="bp-btn-ghost" href="${esc(l.twitter)}" target="_blank" rel="noopener nofollow">X ↗</a>` : ""}</div>`;
    sheet.hidden = false;
    document.documentElement.classList.add("agl-sh-open");
    requestAnimationFrame(() => sheet.classList.add("in"));
    PT.l = l; PT.out = null; PT.side = "buy"; ptBal();
    return true;
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("in");
    document.documentElement.classList.remove("agl-sh-open");
    setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 200);
  }
  async function ptBal() {
    const l = PT.l; PT.bal = null;
    if (!l || !me()) { paintTrade(); return; }
    try { const [eth, tok] = await Promise.all([rpc().getBalance(me()), retry(() => rd(l.token, ERC20).balanceOf(me()))]); PT.bal = { eth: BigInt(eth), tok: BigInt(tok) }; } catch { PT.bal = null; }
    paintTrade();
  }
  function paintTrade() {
    if (!sheet || !$("aprh-box")) return;
    const buy = PT.side === "buy", l = PT.l;
    sheet.querySelectorAll("[data-pt-side]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.ptSide === PT.side)));
    $("aprh-box").classList.toggle("sell", !buy);
    $("aprh-unit").textContent = buy ? "ETH" : "$" + (l.symbol || "");
    $("aprh-quick").innerHTML = (buy ? ["0.001", "0.005", "0.01", "0.05"] : ["25%", "50%", "100%"]).map((v) => `<button type="button" data-pt-q="${v}" data-no-i18n>${v}${buy ? " ETH" : ""}</button>`).join("");
    const b = $("aprh-go");
    if (b && !PT.busy) b.textContent = !me() ? tr("Connect wallet") : tr(buy ? "Buy" : "Sell") + " $" + (l.symbol || "");
    const q = $("aprh-q");
    if (q) q.innerHTML = PT.bal ? `${T("Balance")} <span data-no-i18n>${buy ? ethS(PT.bal.eth, 5) + " ETH" : tokS(PT.bal.tok) + " $" + esc(l.symbol || "")}</span>${PT.out != null ? ` · ${T("you get about")} <b data-no-i18n>${buy ? tokS(PT.out) + " $" + esc(l.symbol || "") : ethS(PT.out, 6) + " ETH"}</b>` : ""}` : "";
  }
  function ptQuick(v) {
    const inp = $("aprh-amt"); if (!inp) return;
    if (/%$/.test(v)) { if (!PT.bal) return; inp.value = ethers.formatUnits((PT.bal.tok * BigInt(parseInt(v, 10))) / 100n, 18); }
    else inp.value = v;
    ptQuote();
  }
  const ptAmt = () => { const s = String(($("aprh-amt") || {}).value || "").trim().replace(/,/g, ""); try { return s && Number(s) > 0 ? ethers.parseUnits(s, 18) : null; } catch { return null; } };
  // the router's own answer (a static call) — a sell before approval can't be simulated, so it's estimated from the price
  async function ptQuote(exact) {
    const l = PT.l, amt = ptAmt(), buy = PT.side === "buy";
    PT.out = null;
    if (l && amt) {
      try {
        if (!me()) throw new Error("no wallet");
        const data = buy ? RI.encodeFunctionData("buy", [l.token, 0n]) : RI.encodeFunctionData("sell", [l.token, amt, 0n]);
        const r = await rpc().call({ from: me(), to: ROUTER, data, value: buy ? amt : 0n });
        PT.out = BigInt(RI.decodeFunctionResult(buy ? "buy" : "sell", r)[0]);
      } catch {
        if (!exact && l.priceInQuote) {
          const p = Number(l.priceInQuote), x = Number(ethers.formatUnits(amt, 18)), f = 1 - (1 + (Number(l.extraFeeBps) || 0) / 100) / 100;
          const est = buy ? (x / p) * f : x * p * f;
          if (isFinite(est) && est > 0) PT.out = ethers.parseUnits(est.toFixed(buy ? 4 : 12), 18);
        }
      }
    }
    paintTrade();
    return PT.out;
  }
  async function ptGo() {
    const l = PT.l, msg = (h, k) => { const el = $("aprh-msg"); if (el) { el.className = "pt-msg " + (k || ""); el.innerHTML = h; } };
    if (!l || PT.busy) return;
    if (!me()) { if (typeof connectWallet === "function") await connectWallet(); ptBal(); return; }
    const amt = ptAmt();
    if (!amt) { msg(T("Enter an amount."), "bad"); return; }
    const buy = PT.side === "buy";
    if (PT.bal && (buy ? amt > PT.bal.eth : amt > PT.bal.tok)) { msg(T(buy ? "Not enough ETH." : "Not enough tokens."), "bad"); return; }
    const stay = await startedOnRh();
    PT.busy = true; holdChain(true);
    const b = $("aprh-go"); if (b) b.disabled = true;
    try {
      msg(T("Switch your wallet to Robinhood Chain if it asks…"));
      const sg = await rhSigner();
      if (!buy) {
        const al = BigInt(await retry(() => rd(l.token, ERC20).allowance(me(), ROUTER)));
        if (al < amt) { msg(T("Approve the tokens for ArcPad's router — confirm in your wallet…")); await waitTx(await new ethers.Contract(l.token, ERC20, sg).approve(ROUTER, amt)); }
      }
      const out = await ptQuote(true);
      if (out == null) throw new Error(tr("Couldn't price that trade in the pool right now."));
      const min = (out * 97n) / 100n;
      const router = new ethers.Contract(ROUTER, ROUTER_ABI, sg);
      msg(T("Confirm in your wallet…"));
      const tx = buy ? await router.buy(l.token, min, { value: amt }) : await router.sell(l.token, amt, min);
      window.dispatchEvent(new CustomEvent("arc:tx", { detail: { h: tx.hash, s: "pending", ex: EXPL("tx", tx.hash) } }));
      msg(`${T(buy ? "Buying…" : "Selling…")} <a href="${esc(EXPL("tx", tx.hash))}" target="_blank" rel="noopener">tx ↗</a>`);
      await waitTx(tx);
      window.dispatchEvent(new CustomEvent("arc:tx", { detail: { h: tx.hash, s: "ok", ex: EXPL("tx", tx.hash) } }));
      msg(`${T(buy ? "Bought." : "Sold.")} <a href="${esc(EXPL("tx", tx.hash))}" target="_blank" rel="noopener">Blockscout ↗</a>`, "ok");
      if (typeof window.arcConfetti === "function" && buy) window.arcConfetti();
      $("aprh-amt").value = ""; PT.out = null;
      L.at = 0; loadList(); ptBal();
    } catch (e) { msg(esc(why(e)), "bad"); }
    finally { if (!stay) await backToArc(); else if (typeof updateNetworkBadge === "function") updateNetworkBadge(); holdChain(false); PT.busy = false; if (b) b.disabled = false; paintTrade(); }
  }

  // ---------------- wiring ----------------
  const netBox = $("aprh-net");
  if (netBox) netBox.addEventListener("click", (e) => {
    const b = e.target.closest("[data-aprh-net]"); if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") { status(T("ArcPad on Robinhood Chain is coming soon — launch on Arc for now."), "pending"); return; }
    status(""); setNet(b.dataset.aprhNet);
  });
  const devBox = $("aprh-dev");
  if (devBox) {
    devBox.addEventListener("click", (e) => { const q = e.target.closest("[data-v]"); if (q) { const i = $("aprh-devbuy"); i.value = q.dataset.v; i.dispatchEvent(new Event("input", { bubbles: true })); } });
    devBox.addEventListener("input", (e) => { if (e.target.id === "aprh-devbuy") { devPreview(); clearTimeout(paintDev.t); paintDev.t = setTimeout(balance, 400); } });
  }
  let last = me();
  setInterval(() => { if (me() !== last) { last = me(); if (active()) balance(); } }, 1500);
  document.addEventListener("arc:lang", () => { if (panel) { const f = $("aprh-fields"), d = $("aprh-dev"); if (f) delete f.dataset.built; if (d) delete d.dataset.built; apply(true); } });
  // the launch wizard (arcpad-v6.js) groups the platform cards into its first step: the network switch goes with them
  function place() {
    const nb = $("aprh-net"), pl = $("agl-plat");
    if (!nb || !pl) return;
    const anchor = pl.nextElementSibling && pl.nextElementSibling.classList.contains("v7-ptab") ? pl.nextElementSibling : pl;
    if (anchor.nextElementSibling !== nb) anchor.after(nb);
  }
  document.addEventListener("arcpad:launchframe", () => setTimeout(place, 0));
  setTimeout(place, 0);
  const cost = () => ({ fee, dev: devWei() || 0n });
  // the Launch Drop card (arc-launchdrop.js) signs on Robinhood Chain with the same wallet plumbing
  const wallet = { signer: rhSigner, stay: startedOnRh, back: backToArc, hold: holdChain, wait: waitTx, explorer: EXPL, why };
  window.arcArcpadRH = { active, submit, rows: () => L.items, load: loadList, openSheet, onPlat, card: cardHtml, live, setNet, cost, wallet };
  apply(true);
  window.addEventListener("hashchange", () => { if (/[?&]coin=0x/.test(location.hash)) { if (L.items.length) deepLink(); else loadList(); } });
  document.addEventListener("arcpad:tab", (e) => { const t = e.detail && e.detail.tab; if (t === "explore" || t === "home") loadList(); });
  setTimeout(loadList, 1600);
})();
