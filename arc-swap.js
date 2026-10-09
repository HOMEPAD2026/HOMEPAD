/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider, ARC, arcpadSnapshot, arcircleUsdFromSqrt */
// arc-swap.js — ARCIRCLE Swap (arcpad.html#swap; contracts/ArcircleSwap.sol): buy and sell any Arc token that has a
// Uniswap v4 pool, paying with $ARCIRCLE, USDC or any other token, in one transaction.
//   · routes: the pools of the two tokens, $ARCIRCLE / USDC and USDC itself make a small graph; every path of up to
//     three pools is quoted (ArcircleSwap.quote, an eth_call) and the best one is used — "$ARCIRCLE → USDC → a coin",
//     "a coin → $ARCIRCLE" for an $ARCIRCLE-paired ArcPad coin, or one pool when there's a direct one
//   · the fee: 0.1%, taken in $ARCIRCLE wherever the route touches it (half burned in the same transaction), else in
//     USDC (half buys and burns $ARCIRCLE in the fee burn's hourly run); holders of 100,000+ $ARCIRCLE swap fee-free
//   · the card: you pay / you receive, the route drawn with where the fee is taken, the rate, minimum received, price
//     impact (a large one asks twice), slippage, approve then swap
//   · Swap's own burn: $ARCIRCLE burned straight from swaps and the USDC sent to the hourly burn
// v2 (10 Oct 2026) — a full DEX screen: the pair's USD price chart (GeckoTerminal candles, 15m / 1h / 4h / 1d, hover
// for open / high / low / close) and its latest trades beside the card; Review swap → one modal that approves (if
// needed) and swaps, step by step, with the network fee and the result; slippage presets 0.1–3% and a deadline; the
// network strip (Arc block, gas, wrong-network warning) and a price ticker; the token picker shows balances, your
// tokens by value and favourites. arc-swap-x.js adds Pools, Tokens, Activity and Send & Receive.
// Until CONFIG.SWAP_ADDRESS is set the page quotes the same routes hop by hop through ARCIRCLE Orders' quote() and
// shows them as a preview; the Swap button turns on with the contract.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-swap");
  const host = document.getElementById("sw-body");
  if (!panel || !host) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lang = () => (window.arcI18n && window.arcI18n.get()) || "en";
  const L3 = (en, ko, zh) => esc(lang() === "ko" ? ko : lang() === "zh" ? zh : en);
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const ZERO = "0x0000000000000000000000000000000000000000";
  const CFG = () => (typeof CONFIG !== "undefined" ? CONFIG : {});
  const USDC = () => lc(CFG().USDC_ADDRESS || "0x3600000000000000000000000000000000000000");
  const ARCIRCLE = () => lc(CFG().ARCIRCLE_TOKEN || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7");
  const ROUTER = () => lc(CFG().SWAP_ADDRESS || "");
  const LIVE = () => isAddr(ROUTER());
  const ORDERS = () => lc(CFG().ORDERS_ADDRESS || "");
  const FEEBURN = () => lc(CFG().ARCIRCLE_FEEBURN || "0x7F53F5014bc2cFE52ED8fB9370f2bCd497B93034");
  const EXPL = () => CFG().BLOCK_EXPLORER || "https://arc.etherscan.io";
  const GAS_KEEP = 100000n; // 0.1 USDC stays for gas when paying with USDC (Arc's gas is USDC)
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const rp = () => (typeof readProvider === "function" ? readProvider() : null);

  // ---------------- contract bits ----------------
  const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
  const SWAP_ABI = [
    `function swap(${KEY_T}[] path,address tokenIn,uint256 amountIn,uint256 minOut,address to,uint256 deadline) returns (uint256)`,
    `function quote(${KEY_T}[] path,address tokenIn,uint256 amountIn,address payer)`,
    "function feeBps() view returns (uint256)", "function feeOf(address,uint256) view returns (uint256)",
    "function swaps() view returns (uint256)", "function flushes() view returns (uint256)", "function feesIn(address) view returns (uint256)",
    "error QuoteResult(uint256 out, uint256 fee, uint256 feeAt)", "error Slippage(uint256 out, uint256 minOut)", "error BadPath()", "error Expired()",
    "error NativeNotSupported()", "error Reentered()",
    "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address feeToken, uint256 fee, uint8 hops, address to)",
  ];
  const ORDERS_ABI = [`function quote(${KEY_T},address,uint256)`, "error QuoteResult(uint256 out)"];
  const FB_ABI = [`function poolKey() view returns (${KEY_T})`, "function feeFree(address) view returns (bool)", "function burnBps() view returns (uint256)", "function discountMin() view returns (uint256)"];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function name() view returns (string)"];
  const FACT_ABI = ["function tickSpacing() view returns (int24)"];
  const PM_ABI = ["function extsload(bytes32) view returns (bytes32)"];
  const SW_I = new ethers.Interface(SWAP_ABI);
  const OR_I = new ethers.Interface(ORDERS_ABI);
  const keyOf = (k) => ({ currency0: k.currency0, currency1: k.currency1, fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: k.hooks });
  const errData = (e) => { const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data)); return typeof d === "string" ? d : d && d.data; };

  // ---------------- formatting ----------------
  const human = (raw, dec) => Number(raw) / 10 ** dec;
  function fmt(n, max = 6) {
    if (n == null || !isFinite(n)) return "—";
    if (n === 0) return "0";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    // small: four significant figures, tiny ones with a subscript count of zeros (0.0₆1088)
    const z = Math.floor(-Math.log10(n));
    if (z >= 4) { const sig = Math.round(n * 10 ** (z + 4)); return "0.0" + String(z).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("") + String(sig).slice(0, 4); }
    return Number(n.toPrecision(4)).toString().slice(0, max + 2);
  }
  const fmtRaw = (raw, dec) => fmt(human(raw, dec));
  const usdK = (n) => (n == null || !isFinite(n) ? "" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + n.toFixed(0));
  const usd = (n) => (n == null || !isFinite(n) ? "" : n >= 1 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : n > 0 ? "$" + fmt(n) : "$0");
  /// a decimal string → raw units, extra decimals cut (never rounded up)
  function units(v, dec) {
    let s = String(v == null ? "" : v).trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
    const [i, f = ""] = s.split(".");
    s = (i || "0") + "." + f.slice(0, dec);
    try { const r = ethers.parseUnits(s, dec); return r > 0n ? r : null; } catch { return null; }
  }
  const plain = (raw, dec) => { const s = ethers.formatUnits(raw, dec); return s.includes(".") ? s.replace(/\.?0+$/, "") : s; };

  // ---------------- tokens ----------------
  const ICON = {
    flip: '<path d="M8 4v15M8 19l-4-4M8 19l4-4M16 20V5M16 5l-4 4M16 5l4 4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.6 2.2-4.7.3 1.6 1.1 2.6 2.1 2.9C10.9 8.6 11 5.6 12 3z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    star: '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    arrow: '<path d="M12 5v14M12 19l-5-5M12 19l5-5"/>',
    gas: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M7 8h5M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    swap: '<path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3"/>',
    pools: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/>',
    coins: '<circle cx="9" cy="9" r="5.5"/><path d="M14.7 9.6a5.5 5.5 0 1 1-5.1 5.1"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3.2 2"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
  };
  const svg = (k, cls = "sw-i") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const META = new Map(); // address → { address, symbol, name, decimals, logo }
  function base() {
    META.set(USDC(), { address: USDC(), symbol: "USDC", name: "USD Coin", decimals: 6, logo: "/images/tokens/usdc.svg" });
    META.set(ARCIRCLE(), { address: ARCIRCLE(), symbol: "ARCIRCLE", name: "ARCIRCLE", decimals: 18, logo: "/images/arcircle-mark-sm.png" });
  }
  base();
  const launches = () => (typeof ARC !== "undefined" && Array.isArray(ARC.launches) && ARC.launches.length ? ARC.launches : S.snap || []);
  const launchOf = (t) => launches().find((l) => lc(l.token) === lc(t)) || null;
  const okImg = (u) => /^(https:\/\/|\/images\/)/i.test(String(u || ""));
  async function meta(t) {
    t = lc(t);
    if (META.has(t) && META.get(t).decimals != null) return META.get(t);
    const l = launchOf(t);
    if (l && l.symbol) { const m = { address: t, symbol: l.symbol, name: l.name || "", decimals: 18, logo: okImg(l.imageUrl) ? l.imageUrl : null }; META.set(t, m); return m; }
    const c = new ethers.Contract(t, ERC20, rp());
    const [sym, dec, name] = await Promise.all([c.symbol().catch(() => null), c.decimals().catch(() => null), c.name().catch(() => "")]);
    if (sym == null || dec == null) throw new Error(tr("That address isn't a token on Arc."));
    const m = { address: t, symbol: String(sym).slice(0, 16), name: String(name || "").slice(0, 40), decimals: Number(dec), logo: (META.get(t) || {}).logo || null };
    META.set(t, m);
    return m;
  }
  const logoHtml = (m, cls = "sw-logo") => m && okImg(m.logo) ? `<img class="${cls}" src="${esc(m.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} sw-logo-l',textContent:'${esc(((m && m.symbol) || "?")[0].toUpperCase())}'}))">`
    : `<span class="${cls} sw-logo-l" aria-hidden="true">${esc(((m && m.symbol) || "?")[0].toUpperCase())}</span>`;
  const symOf = (t) => (META.get(lc(t)) || {}).symbol || short(t);

  // ---------------- state ----------------
  const LS = { slip: "arc.swap.slip", recent: "arc.swap.recent", pair: "arc.swap.pair", inf: "arc.swap.unlimited", dl: "arc.swap.deadline", favs: "arc.swap.favs", tf: "arc.swap.tf", view: "arc.swap.view" };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  const S = {
    tin: ARCIRCLE(), tout: null, amt: "", side: "in", quote: null, quoting: false, qerr: null, qseq: 0, routes: [], showRoutes: false,
    slip: Number(lsGet(LS.slip, 1)) || 1, showSet: false, unlimited: !!lsGet(LS.inf, false), bal: {}, allow: null, feeBps: Number(CFG().SWAP_FEE_BPS || 10), feeFree: null,
    burnBps: 5000, stats: null, busy: false, msg: null, done: null, pick: null, q: "", trending: [], snap: null, usd: {}, impactOk: false, booted: false,
    dl: Number(lsGet(LS.dl, 20)) || 20, view: "swap", ch: null, tf: lsGet(LS.tf, "1h"), trd: null, net: null, rv: null, pbal: {}, pbalAt: 0, favs: lsGet(LS.favs, []), top: null,
  };

  // ---------------- pools and routes ----------------
  const POOLS = new Map(); // token → { at, list: [{ key, a, b, venue, liq }] }
  let arcKeyP = null, tsP = null;
  /// the $ARCIRCLE / USDC pool: the one ArcircleFeeBurn buys from
  function arcKey() {
    if (!arcKeyP) arcKeyP = new ethers.Contract(FEEBURN(), FB_ABI, rp()).poolKey().then(keyOf).catch(() => { arcKeyP = null; return null; });
    return arcKeyP;
  }
  function arcpadTs() {
    if (!tsP) tsP = new ethers.Contract(CFG().ARCPAD_FACTORY_ADDRESS, FACT_ABI, rp()).tickSpacing().then(Number).catch(() => { tsP = null; return 0; });
    return tsP;
  }
  const sortKey = (a, b) => (BigInt(a) < BigInt(b) ? [lc(a), lc(b)] : [lc(b), lc(a)]);
  const edge = (key, venue, liq = 0) => ({ key, a: lc(key.currency0), b: lc(key.currency1), venue, liq: Number(liq) || 0 });
  async function poolsOf(t) {
    t = lc(t);
    if (t === USDC()) return [];
    const hit = POOLS.get(t);
    if (hit && Date.now() - hit.at < 120000) return hit.list;
    const list = [];
    if (t === ARCIRCLE()) { const k = await arcKey(); if (k) list.push(edge(k, CFG().ARCIRCLE_VENUE || "Argus", 1e12)); }
    // ArcPad's own list knows its coins' pools: wait for it the first time instead of asking the server
    if (t !== ARCIRCLE() && !launches().length) await loadLists().catch(() => null);
    const l = launchOf(t);
    if (l && isAddr(l.quoteToken) && isAddr(CFG().ARCPAD_HOOK_ADDRESS)) {
      const ts = await arcpadTs();
      if (ts > 0) { const [c0, c1] = sortKey(t, l.quoteToken); list.push(edge({ currency0: c0, currency1: c1, fee: 0, tickSpacing: ts, hooks: lc(CFG().ARCPAD_HOOK_ADDRESS) }, "ArcPad", 1e9)); }
    }
    if (!list.length) {
      // any other token: the Liquidity Manager's pool reader (keys, prices, liquidity), asked again while it's still reading
      for (let i = 0, t0 = Date.now(); i < 12 && Date.now() - t0 < 25000; i++) {
        let j = null, r = null;
        try { r = await fetch(`/api/desk?liq=${t}&lite=1`, { cache: "no-store" }); j = r.ok ? await r.json() : null; } catch { j = null; }
        if (j && Array.isArray(j.pools) && (j.pools.length || j.done)) {
          for (const p of j.pools) {
            if (!p || !p.key || lc(p.key.currency0) === ZERO || lc(p.key.currency1) === ZERO) continue;
            list.push(edge(keyOf(p.key), p.venue || "Uniswap v4", (p.dex && p.dex.liqUsd) || Number(p.liquidity || 0) / 1e18));
            const q = p.quote || {};
            if (isAddr(q.address) && q.symbol && !META.has(lc(q.address))) META.set(lc(q.address), { address: lc(q.address), symbol: q.symbol, name: "", decimals: Number(q.decimals ?? 18), logo: null });
            if (p.price > 0 && lc(q.address) === USDC()) S.usd[t] = p.price;
            if (p.price > 0 && lc(q.address) === ARCIRCLE() && S.usd[ARCIRCLE()]) S.usd[t] = p.price * S.usd[ARCIRCLE()];
          }
          if (j.token && j.token.logo && META.has(t) && !META.get(t).logo) META.get(t).logo = j.token.logo;
          break;
        }
        if (r && r.status && r.status !== 503 && r.status !== 504 && !(j && j.done === false)) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    // nothing found is asked again after 10 s (a list that was still loading, a pool made a moment ago)
    POOLS.set(t, { at: list.length ? Date.now() : Date.now() - 110000, list });
    return list;
  }
  /// every path of up to three pools from `tin` to `tout` through USDC and $ARCIRCLE (the two pools per pair with the
  /// most liquidity), shortest first, at most 12
  async function routesOf(tin, tout) {
    const nodes = new Set([lc(tin), lc(tout), USDC(), ARCIRCLE()]);
    const [a, b, c] = await Promise.all([poolsOf(tin), poolsOf(tout), poolsOf(ARCIRCLE())]);
    const byPair = new Map();
    const seen = new Set();
    for (const e of [...a, ...b, ...c]) {
      if (!nodes.has(e.a) || !nodes.has(e.b)) continue;
      const id = JSON.stringify(e.key).toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      const pk = [e.a, e.b].sort().join("/");
      byPair.set(pk, [...(byPair.get(pk) || []), e]);
    }
    for (const [k, v] of byPair) byPair.set(k, v.sort((x, y) => y.liq - x.liq).slice(0, 2));
    const out = [];
    const walk = (at, path, used) => {
      if (path.length > 3 || out.length > 40) return;
      if (at === lc(tout) && path.length) { out.push(path); return; }
      for (const n of nodes) {
        if (used.has(n)) continue;
        for (const e of byPair.get([at, n].sort().join("/")) || []) walk(n, [...path, { ...e, from: at, to: n }], new Set([...used, n]));
      }
    };
    walk(lc(tin), [], new Set([lc(tin)]));
    return out.sort((x, y) => x.length - y.length).slice(0, 12);
  }
  /// where the contract takes the fee: the first $ARCIRCLE on the route, else the first USDC, else what you receive
  function feeAtOf(tokens) {
    const i = tokens.indexOf(ARCIRCLE());
    if (i >= 0) return i;
    const j = tokens.indexOf(USDC());
    return j >= 0 ? j : tokens.length - 1;
  }
  const tokensOf = (path) => [path[0].from, ...path.map((h) => h.to)];
  /// what a route brings for `amount`: ArcircleSwap.quote once it's live; until then hop by hop through ARCIRCLE
  /// Orders' pool quote, with the fee worked out the way the contract takes it
  async function quoteRoute(path, amount) {
    const tokens = tokensOf(path);
    if (LIVE()) {
      try { await rp().call({ to: ROUTER(), data: SW_I.encodeFunctionData("quote", [path.map((h) => keyOf(h.key)), tokens[0], amount, me() || ZERO]) }); } catch (e) {
        const hex = errData(e);
        if (hex && hex.length >= 10) { try { const r = SW_I.decodeErrorResult("QuoteResult", hex); return { out: r[0], fee: r[1], feeAt: Number(r[2]), tokens }; } catch { return null; } }
      }
      return null;
    }
    if (!isAddr(ORDERS())) return null;
    const feeAt = feeAtOf(tokens), n = path.length, bps = S.feeFree ? 0n : BigInt(S.feeBps);
    let amt = amount, fee = 0n;
    if (feeAt === 0) { fee = (amt * bps) / 10000n; amt -= fee; }
    for (let i = 0; i < n; i++) {
      let out = null;
      try { await rp().call({ to: ORDERS(), data: OR_I.encodeFunctionData("quote", [keyOf(path[i].key), tokens[i], amt]) }); } catch (e) {
        const hex = errData(e);
        if (hex && hex.length >= 10) { try { out = OR_I.decodeErrorResult("QuoteResult", hex)[0]; } catch { out = null; } }
      }
      if (out == null || out === 0n) return null;
      amt = out;
      if (i + 1 === feeAt && i + 1 < n) { fee = (amt * bps) / 10000n; amt -= fee; }
    }
    if (feeAt === n) { fee = (amt * bps) / 10000n; amt -= fee; }
    return { out: amt, fee, feeAt, tokens };
  }

  // ---------------- prices in dollars ----------------
  async function loadArcUsd() {
    try {
      const slot = CFG().ARCIRCLE_POOL_SLOT, pm = CFG().POOL_MANAGER_ADDRESS;
      if (!slot || !pm || typeof arcircleUsdFromSqrt !== "function") return;
      const w = await new ethers.Contract(pm, PM_ABI, rp()).extsload(slot);
      const sqrt = BigInt(w) & ((1n << 160n) - 1n);
      const p = arcircleUsdFromSqrt(sqrt);
      if (p) S.usd[ARCIRCLE()] = p;
    } catch { /* keep */ }
  }
  function usdOf(t) {
    t = lc(t);
    if (t === USDC()) return 1;
    if (S.usd[t]) return S.usd[t];
    const l = launchOf(t);
    if (l) { if (l.priceUsdc > 0) return l.priceUsdc; if (l.priceInQuote > 0 && lc(l.quoteToken) === ARCIRCLE() && S.usd[ARCIRCLE()]) return l.priceInQuote * S.usd[ARCIRCLE()]; }
    const tr0 = S.trending.find((x) => lc(x.t) === t);
    return tr0 && tr0.priceUsd > 0 ? tr0.priceUsd : null;
  }
  const usdAmt = (t, raw) => { const p = usdOf(t), m = META.get(lc(t)); return p && m && raw != null ? human(raw, m.decimals) * p : null; };

  // ---------------- data ----------------
  async function loadBal() {
    const a = me();
    if (!a) { S.bal = {}; S.allow = null; return; }
    const ts = [S.tin, S.tout].filter(isAddr);
    const r = await Promise.all(ts.map((t) => new ethers.Contract(t, ERC20, rp()).balanceOf(a).catch(() => null)));
    ts.forEach((t, i) => { if (r[i] != null) S.bal[lc(t)] = r[i]; });
    if (LIVE() && isAddr(S.tin)) S.allow = await new ethers.Contract(S.tin, ERC20, rp()).allowance(a, ROUTER()).catch(() => null);
  }
  async function loadFeeInfo() {
    const fb = new ethers.Contract(FEEBURN(), FB_ABI, rp());
    const [bps, free, burn] = await Promise.all([
      LIVE() ? new ethers.Contract(ROUTER(), SWAP_ABI, rp()).feeBps().then(Number).catch(() => null) : null,
      me() ? fb.feeFree(me()).catch(() => null) : false,
      fb.burnBps().then(Number).catch(() => null),
    ]);
    if (bps != null) S.feeBps = bps;
    S.feeFree = free;
    if (burn != null) S.burnBps = burn;
  }
  async function loadStats() {
    if (!LIVE()) { S.stats = null; return; }
    const c = new ethers.Contract(ROUTER(), SWAP_ABI, rp());
    const [swaps, arcFees, usdcFees] = await Promise.all([c.swaps().catch(() => null), c.feesIn(ARCIRCLE()).catch(() => null), c.feesIn(USDC()).catch(() => null)]);
    if (swaps == null) return;
    S.stats = { swaps: Number(swaps), arcBurned: arcFees == null ? null : (arcFees * BigInt(S.burnBps)) / 10000n, usdcToBurn: usdcFees };
  }
  async function loadLists() {
    if (!launches().length && typeof arcpadSnapshot === "function") { const j = await arcpadSnapshot().catch(() => null); if (j && Array.isArray(j.launches)) S.snap = j.launches; }
    else if (!launches().length) { const j = await fetch("/api/c?view=launches").then((r) => (r.ok ? r.json() : null)).catch(() => null); if (j && Array.isArray(j.launches)) S.snap = j.launches; }
    const ex = await fetch("/api/desk?orders=explore").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    S.trending = ((ex && ex.trending) || []).filter((x) => isAddr(x.t));
    for (const x of S.trending) if (!META.has(lc(x.t)) && x.sym) META.set(lc(x.t), { address: lc(x.t), symbol: String(x.sym).slice(0, 16), name: x.name || "", decimals: null, logo: okImg(x.logo) ? x.logo : null });
  }

  // ---------------- quoting ----------------
  let qTimer = null;
  function requote(delay = 350) { clearTimeout(qTimer); qTimer = setTimeout(quote, delay); }
  async function quote() {
    const seq = ++S.qseq;
    S.qerr = null;
    const mi = META.get(lc(S.tin)), mo = META.get(lc(S.tout));
    const amount = mi && mi.decimals != null ? units(S.amt, mi.decimals) : null;
    if (!isAddr(S.tin) || !isAddr(S.tout) || !amount || !mo || mo.decimals == null) { S.quote = null; S.routes = []; S.quoting = false; paint(); return; }
    if (lc(S.tin) === lc(S.tout)) { S.quote = null; S.qerr = tr("Pick two different tokens."); paint(); return; }
    S.quoting = true; paint();
    try {
      const paths = await routesOf(S.tin, S.tout);
      if (seq !== S.qseq) return;
      if (!paths.length) throw new Error(tr("No route between these two tokens on Arc's Uniswap v4 pools yet."));
      const qs = await Promise.all(paths.map((p) => quoteRoute(p, amount).catch(() => null)));
      if (seq !== S.qseq) return;
      const ok = paths.map((p, i) => ({ path: p, q: qs[i] })).filter((x) => x.q && x.q.out > 0n).sort((x, y) => (y.q.out > x.q.out ? 1 : y.q.out < x.q.out ? -1 : x.path.length - y.path.length));
      if (!ok.length) throw new Error(tr("The pools on this route can't take that amount right now."));
      const best = ok[0];
      // price impact: the same route for a thousandth of the amount
      const small = amount / 1000n > 0n ? amount / 1000n : 1n;
      const qs0 = await quoteRoute(best.path, small).catch(() => null);
      if (seq !== S.qseq) return;
      let impact = null;
      // the fee is the same share on both, so it cancels out: what's left is the pools' own price impact
      if (qs0 && qs0.out > 0n) impact = Math.max(0, (1 - (Number(best.q.out) / Number(amount)) / (Number(qs0.out) / Number(small))) * 100);
      S.quote = { ...best.q, path: best.path, amount, impact, at: Date.now() };
      S.routes = ok.slice(0, 5);
      S.impactOk = false;
    } catch (e) {
      if (seq !== S.qseq) return;
      S.quote = null; S.routes = []; S.qerr = String((e && e.message) || e);
    }
    S.quoting = false;
    paint();
  }

  // ---------------- the page ----------------
  const VIEWS = [["swap", "Swap", "swap"], ["pools", "Pools", "pools"], ["tokens", "Tokens", "coins"], ["activity", "Activity", "clock"], ["send", "Send & Receive", "send"]];
  function layout() {
    if ($("sw-app")) return;
    host.innerHTML = `<div class="sw-app" id="sw-app">
      <div class="sw-top">
        <nav class="sw-nav" role="tablist" aria-label="ARCIRCLE Swap">${VIEWS.map(([k, l, i]) => `<button type="button" role="tab" data-sw-view="${k}" aria-selected="${S.view === k}" aria-controls="sw-v-${k}">${svg(i)}<span>${T(l)}</span></button>`).join("")}</nav>
        <div class="sw-net" id="sw-net" aria-live="off"></div>
      </div>
      <div class="sw-ticker" id="sw-ticker"></div>
      <div id="sw-netwarn"></div>
      <section class="sw-view" id="sw-v-swap" data-view="swap" role="tabpanel"><div class="sw-grid"><div class="sw-right"><div id="sw-cardhost"></div><div id="sw-burnhost"></div></div><div class="sw-left"><section class="sw-chart" id="sw-chart" aria-label="${T("Price chart")}"></section><section class="sw-trades" id="sw-trades" aria-label="${T("Latest trades")}"></section></div></div></section>
      <section class="sw-view" id="sw-v-pools" data-view="pools" role="tabpanel" hidden><div id="sw-pools"></div></section>
      <section class="sw-view" id="sw-v-tokens" data-view="tokens" role="tabpanel" hidden><div id="sw-tokens"></div></section>
      <section class="sw-view" id="sw-v-activity" data-view="activity" role="tabpanel" hidden><div id="sw-act"></div></section>
      <section class="sw-view" id="sw-v-send" data-view="send" role="tabpanel" hidden><div id="sw-send"></div></section>
      <div id="sw-pkhost"></div><div id="sw-rvhost"></div>
    </div>`;
  }
  function setView(v, quiet) {
    if (!VIEWS.some((x) => x[0] === v)) v = "swap";
    S.view = v;
    host.querySelectorAll("[data-sw-view]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.swView === v)));
    host.querySelectorAll(".sw-view").forEach((x) => { x.hidden = x.dataset.view !== v; });
    if (!quiet) setHash();
    document.dispatchEvent(new CustomEvent("arcswap:view", { detail: { view: v } }));
    if (v === "swap") { paintChart(); paintTrades(); }
  }
  function feeLine(q) {
    if (S.feeFree) return `<span class="sw-free">${T("Fee-free — you hold 100,000+ $ARCIRCLE")}</span>`;
    const pct = (S.feeBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
    if (!q) return `${pct}`;
    const ft = q.tokens[q.feeAt], m = META.get(ft) || {};
    const amt = `<span data-no-i18n>${pct} · <b>${esc(fmtRaw(q.fee, m.decimals ?? 18))} ${esc(m.symbol || "")}</b></span>`;
    const half = (S.burnBps / 100).toFixed(0) + "%";
    const note = ft === ARCIRCLE() ? L3(`${half} burned in this swap`, `${half}는 이 스왑에서 바로 소각`, `${half} 在本次兑换中直接销毁`)
      : ft === USDC() ? L3(`${half} buys and burns $ARCIRCLE within the hour`, `${half}로 1시간 안에 $ARCIRCLE을 사서 소각`, `${half} 在一小时内买入并销毁 $ARCIRCLE`)
      : T("to the ARCIRCLE PAD treasury");
    return `${amt}<small class="sw-fee-n">${ft === ARCIRCLE() || ft === USDC() ? svg("flame", "sw-fl") : ""}${note}</small>`;
  }
  function routeHtml(q) {
    if (!q) return "";
    const parts = [];
    q.tokens.forEach((t, i) => {
      const m = META.get(t) || { symbol: short(t) };
      const fee = i === q.feeAt && !S.feeFree && q.fee > 0n;
      // the tokens in the middle show their logo only on a route of four, and on a phone
      const mid = i > 0 && i < q.tokens.length - 1;
      parts.push(`<span class="sw-rt-tok${fee ? " fee" : ""}${mid ? " mid" : ""}${mid && q.tokens.length > 3 ? " lo" : ""}" title="${esc(m.symbol)}${fee ? " — " + T("The fee is taken here") : ""}">${logoHtml(m, "sw-logo sm")}<b data-no-i18n>${esc(m.symbol)}</b>${fee ? svg("flame", "sw-fl") : ""}</span>`);
      if (i < q.path.length) parts.push(`<i class="sw-rt-ar" aria-hidden="true"></i>`);
    });
    return `<div class="sw-rt" role="img" aria-label="${T("Route")}: ${esc(q.tokens.map(symOf).join(" → "))}">${parts.join("")}</div>`;
  }
  /// the network fee of a swap (and an approval first, if one is needed), in dollars: Arc's gas is paid in USDC
  function gasUsd(q, withApprove) {
    if (!S.net || !S.net.gasPrice || !q) return null;
    const units0 = 160000 + 110000 * q.path.length + (withApprove ? 55000 : 0);
    return (Number(S.net.gasPrice) * units0) / 1e18;
  }
  const needApprove = (amount) => LIVE() && me() && S.allow != null && amount != null && S.allow < amount;
  function cta() {
    const mi = META.get(lc(S.tin)), amount = mi && mi.decimals != null ? units(S.amt, mi.decimals) : null;
    if (!isAddr(S.tout)) return { t: tr("Pick a token to receive"), act: "pick-out" };
    if (!amount) return { t: tr("Enter an amount"), off: true };
    if (S.quoting && !S.quote) return { t: tr("Finding the best route…"), off: true };
    if (!S.quote) return { t: tr("No route"), off: true };
    if (!LIVE()) return { t: tr("Swap opens once its contract is live"), off: true };
    if (!me()) return { t: tr("Connect a wallet"), act: "connect" };
    const b = S.bal[lc(S.tin)];
    if (b != null && b < amount) return { t: `${tr("Not enough")} ${mi.symbol}`, off: true };
    if (S.quote.impact != null && S.quote.impact > 15 && !S.impactOk) return { t: tr("Price impact is high — press again to swap anyway"), act: "impact", warn: true };
    return { t: tr("Review swap"), act: "review" };
  }
  function tokBtn(side) {
    const t = side === "in" ? S.tin : S.tout, m = isAddr(t) ? META.get(lc(t)) : null;
    return m ? `<button type="button" class="sw-tokbtn" data-sw="pick-${side}" aria-label="${T(side === "in" ? "Change the token you pay with" : "Change the token you receive")}">${logoHtml(m)}<b data-no-i18n>${esc(m.symbol)}</b>${svg("down", "sw-i sm")}</button>`
      : `<button type="button" class="sw-tokbtn pick" data-sw="pick-${side}">${T("Select token")}${svg("down", "sw-i sm")}</button>`;
  }
  const SLIPS = [0.1, 0.5, 1, 3];
  function paint() {
    if (!S.booted) return;
    layout();
    const keep = document.activeElement && document.activeElement.id === "sw-amt" ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    const mi = META.get(lc(S.tin)), mo = isAddr(S.tout) ? META.get(lc(S.tout)) : null, q = S.quote;
    const amount = mi && mi.decimals != null ? units(S.amt, mi.decimals) : null;
    const bin = S.bal[lc(S.tin)], bout = isAddr(S.tout) ? S.bal[lc(S.tout)] : null;
    const uin = amount ? usdAmt(S.tin, amount) : null, uout = q ? usdAmt(S.tout, q.out) : null;
    const c = cta();
    const minOut = q ? (q.out * BigInt(Math.round((100 - S.slip) * 100))) / 10000n : null;
    const rate = q && mo && mi ? human(q.out, mo.decimals) / human(q.amount, mi.decimals) : null;
    const imp = q && q.impact != null ? q.impact : null;
    const impCls = imp == null ? "" : imp > 15 ? "bad" : imp > 5 ? "warn" : "";
    const gas = gasUsd(q, needApprove(amount));
    $("sw-cardhost").innerHTML = `
          ${LIVE() ? "" : `<div class="ams-preview sw-preview"><i class="ams-preview-ico"></i><div><b>${T("Preview — ARCIRCLE Swap opens once its contract is live on Arc")}</b><span>${T("Quotes below are live prices from the same pools, read through ARCIRCLE Orders. Swapping turns on with the contract.")}</span></div></div>`}
          <div class="sw-card">
            <div class="sw-card-h"><h2>${T("Swap")}</h2><span class="sw-slipnote" data-no-i18n>${esc(S.slip)}% · ${esc(S.dl)}m</span><button type="button" class="sw-ib" data-sw="settings" aria-expanded="${S.showSet}" aria-label="${T("Swap settings")}">${svg("gear")}</button></div>
            ${S.showSet ? `<div class="sw-set">
              <span>${T("Slippage limit")}</span>
              <div class="sw-seg" role="radiogroup" aria-label="${T("Slippage limit")}">${SLIPS.map((v) => `<button type="button" role="radio" aria-checked="${S.slip === v}" data-sw-slip="${v}" data-no-i18n>${v}%</button>`).join("")}<input id="sw-slip" inputmode="decimal" aria-label="${T("Custom slippage %")}" placeholder="${T("Custom")}" value="${SLIPS.includes(S.slip) ? "" : esc(S.slip)}"></div>
              <small>${T("The swap reverts if you'd receive less than the quote minus this.")}${S.slip < 0.5 ? " " + T("Below 0.5% a busy pool can make the swap fail.") : S.slip > 5 ? " " + T("Above 5% you may receive much less than quoted.") : ""}</small>
              <label class="sw-dl"><span>${T("Deadline")}</span><input id="sw-dl" inputmode="numeric" value="${esc(S.dl)}" aria-label="${T("Deadline in minutes")}"><em>${T("minutes")}</em></label>
            </div>` : ""}
            <div class="sw-box">
              <div class="sw-box-h"><label for="sw-amt">${T("You pay")}</label>${bin != null && mi ? `<span class="sw-bal">${T("Balance")} <b data-no-i18n>${esc(fmtRaw(bin, mi.decimals))}</b><button type="button" data-sw="half">50%</button><button type="button" data-sw="max">${T("Max")}</button></span>` : ""}</div>
              <div class="sw-box-r"><input id="sw-amt" class="sw-amt" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" value="${esc(S.amt)}" aria-label="${T("Amount to pay")}">${tokBtn("in")}</div>
              <div class="sw-box-f" data-no-i18n>${uin != null ? "≈ " + esc(usd(uin)) : "&nbsp;"}</div>
            </div>
            <button type="button" class="sw-flip" data-sw="flip" aria-label="${T("Switch the two tokens")}">${svg("flip")}</button>
            <div class="sw-box out">
              <div class="sw-box-h"><span>${T("You receive")}</span>${bout != null && mo ? `<span class="sw-bal">${T("Balance")} <b data-no-i18n>${esc(fmtRaw(bout, mo.decimals))}</b></span>` : ""}</div>
              <div class="sw-box-r"><output class="sw-amt${S.quoting ? " ld" : ""}" aria-live="polite" data-no-i18n>${q && mo ? esc(fmtRaw(q.out, mo.decimals)) : S.quoting ? "…" : "0"}</output>${tokBtn("out")}</div>
              <div class="sw-box-f" data-no-i18n>${uout != null ? "≈ " + esc(usd(uout)) + (uin ? ` <span class="${impCls}">(${uout >= uin ? "+" : "−"}${Math.abs(((uout - uin) / uin) * 100).toFixed(2)}%)</span>` : "") : "&nbsp;"}</div>
            </div>
            ${q ? `<div class="sw-det">
              ${routeHtml(q)}
              <dl>
                <div><dt>${T("Rate")}</dt><dd data-no-i18n>1 ${esc(mi.symbol)} = ${esc(fmt(rate))} ${esc(mo.symbol)}</dd></div>
                <div><dt>${T("Minimum received")}</dt><dd data-no-i18n>${esc(fmtRaw(minOut, mo.decimals))} ${esc(mo.symbol)}</dd></div>
                <div><dt>${T("Price impact")}</dt><dd class="${impCls}" data-no-i18n>${imp == null ? "—" : imp < 0.01 ? "<0.01%" : imp.toFixed(2) + "%"}</dd></div>
                <div><dt>${T("Fee")}</dt><dd>${feeLine(q)}</dd></div>
                <div><dt>${T("Network fee")}</dt><dd data-no-i18n>${gas == null ? "—" : "≈ " + esc(usd(gas))}</dd></div>
                <div><dt>${T("Pools")}</dt><dd data-no-i18n>${esc(q.path.map((h) => h.venue).join(" · "))}</dd></div>
              </dl>
              ${S.routes.length > 1 ? `<button type="button" class="sw-more" data-sw="routes" aria-expanded="${S.showRoutes}">${L3(`Best of ${S.routes.length} routes`, `경로 ${S.routes.length}개 중 최선`, `${S.routes.length} 条路线中最优`)}${svg("down", "sw-i sm")}</button>` : ""}
              ${S.showRoutes ? `<ol class="sw-alts">${S.routes.map((r, i) => `<li${i === 0 ? ' class="on"' : ""}><span data-no-i18n>${esc(tokensOf(r.path).map(symOf).join(" → "))}</span><b data-no-i18n>${esc(fmtRaw(r.q.out, mo.decimals))}</b></li>`).join("")}</ol>` : ""}
            </div>` : S.qerr ? `<p class="sw-err" role="alert">${esc(S.qerr)}</p>` : ""}
            ${imp != null && imp > 5 ? `<p class="sw-warn ${impCls}">${imp > 15 ? T("This trade moves the price a lot — you'd get much less than the market price. Try a smaller amount.") : T("This trade moves the price noticeably.")}</p>` : ""}
            <button type="button" class="sw-cta${c.warn ? " warn" : ""}" data-sw="${esc(c.act || "")}" ${c.off ? "disabled" : ""}>${esc(c.t)}</button>
            ${S.msg ? `<p class="sw-msg ${esc(S.msg.k)}" role="status">${S.msg.html || esc(S.msg.t)}</p>` : ""}
          </div>
          <div class="sw-quick">
            <span>${T("Buy with $ARCIRCLE")}</span>
            <div>${quickCoins().map((m) => `<button type="button" data-sw-buy="${esc(m.address)}">${logoHtml(m, "sw-logo sm")}<b data-no-i18n>${esc(m.symbol)}</b></button>`).join("") || `<small>${T("ArcPad coins show here once they load.")}</small>`}</div>
          </div>`;
    $("sw-burnhost").innerHTML = `<section class="sw-burn">
            <h3>${T("Swap's burn")}</h3>
            ${S.stats ? `<div class="sw-burn-n"><b data-no-i18n>${esc(fmtRaw(S.stats.arcBurned || 0n, 18))}</b><span>${T("$ARCIRCLE burned straight from swap fees")}</span></div>
              <div class="sw-burn-r"><div><b data-no-i18n>${esc(S.stats.swaps.toLocaleString("en-US"))}</b><span>${T("swaps")}</span></div><div><b data-no-i18n>${esc(usd(human(S.stats.usdcToBurn || 0n, 6)))}</b><span>${T("USDC fees sent to the hourly burn")}</span></div></div>`
              : `<p class="sw-burn-pre">${T("Counts every $ARCIRCLE burned by swap fees once Swap is live.")}</p>`}
            <ul class="sw-burn-how">
              <li>${svg("flame", "sw-fl")}<span>${T("Pay or receive $ARCIRCLE: the fee is $ARCIRCLE, and half of it burns in the same transaction.")}</span></li>
              <li>${svg("flame", "sw-fl")}<span>${T("Through USDC: the fee is USDC; half buys $ARCIRCLE and burns it within the hour.")}</span></li>
              <li><i class="sw-dot"></i><span>${T("The other half goes to the ARCIRCLE PAD treasury. Holders of 100,000+ $ARCIRCLE swap fee-free.")}</span></li>
            </ul>
          </section>`;
    $("sw-pkhost").innerHTML = S.pick ? pickerHtml() : "";
    $("sw-rvhost").innerHTML = S.rv ? reviewHtml() : "";
    if (keep) { const i = $("sw-amt"); if (i) { i.focus(); try { i.setSelectionRange(keep[0], keep[1]); } catch { /* number input */ } } }
    if (S.pick && S.pickFocus) { const i = $("sw-q"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } S.pickFocus = false; }
    if (S.rv && S.rvFocus) { const b = host.querySelector(".sw-rv button[data-sw-rv='go'], .sw-rv button[data-sw-rv]"); if (b) b.focus(); S.rvFocus = false; }
  }
  function quickCoins() {
    return launches().filter((l) => isAddr(l.token) && l.symbol).slice().sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0)).slice(0, 6)
      .map((l) => { const t = lc(l.token); if (!META.has(t)) META.set(t, { address: t, symbol: l.symbol, name: l.name || "", decimals: 18, logo: okImg(l.imageUrl) ? l.imageUrl : null }); return META.get(t); });
  }

  // ---------------- the network strip and the ticker ----------------
  async function loadNet() {
    try {
      const p = rp();
      const [b, fd] = await Promise.all([p.getBlockNumber(), p.getFeeData().catch(() => null)]);
      S.net = { block: b, gasPrice: fd && (fd.gasPrice || fd.maxFeePerGas) ? (fd.gasPrice || fd.maxFeePerGas) : null, at: Date.now() };
    } catch { S.net = S.net ? { ...S.net, stale: true } : { err: true }; }
    paintNet();
  }
  function paintNet() {
    const el = $("sw-net");
    if (!el) return;
    const n = S.net;
    const swapGas = n && n.gasPrice ? (Number(n.gasPrice) * 380000) / 1e18 : null;
    el.innerHTML = !n ? "" : n.err ? `<span class="sw-net-dot bad"></span>${T("Arc isn't answering")}`
      : `<span class="sw-net-dot${n.stale ? " warn" : ""}"></span><b>Arc</b><span data-no-i18n>#${esc(n.block.toLocaleString("en-US"))}</span>${swapGas != null ? `<span class="sw-net-gas" title="${T("A typical two-pool swap, paid in USDC")}">${svg("gas", "sw-i sm")}<span data-no-i18n>≈ ${esc(usd(swapGas))}</span></span>` : ""}`;
    const w = $("sw-netwarn");
    const cid = typeof state !== "undefined" && state && state.chainId ? Number(state.chainId) : null;
    const want = Number(CFG().CHAIN_ID_DECIMAL || 5042);
    if (w) w.innerHTML = me() && cid && cid !== want ? `<div class="sw-netwarn" role="alert"><span>${L3(`Your wallet is on another network. Swaps run on Arc (chain ${want}).`, `지갑이 다른 네트워크에 있습니다. 스왑은 Arc(체인 ${want})에서 실행됩니다.`, `你的钱包在其他网络上。兑换在 Arc（链 ${want}）上进行。`)}</span><button type="button" data-sw="switchnet">${T("Switch to Arc")}</button></div>` : "";
  }
  async function loadTop() {
    if (S.top && Date.now() - S.top.at < 120000) return S.top;
    const j = await fetch("/api/social?liqtop=arc").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (j && (j.trending || j.established)) {
      const seen = new Set(), pools = [];
      for (const x of [...(j.established || []), ...(j.trending || [])]) { if (x && x.id && !seen.has(x.id)) { seen.add(x.id); pools.push(x); } }
      S.top = { at: Date.now(), pools };
      for (const p of pools) {
        const b = p.base || {};
        if (isAddr(b.address) && p.price > 0) S.usd[lc(b.address)] = S.usd[lc(b.address)] || p.price;
        if (isAddr(b.address) && b.symbol && !META.has(lc(b.address))) META.set(lc(b.address), { address: lc(b.address), symbol: String(b.symbol).slice(0, 16), name: "", decimals: null, logo: null });
      }
    }
    return S.top;
  }
  function paintTicker() {
    const el = $("sw-ticker");
    if (!el) return;
    const rows = [];
    const seen = new Set();
    const arcRow = S.top && S.top.pools.find((p) => p.base && lc(p.base.address) === ARCIRCLE());
    rows.push({ t: ARCIRCLE(), sym: "ARCIRCLE", price: S.usd[ARCIRCLE()] || (arcRow && arcRow.price), ch: arcRow ? arcRow.change : null });
    seen.add(ARCIRCLE()); seen.add(USDC());
    for (const p of (S.top && S.top.pools) || []) {
      const b = p.base || {}, t = lc(b.address);
      if (!isAddr(t) || seen.has(t) || !(p.price > 0)) continue;
      seen.add(t); rows.push({ t, sym: b.symbol, price: p.price, ch: p.change });
      if (rows.length >= 10) break;
    }
    el.innerHTML = rows.filter((r) => r.price > 0).map((r) => `<button type="button" class="sw-tk" data-sw-buy="${esc(r.t)}" title="${esc(L3(`Buy ${r.sym} with $ARCIRCLE`, `$ARCIRCLE로 ${r.sym} 사기`, `用 $ARCIRCLE 买 ${r.sym}`))}"><b data-no-i18n>${esc(r.sym)}</b><span data-no-i18n>$${esc(fmt(r.price))}</span>${r.ch != null && isFinite(r.ch) ? `<em class="${r.ch >= 0 ? "up" : "dn"}" data-no-i18n>${r.ch >= 0 ? "+" : "−"}${Math.abs(r.ch).toFixed(2)}%</em>` : ""}</button>`).join("");
  }

  // ---------------- the chart and the latest trades ----------------
  const poolIdOf = (k) => lc(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks])));
  /// whose price the chart follows: the coin of the pair (not USDC, $ARCIRCLE only when the other side is USDC)
  function chartToken() {
    const a = lc(S.tout), b = lc(S.tin);
    for (const t of [a, b]) if (isAddr(t) && t !== USDC() && t !== ARCIRCLE()) return t;
    return ARCIRCLE();
  }
  async function loadChart(force) {
    const t = chartToken();
    if (!force && S.ch && S.ch.token === t && S.ch.tf === S.tf && Date.now() - S.ch.at < (S.ch.err ? 8000 : 30000)) return;
    const keep = S.ch && S.ch.token === t ? S.ch : null;
    S.ch = { token: t, tf: S.tf, at: Date.now(), list: keep && keep.tf === S.tf ? keep.list : null, loading: true, pool: keep && keep.pool, venue: keep && keep.venue };
    paintChart();
    try {
      await meta(t).catch(() => null);
      const ps = await poolsOf(t);
      const best = ps.slice().sort((x, y) => y.liq - x.liq)[0];
      if (!best) throw new Error(tr("No pool to chart for this token yet."));
      const pid = poolIdOf(best.key);
      const j = await fetch(`/api/social?swapohlc=${pid}&token=${t}&tf=${S.tf}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!S.ch || S.ch.token !== t || S.ch.tf !== S.tf) return;
      S.ch = { ...S.ch, pool: pid, venue: best.venue, list: j && Array.isArray(j.candles) ? j.candles : [], loading: false, err: j ? null : tr("The chart data didn't load. It retries in a moment.") };
      if (S.ch.list.length) S.usd[t] = S.usd[t] || S.ch.list[S.ch.list.length - 1][4];
    } catch (e) { if (S.ch && S.ch.token === t) S.ch = { ...S.ch, loading: false, list: [], err: String((e && e.message) || e) }; }
    paintChart();
    loadTrades();
  }
  const TFS = [["15m", "15m"], ["1h", "1H"], ["4h", "4H"], ["1d", "1D"]];
  function paintChart() {
    const el = $("sw-chart");
    if (!el || S.view !== "swap") return;
    const c = S.ch, m = c ? META.get(c.token) || { symbol: short(c.token) } : null;
    const list = (c && c.list) || [];
    const last = list.length ? list[list.length - 1] : null;
    // the change over the last day of candles (or the whole window if it's shorter)
    const dayAgo = last ? last[0] - 86400 : 0;
    const ref = list.find((r) => r[0] >= dayAgo) || list[0];
    const ch = last && ref && ref[1] > 0 ? ((last[4] - ref[1]) / ref[1]) * 100 : null;
    const W = Math.max(280, Math.round(el.clientWidth || 640) - 2), H = W < 520 ? 220 : 300;
    el.innerHTML = `<div class="sw-ch-h">
        ${m ? logoHtml(m) : ""}<div class="sw-ch-t"><b data-no-i18n>${esc(m ? m.symbol : "—")} / USD</b><small data-no-i18n>${esc(c && c.venue ? c.venue : "")}${c && c.pool ? ` · <a href="https://www.geckoterminal.com/arc/pools/${esc(c.pool)}" target="_blank" rel="noopener">GeckoTerminal</a>` : ""}</small></div>
        <div class="sw-ch-p">${last ? `<strong data-no-i18n>$${esc(fmt(last[4]))}</strong>` : ""}${ch != null ? `<em class="${ch >= 0 ? "up" : "dn"}" data-no-i18n>${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(2)}%</em>` : ""}</div>
        <div class="sw-ch-tf" role="radiogroup" aria-label="${T("Timeframe")}">${TFS.map(([k, l]) => `<button type="button" role="radio" aria-checked="${S.tf === k}" data-sw-tf="${k}" data-no-i18n>${l}</button>`).join("")}</div>
      </div>
      <div class="sw-ch-body" style="height:${H}px">${list.length > 1 ? chartSvg(list, W, H) : `<div class="sw-ch-empty">${c && c.loading ? `<span class="sw-spin"></span>${T("Loading the chart…")}` : esc((c && c.err) || tr("No trades to chart for this pool yet."))}</div>`}</div>`;
    if (list.length > 1) wireChart(el, list, W, H);
  }
  function chartSvg(list, W, H) {
    const padR = 64, padB = 22, volH = Math.round(H * 0.18), plotH = H - padB - volH - 6, plotW = W - padR;
    const lo = Math.min(...list.map((r) => r[3])), hi = Math.max(...list.map((r) => r[2]));
    const span = hi - lo || hi * 0.02 || 1, top = hi + span * 0.06, bot = Math.max(0, lo - span * 0.06);
    const y = (v) => ((top - v) / (top - bot)) * plotH;
    const n = list.length, step = plotW / n, bw = Math.max(1, Math.min(9, step * 0.62));
    const vmax = Math.max(...list.map((r) => r[5])) || 1;
    let candles = "", vols = "";
    list.forEach((r, i) => {
      const x = i * step + step / 2, up = r[4] >= r[1], cls = up ? "up" : "dn";
      const yo = y(r[1]), yc = y(r[4]), yt = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
      candles += `<path class="sw-c-w ${cls}" d="M${x.toFixed(1)} ${y(r[2]).toFixed(1)}V${y(r[3]).toFixed(1)}"/><rect class="sw-c-b ${cls}" x="${(x - bw / 2).toFixed(1)}" y="${yt.toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="1"/>`;
      const vh = (r[5] / vmax) * volH;
      vols += `<rect class="sw-c-v ${cls}" x="${(x - bw / 2).toFixed(1)}" y="${(H - padB - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, vh).toFixed(1)}"/>`;
    });
    // four price lines on the right, four times along the bottom
    let grid = "";
    for (let k = 0; k <= 3; k++) {
      const v = bot + ((top - bot) * k) / 3, yy = y(v);
      grid += `<path class="sw-c-g" d="M0 ${yy.toFixed(1)}H${plotW}"/><text class="sw-c-ax" x="${plotW + 6}" y="${(yy + 4).toFixed(1)}">$${esc(fmt(v))}</text>`;
    }
    const day = S.tf === "1d", t0 = (s) => { const d = new Date(s * 1000); return day ? `${d.getMonth() + 1}/${d.getDate()}` : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    for (let k = 0; k < 4; k++) { const i = Math.min(n - 1, Math.round(((n - 1) * (k + 0.5)) / 4)); grid += `<text class="sw-c-ax" x="${(i * step + step / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(t0(list[i][0]))}</text>`; }
    const last = list[n - 1], yl = y(last[4]);
    const lastLine = `<path class="sw-c-last ${last[4] >= last[1] ? "up" : "dn"}" d="M0 ${yl.toFixed(1)}H${plotW}"/><rect class="sw-c-tag ${last[4] >= last[1] ? "up" : "dn"}" x="${plotW + 2}" y="${(yl - 9).toFixed(1)}" width="${padR - 4}" height="18" rx="4"/><text class="sw-c-tagt" x="${plotW + 6}" y="${(yl + 4).toFixed(1)}">$${esc(fmt(last[4]))}</text>`;
    return `<svg class="sw-c" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${T("Price chart")}">${grid}${vols}${candles}${lastLine}<path class="sw-c-x" d="" /><rect class="sw-c-hit" x="0" y="0" width="${plotW}" height="${H - padB}" fill="transparent"/></svg><div class="sw-c-tip" hidden></div>`;
  }
  function wireChart(el, list, W, H) {
    const svgEl = el.querySelector(".sw-c"), hit = el.querySelector(".sw-c-hit"), tip = el.querySelector(".sw-c-tip"), xh = el.querySelector(".sw-c-x");
    if (!svgEl || !hit) return;
    const plotW = W - 64, step = plotW / list.length;
    const at = (ev) => { const r = svgEl.getBoundingClientRect(); const x = ((ev.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(list.length - 1, Math.floor(x / step))); };
    const show = (ev) => {
      const i = at(ev), r = list[i], x = i * step + step / 2;
      xh.setAttribute("d", `M${x.toFixed(1)} 0V${H - 22}`);
      const d = new Date(r[0] * 1000);
      tip.hidden = false;
      tip.innerHTML = `<b data-no-i18n>${esc(d.toLocaleString(lang() === "ko" ? "ko-KR" : lang() === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))}</b><span data-no-i18n>O $${esc(fmt(r[1]))} · H $${esc(fmt(r[2]))}</span><span data-no-i18n>L $${esc(fmt(r[3]))} · C $${esc(fmt(r[4]))}</span><span data-no-i18n>${T("Volume")} ${esc(usd(r[5]))}</span>`;
      const left = (x / W) * 100;
      tip.style.left = left > 60 ? "auto" : `calc(${left}% + 12px)`;
      tip.style.right = left > 60 ? `calc(${100 - left}% + 12px)` : "auto";
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("d", ""); });
  }
  async function loadTrades() {
    const c = S.ch;
    if (!c || !c.pool) { S.trd = null; paintTrades(); return; }
    const pid = c.pool;
    const j = await fetch(`/api/social?swaptrades=${pid}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!S.ch || S.ch.pool !== pid) return;
    S.trd = { pool: pid, token: c.token, list: j && Array.isArray(j.trades) ? j.trades : null, at: Date.now() };
    paintTrades();
  }
  function paintTrades() {
    const el = $("sw-trades");
    if (!el || S.view !== "swap") return;
    const d = S.trd, m = S.ch ? META.get(S.ch.token) || {} : {};
    const ago = (t) => { const s = Math.max(0, Math.floor(Date.now() / 1000) - t); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
    const rows = d && d.list ? d.list.slice(0, 20).map((x) => {
      const tok = x.kind === "buy" ? x.to : x.from;
      return `<tr><td data-no-i18n>${esc(ago(x.t))}</td><td class="${x.kind === "buy" ? "up" : "dn"}">${T(x.kind === "buy" ? "Buy" : "Sell")}</td><td data-no-i18n>$${esc(fmt(x.priceUsd))}</td><td data-no-i18n>${esc(fmt(tok.amount))}</td><td data-no-i18n>${esc(usd(x.usd))}</td><td><a href="${esc(EXPL())}/tx/${esc(x.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(x.wallet))}${svg("ext", "sw-i sm")}</a></td></tr>`;
    }).join("") : "";
    el.innerHTML = `<div class="sw-tr-h"><h3>${T("Latest trades")}</h3><small data-no-i18n>${esc(m.symbol || "")}</small></div>
      ${!d ? `<p class="sw-tr-none">${T("Loading trades…")}</p>` : !d.list ? `<p class="sw-tr-none">${T("Trades didn't load. They retry in a moment.")}</p>` : !d.list.length ? `<p class="sw-tr-none">${T("No trades in this pool yet.")}</p>`
        : `<div class="sw-tr-scroll"><table class="sw-tr"><thead><tr><th>${T("Time")}</th><th>${T("Side")}</th><th>${T("Price")}</th><th data-no-i18n>${esc(m.symbol || "")}</th><th>${T("Value")}</th><th>${T("Wallet")}</th></tr></thead><tbody>${rows}</tbody></table></div>`}`;
  }

  // ---------------- the token picker ----------------
  /// balances of the tokens the picker lists (one read each, kept 30 s)
  async function loadPickBal(rows) {
    const a = me();
    if (!a || Date.now() - S.pbalAt < 30000) return;
    S.pbalAt = Date.now();
    const ts = [...new Set(rows.map((r) => r.m.address))].slice(0, 60);
    const res = await Promise.all(ts.map((t) => new ethers.Contract(t, ERC20, rp()).balanceOf(a).catch(() => null)));
    ts.forEach((t, i) => { if (res[i] != null) S.pbal[t] = res[i]; });
    // decimals for the ones that hold something and aren't known yet
    await Promise.all(ts.filter((t) => S.pbal[t] > 0n && (!META.get(t) || META.get(t).decimals == null)).map((t) => meta(t).catch(() => null)));
    if (S.pick) paint();
  }
  function pickerRows() {
    const q = S.q.trim().toLowerCase().replace(/^\$/, "");
    const rows = [];
    const add = (m, sub, grp) => { if (m && !rows.some((r) => r.m.address === m.address)) rows.push({ m, sub, grp }); };
    add(META.get(ARCIRCLE()), usd(usdOf(ARCIRCLE())), "pin");
    add(META.get(USDC()), "$1.00", "pin");
    for (const t of S.favs) if (META.has(t)) add(META.get(t), "", "fav");
    for (const t of lsGet(LS.recent, [])) if (META.has(t)) add(META.get(t), "", "recent");
    for (const l of launches().slice().sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0)).slice(0, 40)) {
      const t = lc(l.token);
      if (!META.has(t)) META.set(t, { address: t, symbol: l.symbol, name: l.name || "", decimals: 18, logo: okImg(l.imageUrl) ? l.imageUrl : null });
      add(META.get(t), l.marketCapUsd ? `${tr("MCap")} ${usdK(l.marketCapUsd)}` : "", "arcpad");
    }
    for (const x of S.trending) add(META.get(lc(x.t)), x.liqUsd ? `${tr("Liquidity")} ${usdK(x.liqUsd)}` : "", "trend");
    for (const p of (S.top && S.top.pools) || []) { const b = p.base || {}; if (isAddr(b.address)) add(META.get(lc(b.address)), p.liqUsd ? `${tr("Liquidity")} ${usdK(p.liqUsd)}` : "", "trend"); }
    const hit = (r) => !q || lc(r.m.symbol).includes(q) || lc(r.m.name).includes(q) || r.m.address.startsWith(q);
    return rows.filter(hit);
  }
  function balOf(m) {
    const b = S.pbal[m.address];
    if (b == null || b === 0n || m.decimals == null) return null;
    const n = human(b, m.decimals), p = usdOf(m.address);
    return { n, usd: p ? n * p : null };
  }
  function pickerHtml() {
    const rows0 = pickerRows();
    const q = S.q.trim();
    // each token shows once, in the first group it fits: favourites, then what the wallet holds (by value), then the rest
    const isFav = (r) => r.grp !== "pin" && S.favs.includes(r.m.address);
    const isHeld = (r) => r.grp !== "pin" && !isFav(r) && balOf(r.m);
    const rows = rows0.map((r) => (isFav(r) ? { ...r, grp: "fav" } : isHeld(r) ? { ...r, grp: "held" } : r));
    const groups = [["pin", ""], ["fav", tr("Favorites")], ["held", tr("Your tokens")], ["recent", tr("Recent")], ["arcpad", tr("ArcPad coins")], ["trend", tr("Trending on Arc")]];
    const other = S.pick === "in" ? S.tout : S.pick === "out" ? S.tin : null;
    const row = (r) => {
      const b = balOf(r.m), fav = S.favs.includes(r.m.address);
      return `<div class="sw-pk-row"><button type="button" class="sw-pk-r${other && lc(r.m.address) === lc(other) ? " dim" : ""}" data-sw-tok="${esc(r.m.address)}">${logoHtml(r.m)}<span><b data-no-i18n>${esc(r.m.symbol)}</b><small data-no-i18n>${esc(r.m.name || short(r.m.address))}</small></span><em data-no-i18n>${b ? `<b>${esc(fmt(b.n))}</b>${b.usd != null ? `<i>${esc(usd(b.usd))}</i>` : ""}` : esc(r.sub || "")}</em></button><button type="button" class="sw-pk-fav${fav ? " on" : ""}" data-sw-fav="${esc(r.m.address)}" aria-pressed="${fav}" aria-label="${T(fav ? "Remove from favorites" : "Add to favorites")}">${svg("star", "sw-i sm")}</button></div>`;
    };
    const body = groups.map(([g, label]) => {
      let rs = rows.filter((r) => r.grp === g);
      if (g === "held") rs = rs.sort((a, b2) => ((balOf(b2.m).usd || 0) - (balOf(a.m).usd || 0)));
      if (!rs.length) return "";
      return g === "pin" && !q ? `<div class="sw-pk-pins">${rs.map((r) => { const b = balOf(r.m); return `<button type="button" data-sw-tok="${esc(r.m.address)}">${logoHtml(r.m, "sw-logo sm")}<b data-no-i18n>${esc(r.m.symbol)}</b>${b ? `<small data-no-i18n>${esc(fmt(b.n))}</small>` : ""}</button>`; }).join("")}</div>`
        : `${label ? `<h4>${esc(label)}</h4>` : ""}${rs.map(row).join("")}`;
    }).join("");
    const addr = isAddr(q) && !rows.some((r) => r.m.address === lc(q)) ? `<button type="button" class="sw-pk-r" data-sw-tok="${esc(lc(q))}"><span class="sw-logo sw-logo-l">?</span><span><b>${T("Use this address")}</b><small data-no-i18n>${esc(lc(q))}</small></span></button>` : "";
    const title = S.pick === "in" ? "Pay with" : S.pick === "send" ? "Token to send" : "Receive";
    return `<div class="sw-pk" role="dialog" aria-modal="true" aria-label="${T("Select a token")}">
      <div class="sw-pk-scrim" data-sw="pick-close"></div>
      <div class="sw-pk-card">
        <div class="sw-pk-h"><h3>${T(title)}</h3><button type="button" class="sw-ib" data-sw="pick-close" aria-label="${T("Close")}">${svg("x")}</button></div>
        <label class="sw-pk-q">${svg("search")}<input id="sw-q" type="search" autocomplete="off" spellcheck="false" placeholder="${T("Search a symbol or paste an address")}" value="${esc(S.q)}" aria-label="${T("Search tokens")}"></label>
        <div class="sw-pk-list">${addr}${body || (addr ? "" : `<p class="sw-pk-none">${T("No token matches that. Paste its contract address (0x…).")}</p>`)}</div>
      </div>
    </div>`;
  }
  const pickHooks = {}; // side → fn(token) for pickers opened by other views (Send)
  async function choose(t) {
    t = lc(t);
    const side = S.pick;
    S.pick = null; S.q = "";
    try { await meta(t); } catch (e) { S.msg = { k: "bad", t: String((e && e.message) || e) }; paint(); return; }
    if (t !== USDC() && t !== ARCIRCLE()) lsSet(LS.recent, [t, ...lsGet(LS.recent, []).filter((x) => x !== t)].slice(0, 6));
    if (pickHooks[side]) { paint(); pickHooks[side](t); return; }
    if (side === "in") { if (t === lc(S.tout)) S.tout = S.tin; S.tin = t; } else { if (t === lc(S.tin)) S.tin = S.tout; S.tout = t; }
    afterPair();
  }
  function openPicker(side) {
    S.pick = side; S.q = ""; S.pickFocus = true; paint();
    const after = () => { if (S.pick) { paint(); loadPickBal(pickerRows()); } };
    loadPickBal(pickerRows());
    if (!S.trending.length || !launches().length) loadLists().then(after);
    if (!S.top) loadTop().then(after);
  }
  function afterPair() {
    S.quote = null; S.routes = []; S.msg = null; S.done = null; S.allow = null;
    lsSet(LS.pair, { in: S.tin, out: S.tout });
    setHash();
    paint();
    Promise.all([loadBal(), ...(isAddr(S.tout) ? [meta(S.tout).catch(() => null)] : [])]).then(paint);
    requote(0);
    loadChart();
  }
  function setHash() {
    if (!history.replaceState || !panel.classList.contains("active")) return;
    const q = S.view !== "swap" ? `v=${S.view}` : [`in=${S.tin}`, isAddr(S.tout) ? `out=${S.tout}` : ""].filter(Boolean).join("&");
    history.replaceState(null, "", `${location.pathname}${location.search}#swap?${q}`);
  }

  // ---------------- review and swap ----------------
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const ERRS = [
    [/ACTION_REJECTED|user rejected|denied|4001/i, "Cancelled in your wallet."],
    [/Slippage/, "The price moved past your slippage limit — nothing was swapped. Try again, or raise the limit."],
    [/Expired/, "The swap took too long to confirm. Try again."],
    [/TaxedToken/, "This token taxes its own transfers, which Swap doesn't support — nothing was swapped."],
    [/insufficient funds|exceeds balance|transfer amount exceeds/i, "Not enough balance for this (keep a little USDC for gas)."],
    [/allowance/i, "The approval doesn't cover this amount. Approve again."],
    [/network|fetch|timeout|ECONN|502|503/i, "The network didn't answer. Check your connection and try again."],
    [/nonce|replacement|underpriced/i, "Your wallet has a transaction waiting. Let it finish, then try again."],
  ];
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const hex = errData(e);
    if (hex && hex.length >= 10) { try { const d = SW_I.parseError(hex); if (d) { for (const [re, what] of ERRS) if (re.test(d.name)) return tr(what); return d.name; } } catch { /* not ours */ } }
    const m = String((e && (e.shortMessage || e.reason || e.message)) || tr("That didn't go through."));
    for (const [re, what] of ERRS) if (re.test(m)) return tr(what);
    return m.slice(0, 180);
  };
  function openReview() {
    const mi = META.get(lc(S.tin)), amount = units(S.amt, mi.decimals);
    if (!amount || !S.quote) return;
    S.rv = { step: "review", q: S.quote, amount, approve: needApprove(amount), a: null, s: null, err: null };
    S.rvFocus = true;
    paint();
  }
  function stepHtml(n, label, st) {
    const ico = st === "ok" ? svg("check", "sw-i") : st === "wallet" || st === "pending" ? `<span class="sw-spin"></span>` : st === "bad" ? svg("x", "sw-i") : `<i data-no-i18n>${n}</i>`;
    const sub = st === "wallet" ? tr("Confirm in your wallet…") : st === "pending" ? tr("Waiting for Arc…") : st === "ok" ? tr("Done") : "";
    return `<li class="sw-rv-step ${esc(st || "")}"><span class="sw-rv-ico">${ico}</span><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span></li>`;
  }
  function reviewHtml() {
    const r = S.rv, q = r.q, mi = META.get(lc(S.tin)), mo = META.get(lc(S.tout));
    if (!mi || !mo) return "";
    const minOut = (q.out * BigInt(Math.round((100 - S.slip) * 100))) / 10000n;
    const uin = usdAmt(S.tin, r.amount), uout = usdAmt(S.tout, q.out), gas = gasUsd(q, r.approve);
    const imp = q.impact, impCls = imp == null ? "" : imp > 15 ? "bad" : imp > 5 ? "warn" : "";
    const running = r.step === "run";
    let foot = "";
    if (r.step === "review" || r.step === "err") foot = `${r.approve ? `<label class="sw-unl"><input type="checkbox" id="sw-unl" ${S.unlimited ? "checked" : ""}> ${T("Approve unlimited (skip this step next time)")}</label>` : ""}${r.err ? `<p class="sw-msg bad" role="alert">${esc(r.err)}</p>` : ""}<button type="button" class="sw-cta" data-sw-rv="go">${T(r.err ? "Try again" : r.approve ? "Approve and swap" : "Confirm swap")}</button>`;
    else if (r.step === "moved") foot = `<p class="sw-msg bad" role="alert">${L3(`The price moved past your slippage limit since the quote: you'd now get ${fmtRaw(r.fresh.out, mo.decimals)} ${mo.symbol}.`, `견적 이후 가격이 슬리피지 한도를 넘어 움직였습니다: 이제 ${fmtRaw(r.fresh.out, mo.decimals)} ${mo.symbol}를 받습니다.`, `报价后价格已超出滑点上限：现在会收到 ${fmtRaw(r.fresh.out, mo.decimals)} ${mo.symbol}。`)}</p><button type="button" class="sw-cta" data-sw-rv="accept">${T("Accept the new price")}</button>`;
    else if (r.step === "done") foot = `<div class="sw-rv-done">${svg("check", "sw-i")}<div><b>${L3("Swap complete", "스왑 완료", "兑换完成")}</b><span data-no-i18n>${esc(fmtRaw(r.amount, mi.decimals))} ${esc(mi.symbol)} → ${esc(fmtRaw(r.got, mo.decimals))} ${esc(mo.symbol)}</span>${r.burned > 0n ? `<span class="sw-rv-burn">${svg("flame", "sw-fl")}<span data-no-i18n>${esc(fmtRaw(r.burned, 18))}</span> $ARCIRCLE ${T("burned")}</span>` : ""}</div></div><div class="sw-rv-acts"><a class="sw-cta ghost" href="${esc(EXPL())}/tx/${esc(r.hash)}" target="_blank" rel="noopener">${T("View on ArcScan")}${svg("ext", "sw-i sm")}</a><button type="button" class="sw-cta" data-sw-rv="close">${T("Done")}</button></div>`;
    const steps = running || r.step === "done" || (r.step === "err" && (r.a || r.s)) ? `<ol class="sw-rv-steps">${r.approve ? stepHtml(1, `${tr("Approve")} ${mi.symbol}`, r.a) : ""}${stepHtml(r.approve ? 2 : 1, tr("Swap"), r.s)}</ol>` : "";
    return `<div class="sw-pk sw-rv" role="dialog" aria-modal="true" aria-labelledby="sw-rv-h">
      <div class="sw-pk-scrim" ${running ? "" : 'data-sw-rv="close"'}></div>
      <div class="sw-pk-card sw-rv-card">
        <div class="sw-pk-h"><h3 id="sw-rv-h">${T(r.step === "done" ? "Swapped" : "Review swap")}</h3>${running ? "" : `<button type="button" class="sw-ib" data-sw-rv="close" aria-label="${T("Close")}">${svg("x")}</button>`}</div>
        <div class="sw-rv-legs">
          <div class="sw-rv-leg"><small>${T("You pay")}</small><div><strong data-no-i18n>${esc(fmtRaw(r.amount, mi.decimals))}</strong>${logoHtml(mi)}<b data-no-i18n>${esc(mi.symbol)}</b></div><em data-no-i18n>${uin != null ? "≈ " + esc(usd(uin)) : ""}</em></div>
          <span class="sw-rv-arrow" aria-hidden="true">${svg("arrow", "sw-i")}</span>
          <div class="sw-rv-leg"><small>${T("You receive")}</small><div><strong data-no-i18n>${esc(fmtRaw(q.out, mo.decimals))}</strong>${logoHtml(mo)}<b data-no-i18n>${esc(mo.symbol)}</b></div><em data-no-i18n>${uout != null ? "≈ " + esc(usd(uout)) : ""}</em></div>
        </div>
        ${r.step === "done" ? "" : `<div class="sw-det">${routeHtml(q)}<dl>
          <div><dt>${T("Minimum received")}</dt><dd data-no-i18n>${esc(fmtRaw(minOut, mo.decimals))} ${esc(mo.symbol)}</dd></div>
          <div><dt>${T("Price impact")}</dt><dd class="${impCls}" data-no-i18n>${imp == null ? "—" : imp < 0.01 ? "<0.01%" : imp.toFixed(2) + "%"}</dd></div>
          <div><dt>${T("Fee")}</dt><dd>${feeLine(q)}</dd></div>
          <div><dt>${T("Network fee")}</dt><dd data-no-i18n>${gas == null ? "—" : "≈ " + esc(usd(gas))}</dd></div>
          <div><dt>${T("Slippage limit")}</dt><dd data-no-i18n>${esc(S.slip)}%</dd></div>
          <div><dt>${T("Deadline")}</dt><dd data-no-i18n>${esc(S.dl)} ${T("minutes")}</dd></div>
        </dl></div>`}
        ${steps}
        ${foot}
      </div>
    </div>`;
  }
  async function runSwap() {
    const r = S.rv;
    if (!r || r.step === "run") return;
    const mi = META.get(lc(S.tin)), mo = META.get(lc(S.tout));
    r.step = "run"; r.err = null; S.busy = true;
    if (r.approve && r.a !== "ok") r.a = "wallet";
    r.s = r.approve && r.a !== "ok" ? null : "wallet";
    paint();
    try {
      const s = await signer();
      if (r.approve && r.a !== "ok") {
        const tx = await new ethers.Contract(S.tin, ERC20, s).approve(ROUTER(), S.unlimited ? ethers.MaxUint256 : r.amount);
        r.a = "pending"; paint();
        await tx.wait();
        r.a = "ok"; await loadBal();
      }
      // a fresh quote right before sending: the slippage limit protects the price that was reviewed; if the price has
      // already moved past it, nothing is sent and the new price is shown to accept
      r.s = "wallet"; paint();
      const fresh = (await quoteRoute(r.q.path, r.amount)) || r.q;
      const keep = BigInt(Math.round((100 - S.slip) * 100));
      if (fresh.out * 10000n < r.q.out * keep) { r.fresh = fresh; r.step = "moved"; r.s = null; S.busy = false; paint(); return; }
      const minOut = ((fresh.out < r.q.out ? fresh.out : r.q.out) * keep) / 10000n;
      const deadline = Math.floor(Date.now() / 1000) + Math.max(1, Math.min(180, S.dl)) * 60;
      const tx = await new ethers.Contract(ROUTER(), SWAP_ABI, s).swap(r.q.path.map((h) => keyOf(h.key)), S.tin, r.amount, minOut, ZERO, deadline);
      r.s = "pending"; paint();
      const rc = await tx.wait();
      let got = fresh.out, fee = fresh.fee, feeTok = fresh.tokens[fresh.feeAt];
      for (const l of rc.logs || []) { try { const ev = SW_I.parseLog(l); if (ev && ev.name === "Swapped") { got = ev.args.amountOut; fee = ev.args.fee; feeTok = lc(ev.args.feeToken); } } catch { /* other logs */ } }
      Object.assign(r, { step: "done", s: "ok", got, hash: rc.hash, burned: feeTok === ARCIRCLE() && fee > 0n ? (fee * BigInt(S.burnBps)) / 10000n : 0n });
      S.amt = ""; S.quote = null; S.routes = [];
      S.msg = { k: "ok", html: `${L3("Swapped", "스왑 완료", "兑换完成")} <b data-no-i18n>${esc(fmtRaw(r.amount, mi.decimals))} ${esc(mi.symbol)}</b> → <b data-no-i18n>${esc(fmtRaw(got, mo.decimals))} ${esc(mo.symbol)}</b>${r.burned > 0n ? ` · ${svg("flame", "sw-fl")} <span data-no-i18n>${esc(fmtRaw(r.burned, 18))}</span> $ARCIRCLE ${T("burned")}` : ""} · <a href="${esc(EXPL())}/tx/${esc(rc.hash)}" target="_blank" rel="noopener">${T("View")}${svg("ext", "sw-i sm")}</a>` };
      document.dispatchEvent(new CustomEvent("arcswap:swapped", { detail: { hash: rc.hash } }));
      await Promise.all([loadBal(), loadStats()]);
      S.pbalAt = 0;
    } catch (e) {
      r.step = "err"; r.err = errText(e);
      if (r.a === "wallet" || r.a === "pending") r.a = "bad"; else if (r.s === "wallet" || r.s === "pending") r.s = "bad";
    }
    S.busy = false; paint();
  }
  function setMax(half) {
    const mi = META.get(lc(S.tin)), b = S.bal[lc(S.tin)];
    if (!mi || b == null) return;
    let v = half ? b / 2n : b;
    if (!half && lc(S.tin) === USDC()) v = v > GAS_KEEP ? v - GAS_KEEP : 0n;
    S.amt = v > 0n ? plain(v, mi.decimals) : "";
    paint(); requote(0);
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sw],[data-sw-slip],[data-sw-tok],[data-sw-buy],[data-sw-view],[data-sw-tf],[data-sw-fav],[data-sw-rv]");
    if (!b) return;
    if (b.dataset.swView) { setView(b.dataset.swView); return; }
    if (b.dataset.swRv) {
      const a = b.dataset.swRv;
      if (a === "close" && !(S.rv && S.rv.step === "run")) { S.rv = null; paint(); }
      else if (a === "go") runSwap();
      else if (a === "accept" && S.rv && S.rv.fresh) { S.quote = { ...S.rv.q, ...S.rv.fresh, at: Date.now() }; S.rv = { ...S.rv, q: S.quote, step: "review", fresh: null, approve: S.rv.approve && S.rv.a !== "ok" }; paint(); }
      return;
    }
    if (b.dataset.swTf) { S.tf = b.dataset.swTf; lsSet(LS.tf, S.tf); loadChart(true); return; }
    if (b.dataset.swFav) { const t = lc(b.dataset.swFav); S.favs = S.favs.includes(t) ? S.favs.filter((x) => x !== t) : [t, ...S.favs].slice(0, 30); lsSet(LS.favs, S.favs); paint(); return; }
    if (b.dataset.swSlip) { S.slip = Number(b.dataset.swSlip); lsSet(LS.slip, S.slip); paint(); return; }
    if (b.dataset.swTok) { choose(b.dataset.swTok); return; }
    if (b.dataset.swBuy) { if (lc(b.dataset.swBuy) === ARCIRCLE()) { S.tin = USDC(); S.tout = ARCIRCLE(); } else { S.tin = ARCIRCLE(); S.tout = lc(b.dataset.swBuy); } if (S.view !== "swap") setView("swap"); afterPair(); const i = $("sw-amt"); if (i && !S.amt) i.focus(); return; }
    const a = b.dataset.sw;
    if (S.busy && b.matches(".sw-cta")) return;
    if (a === "settings") { S.showSet = !S.showSet; paint(); }
    else if (a === "routes") { S.showRoutes = !S.showRoutes; paint(); }
    else if (a === "flip") { const t = S.tin; if (!isAddr(S.tout)) return; S.tin = S.tout; S.tout = t; if (S.quote && S.amt) { const mo = META.get(lc(S.tin)); S.amt = plain(S.quote.out, mo.decimals); } afterPair(); }
    else if (a === "pick-in" || a === "pick-out") openPicker(a.slice(5));
    else if (a === "pick-close") { S.pick = null; paint(); }
    else if (a === "max") setMax(false);
    else if (a === "half") setMax(true);
    else if (a === "connect") { if (typeof connectWallet === "function") Promise.resolve(connectWallet()).then(() => Promise.all([loadBal(), loadFeeInfo()])).then(() => { paint(); requote(0); }).catch(() => {}); }
    else if (a === "switchnet") { if (typeof ensureArcForWrite === "function") Promise.resolve(ensureArcForWrite()).then(paintNet).catch(() => {}); }
    else if (a === "impact") { S.impactOk = true; paint(); }
    else if (a === "review") openReview();
  });
  host.addEventListener("input", (e) => {
    if (e.target.id === "sw-amt") {
      const v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
      if (v !== e.target.value) e.target.value = v;
      S.amt = v; S.msg = null;
      if (!v) { S.quote = null; S.qerr = null; paint(); return; }
      requote();
    } else if (e.target.id === "sw-q") { S.q = e.target.value; S.pickFocus = true; paint(); }
    else if (e.target.id === "sw-slip") { const v = Number(e.target.value); if (v > 0 && v <= 50) { S.slip = v; lsSet(LS.slip, v); const n = host.querySelector(".sw-slipnote"); if (n) n.textContent = `${v}% · ${S.dl}m`; host.querySelectorAll("[data-sw-slip]").forEach((x) => x.setAttribute("aria-checked", "false")); } }
    else if (e.target.id === "sw-dl") { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 180) { S.dl = v; lsSet(LS.dl, v); const n = host.querySelector(".sw-slipnote"); if (n) n.textContent = `${S.slip}% · ${v}m`; } }
  });
  host.addEventListener("change", (e) => { if (e.target.id === "sw-unl") { S.unlimited = e.target.checked; lsSet(LS.inf, S.unlimited); } });
  // Escape closes the picker or the review wherever the focus is; Enter picks the first token
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !panel.classList.contains("active")) return;
    if (S.pick) { S.pick = null; paint(); const b = host.querySelector(".sw-tokbtn"); if (b) b.focus(); }
    else if (S.rv && S.rv.step !== "run") { S.rv = null; paint(); const b = host.querySelector(".sw-cta"); if (b) b.focus(); }
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "sw-q") { const r = pickerRows()[0]; if (isAddr(S.q.trim())) choose(S.q.trim()); else if (r) choose(r.m.address); }
  });
  let rsz = null;
  window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => { if (panel.classList.contains("active") && S.view === "swap") paintChart(); }, 200); });

  // ---------------- start ----------------
  function fromHash() {
    const m = /#swap\?(.*)$/.exec(location.hash);
    if (!m) return false;
    const p = new URLSearchParams(m[1]);
    const i = lc(p.get("in")), o = lc(p.get("out"));
    if (isAddr(i)) S.tin = i;
    if (isAddr(o) && o !== S.tin) S.tout = o;
    if (p.get("amt") && /^\d*\.?\d+$/.test(p.get("amt"))) S.amt = p.get("amt");
    if (p.get("v")) S.view = p.get("v");
    return true;
  }
  let acct = null, timer = null, slow = 0;
  async function show() {
    if (!S.booted) {
      S.booted = true;
      if (!fromHash()) { const pr = lsGet(LS.pair, null); if (pr && isAddr(pr.in)) { S.tin = lc(pr.in); if (isAddr(pr.out) && lc(pr.out) !== S.tin) S.tout = lc(pr.out); } }
      paint(); setView(S.view, true);
      await Promise.all([meta(S.tin).catch(() => { S.tin = ARCIRCLE(); }), isAddr(S.tout) ? meta(S.tout).catch(() => { S.tout = null; }) : null, loadArcUsd()]);
      paint();
      loadLists().then(paint);
      loadTop().then(() => { paintTicker(); if (S.pick) paint(); });
    } else if (fromHash()) { await Promise.all([meta(S.tin).catch(() => null), isAddr(S.tout) ? meta(S.tout).catch(() => null) : null]); setView(S.view, true); }
    acct = me();
    loadNet();
    await Promise.all([loadBal(), loadFeeInfo(), loadStats()]);
    paint();
    requote(0);
    loadChart();
    clearInterval(timer);
    timer = setInterval(() => {
      if (document.hidden || !panel.classList.contains("active")) return;
      if (me() !== acct) { acct = me(); S.pbal = {}; S.pbalAt = 0; Promise.all([loadBal(), loadFeeInfo()]).then(() => { paint(); requote(0); paintNet(); }); return; }
      // a quote older than 15 s is refreshed (not while a transaction is in flight or the review is open)
      if (!S.busy && !S.rv && S.quote && Date.now() - S.quote.at > 15000) requote(0);
      slow = (slow + 1) % 3;
      if (slow === 0) { loadNet(); if (S.view === "swap") { loadChart(); if (S.ch && S.ch.pool) loadTrades(); } }
    }, 5000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "swap") show(); else clearInterval(timer); });
  document.addEventListener("arc:lang", () => { if (!S.booted) return; const a = $("sw-app"); if (a) a.remove(); paint(); setView(S.view, true); paintNet(); paintTicker(); document.dispatchEvent(new CustomEvent("arcswap:view", { detail: { view: S.view } })); });
  if (panel.classList.contains("active")) show();
  // what arc-swap-x.js (Pools, Tokens, Activity, Send & Receive) shares with this file
  window.arcSwap = {
    show, quote, routesOf, setView, paint, _S: S, _META: META,
    api: { S, META, meta, logoHtml, svg, esc, T, tr, L3, lang, lc, isAddr, short, fmt, fmtRaw, usd, usdK, human, units, plain, usdOf, me, rp, signer, errText, openPicker, pickHooks, loadTop, launches, okImg, ERC20, SW_I, ROUTER, LIVE, USDC, ARCIRCLE, EXPL, CFG, GAS_KEEP, lsGet, lsSet,
      buy: (t) => { t = lc(t); if (t === ARCIRCLE()) { S.tin = USDC(); S.tout = ARCIRCLE(); } else { S.tin = ARCIRCLE(); S.tout = t; } setView("swap"); afterPair(); },
      pair: (a, b) => { S.tin = lc(a); S.tout = lc(b); setView("swap"); afterPair(); } },
  };
  document.dispatchEvent(new CustomEvent("arcswap:ready"));
})();
