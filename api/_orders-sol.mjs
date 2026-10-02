// api/_orders-sol.mjs — ARCIRCLE Orders on Solana (the program: solana/arcircle-orders; the page: arc-orders-sol.js).
//
// Orders live on chain as program accounts, so there's no book to keep here: this module reads them, prices markets,
// builds market swaps and runs the keeper.
//   book(mint)       the market: price (Dexscreener), the open orders on it as price levels
//   mine(wallet)     a wallet's open orders (from the chain) and its fills (recorded by the keeper)
//   markets()        tokens with open orders, then ArcPad's Pump.fun coins
//   status()         is it live: the program, its config, the keeper, Jupiter
//   swapTx(b)        a market order: a Jupiter swap for the wallet to sign, 0.1% to the treasury's wSOL (Jupiter's
//                    platform fee on the SOL side)
//   tick(store)      the keeper: every open order whose price Jupiter can now beat is filled in one transaction —
//                    fill_start, the Jupiter swap, fill_end. The program checks the owner gets at least their price;
//                    a buy's whole output goes to the owner, a sell pays the owner Jupiter's guaranteed amount less the
//                    fee. Expired orders are closed (their rent back to the owners).
// Environment: ORDERS_SOL_PROGRAM (the program id), ORDERS_KEEPER_SOL_KEY (the keeper's secret key — Vercel, Sensitive),
// JUPITER_API_KEY (portal.jup.ag), SOLANA_RPC_URL (an RPC that allows getProgramAccounts).
import { web3, spl, ordersSol } from "./_solkit.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
// keep in step with config-arc.js CONFIG.ORDERS_SOL
export const CFG = {
  program: "", // env ORDERS_SOL_PROGRAM overrides
  rpcs: () => [env("SOLANA_RPC_URL"), "https://api.mainnet-beta.solana.com"].filter(Boolean),
  jup: "https://api.jup.ag/swap/v1",
  rpc: null, // tests: (method, params) => result
  jupFetch: null, // tests: (path, init) => json
  dex: null, // tests: (mints) => { mint: {...} }
  solUsd: null,
  keeperKey: () => env("ORDERS_KEEPER_SOL_KEY"),
  jupKey: () => env("JUPITER_API_KEY"),
  cuPrice: 50000, // micro-lamports per compute unit on the keeper's fills
  slippageBps: 50,
  perTick: 6,
};
export function configure(o) { Object.assign(CFG, o); mem.cfg = null; mem.O = null; }
const mem = { cfg: null, cfgAt: 0, O: null, mintInfo: new Map(), lastTick: null };
const programId = () => env("ORDERS_SOL_PROGRAM") || CFG.program;
const isKey = (s) => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "")) && new web3.PublicKey(s).toBytes().length === 32; } catch { return false; } };
const O = () => { if (!isKey(programId())) return null; if (!mem.O || mem.O.PROGRAM.toBase58() !== programId()) mem.O = ordersSol({ web3, spl, programId: programId() }); return mem.O; };
const WSOL = spl.NATIVE_MINT.toBase58();
const LAMPORTS = 1e9;

// ---------------- Solana RPC ----------------
async function rpc(method, params) {
  if (CFG.rpc) return CFG.rpc(method, params);
  let last = null;
  for (const u of CFG.rpcs()) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => null);
      if (j && j.error) { last = Object.assign(new Error(String(j.error.message || "rpc error")), { data: j.error.data }); if (r.status === 429 || /rate/i.test(last.message)) continue; throw last; }
      if (j && "result" in j) return j.result;
      last = new Error(`rpc ${r.status}`);
    } catch (e) { last = e; if (e && e.data) throw e; }
  }
  throw last || new Error("no Solana RPC");
}
const b64 = (s) => Buffer.from(String(s || ""), "base64");
async function accounts(keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    const r = await rpc("getMultipleAccounts", [keys.slice(i, i + 100).map(String), { encoding: "base64", commitment: "confirmed" }]);
    for (const a of (r && r.value) || []) out.push(a ? { owner: a.owner, lamports: Number(a.lamports), data: b64(a.data[0]) } : null);
  }
  return out;
}

