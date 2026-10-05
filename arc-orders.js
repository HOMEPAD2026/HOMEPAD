/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, ensureAltForWrite, readProvider, ARC_ALT_NET, ARC */
// arc-orders.js — ARCIRCLE Orders, an ARCIRCLE PAD utility (arcpad.html#orders; api/_orders.mjs; contracts
// ArcircleOrders.sol + ArcircleFeeBurn.sol). Exchange-style orders on Arc's Uniswap v4 pools, without giving up custody:
//   · limit    sign "sell X for at least Y" (EIP-712, no gas). Tokens stay in the wallet; the executor matches it with
//              another wallet's order (P2P) or fills it from the pool once the pool reaches the price
//   · market   a swap through ArcircleOrders.swapMarket, from the wallet, with a slippage floor
//   · stop     waits until the pool's price crosses a trigger, then sells (or buys) at market, never below its floor
//   · TP / SL  a take-profit and a stop-loss on the same tokens: one-cancels-other (the contract's `group`)
//   · trailing a stop that follows the price up and sells a set % under the peak (the floor is signed)
//   · timed    DCA / TWAP: released evenly over a period (the contract's `start` / `duration`), filled in parts
// 0.1% of what each side receives goes to ArcircleFeeBurn: half buys and burns $ARCIRCLE, half to the treasury.
// Two chains (the Arc | Robinhood switch): Arc, against USDC (ArcircleOrders), and Robinhood Chain, against ETH
// (ArcircleOrdersNative: orders name WETH, native ETH pools work; ETH is wrapped for you when an order needs WETH, and
// market orders take and pay plain ETH). Any token with a Uniswap v4 pool. The book shows price levels — signatures
// never leave the server, and a wallet's own orders open with one signature (30 days).
// v3 (4 Oct 2026): tiny prices with subscript zeros (0.0₆1088) and dollar values on Robinhood Chain, Preview tags
// on chains not live yet, the Token Scanner's score and ARCIA DESK's record on the market, a buy of a flagged token
// asks twice, "Limit · Market · More" types, a one-line order sentence, dollars in on Robinhood Chain, my orders
// across both chains with CSV, expiring orders extended in one step, P&L across markets, price alerts on Telegram,
// my average buy and my fills on the chart, lines that glow near their trigger, my orders beside the chart.
// arc-orders-x.js adds the live tape across markets, the fee burn's total, and swipe-to-cancel on phones.
// v4 (4 Oct 2026): market-cap prices (MCAP $ ⇄ the quote), limit buys that wait for a Pons token's graduation on
// Robinhood Chain, the pool's own liquidity on the depth chart, a Timed (DCA) suggestion when a market order moves the
// price, how often a price traded in the last 24 hours, one row of tabs on a phone, a compact market bar, Cancel up
// front with the rest under ⋯, chain colours, and motion: a fill's row, a new line dropping onto the chart, the price
// tick, the book's bars, the Buy / Sell pill. arc-orders-v4.js adds the watchlist, "type an order", Web Push.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-orders");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lang = () => (window.arcI18n && window.arcI18n.get()) || "en";
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CFG = () => (typeof CONFIG !== "undefined" ? CONFIG : {});
  // ---------------- the chain: Arc (USDC markets) or Robinhood Chain (ETH markets) ----------------
  const CK = "arcircle.orders.chain";
  const SOL_ON = () => !!(window.arcOrdersSol && typeof CONFIG !== "undefined" && CONFIG.ORDERS_SOL);
  let CH = /[?&]c=rh\b/.test(location.hash) ? "rh" : /[?&]c=sol\b/.test(location.hash) && SOL_ON() ? "sol" : /[?&]c=arc\b/.test(location.hash) ? "arc" : (() => { try { const v = localStorage.getItem(CK); return v === "rh" ? "rh" : v === "sol" && SOL_ON() ? "sol" : "arc"; } catch { return "arc"; } })();
  const RH = () => CH === "rh";
  // Solana: a third side, run by arc-orders-sol.js (its own program, book and form)
  const SOLC = () => CH === "sol";
  const ALT = () => (typeof ARC_ALT_NET !== "undefined" && ARC_ALT_NET) || { id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com", name: "Robinhood Chain" };
  const CHAIN_NAME = () => (RH() ? "Robinhood Chain" : "Arc");
  const WETH = () => lc(CFG().ORDERS_RH_WETH || "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
  const ORDERS = () => lc((RH() ? CFG().ORDERS_RH_ADDRESS : CFG().ORDERS_ADDRESS) || "");
  const LIVE = () => isAddr(ORDERS());
  const USDC = () => lc(CFG().USDC_ADDRESS || "0x3600000000000000000000000000000000000000");
  const BASE = () => (RH() ? WETH() : USDC()); // what every market trades against
  const ARCIRCLE = () => lc(RH() ? (CFG().OMNI && CFG().OMNI.ROBINHOOD_OFT) || "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4" : CFG().ARCIRCLE_TOKEN || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7");
  const CHAIN = () => (RH() ? Number(ALT().id || 4663) : Number(CFG().CHAIN_ID_DECIMAL || 5042));
  // the market a chain opens on: $ARCIRCLE on Arc, $ARCIA on Robinhood Chain (her Pons launch, ETH pools)
  const ARCIA_RH = () => lc(CFG().ARCIA_RH_TOKEN || "0xF0C0fC281314a48aE4E52a9db08731cb6A38CA25");
  const DEFAULT_MKT = () => (RH() ? ARCIA_RH() : ARCIRCLE());
  const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"; // Uniswap v4's PoolManager: the same address on both chains
  const PERMIT2 = () => lc((RH() ? CFG().ORDERS_RH_PERMIT2 : CFG().ORDERS_PERMIT2 || "0x000000000022D473030F116dDEE9F6B43aC78BA3") || "");
  const FREE_HOLD = () => Number(CFG().ORDERS_FREE_HOLD || 100000); // $ARCIRCLE held for no fee (the contract's policy has the real number)
  const EXPL = (kind, x) => `${RH() ? ALT().explorer : CFG().BLOCK_EXPLORER || "https://arc.etherscan.io"}/${kind}/${x}`;
  const CQ = () => (RH() ? "&chain=rh" : ""); // the API's chain parameter
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const GAS_KEEP = 3n * 10n ** 14n; // ETH left for gas when ETH pays for an order on Robinhood Chain
  /// a volume in the quote: dollars on Arc, ETH on Robinhood Chain
  const qv = (n) => (RH() ? (n == null || !isFinite(n) || !n ? "—" : num(n) + " ETH") : usd(n));
  const txa = (h, label) => (h ? `<a class="aor-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${esc(label || short(h))} ↗</a>` : "");
  const API = "/api/social";
  const FEE = 0.001;
  const ZERO32 = "0x" + "0".repeat(64);
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const now = () => Math.floor(Date.now() / 1000);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };

  // ---------------- numbers ----------------
  /// a price with four significant figures, never in exponent form (0.00003835); v3: four or more zeros after the
  /// point fold into a subscript count, 0.0000001088 → 0.0₆1088
  const SUBD = "₀₁₂₃₄₅₆₇₈₉";
  function fp(p) {
    if (p == null || !isFinite(p) || p <= 0) return "—";
    if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (p >= 1) return p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    const [m, e] = p.toExponential(3).split("e"), zeros = -Number(e) - 1;
    if (zeros >= 4) return "0.0" + [...String(zeros)].map((d) => SUBD[d]).join("") + m.replace(".", "").replace(/0+$/, "");
    const d = Math.min(14, -Math.floor(Math.log10(p)) + 3);
    return p.toFixed(d).replace(/0+$/, "").replace(/\.$/, "");
  }
  /// v3: a quote amount in dollars — Robinhood Chain's markets are in ETH (S.ethUsd from the executor's status); Arc's
  /// USDC already is dollars
  const usdOf = (q) => (RH() && S.ethUsd > 0 && q != null && isFinite(q) ? q * S.ethUsd : null);
  const usdS = (u) => (u == null ? "" : u >= 1 ? usd(u) : "$" + fp(u));
  const usdTag = (q, cls = "") => { const u = usdOf(q); return u == null ? "" : `<small class="aor-usd ${cls}" data-no-i18n>≈ ${esc(usdS(u))}</small>`; };
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Number(n).toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 }));
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const pc = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const human = (raw, dec) => Number(raw) / 10 ** dec;
  /// a decimal string → raw units, extra decimals cut (never rounded up)
  function units(v, dec) {
    let s = String(v == null ? "" : v).trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
    const [i, f = ""] = s.split(".");
    s = (i || "0") + "." + f.slice(0, dec);
    try { const r = ethers.parseUnits(s, dec); return r > 0n ? r : null; } catch { return null; }
  }
  /// a positive Number → a plain decimal string ethers can parse
  // v5: twelve significant figures at most — 0.109224, never 0.10922400000000000002
  const dstr = (n, d = 18) => { if (!(n > 0) || !isFinite(n)) return "0"; const v = Number(n.toPrecision(12)); return v.toFixed(Math.min(d, 20, Math.max(0, 11 - Math.floor(Math.log10(v))))).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
  const fmtU = (raw, dec, max = 6) => { const n = human(raw, dec); return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : max }); };
  const ago = (s) => { if (!s) return "—"; const d = Math.max(0, now() - s); return d < 60 ? tr("just now") : d < 3600 ? `${Math.floor(d / 60)}m` : d < 86400 ? `${Math.floor(d / 3600)}h` : `${Math.floor(d / 86400)}d`; };
  const inT = (s) => { const d = Math.max(0, s - now()); return d < 60 ? `${d}s` : d < 3600 ? `${Math.ceil(d / 60)}m` : `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`; };
  const hhmm = (s) => { const d = new Date(s * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };
  const P18 = (p) => units(dstr(p), 18);
  const SCALE = (td) => 10n ** BigInt(td) * 10n ** 18n;
  /// `amt` tokens (raw) at price `p` → quote (raw), rounded down / up
  const qOf = (amt, p, td, qd, up = false) => { const s = SCALE(td), x = amt * P18(p) * 10n ** BigInt(qd); return up ? (x + s - 1n) / s : x / s; };
  /// `q` quote (raw) at price `p` → tokens (raw), rounded down
  const tOf = (q, p, td, qd) => (q * SCALE(td)) / (P18(p) * 10n ** BigInt(qd));

  // ---------------- contract bits ----------------
  const ORDER_T = "(address maker,address sell,address buy,uint256 sellAmount,uint256 buyAmount,uint160 triggerSqrtP,bool triggerBelow,bytes32 poolId,uint64 expiry,uint64 start,uint32 duration,uint256 group,uint32 epoch,uint256 salt)";
  const KEY_T = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
  const ORDERS_ABI = [
    "function epochOf(address) view returns (uint32)", `function cancel(${ORDER_T})`, "function cancelAll()",
    `function swapMarket(${KEY_T},address,address,uint256,uint256) returns (uint256)`, `function quote(${KEY_T},address,uint256)`,
    "error QuoteResult(uint256 out)", "function feeOf(address,uint256) view returns (uint256)", "function feePolicy() view returns (address)",
    `function swapMarketNative(${KEY_T},address,address,uint256,uint256,bool) payable returns (uint256)`,
  ];
  const WETH_ABI = ["function deposit() payable", "function withdraw(uint256)"];
  const P2_ABI = ["function allowance(address,address,address) view returns (uint160 amount, uint48 expiration, uint48 nonce)"];
  const P2_TYPES = { PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }], PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }] };
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const TYPES = { Order: [["maker", "address"], ["sell", "address"], ["buy", "address"], ["sellAmount", "uint256"], ["buyAmount", "uint256"], ["triggerSqrtP", "uint160"], ["triggerBelow", "bool"], ["poolId", "bytes32"], ["expiry", "uint64"], ["start", "uint64"], ["duration", "uint32"], ["group", "uint256"], ["epoch", "uint32"], ["salt", "uint256"]].map(([name, type]) => ({ name, type })) };
  const IFACE = () => new ethers.Interface(ORDERS_ABI);
  let rhProv = null;
  const rp = () => (RH() ? (rhProv = rhProv || new ethers.JsonRpcProvider(ALT().rpc, Number(ALT().id || 4663), { staticNetwork: true })) : typeof readProvider === "function" ? readProvider() : null);
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (RH()) {
      if (typeof ensureAltForWrite !== "function") throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
      return await ensureAltForWrite();
    }
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const m = String((e && (e.shortMessage || e.reason || e.message)) || tr("That didn't go through."));
    if (/PriceNotMet/.test(m)) return tr("The price moved past your slippage limit — nothing was swapped.");
    return m.slice(0, 180);
  };
  const keyOf = (p) => ({ currency0: p.key.currency0, currency1: p.key.currency1, fee: p.key.fee, tickSpacing: p.key.tickSpacing, hooks: p.key.hooks });
  /// the contract's quote(): what `amount` of `sell` brings from pool `p` before the fee (null if it can't tell)
  async function quoteOut(p, sell, amount) {
    if (!LIVE() || !p || !(amount > 0n)) return null;
    const iface = IFACE();
    try { await rp().call({ to: ORDERS(), data: iface.encodeFunctionData("quote", [keyOf(p), sell, amount]) }); } catch (e) {
      const d = (e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data))) || null;
      const hex = typeof d === "string" ? d : d && d.data;
      if (hex && hex.length >= 74) { try { return iface.decodeErrorResult("QuoteResult", hex)[0]; } catch { return null; } }
    }
    return null;
  }
  /// a price (quote per token) → the pool's sqrtPriceX96 for a stop trigger
  function trigOf(P, p) {
    const td = S.tok.decimals, qd = S.quote.decimals;
    const r = p.tokenIs0 ? P * 10 ** (qd - td) : 1 / (P * 10 ** (qd - td));
    return BigInt(Math.floor(Math.sqrt(r) * 2 ** 48)) * 2n ** 48n;
  }

  // ---------------- state ----------------
  const S = {
    t: null, tok: null, quote: null, pools: [], pi: 0, spot: null, prevSpot: null, book: null, mine: null, markets: [], status: null, candles: null,
    side: "buy", type: "limit", left: "book", center: "chart", myTab: "open", myScope: "market", tf: 900, prec: 0,
    busy: false, steps: null, booted: false, acct: null, bal: {}, msg: null, loadingMkt: false, err: null, tax: null, agentCall: null,
    editing: null, locked: false, prevLevels: new Map(), prevFill: new Map(), sheet: false, showMarkets: false,
    histF: "all", showCx: false, mq: "", allow: {}, fatOk: null, drag: null, cxArm: null,
    // v3
    ethUsd: null, scan: null, desk: null, other: null, usdIn: false, typesOpen: false, riskOk: new Set(), beat: 0, swiped: null, nearRaf: 0,
    // v4
    supply: null, mcapIn: false, pending: false, statsMore: false, rowMenu: null, drop: null, poolL: null, prevSide: null, prevBar: new Map(),
  };
  S.mcapIn = store.get("arcircle.orders.mcapin", false) === true;
  S.usdIn = (() => { try { return localStorage.getItem("arcircle.orders.usdin") === "1"; } catch { return false; } })();
  const F = { price: "", amount: "", total: "", trigger: "", expiry: "604800", slip: "3", tp: "", sl: "", trail: "10", floor: "", dur: "86400", parts: "12", cap: "", approveMore: store.get("arcircle.orders.approvemore", false),
    lo: "", hi: "", n: "5", brk: false, btp: "", bsl: "",
    // v5: a scaled ladder's shape, and a condition on another token's price
    dist: "even", condOn: false, condT: "", condDir: "above", condP: "" };
  // v2: Simple (Limit and Market up front) or Pro (every type, the price step, keys) — phones start Simple
  const MK = "arcircle.orders.mode";
  const PRO = () => store.get(MK, innerWidth > 720 ? "pro" : "simple") === "pro";
  const FAVK = () => (RH() ? "arcircle.orders.fav.rh" : "arcircle.orders.fav");
  const favs = () => store.get(FAVK(), []).filter(isAddr);
  const PRK = "arcircle.orders.presets", LASTK = "arcircle.orders.lastorder", BRK = "arcircle.orders.brackets";
  const presets = () => store.get(PRK, []).filter((x) => x && x.type && x.side).slice(0, 5);
  const brackets = () => store.get(BRK, []).filter((x) => x && x.h && x.t && x.until > now());
  const pool = () => S.pools[S.pi] || null;
  const AK = "arcircle.orders.alerts", NK = "arcircle.orders.notify";
  const RK0 = "arcircle.orders.recent", RKr = () => (RH() ? RK0 + ".rh" : RK0);
  const recent = () => store.get(RKr(), []).filter((x) => x && isAddr(x.t));
  const addRecent = (t, sym) => store.set(RKr(), [{ t, sym }, ...recent().filter((x) => x.t !== t)].slice(0, 6));
  const viewKey = (w) => `arcircle.orders.view.${lc(w)}`;
  const viewOf = (w) => { const v = store.get(viewKey(w), null); return v && v.until > now() + 60 ? v : null; };
  const notifyOn = () => store.get(NK, false) === true;

  // ---------------- skeleton ----------------
  const ICON = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="aor-ck" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };
  /// the hero's "verified source" links follow the chain: ArcScan on Arc, Blockscout on Robinhood Chain (hidden until live)
  function heroContracts() {
    const el = panel.querySelector(".aor-contracts"); if (!el) return;
    if (el.dataset.arc == null) el.dataset.arc = el.innerHTML;
    const fb = lc(CFG().ORDERS_RH_FEEBURN || "");
    if (!RH()) { el.innerHTML = el.dataset.arc; el.hidden = false; return; }
    el.hidden = !LIVE();
    if (!LIVE()) return;
    const a = (name, x) => `<a href="${EXPL("address", x)}?tab=contract" target="_blank" rel="noopener">${name} <code data-no-i18n>${x.slice(0, 6)}…${x.slice(-4)}</code> ↗</a>`;
    el.innerHTML = `${el.dataset.arc.split("<span")[0]}<span>${T("Verified source on Blockscout:")}</span>${a("ArcircleOrdersNative", ORDERS())}${isAddr(fb) ? a("ArcircleFeeBurnNative", fb) : ""}`;
  }
  const chainNote = () => T(SOLC() ? "Markets against SOL on Solana — orders stay in your Solana wallet until they fill." : RH() ? "Markets against ETH on Robinhood Chain — ETH is wrapped for you when an order needs WETH." : "Markets against USDC on Arc.");
  /// v3: is a chain's ARCIRCLE Orders live yet (its contract / program set in config-arc.js)
  const liveOn = (c) => (c === "rh" ? isAddr(CFG().ORDERS_RH_ADDRESS) : c === "sol" ? !!(window.arcOrdersSol && window.arcOrdersSol.program && window.arcOrdersSol.program()) : isAddr(CFG().ORDERS_ADDRESS));
  const prevTag = (c) => (liveOn(c) ? "" : `<em class="aor-cprev">${T("Preview")}</em>`);
  function chainSwitch() {
    return `<div class="aor-chain${SOL_ON() ? " three" : ""}" role="radiogroup" aria-label="${T("Chain")}" data-chain="${CH}" title="${chainNote()}"><i class="aor-chain-pill" aria-hidden="true"></i><button type="button" role="radio" data-setchain="arc" aria-checked="${CH === "arc"}"><span class="aor-cdot arc" aria-hidden="true"></span><span data-no-i18n>Arc</span><small data-no-i18n>USDC</small>${prevTag("arc")}</button><button type="button" role="radio" data-setchain="rh" aria-checked="${RH()}"><span class="aor-cdot rh" aria-hidden="true"></span><span data-no-i18n>Robinhood</span><small data-no-i18n>ETH</small>${prevTag("rh")}</button>${SOL_ON() ? `<button type="button" role="radio" data-setchain="sol" aria-checked="${SOLC()}"><span class="aor-cdot sol" aria-hidden="true"></span><span data-no-i18n>Solana</span><small data-no-i18n>SOL</small>${prevTag("sol")}</button>` : ""}</div>`;
  }
  function chainRow() {
    return `<div class="aor-chainrow">${chainSwitch()}<span class="aor-chainnote">${chainNote()}</span></div>`;
  }
  /// the hero's long intro folds to three lines on a phone; a tap opens it
  function heroFold() {
    const h = panel.querySelector(".aor-hero .bp-lede");
    if (!h || h.dataset.fold) return;
    h.dataset.fold = "1"; h.classList.add("aor-fold");
    h.setAttribute("tabindex", "0"); h.setAttribute("role", "button"); h.setAttribute("aria-expanded", "false");
    const t = () => { const o = h.classList.toggle("open"); h.setAttribute("aria-expanded", String(o)); };
    h.addEventListener("click", t); h.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t(); } });
  }
  /// v6: chart indicators, each on or off (kept in this browser): the 20-candle average, the VWAP of what's on screen,
  /// the volume's 20-candle average, and the walls of resting orders in the book
  const IND_LIST = () => [["ma", "MA 20", "#ffd36b"], ["vwap", "VWAP", "#b58bff"], ["vma", "Volume MA 20", "#9fb0bd"], ["walls", L3("Order walls", "주문 벽", "挂单墙"), "#4dd4ff"]];
  const IND = () => store.get("arcircle.orders.ind", { walls: true });
  function frame() {
    if (SOLC()) {
      const el = panel.querySelector(".aor-contracts");
      if (el) { if (el.dataset.arc == null) el.dataset.arc = el.innerHTML; const pid = window.arcOrdersSol.program(); el.hidden = !pid; if (pid) el.innerHTML = `${el.dataset.arc.split("<span")[0]}<span>${T("The program on Solscan:")}</span><a href="https://solscan.io/account/${esc(pid)}" target="_blank" rel="noopener">ARCIRCLE Orders <code data-no-i18n>${esc(pid.slice(0, 4))}…${esc(pid.slice(-4))}</code> ↗</a>`; }
      panel.dataset.ch = "sol";
      $("aor-body").innerHTML = `${chainRow()}${liveOn("sol") ? "" : `<div class="aor-solwait" id="aor-solwait"></div>`}<div class="aor-sol" id="aor-sol"></div>`;
      if (window.arcOrdersV5) window.arcOrdersV5.solWait();
      if (!S.wired) { S.wired = true; panel.addEventListener("click", onClick); panel.addEventListener("input", onInput); panel.addEventListener("change", onInput); panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) sheet(false); }); }
      window.arcOrdersSol.mount($("aor-sol"));
      return;
    }
    if (window.arcOrdersSol) window.arcOrdersSol.unmount();
    heroContracts();
    heroFold();
    $("aor-body").innerHTML = `
      <div class="ams-preview aor-preview" id="aor-preview"${LIVE() ? " hidden" : ""}><i class="ams-preview-ico"></i><div><b>${T(RH() ? "Preview — ARCIRCLE Orders opens on Robinhood Chain once its contract is live there" : "Preview — ARCIRCLE Orders opens once its contract is live on Arc")}</b><span>${T("You can browse markets, the book and the pool price now; placing orders turns on with the contract.")}</span></div></div>
      <div class="aor-tapew" id="aor-tapew" hidden><div class="aor-tape" id="aor-tape" aria-label="${T("Latest fills across markets")}"></div><a class="aor-burnct" id="aor-burnct" href="/reward" hidden></a></div>
      <div class="aor-grid" id="aor-grid" data-mt="chart">
      <div class="ams-card aor-bar">
        <div class="aor-pickrow">
          ${chainSwitch()}
          <form class="aor-pick" id="aor-form" autocomplete="off">
<span class="aor-q"><input id="aor-in" type="text" spellcheck="false" placeholder="${T(RH() ? "Paste a Robinhood Chain token address (0x…)" : "Paste an Arc token address (0x…)")}" aria-label="${T(RH() ? "Robinhood Chain token address" : "Arc token address")}"><button type="button" class="aor-qx" data-qx aria-label="${T("Clear")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>
            <button type="submit" class="aor-btn go aor-openbtn" aria-label="${T("Open market")}"><span>${T("Open market")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
          </form>
          <button type="button" class="aor-btn ghost aor-mkbtn" data-act="markets" aria-expanded="false">${ICON.list}<span>${T("All markets")}</span></button>
        </div>
        <div class="aor-mlist" id="aor-mlist" hidden></div>
        <div class="aor-chips" id="aor-chips"></div>
        <div class="aor-watch" id="aor-watch" hidden></div>
        <div class="aor-mkt" id="aor-mkt"></div>
      </div>
      <div class="aor-mtabs" role="tablist" aria-label="${T("Market view")}">
        <button type="button" role="tab" data-mt="chart" aria-selected="${S.center !== "depth" && S.center !== "pool"}"><svg class="aor-mti" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l5-6 4 3 7-9"/></svg>${T("Chart")}</button><button type="button" role="tab" data-mt="depth" aria-selected="${S.center === "depth"}"><svg class="aor-mti" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h4v-5h4v-4h2v4h4v5h4"/></svg>${T("Depth")}</button><button type="button" role="tab" data-mt="pool" aria-selected="${S.center === "pool"}"><svg class="aor-mti" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15c3-3 5 3 8 0s5 3 8 0"/><path d="M4 10c3-3 5 3 8 0s5 3 8 0"/></svg>${T("Pool")}</button><button type="button" role="tab" data-mt="book" aria-selected="false"><svg class="aor-mti" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M4 10h14M4 14h8M4 18h12"/></svg>${T("Book")}</button><button type="button" role="tab" data-mt="trades" aria-selected="false"><svg class="aor-mti" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>${T("Trades")}</button><a class="aor-mt-dex" id="aor-mt-dex" href="#" target="_blank" rel="noopener" data-no-i18n hidden>Dexscreener ↗</a>
      </div>
        <section class="ams-card aor-bookc">
          <div class="aor-bookh"><div class="aor-seg" role="tablist"><button type="button" data-left="book" aria-selected="true">${T("Order book")}</button><button type="button" data-left="trades" aria-selected="false">${T("Trades")}</button></div>
            <select id="aor-prec" class="aor-prec" aria-label="${T("Price step")}"></select></div>
          <div id="aor-book" class="aor-book"></div>
        </section>
        <section class="ams-card aor-chartc">
          <div class="aor-charth"><div class="aor-seg" role="tablist"><button type="button" data-center="chart" aria-selected="true">${T("Chart")}</button><button type="button" data-center="depth" aria-selected="false">${T("Depth")}</button><button type="button" data-center="pool" aria-selected="false">${T("Pool")}</button><button type="button" data-center="dex" aria-selected="false" data-no-i18n>Dexscreener</button></div>
            <div class="aor-tfs" id="aor-tfs">${[[300, "5m"], [900, "15m"], [3600, "1h"], [14400, "4h"]].map(([v, l]) => `<button type="button" data-tf="${v}" aria-pressed="${S.tf === v}" data-no-i18n>${l}</button>`).join("")}<span class="aor-indw"><button type="button" class="aor-indb" data-act="indmenu" aria-expanded="false" title="${T("Indicators")}" aria-label="${T("Indicators")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l5-6 4 3 6-8 3 3"/></svg></button><span class="aor-indm" role="menu" hidden>${IND_LIST().map(([k, l, c]) => `<button type="button" role="menuitemcheckbox" data-ind="${k}" aria-checked="${!!IND()[k]}" data-no-i18n><i style="background:${c}"></i>${esc(l)}</button>`).join("")}</span></span></div></div>
          <div id="aor-chart" class="aor-chart"></div>
        </section>
        <section class="ams-card aor-formc" id="aor-formc" aria-label="${T("Place an order")}"></section>
      <section class="ams-card aor-mine" id="aor-minec">
        <div class="aor-mine-h"><div class="aor-seg" role="tablist"><button type="button" data-my="open" aria-selected="true">${T("Open orders")} <em id="aor-n-open" data-no-i18n></em></button><button type="button" data-my="history" aria-selected="false">${T("History")} <em id="aor-n-hist" data-no-i18n></em></button><button type="button" data-my="port" aria-selected="false">${T("Portfolio")}</button></div>
          <div class="aor-scope" role="radiogroup"><button type="button" data-scope="market" aria-checked="${S.myScope === "market"}">${T("This market")}</button><button type="button" data-scope="all" aria-checked="${S.myScope === "all"}">${T(RH() ? "All on Robinhood" : "All on Arc")}</button><button type="button" data-scope="both" aria-checked="${S.myScope === "both"}">${T("Both chains")}</button></div>
          <button type="button" class="aor-btn sm ghost aor-csv" data-act="csv" title="${T("Download your orders as a CSV file")}">${T("Export CSV")}</button>
          <label class="aor-ntf"><input type="checkbox" id="aor-notify"${notifyOn() ? " checked" : ""}> <span>${T("Notify me")}</span></label>
          <span class="aor-mine-acts"><button type="button" class="aor-btn sm ghost" data-act="cancelmarket" id="aor-cxmkt" hidden>${T("Cancel all here")}</button><button type="button" class="aor-btn sm ghost" data-act="cancelall" id="aor-cxall" hidden>${T("Cancel all on-chain")}</button></span></div>
        <div id="aor-mine"></div>
        <div class="aor-mine-foot" id="aor-mfoot"></div>
        <a class="aor-tg" href="https://t.me/ARCIAonArc_bot" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11.2l6.2 2.1L19 7l-7.6 8.1.1 4.9 3.1-3.7 4.2 3.1z"/></svg><span>${T("Fill and price alerts on Telegram")}</span><code data-no-i18n>/orderalerts on</code><code data-no-i18n>/orders</code></a>
      </section>
      <section class="ams-card aor-burnd" id="aor-burnd" hidden aria-label="${T("Fee burn")}"></section>
      </div>
      <div class="aor-dock" id="aor-dock" hidden><button type="button" class="aor-dbuy" data-sheet="buy">${T("Buy")}</button><button type="button" class="aor-dsell" data-sheet="sell">${T("Sell")}</button></div>
      <div class="aor-strip" id="aor-strip" hidden></div>
      <div class="aor-scrim" id="aor-scrim" data-act="sheetclose" hidden></div>`;
    $("aor-form").addEventListener("submit", (e) => { e.preventDefault(); open($("aor-in").value.trim()); });
    $("aor-in").addEventListener("paste", () => setTimeout(() => { const v = $("aor-in").value.trim(); if (isAddr(v)) open(v); }, 0));
    // the × in the address box: clears what's typed (the open market stays)
    $("aor-form").addEventListener("click", (e) => { if (!e.target.closest("[data-qx]")) return; const i = $("aor-in"); i.value = ""; i.focus(); });
    if (!S.wired) {
      S.wired = true;
      panel.addEventListener("click", onClick); panel.addEventListener("input", onInput); panel.addEventListener("change", onInput);
      panel.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet) sheet(false); if (e.key === "Enter" && e.target.classList && (e.target.classList.contains("aor-ml-r") || e.target.classList.contains("aor-xp-r"))) { open(e.target.dataset.t); S.showMarkets = false; marketsView(); } });
      panel.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("aor-adv")) S.advOpen = e.target.open; }, true);
    }
    panel.classList.toggle("aor-simple", !PRO());
    panel.dataset.ch = CH; // v4: chain colours (Arc blue, Robinhood lime, Solana purple)
    if (!S.keys) { S.keys = true; document.addEventListener("keydown", onKey); }
    chips(); market(); bookView(); chartView(); form(); mineView(); watchDock();
    if (window.arcOrdersX) window.arcOrdersX.frame();
    if (window.arcOrdersV5) window.arcOrdersV5.frame();
  }
  // ---------------- v2: keys, the phone's Buy / Sell bar, the sticky price strip ----------------
  /// B / S pick the side, Enter places (from the form), / goes to the token box, Esc closes the sheet
  function onKey(e) {
    if (!panel.classList.contains("active") || SOLC() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tg = e.target, typing = tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable);
    if (e.key === "Escape") { const kh = document.getElementById("aor-keys"); if (kh) { kh.remove(); return; } }
    if (e.key === "Enter" && typing && tg.closest && tg.closest("#aor-formc") && tg.type !== "checkbox") { e.preventDefault(); submit(); return; }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "s") { if (!S.tok) return; const sd = k === "b" ? "buy" : "sell"; if (sd === "buy" && sellOnly(S.type)) S.type = "limit"; S.side = sd; S.msg = null; form(); requote(); if (innerWidth <= 720) sheet(true); e.preventDefault(); return; }
    if (k === "/") { const i = $("aor-in"); if (i) { e.preventDefault(); i.focus(); i.select(); } }
    // v6: O the order form, M the market list, P the pool, C the chart, ? the keys
    if (k === "o" && S.tok) { e.preventDefault(); if (innerWidth <= 720) sheet(true); const f0 = $("aor-price") || $("aor-amount") || $("aor-total"); if (f0) { f0.focus(); f0.select && f0.select(); } else { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); } return; }
    if (k === "m") { e.preventDefault(); S.showMarkets = !S.showMarkets; marketsView(); return; }
    if ((k === "p" || k === "c") && S.tok) { e.preventDefault(); S.center = k === "p" ? "pool" : "chart"; seg("center", S.center); chartView(); return; }
    if (e.key === "?") { e.preventDefault(); keysHelp(); return; }
    if (e.key === "Escape" && S.showMarkets) { S.showMarkets = false; marketsView(); }
  }
  function keysHelp() {
    const old = document.getElementById("aor-keys"); if (old) { old.remove(); return; }
    const d = document.createElement("div"); d.id = "aor-keys"; d.className = "aor-keyhelp"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", tr("Keyboard shortcuts"));
    const rows = [["B", L3("Buy side", "매수", "买入")], ["S", L3("Sell side", "매도", "卖出")], ["O", L3("Order form", "주문 폼", "下单表单")], ["M", L3("Market list", "마켓 목록", "市场列表")], ["P", L3("Pool tab", "풀 탭", "池标签")], ["C", L3("Chart", "차트", "图表")], ["/", L3("Token address", "토큰 주소", "代币地址")], ["Enter", L3("Place the order (in the form)", "주문하기 (폼에서)", "下单(在表单中)")], ["?", L3("This list", "이 목록", "此列表")]];
    d.innerHTML = `<b>${T("Keyboard shortcuts")}</b><ul>${rows.map(([k0, l]) => `<li><kbd data-no-i18n>${esc(k0)}</kbd><span data-no-i18n>${esc(l)}</span></li>`).join("")}</ul><button type="button" class="aor-btn sm ghost" data-keysx>${T("Close")}</button>`;
    d.addEventListener("click", (e) => { if (e.target.closest("[data-keysx]") || e.target === d) d.remove(); });
    document.body.appendChild(d);
  }
  let dockObs = null, stripObs = null, gridObs = null, heroIn = true, mktIn = true, gridIn = true;
  function watchDock() {
    if (!("IntersectionObserver" in window)) { const d = $("aor-dock"); if (d) d.hidden = false; return; }
    if (dockObs) dockObs.disconnect(); if (stripObs) stripObs.disconnect(); if (gridObs) gridObs.disconnect();
    const hero = panel.querySelector(".aor-hero"), mk = $("aor-mkt"), grid = $("aor-grid");
    dockObs = new IntersectionObserver((es) => { for (const x of es) heroIn = x.isIntersecting; dockState(); }, { threshold: 0.15 });
    if (hero) dockObs.observe(hero);
    stripObs = new IntersectionObserver((es) => { for (const x of es) mktIn = x.isIntersecting; strip(); }, { threshold: 0 });
    if (mk) stripObs.observe(mk);
    // v5: both step aside once the trading area has scrolled away (the guide, the footer)
    gridObs = new IntersectionObserver((es) => { for (const x of es) gridIn = x.isIntersecting; dockState(); strip(); }, { threshold: 0, rootMargin: "0px 0px -35% 0px" });
    if (grid) gridObs.observe(grid);
  }
  /// the phone's Buy / Sell bar shows once the hero has scrolled away and a market is open — while the trading area is on screen
  function dockState() {
    const d = $("aor-dock"); if (!d) return;
    const hide = heroIn || !gridIn || !S.tok || S.sheet;
    if (hide !== d.hidden) { d.hidden = hide; if (!hide && !reduce) { d.classList.remove("in"); void d.offsetWidth; d.classList.add("in"); } }
  }
  /// where the site's fixed top bar ends (the strip sits just under it)
  function hdrBottom() {
    if (S.hdrB != null && S.hdrW === innerWidth) return S.hdrB;
    let b = 0;
    for (const x of [innerWidth / 2, innerWidth - 40]) {
      let n = document.elementFromPoint(x, 4);
      while (n && n !== document.body && n !== document.documentElement) {
        if (n.id === "aor-strip") break;
        const ps = getComputedStyle(n).position;
        if (ps === "fixed" || ps === "sticky") { b = Math.max(b, n.getBoundingClientRect().bottom); break; }
        n = n.parentElement;
      }
    }
    S.hdrB = Math.min(160, Math.max(0, b)); S.hdrW = innerWidth;
    return S.hdrB;
  }
  /// a slim strip under the site header with the pair, the price and its 24h change, once the market bar scrolls away
  function strip() {
    const el = $("aor-strip"); if (!el) return;
    const show = !mktIn && gridIn && !!S.tok && panel.classList.contains("active") && !S.sheet;
    if (show && el.hidden) {
      el.style.top = hdrBottom() + (innerWidth <= 720 ? 0 : 8) + "px";
      // v4: a bar across the content (the whole width on a phone), and the sticky form steps down under it
      const r = panel.getBoundingClientRect();
      el.style.left = innerWidth <= 720 ? "0px" : Math.max(0, r.left) + "px"; el.style.right = innerWidth <= 720 ? "0px" : Math.max(0, innerWidth - r.right) + "px";
      document.documentElement.style.setProperty("--aor-cl", Math.max(0, r.left) + "px");
    }
    el.hidden = !show;
    panel.style.setProperty("--aor-sh", show && innerWidth > 720 ? el.offsetHeight + 8 + "px" : "0px");
    // v5: on a phone the market tabs pin just under the header (and the strip, when it shows)
    const tabsTop = () => { if (innerWidth <= 720) panel.style.setProperty("--aor-tabs-top", hdrBottom() + (show ? el.offsetHeight : 0) + "px"); };
    tabsTop();
    if (!show) return;
    const ch = dayChange(), b = S.book || {}, a = b.asks && b.asks[0], bd = b.bids && b.bids[0];
    const spr = a && bd ? ((a.price - bd.price) / ((a.price + bd.price) / 2)) * 100 : null;
    const key = `${S.t}|${S.spot}|${ch}|${spr}|${lang()}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.innerHTML = `<b data-no-i18n>$${esc(S.tok.symbol)}<i>/${esc(S.quote.symbol)}</i></b><span class="aor-strip-p" data-no-i18n>${fp(S.spot)}</span>${ch != null ? `<em class="${ch >= 0 ? "up" : "dn"}" data-no-i18n>${pc(ch)}</em>` : ""}${spr != null ? `<small>${T("spread")} <span data-no-i18n>${spr.toFixed(2)}%</span></small>` : ""}<span class="aor-strip-go"><button type="button" class="aor-dbuy" data-strip="buy">${T("Buy")}</button><button type="button" class="aor-dsell" data-strip="sell">${T("Sell")}</button></span>`;
    tabsTop();
  }
  const seg = (attr, v) => panel.querySelectorAll(`button[data-${attr}]`).forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-" + attr) === v)));

  // ---------------- markets: chips, the list, the bar ----------------
  async function loadMarkets() {
    const c0 = CH;
    try { const r = await fetch(`${API}?orders=markets${CQ()}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (c0 === CH) S.markets = (j && j.markets) || []; } catch { /* keep */ }
    chips(); if (S.showMarkets) marketsView();
  }
  function chips() {
    const el = $("aor-chips"); if (!el) return;
    const seen = new Set(), list = [];
    const add = (t, sym, n, fav) => { t = lc(t); if (!isAddr(t) || seen.has(t)) return; seen.add(t); list.push({ t, sym, n, fav }); };
    // v3: each chip carries its 24h change and how many of my orders are open there
    const chOf = (t) => { const m = S.markets.find((x) => lc(x.token.address || x.token) === t); return m && m.change24 != null ? m.change24 : null; };
    const mineN = (t) => ((S.mine && S.mine.orders) || []).filter((o) => lc(o.token.address || o.token) === t && (o.status === "open" || o.status === "unfunded")).length;
    const symOf = (t) => { const m = S.markets.find((x) => lc(x.token.address || x.token) === t); const r = recent().find((x) => x.t === t); return (m && m.token.symbol) || (r && r.sym) || (t === ARCIRCLE() ? "ARCIRCLE" : RH() && t === ARCIA_RH() ? "ARCIA" : null); };
    for (const f of favs()) add(f, symOf(f), null, true);
    if (RH()) add(ARCIA_RH(), "ARCIA");
    add(ARCIRCLE(), "ARCIRCLE");
    // v5: the server's featured markets next (traded or not), then the rest
    for (const m of S.markets.filter((x) => x.featured)) add(m.token.address || m.token, m.token.symbol, m.open);
    for (const m of S.markets) add(m.token.address || m.token, m.token.symbol, m.open);
    for (const r of recent()) add(r.t, r.sym);
    el.innerHTML = list.slice(0, 10).map((x) => `<button type="button" class="aor-chip${x.t === S.t ? " on" : ""}${x.fav ? " fav" : ""}" data-t="${x.t}">${x.fav ? '<i class="aor-star" aria-hidden="true">★</i>' : ""}<b data-no-i18n>$${esc(x.sym || short(x.t))}</b>${chOf(x.t) != null ? `<small class="aor-chip-ch ${chOf(x.t) >= 0 ? "up" : "dn"}" data-no-i18n>${pc(chOf(x.t), 1)}</small>` : ""}${x.n ? `<em data-no-i18n title="${T("open orders in the book")}">${x.n}</em>` : ""}${mineN(x.t) ? `<i class="aor-chip-me" data-no-i18n title="${T("your open orders")}">${mineN(x.t)}</i>` : ""}</button>`).join("");
  }
  /// a little line of a market's fills over the last day (the server sends up to 24 prices)
  function spark(pts, w = 64, h = 20) {
    if (!pts || pts.length < 2) return `<svg class="aor-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M0 ${h / 2}H${w}" class="flat"/></svg>`;
    const lo = Math.min(...pts), hi = Math.max(...pts), r = hi - lo || 1;
    const d = pts.map((p, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - 2 - ((p - lo) / r) * (h - 4)).toFixed(1)}`).join("");
    return `<svg class="aor-spark ${pts[pts.length - 1] >= pts[0] ? "up" : "dn"}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  function toggleFav(t) {
    t = lc(t); if (!isAddr(t)) return;
    const f = favs();
    store.set(FAVK(), f.includes(t) ? f.filter((x) => x !== t) : [t, ...f].slice(0, 12));
    chips(); market(); if (S.showMarkets) marketsView();
  }
  function marketsView() {
    const el = $("aor-mlist"); if (!el) return;
    el.hidden = !S.showMarkets;
    const b = panel.querySelector('[data-act="markets"]'); if (b) b.setAttribute("aria-expanded", String(S.showMarkets));
    if (!S.showMarkets) return;
    // v6: Markets (traded through Orders) | Explore (what's trading on the chain, and the new coins ARCIA DESK watches)
    const tabs = `<div class="aor-ml-tabs" role="tablist">${[["mk", L3("Markets", "마켓", "市场")], ["ex", L3("Explore", "탐색", "发现")], ["st", L3("Stats", "통계", "统计")]].map(([k, l]) => `<button type="button" role="tab" data-mtab="${k}" aria-selected="${(S.mtab || "mk") === k}" data-no-i18n>${esc(l)}</button>`).join("")}</div>`;
    if (S.mtab === "ex") {
      // v6: rows that changed places glide there (FLIP)
      const was = new Map([...el.querySelectorAll(".aor-xp-r[data-t]")].map((r) => [r.dataset.t + (r.classList.contains("new") ? ":n" : ""), r.getBoundingClientRect().top]));
      el.innerHTML = tabs + exploreView();
      if (!reduce && was.size) el.querySelectorAll(".aor-xp-r[data-t]").forEach((r) => { const k = r.dataset.t + (r.classList.contains("new") ? ":n" : ""), y0 = was.get(k); if (y0 == null) return; const dy = y0 - r.getBoundingClientRect().top; r.style.animation = "none"; if (Math.abs(dy) < 2) return; r.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => { r.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)"; r.style.transform = ""; }); });
      return;
    }
    if (S.mtab === "st") { el.innerHTML = tabs + statsView(); return; }
    const keep = document.activeElement && document.activeElement.id === "aor-mq";
    const q = lc(S.mq).trim(), F0 = favs();
    // v5: sort by volume, 24h change, open orders or name (★ markets stay first)
    const by = { vol: (a, b) => (b.vol24 || 0) - (a.vol24 || 0), chg: (a, b) => (b.change24 ?? -1e9) - (a.change24 ?? -1e9), orders: (a, b) => b.open - a.open, name: (a, b) => String(a.token.symbol).localeCompare(String(b.token.symbol)), top: (a, b) => (b.featured - a.featured) || b.open - a.open || (b.vol24 || 0) - (a.vol24 || 0) }[S.msort] || ((a, b) => (b.featured - a.featured) || b.open - a.open);
    const list = S.markets.filter((m) => !q || lc(m.token.symbol).includes(q.replace(/^\$/, "")) || lc(m.token.address || m.token).startsWith(q))
      .sort((a, b) => F0.includes(lc(b.token.address || b.token)) - F0.includes(lc(a.token.address || a.token)) || by(a, b));
    const sorts = [["top", L3("Top", "인기", "热门")], ["vol", L3("Volume", "거래량", "成交量")], ["chg", L3("24h change", "24시간 변동", "24小时涨跌")], ["orders", L3("Orders", "주문", "订单")], ["name", L3("Name", "이름", "名称")]];
    const head = tabs + `<div class="aor-ml-q"><input id="aor-mq" type="search" spellcheck="false" autocomplete="off" placeholder="${T("Search markets — symbol or 0x…")}" value="${esc(S.mq)}" aria-label="${T("Search markets")}"><span class="aor-ml-sort" role="radiogroup" aria-label="${T("Sort by")}">${sorts.map(([k, l]) => `<button type="button" role="radio" data-msort="${k}" aria-checked="${(S.msort || "top") === k}" data-no-i18n>${esc(l)}</button>`).join("")}</span><small>${T("★ keeps a market at the front")}</small></div>`;
    if (!S.markets.length) { el.innerHTML = head + `<div class="aor-empty">${T(RH() ? "No markets with orders yet — open any Robinhood Chain token above and place the first one." : "No markets with orders yet — open any Arc token above and place the first one.")}</div>`; return; }
    el.innerHTML = head + `<div class="aor-ml-h"><span>${T("Market")}</span><span>${T("Price")}</span><span>${T("24h")}</span><span>${T("Best bid")}</span><span>${T("Best ask")}</span><span>${T("Spread")}</span><span>${T("24h volume")}</span><span>${T("Orders")}</span></div>` +
      (list.length ? list.map((m) => {
        const t = lc(m.token.address || m.token), px = m.spot || m.last, fav = F0.includes(t);
        const spread = m.bestAsk && m.bestBid ? ((m.bestAsk - m.bestBid) / ((m.bestAsk + m.bestBid) / 2)) * 100 : null;
        return `<div class="aor-ml-r${t === S.t ? " on" : ""}${m.featured ? " feat" : ""}" data-t="${t}" role="button" tabindex="0"><b data-no-i18n><button type="button" class="aor-fav${fav ? " on" : ""}" data-fav="${t}" aria-pressed="${fav}" aria-label="${T("Favorite")}">★</button>$${esc(m.token.symbol)}<i>/${esc(m.quote.symbol)}</i>${m.featured ? `<em class="aor-feat">${esc(L3("Featured", "추천", "精选"))}</em>` : ""}${m.thin ? `<em class="aor-thin" title="${T("The pool moves 2% for a small trade — expect slippage")}">${esc(L3("Thin", "얇음", "流动性低"))}</em>` : ""}</b><span data-no-i18n>${fp(px)}</span><span class="aor-ml-ch" data-no-i18n>${spark(m.spark)}<em class="${m.change24 == null ? "" : m.change24 >= 0 ? "up" : "dn"}">${m.change24 == null ? "—" : pc(m.change24, 1)}</em></span><span class="up" data-no-i18n>${fp(m.bestBid)}</span><span class="dn" data-no-i18n>${fp(m.bestAsk)}</span><span data-no-i18n>${spread != null ? spread.toFixed(2) + "%" : "—"}</span><span data-no-i18n>${m.vol24 ? qv(m.vol24) : "—"}</span><span data-no-i18n>${m.open}</span></div>`;
      }).join("") : `<div class="aor-empty">${T("No market matches that.")}</div>`);
    if (keep) { const i = $("aor-mq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  }
  /// v6: Explore's data — the chain's trending tokens (Dexscreener, via the server) and ARCIA DESK's watch list
  async function loadExplore(force) {
    const c0 = CH;
    if (!force && S.ex && S.ex.ch === CH && Date.now() - S.ex.at < 120000) return;
    S.ex = { ch: CH, at: Date.now(), loading: true, trending: (S.ex && S.ex.ch === CH && S.ex.trending) || [], watching: (S.ex && S.ex.ch === CH && S.ex.watching) || [] };
    const [a, w] = await Promise.all([
      fetch(`${API}?orders=explore${CQ()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/desk?watching=1${RH() ? "&chain=rh" : ""}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (c0 !== CH) return;
    S.ex = { ch: CH, at: Date.now(), loading: false, trending: (a && a.trending) || [], watching: ((w && w.watching) || []).filter((x) => isAddr(x.t)).slice(0, 10) };
    if (S.showMarkets && S.mtab === "ex") marketsView();
  }
  /// v6: $ARCIRCLE on the other chain (ARCIRCLE OMNI's status): its price there against this market's, both in dollars
  async function loadOmni() {
    if (S.omniAt && Date.now() - S.omniAt < 120000) return;
    S.omniAt = Date.now();
    const j = await fetch("/api/c?view=omni").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (j && j.chains) { S.omni = j; if (S.t === ARCIRCLE()) market(); }
  }
  function omniChip() {
    if (S.t !== ARCIRCLE() || CH === "sol") return "";
    if (!S.omni) { loadOmni(); return ""; }
    const other = RH() ? "arc" : "robinhood", op = S.omni.chains && S.omni.chains[other] && S.omni.chains[other].price;
    const here = RH() ? (S.spot && S.ethUsd ? S.spot * S.ethUsd : null) : S.spot;
    if (!(op > 0) || !(here > 0)) return "";
    const d = ((op - here) / here) * 100, oc = RH() ? "arc" : "rh";
    const tk = RH() ? (CFG().ARCIRCLE_TOKEN || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7") : ((CFG().OMNI && CFG().OMNI.ROBINHOOD_OFT) || "0x6F9EBd0DFc6De9ed47EEc18EfeB69A9b97C71ee4");
    return `<span class="aor-omni" title="${T("The same $ARCIRCLE on the other chain, through ARCIRCLE OMNI — prices in dollars")}"><a href="#orders?t=${lc(tk)}&c=${oc}" data-no-i18n>${esc(L3(RH() ? "On Arc" : "On Robinhood", RH() ? "Arc에서" : "Robinhood에서", RH() ? "在 Arc" : "在 Robinhood"))} <b>$${esc(fp(op))}</b> <i class="${d >= 0 ? "up" : "dn"}">${pc(d, 1)}</i></a><a class="om" href="/arc#omni" data-arc-tab="omni">OMNI ↗</a></span>`;
  }
  /// v6: Orders as a whole on this chain (the server's ?orders=stats): 7 days of filled volume, fills, open orders
  async function loadStats() {
    const c0 = CH;
    if (S.stats && S.stats.ch === CH && Date.now() - S.stats.at < 60000) return;
    const j = await fetch(`${API}?orders=stats${CQ()}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (c0 !== CH) return;
    S.stats = { ch: CH, at: Date.now(), v: j };
    if (S.showMarkets && S.mtab === "st") marketsView();
  }
  function statsView() {
    const v = S.stats && S.stats.ch === CH ? S.stats.v : null;
    if (!v) return `<div class="aor-xp"><p class="aor-hint"><span class="aor-spin"></span>${T("Looking…")}</p></div>`;
    const mx = Math.max(1e-18, ...v.days.map((d) => d.vol));
    const qv0 = (q) => (RH() ? num(q) + " ETH" + (usdOf(q) ? ` <small>≈ ${esc(usdS(usdOf(q)))}</small>` : "") : usd(q));
    return `<div class="aor-xp aor-st">
      <div class="aor-pool-k">
        <div><small>${T("Filled, 7 days")}</small><b data-no-i18n>${qv0(v.vol7)}</b><span data-no-i18n>${esc(L3(`${v.fills7} fills`, `체결 ${v.fills7}건`, `${v.fills7} 笔成交`))}</span></div>
        <div><small>${T("Open orders")}</small><b data-no-i18n>${v.open}</b><span data-no-i18n>${esc(L3(`${v.markets} markets · ${v.makers} wallets`, `마켓 ${v.markets}개 · 지갑 ${v.makers}개`, `${v.markets} 个市场 · ${v.makers} 个钱包`))}</span></div>
        <div><small>${T("Burned by Orders fees")}</small><b data-no-i18n>${v.burned ? num(v.burned.arcircle) : "—"} <i>$ARCIRCLE</i></b>${v.burned ? `<span data-no-i18n>${esc(L3(`${v.burned.n} burns`, `소각 ${v.burned.n}회`, `${v.burned.n} 次销毁`))}</span>` : ""}</div>
      </div>
      <div class="aor-st-bars" role="img" aria-label="${T("Filled volume, last 7 days")}">${v.days.map((d, i) => `<div style="--h:${Math.max(2, (d.vol / mx) * 100).toFixed(1)}%;--i:${i}" title="${esc(d.d)} · ${esc(String(d.n))}"><i></i><small data-no-i18n>${esc(d.d.slice(5))}</small></div>`).join("")}</div>
      <p class="aor-xp-src">${T("Every fill through ARCIRCLE Orders on this chain — no wallet is named.")}</p></div>`;
  }
  const ageTxt = (ts) => { if (!ts) return "—"; const s0 = Math.max(0, now() - ts); return s0 < 3600 ? `${Math.max(1, Math.floor(s0 / 60))}m` : s0 < 86400 ? `${Math.floor(s0 / 3600)}h` : `${Math.floor(s0 / 86400)}d`; };
  const usdShort = (v) => (v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(v >= 10 ? 0 : 2));
  function exploreView() {
    const x = S.ex || { loading: true, trending: [], watching: [] };
    const chainN = RH() ? "Robinhood Chain" : "Arc";
    const logo = (r) => `<span class="aor-xp-logo" aria-hidden="true">${r.logo && /^https:\/\//.test(r.logo) ? `<img src="${esc(r.logo)}" alt="" width="28" height="28" loading="lazy" onerror="this.remove()">` : ""}<i data-no-i18n>${esc(String(r.sym || "?").slice(0, 2))}</i></span>`;
    const tr0 = x.trending.map((r, i) => `<div class="aor-xp-r${r.change24 != null && r.change24 >= 20 ? " hot" : ""}" data-t="${r.t}" role="button" tabindex="0" style="--i:${i}">${logo(r)}<b data-no-i18n>$${esc(r.sym)}<small>${esc(r.name || short(r.t))}</small></b>
      <span data-no-i18n>${r.priceUsd != null ? esc(fpUsd(r.priceUsd)) : "—"}</span><span class="${r.change24 == null ? "" : r.change24 >= 0 ? "up" : "dn"}" data-no-i18n>${r.change24 == null ? "—" : pc(r.change24, 1)}</span>
      <span data-no-i18n>${usdShort(r.volUsd)}</span><span data-no-i18n>${usdShort(r.liqUsd)}</span><span data-no-i18n>${ageTxt(r.created)}</span></div>`).join("");
    const w0 = x.watching.map((r, i) => `<div class="aor-xp-r new" data-t="${r.t}" role="button" tabindex="0" style="--i:${i}">${logo(r)}<b data-no-i18n>$${esc(r.sym || short(r.t))}<small>${esc(short(r.t))}</small></b>
      <span data-no-i18n>${ageTxt(r.ts)}</span><span data-no-i18n class="${r.score == null ? "" : r.score >= 70 ? "up" : r.score < 40 ? "dn" : ""}">${r.score != null ? esc(L3(`score ${r.score}`, `점수 ${r.score}`, `评分 ${r.score}`)) : "—"}</span><em>${T("New — high risk")}</em></div>`).join("");
    return `<div class="aor-xp">
      <section><h4 data-no-i18n>${esc(L3(`Trending on ${chainN}`, `${chainN} 인기 토큰`, `${chainN} 热门`))}${x.loading ? ' <span class="aor-spin"></span>' : ""}</h4>
        ${x.trending.length ? `<div class="aor-xp-h"><span>${T("Token")}</span><span>${T("Price")}</span><span>${T("24h")}</span><span>${T("24h volume")}</span><span>${T("Liquidity")}</span><span>${T("Age")}</span></div>${tr0}` : `<p class="aor-hint">${T(x.loading ? "Looking…" : "Nothing trending here right now.")}</p>`}</section>
      <section><h4>${T("New coins ARCIA DESK is watching")}</h4>
        ${x.watching.length ? w0 : `<p class="aor-hint">${T(x.loading ? "Looking…" : "No new coins on the watch list right now.")}</p>`}
        <p class="aor-hint">${T("Brand-new coins can lose most of their value in minutes. Check them in the Token Scanner first. Not advice.")}</p></section>
      <p class="aor-xp-src">${T("From Dexscreener and ARCIA DESK — tap one to open its market.")}</p></div>`;
  }
  const fpUsd = (v) => (v >= 1 ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "$" + fp(v));
  const dayChange = () => {
    // v5: the server's, from the pool's own candles (the price a day ago), against the price now
    const b = S.book;
    if (b && b.day && b.day.source === "pool" && b.day.open > 0 && S.spot) return ((S.spot - b.day.open) / b.day.open) * 100;
    if (b && b.day && b.day.source === "dex" && b.dayChange != null) return b.dayChange; // v6: Dexscreener's day until the pool has candles
    const c = S.candles && S.candles.list;
    if (!c || !c.length || !S.spot) return null;
    const t = now() - 86400, old = c.find((x) => x[0] >= t) || c[0];
    return old && old[1] > 0 ? ((S.spot - old[1]) / old[1]) * 100 : null;
  };
  function market() {
    const el = $("aor-mkt"); if (!el) return;
    if (!S.t) { el.innerHTML = `<p class="aor-hint">${T(RH() ? "Pick a market above — any Robinhood Chain token with a Uniswap v4 pool against ETH." : "Pick a market above — any Arc token with a Uniswap v4 pool (Argus, ArcPad or a plain pool).")}</p>`; return; }
    if (S.loadingMkt) { el.innerHTML = `<div class="aor-mkskel" aria-hidden="true"><i class="lg"></i><i></i><i></i><i></i><i></i><i></i></div><p class="aor-hint"><span class="aor-spin"></span>${T(S.slowMkt ? "Still looking — a token seen here for the first time takes a few more seconds." : RH() ? "Reading the token's pools on Robinhood Chain…" : "Reading the token's pools on Arc…")}</p>`; return; }
    // v6: $ARCIRCLE on Robinhood Chain before it has a pool: where it comes from and where it trades today
    if (!S.tok && RH() && S.t === ARCIRCLE()) { el.innerHTML = `<div class="aor-nopool"><b>${T("$ARCIRCLE on Robinhood Chain has no pool yet")}</b><span>${T("It's the same $ARCIRCLE, moved over from Arc with ARCIRCLE OMNI. Until a pool opens here, trade it on Arc or bring some over.")}</span><div><a class="aor-btn sm go" href="/arc#omni" data-arc-tab="omni">${T("Open ARCIRCLE OMNI")}</a><button type="button" class="aor-btn sm ghost" data-setchain="arc">${T("Trade it on Arc")}</button></div></div>`; return; }
    if (!S.tok) { el.innerHTML = `<p class="aor-hint bad">${T(S.err || (RH() ? "No Uniswap v4 pool against ETH found for this token on Robinhood Chain." : "No Uniswap v4 pool found for this token on Arc."))} <button type="button" class="aor-link" data-act="retryopen">${T("Try again")}</button></p>`; return; }
    const p = pool(), b = S.book || {}, d = b.day || {}, ch = dayChange();
    const dir = S.prevSpot && S.spot ? (S.spot > S.prevSpot ? "up" : S.spot < S.prevSpot ? "dn" : "") : "";
    const fresh = S.spotChg && Date.now() - S.spotChg < 2500;
    if (S.alertsOpen && $("aor-al-price")) S.alDraft = $("aor-al-price").value;
    const call = S.agentCall;
    el.innerHTML = `
      <div class="aor-pair">
        <span class="aor-logo" aria-hidden="true">${S.tok.logo ? `<img src="${esc(S.tok.logo)}" alt="" width="34" height="34" loading="lazy"${/arcircle-mark/.test(S.tok.logo) ? ' class="mark"' : ""} onerror="this.remove()">` : ""}<i data-no-i18n>${esc((S.tok.symbol || "?").slice(0, 2))}</i></span>
        <div><span class="aor-pair-n" data-no-i18n>$${esc(S.tok.symbol)}<i>/ ${esc(S.quote.symbol)}</i><button type="button" class="aor-fav${favs().includes(S.t) ? " on" : ""}" data-fav="${S.t}" aria-pressed="${favs().includes(S.t)}" aria-label="${T("Favorite")}" title="${T("★ keeps a market at the front")}">★</button></span>
        <span class="aor-pair-s"><a class="aor-tx" href="${EXPL("token", S.t)}" target="_blank" rel="noopener" data-no-i18n>${short(S.t)} ↗</a>${call && call.call ? `<a class="aor-call ${esc(call.call)}" href="#agent?${RH() ? "c=rh&" : ""}t=${S.t}" title="${T("ARCIA AGENT's safety call for the next 24 hours")}${call.why && call.why.length ? " · " + esc(call.why.join(" · ")) : ""}"><span data-no-i18n>ARCIA</span> ${T(call.call === "safe" ? "Safe" : call.call === "risky" ? "Risky" : "Caution")}</a>` : call && call.none ? `<a class="aor-call none" href="#agent?${RH() ? "c=rh&" : ""}t=${S.t}" title="${T("Ask ARCIA AGENT for her 24-hour safety call")}"><span data-no-i18n>ARCIA</span> ${T("Get her call")}</a>` : ""}${scanChip()}${deskChip()}</span></div>
      </div>
      <div class="aor-stats${S.statsMore ? " more" : ""}">
        <div class="aor-stat big${fresh && dir ? " tick-" + dir : ""}"><small>${T("Pool price")}</small><b data-no-i18n id="aor-spot" class="${fresh ? dir : ""}">${S.pending ? "—" : roll(S.spot, S.prevSpot)}<i class="aor-arrow ${dir}" aria-hidden="true"></i></b>${S.pending ? `<span>${T("opens when it graduates")}</span>` : `<span data-no-i18n class="${ch == null ? "" : ch >= 0 ? "up" : "dn"}">${ch == null ? esc(S.quote.symbol) : pc(ch) + " 24h"}</span>${usdTag(S.spot)}`}</div>
        ${mcapOf(S.spot) != null ? `<div class="aor-stat"><small>${T("Market cap")}</small><b data-no-i18n>${esc(usdBig(mcapOf(S.spot)))}</b></div>` : ""}
        <div class="aor-stat x aor-lastf"><small>${T("Last Orders fill")}</small><b data-no-i18n>${fp(b.last)}</b>${b.last ? `<span data-no-i18n>${b.lastAt ? esc(agoTxt(b.lastAt)) : ""}${S.spot && b.last ? ` · <i class="${b.last >= S.spot ? "up" : "dn"}">${pc(((b.last - S.spot) / S.spot) * 100, 1)}</i> ${esc(L3("vs pool", "풀 대비", "相对池"))}` : ""}</span>` : ""}</div>
        <div class="aor-stat x aor-range"><small>${T("24h range")}</small><b data-no-i18n>${d.low != null && d.high != null ? `${fp(d.low)} – ${fp(d.high)}` : "—"}</b>${d.low > 0 && d.high > d.low && S.spot ? `<span class="aor-rng" aria-hidden="true"><i style="--p:${Math.max(0, Math.min(100, ((S.spot - d.low) / (d.high - d.low)) * 100)).toFixed(1)}%"></i></span>` : ""}</div>
        <div class="aor-stat" title="${esc(d.source === "pool" ? `${tr("Every swap in the pool")} · ${d.trades || 0} · ${tr("Orders fills")} ${(b.orders24 && b.orders24.trades) || 0}` : d.source === "dex" ? `${tr("Every swap in the pool, from Dexscreener")} · ${d.trades || 0} · ${tr("Orders fills")} ${(b.orders24 && b.orders24.trades) || 0}` : tr("Orders fills"))}"><small>${T("24h volume")}</small><b data-no-i18n>${d.volume ? qv(d.volume) : "—"}</b>${(d.source === "pool" || d.source === "dex") && d.trades ? `<span data-no-i18n>${esc(L3(`${d.trades} swaps`, `스왑 ${d.trades}회`, `${d.trades} 笔兑换`))}</span>` : ""}</div>
        <div class="aor-stat"><small>${T("Open orders")}</small><b data-no-i18n>${b.open || 0}</b>${b.stops || b.trails || b.twaps ? `<span>${[b.stops ? `${b.stops} ${tr("stops")}` : "", b.trails ? `${b.trails} ${tr("trailing")}` : "", b.twaps ? `${b.twaps} ${tr("timed")}` : ""].filter(Boolean).map(esc).join(" · ")}</span>` : ""}</div>
        ${S.pools.length > 1 ? `<label class="aor-stat x aor-poolsel"><small>${T("Pool")}</small><select id="aor-pool" aria-label="${T("Pool")}">${S.pools.map((x, i) => `<option value="${i}"${i === S.pi ? " selected" : ""} data-no-i18n>${esc(x.venue)} · ${x.dex && x.dex.liqUsd ? usd(x.dex.liqUsd) : esc(x.id.slice(0, 8))}</option>`).join("")}</select></label>`
          : `<div class="aor-stat x"><small>${T("Pool")}</small><b data-no-i18n>${esc(p.venue || "Uniswap v4")}</b>${p.dex && p.dex.liqUsd ? `<span data-no-i18n>${usd(p.dex.liqUsd)}</span>` : ""}</div>`}
        <div class="aor-stat x"><small>${T(S.tax != null ? "Round trip" : "Pool fee")}</small><b data-no-i18n class="${S.tax != null && S.tax > 5 ? "warn" : ""}">${S.tax != null ? S.tax.toFixed(2) + "%" : p.feePct != null ? p.feePct + "%" : p.key && p.key.fee === 0x800000 ? tr("dynamic") : "—"}</b>${S.tax != null ? `<span>${T("pool fee + tax")}</span>` : ""}</div>
        <button type="button" class="aor-statmore" data-act="statmore" aria-expanded="${!!S.statsMore}">${T(S.statsMore ? "Less" : "More")} <span aria-hidden="true">${S.statsMore ? "▴" : "▾"}</span></button>
      </div>
      ${S.pending ? `<div class="aor-grad"><b>${T("On its Pons bonding curve")}</b><span>${T("Its Uniswap v4 pool opens when it graduates. Place a limit buy now — it waits, and fills from the new pool at your price or better.")}</span></div>` : ""}
      <div class="aor-side-tools">
        ${execChip()}${omniChip()}
        ${b.thin ? `<span class="aor-thinw" title="${T("The pool moves 2% for a small trade — expect slippage")}"><i aria-hidden="true">!</i>${T("Thin liquidity")}<small data-no-i18n>±2% ≈ ${esc(qv(Math.min(b.depth.up, b.depth.dn)))}</small></span>` : ""}
        <span class="aor-askw"><button type="button" class="aor-btn sm ghost aor-askbtn" data-act="askmenu" aria-expanded="${!!S.askOpen}"><span class="aor-askav" aria-hidden="true"></span><span>${T("Ask ARCIA")}</span></button>${S.askOpen ? askMenu() : ""}</span>
        <span class="aor-alertw"><button type="button" class="aor-btn sm ghost aor-alertbtn" data-act="alerts" aria-expanded="${!!S.alertsOpen}">${ICON.bell}<span>${T("Price alert")}</span>${alertsFor(S.t).length ? `<em data-no-i18n>${alertsFor(S.t).length}</em>` : ""}</button>${S.alertsOpen ? alertsBox() : ""}</span>
      </div>`;
    // the alert box is a popover: keep what's being typed across a refresh
    if (S.alertsOpen && S.alDraft != null && $("aor-al-price")) $("aor-al-price").value = S.alDraft;
  }
  /// a price whose changed digits roll in (up from below, down from above)
  function roll(p, prev) {
    const a = fp(p), b = prev != null ? fp(prev) : null;
    if (reduce || !b || a === b || !(S.spotChg && Date.now() - S.spotChg < 2500)) return esc(a);
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    const cls = p > prev ? "up" : "dn";
    return esc(a.slice(0, i)) + [...a.slice(i)].map((c, k) => `<span class="aor-rl ${cls}" style="animation-delay:${k * 30}ms">${esc(c)}</span>`).join("");
  }
  /// "8h ago" in the page's language
  const agoTxt = (at) => { const a = ago(at); return a === tr("just now") ? a : L3(`${a} ago`, `${a} 전`, `${a}前`); };
  /// v5: ARCIA's suggested lines for this market — each opens her chat with it
  function askMenu() {
    const sym = "$" + S.tok.symbol, where = RH() ? "Robinhood Chain" : "Arc";
    const lines = [
      [`Is ${sym} (${S.t}) on ${where} safe to trade right now?`, "Is it safe right now?"],
      [`Where are support and resistance for ${sym} (${S.t}) on ${where}?`, "Support and resistance"],
      [`How would you set a take-profit and stop-loss for ${sym} on ${where}?`, "TP / SL ideas"],
    ];
    const b0 = S.tok ? build() : null, mine0 = b0 && b0.err === undefined ? say().replace(/<[^>]+>/g, "") : "";
    if (mine0) lines.push([`Check my order before I sign it: ${mine0} (${sym} on ${where})`, "Check my order"]);
    return `<div class="aor-askpop" role="menu">${lines.map(([q, l]) => `<button type="button" role="menuitem" data-askq="${esc(q)}"><b>${T(l)}</b><small data-no-i18n>${esc(q.length > 80 ? q.slice(0, 78) + "…" : q)}</small></button>`).join("")}<p>${T("ARCIA answers in her chat — not advice. Nothing is placed for you.")}</p></div>`;
  }
  function execChip() {
    const st = S.status;
    if (!LIVE() || !st) return "";
    const k = !st.at ? "off" : st.low || st.ago > 900 ? "bad" : st.ago > 180 ? "warn" : "ok";
    const txt = !st.at ? tr("Executor not running yet") : `${tr("Executor")} · ${tr("checked")} ${ago(st.at)}${st.low ? " · " + tr("low on gas") : ""}`;
    const tip = st.burn ? `${tr("Last fee burn")}: ${num(st.burn.arcircle)} $ARCIRCLE (${st.burn.eth != null ? num(st.burn.eth) + " ETH" : usd(st.burn.usdc)})` : tr("Fills orders every minute");
    const beat = S.beat && Date.now() - S.beat < 4000 && !reduce ? " beat" : "";
    return `<span class="aor-exec ${k}${beat}" title="${esc(tip)}"><i></i><span data-no-i18n>${esc(txt)}</span></span>`;
  }
  // ---------------- v3: the Token Scanner's score and ARCIA DESK's record for this token ----------------
  async function loadScan() {
    const t = S.t, c0 = CH;
    if (!t) return;
    try {
      const r = await fetch(`${API}?scores=${t}${RH() ? "&chain=rh" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (t !== S.t || c0 !== CH) return;
      const d = j && j.scores && j.scores[t];
      S.scan = d ? { score: d.score, k: d.k, crit: d.crit || [], t: d.t } : null;
    } catch { S.scan = null; }
  }
  const SCAN_K = { ok: "OK", caution: "Caution", warn: "Caution", risk: "Risky", bad: "Risky" };
  function scanChip() {
    const s = S.scan;
    if (!s || s.score == null) return S.t ? `<a class="aor-scan none" href="#scanner?${RH() ? "c=rh&" : ""}t=${S.t}" title="${T("Check it in the Token Scanner")}">${T("Scan it")}</a>` : "";
    const k = s.crit && s.crit.length ? "risk" : s.k === "ok" ? "ok" : s.k === "risk" || s.k === "bad" ? "risk" : "warn";
    return `<a class="aor-scan ${k}" href="#scanner?${RH() ? "c=rh&" : ""}t=${S.t}" title="${T("Token Scanner score — an automated check, not advice")}${s.crit && s.crit.length ? " · " + esc(s.crit.slice(0, 2).map((c) => c.title || c).join(" · ")) : ""}"><span data-no-i18n>${Math.round(s.score)}</span> ${T(s.crit && s.crit.length ? "Critical flag" : SCAN_K[s.k] || "Caution")}</a>`;
  }
  async function loadDesk() {
    const t = S.t, c0 = CH;
    if (!t) return;
    try {
      if (!S.deskAll || S.deskAll.ch !== CH || Date.now() - S.deskAll.at > 120e3) { const r = await fetch(`/api/desk${RH() ? "?chain=rh" : ""}`, { cache: "no-store" }); S.deskAll = { ch: CH, at: Date.now(), v: r.ok ? await r.json() : null }; }
      if (t !== S.t || c0 !== CH) return;
      const v = (S.deskAll && S.deskAll.v) || {};
      const open = (v.open || []).find((x) => lc(x.t) === t), rec = (v.recent || []).filter((x) => lc(x.t) === t), rej = (v.rejects || []).find((x) => lc(x.t) === t);
      S.desk = open ? { k: "held" } : rec.length ? { k: "traded", n: rec.length } : rej ? { k: "passed" } : null;
    } catch { S.desk = null; }
  }
  function deskChip() {
    const d = S.desk; if (!d) return "";
    const txt = d.k === "held" ? "ARCIA DESK holds it" : d.k === "traded" ? "ARCIA DESK traded it" : "ARCIA DESK passed on it";
    return `<a class="aor-deskc ${d.k}" href="#desk${RH() ? "?chain=rh" : ""}" title="${T("ARCIA's own small trading wallet — not a tip")}">${T(txt)}</a>`;
  }

  // ---------------- price alerts (this browser) ----------------
  const alertsAll = () => store.get(AK, []).filter((a) => a && isAddr(a.t) && a.price > 0);
  const alertsFor = (t) => alertsAll().filter((a) => a.t === t);
  function alertsBox() {
    const list = alertsFor(S.t);
    return `<div class="aor-alerts" id="aor-alerts">
      <div class="aor-al-row"><span class="aor-in"><input id="aor-al-price" type="text" inputmode="decimal" placeholder="${esc(fp(S.spot))}" aria-label="${T("Alert price")}"><i data-no-i18n>${esc(S.quote.symbol)}</i></span><button type="button" class="aor-btn go sm" data-act="alertadd">${T("Alert me")}</button></div>
      ${S.spot > 0 ? `<div class="aor-al-pct">${[-25, -10, -5, 5, 10, 25].map((k) => `<button type="button" class="${k < 0 ? "dn" : "up"}" data-alpct="${k}" data-no-i18n>${k > 0 ? "+" : "−"}${Math.abs(k)}%</button>`).join("")}</div>` : ""}
      <p class="aor-note">${T("This browser tells you when the pool price crosses it — keep the tab open, or turn on notifications.")}</p>
      ${me() ? `<button type="button" class="aor-altg${tgOn() ? " on" : ""}" data-act="altg" role="switch" aria-checked="${tgOn()}"><i aria-hidden="true"></i><span>${T("Also on Telegram")}</span><small>${T(tgOn() ? "New alerts here go to the ARCIA bot too — send it /orderalerts on" : "Your wallet's alerts, sent by the ARCIA bot even with this tab closed")}</small></button>` : ""}
      ${list.length ? `<ul>${list.map((a, i) => `<li><span>${T(a.dir === "up" ? "rises to" : "falls to")} <b data-no-i18n>${fp(a.price)}</b>${a.tg ? ` <em class="aor-tgmark" title="${T("Also on Telegram")}" data-no-i18n>TG</em>` : ""}</span><button type="button" class="aor-x" data-alertdel="${i}" aria-label="${T("Remove")}">${ICON.close}</button></li>`).join("")}</ul>` : ""}
    </div>`;
  }
  // v3: price alerts mirrored to the server (signed with the orders view signature), DM'd by the ARCIA bot
  const TGK = "arcircle.orders.altg";
  const tgOn = () => store.get(TGK, false) === true && !!(me() && viewOf(me()));
  async function tgSync(a, remove) {
    const w = me(), v = w && viewOf(w), p0 = pool();
    if (!v || !p0 || !S.tok || !S.quote) return false;
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "orderalert", wallet: w, until: v.until, sig: v.sig, token: a.t, sym: a.sym, price: a.price, dir: a.dir, poolId: p0.id, tokenIs0: !!p0.tokenIs0, td: S.tok.decimals, qd: S.quote.decimals, chain: RH() ? "rh" : undefined, ...(remove ? { remove: true } : {}) }) });
      return r.ok;
    } catch { return false; }
  }
  async function altg() {
    const w = me(); if (!w) return;
    if (!viewOf(w)) { await unlock(); if (!viewOf(w)) return; }
    const on = !(store.get(TGK, false) === true);
    store.set(TGK, on);
    if (on) { // what's already set in this browser for this market goes along
      const all = alertsAll(); let n = 0;
      for (const a of all) if (a.t === S.t && !a.tg && (await tgSync(a))) { a.tg = true; n++; }
      store.set(AK, all);
      toast(tr("Telegram alerts on"), "fill", `${n ? `${n} ${tr(n === 1 ? "alert sent along" : "alerts sent along")} · ` : ""}${tr("send /orderalerts on to the ARCIA bot")}`);
    }
    market();
  }
  function checkAlerts() {
    if (!S.spot || !S.t) return;
    // v6: one of my limit orders the price has come within 2% of — a heads-up once per order (not for ones already
    // that close when the page opened)
    if (S.mine && S.mine.orders) {
      const first = !S.nearSeen; S.nearSeen = S.nearSeen || new Set();
      for (const o of S.mine.orders) {
        if (o.status !== "open" || o.type !== "limit" || !(o.price > 0) || lc((o.token && o.token.address) || o.token || "") !== S.t || S.nearSeen.has(o.hash)) continue;
        const gap = (o.price - S.spot) / S.spot;
        if (Math.abs(gap) < 0.02 && (o.side === "buy" ? gap < 0 : gap > 0)) {
          S.nearSeen.add(o.hash);
          if (!first) { const msg = `${tr(o.side === "buy" ? "Your buy is close" : "Your sell is close")} · $${(S.tok && S.tok.symbol) || ""} ${fp(o.price)}`; toast(msg, "alert", `${pc(Math.abs(gap) * 100, 1).replace(/^\+/, "")} ${L3("away", "남음", "之差")}`); notify("ARCIRCLE Orders", msg); }
        }
      }
    }
    const all = alertsAll(), keep = [];
    for (const a of all) {
      if (a.t !== S.t) { keep.push(a); continue; }
      if ((a.dir === "up" && S.spot >= a.price) || (a.dir === "down" && S.spot <= a.price)) {
        const msg = `$${a.sym} ${tr(a.dir === "up" ? "rose to" : "fell to")} ${fp(S.spot)} ${S.quote.symbol}`;
        toast(msg, "alert"); notify("ARCIRCLE Orders", msg);
      } else keep.push(a);
    }
    if (keep.length !== all.length) { store.set(AK, keep); market(); }
  }

  /// a logo the page already knows: $ARCIRCLE's own, or an ArcPad launch's (Explore's list)
  function localLogo(a) {
    if (a === ARCIRCLE()) return "/images/arcircle-mark-sm.png";
    const l = !RH() && typeof ARC !== "undefined" && Array.isArray(ARC.launches) ? ARC.launches.find((x) => lc(x.token) === a) : null;
    return l && /^https:\/\//i.test(l.imageUrl || "") ? l.imageUrl : null;
  }
  // ---------------- open a market ----------------
  async function open(addr) {
    addr = lc(addr);
    if (!isAddr(addr)) { S.msg = { k: "bad", t: "Paste a token contract address (0x…)." }; form(); return; }
    if (addr === BASE() || (RH() && addr === ZERO_ADDR)) { S.msg = { k: "bad", t: RH() ? "ETH is the quote — pick the token you want to trade." : "USDC is the quote — pick the token you want to trade." }; form(); return; }
    const c0 = CH;
    // prices belong to one market: a new market starts the price fields empty
    if (addr !== S.t) { for (const k of ["price", "amount", "total", "trigger", "tp", "sl", "floor", "cap", "lo", "hi", "btp", "bsl", "condP"]) F[k] = ""; F.brk = false; F.condOn = false; S.fatArm = null; S.moveAsk = null; S.askOpen = false; }
    Object.assign(S, { t: addr, tok: null, quote: null, pools: [], pi: 0, spot: null, prevSpot: null, book: null, err: null, loadingMkt: true, msg: null, candles: null, tax: null, agentCall: null, editing: null, alertsOpen: false, scan: null, desk: null, supply: null, pending: false, poolL: null, drop: null });
    S.prevLevels = new Map();
    if ($("aor-in")) $("aor-in").value = addr;
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#orders?t=${addr}${RH() ? "&c=rh" : ""}`);
    chips(); market(); bookView(); chartView(); form(); mineView();
    // v5: a market Orders already knows opens from its book at once (the pool key, the pair, the price); the pool
    // reader then fills in the venue, the liquidity and the logo — and can't keep the page waiting past ~20 s
    const bookP = fetch(`${API}?orders=book&token=${addr}${CQ()}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let quick = false;
    bookP.then((bk) => {
      if (S.t !== addr || c0 !== CH || S.tok || !bk || !bk.key || !bk.poolId || !bk.token || !bk.quote) return;
      quick = true;
      S.book = bk;
      const tokenIs0 = lc(bk.key.currency0) === addr;
      S.pools = [{ id: lc(bk.poolId), key: bk.key, tokenIs0, quote: bk.quote, price: bk.spot || null, venue: "Uniswap v4" }]; S.pi = 0;
      S.tok = { address: addr, symbol: bk.token.symbol || "TOKEN", decimals: Number(bk.token.decimals ?? 18), logo: localLogo(addr) };
      S.quote = { address: lc(bk.quote.address), symbol: bk.quote.symbol || (RH() ? "ETH" : "USDC"), decimals: Number(bk.quote.decimals ?? (RH() ? 18 : 6)) };
      S.spot = bk.spot || null; S.loadingMkt = false;
      addRecent(addr, S.tok.symbol);
      chips(); market(); bookView(); chartView(); form(); dockState(); strip();
      Promise.all([loadSpot(), loadBal(), loadCandles(), loadSupply(), loadPoolL()]).then(() => { if (S.t === addr && c0 === CH) { market(); bookView(); chartView(); form(); } });
    });
    try {
      let j = null;
      const t0 = Date.now();
      // v5.1: each look-up gets 20 s, the whole search 35 s; past 6 s the page says it's still looking
      const slowT = setTimeout(() => { if (S.t === addr && S.loadingMkt) { S.slowMkt = true; market(); } }, 6000);
      try {
        for (let i = 0; i < 20; i++) {
          // Arc: the Liquidity Manager's pool reader; Robinhood Chain: its own (Dexscreener, then the pools' keys)
          let r = null;
          try { r = await fetch(RH() ? `${API}?orders=pools&token=${addr}&chain=rh` : `${API}?liq=${addr}&lite=1`, { cache: "no-store", signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined }); } catch { r = null; } // lite: pools and prices only
          j = r ? await r.json().catch(() => null) : null;
          if (S.t !== addr || c0 !== CH) return;
          if (!r || r.status === 503 || r.status === 504 || (j && !j.done && !(j.pools && j.pools.length))) {
            if (Date.now() - t0 > 35000) { if (quick) return; throw new Error(tr("Reading this token's pools is taking too long.")); }
            await new Promise((res) => setTimeout(res, 1200)); continue;
          }
          if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
          break;
        }
      } finally { clearTimeout(slowT); S.slowMkt = false; }
      // Arc's books trade against ERC-20s; Robinhood Chain's against ETH, native (currency 0x0) or WETH
      const pools = ((j && j.pools) || []).filter((p) => p.key && p.quote && isAddr(p.quote.address) && (RH() || lc(p.key.currency0) !== ZERO_ADDR));
      pools.sort((a, b) => (lc(b.quote.address) === BASE()) - (lc(a.quote.address) === BASE()) || ((b.dex && b.dex.liqUsd) || 0) - ((a.dex && a.dex.liqUsd) || 0) || Number(BigInt(b.liquidity || 0) > BigInt(a.liquidity || 0)) - Number(BigInt(b.liquidity || 0) < BigInt(a.liquidity || 0)));
      const q = pools[0] && lc(pools[0].quote.address);
      const found = pools.filter((p) => lc(p.quote.address) === q); // one book per token: one quote
      if (!found.length) { if (quick) return; throw new Error(RH() ? "No Uniswap v4 pool against ETH found for this token on Robinhood Chain." : "No Uniswap v4 pool found for this token on Arc."); }
      // opened from the book already: keep its pool selected, take the rest
      const keep = quick && pool() ? pool().id : null;
      S.pools = found; S.pi = keep ? Math.max(0, found.findIndex((p) => lc(p.id) === lc(keep))) : 0;
      S.tok = { address: addr, symbol: (j.token && j.token.symbol) || (S.tok && S.tok.symbol) || "TOKEN", decimals: Number((j.token && j.token.decimals) ?? (S.tok ? S.tok.decimals : 18)), logo: (j.token && j.token.logo) || localLogo(addr) };
      S.quote = { address: q, symbol: pools[0].quote.symbol || (RH() ? "ETH" : "USDC"), decimals: Number(pools[0].quote.decimals ?? (RH() ? 18 : 6)) };
      if (!quick || !S.spot) S.spot = pool().price || null;
      // v4: a Pons token still on its bonding curve — the pool it graduates into, not open yet (limit buys wait for it)
      S.pending = !!pool().pending;
      if (S.pending) { S.type = "limit"; S.side = "buy"; }
      addRecent(addr, S.tok.symbol);
    } catch (e) {
      if (!quick) S.err = String((e && e.message) || e);
    }
    if (c0 !== CH || S.t !== addr) return;
    S.loadingMkt = false;
    chips(); market(); chartView(); form();
    if (!S.tok) return;
    await Promise.all([loadBook(), loadSpot(), loadBal(), loadCandles(), loadSupply(), loadPoolL()]);
    if (S.t !== addr || c0 !== CH) return;
    market(); bookView(); chartView(); form(); mineView(); dockState(); strip();
    if (!S.pending) loadTax().then(() => { market(); form(); });
    Promise.all([loadScan(), loadDesk()]).then(() => { if (S.t === addr && c0 === CH) { market(); form(); } });
    if (CH !== "sol") loadAgent().then(() => market()); // ARCIA AGENT v2: her calls on Arc and Robinhood Chain
  }

  // ---------------- live data ----------------
  async function loadBook() {
    if (!S.t) return;
    const t = S.t, c0 = CH;
    try { const r = await fetch(`${API}?orders=book&token=${t}${CQ()}`, { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (t === S.t && c0 === CH) S.book = j; } } catch { /* keep */ }
  }
  async function loadSpot() {
    const p = pool(); const L = window.ArcLiqCore; const prov = rp();
    if (!p || !L || !prov) return;
    try {
      const h = await new ethers.Contract(PM, ["function extsload(bytes32) view returns (bytes32)"], prov).extsload(L.poolSlot(p.id, ethers.keccak256));
      const s0 = L.decodeSlot0(h);
      if (s0.sqrtP > 0n) {
        const v = L.priceOf(s0.sqrtP, p.tokenIs0, p.tokenIs0 ? S.tok.decimals : S.quote.decimals, p.tokenIs0 ? S.quote.decimals : S.tok.decimals);
        if (S.spot && v !== S.spot) { S.prevSpot = S.spot; S.spotChg = Date.now(); }
        S.spot = v;
      }
    } catch { /* keep the last price */ }
  }
  /// v4: the pool's active liquidity (Uniswap v4 State.liquidity, three slots after slot0) — the depth chart's pool curve
  async function loadPoolL() {
    const p = pool(); const L = window.ArcLiqCore; const prov = rp();
    if (!p || !L || !prov || S.pending) { S.poolL = null; return; }
    try {
      const slot = BigInt(L.poolSlot(p.id, ethers.keccak256)) + 3n;
      const h = await new ethers.Contract(PM, ["function extsload(bytes32) view returns (bytes32)"], prov).extsload(ethers.toBeHex(slot, 32));
      if (pool() === p) S.poolL = { id: p.id, L: BigInt.asUintN(128, BigInt(h)) };
    } catch { S.poolL = null; }
  }
  async function loadBal() {
    const a = me(), prov = rp(), c0 = CH;
    if (!a || !S.tok || !prov) { S.bal = {}; S.weth = null; S.eth = null; return; }
    try {
      const [bt, bq, eth] = await Promise.all([...[S.tok.address, S.quote.address].map((t) => new ethers.Contract(t, ERC20, prov).balanceOf(a)), RH() ? prov.getBalance(a) : null]);
      if (c0 !== CH) return;
      S.bal = { [S.tok.address]: bt, [S.quote.address]: bq };
      // Robinhood Chain: what can pay for a buy is WETH plus ETH (wrapped when the order needs it), less a little for gas
      if (RH()) { S.weth = bq; S.eth = eth; S.bal[S.quote.address] = bq + (eth > GAS_KEEP ? eth - GAS_KEEP : 0n); } else { S.weth = null; S.eth = null; }
      // what ARCIRCLE Orders may already pull (the steps preview ticks "Approve" when it covers the order)
      if (LIVE()) {
        const [at, aq] = await Promise.all([S.tok.address, S.quote.address].map((t) => new ethers.Contract(t, ERC20, prov).allowance(a, ORDERS()).catch(() => null)));
        if (c0 === CH) S.allow = { [S.tok.address]: at, [S.quote.address]: aq };
      }
    } catch { /* keep */ }
    loadFee();
  }
  /// fee-free? (the contract's feeOf) and the threshold (its policy's discountMin)
  async function loadFee() {
    const a = me();
    if (!LIVE() || !a) { S.feeFree = false; return; }
    try {
      const c = new ethers.Contract(ORDERS(), ORDERS_ABI, rp());
      const [f, pol] = await Promise.all([c.feeOf(a, 10000n), S.freeMin ? null : c.feePolicy().catch(() => null)]);
      const was = S.feeFree;
      S.feeFree = f === 0n;
      if (pol && pol !== ethers.ZeroAddress) { const m = await new ethers.Contract(pol, ["function discountMin() view returns (uint256)"], rp()).discountMin().catch(() => null); if (m != null) S.freeMin = Number(ethers.formatEther(m)); }
      if (was !== S.feeFree) { const sum = $("aor-sum"); if (sum) sum.innerHTML = summary(); }
    } catch { /* keep */ }
  }
  async function loadMine() {
    const a = me();
    if (!a) { S.mine = null; S.locked = false; return; }
    const v = viewOf(a);
    if (!v) { S.mine = null; S.locked = true; return; }
    try {
      const c0 = CH;
      const r = await fetch(`${API}?orders=mine&wallet=${a}&until=${v.until}&sig=${v.sig}${CQ()}`, { cache: "no-store" });
      if (c0 !== CH) return;
      if (r.status === 401) { store.set(viewKey(a), null); S.locked = true; S.mine = null; return; }
      if (r.ok) { const j = await r.json(); const first = !S.mine; diffMine(S.mine, j); S.mine = j; S.locked = false; if (first) bracketCheck(j); }
    } catch { /* keep */ }
  }
  async function loadStatus() {
    if (!LIVE() && !RH()) return;
    const c0 = CH;
    try { const r = await fetch(`${API}?orders=status${CQ()}`, { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (c0 === CH) { if (S.status && j.at && j.at !== S.status.at) S.beat = Date.now(); S.status = j; if (j.ethUsd > 0) S.ethUsd = j.ethUsd; } } } catch { /* keep */ }
  }
  async function loadCandles() {
    const p = pool(); if (!p) return;
    try {
      const r = await fetch(`${API}?orders=candles&pool=${p.id}${CQ()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || pool() !== p) return;
      // raw currency1-per-currency0 → quote per token; quote volume
      const d0 = p.tokenIs0 ? S.tok.decimals : S.quote.decimals, d1 = p.tokenIs0 ? S.quote.decimals : S.tok.decimals, k = 10 ** (d0 - d1);
      const conv = (r0) => (p.tokenIs0 ? r0 * k : 1 / (r0 * k));
      const qIs0 = !p.tokenIs0;
      S.candles = { pool: p.id, complete: j.complete, list: (j.candles || []).map(([t, o, h, l, c, v0, v1]) => {
        const O = conv(o), H = p.tokenIs0 ? conv(h) : conv(l), Lo = p.tokenIs0 ? conv(l) : conv(h), C = conv(c);
        return [t, O, H, Lo, C, (qIs0 ? v0 : v1) / 10 ** S.quote.decimals];
      }) };
    } catch { /* keep */ }
  }
  /// a $10 (0.005 ETH) buy and sell straight back through the pool: the pool fee both ways plus any token tax
  async function loadTax() {
    const p = pool(); if (!LIVE() || !p || !S.tok) return;
    try {
      const x = RH() ? 5n * 10n ** 15n : 10n * 10n ** BigInt(S.quote.decimals);
      const got = await quoteOut(p, S.quote.address, x);
      const back = got ? await quoteOut(p, S.tok.address, got) : null;
      if (back != null) S.tax = Math.max(0, (1 - Number(back) / Number(x)) * 100);
    } catch { /* unknown */ }
  }
  async function loadAgent() {
    try {
      // ARCIA AGENT v2: this chain's call, if it's under a day old (else a link to ask her)
      const t = S.t, c0 = CH;
      const r = await fetch(`/api/desk?agent=lasts&ts=${t}${RH() ? "&chain=rh" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (t !== S.t || c0 !== CH) return;
      const c = j && j.calls && j.calls[t];
      S.agentCall = c && c.call ? { call: c.call, at: c.at, why: c.why || [] } : { none: true };
    } catch { S.agentCall = null; }
  }

  // ---------------- the order book ----------------
  const myLevels = () => {
    const out = new Set();
    for (const o of ((S.mine && S.mine.orders) || [])) if (lc(o.token.address || o.token) === S.t && o.status === "open" && o.type === "limit") out.add(o.side + ":" + group(sig4(o.price), o.side === "sell" ? "sell" : "buy"));
    return out;
  };
  const sig4 = (p) => { if (!(p > 0)) return 0; const e = Math.floor(Math.log10(p)) - 3; return Math.round(p / 10 ** e) * 10 ** e; }; // the server's level rounding
  /// the price step the book is grouped by (0 = as the server sends it, 4 significant figures)
  const steps = () => { if (!S.spot) return []; const e = Math.floor(Math.log10(S.spot)); return [e - 3, e - 2, e - 1].map((k) => 10 ** k); };
  const group = (p, side) => { const st = S.prec; if (!st) return p; const k = p / st; return Number(((side === "sell" ? Math.ceil(k - 1e-9) : Math.floor(k + 1e-9)) * st).toPrecision(12)); };
  function levels(raw, side) {
    const g = new Map();
    for (const l of raw || []) { const p = group(l.price, side); const v = g.get(p) || { price: p, amount: 0, orders: 0 }; v.amount += l.amount; v.orders += l.orders; g.set(p, v); }
    return [...g.values()].sort((a, b) => (side === "sell" ? a.price - b.price : b.price - a.price));
  }
  function precSelect() {
    const el = $("aor-prec"); if (!el) return;
    const opts = [[0, tr("Auto")], ...steps().map((s) => [s, fp(s)])];
    el.innerHTML = opts.map(([v, l]) => `<option value="${v}"${S.prec === v ? " selected" : ""}>${esc(l)}</option>`).join("");
  }
  function bookView() {
    const el = $("aor-book"); if (!el) return;
    precSelect();
    if (!S.tok) { el.innerHTML = S.t && S.loadingMkt ? skel(14) : `<div class="aor-empty">${T(S.t ? "…" : "No market open")}</div>`; return; }
    if (!S.book) { el.innerHTML = skel(14); return; }
    const b = S.book || { asks: [], bids: [], fills: [] };
    if (S.left === "trades") { el.innerHTML = tradesHtml(b); return; }
    const mine = myLevels();
    const ROWS = 10;
    const asks = levels(b.asks, "sell").slice(0, ROWS), bids = levels(b.bids, "buy").slice(0, ROWS);
    let ca = 0, cb = 0;
    const askCum = asks.map((l) => (ca += l.amount)), bidCum = bids.map((l) => (cb += l.amount));
    const max = Math.max(ca, cb, 1e-18), big = Math.max(1e-18, ...asks.map((l) => l.amount), ...bids.map((l) => l.amount));
    const seen = new Map(), bars = new Map();
    const row = (l, cum, side, i) => {
      const key = side + ":" + l.price, prev = S.prevLevels.get(key);
      seen.set(key, l.amount);
      const fl = reduce || prev === undefined ? (S.prevLevels.size ? " fl-new" : "") : l.amount > prev + 1e-12 ? " fl-up" : l.amount < prev - 1e-12 ? " fl-dn" : "";
      const dist = S.spot ? ((l.price - S.spot) / S.spot) * 100 : null;
      // v4: a depth bar grows (or shrinks) from the width it had on the last read
      const dw = (cum / max) * 100, d0 = S.prevBar.get(key);
      bars.set(key, dw);
      const grow = !reduce && d0 != null && Math.abs(d0 - dw) > 0.5 ? ` grow" data-d0="1` : "";
      return `<button type="button" class="aor-lv ${side === "sell" ? "dn" : "up"}${i === 0 ? " best" : ""}${mine.has(side + ":" + l.price) ? " mine" : ""}${fl}${grow}" data-price="${l.price}" data-side="${side}" style="--d:${dw.toFixed(1)}%;${d0 != null ? `--d0:${d0.toFixed(1)}%;` : ""}--h:${(0.15 + (l.amount / big) * 0.85).toFixed(2)}" title="${l.orders} ${esc(tr(l.orders === 1 ? "order" : "orders"))}${dist != null ? ` · ${pc(dist)} ${esc(tr("vs pool"))}` : ""}"><b data-no-i18n>${fp(l.price)}${i === 0 && dist != null ? `<i class="aor-lv-d ${Math.abs(dist) > 25 ? "far" : ""}">${pc(dist, Math.abs(dist) >= 10 ? 0 : 1)}</i>` : ""}</b><span data-no-i18n>${num(l.amount)}</span><em data-no-i18n>${num(l.amount * l.price)}</em></button>`;
    };
    const pad = (n) => Array.from({ length: Math.max(0, ROWS - n) }, () => '<div class="aor-lv ph" aria-hidden="true"></div>').join("");
    // v5: a level that just left the book folds away (one read), instead of vanishing
    const gone = (side, list) => {
      if (reduce || !S.prevLevels.size) return "";
      const out = [];
      for (const [k, amt] of S.prevLevels) { const [sd, p0] = k.split(":"); if (sd !== side || seen.has(k) || !(amt > 0)) continue; const pr = Number(p0); if (list.length && (side === "sell" ? pr > list[list.length - 1].price : pr < list[list.length - 1].price)) continue; out.push(`<div class="aor-lv ${side === "sell" ? "dn" : "up"} fl-gone" aria-hidden="true"><b data-no-i18n>${fp(pr)}</b><span data-no-i18n>${num(amt)}</span><em></em></div>`); }
      return out.slice(0, 2).join("");
    };
    const bestAsk = asks[0] && asks[0].price, bestBid = bids[0] && bids[0].price;
    const spread = bestAsk && bestBid ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 : null;
    const dir = S.prevSpot && S.spot ? (S.spot > S.prevSpot ? "up" : S.spot < S.prevSpot ? "dn" : "") : "";
    const fresh = S.spotChg && Date.now() - S.spotChg < 2500;
    const empty = !asks.length && !bids.length;
    // v5: one side empty — its faint ladder and a nudge to make the first order on that side
    const oneSide = !empty && (!asks.length || !bids.length) && S.spot && !S.pending;
    const cta = (side) => `<div class="aor-cta ${side === "sell" ? "dn" : "up"}"><span>${T(side === "sell" ? "No sell orders yet." : "No buy orders yet.")}</span><button type="button" class="aor-link" data-price="${Number((S.spot * (side === "sell" ? 1.02 : 0.98)).toPrecision(4))}" data-sug="${side}">${T(side === "sell" ? "Place the first sell at +2%" : "Place the first bid at −2%")}</button></div>`;
    // an empty book: a faint ladder around the pool price, one tap from a price
    const ghost = (side) => !S.spot ? [] : [1, 2, 3, 5, 10].map((k) => { const pr = Number((S.spot * (1 + (side === "sell" ? k : -k) / 100)).toPrecision(4)); return `<button type="button" class="aor-lv ${side === "sell" ? "dn" : "up"} ghost" data-price="${pr}" data-sug="${side === "sell" ? "sell" : "buy"}" title="${T(side === "sell" ? "Sell" : "Buy")} ${side === "sell" ? "+" : "−"}${k}%"><b data-no-i18n>${fp(pr)}</b><span data-no-i18n>${side === "sell" ? "+" : "−"}${k}%</span><em>${T(side === "sell" ? "Sell here" : "Buy here")}</em></button>`; });
    const askH = asks.map((l, i) => row(l, askCum[i], "sell", i)).reverse().join(""), bidH = bids.map((l, i) => row(l, bidCum[i], "buy", i)).join("");
    const gA = empty ? "" : gone("sell", asks), gB = empty ? "" : gone("buy", bids), nG = (x) => (x.match(/fl-gone/g) || []).length;
    const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : null;
    el.innerHTML = `<div class="aor-th"><span>${T("Price")} <i data-no-i18n>${esc(S.quote.symbol)}</i></span><span>${T("Amount")}</span><span>${T("Total")}</span></div>
      <div class="aor-asks">${empty || (oneSide && !asks.length) ? (oneSide ? cta("sell") + pad(ROWS - 6) : pad(ROWS - 5)) + ghost("sell").reverse().join("") : pad(asks.length + nG(gA)) + askH + gA}</div>
      <div class="aor-mid"><b data-no-i18n class="${fresh ? dir : ""}">${roll(S.spot, S.prevSpot)}<i class="aor-arrow ${dir}" aria-hidden="true"></i></b><small>${T("pool price")}</small>${usdTag(S.spot, "mid")}${b.last ? `<span class="aor-midlast">${T("last")} <span data-no-i18n>${fp(b.last)}</span></span>` : ""}${spread != null ? `<em>${T("spread")} <span data-no-i18n>${spread.toFixed(2)}%</span><small data-no-i18n>${fp(bestAsk - bestBid)}</small></em><em class="aor-midp" data-no-i18n>${esc(L3("mid", "중간가", "中间价"))} <span>${fp(mid)}</span></em>` : ""}</div>
      <div class="aor-bids">${empty || (oneSide && !bids.length) ? ghost("buy").join("") + (oneSide ? cta("buy") + pad(ROWS - 6) : pad(ROWS - 5)) : gB + bidH + pad(bids.length + nG(gB))}</div>
      ${empty ? `<p class="aor-first"><b>${T("No orders here yet — be the first.")}</b> <span>${T(S.pending ? "Limit buys placed now wait here for the pool to open." : "The faint rows are prices around the pool: tap one to start an order there.")}</span></p>`
        : `<p class="aor-foot">${T("Orders below the ask and above the bid fill from the pool as soon as its price gets there.")}</p>`}`;
    // v6: on a wide screen the book keeps the latest trades under it
    if (innerWidth >= 1680 && (b.fills || []).length) { const tw = document.createElement("div"); tw.className = "aor-booktr"; tw.innerHTML = `<small>${T("Latest Orders fills")}</small>` + tradesHtml({ ...b, fills: b.fills.slice(0, 8) }); el.appendChild(tw); }
    S.prevLevels = seen; S.prevBar = bars;
    emblem(ca, cb);
  }
  /// loading rows that shimmer
  const skel = (n) => `<div class="aor-skel" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--w:${55 + ((i * 37) % 40)}%"></i>`).join("")}</div>`;
  function tradesHtml(b) {
    const flash = (f) => { const k = f.tx + ":" + (f.li ?? f.h); const seen = S.prevFill.has(k); S.prevFill.set(k, 1); return seen || !S.prevFill.size ? "" : " fl-new"; };
    return `<div class="aor-th"><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Time")}</span></div>` +
      (b.fills && b.fills.length ? `<div class="aor-trades">${b.fills.map((f) => `<a class="aor-tr ${f.side === "buy" ? "up" : "dn"}${flash(f)}" href="${EXPL("tx", f.tx)}" target="_blank" rel="noopener" title="${T(f.via === "match" ? "Wallet to wallet" : f.via === "market" ? "Market order" : "Filled from the pool")}"><b data-no-i18n>${fp(f.price)}</b><span data-no-i18n>${num(f.amount)}</span><em data-no-i18n>${hhmm(f.at)}<i>${f.via === "match" ? "P2P" : f.via === "market" ? "MKT" : "POOL"}</i></em></a>`).join("")}</div>`
        : `<div class="aor-empty">${T("No fills yet in this market.")}</div>`);
  }
  /// the hero emblem leans with the book: ask bars by the sell side's size, bid bars by the buy side's
  function emblem(asks, bids) {
    const e = panel.querySelector(".aor-emblem"); if (!e) return;
    const tot = asks + bids;
    e.style.setProperty("--ask", tot ? (0.45 + (asks / tot) * 0.75).toFixed(2) : "1");
    e.style.setProperty("--bid", tot ? (0.45 + (bids / tot) * 0.75).toFixed(2) : "1");
  }

  // ---------------- chart, depth, Dexscreener ----------------
  /// v6: a new chart tab slides in
  const swapIn = () => { const el = $("aor-chart"); if (!el || reduce) return; el.classList.remove("sw"); void el.offsetWidth; el.classList.add("sw"); };
  function chartView() {
    const el = $("aor-chart"); if (!el) return;
    const tfs = $("aor-tfs"); if (tfs) tfs.hidden = S.center !== "chart";
    const p = pool();
    const dl = $("aor-mt-dex"); if (dl) { dl.hidden = !p || !!p.pending; if (p) dl.href = `https://dexscreener.com/${RH() ? "robinhood" : "arc"}/${encodeURIComponent(p.id)}`; }
    if (!p) { el.innerHTML = `<div class="aor-empty">${T(S.t && S.loadingMkt ? "…" : "The chart shows up when a market is open.")}</div>`; delete el.dataset.pool; return; }
    if (S.center === "depth") { el.innerHTML = depthSvg(); delete el.dataset.pool; return; }
    if (S.center === "pool") { el.innerHTML = poolPanel(); delete el.dataset.pool; loadImpact(); return; }
    if (S.center === "dex") {
      if (el.dataset.pool === "dex:" + p.id && el.querySelector("iframe")) return;
      el.dataset.pool = "dex:" + p.id;
      el.innerHTML = `<iframe title="${T("Price chart")}" loading="lazy" src="https://dexscreener.com/${RH() ? "robinhood" : "arc"}/${encodeURIComponent(p.id)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15"></iframe>`;
      return;
    }
    if (el.dataset.pool !== "c:" + p.id || !el.querySelector("canvas")) {
      el.dataset.pool = "c:" + p.id;
      el.innerHTML = `<div class="aor-cv"><canvas id="aor-cv" aria-label="${T("Price chart")}" role="img"></canvas><div class="aor-tip" id="aor-tip" hidden></div><div class="aor-cmsg" id="aor-cmsg" hidden></div><button type="button" class="aor-tapuse" id="aor-tapuse" data-act="usetap" hidden></button><div class="aor-mvbar" id="aor-mvbar" hidden></div></div>`;
      const cv = $("aor-cv");
      const at = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      // v2: drag one of your limit lines to move it; click anywhere on the chart to use that price
      cv.addEventListener("pointerdown", (e) => {
        const p = at(e), m = S.cmap; if (!m || p.x > m.cw) return;
        const ln = (m.lines || []).find((l) => l.h && Math.abs(m.y(l.p) - p.y) < 7);
        S.press = { x: p.x, y: p.y, line: ln || null };
        if (ln) { S.drag = { h: ln.h, y: p.y, p0: ln.p }; try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ } e.preventDefault(); }
      });
      cv.addEventListener("pointermove", (e) => {
        const p = at(e); S.hover = p;
        const m = S.cmap;
        if (S.drag) S.drag.y = p.y;
        cv.style.cursor = S.drag ? "grabbing" : m && (m.lines || []).some((l) => l.h && Math.abs(m.y(l.p) - p.y) < 7) && p.x < m.cw ? "ns-resize" : "crosshair";
        draw();
      });
      cv.addEventListener("pointerup", (e) => {
        const p = at(e), m = S.cmap, pr = S.press; S.press = null;
        const dr = S.drag; S.drag = null;
        if (!m || !pr) return;
        const price = Number(m.pAt(p.y).toPrecision(4));
        if (!(price > 0)) { draw(); return; }
        if (dr && Math.abs(p.y - pr.y) > 3) { moveOrder(dr.h, price); draw(); return; }
        // a touch only moves the crosshair (a phone's tap is for reading the chart); a mouse click uses the price
        if (e.pointerType !== "touch" && Math.abs(p.x - pr.x) < 6 && Math.abs(p.y - pr.y) < 6 && p.x < m.cw) pickPrice(price);
        // v5: a tap offers the price on a small button (one more tap puts it in the form)
        else if (e.pointerType === "touch" && Math.abs(p.x - pr.x) < 8 && Math.abs(p.y - pr.y) < 8 && p.x < m.cw) tapOffer(price, p.y);
        draw();
      });
      cv.addEventListener("pointercancel", () => { S.drag = null; S.press = null; draw(); });
      cv.addEventListener("pointerleave", () => { if (!S.drag) { S.hover = null; draw(); } });
      if ("ResizeObserver" in window) new ResizeObserver(() => draw()).observe(cv.parentNode);
    }
    draw();
  }
  /// the candles at the chosen timeframe, from the 5-minute ones
  function series() {
    const c = S.candles && S.candles.list;
    if (!c || !c.length) return [];
    const tf = S.tf, out = [];
    for (const [t, o, h, l, cl, v] of c) {
      const b = Math.floor(t / tf) * tf, last = out[out.length - 1];
      if (last && last[0] === b) { last[2] = Math.max(last[2], h); last[3] = Math.min(last[3], l); last[4] = cl; last[5] += v; }
      else out.push([b, o, h, l, cl, v]);
    }
    // v6: the candle in progress follows the pool's price between candle reads (a new period opens one at the last close)
    if (S.spot > 0 && out.length && !S.pending) {
      const b = Math.floor(now() / tf) * tf, last = out[out.length - 1];
      if (last[0] === b) { last[4] = S.spot; last[2] = Math.max(last[2], S.spot); last[3] = Math.min(last[3], S.spot); }
      else if (b > last[0] && b - last[0] <= tf * 3) out.push([b, last[4], Math.max(last[4], S.spot), Math.min(last[4], S.spot), S.spot, 0]);
    }
    return out.slice(-120);
  }
  function draw() {
    const cv = $("aor-cv"); if (!cv) return;
    const wrap = cv.parentNode, W = Math.max(200, wrap.clientWidth), H = Math.max(220, wrap.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const data = series(), msg = $("aor-cmsg");
    if (!data.length) {
      S.cmap = null;
      if (msg) { msg.hidden = false; msg.innerHTML = S.pending ? `${T("Its pool opens when it graduates from the Pons curve — the chart starts with its first trade.")}` : S.candles ? `${T("No trades in this pool in the last 3 days.")} <button type="button" class="aor-link" data-center="dex" data-no-i18n>Dexscreener</button>` : `<div class="aor-cskel" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--h:${30 + ((i * 53) % 55)}%;animation-delay:${(i % 8) * 80}ms"></i>`).join("")}</div><span class="aor-cskel-t"><span class="aor-spin"></span>${T("Reading the pool's trades…")}</span>`; }
      return;
    }
    if (msg) msg.hidden = true;
    const AX = 66, VB = 0.18, PADT = 14, PADB = 22;
    const cw = W - AX, ph = (H - PADT - PADB) * (1 - VB), vt = PADT + ph + 6, vh = (H - PADT - PADB) * VB - 6;
    const lines = orderLines(), mf = myFills();
    let lo = Math.min(...data.map((d) => d[3])), hi = Math.max(...data.map((d) => d[2]));
    if (mf.avg && mf.avg > lo * 0.7 && mf.avg < hi * 1.3) { lo = Math.min(lo, mf.avg); hi = Math.max(hi, mf.avg); }
    for (const l of lines) if (l.p > lo * 0.7 && l.p < hi * 1.3) { lo = Math.min(lo, l.p); hi = Math.max(hi, l.p); }
    if (S.spot) { lo = Math.min(lo, S.spot); hi = Math.max(hi, S.spot); }
    if (hi === lo) { hi *= 1.01; lo *= 0.99; }
    const padP = (hi - lo) * 0.08; hi += padP; lo -= padP;
    const y = (p) => PADT + (1 - (p - lo) / (hi - lo)) * ph;
    const pAt = (yy) => lo + (1 - (yy - PADT) / ph) * (hi - lo);
    // v2: a few candles read better as a line across the whole width
    const n = data.length, lineMode = n < 12;
    const bw = lineMode ? cw / Math.max(1, n) : cw / Math.max(n, 30);
    const x = lineMode ? (i) => (n === 1 ? cw / 2 : 10 + (i / (n - 1)) * (cw - 20)) : (i) => (i + 0.5) * bw + (cw - n * bw);
    S.cmap = { cw, y, pAt, lines };
    const css = getComputedStyle(panel);
    const UP = css.getPropertyValue("--or-up").trim() || "#39ff88", DN = css.getPropertyValue("--or-dn").trim() || "#ff6e5a";
    // grid + price axis
    g.font = "500 10px 'JetBrains Mono', monospace"; g.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const p = lo + ((hi - lo) * i) / 4, yy = y(p);
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      g.fillStyle = "rgba(160,176,189,.75)"; g.textAlign = "left"; g.fillText(fp(p), cw + 6, yy);
    }
    const ind = IND();
    // v6: order walls — the book's resting levels as bands from the right edge, as long as their share of the side
    if (ind.walls && S.book) {
      const lv = [...(S.book.asks || []).map((l) => [l, "a"]), ...(S.book.bids || []).map((l) => [l, "b"])].filter(([l]) => l.price > lo && l.price < hi);
      const top = Math.max(1e-18, ...lv.map(([l]) => l.amount));
      for (const [l, sd] of lv) {
        const w0 = Math.max(6, (l.amount / top) * cw * 0.3), yy = y(l.price);
        g.fillStyle = sd === "a" ? "rgba(255,110,90,.13)" : "rgba(57,255,136,.13)"; g.fillRect(cw - w0, yy - 3, w0, 6);
      }
    }
    // volume
    const vmax = Math.max(...data.map((d) => d[5]), 1e-18);
    const vw = lineMode ? Math.min(14, cw / Math.max(n, 1) * 0.5) : bw * 0.7;
    data.forEach((d, i) => { const hh = (d[5] / vmax) * vh; g.fillStyle = d[4] >= d[1] ? "rgba(57,255,136,.22)" : "rgba(255,110,90,.22)"; g.fillRect(x(i) - vw / 2, vt + vh - hh, vw, hh); });
    if (lineMode) {
      const last = data[n - 1], up = last[4] >= data[0][1], c = up ? UP : DN;
      const gr = g.createLinearGradient(0, PADT, 0, PADT + ph); gr.addColorStop(0, up ? "rgba(57,255,136,.22)" : "rgba(255,110,90,.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.beginPath(); data.forEach((d, i) => (i ? g.lineTo(x(i), y(d[4])) : g.moveTo(x(i), y(d[4])))); g.lineTo(x(n - 1), PADT + ph); g.lineTo(x(0), PADT + ph); g.closePath(); g.fillStyle = gr; g.fill();
      g.beginPath(); data.forEach((d, i) => (i ? g.lineTo(x(i), y(d[4])) : g.moveTo(x(i), y(d[4])))); g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = "round"; g.stroke();
      data.forEach((d, i) => { g.beginPath(); g.arc(x(i), y(d[4]), 3, 0, Math.PI * 2); g.fillStyle = "#06101a"; g.fill(); g.lineWidth = 2; g.strokeStyle = c; g.stroke(); });
    } else {
      // candles
      data.forEach((d, i) => {
        const up = d[4] >= d[1], c = up ? UP : DN, xx = x(i);
        g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(xx, y(d[2])); g.lineTo(xx, y(d[3])); g.stroke();
        const top = y(Math.max(d[1], d[4])), bot = y(Math.min(d[1], d[4]));
        g.fillStyle = c; g.fillRect(xx - bw * 0.34, top, bw * 0.68, Math.max(1, bot - top));
      });
    }
    // v6: indicators — the 20-candle average of the close, the volume-weighted average price of what's shown, and the
    // volume's 20-candle average in the volume pane
    const pathOf = (vals, yf) => { g.beginPath(); let on = false; vals.forEach((v, i) => { if (v == null || !isFinite(v)) { on = false; return; } const yy = yf(v); if (!on) { g.moveTo(x(i), yy); on = true; } else g.lineTo(x(i), yy); }); g.stroke(); };
    const ma = (arr, k) => arr.map((_, i) => (i >= k - 1 ? arr.slice(i - k + 1, i + 1).reduce((a0, b0) => a0 + b0, 0) / k : null));
    g.setLineDash([]); g.lineJoin = "round";
    if (ind.ma && n >= 20) { g.strokeStyle = "#ffd36b"; g.lineWidth = 1.5; pathOf(ma(data.map((d) => d[4]), 20), y); }
    if (ind.vwap && n >= 2) {
      let pv = 0, vv = 0; const vw0 = data.map((d) => { const tp = (d[2] + d[3] + d[4]) / 3; pv += tp * d[5]; vv += d[5]; return vv > 0 ? pv / vv : null; });
      g.strokeStyle = "#b58bff"; g.lineWidth = 1.5; g.setLineDash([6, 3]); pathOf(vw0, y); g.setLineDash([]);
    }
    if (ind.vma && n >= 20) { g.strokeStyle = "rgba(159,176,189,.8)"; g.lineWidth = 1.2; pathOf(ma(data.map((d) => d[5]), 20), (v) => vt + vh - (v / vmax) * vh); }
    // time labels
    g.fillStyle = "rgba(160,176,189,.6)"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.font = "500 10px 'JetBrains Mono', monospace";
    const every = Math.max(1, Math.round(n / 5));
    data.forEach((d, i) => { if (i % every) return; const dt = new Date(d[0] * 1000); g.fillText(S.tf >= 14400 ? `${dt.getMonth() + 1}/${dt.getDate()}` : `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`, Math.max(18, Math.min(cw - 18, x(i))), H - 6); });
    // fills (from the book's tape) as markers
    const t0 = data[0][0], tEnd = data[n - 1][0] + S.tf;
    for (const f of ((S.book && S.book.fills) || []).slice(0, 40)) {
      if (!(f.at >= t0 && f.at < tEnd) || !(f.price > lo && f.price < hi)) continue;
      const i = Math.min(n - 1, Math.floor((f.at - t0) / S.tf)), xx = x(i), yy = y(f.price), buy = f.side === "buy";
      g.fillStyle = buy ? UP : DN; g.beginPath();
      if (buy) { g.moveTo(xx, yy + 4); g.lineTo(xx - 4, yy + 10); g.lineTo(xx + 4, yy + 10); } else { g.moveTo(xx, yy - 4); g.lineTo(xx - 4, yy - 10); g.lineTo(xx + 4, yy - 10); }
      g.fill();
    }
    // v3: my own fills as rings
    for (const f of mf.fills) {
      if (!(f.at >= t0 && f.at < tEnd) || !(f.p > lo && f.p < hi)) continue;
      const i = Math.min(n - 1, Math.floor((f.at - t0) / S.tf));
      g.beginPath(); g.arc(x(i), y(f.p), 5.5, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = f.buy ? UP : DN; g.fillStyle = "rgba(6,16,26,.75)"; g.fill(); g.stroke();
    }
    // my orders, stop triggers, trailing lines (and their peak), and the pool price
    g.setLineDash([5, 4]); g.textBaseline = "middle"; g.textAlign = "left";
    const tag = (yy, label, c, ink = "#06101a", xx = 4) => { g.font = "600 10px Inter, sans-serif"; const tw = g.measureText(label).width + 10; g.fillStyle = c; g.fillRect(xx, yy - 8, tw, 16); g.fillStyle = ink; g.fillText(label, xx + 5, yy); return tw; };
    // v3: my average buy here, dashed
    if (mf.avg && mf.avg > lo && mf.avg < hi) { const ay = y(mf.avg); g.strokeStyle = "rgba(201,168,255,.7)"; g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, ay); g.lineTo(cw, ay); g.stroke(); g.setLineDash([5, 4]); g.font = "600 9px Inter, sans-serif"; g.fillStyle = "rgba(201,168,255,.9)"; g.textAlign = "right"; g.fillText(`${tr("Avg buy")} ${fp(mf.avg)}`, cw - 6, ay - 7); g.textAlign = "left"; }
    // v3: a line the price is within 1% of glows (the loop below keeps it breathing while it's that close)
    let near = false, dropping = false;
    if (S.drop && Date.now() - S.drop.at > 15000) S.drop = null;
    for (const l of lines) {
      const dragging = S.drag && l.h === S.drag.h;
      const close = S.spot && Math.abs(l.p - S.spot) / S.spot < 0.01 && !dragging;
      if (close && l.p > lo && l.p < hi) { near = true; const a = reduce ? 0.5 : 0.35 + 0.35 * Math.sin(Date.now() / 260); g.save(); g.setLineDash([]); g.strokeStyle = l.c; g.globalAlpha = a; g.lineWidth = 6; g.shadowColor = l.c; g.shadowBlur = 14; g.beginPath(); g.moveTo(0, y(l.p)); g.lineTo(cw, y(l.p)); g.stroke(); g.restore(); }
      if (l.peak && l.peak > lo && l.peak < hi) { const py = y(l.peak); g.strokeStyle = "rgba(255,178,122,.35)"; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(0, py); g.lineTo(cw, py); g.stroke(); g.setLineDash([5, 4]); g.fillStyle = "rgba(255,178,122,.75)"; g.font = "600 9px Inter, sans-serif"; g.fillText(`${tr("peak")} ${fp(l.peak)}`, cw - 110, py - 7); }
      if (!(l.p > lo && l.p < hi)) continue;
      let yy = y(l.p);
      g.globalAlpha = dragging ? 0.35 : 1;
      // v4: a just-placed order's line drops in from the top
      if (S.drop && !reduce && !dragging && Math.abs(l.p - S.drop.p) <= l.p * 0.005) {
        if (!S.drop.t0) S.drop.t0 = performance.now();
        const k = Math.min(1, (performance.now() - S.drop.t0) / 700), ez = 1 - Math.pow(1 - k, 3) + (k < 1 ? Math.sin(k * Math.PI) * 0.06 : 0);
        yy = PADT + (yy - PADT) * ez; g.globalAlpha = 0.35 + 0.65 * k;
        if (k < 1) dropping = true; else S.drop = null;
      }
      g.strokeStyle = l.c; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      const tw = tag(yy, l.label, l.c);
      if (l.h) { g.fillStyle = "rgba(6,16,26,.6)"; g.fillRect(4 + tw + 2, yy - 8, 12, 16); g.fillStyle = l.c; for (const dy of [-3, 0, 3]) g.fillRect(4 + tw + 5, yy + dy - 0.5, 6, 1); }
      g.globalAlpha = 1;
    }
    // v5: a dragged line waiting for "Replace order": dashed at its new price, springing into place
    if (S.moveAsk && !S.drag && S.moveAsk.price > lo && S.moveAsk.price < hi) {
      const t = Date.now() - S.moveAsk.at, off = reduce || t > 700 ? 0 : 16 * Math.exp(-t / 150) * Math.cos(t / 42);
      const yy = y(S.moveAsk.price) + off, c = S.moveAsk.side === "buy" ? "#7dffb8" : "#ffc861";
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = c; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke(); g.restore();
      tag(yy, `→ ${fp(S.moveAsk.price)}`, c);
    }
    if (S.drag && S.drag.y > PADT && S.drag.y < PADT + ph) {
      const l = lines.find((q) => q.h === S.drag.h), yy = S.drag.y, np = pAt(yy);
      if (l) { g.strokeStyle = l.c; g.lineWidth = 1.5; g.setLineDash([6, 3]); g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke(); tag(yy, `${l.label} → ${fp(np)}${S.spot ? ` (${pc(((np - S.spot) / S.spot) * 100, 1)} ${tr("vs pool")})` : ""}`, l.c); g.fillStyle = l.c; g.fillRect(cw + 1, yy - 8, AX - 2, 16); g.fillStyle = "#06101a"; g.font = "700 10px 'JetBrains Mono', monospace"; g.fillText(fp(np), cw + 5, yy); }
    }
    if (S.spot && S.spot > lo && S.spot < hi) {
      const yy = y(S.spot);
      g.strokeStyle = "#8fdcff"; g.setLineDash([5, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke();
      g.setLineDash([]); g.fillStyle = "#8fdcff"; g.fillRect(cw + 1, yy - 8, AX - 2, 16); g.fillStyle = "#04121c"; g.font = "700 10px 'JetBrains Mono', monospace"; g.fillText(fp(S.spot), cw + 5, yy);
    }
    g.setLineDash([]);
    if (dropping) requestAnimationFrame(() => draw());
    if (near && !reduce && !S.nearRaf) { const loop = () => { S.nearRaf = 0; if (panel.classList.contains("active") && !document.hidden) draw(); }; S.nearRaf = setTimeout(() => requestAnimationFrame(loop), 50); }
    // crosshair
    const tip = $("aor-tip");
    if (S.hover && S.hover.x < cw && !S.drag) {
      const i = lineMode ? Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((S.hover.x - 10) / (cw - 20)) * (n - 1)))) : Math.max(0, Math.min(n - 1, Math.floor((S.hover.x - (cw - n * bw)) / bw))), d = data[i];
      g.strokeStyle = "rgba(255,255,255,.25)"; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(i), PADT); g.lineTo(x(i), H - PADB); g.moveTo(0, S.hover.y); g.lineTo(cw, S.hover.y); g.stroke(); g.setLineDash([]);
      const hp = pAt(S.hover.y);
      if (S.hover.y > PADT && S.hover.y < PADT + ph) { g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(cw + 1, S.hover.y - 8, AX - 2, 16); g.fillStyle = "#04121c"; g.font = "700 10px 'JetBrains Mono', monospace"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(fp(hp), cw + 5, S.hover.y); }
      if (tip && d) {
        const ch = d[1] ? ((d[4] - d[1]) / d[1]) * 100 : 0, dt = new Date(d[0] * 1000);
        tip.hidden = false;
        tip.innerHTML = `<b data-no-i18n>${dt.toLocaleDateString()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}</b><span>O <i data-no-i18n>${fp(d[1])}</i></span><span>H <i data-no-i18n>${fp(d[2])}</i></span><span>L <i data-no-i18n>${fp(d[3])}</i></span><span>C <i data-no-i18n>${fp(d[4])}</i></span><span class="${ch >= 0 ? "up" : "dn"}" data-no-i18n>${pc(ch)}</span><span>${T("Vol")} <i data-no-i18n>${qv(d[5])}</i></span><small>${T("Click to use this price")}${lines.some((l) => l.h) ? " · " + T("drag your lines to move them") : ""}</small>`;
        tip.style.left = (S.hover.x > W / 2 ? 8 : W - AX - tip.offsetWidth - 8) + "px";
      }
    } else if (tip) tip.hidden = true;
  }
  /// v3: my filled orders in this market — the average buy and each fill's time and price
  function myFills() {
    const out = { fills: [], avg: null };
    if (!S.tok) return out;
    let bT = 0, bQ = 0;
    for (const o of ((S.mine && S.mine.orders) || [])) {
      if (lc(o.token.address || o.token) !== S.t || !(o.filledPct > 0) || !(o.price > 0)) continue;
      out.fills.push({ at: o.last || o.at, p: o.price, buy: o.side === "buy" });
      if (o.side === "buy") { const x = (human(o.buyAmount, S.tok.decimals) / (1 - FEE)) * (o.filledPct / 100); bT += x; bQ += x * o.price; }
    }
    out.avg = bT ? bQ / bT : null;
    return out;
  }
  /// lines to draw: my open orders (limit price, stop trigger, trailing line, take-profit / stop-loss); limit lines carry
  /// their hash, so they can be dragged to a new price (that's an edit: a new order, then the old one cancelled)
  function orderLines() {
    const out = [];
    for (const o of ((S.mine && S.mine.orders) || [])) {
      if (lc(o.token.address || o.token) !== S.t || o.status !== "open") continue;
      const sd = o.side === "buy" ? tr("Buy") : tr("Sell"), amt = num(o.side === "sell" ? human(o.sellAmount, S.tok.decimals) : human(o.buyAmount, S.tok.decimals) / (1 - FEE));
      if (o.type === "stop") out.push({ p: (o.trigger && o.trigger.price) || o.price, c: "#ff9b8a", label: `${o.leg === "sl" ? "SL" : tr("Stop")} ${amt}` });
      else if (o.type === "trail" && o.trail) out.push({ p: o.trail.at, c: "#ffb27a", label: `${tr("Trail")} ${o.trail.pct}%`, peak: o.trail.peak });
      else if (o.type === "limit" && o.cond && !o.cond.met) out.push({ p: o.price, c: "#b69cff", label: `IF ${sd} ${amt}` }); // v5: waiting on another token — not draggable
      else if (o.type === "limit") out.push({ p: o.price, c: o.leg === "tp" ? "#7dffb8" : "#ffc861", label: `${o.leg === "tp" ? "TP" : sd} ${amt}`, h: !o.group && LIVE() ? o.hash : null });
    }
    return out;
  }
  /// a dragged limit line: edit that order at the new price (placing it signs a new one and cancels the old) — v5: the
  /// chart asks right there (Replace order · Undo), and the line springs into its new place
  function moveOrder(h, price) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    edit(h, { price, quiet: true });
    S.moveAsk = { h, price, from: o ? o.price : null, side: o ? o.side : S.side, at: Date.now() };
    mvBar();
    if (!reduce) { const spring = () => { draw(); if (S.moveAsk && Date.now() - S.moveAsk.at < 700) requestAnimationFrame(spring); }; requestAnimationFrame(spring); }
  }
  function mvBar() {
    const el = $("aor-mvbar"); if (!el) return;
    const a = S.moveAsk;
    if (!a || !S.editing || S.editing.hash !== a.h) { el.hidden = true; S.moveAsk = null; return; }
    el.hidden = false;
    el.innerHTML = `<span data-no-i18n>${esc(tr(a.side === "buy" ? "Buy" : "Sell"))} ${a.from ? `${esc(fp(a.from))} → ` : ""}<b>${esc(fp(a.price))}</b>${S.spot ? ` <i>${esc(pc(((a.price - S.spot) / S.spot) * 100, 1))}</i>` : ""}</span><button type="button" class="aor-btn sm go" data-act="mvgo">${T("Replace order")}</button><button type="button" class="aor-link" data-act="mvno">${T("Undo")}</button>`;
  }
  function tapOffer(price, y) {
    const b = $("aor-tapuse"); if (!b) return;
    S.tapP = price;
    b.hidden = false; b.style.top = Math.max(6, y - 16) + "px";
    b.innerHTML = `${T("Use this price")} <b data-no-i18n>${esc(fp(price))}</b>`;
    clearTimeout(S.tapT); S.tapT = setTimeout(() => { b.hidden = true; }, 4000);
  }
  /// a click on the chart: that price goes into the order form (the side follows: under the pool buys, over it sells)
  function pickPrice(price) {
    if (!S.tok) return;
    if (S.type === "stop") F.trigger = dstr(price);
    else if (S.type === "tpsl") { if (S.spot && price > S.spot) F.tp = dstr(price); else F.sl = dstr(price); }
    else {
      if (S.type !== "limit") S.type = "limit";
      if (!S.editing && S.spot) S.side = price < S.spot ? "buy" : "sell";
      F.price = dstr(price); syncTotal("price");
    }
    form(); requote(); flashField();
    if (innerWidth <= 720) sheet(true);
  }
  function flashField() {
    if (reduce) return;
    const f = $(S.type === "stop" ? "aor-trigger" : S.type === "tpsl" ? "aor-tp" : "aor-price");
    const box = f && f.closest(".aor-in"); if (!box) return;
    box.classList.remove("aor-flash"); void box.offsetWidth; box.classList.add("aor-flash");
  }
  /// v4: what the pool itself trades between its price now and ±10%, in tokens — its active liquidity held constant
  /// (exact inside the current tick range, approximate past it): tokens it sells as the price rises, buys as it falls
  function poolDepth() {
    const p = pool(), pl = S.poolL;
    if (!p || !pl || pl.id !== p.id || !(pl.L > 0n) || !(S.spot > 0) || !S.tok || !S.quote) return null;
    const td = S.tok.decimals, qd = S.quote.decimals, Lf = Number(pl.L);
    const raw = (P) => (p.tokenIs0 ? P * 10 ** (qd - td) : 1 / (P * 10 ** (qd - td)));
    const tokBetween = (P0, P1) => { const a = Math.sqrt(raw(P0)), c = Math.sqrt(raw(P1)); return (p.tokenIs0 ? Lf * Math.abs(1 / a - 1 / c) : Lf * Math.abs(a - c)) / 10 ** td; };
    const N = 14, asks = [], bids = [];
    for (let i = 1; i <= N; i++) { const k = (i / N) * 0.1; asks.push([S.spot * (1 + k), tokBetween(S.spot, S.spot * (1 + k))]); bids.push([S.spot * (1 - k), tokBetween(S.spot, S.spot * (1 - k))]); }
    return asks.every((x) => isFinite(x[1])) && bids.every((x) => isFinite(x[1])) ? { asks, bids } : null;
  }
  /// v6: the pool at a glance — venue, fee, liquidity, how much it takes to move the price 1 / 2 / 5 %, and what a buy or
  /// a sell of a few sizes would cost in price impact (the Orders contract's own quote of the pool, the fee included)
  const IMPACT_SIZES = () => (RH() ? [0.01, 0.1, 0.5] : [100, 1000, 10000]);
  async function loadImpact() {
    const p = pool(); if (!LIVE() || !p || p.pending || !S.tok || !(S.spot > 0)) return;
    const key = p.id + ":" + Number(S.spot).toPrecision(4);
    if (S.impact && S.impact.key === key) return;
    S.impact = { key, rows: null };
    const qd = S.quote.decimals, td = S.tok.decimals, rows = [];
    for (const q of IMPACT_SIZES()) {
      const qa = ethers.parseUnits(String(q), qd), ta = ethers.parseUnits((q / S.spot).toFixed(Math.min(td, 8)), td);
      const [outT, outQ] = await Promise.all([quoteOut(p, S.quote.address, qa).catch(() => null), quoteOut(p, S.tok.address, ta).catch(() => null)]);
      const buyPx = outT && outT > 0n ? q / Number(ethers.formatUnits(outT, td)) : null, sellPx = outQ && outQ > 0n ? Number(ethers.formatUnits(outQ, qd)) / (q / S.spot) : null;
      rows.push({ q, buy: buyPx ? ((buyPx - S.spot) / S.spot) * 100 : null, sell: sellPx ? ((sellPx - S.spot) / S.spot) * 100 : null });
    }
    if (S.impact && S.impact.key === key) { S.impact.rows = rows; if (S.center === "pool") { const el = $("aor-chart"); if (el) el.innerHTML = poolPanel(); } }
  }
  function poolPanel() {
    const p = pool(), b = S.book || {}, d = b.day || {};
    if (!p) return `<div class="aor-empty">${T("The pool shows up when a market is open.")}</div>`;
    // what it takes to move the price k% (from the pool's active liquidity), in the quote
    const pl = S.poolL, okL = pl && pl.id === p.id && pl.L > 0n && S.spot > 0 && S.tok && S.quote;
    const mv = (k, side) => {
      if (!okL) return null;
      const td = S.tok.decimals, qd = S.quote.decimals, Lf = Number(pl.L);
      const raw = (P) => (p.tokenIs0 ? P * 10 ** (qd - td) : 1 / (P * 10 ** (qd - td)));
      const P1 = S.spot * (side === "up" ? 1 + k / 100 : 1 - k / 100), a0 = Math.sqrt(raw(S.spot)), a1 = Math.sqrt(raw(P1));
      const tok = (p.tokenIs0 ? Lf * Math.abs(1 / a0 - 1 / a1) : Lf * Math.abs(a0 - a1)) / 10 ** td;
      return isFinite(tok) ? tok * (S.spot + P1) / 2 : null;
    };
    const qv0 = (v) => (v == null ? "—" : (RH() ? num(v) + " ETH" : usd(v)) + (RH() && usdOf(v) ? ` <small>≈ ${esc(usdS(usdOf(v)))}</small>` : ""));
    const im = S.impact && S.impact.rows;
    const bar = (v) => (v == null ? "" : `<i class="aor-imp-b ${Math.abs(v) > 5 ? "bad" : Math.abs(v) > 2 ? "mid" : ""}" style="--w:${Math.min(100, Math.abs(v) * 8).toFixed(0)}%"></i>`);
    return `<div class="aor-pool">
      <div class="aor-pool-k">
        <div><small data-no-i18n>${esc(L3("Venue", "거래소", "交易场所"))}</small><b data-no-i18n>${esc(p.venue || "Uniswap v4")}</b><span data-no-i18n>${short(p.id)} · <a href="https://dexscreener.com/${RH() ? "robinhood" : "arc"}/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Dexscreener ↗</a></span></div>
        <div><small>${T("Pool fee")}</small><b data-no-i18n>${p.feePct != null ? p.feePct + "%" : p.key && p.key.fee === 0x800000 ? esc(tr("dynamic")) : "—"}</b>${S.tax != null ? `<span>${T("Round trip")} <b data-no-i18n>${S.tax.toFixed(2)}%</b></span>` : ""}</div>
        <div><small>${T("Liquidity")}</small><b data-no-i18n>${p.dex && p.dex.liqUsd ? usd(p.dex.liqUsd) : "—"}</b>${b.thin ? `<span class="warn">${T("Thin liquidity")}</span>` : ""}</div>
        <div><small>${T("24h volume")}</small><b data-no-i18n>${d.volume ? qv0(d.volume) : "—"}</b>${d.trades ? `<span data-no-i18n>${esc(L3(`${d.trades} swaps`, `스왑 ${d.trades}회`, `${d.trades} 笔`))}</span>` : ""}</div>
      </div>
      <h5>${T("To move the price")}</h5>
      <div class="aor-pool-mv"><div class="h"><span></span><span>1%</span><span>2%</span><span>5%</span></div>
        <div><span class="up">${T("Up (buys)")}</span><b data-no-i18n>${qv0(mv(1, "up"))}</b><b data-no-i18n>${qv0(mv(2, "up"))}</b><b data-no-i18n>${qv0(mv(5, "up"))}</b></div>
        <div><span class="dn">${T("Down (sells)")}</span><b data-no-i18n>${qv0(mv(1, "dn"))}</b><b data-no-i18n>${qv0(mv(2, "dn"))}</b><b data-no-i18n>${qv0(mv(5, "dn"))}</b></div></div>
      <h5>${T("Price impact, fee included")}</h5>
      ${!LIVE() ? `<p class="aor-hint">${T("Opens when ARCIRCLE Orders is live on this chain.")}</p>` : !im ? `<p class="aor-hint"><span class="aor-spin"></span>${T("Asking the pool…")}</p>` : `<div class="aor-imp"><div class="h"><span data-no-i18n>${esc(L3("Size", "규모", "规模"))}</span><span>${T("Buy")}</span><span>${T("Sell")}</span></div>${im.map((r) => `<div><span data-no-i18n>${RH() ? r.q + " ETH" : usd(r.q)}</span><b data-no-i18n class="up">${r.buy != null ? pc(r.buy, 2) : "—"}${bar(r.buy)}</b><b data-no-i18n class="dn">${r.sell != null ? pc(r.sell, 2) : "—"}${bar(r.sell)}</b></div>`).join("")}</div>`}
      <p class="aor-hint">${T("A limit order waits for its price instead of paying this.")}</p></div>`;
  }
  function depthSvg() {
    const b = S.book || {};
    const asks = levels(b.asks, "sell").slice(0, 30), bids = levels(b.bids, "buy").slice(0, 30);
    const pd = poolDepth();
    if (!asks.length && !bids.length && !pd) return `<div class="aor-empty">${T(S.pending ? "Its pool opens when it graduates — the depth chart starts then." : "No orders in the book yet — the depth chart fills in as orders come.")}</div>`;
    const W = 600, H = 340, pad = 24;
    const prices = [...asks, ...bids].map((l) => l.price).concat(S.spot ? [S.spot] : []).concat(pd ? [pd.asks[pd.asks.length - 1][0], pd.bids[pd.bids.length - 1][0]] : []);
    let lo = Math.min(...prices), hi = Math.max(...prices);
    if (hi === lo) { lo *= 0.9; hi *= 1.1; }
    const span = hi - lo; lo -= span * 0.05; hi += span * 0.05;
    let c = 0; const bc = bids.map((l) => [l.price, (c += l.amount)]); const bmax = c;
    c = 0; const ac = asks.map((l) => [l.price, (c += l.amount)]); const amax = c;
    const ymax = Math.max(bmax, amax, pd ? pd.asks[pd.asks.length - 1][1] : 0, pd ? pd.bids[pd.bids.length - 1][1] : 0, 1e-18);
    const x = (p) => pad + ((p - lo) / (hi - lo)) * (W - pad * 2);
    const y = (v) => H - pad - (v / ymax) * (H - pad * 2);
    // a fixed number of points, so one shape morphs into the next (CSS d transitions)
    const step = (pts, toLeft) => {
      const P = [[x(pts.length ? pts[0][0] : toLeft ? lo : hi), y(0)]];
      let prev = 0;
      for (let i = 0; i < 30; i++) { const q = pts[Math.min(i, pts.length - 1)]; if (!q) { P.push(P[P.length - 1], P[P.length - 1]); continue; } P.push([x(q[0]), y(prev)], [x(q[0]), y(q[1])]); prev = q[1]; }
      const end = x(toLeft ? lo : hi); P.push([end, y(prev)], [end, y(0)]);
      return "M" + P.map(([a, bb]) => `${a.toFixed(1)},${bb.toFixed(1)}`).join(" L") + " Z";
    };
    const sx = S.spot ? x(S.spot) : null, dB = step(bc, true), dA = step(ac, false);
    const pline = (pts) => "M" + [[S.spot, 0], ...pts].map(([pp, v]) => `${x(pp).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
    const poolSvg = pd ? `<path class="aor-d-pool" d="${pline(pd.bids)}"/><path class="aor-d-pool" d="${pline(pd.asks)}"/>` : "";
    return `<svg class="aor-depth" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Depth")}">
      <line class="aor-d-base" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>
      ${poolSvg}<path class="aor-d-bid" d="${dB}" style="d:path('${dB}')"/><path class="aor-d-ask" d="${dA}" style="d:path('${dA}')"/>
      ${sx != null ? `<line class="aor-d-spot" x1="${sx.toFixed(1)}" x2="${sx.toFixed(1)}" y1="${pad / 2}" y2="${H - pad}"/><text class="aor-d-lbl" x="${Math.min(W - 90, sx + 6).toFixed(1)}" y="${pad}" data-no-i18n>${esc(fp(S.spot))}</text>` : ""}
      <text class="aor-d-lbl" x="${pad}" y="${H - 6}" data-no-i18n>${esc(fp(lo))}</text><text class="aor-d-lbl end" x="${W - pad}" y="${H - 6}" data-no-i18n>${esc(fp(hi))}</text>
    </svg><div class="aor-d-key"><span class="up">${T("Buy orders")}</span><span class="dn">${T("Sell orders")}</span>${pd ? `<span class="pool" title="${T("From the pool's active liquidity, held constant over ±10% — approximate past its current range")}">${T("Pool, ±10% (approx.)")}</span>` : ""}<small>${T("cumulative, in")} <span data-no-i18n>$${esc(S.tok.symbol)}</span></small></div>`;
  }

  // ---------------- the order form ----------------
  const TYPES_UI = [["limit", "Limit"], ["market", "Market"], ["stop", "Stop order"], ["tpsl", "TP / SL"], ["trail", "Trailing stop"], ["scaled", "Scaled"], ["twap", "Timed (DCA)"]];
  const SIMPLE_TYPES = ["limit", "market"];
  // v3: Pro keeps Limit and Market up front; the rest open from "More types ▾", each with a one-line tag
  const TYPE_TAG = { stop: "Trigger, then market", tpsl: "Profit and stop together", trail: "Follows the price up", scaled: "A ladder of limit orders", twap: "Equal parts over time" };
  const sellOnly = (t) => t === "tpsl" || t === "trail";
  /// a small drawing of how each order type works (beside one line that says it)
  function explainSvg(ty, buy) {
    const P = (d, c = "") => `<path class="${c}" d="${d}"/>`;
    const L = (yy, c) => `<path class="lv ${c}" d="M4 ${yy}H116"/>`;
    const dot = (x, yy, c = "") => `<circle class="${c}" cx="${x}" cy="${yy}" r="3.2"/>`;
    const body = {
      limit: buy ? L(32, "up") + P("M4 10 L22 16 L36 12 L52 22 L66 18 L82 30 L92 32") + dot(92, 32, "up") : L(12, "dn") + P("M4 34 L22 28 L36 31 L52 22 L66 25 L82 14 L92 12") + dot(92, 12, "dn"),
      market: P("M4 26 L20 22 L34 28 L50 18 L66 22 L80 16") + `<path class="lv" d="M80 6V40"/>` + dot(80, 16, buy ? "up" : "dn"),
      stop: buy ? L(18, "up") + P("M4 34 L20 30 L34 32 L50 24 L64 20 L74 16 L90 8") + dot(70, 18, "up") : L(26, "dn") + P("M4 10 L20 14 L34 12 L50 20 L62 24 L72 28 L90 38") + dot(66, 26, "dn"),
      tpsl: L(8, "up") + L(38, "dn") + P("M4 24 L20 20 L34 26 L50 18 L66 22 L82 14 L98 8") + dot(98, 8, "up"),
      trail: P("M4 36 L18 30 L30 32 L44 20 L58 22 L72 10 L86 18 L96 26") + `<path class="lv dn" d="M4 42 L18 36 L30 36 L44 26 L58 26 L72 16 L96 16"/>` + dot(91, 22, "dn"),
      scaled: (buy ? [20, 26, 32, 38] : [6, 12, 18, 24]).map((yy, i) => `<path class="lv ${buy ? "up" : "dn"}" d="M${30 + i * 18} ${yy}H${46 + i * 18}"/>`).join("") + P(buy ? "M4 10 L30 14 L52 22 L76 30 L100 36" : "M4 36 L30 30 L52 22 L76 14 L100 8"),
      twap: Array.from({ length: 6 }, (_, i) => `<rect class="${buy ? "up" : "dn"}" x="${8 + i * 18}" y="${30 - i * 3}" width="10" height="${10 + i * 3}" rx="2"/>`).join(""),
    }[ty] || "";
    return `<svg class="aor-ex-svg" viewBox="0 0 120 44" aria-hidden="true">${body}</svg>`;
  }
  const EXPLAIN = {
    limit: ["Buy at your price or lower. Signed in your wallet — no gas; your tokens stay with you until it fills.", "Sell at your price or higher. Signed in your wallet — no gas; your tokens stay with you until it fills."],
    market: ["Buys now through the pool, from your wallet, inside your slippage limit.", "Sells now through the pool, from your wallet, inside your slippage limit."],
    stop: ["Waits for the price to rise through the trigger (a breakout), then buys at market.", "Waits for the price to fall through the trigger, then sells at market — never below your slippage limit."],
    tpsl: ["", "A take-profit above and a stop-loss below on the same tokens: when one fills, the other is cancelled on-chain."],
    trail: ["", "Follows the price up and sells once it falls back by your trail. The floor is signed, so it never sells below it."],
    scaled: ["Splits one buy into several limit orders spread over a price range — one signature each, no gas.", "Splits one sell into several limit orders spread over a price range — one signature each, no gas."],
    twap: ["Buys in equal parts over the period, never above your price limit. One signature.", "Sells in equal parts over the period, never below your price limit. One signature."],
  };
  /// support and resistance from the pool's own trades: the last 24 hours' and 3 days' lows and highs
  function lvls() {
    const c = S.candles && S.candles.list;
    if (!c || !c.length) return null;
    const t24 = now() - 86400, d1 = c.filter((x) => x[0] >= t24), all = c;
    const lo = (a) => (a.length ? Math.min(...a.map((x) => x[3])) : null), hi = (a) => (a.length ? Math.max(...a.map((x) => x[2])) : null);
    return { l24: lo(d1), h24: hi(d1), l3: lo(all), h3: hi(all) };
  }
  function lvlChips(target, want) {
    const L0 = lvls(); if (!L0) return "";
    const items = (want === "low" ? [["l24", "24h low"], ["l3", "3-day low"]] : want === "high" ? [["h24", "24h high"], ["h3", "3-day high"]] : [["l24", "24h low"], ["l3", "3-day low"], ["h24", "24h high"], ["h3", "3-day high"]])
      .filter(([k]) => L0[k] > 0).filter(([k], i, a) => a.findIndex(([k2]) => fp(L0[k2]) === fp(L0[k])) === i);
    if (!items.length) return "";
    return `<div class="aor-lvls" title="${T("ARCIA reads these from the pool's own trades over the last 3 days — levels to consider, not advice.")}"><span class="aor-lvls-t" data-no-i18n>ARCIA</span>${items.map(([k, l]) => `<button type="button" data-lvl="${target}" data-v="${Number(L0[k].toPrecision(4))}" class="${k[0] === "l" ? "lo" : "hi"}">${T(l)} <b data-no-i18n>${fp(L0[k])}</b></button>`).join("")}</div>`;
  }
  /// how far a price sits from the pool's, and what that means for this side
  function distInfo() {
    if (!S.spot || !S.tok) return null;
    const P = Number(String(S.type === "stop" ? F.trigger : F.price).replace(/,/g, ""));
    if (!(P > 0) || (S.type !== "limit" && S.type !== "stop")) return null;
    const d = ((P - S.spot) / S.spot) * 100, buy = S.side === "buy";
    if (S.type === "stop") return { d, k: "", t: "vs pool", n: touches(P) };
    const taker = buy ? d > 0.05 : d < -0.05;
    return { n: touches(P), d, k: Math.abs(d) < 0.05 ? "at" : taker ? (Math.abs(d) > 10 ? "fat" : "taker") : Math.abs(d) > 40 ? "far" : "maker", t: Math.abs(d) < 0.05 ? "at the pool price" : taker ? "fills now" : Math.abs(d) > 40 ? "far — may take a while" : "vs pool" };
  }
  /// v4: how many 5-minute candles of the last 24 hours traded through a price (null without candles)
  function touches(P) {
    const c = S.candles && S.candles.list;
    if (!c || !c.length || !(P > 0)) return null;
    const t24 = now() - 86400;
    return c.filter((x) => x[0] >= t24 && x[3] <= P && P <= x[2]).length;
  }
  const L3 = (en, ko, zh) => (lang() === "ko" ? ko : lang() === "zh" ? zh : en); // a sentence with a number in it
  const touchHtml = (n) => (n == null ? "" : `<small class="aor-touch${n ? "" : " none"}" title="${T("5-minute candles of the last 24 hours that traded through this price")}" data-no-i18n>${n ? L3(`touched <b>${n}×</b> in 24h`, `24시간 동안 <b>${n}번</b> 닿음`, `24小时内触及 <b>${n} 次</b>`) : esc(L3("not reached in 24h", "24시간 동안 닿지 않음", "24小时内未触及"))}</small>`);
  const distHtml = () => { const x = distInfo(); return x ? `<em class="aor-dist ${x.k}" id="aor-dist"><span data-no-i18n>${pc(x.d, Math.abs(x.d) < 10 ? 2 : 1)}</span> ${T(x.t)}${touchHtml(x.n)}</em>` : `<em class="aor-dist" id="aor-dist" hidden></em>`; };
  function distPaint() { const el = $("aor-dist"); if (!el) return; const t = document.createElement("div"); t.innerHTML = distHtml(); el.replaceWith(t.firstChild); }
  const presetLabel = (x) => `${tr(x.side === "buy" ? "Buy" : "Sell")} · ${tr((TYPES_UI.find(([k]) => k === x.type) || [0, x.type])[1])}${x.off != null ? ` ${pc(x.off, Math.abs(x.off) % 1 ? 1 : 0)}` : ""}${x.pct ? ` · ${x.pct}%` : ""}${x.expiry && x.type !== "market" && x.type !== "twap" ? ` · ${Math.round(Number(x.expiry) / 86400)}d` : ""}`;
  function lastOrder() { const l = store.get(LASTK, null); return l && l.chain === CH && l.type && l.side ? l : null; }
  function presetRow() {
    if (!S.tok) return "";
    const L0 = lastOrder(), P0 = presets();
    if (!L0 && !P0.length) return "";
    return `<div class="aor-presets">${L0 ? `<button type="button" class="aor-pre last" data-act="repeat" title="${T("Same side, type and distance from the pool")}${L0.t === S.t ? " · " + T("same amount") : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>${T("Repeat last")}<small data-no-i18n>${esc(presetLabel(L0))}</small></button>` : ""}${P0.map((x, i) => `<span class="aor-pre"><button type="button" data-preset="${i}" data-no-i18n>${esc(presetLabel(x))}</button><button type="button" class="aor-pre-x" data-presetdel="${i}" aria-label="${T("Remove")}">${ICON.close}</button></span>`).join("")}</div>`;
  }
  function bracketDue() {
    const b0 = S.brkDue; if (!b0 || b0.ch !== CH) return "";
    return `<div class="aor-brkdue"><span><b>${T("Your buy filled")}</b> <span data-no-i18n>$${esc(b0.sym || "")}</span> — ${T("set its take-profit and stop-loss now.")}</span><span><button type="button" class="aor-btn sm go" data-act="brkgo">${T("Set TP / SL")}</button><button type="button" class="aor-link" data-act="brkno">${T("Not now")}</button></span></div>`;
  }
  /// v5: "only if another token's price…" — the order waits off the book until that token's pool crosses the level
  function condBox() {
    const opts = [], seen0 = new Set();
    const add0 = (t, sym) => { t = lc(t); if (!isAddr(t) || seen0.has(t)) return; seen0.add(t); opts.push([t, sym || short(t)]); };
    if (RH()) add0(ARCIA_RH(), "ARCIA");
    add0(ARCIRCLE(), "ARCIRCLE");
    for (const m of S.markets) add0(m.token.address || m.token, m.token.symbol);
    for (const r of recent()) add0(r.t, r.sym);
    if (!F.condT || !seen0.has(lc(F.condT))) F.condT = (opts.find(([t]) => t !== S.t) || opts[0] || [""])[0];
    const cm = S.markets.find((m) => lc(m.token.address || m.token) === lc(F.condT)), cpx = cm ? cm.spot || cm.last : lc(F.condT) === S.t ? S.spot : null;
    return `<div class="aor-cond${F.condOn ? " on" : ""}"><label class="aor-more"><input type="checkbox" id="aor-condon"${F.condOn ? " checked" : ""}> <span>${T("Only if another token's price…")}</span></label>${F.condOn ? `<div class="aor-cond-row"><select id="aor-condt" aria-label="${T("Token")}">${opts.map(([t, sy]) => `<option value="${t}"${t === lc(F.condT) ? " selected" : ""} data-no-i18n>$${esc(sy)}</option>`).join("")}</select><select id="aor-conddir" aria-label="${esc(L3("Direction", "방향", "方向"))}"><option value="above"${F.condDir === "above" ? " selected" : ""}>${T("rises to")}</option><option value="below"${F.condDir === "below" ? " selected" : ""}>${T("falls to")}</option></select><span class="aor-in"><input id="aor-condp" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(cpx ? fp(cpx) : "0")}" value="${esc(F.condP)}" aria-label="${T("Condition price")}"><i data-no-i18n>${esc(S.quote ? S.quote.symbol : "")}</i></span></div><p class="aor-note">${T("Until then it stays out of the book and nothing fills. The executor checks that pool every minute.")}${cpx ? ` <span data-no-i18n>${esc(L3("now", "현재", "当前"))} ${esc(fp(cpx))}</span>` : ""}</p>` : ""}</div>`;
  }
  /// v5: where the order stands — price, amount, then ready to place (the steps light up as they're filled in)
  function stageHtml(b0) {
    const ty = S.type, n = (v) => Number(String(v || "").replace(/,/g, "")) > 0;
    const p1 = ty === "limit" ? n(F.price) : ty === "stop" ? n(F.trigger) : ty === "tpsl" ? n(F.tp) && n(F.sl) : ty === "scaled" ? n(F.lo) && n(F.hi) : ty === "trail" ? true : n(F.cap) || !!S.spot;
    const p2 = ty === "twap" && S.side === "buy" ? n(F.total) : n(F.amount);
    const ok3 = b0 && b0.err === undefined;
    const st = [[p1, "Price"], [p2, "Amount"], [ok3, "Ready to place"]];
    return `<ol class="aor-stage" aria-label="${T("Order steps")}">${st.map(([ok, l], i) => `<li class="${ok ? "done" : st.slice(0, i).every((x) => x[0]) ? "now" : ""}"><i>${ok ? ICON.check : `<span data-no-i18n>${i + 1}</span>`}</i><span>${T(l)}</span></li>`).join("")}</ol>`;
  }
  function form() {
    const el = $("aor-formc"); if (!el) return;
    if (S.pending) { S.type = "limit"; S.side = "buy"; } // v4: before a Pons graduation only a limit buy can wait
    if (sellOnly(S.type) && S.side !== "sell") S.side = "sell";
    const pro = PRO();
    const tk = S.tok, q = S.quote;
    const sym = tk ? "$" + tk.symbol : "TOKEN", qs = q ? q.symbol : "USDC";
    const buy = S.side === "buy", ty = S.type;
    const sellTok = tk ? (buy ? q : tk) : null;
    const bal = sellTok && S.bal[sellTok.address] != null ? S.bal[sellTok.address] : null;
    const field = (id, label, unit, val, ph, extra = "", badge = "") => `<label class="aor-f"><small><span>${T(label)}</span>${badge}</small><span class="aor-in"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(ph || "0")}" value="${esc(val)}"><i data-no-i18n>${esc(unit)}</i></span>${extra}</label>`;
    // v4: a price box that can take a market cap instead (MCAP $ ⇄ the quote)
    const pfield = (id, label, k, ph, extra = "", badge = "") => {
      if (!mcOk()) return field(id, label, qs, F[k], ph, extra, badge);
      const on = !!S.mcapIn, php = on ? (S.spot ? String(Number(mcapOf(S.spot).toPrecision(4))) : "0") : ph;
      return `<label class="aor-f"><small><span>${T(on ? (k === "trigger" ? "Trigger at market cap" : "At market cap") : label)}</span>${badge}</small><span class="aor-in"><input id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(php || "0")}" value="${esc(pxShown(k))}"><button type="button" class="aor-unit mc${on ? " on" : ""}" data-act="mcapin" title="${T(on ? "Enter a price per token" : "Enter a market cap in dollars")}"><span data-no-i18n>${on ? "MCAP $" : esc(qs)}</span><i aria-hidden="true">⇄</i></button></span><span class="aor-mcx" id="${id}-mc">${pxSub(k)}</span>${extra}</label>`;
    };
    // v3: on Robinhood Chain the Total / Spend field can take dollars (converted at the server's ETH price)
    const usdOk = RH() && S.ethUsd > 0, usdOn = usdOk && S.usdIn;
    const totalField = (label) => {
      const unit = usdOk ? `<button type="button" class="aor-unit${usdOn ? " on" : ""}" data-act="usdin" title="${T(usdOn ? "Enter in ETH" : "Enter in dollars")}"><span data-no-i18n>${usdOn ? "USD" : esc(qs)}</span><i aria-hidden="true">⇄</i></button>` : `<i data-no-i18n>${esc(qs)}</i>`;
      return `<label class="aor-f"><small><span>${T(label)}</span></small><span class="aor-in"><input id="aor-total" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" value="${esc(totalShown())}">${unit}</span><span id="aor-totx">${totalSub()}</span></label>`;
    };
    const pctRow = () => `<div class="aor-pctw"><input type="range" id="aor-slider" min="0" max="100" step="1" value="${esc(S.pct || 0)}" aria-label="${T("Share of your balance")}" style="--v:${S.pct || 0}%"><div class="aor-pct">${[25, 50, 75, 100].map((p) => `<button type="button" data-pct="${p}" aria-pressed="${Number(S.pct) === p}">${p}%</button>`).join("")}</div></div>`;
    const quick = (target, list) => S.spot ? `<div class="aor-quick">${list.map(([k, l]) => `<button type="button" data-quick="${target}" data-k="${k}">${esc(l)}</button>`).join("")}</div>` : "";
    const qLimit = quick("price", buy ? [[0, tr("Pool")], [-2, "−2%"], [-5, "−5%"], [-10, "−10%"]] : [[0, tr("Pool")], [2, "+2%"], [5, "+5%"], [10, "+10%"]]) + lvlChips("price", buy ? "low" : "high");
    let fields = "";
    if (ty === "limit") {
      fields = pfield("aor-price", "Price", "price", S.spot ? fp(S.spot) : "0", qLimit, distHtml()) + field("aor-amount", "Amount", sym, F.amount) + pctRow() + totalField("Total");
      // a bracket: once this buy fills, the page asks you to sign a take-profit and a stop-loss on what it bought
      if (buy && pro) {
        const base = Number(F.price) || S.spot;
        fields += `<div class="aor-brk${F.brk ? " on" : ""}"><label class="aor-more"><input type="checkbox" id="aor-brk"${F.brk ? " checked" : ""}> <span>${T("Add a take-profit and stop-loss when it fills")}</span></label>${F.brk ? `<div class="aor-row2">${field("aor-btp", "Take profit at", qs, F.btp, base ? fp(base * 1.25) : "0", quick("btp", [[10, "+10%"], [25, "+25%"], [50, "+50%"]]))}${field("aor-bsl", "Stop loss at", qs, F.bsl, base ? fp(base * 0.9) : "0", quick("bsl", [[-5, "−5%"], [-10, "−10%"], [-20, "−20%"]]))}</div><p class="aor-note">${T("When the buy fills, this page shows a button to sign both — this browser keeps them until then.")}</p>` : ""}</div>`;
      }
    } else if (ty === "market") fields = (buy ? totalField("Spend") : field("aor-amount", "Sell", sym, F.amount)) + pctRow();
    else if (ty === "stop") fields = pfield("aor-trigger", buy ? "Buy when the price rises to" : "Sell when the price falls to", "trigger", S.spot ? fp(S.spot) : "0", quick("trigger", buy ? [[5, "+5%"], [10, "+10%"], [20, "+20%"]] : [[-5, "−5%"], [-10, "−10%"], [-20, "−20%"]]) + lvlChips("trigger", buy ? "high" : "low"), distHtml()) + field("aor-amount", "Amount", sym, F.amount) + pctRow();
    else if (ty === "tpsl") fields = field("aor-amount", "Amount", sym, F.amount) + pctRow() +
      field("aor-tp", "Take profit at", qs, F.tp, S.spot ? fp(S.spot * 1.2) : "0", quick("tp", [[10, "+10%"], [25, "+25%"], [50, "+50%"], [100, "+100%"]]) + lvlChips("tp", "high")) +
      field("aor-sl", "Stop loss at", qs, F.sl, S.spot ? fp(S.spot * 0.85) : "0", quick("sl", [[-5, "−5%"], [-10, "−10%"], [-15, "−15%"], [-25, "−25%"]]) + lvlChips("sl", "low"));
    else if (ty === "trail") fields = field("aor-amount", "Amount", sym, F.amount) + pctRow() +
      `<label class="aor-f"><small>${T("Trail by")}</small><div class="aor-quick wide">${["3", "5", "10", "15", "20"].map((v) => `<button type="button" data-trailpct="${v}" aria-pressed="${F.trail === v}" data-no-i18n>${v}%</button>`).join("")}</div></label>` +
      field("aor-floor", "Never sell below", qs, F.floor, S.spot ? fp(S.spot * (1 - Number(F.trail) / 100) * 0.8) : "0");
    else if (ty === "scaled") fields = `<div class="aor-row2">${field("aor-lo", buy ? "From (highest)" : "From (lowest)", qs, F.lo, S.spot ? fp(S.spot * (buy ? 0.98 : 1.02)) : "0")}${field("aor-hi", buy ? "To (lowest)" : "To (highest)", qs, F.hi, S.spot ? fp(S.spot * (buy ? 0.85 : 1.15)) : "0")}</div>` +
      `${S.spot ? `<div class="aor-quick aor-range">${(buy ? [[-1, -5], [-2, -10], [-5, -20]] : [[1, 5], [2, 10], [5, 20]]).map(([a, b]) => `<button type="button" data-range="${a},${b}" data-no-i18n>${pc(a, 0)} → ${pc(b, 0)}</button>`).join("")}</div>` : ""}` +
      `<label class="aor-f"><small>${T("Orders")}</small><div class="aor-quick wide">${["3", "5", "8", "10"].map((v) => `<button type="button" data-n="${v}" aria-pressed="${F.n === v}" data-no-i18n>${v}</button>`).join("")}</div></label>` +
      `<label class="aor-f"><small>${T("Shape")}</small><div class="aor-quick wide aor-dist">${[["even", "Even"], ["far", "More further out"], ["near", "More near the price"]].map(([v, l]) => `<button type="button" data-dist="${v}" aria-pressed="${F.dist === v}"><i class="aor-dsh ${v}" aria-hidden="true"><b></b><b></b><b></b><b></b></i>${T(l)}</button>`).join("")}</div></label>` +
      field("aor-amount", "Amount in total", sym, F.amount) + pctRow();
    else if (ty === "twap") fields = (buy ? totalField("Spend in total") : field("aor-amount", "Sell in total", sym, F.amount)) + pctRow() +
      `<div class="aor-row2"><label class="aor-f half"><small>${T("Over")}</small><select id="aor-dur">${[["3600", "1 hour"], ["21600", "6 hours"], ["86400", "24 hours"], ["259200", "3 days"], ["604800", "7 days"], ["2592000", "30 days"]].map(([v, l]) => `<option value="${v}"${F.dur === v ? " selected" : ""}>${T(l)}</option>`).join("")}</select></label>
        <label class="aor-f half"><small>${T("In parts")}</small><select id="aor-parts">${["4", "6", "12", "24", "48"].map((v) => `<option value="${v}"${F.parts === v ? " selected" : ""} data-no-i18n>${v}</option>`).join("")}</select></label></div>` +
      field("aor-cap", buy ? "Never pay more than" : "Never sell below", qs, F.cap, S.spot ? fp(S.spot * (buy ? 1.5 : 0.6)) : "0");
    const chipsOf = (attr, cur, list) => `<div class="aor-quick wide" role="radiogroup">${list.map(([v, l]) => `<button type="button" role="radio" data-${attr}="${v}" aria-checked="${cur === v}" aria-pressed="${cur === v}" data-no-i18n>${esc(l)}</button>`).join("")}</div>`;
    const slipChips = `<label class="aor-f"><small>${T("Slippage limit")}</small>${chipsOf("slip", F.slip, ["1", "3", "5", "10", "20"].map((v) => [v, v + "%"]))}</label>`;
    const expChips = `<label class="aor-f"><small>${T("Expires")}</small>${chipsOf("exp", F.expiry, [["86400", "1d"], ["604800", "7d"], ["2592000", "30d"], ["7776000", "90d"]])}</label>`;
    const connected = !!me();
    const adv = [ty === "stop" || ty === "tpsl" ? slipChips : "", ty === "limit" || ty === "scaled" ? condBox() : "", LIVE() && connected && ty !== "market" ? `<label class="aor-more"><input type="checkbox" id="aor-approvemore"${F.approveMore ? " checked" : ""}> <span>${T("Approve a larger amount so later orders skip this step")}</span></label>` : ""].join("");
    const b0 = tk ? build() : { err: "" };
    const fat = armOf(b0);
    const armed = fat && S.fatArm === fat.key;
    // v4: the side pill slides from where it was (the form is drawn anew on every change)
    const slideFrom = !reduce && S.prevSide && S.prevSide !== S.side ? S.prevSide : null;
    S.prevSide = S.side;
    const prog = S.steps && S.busy ? Math.round((S.steps.at / Math.max(1, S.steps.list.length)) * 100) : 0;
    const label = ty === "tpsl" ? tr("Place take-profit and stop-loss") : ty === "trail" ? tr("Place trailing stop") : ty === "twap" ? `${tr(buy ? "Start buying" : "Start selling")} ${sym}` : ty === "scaled" ? `${tr(buy ? "Place buy orders" : "Place sell orders")} · ${F.n}` : `${tr(buy ? "Buy" : "Sell")} ${sym}`;
    const btn = !tk ? `<button type="button" class="aor-submit" disabled>${T("Open a market first")}</button>`
      : !LIVE() ? `<button type="button" class="aor-submit" disabled>${T("Opens once the contract is live")}</button>`
        : !connected ? `<button type="button" class="aor-submit go" data-act="connect">${T("Connect wallet")}</button>`
          : `<button type="button" class="aor-submit ${buy ? "buy" : "sell"}${armed ? " armed" : ""}${S.busy && S.steps ? " prog" : ""}" data-act="submit" id="aor-submit"${S.busy ? ` disabled style="--p:${prog}%"` : ""}>${S.busy ? `<span class="aor-spin"></span>${T(S.busy)}` : armed && fat.k === "risk" ? T("Buy anyway — the scanner flagged it") : armed ? `${T("Place anyway —")} <span data-no-i18n>${pc(distInfo() ? distInfo().d : 0, 1)}</span> ${T("vs pool")}` : `${S.editing ? T("Replace order") : esc(label)}`}</button>`;
    const st = S.status, execBad = LIVE() && st && ty !== "market" && (!st.at || st.ago > 900 || st.low);
    const ex = EXPLAIN[ty] ? EXPLAIN[ty][buy ? 0 : 1] || EXPLAIN[ty][1] : "";
    el.innerHTML = `
      <div class="aor-fhead"><b>${T(S.editing ? "Edit order" : "Place an order")}</b><span class="aor-mode" role="radiogroup" aria-label="${T("Form mode")}"><button type="button" role="radio" data-mode="simple" aria-checked="${!pro}">${T("Simple")}</button><button type="button" role="radio" data-mode="pro" aria-checked="${pro}">${T("Pro")}</button></span><button type="button" class="aor-x aor-fclose" data-act="sheetclose" aria-label="${T("Close")}">${ICON.close}</button></div>
      ${bracketDue()}
      ${S.editing ? `<div class="aor-editing"><span>${T("Editing an order — placing this one cancels the old one.")}</span><button type="button" class="aor-link" data-act="editcancel">${T("Stop editing")}</button></div>` : ""}
      ${presetRow()}
      ${window.arcOrdersV4 ? window.arcOrdersV4.typeBox() : ""}
      <div class="aor-side" role="radiogroup" aria-label="${T("Side")}" data-side="${slideFrom || S.side}"><i class="aor-side-pill" aria-hidden="true"></i><button type="button" role="radio" class="buy" data-setside="buy" aria-checked="${buy}"${sellOnly(ty) ? " disabled" : ""}>${T("Buy")}</button><button type="button" role="radio" class="sell" data-setside="sell" aria-checked="${!buy}"${S.pending ? " disabled" : ""}>${T("Sell")}</button></div>
      ${S.pending ? `<div class="aor-gradf">${T("Limit buys only until it graduates — the pool's first price can be far from the curve's. Set the most you'd pay.")}</div>` : ""}
      <div class="aor-types${pro ? "" : " simple"}${S.pending ? " pend" : ""}" role="tablist">${TYPES_UI.filter(([k]) => (SIMPLE_TYPES.includes(k) || k === ty) && (!S.pending || k === "limit")).map(([k, l]) => `<button type="button" role="tab" data-type="${k}" aria-selected="${ty === k}">${T(l)}</button>`).join("")}${S.pending ? "" : pro ? `<span class="aor-typew"><button type="button" class="aor-moretypes pro" data-act="types" aria-haspopup="menu" aria-expanded="${!!S.typesOpen}">${T("More types")} <span aria-hidden="true">▾</span></button>${S.typesOpen ? `<div class="aor-typepop" role="menu">${TYPES_UI.filter(([k]) => !SIMPLE_TYPES.includes(k)).map(([k, l]) => `<button type="button" role="menuitem" data-type="${k}" aria-selected="${ty === k}"><b>${T(l)}</b><small>${T(TYPE_TAG[k])}</small></button>`).join("")}</div>` : ""}</span>` : `<button type="button" class="aor-moretypes" data-mode="pro">${T("More types")} <span aria-hidden="true">+5</span></button>`}</div>
      ${ex ? `<div class="aor-xp">${explainSvg(ty, buy)}<span>${T(ex)}</span></div>` : ""}
      ${!connected && tk ? `<button type="button" class="aor-avail none" data-act="connect"><small>${T("Available")}</small><b>${T("Connect a wallet to see your balance")}</b></button>` : `<button type="button" class="aor-avail" data-pct="100" title="${esc(RH() && sellTok === q && S.weth != null ? `WETH ${fmtU(S.weth, 18)} + ETH ${fmtU(S.eth || 0n, 18)}` : tr("Use all of it"))}"><small>${T("Available")}</small><b data-no-i18n>${bal != null ? `${fmtU(bal, sellTok.decimals)} ${esc(sellTok === tk ? sym : qs)}` : tk ? '<span class="aor-spin sm"></span>' : "—"}</b></button>`}
      ${RH() && LIVE() && S.weth != null && S.weth - openNeed(WETH()) > 10n ** 12n ? `<button type="button" class="aor-link aor-unwrap" data-act="unwrap">${T("Unwrap")} <span data-no-i18n>${fmtU(S.weth - openNeed(WETH()), 18)} WETH</span> ${T("to ETH")}</button>` : ""}
      ${fields}
      ${ty === "market" ? slipChips : ty === "twap" ? "" : expChips}
      ${adv ? `<details class="aor-adv"${S.advOpen ? " open" : ""}><summary>${T("Advanced")}</summary>${adv}</details>` : ""}
      ${execBad ? `<div class="aor-warn">${T(!st.at ? "The executor isn't running yet — orders wait until it starts." : st.low ? "The executor is low on gas — fills may be late." : "The executor hasn't checked in a while — fills may be late.")}</div>` : ""}
      ${tk && ty !== "market" ? stageHtml(b0) : ""}
      <div class="aor-sum" id="aor-sum">${summary()}</div>
      ${S.steps ? stepsHtml() : pathHtml(b0)}
      ${btn}
      <div class="aor-ffoot">${tk && LIVE() && connected ? `<button type="button" class="aor-link" data-act="presetsave">${T("Save as preset")}</button>` : ""}${pro && innerWidth > 720 ? `<span class="aor-keys" title="${T("Keyboard")}"><kbd>B</kbd><kbd>S</kbd> ${T("side")} · <kbd>Enter</kbd> ${T("place")} · <kbd>/</kbd> ${T("token")}</span>` : ""}</div>
      <div id="aor-msg">${S.msg ? `<div class="aor-msg ${S.msg.k}">${S.msg.html || T(S.msg.t)}</div>` : ""}</div>`;
    const sl = $("aor-slider"); if (sl) sl.style.setProperty("--v", (S.pct || 0) + "%");
    el.dataset.side = S.side; // v5: the form's tint follows the side
    mvBar();
    if (slideFrom) { const sd = el.querySelector(".aor-side"), sb = $("aor-submit"); if (sb) sb.classList.add("from-" + slideFrom); requestAnimationFrame(() => requestAnimationFrame(() => { if (sd) sd.dataset.side = S.side; if (sb) sb.classList.remove("from-" + slideFrom); })); }
    // on a phone the form lives in a sheet: results of actions taken outside it come as a toast
    if (S.msg && S.msg !== S.toasted && innerWidth <= 720 && !S.sheet && (S.msg.k === "ok" || S.msg.k === "bad")) { S.toasted = S.msg; const d = document.createElement("div"); d.innerHTML = S.msg.html || T(S.msg.t); toast(d.textContent, S.msg.k === "bad" ? "bad" : "fill"); }
  }
  // v3 helpers: the Total field in dollars, the scanner's flag
  function totalShown() { return RH() && S.ethUsd > 0 && S.usdIn ? (Number(F.total) > 0 ? String(Number((Number(F.total) * S.ethUsd).toFixed(2))) : "") : F.total; }
  function totalSub() {
    const v = Number(F.total); if (!(v > 0) || !S.quote) return "";
    return RH() && S.ethUsd > 0 && S.usdIn ? `<small class="aor-usd" data-no-i18n>≈ ${esc(num(v))} ${esc(S.quote.symbol)}</small>` : usdTag(v);
  }
  // v4: market-cap prices — the token's supply times the price, in dollars (USDC on Arc; ETH at the server's rate on
  // Robinhood Chain). The order itself is still signed at a price per token.
  const qUsd = () => (RH() ? (S.ethUsd > 0 ? S.ethUsd : null) : 1);
  const mcapOf = (p) => (p > 0 && S.supply > 0 && qUsd() ? p * S.supply * qUsd() : null);
  const mcOk = () => mcapOf(1) != null;
  const usdBig = (n) => (n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : usd(n));
  const pxShown = (k) => (S.mcapIn && mcOk() ? (Number(F[k]) > 0 ? String(Number(mcapOf(Number(F[k])).toPrecision(6))) : "") : F[k]);
  const pxSub = (k) => {
    const v = Number(F[k]);
    if (!(v > 0) || !mcOk()) return "";
    const L3 = (en, ko, zh) => (lang() === "ko" ? ko : lang() === "zh" ? zh : en);
    return S.mcapIn ? `<small class="aor-usd" data-no-i18n>= ${esc(fp(v))} ${esc(S.quote.symbol)} ${esc(L3("per token", "(토큰당)", "（每个代币）"))}</small>` : `<small class="aor-usd" data-no-i18n>${esc(L3("market cap", "시가총액", "市值"))} ≈ ${esc(usdBig(mcapOf(v)))}</small>`;
  };
  async function loadSupply() {
    const t = S.t, prov = rp();
    if (!S.tok || !prov) return;
    try {
      const v = await new ethers.Contract(S.tok.address, ["function totalSupply() view returns (uint256)"], prov).totalSupply();
      if (t === S.t) S.supply = human(v, S.tok.decimals);
    } catch { /* no market cap for this one */ }
  }
  /// v4: a market order with a large price impact, as a timed order instead (same amount, 12 parts over 6 hours)
  function toDca() {
    const buy = S.side === "buy";
    if (!PRO()) { store.set(MK, "pro"); panel.classList.remove("aor-simple"); }
    S.type = "twap"; F.dur = "21600"; F.parts = "12"; F.cap = ""; S.msg = null;
    if (!buy && !F.amount) F.amount = "";
    form(); requote(); flashField();
    toast(tr("Switched to Timed (DCA)"), "", tr("12 parts over 6 hours — change it below."));
  }
  const riskOn = () => !!(S.scan && ((S.scan.crit && S.scan.crit.length) || S.scan.k === "risk" || S.scan.k === "bad"));
  const armOf = (b) => ((b && b.warn) || []).find((w) => w.k === "fat" || (w.k === "risk" && w.arm));
  /// before placing: the steps it will take, with the ones already done ticked (an approval that covers it, WETH on hand)
  function pathHtml(b) {
    if (!S.tok || !LIVE() || !me() || !b || b.err !== undefined) return "";
    const steps = [];
    if (b.market) {
      const eth = RH() && b.sell === S.quote && S.eth != null && S.eth >= b.sellAmount + GAS_KEEP;
      if (!eth) steps.push(["Approve", allowOk(b.sell.address, b.sellAmount)]);
      steps.push(["Swap", false]);
    } else {
      const sellT = lc(b.legs[0].o.sell), need = needOf(b);
      if (RH() && sellT === lc(S.quote.address) && S.weth != null && S.weth < need) steps.push(["Wrap", false]);
      steps.push(["Approve", allowOk(sellT, need + openNeed(sellT))]);
      steps.push(["Sign", false], ["Place", false]);
    }
    return `<ol class="aor-steps preview">${steps.map(([s, ok], i) => `<li class="${ok ? "done" : ""}"><i>${ok ? ICON.check : `<span data-no-i18n>${i + 1}</span>`}</i><span>${T(ok ? "Approved" : s)}</span></li>`).join("")}</ol>`;
  }
  const allowOk = (t, need) => { const a = S.allow[lc(t)]; return a != null && need > 0n && a >= need; };
  /// what an order needs from the wallet: OCO legs share their tokens; separate orders (a scaled ladder) add up
  const needOf = (b) => (b.group ? b.legs.reduce((m, l) => (l.o.sellAmount > m ? l.o.sellAmount : m), 0n) : b.legs.reduce((s, l) => s + l.o.sellAmount, 0n));
  function stepsHtml() {
    return `<ol class="aor-steps">${S.steps.list.map((s, i) => `<li class="${i < S.steps.at ? "done" : i === S.steps.at ? "now" : ""}"><i>${i < S.steps.at ? ICON.check : `<span data-no-i18n>${i + 1}</span>`}</i><span>${T(s)}</span></li>`).join("")}</ol>`;
  }
  const setStep = (at) => { if (S.steps) { S.steps.at = at; form(); } };

  /// what the form builds right now: { legs: [{ o, body }], rows, warn } or { err }; amounts in raw units
  function build() {
    const b = build0();
    // v5: a condition on another token's price rides on every leg of a limit or scaled order
    if (b && b.err === undefined && F.condOn && (S.type === "limit" || S.type === "scaled")) {
      const cp = Number(String(F.condP).replace(/,/g, ""));
      if (!isAddr(F.condT) || !(cp > 0)) return { err: "Pick the token and the price for the condition — or untick it." };
      const cond = { token: lc(F.condT), dir: F.condDir === "below" ? "below" : "above", price: cp };
      for (const l of b.legs) l.body = { ...l.body, cond };
      const cm = S.markets.find((m) => lc(m.token.address || m.token) === cond.token);
      b.cond = { ...cond, sym: cm ? cm.token.symbol : lc(F.condT) === S.t && S.tok ? S.tok.symbol : short(cond.token) };
      b.rows = [...b.rows, { k: "Only if", v: `$${b.cond.sym} ${tr(cond.dir === "above" ? "rises to" : "falls to")} ${fp(cp)}`, cls: "cond" }];
      if (b.kind === "taker") b.kind = "maker";
    }
    // v5: a market order into a thin pool says so
    if (b && b.market && S.book && S.book.thin) (b.warn = b.warn || []).push({ k: "thin", t: "Thin liquidity: this pool moves 2% for a small trade. Check the price impact, or use a limit order." });
    // v3: a buy of a token the Token Scanner flags asks for a second press (once per token per visit)
    if (b && b.err === undefined && S.side === "buy" && riskOn()) (b.warn = b.warn || []).unshift({ k: "risk", key: `risk:${S.t}`, arm: !S.riskOk.has(S.t), t: "The Token Scanner flags this token — read its scan before you buy. This is an automated check, not advice." });
    return b;
  }
  function build0() {
    const tk = S.tok, q = S.quote, p = pool();
    if (!tk || !p) return { err: "" };
    const buy = S.side === "buy", ty = S.type, td = tk.decimals, qd = q.decimals;
    const n = (v) => Number(String(v).replace(/,/g, ""));
    const slip = n(F.slip) / 100, sym = (t) => (t === tk ? "$" + t.symbol : t.symbol);
    const warn = [], tax = S.tax || 0;
    const row = (k, v, cls = "") => ({ k, v, cls });
    if (ty === "market") {
      const amt = buy ? units(F.total, qd) : units(F.amount, td);
      if (!amt) return { err: buy ? "Enter how much to spend." : "Enter an amount." };
      return { market: true, sell: buy ? q : tk, buy: buy ? tk : q, sellAmount: amt, slip };
    }
    if (ty === "limit") {
      const P = n(F.price);
      if (!(P > 0)) return { err: "Enter a price." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const gross = qOf(amt, P, td, qd);
      if (gross === 0n) return { err: "That order is too small." };
      const o = buy ? { sell: q.address, buy: tk.address, sellAmount: qOf(amt, P, td, qd, true), buyAmount: (amt * 999n) / 1000n } : { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (gross * 999n) / 1000n };
      const taker = S.spot && (buy ? P >= S.spot * (1 + tax / 200) : P <= S.spot * (1 - tax / 200));
      const dist = S.spot ? ((P - S.spot) / S.spot) * 100 : 0;
      // a fat finger: far on the wrong side of the pool price — the button asks once more
      if (taker && Math.abs(dist) > 10) warn.push({ k: "fat", key: `${S.t}:${S.side}:${P}`, t: buy ? "This buy is far above the pool price — check the price: it would fill right away." : "This sell is far below the pool price — check the price: it would fill right away." });
      else if (taker) warn.push({ k: "taker", t: buy ? "This price is above the pool price — it would fill right away from the pool." : "This price is below the pool price — it would fill right away from the pool." });
      else if (!buy && tax > 1.5) warn.push({ k: "tax", t: `${tr("Fills from the pool need the pool price about")} ${(tax / 2).toFixed(1)}% ${tr("above your price (pool fee and token tax). Wallet-to-wallet matches don't pay them.")}` });
      if (!taker && Math.abs(dist) > 40) warn.push({ k: "far", t: "That's far from the pool price — it may wait a long time, and it only fills if the price gets there." });
      if (buy && F.brk) {
        const tp = n(F.btp), slp = n(F.bsl);
        if (!(tp > P) || !(slp > 0 && slp < P)) return { err: "Set the take-profit above your price and the stop-loss below it — or untick the bracket." };
      }
      return { legs: [{ o, body: {} }], kind: taker ? "taker" : "maker", notional: human(gross, qd), rows: [
        row(buy ? "You pay" : "You sell", `${fmtU(o.sellAmount, buy ? qd : td)} ${sym(buy ? q : tk)}`),
        row("You receive at least", `${fmtU(o.buyAmount, buy ? td : qd)} ${sym(buy ? tk : q)}`),
        feeRow(),
        ...(S.spot ? [row("vs pool price", pc(((P - S.spot) / S.spot) * 100), "dim")] : []),
      ], warn };
    }
    if (ty === "stop") {
      const Pt = n(F.trigger);
      if (!(Pt > 0)) return { err: "Enter a trigger price." };
      if (S.spot && (buy ? Pt <= S.spot : Pt >= S.spot)) return { err: buy ? "A stop buy triggers above the pool price." : "A stop sell triggers below the pool price." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const grossQ = qOf(amt, Pt, td, qd);
      if (grossQ === 0n) return { err: "That order is too small." };
      const sl = BigInt(Math.round(slip * 10000));
      const below = !buy === !!p.tokenIs0;
      const o = !buy ? { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (grossQ * (10000n - sl) * 999n) / 10000n / 1000n }
        : { sell: q.address, buy: tk.address, sellAmount: grossQ, buyAmount: (amt * 10000n * 999n) / (10000n + sl) / 1000n };
      Object.assign(o, { triggerSqrtP: trigOf(Pt, p), triggerBelow: below, poolId: p.id });
      if (tax / 2 > slip * 100) warn.push({ k: "slip", t: `${tr("Raise the slippage limit above")} ${(tax / 2).toFixed(1)}% — ${tr("this pool's fee and token tax take that much.")}` });
      return { legs: [{ o, body: { triggerPrice: Pt } }], notional: human(grossQ, qd), rows: [
        row(buy ? "You pay up to" : "You sell", `${fmtU(o.sellAmount, buy ? qd : td)} ${sym(buy ? q : tk)}`),
        row("You receive at least", `${fmtU(o.buyAmount, buy ? td : qd)} ${sym(buy ? tk : q)}`), feeRow(),
      ], warn };
    }
    if (ty === "tpsl") {
      const amt = units(F.amount, td), Ptp = n(F.tp), Psl = n(F.sl);
      if (!amt) return { err: "Enter an amount." };
      if (!(Ptp > 0)) return { err: "Enter a take-profit price." };
      if (!(Psl > 0)) return { err: "Enter a stop-loss price." };
      if (S.spot && Ptp <= S.spot) return { err: "The take-profit goes above the pool price." };
      if (S.spot && Psl >= S.spot) return { err: "The stop-loss goes below the pool price." };
      const sl = BigInt(Math.round(slip * 10000));
      const tpO = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Ptp, td, qd) * 999n) / 1000n };
      const slO = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Psl, td, qd) * (10000n - sl) * 999n) / 10000n / 1000n, triggerSqrtP: trigOf(Psl, p), triggerBelow: !!p.tokenIs0, poolId: p.id };
      if (tax / 2 > slip * 100) warn.push({ k: "slip", t: `${tr("Raise the slippage limit above")} ${(tax / 2).toFixed(1)}% — ${tr("this pool's fee and token tax take that much.")}` });
      return { legs: [{ o: tpO, body: { leg: "tp" }, name: "take-profit" }, { o: slO, body: { leg: "sl", triggerPrice: Psl }, name: "stop-loss" }], group: true, notional: human(tpO.buyAmount, qd), rows: [
        row("You sell", `${fmtU(amt, td)} ${sym(tk)}`),
        row("Take profit: at least", `${fmtU(tpO.buyAmount, qd)} ${q.symbol}`, "up"),
        row("Stop loss: at least", `${fmtU(slO.buyAmount, qd)} ${q.symbol}`, "dn"),
        feeRow(),
      ], warn };
    }
    if (ty === "trail") {
      const amt = units(F.amount, td), pct = n(F.trail), Pf = n(F.floor) || (S.spot ? S.spot * (1 - pct / 100) * 0.8 : 0);
      if (!amt) return { err: "Enter an amount." };
      if (!(Pf > 0)) return { err: "Enter the lowest price you'd sell at." };
      if (S.spot && Pf >= S.spot * (1 - pct / 100)) return { err: "The floor goes below where the trail would sell." };
      const o = { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, Pf, td, qd) * 999n) / 1000n, poolId: p.id };
      return { legs: [{ o, body: { trail: pct } }], notional: S.spot ? human(amt, td) * S.spot : human(o.buyAmount, qd), rows: [
        row("You sell", `${fmtU(amt, td)} ${sym(tk)}`), row("Sells when the price falls", `${pct}% ${tr("under its peak")}`),
        ...(S.spot ? [row("Today that's", `${fp(S.spot * (1 - pct / 100))} ${q.symbol}`, "dim")] : []),
        row("You receive at least", `${fmtU(o.buyAmount, qd)} ${q.symbol}`), feeRow(),
      ], warn };
    }
    if (ty === "scaled") {
      // a ladder: N limit orders spread evenly from one price to another, the amount split evenly between them
      const A = n(F.lo), B = n(F.hi), N = Math.max(2, Math.min(10, Math.round(n(F.n) || 5)));
      if (!(A > 0) || !(B > 0)) return { err: "Enter the price range." };
      if (Math.abs(A - B) / Math.max(A, B) < 0.002) return { err: "Spread the range a little wider." };
      const amt = units(F.amount, td);
      if (!amt) return { err: "Enter an amount." };
      const each = amt / BigInt(N);
      if (each === 0n) return { err: "That order is too small." };
      // v5: the ladder's shape — even, more further out (1, 2, 3 … parts), or more near the price (N … 1)
      const wts = Array.from({ length: N }, (_, i) => BigInt(F.dist === "far" ? i + 1 : F.dist === "near" ? N - i : 1)), wsum = wts.reduce((x, y) => x + y, 0n);
      const shares = wts.map((wv) => (amt * wv) / wsum);
      shares[N - 1] += amt - shares.reduce((x, y) => x + y, 0n);
      if (shares.some((x) => x === 0n)) return { err: "That order is too small." };
      const legs = [];
      let pay = 0n, get = 0n, notional = 0;
      for (let i = 0; i < N; i++) {
        const P = Number((A + ((B - A) * i) / (N - 1)).toPrecision(6));
        const a = shares[i];
        const gross = qOf(a, P, td, qd);
        if (gross === 0n) return { err: "That order is too small." };
        const o = buy ? { sell: q.address, buy: tk.address, sellAmount: qOf(a, P, td, qd, true), buyAmount: (a * 999n) / 1000n } : { sell: tk.address, buy: q.address, sellAmount: a, buyAmount: (gross * 999n) / 1000n };
        legs.push({ o, body: {}, name: `#${i + 1}`, price: P });
        pay += o.sellAmount; get += o.buyAmount; notional += human(gross, qd);
      }
      const takers = S.spot ? legs.filter((l) => (buy ? l.price > S.spot : l.price < S.spot)).length : 0;
      if (takers) warn.push({ k: "taker", t: `${takers} ${tr(buy ? "of these prices are above the pool price — those fill right away." : "of these prices are below the pool price — those fill right away.")}` });
      return { legs, scaled: true, notional, ladder: legs.map((l) => l.price), rows: [
        row("Orders", F.dist === "even" ? `${N} × ≈ ${num(human(each, td))} ${sym(tk)}` : `${N} · ${num(human(shares[0], td))} → ${num(human(shares[N - 1], td))} ${sym(tk)}`),
        row("Prices", `${fp(legs[0].price)} → ${fp(legs[N - 1].price)}`),
        row(buy ? "You pay in total" : "You sell in total", `${fmtU(pay, buy ? qd : td)} ${sym(buy ? q : tk)}`),
        row("You receive at least", `${fmtU(get, buy ? td : qd)} ${sym(buy ? tk : q)}`),
        ...(S.spot ? [row("Average vs pool", pc(((legs.reduce((s2, l) => s2 + l.price, 0) / N - S.spot) / S.spot) * 100), "dim")] : []),
        feeRow(),
      ], warn };
    }
    // timed (DCA / TWAP)
    const cap = n(F.cap) || (S.spot ? S.spot * (buy ? 1.5 : 0.6) : 0), dur = n(F.dur), parts = n(F.parts);
    if (!(cap > 0)) return { err: buy ? "Enter the most you'd pay per token." : "Enter the least you'd sell for per token." };
    const amt = buy ? units(F.total, qd) : units(F.amount, td);
    if (!amt) return { err: buy ? "Enter how much to spend." : "Enter an amount." };
    const o = buy ? { sell: q.address, buy: tk.address, sellAmount: amt, buyAmount: (tOf(amt, cap, td, qd) * 999n) / 1000n } : { sell: tk.address, buy: q.address, sellAmount: amt, buyAmount: (qOf(amt, cap, td, qd) * 999n) / 1000n };
    if (o.buyAmount === 0n) return { err: "That order is too small." };
    const start = now() + 30;
    Object.assign(o, { start: BigInt(start), duration: dur, expiry: BigInt(start + dur + 86400) });
    const each = Number(amt) / parts / 10 ** (buy ? qd : td);
    return { legs: [{ o, body: { parts } }], timed: true, notional: buy ? human(amt, qd) : human(o.buyAmount, qd), rows: [
      row(buy ? "You spend" : "You sell", `${fmtU(amt, buy ? qd : td)} ${sym(buy ? q : tk)}`),
      row("Each part", `≈ ${num(each)} ${sym(buy ? q : tk)} · ${tr("every")} ${dur / parts >= 3600 ? (dur / parts / 3600).toFixed(1) + "h" : Math.round(dur / parts / 60) + "m"}`),
      row(buy ? "Never above" : "Never below", `${fp(cap)} ${q.symbol}`), feeRow(),
    ], warn };
  }
  /// the fee line: 0% for holders of enough $ARCIRCLE (the contract's fee policy), else 0.1% with how to get to 0
  const feeRow = () => (S.feeFree ? { k: "Fee", v: `0% · ${tr("you hold")} ${num(S.freeMin || FREE_HOLD())}+ $ARCIRCLE`, cls: "up" } : { k: "Fee", v: "0.1% · " + tr("of what you receive"), cls: "", hint: true });
  const feeHint = () => (S.feeFree ? "" : `<div class="aor-free">${T("Hold")} <b data-no-i18n>${num(S.freeMin || FREE_HOLD())} $ARCIRCLE</b> ${T("and every order is fee-free.")} <a href="#arcircle" data-no-i18n>$ARCIRCLE →</a></div>`);
  const net = (out) => (S.feeFree ? out : (out * 999n) / 1000n);
  /// v3: the order in one plain sentence, above the numbers
  function say() {
    const buy = S.side === "buy", ty = S.type, sym = "$" + S.tok.symbol, qs = S.quote.symbol;
    const B = (v) => `<b data-no-i18n>${esc(v)}</b>`, n = (v) => Number(String(v || "").replace(/,/g, "")) || 0;
    const amt = B(`${num(n(F.amount))} ${sym}`), px = (v) => B(`${fp(n(v))} ${qs}`), tot = B(`${num(n(F.total))} ${qs}`);
    const exp = ` · ${T("expires in")} ${B(Math.round(n(F.expiry) / 86400) + "d")}`;
    const DUR = { 3600: "1 hour", 21600: "6 hours", 86400: "24 hours", 259200: "3 days", 604800: "7 days", 2592000: "30 days" };
    let s = "";
    if (ty === "limit") s = `${T(buy ? "Buy" : "Sell")} ${amt} ${T(buy ? "at or below" : "at or above")} ${px(F.price)}${exp}`;
    else if (ty === "market") s = buy ? `${T("Buy now with")} ${tot}` : `${T("Sell now")} ${amt}`;
    else if (ty === "stop") s = `${T(buy ? "Buy" : "Sell")} ${amt} ${T(buy ? "once the price rises to" : "once the price falls to")} ${px(F.trigger)}${exp}`;
    else if (ty === "tpsl") s = `${T("Sell")} ${amt} · ${T("Take profit at")} ${px(F.tp)} · ${T("Stop loss at")} ${px(F.sl)}${exp}`;
    else if (ty === "trail") s = `${T("Sell")} ${amt} · ${T("Trail by")} ${B(F.trail + "%")}${n(F.floor) > 0 ? ` · ${T("Never sell below")} ${px(F.floor)}` : ""}${exp}`;
    else if (ty === "scaled") s = `${T(buy ? "Buy" : "Sell")} ${amt} · ${B(F.n + " ×")} · ${px(F.lo)} → ${px(F.hi)}${exp}`;
    else if (ty === "twap") s = `${buy ? `${T("Spend in total")} ${tot}` : `${T("Sell in total")} ${amt}`} · ${T("Over")} ${B(tr(DUR[F.dur] || ""))}`;
    return s ? `<p class="aor-say ${buy ? "up" : "dn"}">${s}</p>` : "";
  }
  function summary() {
    if (!S.tok) return "";
    const o = build();
    if (o.err !== undefined) return `<div class="aor-sl"><span>${T("You receive at least")}</span><b>—</b></div><div class="aor-sl ${feeRow().cls}"><span>${T("Fee")}</span><b data-no-i18n>${esc(feeRow().v)}</b></div>${feeHint()}`;
    const sym = (t) => (t === S.tok ? "$" + t.symbol : t.symbol);
    const warns = (o.warn || []).map((w) => `<div class="aor-warn${w.k === "fat" ? " fat" : w.k === "risk" ? " risk" : ""}">${T(w.t)}${w.k === "risk" ? ` <a href="#scanner?${RH() ? "c=rh&" : ""}t=${S.t}">${T("Open the scan")} →</a>` : ""}</div>`).join("");
    if (o.market) {
      const est = S.quoteOut != null && S.quoteFor === `${o.sell.address}:${o.sellAmount}` ? S.quoteOut : null;
      const impact = est != null && S.spot ? (() => { const inH = human(o.sellAmount, o.sell.decimals), outH = human(est, o.buy.decimals); const px = o.sell === S.quote ? inH / outH : outH / inH; return ((px - S.spot) / S.spot) * 100 * (o.sell === S.quote ? 1 : -1); })() : null;
      return `${say()}<div class="aor-sl"><span>${T("Estimated")}</span><b data-no-i18n>${est != null ? `${fmtU(net(est), o.buy.decimals)} ${esc(sym(o.buy))}` : "…"}</b></div>
        <div class="aor-sl"><span>${T("You receive at least")}</span><b data-no-i18n>${est != null ? `${fmtU(minNet(est, o.slip), o.buy.decimals)} ${esc(sym(o.buy))}` : "—"}</b></div>
        ${impact != null ? `<div class="aor-sl dim"><span>${T("Price impact")}</span><b data-no-i18n class="${impact > 5 ? "warn" : ""}">${pc(impact)}</b></div>` : ""}
        ${impact != null && impact > 3 ? `<div class="aor-dca"><span>${T("That moves the price a lot. Split it into 12 parts over 6 hours instead?")}</span><button type="button" class="aor-btn sm go" data-act="todca">${T("Use Timed (DCA)")}</button></div>` : ""}
        <div class="aor-sl ${feeRow().cls}"><span>${T("Fee")}</span><b data-no-i18n>${esc(feeRow().v)}</b></div>${feeHint()}${warns}`;
    }
    const kind = o.kind ? `<div class="aor-kind ${o.kind}"><i></i><span>${T(o.kind === "taker" ? "Fills now (taker)" : "Waits in the book (maker)")}</span>${o.kind === "taker" ? `<button type="button" class="aor-link" data-type="market">${T("Use Market instead")}</button>` : ""}</div>` : "";
    // v2: where the fee goes (half buys and burns $ARCIRCLE) — or what a holder saves
    const qs = S.quote.symbol, fee = o.notional > 0 ? o.notional * FEE : 0;
    const qamt = (v) => (RH() ? `${num(v)} ${qs}` : v > 0 && v < 0.01 ? "<$0.01" : usd(v));
    const feeLine = fee > 0 ? (S.feeFree ? `<div class="aor-sl up"><span>${T("Fee saved")}</span><b data-no-i18n>≈ ${qamt(fee)}</b></div>` : `<div class="aor-sl dim aor-burn"><span>${T("Half the fee buys and burns $ARCIRCLE")}</span><b data-no-i18n>≈ ${qamt(fee / 2)}</b></div>`) : "";
    // Robinhood Chain: a buy order is signed over WETH — what gets wrapped first
    let wrapLine = "";
    if (RH() && o.legs && lc(o.legs[0].o.sell) === lc(S.quote.address) && S.weth != null) {
      const need = needOf(o), short0 = need > S.weth ? need - S.weth : 0n;
      wrapLine = `<div class="aor-sl dim"><span>${T(short0 > 0n ? "Wraps first (one transaction)" : "Paid from your WETH")}</span><b data-no-i18n>${short0 > 0n ? `${fmtU(short0, 18)} ETH → WETH` : `${fmtU(need, 18)} WETH`}</b></div>`;
    }
    const ladder = o.ladder && S.spot ? ladderSvg(o.ladder) : "";
    return say() + kind + ladder + o.rows.map((r) => `<div class="aor-sl ${r.cls}"><span>${T(r.k)}</span><b data-no-i18n>${esc(r.v)}</b></div>`).join("") + feeLine + wrapLine + feeHint() + warns;
  }
  /// a scaled order's prices against the pool's, as ticks on one line
  function ladderSvg(list) {
    const all = [...list, S.spot], lo = Math.min(...all), hi = Math.max(...all), r = hi - lo || 1, W = 280;
    const x = (p) => 8 + ((p - lo) / r) * (W - 16);
    const buy = S.side === "buy";
    return `<svg class="aor-ladder" viewBox="0 0 ${W} 30" aria-hidden="true"><path class="ax" d="M8 18H${W - 8}"/>${list.map((p, i) => `<path class="tk ${buy ? "up" : "dn"}" style="animation-delay:${i * 40}ms" d="M${x(p).toFixed(1)} 10V26"/>`).join("")}<path class="sp" d="M${x(S.spot).toFixed(1)} 4V30"/><text x="${Math.min(W - 40, Math.max(4, x(S.spot) - 14)).toFixed(1)}" y="8">${esc(tr("pool"))}</text></svg>`;
  }
  const minNet = (out, slip) => (net(out) * BigInt(Math.round((1 - slip) * 10000))) / 10000n;
  let qTimer = 0;
  function requote() {
    clearTimeout(qTimer);
    if (S.type !== "market" || !LIVE()) return;
    qTimer = setTimeout(async () => {
      const o = build(); const p = pool();
      if (o.err !== undefined || !p) return;
      const key = `${o.sell.address}:${o.sellAmount}`;
      const out = await quoteOut(p, o.sell.address, o.sellAmount).catch(() => null);
      S.quoteOut = out; S.quoteFor = out != null ? key : null;
      const sum = $("aor-sum"); if (sum) sum.innerHTML = summary();
    }, 350);
  }

  // ---------------- placing ----------------
  /// the contract may pull `need` of `token`: already (an approval, or a Permit2 allowance), with a Permit2 signature
  /// (no gas — for wallets that approved Permit2 before, as Uniswap asks), or with an approval transaction.
  /// Returns a signed permit to send with the order, or null.
  async function ensureAllowance(s, token, need, { permitOk = false, until = 0 } = {}) {
    const c = new ethers.Contract(token.address, ERC20, rp());
    const a = await c.allowance(me(), ORDERS());
    if (a >= need) return null;
    const toP2 = isAddr(PERMIT2()) ? await c.allowance(me(), PERMIT2()).catch(() => 0n) : 0n;
    if (toP2 >= need) {
      const al = await new ethers.Contract(PERMIT2(), P2_ABI, rp()).allowance(me(), token.address, ORDERS()).catch(() => null);
      if (al && al.amount >= need && Number(al.expiration) > now() + 120) return null;
      if (permitOk && al) {
        S.busy = "Sign the Permit2 allowance in your wallet…"; form();
        const exp = Math.max(now() + 180 * 86400, until + 86400);
        const permit = { details: { token: token.address, amount: F.approveMore ? (1n << 160n) - 1n : need, expiration: exp, nonce: Number(al.nonce) }, spender: ORDERS(), sigDeadline: exp };
        const sig = await s.signTypedData({ name: "Permit2", chainId: CHAIN(), verifyingContract: PERMIT2() }, P2_TYPES, permit);
        return { details: { ...permit.details, amount: permit.details.amount.toString() }, spender: permit.spender, sigDeadline: String(permit.sigDeadline), sig };
      }
    }
    S.busy = "Approve in your wallet…"; form();
    const tx = await new ethers.Contract(token.address, ERC20, s).approve(ORDERS(), F.approveMore ? ethers.MaxUint256 : need);
    S.busy = "Waiting for the approval…"; form();
    await tx.wait();
    return null;
  }
  /// what the maker's other open orders already need from this token (the approval covers them all)
  function openNeed(tokenAddr) {
    let n = 0n;
    for (const o of ((S.mine && S.mine.orders) || [])) if ((o.status === "open" || o.status === "unfunded") && o.order && lc(o.order.sell) === tokenAddr) n += BigInt(o.order.sellAmount) - BigInt(o.filled || 0);
    return n;
  }
  const post = async (body) => {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(RH() ? { ...body, chain: "rh" } : body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ? tr(j.error) : `HTTP ${r.status}`);
    return j;
  };
  const jsonOrder = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
  async function submit() {
    if (S.busy) return;
    const b = build();
    if (b.err !== undefined) { S.msg = { k: "bad", t: b.err || "Open a market first." }; form(); return; }
    // a price far on the wrong side of the pool asks for a second press
    const fat = armOf(b);
    if (fat && S.fatArm !== fat.key) { S.fatArm = fat.key; S.msg = null; form(); return; }
    if (fat && fat.k === "risk") S.riskOk.add(S.t);
    S.fatArm = null;
    const p = pool();
    S.msg = null;
    const snap = { chain: CH, t: S.t, side: S.side, type: S.type, off: S.spot && (S.type === "limit" || S.type === "stop") ? Number((((Number(S.type === "stop" ? F.trigger : F.price) - S.spot) / S.spot) * 100).toFixed(2)) : null,
      amount: F.amount, total: F.total, expiry: F.expiry, trail: F.trail, dur: F.dur, parts: F.parts, n: F.n, slip: F.slip, pct: S.pct || 0 };
    try {
      const s = await signer();
      const maker = me();
      if (b.market) {
        // Robinhood Chain: a buy pays in ETH straight from the wallet when there's enough, and a sell pays out ETH
        const useEth = RH() && b.sell === S.quote && (await rp().getBalance(maker)) >= b.sellAmount + GAS_KEEP;
        S.steps = { list: useEth ? ["Swap"] : ["Approve", "Swap"], at: 0 }; form();
        if (!useEth) {
          const bal = await new ethers.Contract(b.sell.address, ERC20, rp()).balanceOf(maker);
          if (bal < b.sellAmount) throw new Error(tr(RH() && b.sell === S.quote ? "Not enough ETH (or WETH) for this order." : "Not enough balance for this order."));
          await ensureAllowance(s, b.sell, b.sellAmount);
          setStep(1);
        }
        S.busy = "Getting the price…"; form();
        const out = await quoteOut(p, b.sell.address, b.sellAmount);
        if (out == null) throw new Error(tr("Couldn't read a price from the pool right now."));
        S.busy = "Confirm the swap in your wallet…"; form();
        const oc = new ethers.Contract(ORDERS(), ORDERS_ABI, s);
        const tx = RH() ? await oc.swapMarketNative(keyOf(p), b.sell.address, b.buy.address, b.sellAmount, minNet(out, b.slip), b.buy === S.quote, { value: useEth ? b.sellAmount : 0n })
          : await oc.swapMarket(keyOf(p), b.sell.address, b.buy.address, b.sellAmount, minNet(out, b.slip));
        S.busy = "Swapping…"; form();
        const rc = await tx.wait();
        setStep(useEth ? 1 : 2);
        post({ action: "orderfilled", tx: rc.hash || tx.hash }).catch(() => null);
        S.msg = { k: "ok", html: `${T("Swapped.")} ${txa(rc.hash || tx.hash, tr("View transaction"))}` };
        store.set(LASTK, snap);
        F.amount = ""; F.total = ""; S.pct = 0;
        celebrate();
      } else {
        const legs = b.legs, sellTok = lc(legs[0].o.sell) === S.tok.address ? S.tok : S.quote;
        const need = needOf(b);
        let bal = await new ethers.Contract(sellTok.address, ERC20, rp()).balanceOf(maker);
        // Robinhood Chain: a buy order sells WETH — wrap the ETH it's short of first
        let wrap = 0n;
        if (RH() && sellTok === S.quote && bal < need) {
          const eth = await rp().getBalance(maker);
          if (bal + (eth > GAS_KEEP ? eth - GAS_KEEP : 0n) < need) throw new Error(tr("Not enough ETH (or WETH) for this order."));
          wrap = need - bal;
        }
        const w0 = wrap > 0n ? 1 : 0;
        const list = [...(w0 ? ["Wrap"] : []), "Approve", ...(b.scaled ? ["Sign the orders"] : legs.length > 1 ? legs.map((l) => "Sign the " + l.name) : ["Sign"]), "Place", ...(S.editing ? ["Cancel the old order"] : [])];
        S.steps = { list, at: 0 }; form();
        if (w0) {
          S.busy = "Wrap ETH in your wallet…"; form();
          const wt = await new ethers.Contract(WETH(), WETH_ABI, s).deposit({ value: wrap });
          S.busy = "Wrapping…"; form();
          await wt.wait();
          bal += wrap;
          setStep(1);
        }
        if (bal < need) throw new Error(tr("Not enough balance for this order."));
        const exp0 = now() + Number(F.expiry || 604800);
        const permit = await ensureAllowance(s, sellTok, need + openNeed(sellTok.address) - (S.editing ? BigInt(S.editing.rem || 0) : 0n), { permitOk: !!isAddr(PERMIT2()), until: b.timed ? Number(legs[0].o.expiry) : exp0 });
        setStep(w0 + 1);
        const epoch = Number(await new ethers.Contract(ORDERS(), ORDERS_ABI, rp()).epochOf(maker));
        const grp = b.group ? BigInt(ethers.hexlify(ethers.randomBytes(8))) : 0n;
        const exp = BigInt(exp0);
        const signed = [];
        for (const [i, l] of legs.entries()) {
          S.busy = b.scaled ? `${tr("Sign order")} ${i + 1} / ${legs.length} ${tr("in your wallet…")}` : legs.length > 1 ? (i ? "Sign the stop-loss in your wallet…" : "Sign the take-profit in your wallet…") : "Sign the order in your wallet…"; form();
          const order = { maker, triggerSqrtP: 0n, triggerBelow: false, poolId: ZERO32, expiry: exp, start: 0n, duration: 0, group: grp, epoch, salt: BigInt(ethers.hexlify(ethers.randomBytes(16))), ...l.o };
          const sig = await s.signTypedData({ name: "ARCIRCLE Orders", version: "1", chainId: CHAIN(), verifyingContract: ORDERS() }, TYPES, order);
          signed.push({ order, sig, body: l.body });
          if (!b.scaled || i === legs.length - 1) setStep(w0 + 1 + (b.scaled ? 1 : i + 1));
        }
        S.busy = "Placing…"; form();
        const placed = [];
        for (const [i, x] of signed.entries()) {
          if (b.scaled) { S.busy = `${tr("Placing")} ${i + 1} / ${signed.length}…`; form(); }
          try { placed.push(await post({ action: "orderplace", token: S.t, key: keyOf(p), sig: x.sig, order: jsonOrder(x.order), ...x.body, ...(permit ? { permit } : {}) })); }
          catch (e) { if (!placed.length) throw e; throw new Error(`${placed.length} / ${signed.length} ${tr("placed — the rest didn't go through:")} ${errText(e)}`); }
        }
        // a bracket: remembered here until the buy fills, then the page offers to sign its take-profit and stop-loss
        if (S.type === "limit" && S.side === "buy" && F.brk && placed[0] && placed[0].hash) {
          store.set(BRK, [...brackets().filter((x) => x.h !== placed[0].hash), { h: placed[0].hash, t: S.t, ch: CH, sym: S.tok.symbol, tp: F.btp, sl: F.bsl, until: Number(exp0) + 86400 }].slice(-20));
        }
        setStep(list.length - (S.editing ? 1 : 0));
        if (S.editing) {
          S.busy = "Sign to cancel the old order…"; form();
          const old = S.editing;
          const sig = await s.signMessage(`Cancel ARCIRCLE order ${old.hash}`);
          await post({ action: "ordercancel", token: old.token, hash: old.hash, sig });
          S.editing = null; setStep(list.length);
        }
        S.msg = { k: "ok", t: { stop: "Stop order placed — it waits for its trigger.", tpsl: "Take-profit and stop-loss placed — when one fills, the other is cancelled.", trail: "Trailing stop placed — it follows the price up.", twap: "Timed order placed — the first part fills once it's released.", scaled: "Scaled orders placed — each fills as soon as a wallet or the pool meets its price." }[S.type] || (F.brk && S.side === "buy" ? "Order placed — when it fills, set its take-profit and stop-loss here." : "Order placed — it fills as soon as a wallet or the pool meets your price.") };
        if (b.cond) S.msg = { k: "ok", t: `${tr("Order placed — it waits until")} $${b.cond.sym} ${tr(b.cond.dir === "above" ? "rises to" : "falls to")} ${fp(b.cond.price)}.` };
        store.set(LASTK, snap);
        const flyPrice = S.type === "limit" ? Number(F.price) : null;
        if (flyPrice > 0) S.drop = { p: flyPrice, at: Date.now(), t0: 0 };
        F.amount = ""; F.total = ""; S.pct = 0;
        if (S.tpslFrom) { store.set(BRK, brackets().filter((x) => x.h !== S.tpslFrom)); S.tpslFrom = null; }
        flyToMine(flyPrice);
      }
    } catch (e) {
      S.msg = { k: "bad", t: errText(e) };
    }
    S.busy = false;
    setTimeout(() => { S.steps = null; form(); }, 2600);
    await Promise.all([loadBook(), loadMine(), loadBal(), loadSpot()]);
    market(); bookView(); chartView(); form(); mineView();
  }
  /// the summary flies into the book row at its price (a limit order) — or down into "Open orders"
  function flyToMine(price) {
    const from = $("aor-sum");
    if (reduce || !from) return;
    let to = null;
    if (price > 0) {
      const rows = [...panel.querySelectorAll("#aor-book .aor-lv[data-price]:not(.ghost)")];
      to = rows.sort((x, y) => Math.abs(Number(x.dataset.price) - price) - Math.abs(Number(y.dataset.price) - price))[0] || null;
      const r = to && to.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > innerHeight || !r.width) to = null;
    }
    to = to || $("aor-mine");
    if (!to) return;
    const a = from.getBoundingClientRect(), bRect = to.getBoundingClientRect();
    const ghost = from.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.className = "aor-sum aor-ghost";
    Object.assign(ghost.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px" });
    document.body.appendChild(ghost);
    requestAnimationFrame(() => { ghost.style.transform = `translate(${bRect.left + 20 - a.left}px, ${bRect.top + 4 - a.top}px) scale(.3)`; ghost.style.opacity = "0"; });
    setTimeout(() => { ghost.remove(); if (to.classList && to.classList.contains("aor-lv")) { to.classList.remove("landed"); void to.offsetWidth; to.classList.add("landed"); } }, 820);
  }
  function celebrate() {
    const e = panel.querySelector(".aor-emblem");
    if (!e || reduce) return;
    e.classList.remove("fire"); void e.offsetWidth; e.classList.add("fire");
  }
  /// a short burst of confetti from a point (a fill)
  function confetti(x, y) {
    if (reduce) return;
    const box = document.createElement("div"); box.className = "aor-conf"; box.style.left = x + "px"; box.style.top = y + "px";
    const cs = ["#39ff88", "#4dd4ff", "#ffc861", "#7dffb8", "#ff9b8a"];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement("i"), a = (Math.PI * 2 * i) / 22 + Math.random() * 0.4, d = 50 + Math.random() * 70;
      p.style.setProperty("--x", `${Math.cos(a) * d}px`); p.style.setProperty("--y", `${Math.sin(a) * d - 30}px`); p.style.setProperty("--r", `${Math.random() * 540 - 270}deg`);
      p.style.background = cs[i % cs.length]; p.style.animationDelay = `${Math.random() * 80}ms`;
      box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 1400);
  }

  // ---------------- my orders ----------------
  const STATUS = { open: "Open", unfunded: "Needs balance or approval", filled: "Filled", cancelled: "Cancelled", expired: "Expired" };
  const TYPE_NAME = { limit: "Limit", stop: "Stop order", trail: "Trailing stop", twap: "Timed (DCA)" };
  /// a fill ring; when it grew since the last read it sweeps from where it was
  function ring(pct, prev) {
    const r = 9, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, pct || 0));
    const from = prev != null && prev < f && !reduce ? Math.max(0, prev) : null;
    return `<svg class="aor-ring${f >= 100 ? " full" : ""}${from != null ? " sweep" : ""}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" class="bg"/><circle cx="12" cy="12" r="${r}" class="fg" style="stroke-dasharray:${((f / 100) * c).toFixed(2)} ${c.toFixed(2)}${from != null ? `;--from:${((from / 100) * c).toFixed(2)}px;--to:${((f / 100) * c).toFixed(2)}px;--c:${c.toFixed(2)}px` : ""}"/></svg>`;
  }
  /// v5: the last day before an order expires, as a ring that empties
  function expRing(left) {
    const r = 6, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, left / 86400));
    return `<svg class="aor-exr" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r}" class="bg"/><circle cx="8" cy="8" r="${r}" class="fg" style="stroke-dasharray:${(f * c).toFixed(2)} ${c.toFixed(2)}"/></svg>`;
  }
  function mineView() {
    const el = $("aor-mine"); if (!el) return;
    const cx = $("aor-cxall"), cm = $("aor-cxmkt"), foot = $("aor-mfoot");
    if (foot) foot.innerHTML = "";
    if (!me()) { el.innerHTML = `<div class="aor-empty">${T("Connect a wallet to see your orders.")}</div>`; if (cx) cx.hidden = true; if (cm) cm.hidden = true; return; }
    if (S.locked) {
      el.innerHTML = `<div class="aor-lock"><b>${T("Your orders are private")}</b><span>${T("Sign once (free, no gas) to see them here for 30 days.")}</span><button type="button" class="aor-btn go" data-act="unlock">${T("Show my orders")}</button></div>`;
      if (cx) cx.hidden = !LIVE(); if (cm) cm.hidden = true; return;
    }
    // v5: Portfolio — what this wallet holds on this chain (arc-orders-v5.js)
    if (S.myTab === "port") { if (cx) cx.hidden = true; if (cm) cm.hidden = true; if (window.arcOrdersV5) window.arcOrdersV5.portfolio(el); else el.innerHTML = ""; return; }
    delete el.dataset.pf;
    if (!S.mine) { el.innerHTML = skel(4); return; }
    const here = ((S.mine && S.mine.orders) || []).filter((o) => S.myScope !== "market" || lc(o.token.address || o.token) === S.t);
    const all = S.myScope === "both" && S.other && S.other.ch !== CH ? [...here, ...S.other.orders].sort((a, b) => (b.at || 0) - (a.at || 0)) : here;
    const soon = (o) => (o.status === "open" && !o._ch && o.expiry && o.expiry > now() && o.expiry - now() < 86400 ? o.expiry - now() : 0);
    const isOpen = (o) => o.status === "open" || o.status === "unfunded";
    const stOf = (o) => (o.expiry && o.expiry < now() && o.status === "open" ? "expired" : o.status);
    const open = all.filter(isOpen), hist = all.filter((o) => !isOpen(o));
    if ($("aor-n-open")) $("aor-n-open").textContent = open.length ? String(open.length) : "";
    if ($("aor-n-hist")) $("aor-n-hist").textContent = hist.length ? String(hist.length) : "";
    if (cx) { cx.hidden = !(LIVE() && open.length); armBtn(cx, "cancelall"); }
    if (cm) { cm.hidden = !(S.t && open.some((o) => lc(o.token.address || o.token) === S.t)); armBtn(cm, "cancelmarket"); }
    let list = S.myTab === "open" ? open : hist, hidden = 0;
    let filt = "";
    if (S.myTab === "history" && hist.length) {
      const cnt = (k) => hist.filter((o) => stOf(o) === k).length;
      filt = `<div class="aor-hf" role="radiogroup" aria-label="${T("Show")}">${[["all", "All"], ["filled", "Filled"], ["expired", "Expired"], ["cancelled", "Cancelled"]].map(([k, l]) => `<button type="button" role="radio" data-hf="${k}" aria-checked="${S.histF === k}">${T(l)}${k !== "all" ? ` <em data-no-i18n>${cnt(k)}</em>` : ""}</button>`).join("")}</div>`;
      if (S.histF !== "all") list = hist.filter((o) => stOf(o) === S.histF);
      else if (!S.showCx) { const keep = hist.filter((o) => stOf(o) !== "cancelled" || o.filledPct > 0); hidden = hist.length - keep.length; list = keep; }
    }
    S.lastList = list;
    // v3: once a day, a nudge when an open order runs out within 24 hours
    const nSoon = open.filter((o) => soon(o)).length;
    if (nSoon && store.get("arcircle.orders.expnote", "") !== new Date().toDateString()) { store.set("arcircle.orders.expnote", new Date().toDateString()); toast(`${nSoon} ${tr(nSoon === 1 ? "order expires within a day" : "orders expire within a day")}`, "alert", tr("Extend it 7 days from your open orders.")); }
    // v6: no open orders here — two starting points, one tap each (they fill the form; nothing is signed)
    const ideas = S.myTab === "open" && !hidden && S.spot > 0 && S.tok && !S.pending ? `<div class="aor-ideas"><span>${T("Start with one:")}</span><button type="button" class="aor-btn sm ghost up" data-price="${Number((S.spot * 0.9).toPrecision(4))}" data-sug="buy">${esc(L3(`Buy $${S.tok.symbol} 10% under the pool`, `풀 가격보다 10% 낮게 $${S.tok.symbol} 매수`, `低于池价 10% 买入 $${S.tok.symbol}`))}</button><button type="button" class="aor-btn sm ghost dn" data-price="${Number((S.spot * 1.2).toPrecision(4))}" data-sug="sell">${esc(L3(`Sell $${S.tok.symbol} 20% over the pool`, `풀 가격보다 20% 높게 $${S.tok.symbol} 매도`, `高于池价 20% 卖出 $${S.tok.symbol}`))}</button></div>` : "";
    if (!list.length) { el.innerHTML = filt + ideas + `<div class="aor-empty">${T(S.myTab === "open" ? "No open orders." : hidden ? "Only cancelled orders here." : "Nothing here yet.")}${hidden ? ` <button type="button" class="aor-link" data-act="showcx">${T("Show")} <span data-no-i18n>${hidden}</span> ${T("cancelled")}</button>` : ""}</div>`; mineFoot(); return; }
    // v6: two or more plain limit orders in this market — move them all by a few percent (each signed again, one by one)
    const movable = S.myTab === "open" && LIVE() ? shiftable() : [];
    const shiftRow = movable.length >= 2 ? `<div class="aor-shift">${S.shift ? `<span><span class="aor-spin"></span>${esc(L3(`Moving ${S.shift.at + 1} of ${S.shift.n} — sign each in your wallet`, `${S.shift.n}개 중 ${S.shift.at + 1}번째 이동 중 — 지갑에서 하나씩 서명하세요`, `正在移动第 ${S.shift.at + 1}/${S.shift.n} 个 — 请在钱包中逐个签名`))}</span><button type="button" class="aor-btn sm ghost" data-act="shiftstop">${T("Stop")}</button>` : `<span>${esc(L3(`Move all ${movable.length} limit orders here`, `이 마켓 지정가 주문 ${movable.length}개 모두 이동`, `移动此处全部 ${movable.length} 个限价单`))}</span>${[-5, -2, 2, 5].map((k) => `<button type="button" class="aor-btn sm ghost ${k < 0 ? "dn" : "up"}" data-shift="${k}" data-no-i18n>${k > 0 ? "+" : "−"}${Math.abs(k)}%</button>`).join("")}`}</div>` : "";
    el.innerHTML = filt + shiftRow + `<div class="aor-mt"><div class="aor-mt-h"><span>${T("Market")}</span><span>${T("Type")}</span><span>${T("Price")}</span><span>${T("Amount")}</span><span>${T("Filled")}</span><span>${T("Status")}</span><span></span></div>${list.map((o) => {
      const tk = o.token || {}, q = o.quote || {};
      const amt = o.side === "sell" ? human(o.sellAmount, tk.decimals) : o.type === "twap" ? human(o.sellAmount, q.decimals) : human(o.buyAmount, tk.decimals) / (1 - FEE);
      const amtSym = o.side === "buy" && o.type === "twap" ? q.symbol : "";
      const st = stOf(o);
      const px = o.type === "stop" && o.trigger && o.trigger.price ? o.trigger.price : o.type === "trail" && o.trail ? o.trail.at : o.price;
      const sub = o.type === "stop" ? tr("trigger") : o.type === "trail" && o.trail ? `${tr("trails")} ${o.trail.pct}% · ${tr("peak")} ${fp(o.trail.peak)}` : o.type === "twap" && o.twap ? `${tr("released")} ${o.twap.releasedPct}% · ${o.twap.parts} ${tr("parts")}` : o.type === "limit" && o.side === "buy" ? tr("or lower") : o.type === "limit" ? tr("or higher") : "";
      const note = whyNot(o, st);
      const leg = o.leg ? `<em class="aor-leg ${o.leg}" data-no-i18n>${o.leg === "tp" ? "TP" : "SL"}</em>` : "";
      const brk = brackets().some((x) => x.h === o.hash) ? `<em class="aor-leg brk" title="${T("A take-profit and stop-loss wait for this buy to fill")}" data-no-i18n>TP/SL</em>` : "";
      const pf = S.prevPct && S.prevPct.get(o.hash);
      const oc = o._ch, ex = soon(o), chTag = S.myScope === "both" ? `<em class="aor-chtag ${oc || CH}" data-no-i18n>${(oc || CH) === "rh" ? "RH" : "ARC"}</em>` : "";
      // v4: an open order whose price is within 1% of the pool's breathes
      const near = isOpen(o) && !oc && S.spot && px > 0 && lc(tk.address) === S.t && (o.type === "limit" || o.type === "stop" || o.type === "trail") && Math.abs(px - S.spot) / S.spot < 0.01;
      const canEdit = isOpen(o) && st !== "expired" && !oc && o.type === "limit" && !o.group && LIVE() && !ex;
      const menu = isOpen(o) && st !== "expired" && !oc ? [lineOf(o) ? `<button type="button" class="aor-btn sm ghost" role="menuitem" data-act="copyord" title="${T("A link that opens this order's setup filled in — for a friend, or for later")}">${T("Copy as a link")}</button>` : "", LIVE() && o.order ? `<button type="button" class="aor-btn sm ghost" role="menuitem" data-act="cancelchain" title="${T("Cancel on-chain: final even if this site were offline (costs a little gas)")}">${T("Cancel on-chain")}</button>` : ""].join("") : "";
      // v5: how close the price is to this order (a bar that fills as it nears), a ring for the last day before it expires
      const here0 = !oc && S.spot && px > 0 && lc(tk.address) === S.t && isOpen(o) && !(o.cond && !o.cond.met);
      const dd = here0 ? (px - S.spot) / S.spot : null, close = dd == null ? 0 : Math.max(0, 1 - Math.min(Math.abs(dd), 0.2) / 0.2);
      const dbar = here0 ? `<span class="aor-dbar ${o.side === "buy" ? "up" : "dn"}${close > 0.95 ? " hot" : ""}" title="${esc(pc(dd * 100, 1))} ${T("to go")}"><i style="--c:${(close * 100).toFixed(0)}%"></i></span>` : "";
      const condTag = o.cond ? `<em class="aor-leg cond${o.cond.met ? " met" : ""}" title="${esc(`${tr("Only if")} $${o.cond.sym} ${tr(o.cond.dir === "above" ? "rises to" : "falls to")} ${fp(o.cond.price)}`)}" data-no-i18n>${o.cond.met ? "IF ✓" : "IF"}</em>` : "";
      return `<div class="aor-mr${S.pulse && S.pulse.has(o.hash) ? " pulse" : ""}${S.pulse && S.pulse.has(o.hash) && o.status === "filled" ? " done" : ""}${oc ? " other " + oc : ""}${ex ? " soon" : ""}${near ? " near" : ""}${S.rowMenu === o.hash ? " menu-open" : ""}" data-h="${esc(o.hash)}" data-tk="${esc(tk.address)}">
        <span class="aor-mr-m">${oc ? `<button type="button" class="aor-link" data-act="openother" data-ch="${oc}" data-tk="${esc(tk.address)}" data-no-i18n>$${esc(tk.symbol)}/${esc(q.symbol)}</button>` : `<button type="button" class="aor-link" data-t="${esc(tk.address)}" data-no-i18n>$${esc(tk.symbol)}/${esc(q.symbol)}</button>`}<small>${chTag}${ago(o.at)}</small></span>
        <span class="aor-mr-t ${o.side === "buy" ? "up" : "dn"}">${T(o.side === "buy" ? "Buy" : "Sell")} · ${T(TYPE_NAME[o.type] || o.type)}${leg}${brk}${condTag}</span>
        <span data-no-i18n>${fp(px)}${sub ? `<small>${esc(sub)}</small>` : ""}${dbar}</span>
        <span data-no-i18n>${num(amt)}${amtSym ? ` ${esc(amtSym)}` : ""}</span>
        <span class="aor-mr-f">${o.type === "twap" && o.twap ? twapBar(o) : `${ring(o.filledPct, pf)}<small data-no-i18n>${(o.filledPct || 0).toFixed(o.filledPct > 0 && o.filledPct < 1 ? 2 : 0)}%</small>`}</span>
        <span class="aor-st ${st}">${T(STATUS[st] || st)}${ex ? `<em class="aor-soon">${expRing(ex)}${T("expires in")} <span data-no-i18n>${inT(o.expiry)}</span></em>` : ""}${note ? `<small>${esc(note)}</small>` : ""}</span>
        <span class="aor-mr-a">${oc ? `<button type="button" class="aor-btn sm ghost" data-act="openother" data-ch="${oc}" data-tk="${esc(tk.address)}">${T(oc === "rh" ? "Open on Robinhood" : "Open on Arc")}</button>` : isOpen(o) && st !== "expired" ? `${ex && o.type === "limit" && !o.group && LIVE() ? `<button type="button" class="aor-btn sm go" data-act="extend" title="${T("Sign it again for 7 more days — the old one is cancelled")}">${T("Extend 7d")}</button>` : ""}${canEdit ? `<button type="button" class="aor-btn sm ghost aor-ed1" data-act="edit" title="${T("Change its price or amount")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg><span>${T("Edit")}</span></button>` : ""}<button type="button" class="aor-btn sm aor-cx1" data-act="cancel">${T("Cancel")}</button>${menu ? `<span class="aor-rmw"><button type="button" class="aor-btn sm ghost aor-rm" data-act="rowmenu" aria-haspopup="menu" aria-expanded="${S.rowMenu === o.hash}" aria-label="${T("More actions")}" title="${T("More actions")}"><span aria-hidden="true">⋯</span></button><span class="aor-rmenu" role="menu"${S.rowMenu === o.hash ? "" : " hidden"}>${menu}</span></span>` : ""}` : o.filledPct > 0 ? `${o.lastTx ? `<button type="button" class="aor-btn sm ghost aor-ic" data-act="sharelink" aria-label="${T("Share this fill")}" title="${T("Share this fill")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg></button>` : ""}<button type="button" class="aor-btn sm ghost aor-ic" data-act="share" aria-label="${T("Save image")}" title="${T("Save image")}">${ICON.share}</button>` : ""}</span>
      </div>`;
    }).join("")}</div>${hidden ? `<button type="button" class="aor-link aor-showcx" data-act="showcx">${T("Show")} <span data-no-i18n>${hidden}</span> ${T("cancelled")}</button>` : S.myTab === "history" && S.showCx && S.histF === "all" ? `<button type="button" class="aor-link aor-showcx" data-act="showcx">${T("Hide cancelled")}</button>` : ""}`;
    S.prevPct = new Map(all.map((o) => [o.hash, o.filledPct || 0]));
    mineFoot();
  }
  /// why an order isn't filling (or didn't)
  function whyNot(o, st) {
    if (o.note === "oco") return tr("its pair filled");
    if (o.cond && !o.cond.met && st === "open") return `${tr("waits until")} $${o.cond.sym} ${tr(o.cond.dir === "above" ? "rises to" : "falls to")} ${fp(o.cond.price)}`;
    if (o.pending && st === "open") return tr("waits for its pool — it opens when the token graduates from Pons");
    if (st === "unfunded") return tr("top up the balance or the approval — it fills from where it left off");
    if (o.retry && st === "open") return `${tr("retrying in")} ${inT(o.retry.next)}${o.retry.why ? " · " + String(o.retry.why).slice(0, 60) : ""}`;
    if (st === "expired" && !(o.filledPct > 0)) return tr(o.type === "stop" ? "the price never reached the trigger" : o.type === "limit" ? "the price never reached it" : "it ran out of time");
    if (st === "open" && o.type === "limit" && S.spot && lc(o.token.address || o.token) === S.t) {
      const d = ((o.price - S.spot) / S.spot) * 100;
      return `${pc(d, Math.abs(d) < 10 ? 1 : 0)} ${tr("to go")}`;
    }
    if (st === "open" && o.type === "twap" && o.twap && o.twap.releasedPct < 100) {
      const per = o.twap.duration / Math.max(1, o.twap.parts), k = Math.floor((now() - o.twap.start) / per) + 1;
      const next = o.twap.start + per * k;
      if (next > now()) return `${tr("next part in")} ${inT(next)}`;
    }
    return "";
  }
  /// a timed order's parts: filled, released and waiting
  function twapBar(o) {
    const n = Math.min(48, o.twap.parts || 1), rel = o.twap.releasedPct || 0, fil = o.filledPct || 0;
    return `<span class="aor-tw" title="${esc(`${tr("released")} ${rel}% · ${tr("filled")} ${fil}%`)}">${Array.from({ length: n }, (_, i) => { const at = ((i + 1) / n) * 100; return `<i class="${fil >= at - 1e-9 ? "f" : rel >= at - 1e-9 ? "r" : ""}"></i>`; }).join("")}</span><small data-no-i18n>${fil.toFixed(0)}%</small>`;
  }
  /// "Cancel all" asks once more before it goes
  function armBtn(b, act) {
    const on = S.cxArm === act;
    b.classList.toggle("armed", on);
    if (!b.dataset.l) b.dataset.l = b.innerHTML;
    b.innerHTML = on ? T("Press again to confirm") : b.dataset.l;
  }
  /// under my orders: what the filled ones in this market add up to, and what my fills sent to the $ARCIRCLE burn
  function mineFoot() {
    const el = $("aor-mfoot"); if (!el || !S.mine) return;
    const os = (S.mine.orders || []).filter((o) => (o.filledPct || 0) > 0);
    if (!os.length) return;
    let html = "";
    // v3: every market's fills side by side (All / Both chains), each against that market's latest price
    if (S.myScope !== "market") {
      const by = new Map();
      for (const o of os) {
        const t = lc(o.token.address || o.token), tk = o.token, f = (o.filledPct || 0) / 100;
        const g = by.get(t) || { t, sym: tk.symbol, bT: 0, bQ: 0, sT: 0, sQ: 0 };
        if (o.side === "buy") { const x = (human(o.buyAmount, tk.decimals) / (1 - FEE)) * f; g.bT += x; g.bQ += x * o.price; } else { const x = human(o.sellAmount, tk.decimals) * f; g.sT += x; g.sQ += x * o.price; }
        by.set(t, g);
      }
      const pxOf = (t) => { if (t === S.t && S.spot) return S.spot; const m = S.markets.find((x) => lc(x.token.address || x.token) === t); return m ? m.spot || m.last || null : null; };
      const rows = [...by.values()].sort((a, b) => b.bQ + b.sQ - (a.bQ + a.sQ)).slice(0, 8);
      if (rows.length) html += `<div class="aor-pnlall"><b>${T("Your fills by market")}</b><div class="aor-pnlt"><span>${T("Market")}</span><span>${T("Avg buy")}</span><span>${T("Avg sell")}</span><span>${T("Now vs avg buy")}</span></div>${rows.map((g) => {
        const ab = g.bT ? g.bQ / g.bT : null, as = g.sT ? g.sQ / g.sT : null, px = pxOf(g.t), vs = ab && px ? ((px - ab) / ab) * 100 : null;
        return `<div class="aor-pnlt"><button type="button" class="aor-link" data-t="${esc(g.t)}" data-no-i18n>$${esc(g.sym)}</button><span data-no-i18n>${ab ? fp(ab) : "—"}</span><span data-no-i18n>${as ? fp(as) : "—"}</span><span class="${vs == null ? "" : vs >= 0 ? "up" : "dn"}" data-no-i18n>${vs == null ? "—" : pc(vs)}</span></div>`;
      }).join("")}<small>${T("From your filled orders on this chain only — not swaps made elsewhere. Not advice.")}</small></div>`;
    }
    if (S.tok && S.spot && S.myScope === "market") {
      let bT = 0, bQ = 0, sT = 0, sQ = 0;
      for (const o of os.filter((x) => lc(x.token.address || x.token) === S.t)) {
        const tk = o.token, f = (o.filledPct || 0) / 100;
        if (o.side === "buy") { const t = (human(o.buyAmount, tk.decimals) / (1 - FEE)) * f; bT += t; bQ += t * o.price; }
        else { const t = human(o.sellAmount, tk.decimals) * f; sT += t; sQ += t * o.price; }
      }
      if (bT || sT) {
        const ab = bT ? bQ / bT : null, as = sT ? sQ / sT : null, vs = ab ? ((S.spot - ab) / ab) * 100 : null;
        html += `<div class="aor-pnl"><b>${T("Your fills here")}</b>
          ${ab ? `<span>${T("Bought")} <i data-no-i18n>${num(bT)} $${esc(S.tok.symbol)}</i> ${T("at avg")} <i data-no-i18n>${fp(ab)}</i></span>` : ""}
          ${as ? `<span>${T("Sold")} <i data-no-i18n>${num(sT)} $${esc(S.tok.symbol)}</i> ${T("at avg")} <i data-no-i18n>${fp(as)}</i></span>` : ""}
          ${vs != null ? `<span>${T("Pool vs your avg buy")} <i class="${vs >= 0 ? "up" : "dn"}" data-no-i18n>${pc(vs)}</i></span>` : ""}
          ${ab && as ? `<span>${T("Avg sell vs avg buy")} <i class="${as >= ab ? "up" : "dn"}" data-no-i18n>${pc(((as - ab) / ab) * 100)}</i></span>` : ""}
          <small>${T("From your filled orders in this market only — not swaps made elsewhere. Not advice.")}</small></div>`;
      }
    }
    // the fee side: 0.1% of what each fill received, half of it buys and burns $ARCIRCLE (an estimate: a holder pays none)
    const vol = os.reduce((s, o) => { const tk = o.token, f = (o.filledPct || 0) / 100; const t = o.side === "buy" ? (human(o.buyAmount, tk.decimals) / (1 - FEE)) * f : human(o.sellAmount, tk.decimals) * f; return s + t * (o.price || 0); }, 0);
    if (vol > 0) {
      const qs = RH() ? " ETH" : "", amt = (v) => (RH() ? num(v) + qs : v > 0 && v < 0.01 ? "<$0.01" : usd(v));
      html += `<div class="aor-burnc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.4 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.2-4.6.2 1.8 1 2.6 1.8 3C11 9 11.5 6 12 3z"/></svg><span>${T("Filled through ARCIRCLE Orders")} <i data-no-i18n>${amt(vol)}</i> · ${S.feeFree ? `${T("as a holder you pay no fee — about")} <i data-no-i18n>${amt(vol * FEE)}</i> ${T("saved at today's rate")}` : `${T("about")} <i data-no-i18n>${amt(vol * FEE / 2)}</i> ${T("of fees went to buy and burn $ARCIRCLE")}`}</span></div>`;
    }
    el.innerHTML = html;
  }
  async function unlock() {
    try {
      const s = await signer(), w = me(), until = now() + 30 * 86400;
      const sig = await s.signMessage(`ARCIRCLE Orders: show my orders\n${w}\nuntil ${until}`);
      store.set(viewKey(w), { until, sig });
      await loadMine(); mineView(); bookView(); draw();
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; form(); }
  }
  async function cancel(h, onchain) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    try {
      const s = await signer();
      if (onchain) {
        const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).cancel(o.order);
        S.msg = { k: "", t: RH() ? "Cancelling on Robinhood Chain…" : "Cancelling on Arc…" }; form();
        await tx.wait();
        S.msg = { k: "ok", html: `${T("Cancelled on-chain.")} ${txa(tx.hash, tr("View transaction"))}` };
      } else {
        const sig = await s.signMessage(`Cancel ARCIRCLE order ${h}`);
        await post({ action: "ordercancel", token: o.token.address, hash: h, sig });
        S.msg = { k: "ok", t: "Order cancelled." };
      }
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook()]);
    bookView(); form(); mineView(); market(); draw();
  }
  async function cancelMarketAll() {
    try {
      const s = await signer(), w = me(), at = now();
      const sig = await s.signMessage(`Cancel all my ARCIRCLE orders in ${S.t}${RH() ? " on Robinhood Chain" : ""}\n${w}\n${at}`);
      const j = await post({ action: "ordercancelall", token: S.t, maker: w, at, sig });
      S.msg = { k: "ok", html: `${T("Cancelled your orders in this market:")} <b data-no-i18n>${j.cancelled}</b>` };
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook()]);
    bookView(); form(); mineView(); market(); draw();
  }
  async function cancelAll() {
    try {
      const s = await signer();
      const tx = await new ethers.Contract(ORDERS(), ORDERS_ABI, s).cancelAll();
      S.msg = { k: "", t: "Cancelling every order you've signed…" }; form();
      await tx.wait();
      S.msg = { k: "ok", html: `${T("Every order you signed before now is cancelled.")} ${txa(tx.hash, tr("View transaction"))}` };
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    await Promise.all([loadMine(), loadBook(), loadBal()]);
    bookView(); form(); mineView(); market(); draw();
  }
  function edit(h, opt = {}) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    if (lc(o.token.address) !== S.t) return open(o.token.address).then(() => edit(h, opt));
    S.type = "limit"; S.side = o.side;
    const tok = human(o.side === "sell" ? BigInt(o.sellAmount) - BigInt(o.filled || 0) : BigInt(o.remainingToken || 0), S.tok.decimals);
    F.price = dstr(opt.price > 0 ? opt.price : o.price); F.amount = dstr(tok, Math.min(8, S.tok.decimals)); syncTotal("amount");
    S.editing = { hash: o.hash, token: o.token.address, rem: BigInt(o.order ? BigInt(o.order.sellAmount) - BigInt(o.filled || 0) : 0n) };
    S.msg = null; F.brk = false; form(); flashField();
    if (innerWidth <= 720) sheet(true); else if (!opt.quiet) $("aor-formc").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    return Promise.resolve();
  }
  /// v3: an order about to expire, renewed for 7 days at the same price (a new signature; the old one is cancelled)
  function extend(h) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o || S.busy) return;
    Promise.resolve(edit(h, { quiet: true })).then(() => { if (!S.editing || S.editing.hash !== h) return; F.expiry = "604800"; form(); submit(); });
  }
  /// v3: your orders on the other chain, with the same view signature ("Both chains")
  async function loadOther() {
    const a = me(), v = a && viewOf(a), oc = RH() ? "arc" : "rh";
    if (!v) { S.other = null; return; }
    try {
      const r = await fetch(`${API}?orders=mine&wallet=${a}&until=${v.until}&sig=${v.sig}${oc === "rh" ? "&chain=rh" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      S.other = { ch: oc, orders: ((j && j.orders) || []).map((o) => ({ ...o, _ch: oc })), at: Date.now() };
    } catch { S.other = { ch: oc, orders: [], at: Date.now() }; }
  }
  /// v3: the orders listed (this scope and tab) as a CSV file
  function csv() {
    const rows = S.lastList || [];
    if (!rows.length) { toast(tr("Nothing to export here."), ""); return; }
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["chain", "market", "side", "type", "price", "amount", "filled_pct", "status", "placed", "expires", "hash"];
    const out = rows.map((o) => {
      const tk = o.token || {}, qt = o.quote || {};
      const amt = o.side === "sell" ? human(o.sellAmount, tk.decimals) : o.type === "twap" ? human(o.sellAmount, qt.decimals) : human(o.buyAmount, tk.decimals) / (1 - FEE);
      return [o._ch || CH, `${tk.symbol}/${qt.symbol}`, o.side, o.type, o.price, amt, o.filledPct || 0, o.status, o.at ? new Date(o.at * 1000).toISOString() : "", o.expiry ? new Date(o.expiry * 1000).toISOString() : "", o.hash].map(q).join(",");
    });
    const blob = new Blob([[head.join(","), ...out].join("\n") + "\n"], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `arcircle-orders-${S.myTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  /// a share card for a filled order
  function shareImg(h) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    if (!o) return;
    const tk = o.token, q = o.quote, cv = document.createElement("canvas"); cv.width = 1200; cv.height = 630;
    const g = cv.getContext("2d");
    const up = o.side === "buy", C = up ? "#39ff88" : "#ff6e5a";
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, "#061018"); bg.addColorStop(1, up ? "#082119" : "#22100c"); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    // a faint book on the right: asks above, bids below, this fill's row lit
    for (let i = 0; i < 7; i++) { const yy = 80 + i * 42, w = 120 + ((i * 97) % 200); g.fillStyle = i < 3 ? "rgba(255,110,90,.10)" : i > 3 ? "rgba(57,255,136,.10)" : up ? "rgba(57,255,136,.35)" : "rgba(255,110,90,.35)"; g.fillRect(1130 - w, yy, w, 30); }
    g.strokeStyle = "rgba(77,212,255,.3)"; g.lineWidth = 2; g.strokeRect(30, 30, 1140, 570);
    g.fillStyle = "#4dd4ff"; g.font = "700 30px Sora, sans-serif"; g.fillText("ARCIRCLE Orders", 80, 105);
    g.fillStyle = "#9fb0bd"; g.font = "600 22px Inter, sans-serif"; g.fillText(`${CHAIN_NAME()} · ${TYPE_NAME[o.type] || "Limit"} order`, 80, 140);
    g.fillStyle = C; g.font = "800 84px Sora, sans-serif"; g.fillText(`${up ? "Bought" : "Sold"} $${tk.symbol}`, 80, 255);
    const amt = o.side === "sell" ? human(o.filled, tk.decimals) : human(BigInt(o.buyAmount) * BigInt(Math.round(o.filledPct * 100)) / 10000n, tk.decimals) / (1 - FEE);
    g.fillStyle = "#eef3f7"; g.font = "600 44px Inter, sans-serif"; g.fillText(`${num(amt)} $${tk.symbol}`, 80, 330);
    g.fillStyle = "#c9d4de"; g.font = "600 34px 'JetBrains Mono', monospace"; g.fillText(`@ ${fp(o.price)} ${q.symbol}`, 80, 385);
    // the fill ring
    const cx = 1040, cy = 470, r = 54;
    g.lineWidth = 12; g.strokeStyle = "rgba(255,255,255,.1)"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = C; g.lineCap = "round"; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, o.filledPct || 0)) / 100); g.stroke();
    g.fillStyle = "#fff"; g.font = "800 26px Sora, sans-serif"; g.textAlign = "center"; g.fillText(`${Math.round(o.filledPct || 0)}%`, cx, cy + 9); g.textAlign = "left";
    g.fillStyle = "#9fb0bd"; g.font = "500 26px Inter, sans-serif"; g.fillText(`${o.filledPct >= 100 ? "Filled" : "Part filled"} · ${new Date((o.last || o.at) * 1000).toLocaleDateString()} · signed in the wallet, no custody`, 80, 455);
    g.fillStyle = "#6f7e8a"; g.font = "500 22px Inter, sans-serif"; g.fillText("arcircle.app/arc#orders · 0.1% fee, half buys and burns $ARCIRCLE · not financial advice", 80, 560);
    cv.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `arcircle-orders-${(tk.symbol || "fill").toLowerCase()}.png`, { type: "image/png" });
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch { /* fall back to a download */ }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, "image/png");
  }

  /// v5: a filled order's link — its card on X / Telegram (/orders/fill/<tx>), then this market
  /// v6: this market's plain limit orders (no TP/SL pair, no condition, not part-filled into a bracket), mine
  const shiftable = () => ((S.mine && S.mine.orders) || []).filter((o) => o.status === "open" && o.type === "limit" && !o.group && !o.cond && !o.pending && lc((o.token && o.token.address) || o.token || "") === S.t && o.price > 0);
  /// move every one of them by k%: each is edited (a new signature at the new price, the old one cancelled) in turn;
  /// a rejected signature stops the run
  async function shiftAll(k) {
    if (S.busy || S.shift) return;
    const list = shiftable();
    if (!list.length) return;
    // a move that would put a buy above the pool price, or a sell under it, would fill at once: not as a bulk move
    if (S.spot > 0 && list.some((o) => { const np = o.price * (1 + k / 100); return o.side === "buy" ? np >= S.spot : np <= S.spot; })) {
      toast(L3("That would cross the pool price", "풀 가격을 넘어가요", "这会越过池价"), "alert", L3("A buy would end up over it, or a sell under it — move those one at a time.", "매수가 풀 가격보다 높아지거나 매도가 낮아져요 — 그 주문은 하나씩 옮기세요.", "会有买单高于池价或卖单低于池价 — 请逐个移动。"));
      return;
    }
    S.shift = { n: list.length, at: 0, stop: false }; mineView();
    let moved = 0;
    for (const [i, o] of list.entries()) {
      if (!S.shift || S.shift.stop) break;
      S.shift.at = i; mineView();
      await edit(o.hash, { price: Number((o.price * (1 + k / 100)).toPrecision(6)), quiet: true });
      await submit();
      if (S.editing) { S.editing = null; S.fatArm = null; form(); break; } // not signed, held for a check, or failed: stop here
      moved++;
    }
    S.shift = null;
    await loadMine(); mineView();
    toast(L3(`Moved ${moved} of ${list.length} orders ${k > 0 ? "+" : "−"}${Math.abs(k)}%`, `주문 ${list.length}개 중 ${moved}개를 ${k > 0 ? "+" : "−"}${Math.abs(k)}% 이동`, `已将 ${list.length} 个中的 ${moved} 个订单移动 ${k > 0 ? "+" : "−"}${Math.abs(k)}%`), moved ? "fill" : "");
  }
  /// v6: an order as one line of words (arc-order-line.js reads it back): the same setup, filled in, for anyone
  function lineOf(o) {
    const tk = o.token || {}, td = Number(tk.decimals ?? 18), q = o.quote || S.quote || {}, qd = Number(q.decimals ?? 18);
    const amt = Number(o.side === "sell" ? o.sellAmount : o.buyAmount) / 10 ** td, P = (v) => (v > 0 ? dstr(Number(Number(v).toPrecision(6))) : null);
    if (!(amt > 0)) return null;
    const A = dstr(Number(amt.toPrecision(6)));
    if (o.type === "limit" && P(o.price)) return `${o.side} ${A} at ${P(o.price)}`;
    if (o.type === "stop" && o.trigger && P(o.trigger.price)) return `stop ${o.side} ${A} at ${P(o.trigger.price)}`;
    if (o.type === "trail" && o.trail) return `sell ${A} trail ${o.trail.pct}%`;
    if (o.type === "twap" && o.twap && o.twap.duration) { const q0 = Number(o.sellAmount) / 10 ** qd, h = Math.max(1, Math.round(o.twap.duration / 3600)); return o.side === "buy" ? `buy ${dstr(Number(q0.toPrecision(6)))} ${String(q.symbol || "").toLowerCase() === "usdc" ? "usdc" : "eth"} dca over ${h}h in ${o.twap.parts || 12} parts${P(o.price) ? ` at ${P(o.price)}` : ""}` : `sell ${A} dca over ${h}h in ${o.twap.parts || 12} parts${P(o.price) ? ` at ${P(o.price)}` : ""}`; }
    return P(o.price) ? `${o.side} ${A} at ${P(o.price)}` : null;
  }
  async function copyOrder(h) {
    const o = ((S.mine && S.mine.orders) || []).find((x) => x.hash === h);
    const line = o && lineOf(o); if (!line) return;
    const tk = lc((o.token && o.token.address) || o.token || "");
    const url = `${location.origin}/arc#orders?t=${tk}${(o._ch || CH) === "rh" ? "&c=rh" : ""}&o=${encodeURIComponent(line)}`;
    try { await navigator.clipboard.writeText(url); toast(tr("Link copied"), "fill", line); } catch { toast(tr("Copy this link"), "", url); }
  }
  async function shareLink(h) {
    const o = ((S.mine && S.mine.orders) || []).concat((S.other && S.other.orders) || []).find((x) => x.hash === h);
    if (!o || !o.lastTx) return;
    const rh = (o._ch || CH) === "rh", tk = o.token || {};
    const url = `${location.origin}/orders/fill/${o.lastTx}?t=${lc(tk.address)}${rh ? "&c=rh" : ""}`;
    const text = `${o.side === "buy" ? "Bought" : "Sold"} $${tk.symbol} with a ${(TYPE_NAME[o.type] || "limit").toLowerCase()} order on ARCIRCLE Orders${rh ? " (Robinhood Chain)" : ""} — signed in my wallet, no custody.`;
    try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
  }
  /// Robinhood Chain: filled sells pay WETH — back to ETH, keeping what open buy orders still need
  async function unwrap() {
    if (S.busy) return;
    try {
      const s = await signer();
      const w = await new ethers.Contract(WETH(), ERC20, rp()).balanceOf(me());
      const amt = w - openNeed(WETH());
      if (!(amt > 0n)) return;
      S.busy = "Unwrap in your wallet…"; form();
      const tx = await new ethers.Contract(WETH(), WETH_ABI, s).withdraw(amt);
      S.busy = "Unwrapping…"; form();
      await tx.wait();
      S.msg = { k: "ok", html: `${T("Unwrapped to ETH.")} ${txa(tx.hash, tr("View transaction"))}` };
    } catch (e) { S.msg = { k: "bad", t: errText(e) }; }
    S.busy = false;
    await loadBal(); form();
  }

  // ---------------- the chain switch ----------------
  function setChain(c, { reopen = null } = {}) {
    c = c === "rh" ? "rh" : c === "sol" && SOL_ON() ? "sol" : "arc";
    if (c === CH || S.busy) return;
    const pill = panel.querySelector(".aor-chain");
    if (pill) { pill.dataset.chain = c; pill.querySelectorAll("[data-setchain]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.setchain === c))); }
    CH = c;
    try { localStorage.setItem(CK, c); } catch { /* private window */ }
    Object.assign(S, { t: null, tok: null, quote: null, pools: [], pi: 0, spot: null, prevSpot: null, book: null, mine: null, markets: [], status: null, candles: null, tax: null, agentCall: null,
      editing: null, msg: null, steps: null, other: null, scan: null, desk: null, feeFree: false, freeMin: null, bal: {}, weth: null, eth: null, quoteOut: null, quoteFor: null, showMarkets: false, alertsOpen: false });
    S.prevLevels = new Map(); S.prevFill = new Map();
    F.price = ""; F.amount = ""; F.total = ""; F.trigger = ""; F.tp = ""; F.sl = ""; F.floor = ""; F.cap = ""; S.pct = 0;
    if (history.replaceState && panel.classList.contains("active")) history.replaceState(null, "", `${location.pathname}${location.search}#orders${c === "rh" ? "?c=rh" : c === "sol" ? "?c=sol" : ""}`);
    setTimeout(() => {
      frame();
      if (SOLC()) return;
      loadMarkets(); loadStatus().then(market);
      open(reopen || DEFAULT_MKT());
      loadMine().then(mineView);
    }, reduce ? 0 : 230);
  }

  // ---------------- notifications ----------------
  /// between two reads of my orders: what filled, triggered or got cancelled with its pair
  function diffMine(prev, next) {
    if (!prev || !next) return;
    const before = new Map((prev.orders || []).map((o) => [o.hash, o]));
    S.pulse = new Set();
    for (const o of next.orders || []) {
      const b = before.get(o.hash); if (!b) continue;
      const sym = "$" + ((o.token && o.token.symbol) || "?");
      let msg = null;
      if ((o.filledPct || 0) > (b.filledPct || 0)) msg = `${tr(o.status === "filled" ? "Filled" : "Part filled")}: ${tr(o.side === "buy" ? "Buy" : "Sell")} ${sym} · ${o.filledPct}%`;
      else if (o.status === "cancelled" && b.status !== "cancelled" && o.note === "oco") msg = `${sym}: ${tr("the other leg was cancelled — its pair filled")}`;
      else if (o.trail && o.trail.armed && !(b.trail && b.trail.armed)) msg = `${sym}: ${tr("trailing stop triggered — selling")}`;
      // v5: a sell's fill against my average buy in that market, rolled up in the toast
      const pnl = (o.filledPct || 0) > (b.filledPct || 0) && o.side === "sell" ? avgBuyOf(next, lc(o.token.address || o.token)) : null;
      const pnlPct = pnl && o.price > 0 ? (o.price / pnl - 1) * 100 : null;
      if (msg && document.hidden && (o.filledPct || 0) > (b.filledPct || 0)) flashTitle(msg);
      if (msg) { S.pulse.add(o.hash); toast(msg, pnlPct != null && pnlPct < 0 ? "fill loss" : "fill", (o.filledPct || 0) > (b.filledPct || 0) ? fillLine(o, b) : "", pnlPct != null ? { roll: pnlPct, label: L3("vs your average buy", "내 평균 매수가 대비", "相对你的平均买入价") } : null); notify("ARCIRCLE Orders", msg + (pnlPct != null ? ` · ${pc(pnlPct, 1)}` : "")); }
      if ((o.filledPct || 0) > (b.filledPct || 0) && !reduce) S.burst = true;
      // v4: the fill moment — a sound / haptic where the site has them (arcFeedback), the row lights up below
      if ((o.filledPct || 0) > (b.filledPct || 0) && typeof window.arcFeedback === "function") { try { window.arcFeedback(o.status === "filled" ? "milestone" : o.side === "buy" ? "buy" : "sell"); } catch { /* fine */ } }
    }
    bracketCheck(next);
    if (S.burst) { S.burst = false; setTimeout(() => { const t = document.querySelector("#aor-toasts .aor-toast.fill:last-child"); const r = t ? t.getBoundingClientRect() : null; confetti(r ? r.left + 24 : innerWidth - 60, r ? r.top + 10 : innerHeight - 120); celebrate(); }, 60); }
  }
  /// v6: a fill while the tab is in the background — the tab's title says so until you come back
  function flashTitle(msg) {
    if (!S.title0) S.title0 = document.title;
    clearInterval(S.titleT); let on = true;
    S.titleT = setInterval(() => { document.title = on ? `✓ ${msg}` : S.title0; on = !on; }, 1200);
    const back = () => { if (document.hidden) return; clearInterval(S.titleT); document.title = S.title0; document.removeEventListener("visibilitychange", back); };
    document.addEventListener("visibilitychange", back);
  }
  /// v5: my average buy in a market from my filled Orders buys (null without any)
  function avgBuyOf(d, t) {
    let bT = 0, bQ = 0;
    for (const o of ((d && d.orders) || [])) { if (lc(o.token.address || o.token) !== t || o.side !== "buy" || !(o.filledPct > 0) || !(o.price > 0)) continue; const x = (human(o.buyAmount, o.token.decimals) / (1 - FEE)) * (o.filledPct / 100); bT += x; bQ += x * o.price; }
    return bT ? bQ / bT : null;
  }
  /// a fill's small print: what came in (at least), and the fee (or none, for a holder)
  function fillLine(o, b) {
    const tk = o.token || {}, q = o.quote || {}, d = ((o.filledPct || 0) - (b.filledPct || 0)) / 100;
    const got = o.side === "buy" ? human(o.buyAmount, tk.decimals) * d : human(o.buyAmount, q.decimals) * d;
    return `${tr("received at least")} ${num(got)} ${o.side === "buy" ? "$" + tk.symbol : q.symbol} · ${tr("at")} ${fp(o.price)}${S.feeFree ? " · " + tr("no fee") : " · " + tr("fee 0.1%, half burns $ARCIRCLE")}`;
  }
  /// a bracket's buy filled: offer its take-profit and stop-loss
  function bracketCheck(d) {
    const os = (d && d.orders) || [];
    // due once the buy is filled — or nearly (90%+), or ended part-filled: the TP / SL then covers what it bought
    const due = brackets().find((x) => x.ch === CH && os.some((o) => o.hash === x.h && (o.status === "filled" || (o.filledPct || 0) >= 90 || ((o.status === "cancelled" || o.status === "expired") && o.filledPct > 0))));
    const was = S.brkDue && S.brkDue.h;
    S.brkDue = due || null;
    if (due && was !== due.h) { toast(`$${due.sym} ${tr("filled — set its take-profit and stop-loss")}`, "fill"); form(); }
    // a bracket whose buy got cancelled or expired is dropped
    const gone = brackets().filter((x) => x.ch === CH && os.some((o) => o.hash === x.h && (o.status === "cancelled" || o.status === "expired") && !(o.filledPct > 0)));
    if (gone.length) store.set(BRK, brackets().filter((x) => !gone.includes(x)));
  }
  function toast(text, kind = "", sub = "", fx = null) {
    let box = $("aor-toasts");
    if (!box) { box = document.createElement("div"); box.id = "aor-toasts"; box.className = "aor-toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "aor-toast " + kind;
    // v5: a fill's PnL rolls up from 0
    const roll = fx && fx.roll != null && isFinite(fx.roll) ? `<b class="aor-roll ${fx.roll >= 0 ? "up" : "dn"}">${reduce ? esc(pc(fx.roll, 1)) : "0.0%"}</b> <small class="aor-roll-l">${esc(fx.label || "")}</small>` : "";
    t.innerHTML = `<i></i><span data-no-i18n>${esc(text)}${roll ? `<span class="aor-rollw">${roll}</span>` : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</span>`;
    box.appendChild(t); setTimeout(() => t.classList.add("out"), fx ? 8000 : 6000); setTimeout(() => t.remove(), fx ? 8600 : 6600);
    if (roll && !reduce) { const el = t.querySelector(".aor-roll"), to = fx.roll, t0 = performance.now(); const step = (now0) => { const k = Math.min(1, (now0 - t0) / 1100), e = 1 - Math.pow(1 - k, 3); if (el.isConnected) el.textContent = pc(to * e, 1); if (k < 1) requestAnimationFrame(step); else el.classList.add("done"); }; setTimeout(() => requestAnimationFrame(step), 250); }
  }
  function notify(title, body) {
    if (!notifyOn() || !("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
    try { new Notification(title, { body, icon: "/images/arcircle-mark-sm.png" }); } catch { /* fine */ }
  }

  // ---------------- phones: the buy / sell sheet ----------------
  function sheet(on) {
    S.sheet = !!on && innerWidth <= 720;
    panel.classList.toggle("aor-sheet-open", S.sheet);
    const sc = $("aor-scrim"); if (sc) sc.hidden = !S.sheet;
    document.documentElement.classList.toggle("aor-noscroll", S.sheet);
    dockState(); strip();
  }

  // ---------------- v2: presets, repeat last, brackets ----------------
  /// a preset (or the last order): side, type, distance from the pool, share of the balance, expiry; the last
  /// order in the same market also brings back its amount
  function applyPreset(x, last) {
    if (!x || !S.tok) return;
    S.side = x.side; S.type = x.type; S.msg = null; S.editing = null;
    if (!PRO() && !SIMPLE_TYPES.includes(x.type)) store.set(MK, "pro");
    for (const k of ["expiry", "trail", "slip", "n", "dur", "parts"]) if (x[k] != null) F[k] = String(x[k]);
    if (x.off != null && S.spot) { const v = dstr(Number((S.spot * (1 + x.off / 100)).toPrecision(4))); if (x.type === "stop") F.trigger = v; else F.price = v; }
    const same = last && x.t === S.t && (x.amount || x.total);
    if (same) { F.amount = x.amount || ""; F.total = x.total || ""; S.pct = 0; syncTotal("amount"); } else syncTotal("price");
    form();
    if (!same && x.pct) setPct(Number(x.pct));
    requote(); flashField();
    if (innerWidth <= 720) sheet(true);
  }
  /// a bracket's buy filled: a TP / SL sell of what it bought, at the prices set with it
  function bracketGo() {
    const x = S.brkDue; if (!x) return;
    const o = ((S.mine && S.mine.orders) || []).find((y) => y.hash === x.h);
    const go = () => {
      S.type = "tpsl"; S.side = "sell"; S.msg = null; S.editing = null;
      if (!PRO()) store.set(MK, "pro");
      let got = o && S.tok ? (BigInt(o.buyAmount) * BigInt(Math.round((o.filledPct || 100) * 100))) / 10000n : 0n;
      const bal = S.tok && S.bal[S.tok.address];
      if (bal != null && got > bal) got = bal;
      F.amount = got > 0n ? ethers.formatUnits(got, S.tok.decimals) : "";
      F.tp = x.tp || ""; F.sl = x.sl || ""; S.pct = 0;
      S.tpslFrom = x.h; S.brkDue = null;
      form(); flashField();
      if (innerWidth <= 720) sheet(true); else { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    };
    if (lc(x.t) !== S.t) open(x.t).then(go); else go();
  }

  // ---------------- events ----------------
  function setPct(pct) {
    S.pct = pct;
    const buy = S.side === "buy";
    const sellTok = buy ? S.quote : S.tok;
    const bal = sellTok && S.bal[sellTok.address];
    if (bal == null) { form(); return; }
    const part = (bal * BigInt(pct)) / 100n;
    if (S.type === "market" || S.type === "twap") { if (buy) F.total = ethers.formatUnits(part, S.quote.decimals); else F.amount = ethers.formatUnits(part, S.tok.decimals); }
    else if (!buy) F.amount = ethers.formatUnits(part, S.tok.decimals);
    else {
      const P = Number(S.type === "stop" ? F.trigger : S.type === "scaled" ? (Number(F.lo) + Number(F.hi)) / 2 : F.price) || S.spot;
      if (!(P > 0)) return;
      F.amount = dstr((human(part, S.quote.decimals) / P) * 0.9999, Math.min(S.tok.decimals, 8));
    }
    syncTotal(S.type === "limit" ? "amount" : null);
    form(); requote();
  }
  function syncTotal(from) {
    if (S.type !== "limit") return;
    const P = Number(F.price), A = Number(F.amount), Q = Number(F.total);
    // twelve significant figures: 1,000,000 × 0.00000008 is 0.08, not 0.0800000000000000002
    if (from === "total" && P > 0 && Q > 0) F.amount = dstr(Number((Q / P).toPrecision(12)), Math.min(S.tok ? S.tok.decimals : 18, 8));
    else if ((from === "amount" || from === "price") && P > 0 && A > 0) F.total = dstr(Number((P * A).toPrecision(12)), S.quote ? S.quote.decimals : 6);
  }
  function onInput(e) {
    if (SOLC()) return;
    const id = e.target.id;
    if (id === "aor-pool") { S.pi = Number(e.target.value) || 0; S.spot = pool().price; S.candles = null; S.tax = null; Promise.all([loadSpot(), loadCandles(), loadPoolL()]).then(() => { market(); bookView(); chartView(); form(); loadTax().then(() => { market(); form(); }); }); return; }
    if (id === "aor-prec") { S.prec = Number(e.target.value) || 0; S.prevLevels = new Map(); bookView(); if (S.center === "depth") chartView(); return; }
    if (id === "aor-exp") { F.expiry = e.target.value; return; }
    if (id === "aor-mq") { if (e.type !== "input") return; S.mq = e.target.value; marketsView(); return; }
    if (id === "aor-brk") { F.brk = e.target.checked; if (F.brk && !F.btp && !F.bsl) { const base = Number(F.price) || S.spot; if (base) { F.btp = dstr(Number((base * 1.25).toPrecision(4))); F.bsl = dstr(Number((base * 0.9).toPrecision(4))); } } form(); return; }
    if (id === "aor-dur" || id === "aor-parts") { F[id === "aor-dur" ? "dur" : "parts"] = e.target.value; const s = $("aor-sum"); if (s) s.innerHTML = summary(); return; }
    if (id === "aor-slip") { F.slip = e.target.value; const s = $("aor-sum"); if (s) s.innerHTML = summary(); return; }
    if (id === "aor-condon") { F.condOn = e.target.checked; form(); return; }
    if (id === "aor-condt" || id === "aor-conddir") { F[id === "aor-condt" ? "condT" : "condDir"] = e.target.value; form(); return; }
    if (id === "aor-condp") { if (e.type !== "input") return; F.condP = e.target.value; const s2 = $("aor-sum"); if (s2) s2.innerHTML = summary(); stagePaint(); return; }
    if (id === "aor-approvemore") { F.approveMore = e.target.checked; store.set("arcircle.orders.approvemore", F.approveMore); return; }
    if (id === "aor-notify") {
      store.set(NK, e.target.checked);
      if (e.target.checked && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      return;
    }
    if (id === "aor-slider") {
      if (e.type !== "input") return;
      e.target.style.setProperty("--v", e.target.value + "%");
      clearTimeout(S.slT); const v = Number(e.target.value); S.slT = setTimeout(() => setPct(v), 60);
      return;
    }
    const map = { "aor-price": "price", "aor-amount": "amount", "aor-total": "total", "aor-trigger": "trigger", "aor-tp": "tp", "aor-sl": "sl", "aor-floor": "floor", "aor-cap": "cap", "aor-lo": "lo", "aor-hi": "hi", "aor-btp": "btp", "aor-bsl": "bsl" };
    if (!map[id] || e.type !== "input") return;
    if (id === "aor-total" && RH() && S.ethUsd > 0 && S.usdIn) { const u = Number(String(e.target.value).replace(/,/g, "")); F.total = u > 0 ? dstr(u / S.ethUsd, S.quote ? S.quote.decimals : 18) : ""; }
    else if ((id === "aor-price" || id === "aor-trigger") && S.mcapIn && mcOk()) { const m = Number(String(e.target.value).replace(/,/g, "")); F[map[id]] = m > 0 ? dstr(m / S.supply / qUsd()) : ""; }
    else F[map[id]] = e.target.value;
    if (id === "aor-price" || id === "aor-trigger") { const mc = $(id + "-mc"); if (mc) mc.innerHTML = pxSub(map[id]); }
    if (S.fatArm) { S.fatArm = null; const sb = $("aor-submit"); if (sb && sb.classList.contains("armed")) { sb.classList.remove("armed"); sb.textContent = tr("Check the price, then place"); } }
    if (map[id] === "price" || map[id] === "trigger") distPaint();
    if (map[id] === "amount" || map[id] === "total") S.pct = 0;
    syncTotal(map[id]);
    if (S.type === "limit") { if (map[id] !== "total" && $("aor-total")) $("aor-total").value = totalShown(); if (map[id] === "total" && $("aor-amount")) $("aor-amount").value = F.amount; }
    if ($("aor-totx")) $("aor-totx").innerHTML = totalSub();
    const s = $("aor-sum"); if (s) s.innerHTML = summary();
    stagePaint();
    requote();
  }
  function stagePaint() { const sg = panel.querySelector("#aor-formc .aor-stage"); if (sg && S.tok) { const d0 = document.createElement("div"); d0.innerHTML = stageHtml(build()); sg.replaceWith(d0.firstChild); } }
  function onClick(e) {
    if (!SOLC()) {
      const fv = e.target.closest("[data-fav]");
      if (fv && panel.contains(fv)) { e.stopPropagation(); toggleFav(fv.dataset.fav); return; }
      const mr = e.target.closest(".aor-ml-r[data-t], .aor-xp-r[data-t]");
      if (mr && panel.contains(mr)) { open(mr.dataset.t); S.showMarkets = false; marketsView(); return; }
    }
    const b = e.target.closest("button, a"); if (!b || !panel.contains(b)) return;
    const d = b.dataset;
    if (d.setchain) { setChain(d.setchain); return; }
    if (SOLC()) return; // the Solana side handles its own clicks
    if (d.strip) { if (d.strip === "buy" && sellOnly(S.type)) S.type = "limit"; S.side = d.strip; S.msg = null; form(); requote(); if (innerWidth <= 720) sheet(true); else { const fc = $("aor-formc"); if (fc) fc.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); } return; }
    if (d.mode) { store.set(MK, d.mode); if (d.mode === "simple" && !SIMPLE_TYPES.includes(S.type)) S.type = "limit"; panel.classList.toggle("aor-simple", d.mode !== "pro"); form(); requote(); return; }
    if (d.lvl) { const v = dstr(Number(d.v)); F[d.lvl] = v; if (d.lvl === "price") syncTotal("price"); form(); requote(); flashField(); return; }
    if (d.range) { const [a, c] = d.range.split(",").map(Number); if (S.spot) { F.lo = dstr(Number((S.spot * (1 + a / 100)).toPrecision(4))); F.hi = dstr(Number((S.spot * (1 + c / 100)).toPrecision(4))); } form(); return; }
    if (d.n) { F.n = d.n; form(); return; }
    if (d.dist) { F.dist = d.dist; form(); return; }
    if (d.msort) { S.msort = d.msort; marketsView(); return; }
    if (d.mtab) { S.mtab = d.mtab; if (d.mtab === "ex") loadExplore(); if (d.mtab === "st") loadStats(); marketsView(); return; }
    if (d.askq) { S.askOpen = false; market(); if (window.arcArcia && window.arcArcia.ask) window.arcArcia.ask(d.askq); else location.hash = "#arcia"; return; }
    if (d.exp) { F.expiry = d.exp; form(); return; }
    if (d.slip) { F.slip = d.slip; form(); requote(); return; }
    if (d.hf) { S.histF = d.hf; mineView(); return; }
    if (d.preset != null) { applyPreset(presets()[Number(d.preset)], false); return; }
    if (d.presetdel != null) { store.set(PRK, presets().filter((_, i) => i !== Number(d.presetdel))); form(); return; }
    if (d.t && b.tagName === "BUTTON") { open(d.t); if (S.showMarkets) { S.showMarkets = false; marketsView(); } return; }
    if (d.setside) { S.side = d.setside; S.msg = null; form(); requote(); return; }
    if (d.sheet) { S.side = d.sheet; if (sellOnly(S.type) && d.sheet === "buy") S.type = "limit"; form(); sheet(true); return; }
    if (d.type) { S.type = d.type; S.msg = null; S.typesOpen = false; if (sellOnly(S.type)) S.side = "sell"; form(); requote(); return; }
    if (d.pct) { setPct(Number(d.pct)); return; }
    if (d.quick) {
      const k = Number(d.k), base = d.quick === "btp" || d.quick === "bsl" ? Number(F.price) || S.spot : S.spot;
      if (!base) return;
      const v = dstr(Number((base * (1 + k / 100)).toPrecision(4))); // four significant figures, like the book
      F[d.quick] = v; if (d.quick === "price") syncTotal("price");
      form(); requote(); return;
    }
    if (d.trailpct) { F.trail = d.trailpct; F.floor = ""; form(); return; }
    if (d.price) {
      F.price = dstr(Number(d.price)); if (S.type !== "limit") S.type = "limit";
      // v5: a book row's price picks the side the way the chart does — under the pool buys, over it sells
      if (d.sug) S.side = d.sug; else if (d.side && S.spot && !S.editing) S.side = Number(d.price) < S.spot ? "buy" : "sell";
      syncTotal("price"); form(); flashField();
      if (innerWidth <= 720) sheet(true); else if (innerWidth <= 1200) $("aor-formc").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
      return;
    }
    if (d.left) { S.left = d.left; seg("left", d.left); bookView(); return; }
    if (d.center) { S.center = d.center; seg("center", d.center); swapIn(); if (d.center !== "dex") { panel.querySelectorAll("button[data-mt]").forEach((x) => { if (x.dataset.mt === "chart" || x.dataset.mt === "depth" || x.dataset.mt === "pool") x.setAttribute("aria-selected", String(x.dataset.mt === d.center)); }); } chartView(); return; }
    if (d.alpct) { const i0 = $("aor-al-price"); if (i0 && S.spot) { i0.value = dstr(Number((S.spot * (1 + Number(d.alpct) / 100)).toPrecision(4))); S.alDraft = i0.value; i0.focus(); } return; }
    if (d.shift) { shiftAll(Number(d.shift)); return; }
    if (d.ind) { const v = IND(); v[d.ind] = !v[d.ind]; store.set("arcircle.orders.ind", v); b.setAttribute("aria-checked", String(!!v[d.ind])); draw(); return; }
    if (d.tf) { S.tf = Number(d.tf); panel.querySelectorAll("[data-tf]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.tf) === S.tf))); draw(); return; }
    if (d.my) { S.myTab = d.my; seg("my", d.my); mineView(); return; }
    if (d.scope) { S.myScope = d.scope; panel.querySelectorAll("[data-scope]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.scope === S.myScope))); mineView(); if (d.scope === "both") loadOther().then(mineView); return; }
    if (d.mt) {
      // v4: one row on a phone — Chart and Depth share the chart card, Book and Trades the book's
      seg("mt", d.mt); $("aor-grid").dataset.mt = d.mt === "depth" || d.mt === "pool" ? "chart" : d.mt;
      if (d.mt === "trades" || d.mt === "book") { S.left = d.mt; seg("left", d.mt); bookView(); }
      else { S.center = d.mt === "depth" ? "depth" : d.mt === "pool" ? "pool" : "chart"; seg("center", S.center); swapIn(); chartView(); }
      return;
    }
    if (d.alertdel != null) { const list = alertsFor(S.t), x = list[Number(d.alertdel)]; if (x && x.tg) tgSync(x, true); store.set(AK, alertsAll().filter((a) => a !== x && !(a.t === x.t && a.price === x.price && a.dir === x.dir))); market(); return; }
    const act = d.act;
    if (act === "types") { S.typesOpen = !S.typesOpen; form(); return; }
    if (act === "retryopen") { if (S.t) open(S.t); return; }
    if (act === "mvgo") { const bar = $("aor-mvbar"); if (bar) bar.hidden = true; submit(); return; }
    if (act === "mvno") { S.editing = null; S.moveAsk = null; form(); draw(); return; }
    if (act === "usetap") { b.hidden = true; if (S.tapP > 0) pickPrice(S.tapP); return; }
    if (act === "askmenu") { S.askOpen = !S.askOpen; market(); return; }
    if (act === "shiftstop") { if (S.shift) S.shift.stop = true; return; }
    if (act === "indmenu") { const m0 = b.parentNode.querySelector(".aor-indm"); const on = m0.hidden; m0.hidden = !on; b.setAttribute("aria-expanded", String(on)); return; }
    if (act === "sharelink") { const r = b.closest("[data-h]"); if (r) shareLink(r.dataset.h); return; }
    if (act === "copyord") { const r = b.closest("[data-h]"); if (r) copyOrder(r.dataset.h); S.rowMenu = null; mineView(); return; }
    if (act === "statmore") { S.statsMore = !S.statsMore; market(); return; }
    if (act === "mcapin") { S.mcapIn = !S.mcapIn; store.set("arcircle.orders.mcapin", S.mcapIn); form(); const f0 = $(S.type === "stop" ? "aor-trigger" : "aor-price"); if (f0) f0.focus(); return; }
    if (act === "todca") { toDca(); return; }
    if (act === "rowmenu") { const r = b.closest("[data-h]"); S.rowMenu = r && S.rowMenu !== r.dataset.h ? r.dataset.h : null; mineView(); return; }
    if (act === "usdin") { S.usdIn = !S.usdIn; try { localStorage.setItem("arcircle.orders.usdin", S.usdIn ? "1" : "0"); } catch { /* fine */ } form(); const t0 = $("aor-total"); if (t0) t0.focus(); return; }
    if (act === "csv") { csv(); return; }
    if (act === "extend") { const r = b.closest("[data-h]"); if (r) extend(r.dataset.h); return; }
    if (act === "openother") { setChain(d.ch, { reopen: d.tk }); return; }
    if (act === "altg") { altg(); return; }
    if (act === "markets") { S.showMarkets = !S.showMarkets; marketsView(); if (S.showMarkets) loadMarkets(); return; }
    if (act === "alerts") { S.alertsOpen = !S.alertsOpen; S.alDraft = null; market(); if (S.alertsOpen && $("aor-al-price")) $("aor-al-price").focus(); return; }
    if (act === "alertadd") {
      const v = Number(String(($("aor-al-price") || {}).value || "").replace(/,/g, ""));
      if (!(v > 0) || !S.spot) return;
      const na = { t: S.t, sym: S.tok.symbol, price: v, dir: v >= S.spot ? "up" : "down" };
      store.set(AK, [...alertsAll(), na].slice(-30));
      if (tgOn()) tgSync(na).then((ok) => { if (ok) { store.set(AK, alertsAll().map((x) => (x.t === na.t && x.price === na.price && x.dir === na.dir ? { ...x, tg: true } : x))); market(); } });
      $("aor-al-price").value = ""; S.alDraft = null;
      if ("Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch { /* fine */ } }
      market(); return;
    }
    if (act === "connect") { (async () => { try { await signer(); } catch (err) { S.msg = { k: "bad", t: errText(err) }; } await Promise.all([loadBal(), loadMine()]); form(); mineView(); bookView(); })(); return; }
    if (act === "submit") { submit(); return; }
    if (act === "unlock") { unlock(); return; }
    if (act === "sheetclose") { sheet(false); return; }
    if (act === "editcancel") { S.editing = null; form(); return; }
    if (act === "cancel" || act === "cancelchain" || act === "edit" || act === "share") {
      const r = b.closest("[data-h]"); if (!r) return;
      S.rowMenu = null;
      if (act === "edit") edit(r.dataset.h); else if (act === "share") shareImg(r.dataset.h); else cancel(r.dataset.h, act === "cancelchain");
      return;
    }
    if (act === "cancelmarket" || act === "cancelall") {
      if (S.cxArm !== act) { S.cxArm = act; clearTimeout(S.cxT); S.cxT = setTimeout(() => { S.cxArm = null; mineView(); }, 4000); mineView(); return; }
      S.cxArm = null; clearTimeout(S.cxT); mineView();
      if (act === "cancelmarket") cancelMarketAll(); else cancelAll();
      return;
    }
    if (act === "unwrap") { unwrap(); return; }
    if (act === "showcx") { S.showCx = !S.showCx; mineView(); return; }
    if (act === "repeat") { const l = lastOrder(); if (l) applyPreset(l, true); return; }
    if (act === "presetsave") {
      const off = S.spot && (S.type === "limit" || S.type === "stop") ? Number((((Number(S.type === "stop" ? F.trigger : F.price) - S.spot) / S.spot) * 100).toFixed(2)) : null;
      const x = { side: S.side, type: S.type, off: isFinite(off) ? off : null, pct: S.pct || 0, expiry: F.expiry, trail: F.trail, slip: F.slip, n: F.n, dur: F.dur, parts: F.parts };
      store.set(PRK, [x, ...presets().filter((y) => presetLabel(y) !== presetLabel(x))].slice(0, 5));
      toast(`${tr("Preset saved")}: ${presetLabel(x)}`, "");
      form(); return;
    }
    if (act === "brkgo") { bracketGo(); return; }
    if (act === "brkno") { if (S.brkDue) store.set(BRK, brackets().filter((x) => x.h !== S.brkDue.h)); S.brkDue = null; form(); return; }
  }
  document.addEventListener("click", (e) => {
    if (S.sheet && e.target && e.target.id === "aor-scrim") sheet(false);
    // the price-alert popover closes on a click elsewhere
    if (S.alertsOpen && e.target && e.target.isConnected && !e.target.closest(".aor-alertw")) { S.alertsOpen = false; S.alDraft = null; market(); }
    if (S.typesOpen && e.target && e.target.isConnected && !e.target.closest(".aor-typew")) { S.typesOpen = false; form(); }
    if (S.rowMenu && e.target && e.target.isConnected && !e.target.closest(".aor-rmw")) { S.rowMenu = null; mineView(); }
    if (S.askOpen && e.target && e.target.isConnected && !e.target.closest(".aor-askw")) { S.askOpen = false; market(); }
  });

  // ---------------- boot ----------------
  async function tick(n) {
    if (SOLC()) return; // arc-orders-sol.js refreshes its own side
    if (!panel.classList.contains("active") || document.hidden) return;
    const acct = me();
    if (acct !== S.acct) { S.acct = acct; await Promise.all([loadBal(), loadMine()]); form(); mineView(); }
    if (!S.tok) return;
    // v6: a quiet market (no change in its book, its last fill or its price for 2 minutes, none of my orders open in it)
    // is read every 15 seconds instead of every 5
    const myHere = ((S.mine && S.mine.orders) || []).some((o) => o.status === "open" && lc((o.token && o.token.address) || o.token || "") === S.t);
    const b0 = S.book || {}, sig = `${S.t}:${b0.open}:${b0.fills && b0.fills[0] ? b0.fills[0].at : 0}:${S.spot}`;
    if (sig !== S.qSig) { S.qSig = sig; S.qAt = Date.now(); }
    S.quiet = !myHere && Date.now() - (S.qAt || 0) > 120000;
    if (S.quiet && n % 3 !== 0) return;
    await loadBook();
    if (n % 2 === 0 || S.quiet) { await loadSpot(); checkAlerts(); }
    if (n % 3 === 0 && acct) { await Promise.all([loadMine(), loadBal(), S.myScope === "both" && (!S.other || Date.now() - S.other.at > 60e3) ? loadOther() : null]); mineView(); if (!S.busy && !panel.querySelector(".aor-formc input:focus")) form(); }
    if (n % 6 === 0) { await Promise.all([loadCandles(), loadStatus(), S.center === "depth" || S.center === "pool" ? loadPoolL() : null]); }
    if (n % 60 === 0) { await Promise.all([loadScan(), loadDesk()]); }
    if (n % 12 === 0) loadMarkets();
    market(); bookView(); draw(); strip();
    if (S.center === "depth") chartView();
  }
  function show() {
    if (!S.booted) {
      S.booted = true;
      // the chain in the link wins (a link from ARCIA's chat names it: #orders?c=rh&t=…)
      const hc = /[?&]c=(rh|arc|sol)\b/.exec(location.hash);
      if (hc && (hc[1] !== "sol" || SOL_ON()) && hc[1] !== CH) { CH = hc[1]; try { localStorage.setItem(CK, CH); } catch { /* private window */ } }
      frame();
      if (SOLC()) return;
      loadMarkets(); loadStatus().then(market);
      const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash);
      open(m ? m[1] : DEFAULT_MKT());
      S.acct = me(); loadMine().then(mineView).then(myHash);
    }
    clearInterval(S.timer);
    let n = 0;
    S.timer = setInterval(() => tick(++n), 5000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "orders") show(); else { clearInterval(S.timer); if (S.sheet) sheet(false); } });
  window.addEventListener("hashchange", () => {
    if (!S.booted || !/^#orders/.test(location.hash)) return;
    const m = /[?&]t=(0x[0-9a-fA-F]{40})/.exec(location.hash), c = /[?&]c=rh\b/.test(location.hash) ? "rh" : /[?&]c=sol\b/.test(location.hash) ? "sol" : /[?&]c=arc\b/.test(location.hash) ? "arc" : CH;
    if (c !== CH) { setChain(c, { reopen: m ? m[1] : null }); return; }
    if (SOLC()) { const sm = /[?&]t=([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(location.hash); if (sm && window.arcOrdersSol && window.arcOrdersSol.state.mint !== sm[1]) window.arcOrdersSol.open(sm[1]); return; }
    if (m && lc(m[1]) !== S.t) open(m[1]);
    myHash();
  });
  /// v6: #orders?my=open|history|port[&scope=all] — a link (ARCIA's chat: "my orders") straight to my orders
  function myHash() {
    const k = /[?&]my=(open|history|port)\b/.exec(location.hash);
    if (!k) return;
    S.myTab = k[1]; if (/[?&]scope=all\b/.test(location.hash)) S.myScope = "all";
    seg("my", S.myTab); mineView();
    const el = $("aor-mine"); if (el) setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 300);
  }
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); if (!SOLC() && S.t) { market(); bookView(); form(); } } });
  if (panel.classList.contains("active")) setTimeout(show, 0);
  // v4: arc-orders-v4.js (watchlist, "type an order", Web Push, the phone's layout) works through these
  window.arcOrders = { open, state: S, form: F, lang, setChain, chain: () => CH, fp, num, toast, live: LIVE,
    render: () => { form(); requote(); }, redraw: () => { market(); bookView(); chartView(); mineView(); }, favs, recent, me, viewOf, unlock, pc, usd, mcapOf, qUsd, sellOnly, PRO, setMode: (m) => { store.set(MK, m); panel.classList.toggle("aor-simple", m !== "pro"); },
    // v5: arc-orders-v5.js (portfolio, the fee-burn dashboard, the chain switch's counts, Solana's waitlist)
    rp, sheet, flash: flashField, mine: mineView, connect: async () => { try { await signer(); } catch { /* cancelled */ } await Promise.all([loadBal(), loadMine()]); form(); mineView(); }, chainName: CHAIN_NAME, explorer: EXPL, liveOn, qv, ago, L3: (en, ko, zh) => L3(en, ko, zh), defaultMkt: DEFAULT_MKT };
})();
