/* global ethers, CONFIG, ARC, readProvider, withRetry */
// arc-scanner.js — Token Scanner v1, an ARCIRCLE PAD utility (arcpad.html#scanner).
// Paste any Arc token; four reads run side by side and each lands as it's done:
//   1. Contract  bytecode, ERC-20 basics, proxy slots, owner(), and which
//                privileged functions (mint / pause / blacklist / fees / …) the
//                code exposes — found from the selectors in its dispatcher
//   2. Market    Dexscreener pairs (liquidity, market cap, age, buys vs sells)
//   3. Holders   /api/holders?scan=0x… (Transfer history + real balanceOf)
//   4. Extras    ArcPad launch record, ArcLock locks for the token
// Every check becomes a row (pass / warn / risk / info) and the rows add up to
// a 0–100 score with a three-level verdict. It reads the chain; it can't
// prove a token is safe, and says so on the page.
// Deep link: /arc#scanner?t=0x…   Recent scans: localStorage (this browser only).
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-scanner");
  if (!panel || typeof ethers === "undefined" || typeof CONFIG === "undefined") return;

  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());
  const STORE = "arcircle.scanner.v1";
  const ARCIRCLE = lc(CONFIG.ARCIRCLE_TOKEN);

  // ---------- number formatting ----------
  const compact = (n) => {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 6 : 2 });
  };
  const usd = (n) => {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1) return "$" + compact(n);
    if (n === 0) return "$0";
    return "$" + Number(n.toPrecision(3)).toString().replace(/^0/, "0");
  };
  const pct = (p) => (p == null || !isFinite(p) ? "—" : `${p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(p >= 0.01 ? 3 : 4)}%`.replace(/\.?0+%$/, "%"));
  const ageText = (sec) => {
    if (sec == null || !isFinite(sec)) return "—";
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
  };

  // ---------- known addresses (left out of "concentration") ----------
  const DEAD = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead", "0xdead000000000000000042069420694206942069"]);
  const LABELS = {};
  const label = (a, name, kind) => { if (a) LABELS[lc(a)] = { name, kind }; };
  label(CONFIG.POOL_MANAGER_ADDRESS, "Uniswap v4 pools", "pool");
  label(CONFIG.ARCLOCK_ADDRESS, "ArcLock (locked)", "lock");
  label(CONFIG.ARCPAD_FACTORY_ADDRESS, "ArcPad factory", "infra");
  label(CONFIG.ARCPAD_HOOK_ADDRESS, "ArcPad hook", "infra");
  label(CONFIG.ARCPAD_ROUTER_ADDRESS, "ArcPad router", "infra");
  label(CONFIG.CIRCLEPAD_ESCROW_ADDRESS, "CirclePad escrow", "infra");
  ["0xb021be536808f551b31789422fd28a6c9c6e97da", "0xa5628a11c412596e1f63b75a2c0284f843c549d6", "0x07a688a001f416cc433c68ff56aa26bc5131cc6e",
    "0xa36c443a797771df82533b8b4a86f0affd970862", "0x7a17ab0106c46c0be30623f3eb7f299cc0058338"].forEach((a) => label(a, "Argus", "infra"));
  label("0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", "Uniswap router", "infra");
  label("0x6049c9a0e26405c0985f9e3685c87d0ae917f82b", "Uniswap positions", "pool");
  DEAD.forEach((a) => label(a, "Burned", "burn"));

  // ---------- privileged functions, found by selector in the bytecode ----------
  // sev: how bad it is while someone still controls the contract.
  const POWERS = [
    { key: "mint", sev: "high", title: "Can mint new tokens", why: "More supply can be created at any time, diluting every holder.",
      sigs: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)", "issue(uint256)", "mint(address,uint256,bytes)"] },
    { key: "pause", sev: "high", title: "Can pause transfers", why: "Trading and transfers can be frozen.",
      sigs: ["pause()", "setPaused(bool)", "freeze()", "setPause(bool)"] },
    { key: "block", sev: "high", title: "Can block wallets", why: "Specific wallets can be stopped from selling or moving tokens.",
      sigs: ["blacklist(address)", "addToBlacklist(address)", "setBlacklist(address,bool)", "blacklistAddress(address,bool)", "addBlacklist(address)",
        "setBot(address,bool)", "setBots(address[],bool)", "addBots(address[])", "blockBots(address[])", "setBlacklisted(address,bool)", "updateBlacklist(address,bool)", "freezeAccount(address)"] },
    { key: "upgrade", sev: "high", title: "Code can be upgraded", why: "The contract's logic can be replaced with different code.",
      sigs: ["upgradeTo(address)", "upgradeToAndCall(address,bytes)", "changeImplementation(address)"] },
    { key: "fees", sev: "med", title: "Can change buy/sell fees", why: "The tax on trades can be raised after you buy.",
      sigs: ["setFee(uint256)", "setFees(uint256,uint256)", "setTaxes(uint256,uint256)", "setBuyFee(uint256)", "setSellFee(uint256)", "setTaxFee(uint256)",
        "updateFees(uint256,uint256)", "setBuyTax(uint256)", "setSellTax(uint256)", "setSwapFees(uint256,uint256)", "setFees(uint256,uint256,uint256)",
        "updateBuyFees(uint256,uint256,uint256)", "updateSellFees(uint256,uint256,uint256)", "setTax(uint256)", "setFeePercent(uint256)"] },
    { key: "limits", sev: "med", title: "Can cap trade or wallet size", why: "Limits can be set so that larger sells don't go through.",
      sigs: ["setMaxTxAmount(uint256)", "setMaxWalletSize(uint256)", "setMaxWallet(uint256)", "setMaxTransactionAmount(uint256)", "setMaxTxPercent(uint256)",
        "updateMaxTxnAmount(uint256)", "updateMaxWalletAmount(uint256)", "setMaxSellAmount(uint256)"] },
    { key: "trading", sev: "med", title: "Trading can be switched off", why: "The owner controls whether the token can be traded.",
      sigs: ["setTradingEnabled(bool)", "setTrading(bool)", "tradingStatus(bool)", "setTradingOpen(bool)", "enableTrading(bool)", "toggleTrading()"] },
    { key: "rescue", sev: "low", title: "Can pull tokens out of the contract", why: "Tokens or USDC held by the contract itself can be withdrawn by the owner.",
      sigs: ["withdrawStuckTokens(address)", "rescueTokens(address,uint256)", "clearStuckBalance()", "recoverERC20(address,uint256)", "withdrawToken(address,uint256)", "rescueERC20(address,uint256)"] },
  ];
  const SEL = (sig) => ethers.id(sig).slice(2, 10);
  let powerSels = null;
  const powers = () => powerSels || (powerSels = POWERS.map((p) => ({ ...p, sels: p.sigs.map(SEL) })));
  const OWNER_SELS = ["owner()", "getOwner()"].map(SEL);
  const ROLE_SEL = SEL("hasRole(bytes32,address)");
  /// every PUSH4 constant in the code — the dispatcher's function selectors
  function selectorsOf(code) {
    const out = new Set();
    const h = String(code || "").replace(/^0x/, "");
    for (let i = 0; i < h.length; i += 2) {
      const op = parseInt(h.substr(i, 2), 16);
      if (op === 0x63) { out.add(h.substr(i + 2, 8)); i += 8; }
      else if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2; // skip other PUSH data
    }
    return out;
  }
  const SLOT_IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const SLOT_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const SLOT_BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
  const slotAddr = (v) => { const x = String(v || "").replace(/^0x/, "").padStart(64, "0").slice(24); return /^0{40}$/.test(x) ? null : "0x" + x; };

  // =====================================================================
  // reads
  // =====================================================================
  const P = () => readProvider();
  async function readContract(addr) {
    const code = await retry(() => P().getCode(addr));
    if (!code || code === "0x") return { contract: false };
    const t = new ethers.Contract(addr, [
      "function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)",
      "function owner() view returns (address)", "function getOwner() view returns (address)",
    ], P());
    const safe = (p) => p.then((v) => v, () => null);
    const [name, symbol, decimals, supply, owner, owner2, impl, admin, beacon] = await Promise.all([
      safe(retry(() => t.name())), safe(retry(() => t.symbol())), safe(retry(() => t.decimals())), safe(retry(() => t.totalSupply())),
      safe(t.owner()), safe(t.getOwner()),
      safe(P().getStorage(addr, SLOT_IMPL)), safe(P().getStorage(addr, SLOT_ADMIN)), safe(P().getStorage(addr, SLOT_BEACON)),
    ]);
    const minimal = /^0x363d3d373d3d3d363d73([0-9a-f]{40})/i.exec(code);
    const implAddr = slotAddr(impl) || (minimal ? "0x" + minimal[1] : null);
    let implCode = null;
    if (implAddr) implCode = await safe(retry(() => P().getCode(implAddr)));
    const sels = selectorsOf(code);
    if (implCode) selectorsOf(implCode).forEach((x) => sels.add(x));
    const ownerOf = owner != null ? owner : owner2;
    let ownerIsContract = false;
    if (ownerOf && !DEAD.has(lc(ownerOf))) {
      const oc = await safe(retry(() => P().getCode(ownerOf)));
      ownerIsContract = !!(oc && oc !== "0x");
    }
    return {
      contract: true, codeSize: (code.length - 2) / 2,
      token: name != null && symbol != null && decimals != null && supply != null,
      name, symbol, decimals: decimals != null ? Number(decimals) : null, supply,
      owner: ownerOf, hasOwnerFn: OWNER_SELS.some((s) => sels.has(s)) || ownerOf != null, ownerIsContract,
      roles: sels.has(ROLE_SEL),
      proxy: implAddr ? { impl: implAddr, admin: slotAddr(admin), minimal: !!minimal } : slotAddr(beacon) ? { beacon: slotAddr(beacon) } : null,
      powers: powers().filter((p) => p.sels.some((s) => sels.has(s))).map((p) => p.key),
    };
  }
  async function readMarket(addr) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { signal: ctl.signal });
      if (!r.ok) throw new Error("dexscreener " + r.status);
      const j = await r.json();
      const pairs = (j.pairs || []).filter((p) => p && p.chainId === "arc").sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      return { pairs };
    } finally { clearTimeout(t); }
  }
  async function readHolders(addr) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 28000);
    try {
      const r = await fetch(`/api/holders?scan=${addr}`, { signal: ctl.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.top)) throw new Error((j && j.error) || "holder scan failed");
      return j;
    } finally { clearTimeout(t); }
  }
  async function readExtras(addr) {
    const out = { arcpad: null, locked: 0n, lockCount: 0 };
    const jobs = [];
    const launch = ((typeof ARC !== "undefined" && ARC.launches) || []).find((l) => lc(l.token) === lc(addr));
    if (launch) out.arcpad = launch;
    else if (CONFIG.ARCPAD_FACTORY_ADDRESS) {
      jobs.push(retry(() => P().call({ to: CONFIG.ARCPAD_FACTORY_ADDRESS, data: "0x08b74625" + addr.slice(2).toLowerCase().padStart(64, "0") }))
        .then((h) => { if (h && h !== "0x" && BigInt(h) > 0n) out.arcpad = out.arcpad || { token: addr }; }).catch(() => {}));
    }
    if (CONFIG.ARCLOCK_ADDRESS) {
      const lk = new ethers.Contract(CONFIG.ARCLOCK_ADDRESS, ["function locksOfToken(address token) view returns (uint256[] ids, tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn)[] out)"], P());
      jobs.push(retry(() => lk.locksOfToken(addr)).then((r) => {
        const now = Math.floor(Date.now() / 1000);
        for (const l of r[1] || []) if (!l.withdrawn && Number(l.unlockAt) > now) { out.locked += BigInt(l.amount); out.lockCount++; }
      }).catch(() => {}));
    }
    await Promise.all(jobs);
    return out;
  }

  // =====================================================================
  // checks → score
  // =====================================================================
  const WEIGHT = { risk: 26, warn: 10, pass: 0, info: 0 };
  function evaluate(addr, c, m, h, x) {
    const rows = [];
    const add = (group, status, title, detail) => rows.push({ group, status, title, detail });
    let cap = 100;

    // ---- contract ----
    if (!c || !c.contract) { add("contract", "risk", "No contract at this address", "Nothing is deployed here on Arc — it isn't a token."); return { rows, score: 0, notToken: true }; }
    if (!c.token) { add("contract", "risk", "Not a standard token", "It doesn't answer the basic ERC-20 calls (name, symbol, decimals, supply)."); return { rows, score: 0, notToken: true }; }
    add("contract", "pass", "Standard ERC-20 token", `${esc(c.name)} ($${esc(c.symbol)}) · ${c.decimals} decimals · ${compact(Number(ethers.formatUnits(c.supply, c.decimals)))} supply`);
    if (c.proxy) {
      add("contract", "warn", "Upgradeable proxy", c.proxy.beacon ? "Its code lives behind a beacon and can be switched to new code." : `Its code lives at ${short(c.proxy.impl)} and can be pointed at new code${c.proxy.admin ? " by the proxy admin" : ""}.`);
    } else add("contract", "pass", "Fixed code", "Not a proxy — the code you see can't be swapped out.");
    if (lc(addr) === ARCIRCLE) add("contract", "pass", "ARCIRCLE PAD core coin", "$ARCIRCLE, launched on Argus — one pool, supply in a single locked position.");
    else if (x && x.arcpad) add("contract", "pass", "Launched on ArcPad", "The standard ArcPad token, launched through the ArcPad factory with its pool created in the same transaction.");
    else add("contract", "info", "Not an ArcPad launch", "Launched somewhere else, so every check below is the generic one.");

    // ---- control ----
    const renounced = c.owner != null && DEAD.has(lc(c.owner));
    const controlled = (c.owner != null && !renounced) || c.roles;
    if (!c.hasOwnerFn && !c.roles) add("control", "pass", "No owner", "The contract has no owner function — there's no admin wallet to call anything.");
    else if (renounced) add("control", "pass", "Ownership renounced", "The owner is the zero/dead address, so owner-only functions can't be called.");
    else if (c.owner != null) add("control", c.ownerIsContract ? "info" : "warn", c.ownerIsContract ? "Owned by a contract" : "Owned by a wallet",
      `<span>Owner:</span> <a href="${ex("address", c.owner)}" target="_blank" rel="noopener" data-no-i18n>${short(c.owner)} ↗</a> <span>${c.ownerIsContract ? "Often a multisig or timelock — check who controls it." : "One wallet can still call owner-only functions."}</span>`);
    if (c.roles) add("control", "warn", "Role-based permissions", "Access is managed with roles (AccessControl) — admins may hold mint or pause rights.");
    const found = powers().filter((p) => c.powers.includes(p.key));
    if (!found.length) add("control", "pass", "No dangerous switches found", "No mint, pause, blacklist, fee or trading switches in its code.");
    found.forEach((p) => {
      if (!controlled) add("control", "info", p.title, `<span>${p.why}</span> <span>Nobody holds the keys any more, so it can't be used.</span>`);
      else add("control", p.sev === "high" ? "risk" : p.sev === "med" ? "warn" : "info", p.title, p.why);
    });
    if (controlled && found.some((p) => p.key === "mint")) cap = Math.min(cap, 55);

    // ---- market ----
    const pair = m && m.pairs && m.pairs[0];
    let market = null;
    if (!m) add("market", "info", "Market data unavailable", "Dexscreener didn't answer — try the scan again in a moment.");
    else if (!pair) { add("market", "risk", "No trading pool found", "Dexscreener doesn't list a pool for it on Arc, so there may be no way to buy or sell."); cap = Math.min(cap, 40); }
    else {
      const liq = (pair.liquidity && pair.liquidity.usd) || 0;
      const mcap = pair.marketCap || pair.fdv || 0;
      const age = pair.pairCreatedAt ? Date.now() / 1000 - pair.pairCreatedAt / 1000 : null;
      const tx = (pair.txns && pair.txns.h24) || { buys: 0, sells: 0 };
      market = { pair, liq, mcap, age, tx, price: Number(pair.priceUsd), vol: (pair.volume && pair.volume.h24) || 0, change: pair.priceChange && pair.priceChange.h24, count: m.pairs.length };
      add("market", "pass", `Trades on ${esc(dexName(pair))}`, `${m.pairs.length > 1 ? `${m.pairs.length} pools; the deepest is ` : ""}${esc(pair.baseToken && pair.baseToken.symbol)}/${esc(pair.quoteToken && pair.quoteToken.symbol)} <a href="${esc(pair.url)}" target="_blank" rel="noopener">Dexscreener ↗</a>`);
      if (liq < 1000) { add("market", "risk", "Very little liquidity", `${usd(liq)} in the pool — even small sells will move the price a lot.`); cap = Math.min(cap, 50); }
      else if (liq < 10000) add("market", "warn", "Thin liquidity", `${usd(liq)} in the pool — larger trades will move the price noticeably.`);
      else add("market", "pass", "Healthy liquidity", `${usd(liq)} in the pool.`);
      if (mcap > 0 && liq > 0 && liq / mcap < 0.02) add("market", "warn", "Small pool for its size", `Liquidity is only ${pct((liq / mcap) * 100)} of the market cap.`);
      if (age != null) {
        if (age < 86400) add("market", "warn", "Brand new pool", `Created ${ageText(age)} ago — there's little history to judge it by.`);
        else if (age < 7 * 86400) add("market", "info", "Young pool", `Created ${ageText(age)} ago.`);
        else add("market", "pass", "Established pool", `Trading for ${ageText(age)}.`);
      }
      const b = tx.buys || 0, s = tx.sells || 0;
      if (b >= 15 && s === 0) { add("market", "risk", "Buys but no sells", `${b} buys and no sells in 24h — people may not be able to sell.`); cap = Math.min(cap, 25); }
      else if (b > 30 && s / Math.max(1, b) < 0.12) add("market", "warn", "Very few sells", `${b} buys vs ${s} sells in 24h — worth a closer look before buying.`);
      else if (b + s > 0) add("market", "pass", "People buy and sell", `${b} buys · ${s} sells in the last 24h.`);
      else add("market", "info", "No trades in 24h", "Nobody has traded it in the last day.");
      const info = pair.info || {};
      const links = [...(info.websites || []).map((w) => ({ u: w.url, t: w.label || "Website" })), ...(info.socials || []).map((x2) => ({ u: x2.url, t: x2.type }))]
        .filter((l) => /^https:\/\//.test(String(l.u || "")));
      market.links = links.slice(0, 4);
      if (links.length) add("market", "pass", "Website and socials listed", links.slice(0, 4).map((l) => `<a href="${esc(l.u)}" target="_blank" rel="noopener nofollow" data-no-i18n>${esc(cap1(l.t))} ↗</a>`).join(" · "));
      else add("market", "info", "No website or socials listed", "Its Dexscreener page lists no website or social accounts.");
    }

    // ---- holders ----
    let dist = null;
    const noSupply = !c.supply || c.supply === 0n;
    if (noSupply) { add("holders", "warn", "No supply yet", "Its total supply is zero — nothing has been minted."); cap = Math.min(cap, 50); }
    else if (!h) add("holders", "info", "Holder data unavailable", "The holder scan didn't finish — try again in a moment.");
    else {
      const dec = c.decimals || 18, supply = BigInt(h.supply || c.supply || 0);
      const n = (v) => Number(ethers.formatUnits(v, dec));
      const S = n(supply) || 1;
      let inPool = 0, burned = 0, locked = x ? n(x.locked) : 0, infra = 0;
      const people = [];
      for (const [a, v] of h.top) {
        const k = LABELS[lc(a)], amt = n(BigInt(v));
        if (k && k.kind === "pool") inPool += amt;
        else if (k && k.kind === "burn") burned += amt;
        else if (k && k.kind === "lock") { /* counted from ArcLock itself */ }
        else if (k) infra += amt;
        else people.push([a, amt]);
      }
      if (!x || !x.lockCount) { const lk = h.top.find(([a]) => LABELS[lc(a)] && LABELS[lc(a)].kind === "lock"); if (lk) locked = n(BigInt(lk[1])); }
      const top10 = people.slice(0, 10).reduce((t, [, v]) => t + v, 0);
      const biggest = people[0] ? people[0][1] : 0;
      dist = { S, inPool, burned, locked, infra, top10, people, holders: h.holderCount, exact: h.holderCountExact, complete: h.complete, fromTs: h.fromTs, nowTs: h.nowTs, firstMint: h.firstMint, dec };
      const cnt = h.holderCount || 0;
      const cntTxt = `${h.holderCountExact ? "" : "at least "}${cnt.toLocaleString("en-US")}`;
      if (cnt < 25) add("holders", "warn", "Few holders", `${cntTxt} wallets hold it.`);
      else add("holders", "pass", "Holder count", `${cntTxt} wallets hold it.`);
      const t10 = (top10 / S) * 100, big = (biggest / S) * 100;
      if (t10 > 50) { add("holders", "risk", "Top 10 wallets hold most of it", `${pct(t10)} of the supply sits in 10 wallets (pool, burned and locked tokens left out).`); cap = Math.min(cap, 55); }
      else if (t10 > 30) add("holders", "warn", "Top 10 wallets hold a lot", `${pct(t10)} of the supply sits in 10 wallets (pool, burned and locked left out).`);
      else add("holders", "pass", "Supply is spread out", `The top 10 wallets hold ${pct(t10)} (pool, burned and locked left out).`);
      if (biggest > 0) {
        const who = `<a href="${ex("address", people[0][0])}" target="_blank" rel="noopener" data-no-i18n>${short(people[0][0])} ↗</a>`;
        if (big > 20) add("holders", "risk", "One wallet holds a big share", `${who} holds ${pct(big)} of the supply.`);
        else if (big > 10) add("holders", "warn", "Largest wallet over 10%", `${who} holds ${pct(big)} of the supply.`);
        else add("holders", "pass", "No whale over 10%", `${who} holds ${pct(big)} — the largest single wallet.`);
      }
      if (burned > 0) add("holders", "pass", "Tokens burned", `${pct((burned / S) * 100)} of the supply sits in burn addresses.`);
      if (locked > 0) add("holders", "pass", "Tokens locked", `${pct((locked / S) * 100)} is locked in ArcLock${x && x.lockCount ? ` (${x.lockCount} lock${x.lockCount === 1 ? "" : "s"})` : ""}. <a href="/arc#locker?token=${esc(addr)}">See locks →</a>`);
      if (inPool > 0) add("holders", "info", "In the trading pool", `${pct((inPool / S) * 100)} of the supply is liquidity in Uniswap v4 pools.`);
      if (!h.complete) add("holders", "info", "Partial history", `The holder list covers transfers since ${h.fromTs ? new Date(h.fromTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "recently"}; balances shown are live.`);
    }

    let score = 100;
    rows.forEach((r) => { score -= WEIGHT[r.status] || 0; });
    score = Math.max(0, Math.min(cap, score));
    return { rows, score, market, dist };
  }
  const cap1 = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
  const dexName = (p) => { const id = String(p.dexId || ""); const v = (p.labels || []).join(" "); return (id === "uniswap" ? "Uniswap" : cap1(id)) + (v ? " " + v : ""); };
  const verdictOf = (score) => (score >= 75 ? { k: "ok", t: "Looks OK" } : score >= 45 ? { k: "care", t: "Be careful" } : { k: "risk", t: "High risk" });

  // =====================================================================
  // UI
  // =====================================================================
  const STEPS = [["contract", "Reading the contract"], ["control", "Checking who controls it"], ["market", "Looking for trading pools"], ["holders", "Counting holders"]];
  function progress(on) {
    const box = $("asc-progress");
    box.hidden = !on;
    panel.classList.toggle("asc-scanning", !!on);
    if (on) $("asc-steps").innerHTML = STEPS.map(([k, t]) => `<li data-s="${k}"><i aria-hidden="true"></i><span>${esc(tr(t))}</span></li>`).join("");
  }
  const stepDone = (k, ok) => { const li = panel.querySelector(`#asc-steps [data-s="${k}"]`); if (li) li.className = ok === false ? "skip" : "done"; };
  const stepOn = (k) => { const li = panel.querySelector(`#asc-steps [data-s="${k}"]`); if (li && !li.className) li.className = "on"; };

  const ICON = {
    pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v6M12 17h.01"/></svg>',
    risk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11v6M12 7.5h.01"/></svg>',
  };
  const GROUPS = [["contract", "Contract"], ["control", "Who controls it"], ["market", "Market"], ["holders", "Holders"]];
  const STATUS_LABEL = { pass: "OK", warn: "Warning", risk: "Risk", info: "Note" };

  function render(addr, c, res, meta) {
    const out = $("asc-out");
    $("asc-intro").hidden = true;
    if (res.notToken) {
      out.innerHTML = `<div class="asc-card asc-nottoken"><span class="asc-bad">${ICON.risk}</span><div><h2>${esc(tr(res.rows[0].title))}</h2><p>${esc(tr(res.rows[0].detail))}</p><a href="${ex("address", addr)}" target="_blank" rel="noopener">${esc(tr("Open on the explorer"))} ↗</a></div></div>`;
      return;
    }
    const v = verdictOf(res.score);
    const counts = { pass: 0, warn: 0, risk: 0, info: 0 };
    res.rows.forEach((r) => { counts[r.status]++; });
    const m = res.market, d = res.dist;
    const logo = (m && m.pair && m.pair.info && /^https:\/\//.test(m.pair.info.imageUrl || "") && m.pair.info.imageUrl)
      || (meta.arcpad && typeof meta.arcpad.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(meta.arcpad.imageUrl) && meta.arcpad.imageUrl)
      || (lc(addr) === ARCIRCLE ? "images/arcircle-mark-sm.png" : "");
    const hue = (parseInt(addr.slice(2, 8), 16) || 0) % 360;
    const trade = lc(addr) === ARCIRCLE ? `<a class="asc-act" href="/arc#arcircle">${esc(tr("Trade $ARCIRCLE"))} →</a>`
      : meta.arcpad ? `<a class="asc-act" href="/arc#coin/${esc(addr)}">${esc(tr("Open on ArcPad"))} →</a>` : "";
    const R = 52, C = 2 * Math.PI * R;
    const tiles = m ? [
      ["Price", usd(m.price)], ["Market cap", usd(m.mcap)], ["Liquidity", usd(m.liq)], ["24h volume", usd(m.vol)],
      ["24h trades", `<span class="asc-b">${m.tx.buys || 0}</span> / <span class="asc-s">${m.tx.sells || 0}</span>`], ["Pool age", ageText(m.age)],
    ] : [];
    const chg = m && m.change != null && isFinite(m.change) ? `<em class="${m.change >= 0 ? "up" : "down"}">${m.change >= 0 ? "+" : ""}${Number(m.change).toFixed(1)}%</em>` : "";

    out.innerHTML = `
      <div class="asc-card asc-head asc-v-${v.k}">
        <div class="asc-id">
          ${logo ? `<img class="asc-logo" src="${esc(logo)}" alt="">` : `<span class="asc-logo ph" style="--h:${hue}">${esc(String(c.symbol || "?").charAt(0).toUpperCase())}</span>`}
          <div class="asc-id-txt">
            <h2 data-no-i18n>${esc(c.name)} <span>$${esc(c.symbol)}</span></h2>
            <button type="button" class="asc-ca" data-copy="${esc(addr)}" title="${esc(tr("Copy address"))}" data-no-i18n>${short(addr)}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg></button>
            <div class="asc-links">
              <a href="${ex("token", addr)}" target="_blank" rel="noopener">${esc(tr("Explorer"))} ↗</a>
              ${m && m.pair ? `<a href="${esc(m.pair.url)}" target="_blank" rel="noopener">Dexscreener ↗</a>` : ""}
              ${trade}
            </div>
          </div>
        </div>
        <div class="asc-verdict">
          <div class="asc-gauge" style="--c:${C.toFixed(1)};--p:${(res.score / 100).toFixed(3)}">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="asc-g-track" cx="60" cy="60" r="${R}"/><circle class="asc-g-fill" cx="60" cy="60" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
            <div class="asc-g-mid"><b class="asc-score" data-no-i18n>0</b><small>/ 100</small></div>
          </div>
          <div class="asc-v-txt">
            <strong>${esc(tr(v.t))}</strong>
            <div class="asc-counts">
              <span class="c-pass">${counts.pass} ${esc(tr("OK"))}</span><span class="c-warn">${counts.warn} ${esc(tr(counts.warn === 1 ? "warning" : "warnings"))}</span><span class="c-risk">${counts.risk} ${esc(tr(counts.risk === 1 ? "risk" : "risks"))}</span>
            </div>
            <div class="asc-meta"><span>${esc(tr("Scanned"))} <time data-no-i18n>${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</time></span>
              <button type="button" data-rescan>${esc(tr("Scan again"))}</button><button type="button" data-share>${esc(tr("Copy link"))}</button></div>
          </div>
        </div>
      </div>
      ${tiles.length ? `<div class="asc-tiles">${tiles.map(([k, val], i) => `<div style="--i:${i}"><small>${esc(tr(k))}</small><b data-no-i18n>${val}</b>${k === "Price" ? chg : ""}</div>`).join("")}</div>` : ""}
      <div class="asc-grid">
        <div class="asc-checks">
          ${GROUPS.map(([g, t]) => {
            const rs = res.rows.filter((r) => r.group === g);
            if (!rs.length) return "";
            const worst = rs.some((r) => r.status === "risk") ? "risk" : rs.some((r) => r.status === "warn") ? "warn" : "pass";
            return `<section class="asc-card asc-group g-${worst}"><h3><span>${esc(tr(t))}</span><em class="st-${worst}">${esc(tr(worst === "pass" ? "All good" : worst === "warn" ? "Worth a look" : "Risk found"))}</em></h3>
              <ul>${rs.map((r, i) => `<li class="asc-row st-${r.status}" style="--i:${i}"><span class="asc-ico" title="${esc(tr(STATUS_LABEL[r.status]))}">${ICON[r.status]}</span><div><b>${esc(tr(r.title))}</b><p>${r.detail}</p></div></li>`).join("")}</ul></section>`;
          }).join("")}
        </div>
        <aside class="asc-side">${d ? holdersCard(d) : ""}
          <div class="asc-card asc-notes"><h3>${esc(tr("How to read this"))}</h3>
            <p>${esc(tr("The score starts at 100 and drops for every warning and risk; a serious risk caps it. Notes don't count against it."))}</p>
            <p>${esc(tr("Owner powers only matter while someone holds them — after ownership is renounced they show as notes."))}</p></div>
        </aside>
      </div>`;
    // gauge + score count-up
    const g = out.querySelector(".asc-gauge"), sc = out.querySelector(".asc-score");
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("in")));
    if (reduce) sc.textContent = res.score;
    else {
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); sc.textContent = Math.round(res.score * e); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    out.classList.remove("in"); void out.offsetWidth; out.classList.add("in");
  }
  function holdersCard(d) {
    const S = d.S;
    const top10pct = (d.top10 / S) * 100, pool = (d.inPool / S) * 100, burn = (d.burned / S) * 100, lock = (d.locked / S) * 100;
    const rest = Math.max(0, 100 - top10pct - pool - burn - lock - (d.infra / S) * 100);
    const segs = [["pool", "In pool", pool], ["burn", "Burned", burn], ["lock", "Locked", lock], ["top", "Top 10 wallets", top10pct], ["rest", "Everyone else", rest]].filter(([, , v]) => v > 0.005);
    const list = d.people.slice(0, 10);
    return `<div class="asc-card asc-holders"><h3>${esc(tr("Holders"))} <small data-no-i18n>${d.exact ? "" : "≥ "}${(d.holders || 0).toLocaleString("en-US")}</small></h3>
      <div class="asc-dist" aria-hidden="true">${segs.map(([k, , v], i) => `<i class="d-${k}" style="--w:${v.toFixed(3)}%;--i:${i}"></i>`).join("")}</div>
      <ul class="asc-legend">${segs.map(([k, t, v]) => `<li class="d-${k}"><i></i><span>${esc(tr(t))}</span><b data-no-i18n>${pct(v)}</b></li>`).join("")}</ul>
      <h4>${esc(tr("Largest wallets"))}</h4>
      <ol class="asc-top">${list.map(([a, v], i) => {
        const p = (v / S) * 100;
        return `<li style="--w:${Math.min(100, p * 2).toFixed(2)}%"><span class="n" data-no-i18n>${i + 1}</span><a href="${ex("address", a)}" target="_blank" rel="noopener" data-no-i18n>${short(a)}</a><b data-no-i18n>${pct(p)}</b></li>`;
      }).join("") || `<li class="none">${esc(tr("No wallets besides the pool, burned and locked tokens."))}</li>`}</ol>
      <p class="asc-hnote">${esc(tr(d.complete ? "From the token's full transfer history; balances read live." : "From recent transfer history; balances read live."))}</p></div>`;
  }

  // ---------- recent scans + quick chips ----------
  function recent() { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } }
  function remember(addr, sym, score) {
    const list = recent().filter((r) => lc(r.a) !== lc(addr));
    list.unshift({ a: addr, s: sym, sc: score, at: Date.now() });
    try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 8))); } catch { /* private mode */ }
  }
  function renderChips() {
    const box = $("asc-chips");
    const chips = [];
    if (ARCIRCLE) chips.push({ a: CONFIG.ARCIRCLE_TOKEN, s: "$ARCIRCLE" });
    ((typeof ARC !== "undefined" && ARC.launches) || []).slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0)).slice(0, 4)
      .forEach((l) => chips.push({ a: l.token, s: "$" + l.symbol }));
    const rec = recent().filter((r) => !chips.some((c) => lc(c.a) === lc(r.a))).slice(0, 4);
    const chip = (c, kind) => `<button type="button" class="asc-chip${kind ? " " + kind : ""}" data-t="${esc(c.a)}" data-no-i18n>${kind === "rec" ? `<i class="v-${verdictOf(c.sc || 0).k}"></i>` : ""}${esc(c.s)}</button>`;
    const html = (chips.length ? `<span class="asc-chips-l">${esc(tr("Try"))}</span>${chips.map((c) => chip(c)).join("")}` : "")
      + (rec.length ? `<span class="asc-chips-l">${esc(tr("Recent"))}</span>${rec.map((r) => chip({ a: r.a, s: r.s ? "$" + r.s : short(r.a), sc: r.sc }, "rec")).join("")}` : "");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }

  // ---------- scan ----------
  let seq = 0, last = null;
  async function scan(input) {
    const raw = String(input || "").trim();
    const status = (msg) => { $("asc-out").innerHTML = `<div class="asc-card asc-msg">${esc(tr(msg))}</div>`; $("asc-intro").hidden = true; };
    if (!isAddr(raw)) { status("That isn't a token address — it should start with 0x and be 42 characters long."); return; }
    const addr = ethers.getAddress(raw);
    const my = ++seq;
    $("asc-addr").value = addr;
    if (history.replaceState) history.replaceState(null, "", `${location.pathname}${location.search}#scanner?t=${addr}`);
    $("asc-go").disabled = true;
    $("asc-out").innerHTML = "";
    $("asc-intro").hidden = true;
    progress(true);
    STEPS.forEach(([k]) => stepOn(k));
    const t0 = performance.now();
    const cP = readContract(addr).then((v) => { if (my === seq) { stepDone("contract", true); stepDone("control", !!(v && v.token)); } return v; }, (e) => { console.warn("scanner contract", e); if (my === seq) { stepDone("contract", false); stepDone("control", false); } return null; });
    const mP = readMarket(addr).then((v) => { if (my === seq) stepDone("market", true); return v; }, (e) => { console.warn("scanner market", e); if (my === seq) stepDone("market", false); return null; });
    const hP = readHolders(addr).then((v) => { if (my === seq) stepDone("holders", true); return v; }, (e) => { console.warn("scanner holders", e); if (my === seq) stepDone("holders", false); return null; });
    const xP = readExtras(addr).catch(() => null);
    const c = await cP;
    if (my !== seq) return;
    if (!c) { progress(false); $("asc-go").disabled = false; status("Couldn't read that address from Arc right now — try again in a moment."); return; }
    // not a token: no need to wait for the rest
    const [m, h, x] = c.token ? await Promise.all([mP, hP, xP]) : [null, null, null];
    if (my !== seq) return;
    // let the radar finish its sweep so a cached scan doesn't just flash
    const wait = Math.max(0, (reduce ? 0 : 900) - (performance.now() - t0));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (my !== seq) return;
    const res = evaluate(addr, c, m, h, x);
    progress(false);
    $("asc-go").disabled = false;
    last = { addr, c, res };
    render(addr, c, res, { arcpad: x && x.arcpad });
    if (!res.notToken) { remember(addr, c.symbol, res.score); renderChips(); }
    if (typeof window.arcHaptic === "function") window.arcHaptic(res.score >= 75 ? "milestone" : "tap");
  }

  // ---------- wiring ----------
  $("asc-form").addEventListener("submit", (e) => { e.preventDefault(); scan($("asc-addr").value); });
  $("asc-addr").addEventListener("paste", () => setTimeout(() => { if (isAddr($("asc-addr").value.trim())) scan($("asc-addr").value); }, 0));
  $("asc-paste").addEventListener("click", async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { $("asc-addr").value = t.trim(); if (isAddr(t.trim())) scan(t); } }
    catch { $("asc-addr").focus(); }
  });
  $("asc-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) scan(b.dataset.t); });
  $("asc-out").addEventListener("click", async (e) => {
    const cp = e.target.closest("[data-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); cp.classList.add("ok"); setTimeout(() => cp.classList.remove("ok"), 1200); } catch { /* denied */ } return; }
    if (e.target.closest("[data-rescan]") && last) { scan(last.addr); return; }
    const sh = e.target.closest("[data-share]");
    if (sh && last) {
      const url = `${location.origin}/arc#scanner?t=${last.addr}`;
      try { await navigator.clipboard.writeText(url); sh.textContent = tr("Link copied"); setTimeout(() => { sh.textContent = tr("Copy link"); }, 1400); } catch { /* denied */ }
    }
  });
  function fromHash() {
    const m = /^#scanner\?(?:t|token)=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m && (!last || lc(last.addr) !== lc(m[1]))) scan(m[1]);
  }
  window.addEventListener("hashchange", fromHash);
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "scanner") { renderChips(); setTimeout(() => { if (!last && !reduce) $("asc-addr").focus({ preventScroll: true }); }, 250); } });
  renderChips();
  fromHash();
  // ArcPad launches arrive after load — refresh the quick picks when they do
  let tries = 0;
  const chipT = setInterval(() => { renderChips(); if (++tries > 10 || (typeof ARC !== "undefined" && ARC.launches && ARC.launches.length)) clearInterval(chipT); }, 1500);
  window.arcScanner = { scan, evaluate, selectorsOf };
})();
