/* global ethers, CONFIG, state, readProvider, withRetry, multicallRead, blockAtOrAfter,
          connectWallet, ensureNetwork, ensureAppKitChain, WagmiCoreRef, wagmiConfigRef,
          TRANSIENT_RPC, RATE_LIMITED, ERC20_ABI */
// arcircle-coin.js — the $ARCIRCLE detail page inside ArcPad (arcpad.html#arcircle)
// plus the "featured coin" banners on ArcPad's Home and Explore.
//
// $ARCIRCLE isn't an ArcPad launch: it launched on foci and trades on foci's
// own bonding-curve contract (FociBondingCurve, source-verified on ArcScan)
// until it graduates to a DEX pool. Everything here talks to that contract
// directly — no foci API, no backend:
//   • price / reserves / graduation state: view calls on the curve
//   • trade history + holders: CurveBuy / CurveSell / Transfer logs, scanned
//     in RPC-sized chunks and cached in localStorage so a return visit only
//     reads the blocks added since
//   • swap: approve → curve.buy / curve.sell with a slippage floor
// The quote maths below reproduces the contract's own (checked against real
// mainnet trades to the last unit): fee and creator tax come off the INPUT
// on a buy and off the OUTPUT on a sell, around a constant-product curve
// whose quote side includes a virtual ("phantom") USDC reserve.

const ARCIRCLE = {
  token: "0x933a94b475fa9d8ef94fa564e38dda400a595aa1",
  curve: "0xa37A96C43e2335553BD79171DE6dB2806414AC64",
  symbol: "ARCIRCLE",
  decimals: 18,
  quoteDecimals: 6,
  supply: 1_000_000_000,
  fociUrl: "https://foci.family/token/0x933a94b475fa9d8ef94fa564e38dda400a595aa1",
  gasReserveUsdc: "0.05", // USDC is Arc's gas token — "Max" leaves this much for fees
};