/// the program's config (null before it's set up), cached a minute
async function config(force) {
  const o = O();
  if (!o) return null;
  if (mem.cfg && !force && Date.now() - mem.cfgAt < 60e3) return mem.cfg;
  const [a] = await accounts([o.configPda.toBase58()]);
  mem.cfg = a && a.owner === o.PROGRAM.toBase58() ? o.decodeConfig(a.data) : null;
  mem.cfgAt = Date.now();
  return mem.cfg;
}
/// open orders (optionally one owner's, or one mint's), each with its address
async function openOrders({ owner = null, mint = null } = {}) {
  const o = O();
  if (!o) return [];
  const filters = o.orderFilters(owner);
  if (mint) filters.push({ memcmp: { offset: 49, bytes: mint } });
  const r = await rpc("getProgramAccounts", [o.PROGRAM.toBase58(), { encoding: "base64", commitment: "confirmed", filters }]);
  return (Array.isArray(r) ? r : (r && r.value) || []).map((x) => { const d = o.decodeOrder(b64(x.account.data[0])); return d ? { ...d, address: x.pubkey } : null; }).filter(Boolean);
}
/// a mint's decimals and token program, cached
async function mintInfo(mint) {
  if (mem.mintInfo.has(mint)) return mem.mintInfo.get(mint);
  const [a] = await accounts([mint]);
  if (!a || (a.owner !== spl.TOKEN_PROGRAM_ID.toBase58() && a.owner !== spl.TOKEN_2022_PROGRAM_ID.toBase58())) return null;
  const v = { decimals: a.data[44], program: a.owner };
  mem.mintInfo.set(mint, v);
  return v;
}

