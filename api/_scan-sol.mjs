// api/_scan-sol.mjs — Token Scanner v4 on Solana (served at /api/scan?sol=<mint>; drawn by arc-scanner.js).
//
// A Solana token isn't a contract of its own: it's a mint account run by the SPL Token (or Token-2022)
// program, so the questions are different from Arc's. This reads, in parallel:
//   • the mint (jsonParsed): who can still mint, who can freeze wallets, the supply, and Token-2022
//     extensions (transfer fee, transfer hook, permanent delegate, non-transferable, frozen by default)
//   • its metadata (Metaplex, or Token-2022's own): name, ticker, and whether they can still be changed
//   • pump.fun's bonding curve for it, when there is one: how far to graduation, and the creator
//   • the 20 largest token accounts and who owns them (the curve, a pool, a program, the creator, a wallet)
//   • Dexscreener: price, liquidity, age, buys and sells, links
//   • Jupiter: can 0.01%, 0.1% and 1% of the supply be sold, and how far would each move the price
// then scores it with the same verdicts as Arc (75+ Looks OK, 45–74 Be careful, below 45 High risk);
// any critical flag caps the score at 44. Nothing is signed or sent.
import { web3 } from "./_solkit.mjs";
import { verdictOf, ageText, pct as pctText, usd as usdText, compact as compactText } from "./_scan-core.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
export const SOL_VERSION = 1;
export const CFG = {
  rpcs: () => [env("SOLANA_RPC_URL"), "https://api.mainnet-beta.solana.com"].filter(Boolean),
  rpc: null, // tests: (method, params) => result
  get: null, // tests: (url) => json | null
};
export function configure(o) { Object.assign(CFG, o); mem.clear(); }

const PROGRAM = { token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", token22: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  pump: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", meta: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s" };
const WSOL = "So11111111111111111111111111111111111111112";
// vault owners of the big AMMs (their pools hold tokens through these authorities)
const AMM_AUTH = new Set(["5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL", "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh"]);
const BURN = new Set(["1nc1nerator11111111111111111111111111111111"]);
const PUMP_START = 793100000000000n; // tokens for sale on a fresh pump.fun curve (793.1M, 6 decimals)

export const isMint = (s) => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || "")) && new web3.PublicKey(s).toBytes().length === 32; } catch { return false; } };
const pk = (s) => new web3.PublicKey(s);
const onCurve = (s) => { try { return web3.PublicKey.isOnCurve(pk(s).toBytes()); } catch { return true; } };