const ARCIRCLE_CURVE_ABI = [
  "function token() view returns (address)",
  "function pairToken() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function getReserves() view returns (uint256 quoteReserve_, uint256 tokenReserve_)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function readyToGraduate() view returns (bool)",
  "function sellableTokens() view returns (uint256)",
  "function reservedTokens() view returns (uint256)",
  "function launchedAt() view returns (uint256)",
  "function deployer() view returns (address)",
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
  "error AlreadyGraduated()", "error CurveGraduated()", "error InsufficientInputAmount()", "error InsufficientLiquidity()",
  "error InsufficientOutputAmount()", "error NativeValueMismatch(uint256 supplied, uint256 expected)", "error NotInitialized()",
  "error ReentrancyGuardReentrantCall()", "error SafeERC20FailedOperation(address token)",
  "error SlippageExceeded(uint256 actual, uint256 minimum)", "error TransferFailed()", "error UnexpectedNativeValue()",
  "error ZeroAddress()", "error ZeroAmount()",
];
const AC2_EVENTS = new ethers.Interface([
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const AC2_TOPIC = {
  buy: AC2_EVENTS.getEvent("CurveBuy").topicHash,
  sell: AC2_EVENTS.getEvent("CurveSell").topicHash,
  transfer: AC2_EVENTS.getEvent("Transfer").topicHash,
};
const AC2_CACHE_KEY = `arcircle.coin.v1.${CONFIG.CHAIN_ID_DECIMAL}.${ARCIRCLE.curve.toLowerCase()}`;
const AC2_TS_KEY = `arcircle.coin.ts.v1.${CONFIG.CHAIN_ID_DECIMAL}`;

const AC2 = {
  s: null,              // latest on-chain snapshot (see ac2FetchState)
  logs: null,           // { launchBlock, lo, hi, recs: [...] } — recs oldest→newest
  ts: {},               // blockNumber → unix seconds (exact, fetched)
  anchor: null,         // { block, ts } — latest block, for estimating the rest
  trades: [],           // derived, newest first
  holders: null,        // derived when the scan reaches launch
  side: "buy",
  slipPct: 2,
  range: 0,             // chart range in seconds, 0 = all
  filter: "all",
  shown: 25,
  chartSrc: "onchain",
  dexPair: null,
  initialized: false,
  scanning: false,
  busy: false,
  pollTimer: null,
  user: null,           // { usdc, tok, allowUsdc, allowTok } for the connected wallet
};

// ---------- helpers ----------
const ac2$ = (id) => document.getElementById(id);
function ac2Curve(signer) { return new ethers.Contract(ARCIRCLE.curve, ARCIRCLE_CURVE_ABI, signer || readProvider()); }
function ac2Erc20(addr, signer) { return new ethers.Contract(addr, ERC20_ABI, signer || readProvider()); }
function ac2Esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function ac2Short(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—"; }
function ac2Usdc(raw) { return Number(ethers.formatUnits(raw, ARCIRCLE.quoteDecimals)); }
function ac2Tok(raw) { return Number(ethers.formatUnits(raw, ARCIRCLE.decimals)); }
function ac2SetAll(key, html) { document.querySelectorAll(`[data-ac2="${key}"]`).forEach((el) => { el.innerHTML = html; }); }

// Tiny prices in Dexscreener style: 0.0000048422 → $0.0₅4842
function ac2FmtPrice(p) {
  if (p == null || !isFinite(p)) return "—";
  if (p === 0) return "$0";
  if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (p >= 0.001) return "$" + p.toPrecision(4);
  // Dexscreener-style: the subscript is the number of zeros after the
  // decimal point, e.g. 0.000004842 → $0.0₅4842.
  const zeros = Math.floor(-Math.log10(p));
  const digits = (Math.round(p * 10 ** (zeros + 4)).toString().slice(0, 4).replace(/0+$/, "")) || "0";
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");
  return `$0.0${sub}${digits}`;
}
function ac2FmtUsd(n, { exact = false } = {}) {
  if (n == null || !isFinite(n)) return "—";
  if (!exact && Math.abs(n) >= 1000) {
    return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ac2FmtNum(n, maxFrac = 2) {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}
function ac2Ago(ts) {
  if (!ts) return "—";
  const d = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function ac2Explorer(kind, x) { return `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`; }

// ---------- curve maths (mirrors FociBondingCurve / FociBondingCurveMath) ----------
function ac2QuoteBuy(quoteIn, s) {
  const fee = (quoteIn * s.feeBps) / 10000n;
  const tax = (quoteIn * s.taxBps) / 10000n;
  const net = quoteIn - fee - tax;
  if (net <= 0n) return null;
  let out = (net * s.tokenRes) / (s.quoteRes + net);
  let clamped = false;
  if (out > s.sellable) { out = s.sellable; clamped = true; }
  return { out, fee, tax, net, clamped };
}
function ac2QuoteSell(tokensIn, s) {
  if (tokensIn <= 0n) return null;
  const gross = (tokensIn * s.quoteRes) / (s.tokenRes + tokensIn);
  const fee = (gross * s.feeBps) / 10000n;
  const tax = (gross * s.taxBps) / 10000n;
  return { out: gross - fee - tax, gross, fee, tax };
}
function ac2Spot(s) { return s ? ac2Usdc(s.quoteRes) / ac2Tok(s.tokenRes) : null; }

// ---------- on-chain state ----------
async function ac2FetchState() {
  const c = ac2Curve();
  const calls = ["getReserves", "feeBps", "creatorTaxBps", "realQuoteReserve", "graduationThreshold", "graduated",
    "readyToGraduate", "sellableTokens", "launchedAt", "deployer"].map((method) => ({ contract: c, method }));
  let userIdx = -1;
  if (state.account) {
    const usdc = ac2Erc20(CONFIG.USDC_ADDRESS), tok = ac2Erc20(ARCIRCLE.token);
    userIdx = calls.length;
    calls.push(
      { contract: usdc, method: "balanceOf", args: [state.account] },
      { contract: tok, method: "balanceOf", args: [state.account] },
      { contract: usdc, method: "allowance", args: [state.account, ARCIRCLE.curve] },
      { contract: tok, method: "allowance", args: [state.account, ARCIRCLE.curve] },
    );
  }
  const r = await withRetry(() => multicallRead(calls));
  if (!r[0]) throw new Error("Couldn't read the $ARCIRCLE curve");
  const prev = AC2.s || {};
  AC2.s = {
    quoteRes: r[0][0], tokenRes: r[0][1],
    feeBps: r[1] ?? prev.feeBps ?? 100n, taxBps: r[2] ?? prev.taxBps ?? 200n,
    realQuote: r[3] ?? prev.realQuote ?? 0n, threshold: r[4] ?? prev.threshold ?? 0n,
    graduated: r[5] == null ? !!prev.graduated : !!r[5], ready: r[6] == null ? !!prev.ready : !!r[6],
    sellable: r[7] ?? prev.sellable ?? 0n, launchedAt: Number(r[8] ?? prev.launchedAt ?? 0), deployer: r[9] || prev.deployer || null,
    at: Date.now(),
  };
  AC2.user = userIdx >= 0
    ? { usdc: r[userIdx] ?? 0n, tok: r[userIdx + 1] ?? 0n, allowUsdc: r[userIdx + 2] ?? 0n, allowTok: r[userIdx + 3] ?? 0n }
    : null;
  return AC2.s;
}

// ---------- log scan (newest-first backfill + incremental forward) ----------
function ac2LoadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(AC2_CACHE_KEY) || "null");
    if (c && Array.isArray(c.recs) && Number.isFinite(c.lo) && Number.isFinite(c.hi)) AC2.logs = c;
  } catch { /* storage blocked */ }
  try { AC2.ts = JSON.parse(localStorage.getItem(AC2_TS_KEY) || "{}") || {}; } catch { AC2.ts = {}; }
}
function ac2SaveCache() {
  try { localStorage.setItem(AC2_CACHE_KEY, JSON.stringify(AC2.logs)); } catch { /* quota: memory copy still works */ }
}
function ac2SaveTs() {
  try { localStorage.setItem(AC2_TS_KEY, JSON.stringify(AC2.ts)); } catch { /* fine */ }
}

function ac2Compact(log) {
  const t0 = log.topics[0];
  const base = { b: Number(log.blockNumber), i: Number(log.index ?? log.logIndex), h: log.transactionHash };
  const d = AC2_EVENTS.parseLog({ topics: log.topics, data: log.data });
  if (!d) return null;
  const a = d.args;
  if (t0 === AC2_TOPIC.buy) return { ...base, k: "B", by: a.buyer, r: a.recipient, q: a.quoteIn.toString(), o: a.tokensOut.toString(), f: a.fee.toString(), x: a.tax.toString() };
  if (t0 === AC2_TOPIC.sell) return { ...base, k: "S", by: a.seller, r: a.recipient, n: a.tokensIn.toString(), q: a.quoteOut.toString(), f: a.fee.toString(), x: a.tax.toString() };
  if (t0 === AC2_TOPIC.transfer) return { ...base, k: "T", fr: a.from, to: a.to, v: a.value.toString() };
  return null;
}

// One RPC-sized range, both contracts in a single eth_getLogs, with backoff
// on Arc's public-RPC rate limit (see queryFilterChunked in arc-shared.js).
async function ac2FetchRange(from, to) {
  const params = [{
    address: [ARCIRCLE.curve, ARCIRCLE.token],
    topics: [[AC2_TOPIC.buy, AC2_TOPIC.sell, AC2_TOPIC.transfer]],
    fromBlock: ethers.toQuantity(from), toBlock: ethers.toQuantity(to),
  }];
  for (let attempt = 0; ; attempt++) {
    try {
      const raw = await readProvider().send("eth_getLogs", params);
      return raw.map((l) => ac2Compact({ ...l, blockNumber: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16) })).filter(Boolean);
    } catch (err) {
      const text = JSON.stringify(err && err.error || "") + String(err && (err.shortMessage || err.message) || err);
      if (!(RATE_LIMITED.test(text) || TRANSIENT_RPC.test(text)) || attempt >= 9) throw err;
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
    }
  }
}

const AC2_CHUNK = 9_000;
async function ac2Scan() {
  if (AC2.scanning) return;
  AC2.scanning = true;
  try {
    const p = readProvider();
    const latestBlock = await withRetry(() => p.getBlock("latest"));
    const latest = latestBlock.number;
    AC2.anchor = { block: latest, ts: Number(latestBlock.timestamp) };
    if (!AC2.logs) {
      const launchedAt = AC2.s && AC2.s.launchedAt ? AC2.s.launchedAt : 1790057692;
      // blockAtOrAfter lands at or just BEFORE the target, so the launch
      // block (and the token's mint) can't be skipped.
      const launchBlock = await blockAtOrAfter(new Date(launchedAt * 1000).toISOString(), "arcircle-coin");
      AC2.logs = { launchBlock, lo: latest + 1, hi: latest, recs: [] };
    }
    const L = AC2.logs;

    // 1) forward: anything new since the last visit / poll
    if (L.hi < latest && L.lo <= L.hi) {
      const fresh = [];
      for (let a = L.hi + 1; a <= latest; a += AC2_CHUNK) {
        const b = Math.min(latest, a + AC2_CHUNK - 1);
        fresh.push(...await ac2FetchRange(a, b));
        L.hi = b;
      }
      if (fresh.length) { L.recs.push(...fresh); ac2Derive(); ac2RenderData(); }
      ac2SaveCache();
    } else if (L.lo > L.hi) {
      L.hi = latest; // first visit: the backfill below starts at `latest`
    }

    // 2) backward: fill history newest → oldest, rendering as it arrives
    let chunks = 0;
    const total = Math.max(1, Math.ceil((L.lo - L.launchBlock) / AC2_CHUNK));
    while (L.lo > L.launchBlock) {
      const a = Math.max(L.launchBlock, L.lo - AC2_CHUNK);
      const got = await ac2FetchRange(a, L.lo - 1);
      L.recs = got.concat(L.recs);
      L.lo = a;
      chunks++;
      if (got.length || chunks % 5 === 0 || L.lo <= L.launchBlock) {
        ac2SaveCache();
        ac2Derive();
        ac2RenderData();
      }
      const el = ac2$("ac2-scan");
      if (el) el.textContent = L.lo > L.launchBlock ? `Indexing history… ${Math.round((chunks / total) * 100)}%` : "";
    }
    ac2SaveCache();
    ac2Derive();
    await ac2ResolveTimestamps();
    ac2RenderData();
  } catch (err) {
    console.error("$ARCIRCLE: log scan failed", err);
    const el = ac2$("ac2-scan");
    if (el) el.textContent = "Couldn't reach Arc to load trades — retrying shortly.";
    ac2SaveCache(); // keep whatever chunks did land
  } finally {
    AC2.scanning = false;
  }
}

// ---------- derive trades / holders ----------
function ac2Derive() {
  const recs = AC2.logs ? AC2.logs.recs : [];
  const curve = ARCIRCLE.curve.toLowerCase();
  const transfersByTx = new Map();
  for (const r of recs) if (r.k === "T") {
    if (!transfersByTx.has(r.h)) transfersByTx.set(r.h, []);
    transfersByTx.get(r.h).push(r);
  }
  const trades = [];
  for (const r of recs) {
    if (r.k !== "B" && r.k !== "S") continue;
    // foci's router sits in the middle of some trades, so the curve event
    // names the router. The real wallet is at the end of the token's path
    // for a buy (last Transfer out) and the start of it for a sell.
    const tx = (transfersByTx.get(r.h) || []).slice().sort((x, y) => x.i - y.i);
    let trader = r.r;
    if (r.k === "B" && tx.length) trader = tx[tx.length - 1].to;
    if (r.k === "S" && tx.length) trader = tx[0].fr;
    if (trader && trader.toLowerCase() === curve) trader = r.r;
    if (r.k === "B") {
      const q = BigInt(r.q), o = BigInt(r.o), fee = BigInt(r.f), tax = BigInt(r.x);
      trades.push({ side: "buy", b: r.b, i: r.i, h: r.h, trader, usdc: ac2Usdc(q), tok: ac2Tok(o),
        price: o > 0n ? ac2Usdc(q - fee - tax) / ac2Tok(o) : null });
    } else {
      const n = BigInt(r.n), q = BigInt(r.q), fee = BigInt(r.f), tax = BigInt(r.x);
      trades.push({ side: "sell", b: r.b, i: r.i, h: r.h, trader, usdc: ac2Usdc(q), tok: ac2Tok(n),
        price: n > 0n ? ac2Usdc(q + fee + tax) / ac2Tok(n) : null });
    }
  }
  trades.sort((a, b) => (b.b - a.b) || (b.i - a.i));
  AC2.trades = trades;

  // Holders need the full history — only once the backfill reaches launch.
  if (AC2.logs && AC2.logs.lo <= AC2.logs.launchBlock) {
    const bal = new Map();
    for (const r of recs) if (r.k === "T") {
      const v = BigInt(r.v);
      if (r.fr !== ethers.ZeroAddress) bal.set(r.fr.toLowerCase(), (bal.get(r.fr.toLowerCase()) ?? 0n) - v);
      if (r.to !== ethers.ZeroAddress) bal.set(r.to.toLowerCase(), (bal.get(r.to.toLowerCase()) ?? 0n) + v);
    }
    AC2.holders = [...bal.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  }
}

function ac2TsOf(block) {
  if (AC2.ts[block]) return AC2.ts[block];
  if (!AC2.anchor) return null;
  // Arc produces a block roughly every ~0.5s; estimate from the nearest
  // exactly-known block (the latest one, or any fetched trade block).
  let best = AC2.anchor;
  for (const k in AC2.ts) {
    const kb = Number(k);
    if (Math.abs(kb - block) < Math.abs(best.block - block)) best = { block: kb, ts: AC2.ts[k] };
  }
  return Math.round(best.ts + (block - best.block) * 0.5);
}
async function ac2ResolveTimestamps() {
  const need = [...new Set(AC2.trades.slice(0, 120).map((t) => t.b))].filter((b) => !AC2.ts[b]);
  if (!need.length) return;
  const p = readProvider();
  for (let i = 0; i < need.length; i += 5) {
    const batch = need.slice(i, i + 5);
    const blocks = await Promise.all(batch.map((b) => withRetry(() => p.getBlock(b)).catch(() => null)));
    blocks.forEach((blk, k) => { if (blk) AC2.ts[batch[k]] = Number(blk.timestamp); });
  }
  ac2SaveTs();
}

// ---------- rendering: header / stats / banners ----------
function ac2RenderState() {
  const s = AC2.s;
  if (!s) return;
  const spot = ac2Spot(s);
  const mcap = spot != null ? spot * ARCIRCLE.supply : null;
  ac2SetAll("price", ac2FmtPrice(spot));
  ac2SetAll("mcap", ac2FmtUsd(mcap));
  const real = ac2Usdc(s.realQuote), thr = ac2Usdc(s.threshold);
  const pct = thr > 0 ? Math.min(100, (real / thr) * 100) : 0;
  ac2SetAll("progress-text", s.graduated
    ? "Graduated"
    : `${ac2FmtUsd(real, { exact: true })} / ${ac2FmtUsd(thr, { exact: true })} USDC · ${pct.toFixed(pct < 10 ? 2 : 1)}%`);
  document.querySelectorAll('[data-ac2="progress-fill"]').forEach((el) => { el.style.width = `${s.graduated ? 100 : Math.max(pct, 0.6)}%`; });
  const liq = ac2$("ac2-liq"); if (liq) liq.textContent = ac2FmtUsd(real);
  const phase = ac2$("ac2-phase");
  if (phase) {
    phase.textContent = s.graduated ? "Graduated" : s.ready ? "Graduating" : "Bonding curve";
    phase.classList.toggle("ac2-badge-live", !s.graduated && !s.ready);
  }
  const fee = ac2$("ac2-about-fee"); if (fee) fee.textContent = `${Number(s.feeBps) / 100}% per trade (foci)`;
  const tax = ac2$("ac2-about-tax"); if (tax) tax.textContent = `${Number(s.taxBps) / 100}% per trade`;
  const grad = ac2$("ac2-about-grad"); if (grad) grad.textContent = `${ac2FmtUsd(thr, { exact: true })} USDC in the curve`;
  const cr = ac2$("ac2-about-creator");
  if (cr && s.deployer) cr.innerHTML = `<a href="${ac2Explorer("address", s.deployer)}" target="_blank" rel="noopener">${ac2Short(s.deployer)} ↗</a>`;
  if (s.launchedAt) {
    const d = new Date(s.launchedAt * 1000);
    const la = ac2$("ac2-about-launched"); if (la) la.textContent = d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const age = ac2$("ac2-age"); if (age) age.textContent = ac2Ago(s.launchedAt).replace(" ago", "");
  }
  const feeLabel = ac2$("ac2-q-fee-label");
  if (feeLabel) feeLabel.textContent = `(${Number(s.feeBps) / 100}% + ${Number(s.taxBps) / 100}% creator tax)`;
  const note = ac2$("ac2-grad-note");
  if (note && s.graduated) note.textContent = "$ARCIRCLE has graduated from its bonding curve — trading continues on its DEX pool.";
  ac2RenderSwap();
}

function ac2RenderData() {
  ac2RenderStats();
  ac2RenderTrades();
  ac2RenderHolders();
  ac2RenderChart();
}

function ac2RenderStats() {
  const now = Math.floor(Date.now() / 1000);
  const day = AC2.trades.filter((t) => { const ts = ac2TsOf(t.b); return ts && now - ts <= 86400; });
  const vol = day.reduce((s, t) => s + t.usdc, 0);
  const v = ac2$("ac2-vol"); if (v) v.textContent = AC2.logs ? ac2FmtUsd(vol) : "—";
  const n = ac2$("ac2-txns");
  if (n) {
    const b = day.filter((t) => t.side === "buy").length;
    n.innerHTML = AC2.logs ? `${day.length} <span class="ac2-bs"><em class="b">${b}B</em> <em class="s">${day.length - b}S</em></span>` : "—";
  }
  const hc = ac2$("ac2-holders-count");
  if (hc) hc.textContent = AC2.holders ? String(AC2.holders.filter(([a]) => a !== ARCIRCLE.curve.toLowerCase()).length) : "…";
  // 24h change: spot now vs the last trade price at or before 24h ago
  const ch = ac2$("ac2-change");
  const spot = ac2Spot(AC2.s);
  if (ch && spot != null && AC2.trades.length) {
    const before = AC2.trades.find((t) => { const ts = ac2TsOf(t.b); return ts && now - ts >= 86400; });
    const oldest = AC2.trades[AC2.trades.length - 1];
    const ref = before ? before.price : (AC2.logs && AC2.logs.lo <= AC2.logs.launchBlock ? oldest.price : null);
    if (ref) {
      const pct = (spot / ref - 1) * 100;
      ch.className = "ac2-change " + (pct >= 0 ? "up" : "down");
      ch.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}% ${before ? "24h" : "since launch"}`;
    }
  }
}

function ac2RenderTrades() {
  const body = ac2$("ac2-trades");
  if (!body) return;
  let rows = AC2.trades;
  if (AC2.filter === "buy" || AC2.filter === "sell") rows = rows.filter((t) => t.side === AC2.filter);
  if (AC2.filter === "mine") {
    const me = state.account && state.account.toLowerCase();
    rows = me ? rows.filter((t) => t.trader && t.trader.toLowerCase() === me) : [];
  }
  const more = ac2$("ac2-more");
  if (!rows.length) {
    const scanning = AC2.logs && AC2.logs.lo > AC2.logs.launchBlock;
    const msg = AC2.filter === "mine" && !state.account ? "Connect a wallet to see your trades."
      : scanning ? "Loading trades…" : AC2.logs ? "No trades here yet." : "Loading trades…";
    body.innerHTML = `<tr><td colspan="7" class="ac2-empty">${msg}</td></tr>`;
    if (more) more.hidden = true;
    return;
  }
  const me = state.account && state.account.toLowerCase();
  body.innerHTML = rows.slice(0, AC2.shown).map((t) => {
    const ts = ac2TsOf(t.b);
    const mine = me && t.trader && t.trader.toLowerCase() === me;
    return `<tr class="${t.side}">
      <td title="${ts ? new Date(ts * 1000).toLocaleString() : ""}">${ac2Ago(ts)}</td>
      <td><span class="ac2-type ${t.side}">${t.side === "buy" ? "Buy" : "Sell"}</span></td>
      <td class="r">${ac2FmtUsd(t.usdc, { exact: t.usdc < 1000 })}</td>
      <td class="r">${ac2FmtNum(t.tok)}</td>
      <td class="r">${ac2FmtPrice(t.price)}</td>
      <td><a href="${ac2Explorer("address", t.trader)}" target="_blank" rel="noopener" class="ac2-addr">${ac2Short(t.trader)}</a>${mine ? ' <span class="ac2-you">you</span>' : ""}</td>
      <td class="r"><a href="${ac2Explorer("tx", t.h)}" target="_blank" rel="noopener" class="ac2-tx" aria-label="View transaction">↗</a></td>
    </tr>`;
  }).join("");
  if (more) more.hidden = rows.length <= AC2.shown;
}

function ac2RenderHolders() {
  const el = ac2$("ac2-holders");
  if (!el) return;
  if (!AC2.holders) {
    el.innerHTML = `<div class="ac2-empty">Holders appear once the history finishes indexing.</div>`;
    return;
  }
  const curve = ARCIRCLE.curve.toLowerCase();
  const creator = AC2.s && AC2.s.deployer ? AC2.s.deployer.toLowerCase() : "";
  const me = state.account && state.account.toLowerCase();
  const supply = ARCIRCLE.supply;
  el.innerHTML = `<div class="ac2-holders">` + AC2.holders.slice(0, 25).map(([addr, raw], i) => {
    const amt = ac2Tok(raw);
    const pct = (amt / supply) * 100;
    const tag = addr === curve ? '<span class="ac2-tag">Bonding curve</span>' : addr === creator ? '<span class="ac2-tag">Creator</span>' : addr === me ? '<span class="ac2-you">you</span>' : "";
    return `<div class="ac2-holder">
      <span class="ac2-rank">${i + 1}</span>
      <span class="ac2-holder-who"><a href="${ac2Explorer("address", addr)}" target="_blank" rel="noopener" class="ac2-addr">${ac2Short(addr)}</a>${tag}</span>
      <span class="ac2-holder-bar"><span style="width:${Math.max(pct, 0.4)}%"></span></span>
      <span class="ac2-holder-amt">${ac2FmtNum(amt)}</span>
      <span class="ac2-holder-pct">${pct < 0.01 ? "<0.01" : pct.toFixed(2)}%</span>
    </div>`;
  }).join("") + `</div><p class="ac2-note">Balances rebuilt from every $ARCIRCLE transfer since launch. Tokens still in the bonding curve are the unsold supply.</p>`;
}

// ---------- chart (SVG, step line from on-chain trades) ----------
function ac2ChartPoints() {
  const pts = AC2.trades.slice().reverse().map((t) => ({ ts: ac2TsOf(t.b), p: t.price, side: t.side })).filter((x) => x.ts && x.p);
  const spot = ac2Spot(AC2.s);
  const now = Math.floor(Date.now() / 1000);
  if (spot != null) pts.push({ ts: now, p: spot, side: "now" });
  if (!AC2.range) return pts;
  const from = now - AC2.range;
  const inRange = pts.filter((x) => x.ts >= from);
  const before = pts.filter((x) => x.ts < from).pop();
  return before ? [{ ...before, ts: from, side: "carry" }, ...inRange] : inRange;
}

function ac2RenderChart() {
  const box = ac2$("ac2-chart");
  if (!box || AC2.chartSrc !== "onchain") return;
  const pts = ac2ChartPoints();
  if (!AC2.logs || pts.length < 2) {
    box.innerHTML = `<div class="ac2-empty">${AC2.logs ? "Not enough trades in this range yet." : "Loading trades…"}</div>`;
    return;
  }
  const W = Math.max(320, box.clientWidth || 640), H = 280, padL = 12, padR = 76, padT = 16, padB = 28;
  const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts;
  let lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p));
  if (hi === lo) { hi *= 1.02; lo *= 0.98; }
  const pad = (hi - lo) * 0.12; hi += pad; lo = Math.max(0, lo - pad);
  const X = (ts) => padL + ((ts - t0) / Math.max(1, t1 - t0)) * (W - padL - padR);
  const Y = (p) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  // step-after: the curve's price holds until the next trade moves it
  let d = `M${X(pts[0].ts).toFixed(1)},${Y(pts[0].p).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${X(pts[i].ts).toFixed(1)} V${Y(pts[i].p).toFixed(1)}`;
  const area = `${d} V${H - padB} H${X(pts[0].ts).toFixed(1)} Z`;
  const up = pts[pts.length - 1].p >= pts[0].p;
  const col = up ? "#39ff88" : "#ff6b6b";
  const yTicks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const span = t1 - t0;
  const fmtT = (ts) => {
    const dt = new Date(ts * 1000);
    return span > 2 * 86400 ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };
  const xTicks = [0, 1, 2, 3].map((k) => t0 + (span * k) / 3);
  const dots = pts.filter((x) => x.side === "buy" || x.side === "sell")
    .map((x) => `<circle cx="${X(x.ts).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="3.5" class="ac2-dot ${x.side}"/>`).join("");
  const last = pts[pts.length - 1];
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="$ARCIRCLE price chart">
    <defs><linearGradient id="ac2Area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${yTicks.map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="ac2-grid-line"/><text x="${W - padR + 8}" y="${(Y(v) + 4).toFixed(1)}" class="ac2-axis">${ac2FmtPrice(v).replace("$", "")}</text>`).join("")}
    ${xTicks.map((t) => `<text x="${X(t).toFixed(1)}" y="${H - 8}" class="ac2-axis" text-anchor="middle">${fmtT(t)}</text>`).join("")}
    <path d="${area}" fill="url(#ac2Area)"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    ${dots}
    <line x1="${padL}" x2="${W - padR}" y1="${Y(last.p).toFixed(1)}" y2="${Y(last.p).toFixed(1)}" class="ac2-last-line" stroke="${col}"/>
    <rect x="${W - padR + 2}" y="${(Y(last.p) - 10).toFixed(1)}" width="${padR - 4}" height="20" rx="5" fill="${col}"/>
    <text x="${W - padR + 8}" y="${(Y(last.p) + 4).toFixed(1)}" class="ac2-axis ac2-axis-last">${ac2FmtPrice(last.p).replace("$", "")}</text>
    <g class="ac2-hover" id="ac2-hover" style="display:none"><line y1="${padT}" y2="${H - padB}" class="ac2-cross"/><circle r="4.5" class="ac2-cross-dot"/></g>
    <rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="transparent" id="ac2-hit"/>
  </svg><div class="ac2-tip" id="ac2-tip" hidden></div>`;
  // crosshair tooltip
  const hit = ac2$("ac2-hit"), g = ac2$("ac2-hover"), tip = ac2$("ac2-tip");
  const svg = box.querySelector("svg");
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
    const ts = t0 + ((x - padL) / (W - padL - padR)) * (t1 - t0);
    let cur = pts[0];
    for (const pnt of pts) { if (pnt.ts <= ts) cur = pnt; else break; }
    const cx = Math.min(Math.max(x, padL), W - padR), cy = Y(cur.p);
    g.style.display = "";
    g.querySelector("line").setAttribute("x1", cx); g.querySelector("line").setAttribute("x2", cx);
    g.querySelector("circle").setAttribute("cx", cx); g.querySelector("circle").setAttribute("cy", cy);
    tip.hidden = false;
    tip.innerHTML = `<strong>${ac2FmtPrice(cur.p)}</strong><span>${new Date(Math.min(ts, t1) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>`;
    const px = (cx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(px - 60, 4), r.width - 128)}px`;
  };
  const leave = () => { g.style.display = "none"; tip.hidden = true; };
  hit.addEventListener("mousemove", move);
  hit.addEventListener("touchmove", move, { passive: true });
  hit.addEventListener("mouseleave", leave);
  hit.addEventListener("touchend", leave);
}

// Dexscreener: only for a pair whose base token is EXACTLY our contract.
// (A different project's "ARCircle" token already has an Arc pair — a
// name/symbol search would happily pick it up, so we never search by name.)
async function ac2CheckDexscreener() {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/arc/${ARCIRCLE.token}`);
    if (!r.ok) return;
    const pairs = await r.json();
    const mine = (Array.isArray(pairs) ? pairs : []).filter((p) =>
      p && p.chainId === "arc" && p.baseToken && p.baseToken.address && p.baseToken.address.toLowerCase() === ARCIRCLE.token.toLowerCase());
    if (!mine.length) return;
    mine.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    AC2.dexPair = mine[0];
    ac2$("ac2-src").hidden = false;
    const link = ac2$("ac2-dex-link");
    if (link) { link.href = AC2.dexPair.url || `https://dexscreener.com/arc/${AC2.dexPair.pairAddress}`; link.hidden = false; }
    if (AC2.s && AC2.s.graduated) ac2SetChartSrc("dex");
  } catch { /* Dexscreener unreachable — on-chain chart stays */ }
}
function ac2SetChartSrc(src) {
  if (src === "dex" && !AC2.dexPair) return;
  AC2.chartSrc = src;
  document.querySelectorAll("#ac2-src button").forEach((b) => b.classList.toggle("active", b.dataset.src === src));
  const dex = ac2$("ac2-dex"), chart = ac2$("ac2-chart"), range = ac2$("ac2-range"), label = ac2$("ac2-chart-src-label"), note = ac2$("ac2-chart-note");
  if (src === "dex") {
    const pair = AC2.dexPair.pairAddress;
    dex.innerHTML = `<iframe title="$ARCIRCLE on Dexscreener" loading="lazy" src="https://dexscreener.com/arc/${encodeURIComponent(pair)}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=15"></iframe>`;
    dex.hidden = false; chart.hidden = true; range.hidden = true;
    label.textContent = "· Dexscreener";
    note.textContent = "Live chart from Dexscreener for $ARCIRCLE's DEX pair.";
  } else {
    dex.hidden = true; dex.innerHTML = ""; chart.hidden = false; range.hidden = false;
    label.textContent = "· on-chain";
    note.textContent = "Drawn straight from the curve's own trades on Arc.";
    ac2RenderChart();
  }
}

// ---------- swap ----------
function ac2ParseAmount() {
  const raw = (ac2$("ac2-amount").value || "").trim().replace(/,/g, "");
  if (!raw || !/^\d*\.?\d*$/.test(raw) || Number(raw) <= 0) return null;
  const dec = AC2.side === "buy" ? ARCIRCLE.quoteDecimals : ARCIRCLE.decimals;
  const [w, f = ""] = raw.split(".");
  try { return ethers.parseUnits(`${w || "0"}.${f.slice(0, dec) || "0"}`, dec); } catch { return null; }
}

function ac2CurrentQuote() {
  const amt = ac2ParseAmount();
  if (!amt || !AC2.s) return null;
  const q = AC2.side === "buy" ? ac2QuoteBuy(amt, AC2.s) : ac2QuoteSell(amt, AC2.s);
  if (!q) return null;
  const slipBps = BigInt(Math.round(AC2.slipPct * 100));
  const min = (q.out * (10000n - slipBps)) / 10000n;
  const spot = ac2Spot(AC2.s);
  let impact = null;
  if (AC2.side === "buy" && q.out > 0n) impact = (ac2Usdc(q.net) / ac2Tok(q.out)) / spot - 1;
  if (AC2.side === "sell") impact = 1 - (ac2Usdc(q.gross) / ac2Tok(amt)) / spot;
  return { amt, ...q, min, impact };
}

function ac2RenderSwap() {
  const buy = AC2.side === "buy";
  document.querySelectorAll(".ac2-swap-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.side === AC2.side));
  ac2$("ac2-swap").classList.toggle("is-sell", !buy);
  ac2$("ac2-in-label").textContent = buy ? "You pay" : "You sell";
  ac2$("ac2-in-unit").textContent = buy ? "USDC" : "$ARCIRCLE";
  ac2$("ac2-out-unit").textContent = buy ? "$ARCIRCLE" : "USDC";

  const bal = ac2$("ac2-bal");
  if (AC2.user) {
    bal.textContent = buy
      ? `Balance ${ac2FmtNum(ac2Usdc(AC2.user.usdc), 4)} USDC`
      : `Balance ${ac2FmtNum(ac2Tok(AC2.user.tok))} ARCIRCLE`;
  } else bal.textContent = "Balance —";

  const quick = ac2$("ac2-quick");
  const qkey = buy ? "buy" : "sell";
  if (quick.dataset.side !== qkey) {
    quick.dataset.side = qkey;
    quick.innerHTML = buy
      ? ["1", "5", "10", "50"].map((v) => `<button type="button" data-q="${v}" title="${v} USDC">$${v}</button>`).join("") + `<button type="button" data-q="max">Max</button>`
      : ["25", "50", "75"].map((v) => `<button type="button" data-q="${v}%">${v}%</button>`).join("") + `<button type="button" data-q="100%">Max</button>`;
  }

  const q = ac2CurrentQuote();
  const out = ac2$("ac2-out");
  const fmtOut = (raw) => buy ? ac2Tok(raw).toLocaleString("en-US", { maximumFractionDigits: ac2Tok(raw) >= 1000 ? 0 : 2 }) : `${ac2Usdc(raw).toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  out.textContent = q ? fmtOut(q.out) : "0";
  const impactEl = ac2$("ac2-q-impact");
  if (q && q.impact != null) {
    impactEl.textContent = `${(q.impact * 100).toFixed(2)}%`;
    impactEl.className = q.impact > 0.05 ? "warn" : "";
  } else impactEl.textContent = "—";
  ac2$("ac2-q-fee").textContent = q ? `${(ac2Usdc(q.fee + q.tax)).toLocaleString("en-US", { maximumFractionDigits: 4 })} USDC` : "—";
  ac2$("ac2-q-min").textContent = q ? `${fmtOut(q.min)} ${buy ? "ARCIRCLE" : "USDC"}` : "—";

  const btn = ac2$("ac2-submit");
  const s = AC2.s;
  let label = "Enter an amount", disabled = true, warn = "";
  if (!state.account) { label = "Connect wallet"; disabled = false; }
  else if (!s) { label = "Loading…"; }
  else if (s.graduated) { label = "Graduated — trade on its DEX pool"; }
  else if (!buy && s.ready) { label = "Curve full — graduating"; }
  else if (q) {
    const have = buy ? (AC2.user ? AC2.user.usdc : 0n) : (AC2.user ? AC2.user.tok : 0n);
    const allow = buy ? (AC2.user ? AC2.user.allowUsdc : 0n) : (AC2.user ? AC2.user.allowTok : 0n);
    if (q.amt > have) { label = `Not enough ${buy ? "USDC" : "$ARCIRCLE"}`; }
    else if (allow < q.amt) { label = `Approve ${buy ? "USDC" : "$ARCIRCLE"}`; disabled = false; }
    else { label = buy ? "Buy $ARCIRCLE" : "Sell $ARCIRCLE"; disabled = false; }
    if (buy && q.clamped) warn = "Only part of this fits on the curve — the unused USDC is refunded in the same transaction.";
    else if (q.impact != null && q.impact > 0.05) warn = `High price impact (${(q.impact * 100).toFixed(1)}%).`;
  }
  if (AC2.busy) disabled = true;
  if (!AC2.busy) { btn.textContent = label; btn.disabled = disabled; }
  btn.classList.toggle("neutral", !state.account);
  const st = ac2$("ac2-status");
  if (!AC2.busy && st.dataset.kind !== "result") st.innerHTML = warn ? `<div class="ac2-msg warn">${ac2Esc(warn)}</div>` : "";
}

function ac2Status(kind, html) {
  const st = ac2$("ac2-status");
  st.dataset.kind = kind === "success" || kind === "error" ? "result" : "";
  st.innerHTML = `<div class="ac2-msg ${kind}">${html}</div>`;
}

async function ac2EnsureChain() {
  if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
}

function ac2ErrText(err) {
  const r = err && (err.revert || (err.info && err.info.error && err.info.error.revert));
  if (r && r.name === "SlippageExceeded") return "Price moved past your slippage limit — try again or raise slippage.";
  if (r && (r.name === "CurveGraduated" || r.name === "AlreadyGraduated")) return "The curve has graduated — trading moved to its DEX pool.";
  if (r && r.name) return `Rejected by the curve: ${r.name}`;
  if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return "You rejected the request in your wallet.";
  const m = String(err && (err.shortMessage || err.reason || err.message) || err);
  if (/insufficient funds|missing revert data/i.test(m)) return "Not enough USDC on Arc for this amount plus gas.";
  return m.slice(0, 200);
}

async function ac2Submit() {
  if (AC2.busy) return;
  if (!state.account) {
    await connectWallet();
    await ac2Refresh();
    return;
  }
  const btn = ac2$("ac2-submit");
  AC2.busy = true;
  btn.disabled = true;
  const buy = AC2.side === "buy";
  const unit = buy ? "USDC" : "$ARCIRCLE";
  try {
    await ac2EnsureChain();
    if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
    await ac2FetchState();
    const q = ac2CurrentQuote();
    if (!q) throw new Error("Enter an amount.");
    const have = buy ? AC2.user.usdc : AC2.user.tok;
    if (q.amt > have) throw new Error(`Not enough ${unit}.`);

    const asset = buy ? CONFIG.USDC_ADDRESS : ARCIRCLE.token;
    const allowance = buy ? AC2.user.allowUsdc : AC2.user.allowTok;
    if (allowance < q.amt) {
      btn.textContent = `Approve ${unit} in wallet…`;
      ac2Status("pending", `Step 1 of 2 — approve ${ac2Esc(unit)} for the $ARCIRCLE curve.`);
      const atx = await ac2Erc20(asset, state.signer).approve(ARCIRCLE.curve, q.amt);
      btn.textContent = "Approving…";
      await atx.wait();
      await ac2FetchState();
    }

    const curve = ac2Curve(state.signer);
    const fresh = ac2CurrentQuote(); // reserves may have moved while approving
    // Dry-run the exact call first so a revert shows up here, not as a failed tx.
    btn.textContent = "Checking…";
    if (buy) await curve.buy.staticCall(fresh.amt, fresh.min, state.account);
    else await curve.sell.staticCall(fresh.amt, fresh.min, state.account);

    btn.textContent = "Confirm in wallet…";
    ac2Status("pending", `${buy ? "Buying" : "Selling"} — confirm in your wallet.`);
    const tx = buy ? await curve.buy(fresh.amt, fresh.min, state.account) : await curve.sell(fresh.amt, fresh.min, state.account);
    btn.textContent = buy ? "Buying…" : "Selling…";
    ac2Status("pending", `Submitted — waiting for Arc. <a href="${ac2Explorer("tx", tx.hash)}" target="_blank" rel="noopener">View tx ↗</a>`);
    const rc = await tx.wait();
    ac2Status("success", `${buy ? "Bought" : "Sold"}! <a href="${ac2Explorer("tx", rc.hash)}" target="_blank" rel="noopener">View tx ↗</a>`);
    ac2$("ac2-amount").value = "";
    await ac2Refresh();
    ac2Scan();
  } catch (err) {
    console.error("$ARCIRCLE swap failed", err);
    ac2Status("error", ac2Esc(ac2ErrText(err)));
  } finally {
    AC2.busy = false;
    ac2RenderSwap();
  }
}

function ac2Quick(v) {
  const input = ac2$("ac2-amount");
  const st = ac2$("ac2-status"); st.dataset.kind = "";
  if (AC2.side === "buy") {
    if (v === "max") {
      if (!AC2.user) return;
      const reserve = ethers.parseUnits(ARCIRCLE.gasReserveUsdc, ARCIRCLE.quoteDecimals);
      const amt = AC2.user.usdc > reserve ? AC2.user.usdc - reserve : 0n;
      input.value = ethers.formatUnits(amt, ARCIRCLE.quoteDecimals).replace(/\.0$/, "");
    } else input.value = v;
  } else {
    if (!AC2.user) return;
    const pct = BigInt(parseInt(v, 10));
    input.value = ethers.formatUnits((AC2.user.tok * pct) / 100n, ARCIRCLE.decimals).replace(/\.0$/, "");
  }
  ac2RenderSwap();
}

// ---------- lifecycle ----------
async function ac2Refresh() {
  try { await ac2FetchState(); ac2RenderState(); ac2RenderStats(); } catch (err) { console.warn("$ARCIRCLE: state refresh failed", err); }
}

function ac2Wire() {
  document.querySelectorAll(".ac2-swap-tabs button").forEach((b) => b.addEventListener("click", () => {
    if (AC2.side === b.dataset.side) return;
    AC2.side = b.dataset.side;
    ac2$("ac2-amount").value = "";
    ac2$("ac2-status").dataset.kind = "";
    ac2RenderSwap();
  }));
  ac2$("ac2-amount").addEventListener("input", () => { ac2$("ac2-status").dataset.kind = ""; ac2RenderSwap(); });
  ac2$("ac2-quick").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) ac2Quick(b.dataset.q); });
  ac2$("ac2-bal").addEventListener("click", () => ac2Quick(AC2.side === "buy" ? "max" : "100%"));
  ac2$("ac2-slip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-slip]"); if (!b) return;
    AC2.slipPct = Number(b.dataset.slip);
    document.querySelectorAll("#ac2-slip button").forEach((x) => x.classList.toggle("active", x === b));
    ac2RenderSwap();
  });
  ac2$("ac2-submit").addEventListener("click", ac2Submit);
  ac2$("ac2-range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-range]"); if (!b) return;
    AC2.range = Number(b.dataset.range);
    document.querySelectorAll("#ac2-range button").forEach((x) => x.classList.toggle("active", x === b));
    ac2RenderChart();
  });
  ac2$("ac2-src").addEventListener("click", (e) => { const b = e.target.closest("[data-src]"); if (b) ac2SetChartSrc(b.dataset.src); });
  ac2$("ac2-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]"); if (!b) return;
    AC2.filter = b.dataset.filter; AC2.shown = 25;
    document.querySelectorAll("#ac2-filter button").forEach((x) => x.classList.toggle("active", x === b));
    ac2RenderTrades();
  });
  ac2$("ac2-more").addEventListener("click", () => { AC2.shown += 25; ac2RenderTrades(); });
  document.querySelectorAll(".ac2-tabs [data-ac2tab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".ac2-tabs [data-ac2tab]").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("[data-ac2panel]").forEach((p) => { p.hidden = p.dataset.ac2panel !== b.dataset.ac2tab; });
  }));
  ac2$("ac2-copy-ca").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(ARCIRCLE.token); b.textContent = "Copied"; } catch { b.textContent = "Copy failed"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1400);
  });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(ac2RenderChart, 150); });
}

function ac2Activate() {
  const panel = ac2$("bp-panel-arcircle");
  if (!panel) return;
  if (!AC2.initialized) {
    AC2.initialized = true;
    ac2Wire();
    ac2LoadCache();
    ac2Derive();
    ac2RenderData();
    ac2RenderSwap();
    ac2Refresh().then(() => ac2Scan());
    ac2CheckDexscreener();
  } else {
    ac2Refresh();
    ac2Scan();
  }
  if (AC2.pollTimer) clearInterval(AC2.pollTimer);
  AC2.pollTimer = setInterval(() => {
    if (!panel.classList.contains("active") || document.hidden) return;
    ac2Refresh();
    ac2Scan();
  }, 15000);
}

(() => {
  const panel = ac2$("bp-panel-arcircle");
  if (!panel) return;

  // Banners on Home / Explore: one cheap state read on page load.
  ac2FetchState().then(ac2RenderState).catch((err) => console.warn("$ARCIRCLE banner: state read failed", err));

  // Open lazily the first time the panel is shown (sidebar, banner or
  // /arc#arcircle), and keep the URL shareable while it's open.
  let wasActive = false;
  const onChange = () => {
    const active = panel.classList.contains("active");
    if (active && !wasActive) {
      ac2Activate();
      if (location.hash !== "#arcircle" && history.replaceState) history.replaceState(null, "", "#arcircle");
    } else if (!active && wasActive && location.hash === "#arcircle" && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    wasActive = active;
  };
  new MutationObserver(onChange).observe(panel, { attributes: true, attributeFilter: ["class"] });
  onChange();
  if (location.hash === "#arcircle") {
    const nav = document.querySelector('.bp-nav-item[data-tab="arcircle"]');
    if (nav) nav.click();
  }

  // Wallet connect / switch / disconnect → balances, allowances, "Mine".
  const prev = typeof refreshAccountDependentViews === "function" ? refreshAccountDependentViews : null;
  // eslint-disable-next-line no-global-assign
  refreshAccountDependentViews = function () {
    if (prev) prev();
    if (AC2.initialized) { ac2Refresh(); ac2RenderTrades(); ac2RenderHolders(); } else ac2FetchState().then(ac2RenderState).catch(() => {});
  };
})();