// ---------------- prices ----------------
const px = { sol: null, at: 0, dex: new Map() };
async function solUsd() {
  if (CFG.solUsd) return CFG.solUsd;
  if (px.sol && Date.now() - px.at < 60e3) return px.sol;
  const j = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const p = j && j.data ? Number(j.data.amount) : null;
  if (p > 0) { px.sol = p; px.at = Date.now(); }
  return px.sol;
}
/// Dexscreener: the token's deepest SOL pair → { name, symbol, priceUsd, priceSol, change24h, liqUsd, vol24h, pair, dex, image }
async function dexInfo(mints) {
  const out = {}, need = [];
  for (const m of mints) { const c = px.dex.get(m); if (c && Date.now() - c.at < 30e3) out[m] = c.v; else need.push(m); }
  if (!need.length) return out;
  const got = CFG.dex ? await CFG.dex(need) : {};
  if (!CFG.dex) {
    for (let i = 0; i < need.length; i += 30) {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${need.slice(i, i + 30).join(",")}`, { signal: AbortSignal.timeout(6000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      for (const p of Array.isArray(r) ? r : []) {
        const m = p && p.baseToken && p.baseToken.address;
        if (!m || !(p.quoteToken && p.quoteToken.address === WSOL)) continue;
        const liq = (p.liquidity && p.liquidity.usd) || 0;
        if (got[m] && got[m].liqUsd >= liq) continue;
        got[m] = { name: p.baseToken.name || "", symbol: p.baseToken.symbol || "", priceUsd: Number(p.priceUsd) || null, priceSol: Number(p.priceNative) || null,
          change24h: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null, liqUsd: liq, vol24h: (p.volume && p.volume.h24) || 0,
          pair: p.pairAddress, dex: p.dexId, image: (p.info && p.info.imageUrl) || "" };
      }
    }
  }
  for (const m of need) { out[m] = got[m] || null; px.dex.set(m, { v: out[m], at: Date.now() }); }
  return out;
}

/// an order's price in SOL per token and its sizes, for the book and the page
function view(o, dec, feeBps) {
  const t = 10 ** dec;
  const buy = o.side === 0;
  const amountIn = Number(o.amountIn), minOut = Number(o.minOut);
  const tokens = buy ? minOut / t : amountIn / t;
  const sol = buy ? (amountIn * (1 - feeBps / 10000)) / LAMPORTS : minOut / LAMPORTS;
  return { address: o.address, owner: o.owner, side: buy ? "buy" : "sell", mint: o.mint, amountIn: String(o.amountIn), minOut: String(o.minOut), tokens, sol, price: tokens > 0 ? sol / tokens : null, expiry: o.expiry, created: o.created, nonce: String(o.nonce) };
}

// ---------------- reads ----------------
export async function status({ store = null } = {}) {
  const o = O();
  const cfg = o ? await config().catch(() => null) : null;
  let keeper = null;
  const kp = keeperKp();
  if (kp) { const [a] = await accounts([kp.publicKey.toBase58()]).catch(() => [null]); keeper = { address: kp.publicKey.toBase58(), sol: a ? a.lamports / LAMPORTS : 0 }; }
  let last = mem.lastTick;
  if (!last && store) { const d = await store.get("orderssol/tick").catch(() => null); last = d || null; }
  return { live: !!(o && cfg), program: o ? o.PROGRAM.toBase58() : null, config: cfg ? { ...cfg, maxIn: String(cfg.maxIn) } : null, keeper, jupiter: !!CFG.jupKey(), lastTick: last, at: Date.now() };
}
export async function book(mint) {
  if (!isKey(mint)) return null;
  const [mi, cfg, info, sol] = await Promise.all([mintInfo(mint), config().catch(() => null), dexInfo([mint]).catch(() => ({})), solUsd()]);
  if (!mi) return { error: "not a token on Solana" };
  const feeBps = cfg ? cfg.feeBps : 10;
  const orders = cfg ? (await openOrders({ mint }).catch(() => [])).map((x) => view(x, mi.decimals, feeBps)) : [];
  const lvl = (side) => {
    const m = new Map();
    for (const x of orders.filter((y) => y.side === side && y.price)) { const k = Number(x.price.toPrecision(4)); const v = m.get(k) || { price: k, tokens: 0, sol: 0, n: 0 }; v.tokens += x.tokens; v.sol += x.sol; v.n++; m.set(k, v); }
    return [...m.values()].sort((a, b) => (side === "buy" ? b.price - a.price : a.price - b.price)).slice(0, 12);
  };
  const d = info[mint] || {};
  return { mint, decimals: mi.decimals, tokenProgram: mi.program, name: d.name || "", symbol: d.symbol || "", image: d.image || "", priceSol: d.priceSol || null, priceUsd: d.priceUsd || null, solUsd: sol || null,
    change24h: d.change24h, liqUsd: d.liqUsd || null, vol24h: d.vol24h || null, pair: d.pair || null, dex: d.dex || null,
    bids: lvl("buy"), asks: lvl("sell"), open: orders.length, feeBps, live: !!cfg, at: Date.now() };
}
export async function mine(wallet, { store = null } = {}) {
  if (!isKey(wallet)) return null;
  const cfg = await config().catch(() => null);
  const open = cfg ? await openOrders({ owner: wallet }).catch(() => []) : [];
  const decs = new Map();
  for (const x of open) if (!decs.has(x.mint)) decs.set(x.mint, (await mintInfo(x.mint).catch(() => null)) || { decimals: 6 });
  const info = await dexInfo([...decs.keys()]).catch(() => ({}));
  let hist = [];
  if (store) { const d = await store.get(`orderssol/hist_${wallet}`).catch(() => null); hist = (d && d.items) || []; }
  return { wallet, open: open.map((x) => ({ ...view(x, decs.get(x.mint).decimals, cfg ? cfg.feeBps : 10), symbol: (info[x.mint] || {}).symbol || "" })), history: hist.slice(0, 50) };
}
export async function markets({ store = null } = {}) {
  const cfg = await config().catch(() => null);
  const all = cfg ? await openOrders().catch(() => []) : [];
  const count = new Map();
  for (const x of all) count.set(x.mint, (count.get(x.mint) || 0) + 1);
  let pump = [];
  try { const P = await import("./_pump-arcpad.mjs"); const v = await P.list({ store }); pump = (v.items || []).filter((x) => x.active !== false).map((x) => x.mint); } catch { /* none */ }
  const mints = [...new Set([...count.keys(), ...pump])].slice(0, 40);
  const info = await dexInfo(mints).catch(() => ({}));
  return { markets: mints.map((m) => ({ mint: m, open: count.get(m) || 0, arcpad: pump.includes(m), ...(info[m] || {}) })), live: !!cfg };
}

// ---------------- Jupiter ----------------
async function jup(path, init) {
  if (CFG.jupFetch) return CFG.jupFetch(path, init);
  const key = CFG.jupKey();
  if (!key) throw Object.assign(new Error("Jupiter isn't set up (JUPITER_API_KEY)"), { status: 503 });
  const r = await fetch(CFG.jup + path, { ...(init || {}), headers: { "content-type": "application/json", "x-api-key": key, ...((init && init.headers) || {}) }, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw Object.assign(new Error((j && (j.error || j.message)) || `Jupiter ${r.status}`), { status: r.status >= 500 ? 502 : 400 });
  return j;
}
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

/// POST {action:"solswap", wallet, mint, side:"buy"|"sell", amount (raw: lamports to spend, or token units to sell), slippageBps}
export async function swapTx(b) {
  const wallet = String(b.wallet || ""), mint = String(b.mint || ""), side = b.side === "sell" ? "sell" : "buy";
  if (!isKey(wallet) || !isKey(mint) || mint === WSOL) return { status: 400, body: { error: "wallet and mint are needed" } };
  let amount; try { amount = BigInt(String(b.amount || "0")); } catch { amount = 0n; }
  if (amount <= 0n) return { status: 400, body: { error: "the amount must be above zero" } };
  const slip = Math.max(10, Math.min(1500, Number(b.slippageBps) || 100));
  const cfg = await config().catch(() => null);
  if (!cfg) return { status: 503, body: { error: "ARCIRCLE Orders on Solana isn't live yet" } };
  if (side === "buy" && cfg.maxIn > 0n && amount > cfg.maxIn) return { status: 400, body: { error: "above the per-order cap", maxIn: String(cfg.maxIn) } };
  const q = await jup(`/quote?${qs({ inputMint: side === "buy" ? WSOL : mint, outputMint: side === "buy" ? mint : WSOL, amount: amount.toString(), slippageBps: slip, platformFeeBps: cfg.feeBps, swapMode: "ExactIn" })}`);
  const s = await jup("/swap", { method: "POST", body: JSON.stringify({ quoteResponse: q, userPublicKey: wallet, wrapAndUnwrapSol: true, feeAccount: cfg.treasuryWsol, dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: "medium" } } }) });
  return { status: 200, body: { ok: true, tx: s.swapTransaction, lastValidBlockHeight: s.lastValidBlockHeight, inAmount: q.inAmount, outAmount: q.outAmount, minOut: q.otherAmountThreshold, priceImpactPct: q.priceImpactPct, feeBps: cfg.feeBps, route: (q.routePlan || []).map((r) => r.swapInfo && r.swapInfo.label).filter(Boolean).slice(0, 4) } };
}

// ---------------- the keeper ----------------
function keeperKp() {
  const k = CFG.keeperKey();
  if (!k) return null;
  try {
    if (k.startsWith("[")) return web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(k)));
    const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n; for (const c of k) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
    const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
    for (const c of k) { if (c !== "1") break; bytes.unshift(0); }
    return bytes.length === 64 ? web3.Keypair.fromSecretKey(Uint8Array.from(bytes)) : null;
  } catch { return null; }
}
const toIx = (x) => new web3.TransactionInstruction({ programId: new web3.PublicKey(x.programId), keys: x.accounts.map((a) => ({ pubkey: new web3.PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })), data: Buffer.from(x.data, "base64") });
async function alts(keys) {
  if (!keys || !keys.length) return [];
  const accs = await accounts(keys);
  return accs.map((a, i) => (a ? new web3.AddressLookupTableAccount({ key: new web3.PublicKey(keys[i]), state: web3.AddressLookupTableAccount.deserialize(a.data) }) : null)).filter(Boolean);
}
const mulBps = (v, bps) => (v * BigInt(bps)) / 10000n;

/// one order → a signed fill (or why not)
async function buildFill(o, cfg, kp) {
  const P = O(), K = kp.publicKey;
  const mi = await mintInfo(o.mint);
  if (!mi) return { skip: "mint" };
  const TP = new web3.PublicKey(mi.program), mint = new web3.PublicKey(o.mint), owner = new web3.PublicKey(o.owner);
  const buy = o.side === 0;
  const fee = buy ? mulBps(o.amountIn, cfg.feeBps) : mulBps(o.minOut, cfg.feeBps);
  const swapIn = buy ? o.amountIn - fee : o.amountIn;
  const q = await jup(`/quote?${qs({ inputMint: buy ? WSOL : o.mint, outputMint: buy ? o.mint : WSOL, amount: swapIn.toString(), slippageBps: CFG.slippageBps, swapMode: "ExactIn", maxAccounts: 30 })}`);
  const floor = BigInt(q.otherAmountThreshold || "0");
  // the price check: Jupiter's guaranteed output against the order
  const payout = buy ? floor : floor - fee;
  if (payout < o.minOut) return { skip: "price", have: payout.toString(), want: o.minOut.toString() };
  const source = spl.getAssociatedTokenAddressSync(buy ? spl.NATIVE_MINT : mint, owner, true, buy ? spl.TOKEN_PROGRAM_ID : TP);
  const ownerAta = spl.getAssociatedTokenAddressSync(mint, owner, true, TP);
  const fillerIn = spl.getAssociatedTokenAddressSync(buy ? spl.NATIVE_MINT : mint, K, true, buy ? spl.TOKEN_PROGRAM_ID : TP);
  const si = await jup("/swap-instructions", { method: "POST", body: JSON.stringify(buy
    ? { quoteResponse: q, userPublicKey: K.toBase58(), wrapAndUnwrapSol: false, destinationTokenAccount: ownerAta.toBase58(), dynamicComputeUnitLimit: false }
    : { quoteResponse: q, userPublicKey: K.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: false }) });
  const order = new web3.PublicKey(o.address), treasury = new web3.PublicKey(cfg.treasury), treasuryWsol = new web3.PublicKey(cfg.treasuryWsol);
  const ixs = [
    web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 700000 }), web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CFG.cuPrice }),
    spl.createAssociatedTokenAccountIdempotentInstruction(K, fillerIn, K, buy ? spl.NATIVE_MINT : mint, buy ? spl.TOKEN_PROGRAM_ID : TP),
    ...(buy ? [spl.createAssociatedTokenAccountIdempotentInstruction(K, ownerAta, owner, mint, TP)] : []),
    P.fillStart({ filler: K, order, inMint: buy ? spl.NATIVE_MINT : mint, outMint: buy ? mint : spl.NATIVE_MINT, source, fillerIn, treasuryWsol, treasury, ownerDest: buy ? ownerAta : owner, tokenProgram: buy ? spl.TOKEN_PROGRAM_ID : TP }),
    ...(si.setupInstructions || []).map(toIx), toIx(si.swapInstruction), ...(si.cleanupInstruction ? [toIx(si.cleanupInstruction)] : []),
    ...(buy ? [] : [web3.SystemProgram.transfer({ fromPubkey: K, toPubkey: owner, lamports: payout }), ...(fee > 0n ? [web3.SystemProgram.transfer({ fromPubkey: K, toPubkey: treasury, lamports: fee })] : [])]),
    P.fillEnd({ filler: K, order, owner, ownerDest: buy ? ownerAta : owner, treasury }),
  ];
  const lt = await alts(si.addressLookupTableAddresses || []);
  const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const msg = new web3.TransactionMessage({ payerKey: K, recentBlockhash: bh.value.blockhash, instructions: ixs }).compileToV0Message(lt);
  const tx = new web3.VersionedTransaction(msg);
  tx.sign([kp]);
  let raw; try { raw = tx.serialize(); } catch { return { skip: "size" }; }
  if (raw.length > 1232) return { skip: "size" };
  return { raw, payout, fee, out: q.outAmount, lastValid: bh.value.lastValidBlockHeight, sig: Buffer.from(tx.signatures[0]) };
}
const b58 = (bytes) => { const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x !== 0) break; s = "1" + s; } return s; };
async function sendRaw(raw, lastValid) {
  const sim = await rpc("simulateTransaction", [Buffer.from(raw).toString("base64"), { encoding: "base64", sigVerify: false, commitment: "confirmed", replaceRecentBlockhash: false }]);
  if (sim && sim.value && sim.value.err) return { error: "simulation", logs: (sim.value.logs || []).slice(-8) };
  const sig = await rpc("sendTransaction", [Buffer.from(raw).toString("base64"), { encoding: "base64", skipPreflight: true, maxRetries: 3 }]);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 800 : 1500));
    const st = await rpc("getSignatureStatuses", [[sig]]).then((r) => r && r.value && r.value[0]).catch(() => null);
    if (st && st.err) return { error: "failed", sig, err: st.err };
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return { sig };
    if (i % 4 === 3) { const h = await rpc("getBlockHeight", [{ commitment: "confirmed" }]).catch(() => null); if (h != null && h > lastValid) return { error: "expired", sig }; }
  }
  return { error: "unconfirmed", sig };
}
async function noteFill(store, o, r, sym) {
  if (!store) return;
  const key = `orderssol/hist_${o.owner}`;
  const d = (await store.get(key).catch(() => null)) || { items: [] };
  d.items.unshift({ at: Math.floor(Date.now() / 1000), order: o.address, side: o.side === 0 ? "buy" : "sell", mint: o.mint, symbol: sym || "", amountIn: String(o.amountIn), minOut: String(o.minOut), got: String(r.got || ""), sig: r.sig });
  d.items = d.items.slice(0, 100);
  await store.set(key, d).catch(() => null);
}

export async function tick(store, { budgetMs = 40000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const kp = keeperKp(), P = O();
  const out = { at: Math.floor(Date.now() / 1000), filled: [], skipped: {}, closed: [], errors: [] };
  if (!P) return { ...out, idle: "no program (ORDERS_SOL_PROGRAM)" };
  if (!kp) return { ...out, idle: "no keeper key (ORDERS_KEEPER_SOL_KEY)" };
  const cfg = await config(true);
  if (!cfg) return { ...out, idle: "the program isn't set up (init_config)" };
  if (cfg.paused) return { ...out, idle: "paused" };
  if (cfg.keeper !== web3.PublicKey.default.toBase58() && cfg.keeper !== kp.publicKey.toBase58()) return { ...out, idle: "this key isn't the program's keeper" };
  const now = Math.floor(Date.now() / 1000);
  const all = await openOrders();
  out.open = all.length;
  // expired orders: closed, their rent back to the owners
  for (const o of all.filter((x) => x.expiry && x.expiry <= now).slice(0, 4)) {
    if (left() < 8000) break;
    try {
      const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
      const tx = new web3.Transaction({ feePayer: kp.publicKey, recentBlockhash: bh.value.blockhash }).add(P.closeExpired({ caller: kp.publicKey, owner: o.owner, order: o.address }));
      tx.sign(kp);
      const r = await sendRaw(tx.serialize(), bh.value.lastValidBlockHeight);
      if (r.sig && !r.error) out.closed.push(o.address); else out.errors.push({ order: o.address, close: r.error });
    } catch (e) { out.errors.push({ order: o.address, close: String(e.message || e).slice(0, 120) }); }
  }
  // live orders, oldest first: the owner's balance and approval still have to cover them
  const live = all.filter((x) => !x.expiry || x.expiry > now).sort((a, b) => a.created - b.created);
  const srcKeys = await Promise.all(live.map(async (o) => { const mi = await mintInfo(o.mint).catch(() => null); if (!mi) return null; return spl.getAssociatedTokenAddressSync(o.side === 0 ? spl.NATIVE_MINT : new web3.PublicKey(o.mint), new web3.PublicKey(o.owner), true, o.side === 0 ? spl.TOKEN_PROGRAM_ID : new web3.PublicKey(mi.program)).toBase58(); }));
  const srcs = await accounts(srcKeys.map((k) => k || P.configPda.toBase58())).catch(() => []);
  let tried = 0;
  for (let i = 0; i < live.length && tried < CFG.perTick && left() > 9000; i++) {
    const o = live[i], a = srcs[i];
    let ok = false;
    try {
      if (a && srcKeys[i]) {
        const acc = spl.unpackAccount(new web3.PublicKey(srcKeys[i]), { ...a, owner: new web3.PublicKey(a.owner), data: a.data, executable: false }, new web3.PublicKey(a.owner));
        ok = acc.amount >= o.amountIn && acc.delegate && acc.delegate.equals(P.authPda) && acc.delegatedAmount >= o.amountIn;
      }
    } catch { ok = false; }
    if (!ok) { out.skipped.unfunded = (out.skipped.unfunded || 0) + 1; continue; }
    tried++;
    try {
      const f = await buildFill(o, cfg, kp);
      if (f.skip) { out.skipped[f.skip] = (out.skipped[f.skip] || 0) + 1; continue; }
      const r = await sendRaw(f.raw, f.lastValid);
      if (r.error) { out.errors.push({ order: o.address, error: r.error, logs: r.logs, err: r.err }); continue; }
      out.filled.push({ order: o.address, sig: r.sig, side: o.side === 0 ? "buy" : "sell" });
      const sym = ((await dexInfo([o.mint]).catch(() => ({})))[o.mint] || {}).symbol;
      await noteFill(store, o, { sig: r.sig, got: o.side === 0 ? f.out : f.payout }, sym);
    } catch (e) { out.errors.push({ order: o.address, error: String(e.message || e).slice(0, 160) }); }
  }
  mem.lastTick = { at: out.at, open: out.open, filled: out.filled.length };
  if (store) await store.set("orderssol/tick", mem.lastTick).catch(() => null);
  return out;
}

export const _test = { view, keeperKp, openOrders, config, buildFill, mem };