// ---------------- reads ----------------
async function rpc(method, params) {
  if (CFG.rpc) return CFG.rpc(method, params);
  let last = null;
  for (const u of CFG.rpcs()) {
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
      const j = await r.json().catch(() => null);
      if (j && j.error) { last = new Error(String(j.error.message || "rpc error")); if (r.status === 429 || /rate|limit/i.test(last.message)) continue; throw last; }
      if (j && "result" in j) return j.result;
      last = new Error(`rpc ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last || new Error("no Solana RPC");
}
async function getJson(url, init) {
  if (CFG.get) return CFG.get(url, init);
  try { const r = await fetch(url, { ...(init || {}), signal: AbortSignal.timeout(9000) }); const j = await r.json().catch(() => null); return r.ok ? j : j && typeof j === "object" ? { ...j, _status: r.status } : { _status: r.status }; } catch { return null; }
}
const b64 = (d) => Buffer.from(Array.isArray(d) ? d[0] : String(d || ""), "base64");
const u64 = (b, o) => (b.length >= o + 8 ? b.readBigUInt64LE(o) : 0n);
function borshStr(b, o) { const n = b.readUInt32LE(o); return [b.slice(o + 4, o + 4 + n).toString("utf8").replace(/\0+$/, "").trim(), o + 4 + n]; }

/// Metaplex metadata: name, ticker, uri, and whether it can still be changed.
function parseMeta(b) {
  try {
    const update = new web3.PublicKey(b.slice(1, 33)).toBase58();
    let o = 65, name, symbol, uri;
    [name, o] = borshStr(b, o); [symbol, o] = borshStr(b, o); [uri, o] = borshStr(b, o);
    o += 2; // seller fee
    if (b[o] === 1) { const n = b.readUInt32LE(o + 1); o += 1 + 4 + n * 34; } else o += 1;
    o += 1; // primary sale happened
    const mutable = b[o] === 1;
    return { name, symbol, uri, update, mutable };
  } catch { return null; }
}
/// pump.fun's bonding curve account for a mint
function parseCurve(b) {
  if (!b || b.length < 49) return null;
  const real = u64(b, 24), complete = b[48] === 1;
  const progress = complete ? 100 : Math.max(0, Math.min(100, Number((PUMP_START - (real > PUMP_START ? PUMP_START : real)) * 10000n / PUMP_START) / 100));
  return { complete, progress, solRaised: Number(u64(b, 32)) / 1e9, creator: b.length >= 81 ? new web3.PublicKey(b.slice(49, 81)).toBase58() : null };
}

export async function readSol(mint) {
  const M = pk(mint);
  const [curvePda] = web3.PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), M.toBuffer()], pk(PROGRAM.pump));
  const [metaPda] = web3.PublicKey.findProgramAddressSync([Buffer.from("metadata"), pk(PROGRAM.meta).toBuffer(), M.toBuffer()], pk(PROGRAM.meta));
  const got = {};
  const mintP = rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]).then((r) => { got.mint = r && r.value; }, () => { got.mintErr = true; });
  const sideP = rpc("getMultipleAccounts", [[curvePda.toBase58(), metaPda.toBase58()], { encoding: "base64", commitment: "confirmed" }])
    .then((r) => { const [c, m] = (r && r.value) || []; got.curve = c ? parseCurve(b64(c.data)) : null; got.meta = m ? parseMeta(b64(m.data)) : null; }, () => { got.sideErr = true; });
  const bigP = rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]).then((r) => { got.big = (r && r.value) || []; }, () => { got.bigErr = true; });
  const dexP = getJson(`https://api.dexscreener.com/tokens/v1/solana/${mint}`).then((j) => { got.dex = Array.isArray(j) ? j : j && Array.isArray(j.pairs) ? j.pairs : null; });
  await Promise.all([mintP, sideP, bigP, dexP]);
  const v = got.mint;
  if (!v) return { mint, notMint: !got.mintErr, error: got.mintErr ? "rpc" : null };
  const prog = v.owner;
  const info = v.data && v.data.parsed && v.data.parsed.type === "mint" ? v.data.parsed.info : null;
  if (!info || (prog !== PROGRAM.token && prog !== PROGRAM.token22)) return { mint, notMint: true };
  // who owns the largest accounts
  let holders = null;
  if (got.big) {
    const accs = await rpc("getMultipleAccounts", [got.big.map((x) => x.address), { encoding: "jsonParsed", commitment: "confirmed" }]).then((r) => (r && r.value) || [], () => []);
    holders = got.big.map((x, i) => { const a = accs[i]; const owner = a && a.data && a.data.parsed && a.data.parsed.info ? a.data.parsed.info.owner : null; return { account: x.address, owner, amount: String(x.amount) }; });
  }
  return { mint, program: prog === PROGRAM.token22 ? "token22" : "token", info, curve: got.curve || null, curvePda: curvePda.toBase58(), meta: got.meta || null, holders, dex: got.dex, at: Date.now() };
}

/// Jupiter: sell 0.01%, 0.1% and 1% of the supply for SOL — is there a route, and how far does it move the price?
export async function sellQuotes(mint, supplyRaw) {
  const key = env("JUPITER_API_KEY"), base = key ? "https://api.jup.ag/swap/v1" : "https://lite-api.jup.ag/swap/v1";
  const S = BigInt(supplyRaw || "0");
  const sizes = [["small", 1n], ["mid", 10n], ["large", 100n]]; // basis points ×0.01 → 0.01%, 0.1%, 1%
  return Promise.all(sizes.map(async ([k, bps]) => {
    const amt = (S * bps) / 10000n;
    if (amt <= 0n) return { k, ok: null };
    const j = await getJson(`${base}/quote?inputMint=${mint}&outputMint=${WSOL}&amount=${amt}&slippageBps=500&restrictIntermediateTokens=true`, key ? { headers: { "x-api-key": key } } : undefined);
    if (!j || j._status >= 500 || j._status === 429) return { k, ok: null };
    if (j.outAmount && Number(j.outAmount) > 0) return { k, ok: true, impact: Math.abs(Number(j.priceImpactPct || 0)) * 100, out: Number(j.outAmount) / 1e9, via: [...new Set((j.routePlan || []).map((r) => r.swapInfo && r.swapInfo.label).filter(Boolean))].slice(0, 2) };
    return { k, ok: false, why: String(j.error || j.errorCode || "no route").slice(0, 80) };
  }));
}

// ---------------- the score ----------------
const W = { risk: 26, warn: 10, pass: 0, info: 0, unknown: 0 };
const SECTION_OF = { contract: "contract", control: "control", trade: "trade", market: "market", holders: "holders", early: "launch" };
const SECTIONS = [["contract", "Contract"], ["control", "Who controls it"], ["trade", "Trading"], ["market", "Market"], ["holders", "Holders"], ["launch", "Launch & history"]];
export const SOL_HELP = {
  solmint: "Whoever holds the mint authority can create new tokens at any time, which dilutes every holder. Most fair launches remove it.",
  solfreeze: "The freeze authority can freeze any holder's token account so it can't sell or send. A token with it set can trap buyers.",
  soldelegate: "A permanent delegate can move or burn tokens out of any wallet without asking — Token-2022 allows it.",
  solhook: "A transfer hook runs another program on every transfer. That program can be changed to block sells.",
  solfee: "Token-2022 can take a fee on every transfer, paid to whoever holds the withdraw authority.",
  solfrozen: "New token accounts start frozen, so new buyers can't move their tokens until someone unfreezes them.",
  solnontransfer: "Non-transferable tokens can't be sent or sold at all.",
  solmeta: "If the metadata can still be changed, the name, ticker and logo can be swapped later — a trick used to imitate other tokens.",
  solprog: "Token-2022 is the newer token program. It's not bad in itself, but its extensions can add fees or controls the old one doesn't have.",
  solsell: "Jupiter, Solana's main swap router, was asked for a price to sell part of the supply. No route can mean nobody can sell.",
  solimpact: "How far one sell of 1% of the supply would push the price down, by Jupiter's quote.",
  solcurve: "pump.fun tokens start on a bonding curve and move to a real pool (PumpSwap or Raydium) once enough SOL is raised.",
  solliq: "Liquidity is how much money sits in the pool. Thin pools move a lot on small trades.",
  solage: "New pools have little history, which is when most rug pulls happen.",
  solflow: "A token that is bought a lot but never sold is a classic sign that selling is blocked.",
  sollinks: "Legit projects usually list a website and social accounts.",
  soltop: "How much of the supply the 10 largest wallets hold, not counting pools, the bonding curve and program accounts.",
  solwhale: "One wallet holding a big share can crash the price by selling.",
  solcreator: "How much of the supply the wallet that created it on pump.fun still holds.",
};
function evaluateSol(d, quotes) {
  const rows = [];
  const add = (group, status, id, title, detail, more) => rows.push({ group, status, id, title, detail, pts: (more && more.pts != null ? more.pts : W[status]) || 0, src: (more && more.src) || "chain", ...(more || {}) });
  const info = d.info, dec = info.decimals, S = Number(BigInt(info.supply || "0")) / 10 ** dec;
  const ext = Object.fromEntries((info.extensions || []).map((e) => [e.extension, e.state || {}]));
  const dex = (d.dex || []).filter((p) => p && p.baseToken && p.baseToken.address === d.mint).sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const p0 = dex[0] || null;
  const missing = [];
  // ---- contract (the mint and its program) ----
  if (d.program === "token22") add("contract", "info", "solprog", "Token-2022 program", "It uses Solana's newer token program — its extensions are checked below.");
  else add("contract", "pass", "solprog", "Standard SPL token", "The classic token program, with no extensions.");
  const tf = ext.transferFeeConfig && (ext.transferFeeConfig.newerTransferFee || ext.transferFeeConfig.olderTransferFee);
  const feePct = tf ? Number(tf.transferFeeBasisPoints || 0) / 100 : 0;
  if (feePct > 0) add("contract", feePct >= 10 ? "risk" : "warn", "solfee", `A ${pctText(feePct)} fee on every transfer`, "Token-2022 takes it on each move, sells included.", feePct >= 25 ? { crit: true } : null);
  if (ext.transferHook && ext.transferHook.programId) add("contract", "risk", "solhook", "Runs a transfer hook", "Another program runs on every transfer — it can be changed to refuse sells.", { addr: ext.transferHook.programId });
  if ("nonTransferable" in ext) add("contract", "risk", "solnontransfer", "Can't be transferred", "Holders can't send or sell it.", { crit: true, pts: 60 });
  if (ext.defaultAccountState && /frozen/i.test(String(ext.defaultAccountState.accountState))) add("contract", "risk", "solfrozen", "New holders start frozen", "A new buyer's token account is frozen until someone thaws it.", { crit: true, pts: 40 });
  const tm = ext.tokenMetadata || null;
  const mutable = tm ? !!(tm.updateAuthority) : d.meta ? d.meta.mutable : null;
  if (mutable === true) add("contract", "warn", "solmeta", "Name and logo can still be changed", "Whoever holds the update authority can swap the name, ticker or logo.", { pts: 5, addr: tm ? tm.updateAuthority : d.meta.update });
  else if (mutable === false) add("contract", "pass", "solmeta", "Name and logo are locked", "The metadata can't be changed any more.");
  // ---- who controls it ----
  if (info.mintAuthority) add("control", "risk", "solmint", "A wallet can still mint", "New tokens can be created at any time.", { crit: true, pts: 35, addr: info.mintAuthority });
  else add("control", "pass", "solmint", "Nobody can mint more", "The mint authority is gone, so the supply is fixed.");
  if (info.freezeAuthority) add("control", "risk", "solfreeze", "A wallet can freeze holders", "It can freeze any token account so it can't sell.", { crit: true, pts: 35, addr: info.freezeAuthority });
  else add("control", "pass", "solfreeze", "Nobody can freeze wallets", "The freeze authority is gone.");
  if (ext.permanentDelegate && ext.permanentDelegate.delegate) add("control", "risk", "soldelegate", "One wallet can move anyone's tokens", "A permanent delegate can take or burn tokens from any wallet.", { crit: true, pts: 40, addr: ext.permanentDelegate.delegate });
  // ---- trading (Jupiter quotes) ----
  const q = quotes || [], small = q.find((x) => x.k === "small"), large = q.find((x) => x.k === "large");
  const anyRoute = q.some((x) => x.ok === true), allUnknown = !q.length || q.every((x) => x.ok == null);
  const curveOpen = d.curve && !d.curve.complete;
  if (allUnknown) { add("trade", "unknown", "solsell", "Couldn't ask for a sell price", "Jupiter didn't answer just now — try again.", { src: "jup" }); missing.push("sell"); }
  else if (anyRoute) add("trade", "pass", "solsell", "Selling works", `Jupiter found a route to sell${small && small.ok && small.via && small.via.length ? ` (${small.via.join(", ")})` : ""}.`, { src: "jup" });
  else if (curveOpen) add("trade", "info", "solsell", "Sells go through pump.fun's curve", "Jupiter has no route yet; on the bonding curve, sells are made on pump.fun.", { src: "jup" });
  else add("trade", "risk", "solsell", "No route to sell", "Jupiter couldn't find any way to sell it for SOL.", { crit: !!(p0 && p0.liquidity && p0.liquidity.usd > 0), pts: 40, src: "jup" });
  if (large && large.ok) {
    const im = large.impact;
    add("trade", im > 50 ? "risk" : im > 20 ? "warn" : "pass", "solimpact", im > 20 ? `Selling 1% of the supply moves the price −${pctText(im)}` : "Bigger sells hold up", `One sell of 1% of the supply: about −${pctText(im)} on the price.`, { src: "jup", pts: im > 50 ? 15 : im > 20 ? 6 : 0 });
  } else if (small && small.ok && large && large.ok === false) add("trade", "warn", "solimpact", "Big sells find no route", "Small sells route, 1% of the supply doesn't.", { src: "jup" });
  // ---- market ----
  if (d.curve) {
    if (d.curve.complete) add("market", "pass", "solcurve", "Graduated from pump.fun", `It left the bonding curve${p0 ? ` and trades on ${p0.dexId}` : ""}.`, { src: "chain" });
    else add("market", "info", "solcurve", `On pump.fun's curve — ${pctText(d.curve.progress)} to graduation`, `${d.curve.solRaised.toFixed(2)} SOL raised so far.`, { src: "chain" });
  }
  if (p0) {
    const liq = p0.liquidity && p0.liquidity.usd;
    if (liq != null) add("market", liq < 1000 ? "risk" : liq < 10000 ? "warn" : "pass", "solliq", liq < 1000 ? "Almost no liquidity" : liq < 10000 ? "Thin liquidity" : "Healthy liquidity", `${usdText(liq)} in its largest pool on ${p0.dexId}.`, { src: "dex", pts: liq < 1000 ? 20 : liq < 10000 ? 8 : 0 });
    const age = p0.pairCreatedAt ? (Date.now() - p0.pairCreatedAt) / 1000 : null;
    if (age != null) add("market", age < 3600 ? "warn" : "info", "solage", age < 3600 ? "Very new — under an hour old" : `Pool opened ${ageText(age)} ago`, "", { src: "dex", pts: age < 3600 ? 5 : 0 });
    const t = p0.txns && p0.txns.h24;
    if (t && t.buys > 20 && !t.sells) add("market", "risk", "solflow", "Nobody sold in the last day", `${t.buys} buys, 0 sells in 24 hours.`, { src: "dex", crit: true, pts: 25 });
    else if (t) add("market", "pass", "solflow", "People buy and sell", `${t.buys} buys, ${t.sells} sells in 24 hours.`, { src: "dex" });
    const links = [...((p0.info && p0.info.websites) || []).map((x) => x.url), ...((p0.info && p0.info.socials) || []).map((x) => x.url)].filter((u) => /^https:\/\//.test(u || ""));
    if (!links.length) add("market", "warn", "sollinks", "No website, X or Telegram", "None are listed for it on Dexscreener.", { src: "dex", pts: 4 });
    else add("market", "pass", "sollinks", "Has links", `${links.length} listed on Dexscreener.`, { src: "dex", links: links.slice(0, 3).map((u) => ({ label: u.replace(/^https:\/\/(www\.)?/, "").slice(0, 28), href: u })) });
  } else if (!d.curve) { add("market", "unknown", "solliq", "No pool found", "Dexscreener lists no pool for it yet.", { src: "dex" }); missing.push("market"); }
  // ---- holders ----
  let dist = null;
  if (d.holders && d.holders.length && S > 0) {
    const pools = new Set(dex.map((p) => p.pairAddress));
    const creator = d.curve && d.curve.creator;
    const people = d.holders.map((x) => {
      const share = (Number(BigInt(x.amount)) / 10 ** dec / S) * 100;
      const kind = !x.owner ? "unknown" : x.owner === d.curvePda ? "curve" : pools.has(x.owner) || AMM_AUTH.has(x.owner) ? "pool" : BURN.has(x.owner) ? "burn" : creator && x.owner === creator ? "creator" : !onCurve(x.owner) ? "program" : "wallet";
      return { owner: x.owner, account: x.account, pct: share, kind };
    }).filter((x) => x.pct > 0);
    const wallets = people.filter((x) => x.kind === "wallet" || x.kind === "creator");
    const top10 = wallets.slice(0, 10).reduce((t, x) => t + x.pct, 0);
    const inPools = people.filter((x) => x.kind === "pool" || x.kind === "curve" || x.kind === "program").reduce((t, x) => t + x.pct, 0);
    dist = { people: people.slice(0, 20), top10, inPools, creatorPct: people.filter((x) => x.kind === "creator").reduce((t, x) => t + x.pct, 0) };
    add("holders", top10 > 50 ? "risk" : top10 > 30 ? "warn" : "pass", "soltop", top10 > 30 ? "The top 10 wallets hold a lot" : "Spread across many wallets", `The 10 largest wallets hold ${pctText(top10)} (pools and the curve left out).`, { pts: top10 > 50 ? 20 : top10 > 30 ? 10 : 0 });
    const w1 = wallets[0];
    if (w1 && w1.pct > 10) add("holders", w1.pct > 20 ? "risk" : "warn", "solwhale", "One wallet holds a big share", `${pctText(w1.pct)} of the supply.`, { addr: w1.owner, pts: w1.pct > 20 ? 15 : 8 });
    if (creator) add("early", dist.creatorPct > 5 ? "warn" : "pass", "solcreator", dist.creatorPct > 5 ? "The creator still holds tokens" : "The creator holds little or none", `${pctText(dist.creatorPct)} of the supply in the creator's wallet.`, { addr: creator, pts: dist.creatorPct > 5 ? 5 : 0 });
  } else missing.push("holders");
  if (d.curve) add("early", "info", "solcurve", "Launched on pump.fun", "Created through pump.fun's bonding curve.");
  // ---- the score ----
  let score = Math.max(0, 100 - rows.reduce((t, r) => t + (r.status === "risk" || r.status === "warn" ? r.pts : 0), 0));
  const critical = rows.filter((r) => r.crit && r.status === "risk");
  let cap = 100;
  if (critical.length) { cap = 44; score = Math.min(score, cap); }
  const sub = {};
  for (const [k] of SECTIONS) {
    const rs = rows.filter((r) => SECTION_OF[r.group] === k);
    if (!rs.length) continue;
    const lost = rs.reduce((t, r) => t + (r.status === "risk" || r.status === "warn" ? r.pts : 0), 0);
    sub[k] = { score: rs.every((r) => r.status === "unknown") ? null : Math.max(0, 100 - lost * 1.6), risk: rs.filter((r) => r.status === "risk").length, warn: rs.filter((r) => r.status === "warn").length };
    if (sub[k].score != null) sub[k].score = Math.round(sub[k].score);
  }
  const order = { risk: 0, warn: 1, unknown: 2, pass: 3, info: 4 };
  const reasons = rows.filter((r) => r.status !== "info").slice().sort((a, b) => order[a.status] - order[b.status] || b.pts - a.pts).slice(0, 3).map((r) => ({ status: r.status, title: r.title }));
  const confidence = missing.length === 0 ? "high" : missing.length === 1 ? "medium" : "low";
  // plain words
  const summary = [];
  summary.push({ t: info.mintAuthority || info.freezeAuthority ? (info.mintAuthority && info.freezeAuthority ? "A wallet can still mint more and freeze holders." : info.mintAuthority ? "A wallet can still mint more." : "A wallet can still freeze holders.") : "Nobody can mint more or freeze wallets." });
  if (!allUnknown) summary.push({ t: anyRoute ? "Selling works through Jupiter." : curveOpen ? "It's still on pump.fun's curve." : "No route to sell was found." });
  if (p0 && p0.liquidity && p0.liquidity.usd != null) summary.push({ t: "{x} of liquidity in the pool.", x: usdText(p0.liquidity.usd) });
  if (dist) summary.push({ t: "The top 10 wallets hold {x}.", x: pctText(dist.top10) });
  const vk = verdictOf(score).k;
  summary.push({ t: vk === "ok" ? "Overall it looks OK — still only buy what you can lose." : vk === "care" ? "Overall: be careful." : "Overall: high risk." });
  const name = (tm && tm.name) || (d.meta && d.meta.name) || (p0 && p0.baseToken.name) || "";
  const symbol = (tm && tm.symbol) || (d.meta && d.meta.symbol) || (p0 && p0.baseToken.symbol) || "";
  const market = p0 ? { price: Number(p0.priceUsd) || null, mcap: p0.marketCap || p0.fdv || null, liq: p0.liquidity ? p0.liquidity.usd : null, vol: p0.volume ? p0.volume.h24 : null, buys: p0.txns && p0.txns.h24 ? p0.txns.h24.buys : null, sells: p0.txns && p0.txns.h24 ? p0.txns.h24.sells : null,
    created: p0.pairCreatedAt ? Math.floor(p0.pairCreatedAt / 1000) : null, change: p0.priceChange ? p0.priceChange.h24 : null, url: p0.url || null, dex: p0.dexId, image: (p0.info && p0.info.imageUrl) || null } : null;
  return { rows, score, cap, verdict: verdictOf(score), critical, reasons, confidence, missing, sub, summary, dist, market, name, symbol, decimals: dec, supply: S, quotes: q, curve: d.curve, program: d.program };
}

// ---------------- the public call ----------------
const mem = new Map();
/// → { mint, ok, name, symbol, score, verdict, … } — cached 3 minutes; { notMint } for other accounts
export async function scanSol(mint, { store = null } = {}) {
  if (!isMint(mint)) return { error: "That isn't a Solana token address." };
  const hit = mem.get(mint);
  if (hit && Date.now() - hit.at < 180e3) return hit;
  const d = await readSol(mint);
  if (d.notMint) return { mint, notMint: true, at: Date.now() };
  if (d.error) throw Object.assign(new Error("Couldn't read Solana right now — try again in a moment."), { status: 502 });
  const quotes = await sellQuotes(mint, d.info.supply).catch(() => []);
  const r = evaluateSol(d, quotes);
  const out = { mint, chain: "sol", v: SOL_VERSION, at: Date.now(), name: r.name, symbol: r.symbol, decimals: r.decimals, supply: r.supply, program: r.program,
    score: r.score, cap: r.cap, verdict: r.verdict, critical: r.critical.map((x) => ({ id: x.id, title: x.title })), reasons: r.reasons, confidence: r.confidence, missing: r.missing,
    sub: r.sub, summary: r.summary, rows: r.rows, market: r.market, dist: r.dist, curve: r.curve, quotes: r.quotes, help: SOL_HELP };
  // the score's history and drops, kept the same way as Arc's
  if (store) {
    try {
      const key = `scanScore/sol-${mint}`, prev = await store.get(key).catch(() => null), today = new Date().toISOString().slice(0, 10);
      out.hist = ((prev && prev.hist) || []).filter((x) => String(x).split("|")[0] !== today).concat([`${today}|${out.score}`]).slice(-60);
      out.prevScore = prev && prev.score != null ? prev.score : null;
      await store.set(key, { v: SOL_VERSION, score: out.score, k: out.verdict.k, t: out.verdict.t, sym: out.symbol, at: out.at, crit: out.critical.map((x) => x.title), hist: out.hist });
    } catch { /* best effort */ }
  }
  mem.set(mint, out);
  if (mem.size > 500) mem.delete(mem.keys().next().value);
  return out;
}
export { SECTIONS as SOL_SECTIONS };
export const _test = { evaluateSol, parseMeta, parseCurve, compactText };
