// api/_scan-pro.mjs — Token Scanner v3: the Plus / Pro tiers and the server-side extras.
//
// Tiers (what the page calls them):
//   Free  (P1) — every check, the score, the verdict, pre-buy, deployer, same-code. No login.
//   Plus  (P2) — sign in with a wallet; 3 free unlocks a day per wallet, then 1,000 $ARCIRCLE burned per unlock.
//   Pro   (P3) — sign in + one X post of a scan a day; 1 free unlock a day, then 2,000 $ARCIRCLE burned per unlock.
// An unlock is one tool × one subject (a token, a wallet, or "all") for 24 hours.
// Burns: the wallet sends $ARCIRCLE to 0x…dEaD itself; the server reads the receipt
// (sender, amount, recent) and marks the transaction used, so each burn unlocks once.
// While we test, every wallet gets the free daily unlocks; later they are planned
// for wallets holding 100,000 $ARCIRCLE (FREE_NEEDS_HOLD, not switched on).
//
// Extras served from here (api/scan.mjs routes them):
//   chartOf(token)        price + volume per hour from the pool's own Swap log, with events
//   approvalsOf(wallet)   token approvals a wallet has given (known spenders + its Approval log)
//   feedOf()              new pools on Arc (PoolManager Initialize) with their scanner scores
//   notes                 a project's own statement, signed by the owner / deployer / creator
//   reports               a scan frozen at a block (/scan-report/<id>, /api/v1/report/<id>)
//   hooks                 webhooks: owner / supply / liquidity / score changes, HMAC-signed
//   batch, search, take   many tokens at once; find by name (copycat warning); ARCIA's take
import { createHmac, timingSafeEqual } from "node:crypto";
import { rpcCall, getLogs, latestBlock, blockTs, pool, toQty, ethCalls, isAddr, pad, keccakHex, allPools, esc, SITE } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc, commit } from "./_store.mjs";
import { personalSigner } from "./_tg-lib.mjs";
import * as core from "./_scan-core.mjs";
import * as scanner from "./_scan.mjs";
import * as L from "./_liq-core.mjs";

const lc = (a) => String(a || "").toLowerCase();
const now = () => Math.floor(Date.now() / 1000);
const dayOf = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);
const strip = (h) => String(h || "").replace(/^0x/, "");
const DEAD = "0x000000000000000000000000000000000000dead";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ARCIRCLE = core.ADDR.arcircle;
export const store = () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], getMany: (ks) => getDocs(ks), set: (k, d) => setDoc(k, d) } : null);

// ================================================================ tiers
export const TIERS = { p2: { free: 3, burn: 1000 }, p3: { free: 1, burn: 2000 } };
export const FREE_NEEDS_HOLD = 100000; // planned: free daily unlocks only for wallets holding this much $ARCIRCLE (not enforced yet)
/// tool → tier. P1 tools aren't listed: they never need a login.
export const FEATURES = {
  stress: "p2", diff: "p2", chart: "p2", approvals: "p2", feed: "p2", note: "p2", report: "p2", alerts: "p2", linked: "p2", traders: "p2",
  search: "p3", embed: "p3", batch: "p3", webhook: "p3", take: "p3",
};
const secret = () => String(process.env.SCAN_SECRET || process.env.MINE_SECRET || process.env.CRON_SECRET || "").trim();
const hmac = (s) => createHmac("sha256", secret()).update(s).digest();
export const signInMessage = (w, t) => `ARCIRCLE Token Scanner\nSign in to use the Plus and Pro tools with this wallet. No transaction, nothing can move.\nWallet: ${lc(w)}\nTime: ${t}`;
export function signIn(w, t, sig) {
  if (!secret()) return { error: "Plus and Pro aren't switched on yet." };
  if (!isAddr(w)) return { error: "That isn't a wallet address." };
  if (!/^\d{10}$/.test(String(t)) || Math.abs(now() - Number(t)) > 600) return { error: "That signature is too old — sign again." };
  if (personalSigner(signInMessage(w, t), sig) !== lc(w)) return { error: "The signature doesn't match that wallet." };
  const exp = now() + 7 * 86400;
  return { token: `${lc(w)}.${exp}.${hmac(`scan|${lc(w)}|${exp}`).toString("hex").slice(0, 40)}`, exp };
}
export function session(token, w) {
  const [a, exp, mac] = String(token || "").split(".");
  if (!secret() || !isAddr(w) || lc(a) !== lc(w) || !/^\d+$/.test(exp || "") || Number(exp) < now() || !mac) return false;
  const want = Buffer.from(hmac(`scan|${lc(a)}|${exp}`).toString("hex").slice(0, 40)), got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
const subjOk = (s) => s === "all" || isAddr(s);
async function entDoc(w) {
  const k = `scanEnt/${lc(w)}`;
  const d = (await getDocs([k]))[k] || null;
  const today = dayOf();
  const out = d && typeof d === "object" ? { ...d } : {};
  if (out.day !== today) { out.day = today; out.p2 = 0; out.p3 = 0; }
  const t = now();
  out.unlocks = Object.fromEntries(Object.entries(out.unlocks || {}).filter(([, exp]) => Number(exp) > t));
  return out;
}
const saveEnt = (w, d) => commit([{ set: `scanEnt/${lc(w)}`, data: { ...d, w: lc(w) } }]);
function statusOf(d) {
  return {
    day: d.day, resetsAt: Math.floor(Date.parse(d.day + "T00:00:00Z") / 1000) + 86400,
    p2: { used: d.p2 || 0, free: TIERS.p2.free, left: Math.max(0, TIERS.p2.free - (d.p2 || 0)), burn: TIERS.p2.burn },
    p3: { used: d.p3 || 0, free: TIERS.p3.free, left: Math.max(0, TIERS.p3.free - (d.p3 || 0)), burn: TIERS.p3.burn, shared: d.shared === d.day },
    unlocks: Object.entries(d.unlocks || {}).map(([k, exp]) => { const [f, s] = k.split("|"); return { f, s, exp: Number(exp) }; }),
    holdNotice: FREE_NEEDS_HOLD,
  };
}
export async function status(w) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  return statusOf(await entDoc(w));
}
export async function access(w, f, subj) {
  if (!FEATURES[f]) return true;
  if (!isAddr(w) || !storeEnabled()) return false;
  const d = await entDoc(w);
  return Number((d.unlocks || {})[`${f}|${lc(subj)}`] || 0) > now();
}
/// The burn behind a paid unlock: $ARCIRCLE from this wallet to 0x…dEaD, at least `amount`, in the last 6 hours, used once.
export async function checkBurn(w, tx, amount) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(tx || ""))) return { error: "That isn't a transaction hash." };
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]).catch(() => null);
  if (!rc) return { error: "That transaction isn't on Arc yet — wait a few seconds and try again." };
  if (rc.status !== "0x1") return { error: "That transaction failed." };
  const want = BigInt(amount) * 10n ** 18n;
  let burned = 0n;
  for (const l of rc.logs || []) {
    if (lc(l.address) !== ARCIRCLE || lc(l.topics && l.topics[0]) !== TRANSFER || !l.topics[2]) continue;
    if ("0x" + strip(l.topics[1]).slice(24) !== lc(w) || "0x" + strip(l.topics[2]).slice(24) !== DEAD) continue;
    burned += BigInt(l.data || "0x0");
  }
  if (burned < want) return { error: `That transaction doesn't burn ${Number(amount).toLocaleString("en-US")} $ARCIRCLE from this wallet.` };
  const ts = await blockTs(parseInt(rc.blockNumber, 16)).catch(() => null);
  if (ts && now() - ts > 6 * 3600) return { error: "That burn is older than 6 hours — burn again to unlock." };
  const c = await commit([{ create: `scanBurn/${lc(tx)}`, data: { w: lc(w), amount: Number(amount), at: now() } }]);
  if (c.conflict) return { error: "That burn has already unlocked something." };
  return { ok: true };
}
/// Opens tool `f` for subject `subj` (a token, a wallet or "all") for 24 hours.
export async function unlock(w, f, subj, { burnTx = null } = {}) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const tier = FEATURES[f];
  if (!tier) return { ok: true, free: true };
  subj = lc(subj || "all");
  if (!subjOk(subj)) return { error: "Unlock a token, a wallet or all." };
  const d = await entDoc(w);
  const key = `${f}|${subj}`;
  if (Number(d.unlocks[key] || 0) > now()) return { ok: true, exp: Number(d.unlocks[key]), via: "active", status: statusOf(d) };
  const T = TIERS[tier];
  let via;
  if (burnTx) {
    const b = await checkBurn(w, burnTx, T.burn);
    if (b.error) return b;
    via = "burn";
  } else {
    if (tier === "p3" && d.shared !== d.day) return { need: "share", status: statusOf(d) };
    if ((d[tier] || 0) >= T.free) return { need: "burn", amount: T.burn, status: statusOf(d) };
    d[tier] = (d[tier] || 0) + 1;
    via = "free";
  }
  d.unlocks[key] = now() + 86400;
  await saveEnt(w, d);
  return { ok: true, exp: d.unlocks[key], via, status: statusOf(d) };
}
/// Pro's daily X post: a public post from the wallet's X account with its scan link (…/s/<token>?by=<wallet>).
export async function shareX(w, url, token) {
  if (!storeEnabled()) return { error: "Storage isn't set up yet." };
  const M = await import("./_mine.mjs");
  const ref = M.tweetIdOf(url);
  if (!ref) return { error: "Paste the link to your post (x.com/<you>/status/…)." };
  const docs = await getDocs([`scanTw/${ref.id}`, `scanXh/${lc(ref.handle)}`]);
  if (docs[`scanTw/${ref.id}`]) return { error: "That post has already been used." };
  const bound = docs[`scanXh/${lc(ref.handle)}`];
  if (bound && bound.w !== lc(w)) return { error: `@${ref.handle} is already linked to another wallet.` };
  const tw = await M.fetchTweet(ref.id);
  if (!tw) return { error: "Couldn't read that post. Is it public? Try again in a minute." };
  if (lc(tw.handle) !== lc(ref.handle)) return { error: "That link doesn't match the post's author." };
  if (tw.at && tw.at < now() - 2 * 86400) return { error: "That post is older than two days — write a new one." };
  const hay = [tw.text, ...(tw.urls || [])].join(" ").toLowerCase();
  const t = isAddr(token) ? lc(token) : null;
  const hasScan = t ? hay.includes(`/s/${t}`) : /\/s\/0x[0-9a-f]{40}/.test(hay);
  if (!hasScan || !hay.includes(lc(w))) return { error: "The post needs your scan link from the Share button — it has your wallet in it." };
  const d = await entDoc(w);
  d.shared = d.day; d.x = tw.handle;
  await commit([{ set: `scanEnt/${lc(w)}`, data: { ...d, w: lc(w) } }, { set: `scanTw/${ref.id}`, data: { w: lc(w), at: now() } }, { set: `scanXh/${lc(ref.handle)}`, data: { w: lc(w), at: now() } }]);
  return { ok: true, handle: tw.handle, status: statusOf(d) };
}
/// For routes: the wallet + session in a request, and whether tool f is open for subj.
export async function gate(q, f, subj) {
  const w = lc(q.w || q.wallet);
  if (!isAddr(w) || !session(q.s || q.session, w)) return { error: "Sign in with your wallet first.", need: "login", status: 401 };
  if (!(await access(w, f, subj))) return { error: "Unlock this tool first.", need: "unlock", f, tier: FEATURES[f], status: 402 };
  return { w };
}

// ================================================================ chart: price per hour from the pool's swaps
const T_SWAP = "0x" + strip(keccakHex(Buffer.from("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)").toString("hex")));
const T_INIT = "0x" + strip(keccakHex(Buffer.from("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)").toString("hex")));
const T_APPROVAL = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const T_P2_APPROVAL = "0x" + strip(keccakHex(Buffer.from("Approval(address,address,address,uint160,uint48)").toString("hex")));
const selOf = (sig) => "0x" + strip(keccakHex(Buffer.from(sig).toString("hex"))).slice(0, 8);
const QUOTES = new Set([L.ZERO_ADDR, core.ADDR.usdc]);
async function spbNow() {
  const latest = await latestBlock();
  let spb = 0.5;
  try { const back = Math.max(0, latest.number - 20000), ts = await blockTs(back); const m = (latest.ts - ts) / Math.max(1, latest.number - back); if (m > 0.05 && m < 20) spb = m; } catch { /* default */ }
  return { latest, spb };
}
async function decimalsOf(list) {
  const out = new Map();
  const erc = list.filter((a) => a !== L.ZERO_ADDR);
  const r = await ethCalls(erc.flatMap((a) => [{ to: a, data: "0x313ce567" }, { to: a, data: "0x95d89b41" }])).catch(() => []);
  erc.forEach((a, i) => { const d = r[2 * i]; let sym = ""; try { const h = strip(r[2 * i + 1]); if (h.length >= 128) { const off = Number(BigInt("0x" + h.slice(0, 64))) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2; sym = Buffer.from(h.slice(off + 64, off + 64 + len), "hex").toString("utf8"); } } catch { sym = ""; } out.set(a, { dec: d ? Number(BigInt(d)) : 18, sym }); });
  if (list.includes(L.ZERO_ADDR)) out.set(L.ZERO_ADDR, { dec: 18, sym: "USDC" });
  return out;
}
/// The token's USDC pools: from Dexscreener, its ArcPad launch and the Liquidity Manager's index.
async function poolsOf(token, st) {
  const ids = new Set();
  const [dex, arc, seen] = await Promise.all([
    core.readMarket(scanner.io, token).catch(() => null),
    allPools().then((ps) => ps.find((p) => lc(p.token) === token) || null).catch(() => null),
    st ? st.get(`lptok/${token}`).catch(() => null) : null,
  ]);
  const liqOf = new Map();
  for (const p of (dex && dex.pairs) || []) { const id = lc(p.pair); if (/^0x[0-9a-f]{64}$/.test(id)) { ids.add(id); liqOf.set(id, p.liq || 0); } }
  if (arc && arc.poolId) ids.add(lc(arc.poolId));
  for (const id of (seen && seen.pools) || []) if (/^0x[0-9a-f]{64}$/.test(lc(id))) ids.add(lc(id));
  const list = [...ids].slice(0, 8);
  if (!list.length) return [];
  const sel = selOf("poolKeys(bytes25)");
  const r = await ethCalls(list.map((id) => ({ to: L.LIQ_ADDR.positions, data: sel + strip(id).slice(0, 50).padEnd(64, "0") }))).catch(() => []);
  const out = [];
  let arcKey = null;
  if (arc && arc.poolId) {
    const rec = await core.readArcPad(scanner.io, token).catch(() => null);
    if (rec && rec.quote) { const q = lc(rec.quote); arcKey = q < token ? [q, token] : [token, q]; }
  }
  list.forEach((id, i) => {
    const h = strip(r[i]);
    let c0 = null, c1 = null;
    if (h.length >= 320) { c0 = "0x" + h.slice(24, 64); c1 = "0x" + h.slice(88, 128); }
    else if (arcKey && arc && lc(arc.poolId) === id) [c0, c1] = arcKey;
    if (!c0 || (c0 !== token && c1 !== token)) return;
    const quote = c0 === token ? c1 : c0;
    if (!QUOTES.has(quote)) return;
    out.push({ id, c0, c1, quote, liq: liqOf.get(id) || 0, arcpad: !!(arc && lc(arc.poolId) === id) });
  });
  return out.sort((a, b) => b.liq - a.liq || (b.arcpad ? 1 : 0) - (a.arcpad ? 1 : 0));
}
const HOUR = 3600, KEEP_H = 24 * 14;
export async function chartOf(token, { budgetMs = 8500 } = {}) {
  token = lc(token);
  if (!isAddr(token)) throw Object.assign(new Error("token must be an address"), { status: 400 });
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const st = store();
  const pools = await poolsOf(token, st);
  if (!pools.length) return { token, pool: null, points: [], note: "No USDC pool found for this token." };
  const P = pools[0];
  const meta = await decimalsOf([P.c0, P.c1]);
  const d0 = meta.get(P.c0).dec, d1 = meta.get(P.c1).dec, tokenIs0 = P.c0 === token, qDec = tokenIs0 ? d1 : d0;
  const key = `scanChart/${P.id}`;
  let doc = st ? await st.get(key).catch(() => null) : null;
  const { latest, spb } = await spbNow();
  const tsOf = (b) => latest.ts - (latest.number - b) * spb;
  if (!doc || !doc.hi) doc = { hi: Math.max(0, latest.number - Math.ceil((48 * HOUR) / spb)), lo: null, b: {} };
  if (doc.lo == null) doc.lo = doc.hi;
  const buckets = new Map(Object.entries(doc.b || {}).map(([h, v]) => [Number(h), v]));
  // each block's time: read at both ends of every range and interpolated in between
  const eat = (logs, [ra, rb, ta, tb]) => {
    const tsAt = (b) => (ta != null && tb != null ? (rb > ra ? ta + ((b - ra) * (tb - ta)) / (rb - ra) : ta) : tsOf(b));
    for (const l of logs) {
      const d = strip(l.data), w = (k) => d.slice(k * 64, (k + 1) * 64);
      const a0 = BigInt.asIntN(128, BigInt("0x" + w(0))), a1 = BigInt.asIntN(128, BigInt("0x" + w(1)));
      const sqrtP = BigInt("0x" + w(2));
      const price = L.priceOf(sqrtP, tokenIs0, d0, d1);
      if (!(price > 0) || !isFinite(price)) continue;
      const qAmt = Number(tokenIs0 ? (a1 < 0n ? -a1 : a1) : (a0 < 0n ? -a0 : a0)) / 10 ** qDec;
      const b = parseInt(l.blockNumber, 16), h = Math.floor(tsAt(b) / HOUR) * HOUR;
      // amount0 < 0 means the pool paid out currency0: a buy of the token when the token is currency0
      const buy = tokenIs0 ? a0 < 0n : a1 < 0n;
      const cur = buckets.get(h);
      if (!cur) buckets.set(h, [price, price, price, price, qAmt, 1, buy ? 1 : 0, b]);
      else {
        if (b < cur[7]) cur[0] = price; // open: the earliest swap in the hour
        cur[1] = Math.max(cur[1], price); cur[2] = Math.min(cur[2], price);
        if (b >= cur[7]) { cur[3] = price; cur[7] = b; }
        cur[4] += qAmt; cur[5]++; cur[6] += buy ? 1 : 0;
      }
    }
  };
  const CH = 9000;
  const fetchRange = async (a, b) => {
    const logs = await getLogs({ address: L.LIQ_ADDR.poolManager, topics: [T_SWAP, P.id], fromBlock: toQty(a), toBlock: toQty(b) });
    if (!logs.length) return;
    // few swap blocks: read each one's time; many: interpolate between the range's ends
    const blocks = [...new Set(logs.map((l) => parseInt(l.blockNumber, 16)))];
    if (blocks.length <= 40) {
      const ts = new Map(await Promise.all(blocks.map(async (x) => [x, await blockTs(x).catch(() => null)])));
      for (const l of logs) { const x = parseInt(l.blockNumber, 16), t = ts.get(x); eat([l], [x, x, t, t]); }
      return;
    }
    const [ta, tb] = await Promise.all([blockTs(a).catch(() => null), blockTs(b).catch(() => null)]);
    eat(logs, [a, b, ta, tb]);
  };
  // forward to the head
  while (doc.hi < latest.number && left() > 2500) {
    const ranges = []; let a = doc.hi + 1;
    for (let k = 0; k < 8 && a <= latest.number; k++) { const b = Math.min(latest.number, a + CH - 1); ranges.push([a, b]); a = b + 1; }
    await pool(ranges, 8, ([x, y]) => fetchRange(x, y));
    doc.hi = ranges[ranges.length - 1][1];
  }
  // back in time, up to two weeks
  const floor = Math.max(0, latest.number - Math.ceil((KEEP_H * HOUR) / spb));
  while (doc.lo > floor && left() > 2500) {
    const ranges = []; let b = doc.lo - 1;
    for (let k = 0; k < 8 && b >= floor; k++) { const a = Math.max(floor, b - CH + 1); ranges.push([a, b]); b = a - 1; }
    await pool(ranges, 8, ([x, y]) => fetchRange(x, y));
    doc.lo = ranges[ranges.length - 1][0];
  }
  const cut = Math.floor(latest.ts / HOUR) * HOUR - KEEP_H * HOUR;
  const keep = [...buckets.entries()].filter(([h]) => h >= cut).sort((a, b) => a[0] - b[0]);
  doc.b = Object.fromEntries(keep);
  if (st) { try { await st.set(key, doc); } catch { /* next time */ } }
  // events to mark on the chart: the token's own log (scanner) and liquidity added / removed (last 3 days)
  const [scanDoc, lpFeed] = await Promise.all([
    st ? st.get(`scan/${token}`).catch(() => null) : null,
    import("./_liquidity.mjs").then((Lm) => Lm.feed([P.id], { hours: 72 })).catch(() => null),
  ]);
  const marks = [];
  for (const e of (scanDoc && scanDoc.events) || []) {
    if (!["mint", "owner", "pause", "unpause", "upgrade", "big", "burn"].includes(e.k)) continue;
    const ts = e.ts || tsOf(e.b);
    if (ts < cut) continue;
    marks.push({ k: e.k, ts: Math.round(ts), tx: e.tx || null, to: e.to || null, v: e.v || null });
  }
  for (const e of (lpFeed && lpFeed.events) || []) if (e.k === "add" || e.k === "remove") marks.push({ k: "lp-" + e.k, ts: Math.round(tsOf(e.b)), tx: e.h || null });
  const done = doc.lo <= floor;
  return {
    token, pool: { id: P.id, quote: P.quote === L.ZERO_ADDR ? "USDC" : meta.get(P.quote).sym || "USDC", pools: pools.length },
    points: keep.map(([h, v]) => ({ t: h, o: v[0], h: v[1], l: v[2], c: v[3], vol: Math.round(v[4] * 100) / 100, n: v[5], buys: v[6] })),
    marks: marks.sort((a, b) => a.ts - b.ts).slice(-60), done, progress: done ? 1 : Math.max(0, Math.min(1, (doc.hi - doc.lo) / Math.max(1, doc.hi - floor))), spb,
  };
}

// ================================================================ approvals a wallet has given
const KNOWN_SPENDERS = () => [
  [core.ADDR.arcpadRouter, "ArcPad router"], [core.ADDR.uniRouter, "Uniswap router"], [core.ADDR.uniPositions, "Uniswap positions"], [core.ADDR.permit2, "Permit2"],
  [core.ADDR.arclock, "ArcLock"], [core.ADDR.lplock, "ArcLPLock"], [core.ADDR.multisend, "ARCIRCLE Multisender"], [core.ADDR.builderMine, "Builder Mine"],
  [core.ADDR.circleEscrow, "CirclePad escrow"], ...core.ADDR.argusPortals.map((a) => [a, "Argus"]),
];
const MAX_UINT = (1n << 256n) - 1n;
export async function approvalsOf(wallet, { budgetMs = 8000 } = {}) {
  wallet = lc(wallet);
  if (!isAddr(wallet)) throw Object.assign(new Error("wallet must be an address"), { status: 400 });
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const st = store();
  const key = `scanAppr/${wallet}`;
  let doc = st ? await st.get(key).catch(() => null) : null;
  const latest = await latestBlock();
  if (!doc) doc = { hi: latest.number, lo: latest.number + 1, pairs: [] };
  const pairs = new Set(doc.pairs || []); // "token|spender|kind" (kind e = ERC-20, p = Permit2)
  const topic1 = "0x" + pad(wallet);
  const CH = 9000;
  const eat = (logs) => {
    for (const l of logs) {
      const t0x = lc(l.topics[0]);
      if (t0x === T_APPROVAL && l.topics.length >= 3) pairs.add(`${lc(l.address)}|0x${strip(l.topics[2]).slice(24)}|e`);
      else if (t0x === T_P2_APPROVAL && lc(l.address) === core.ADDR.permit2 && l.topics.length >= 4) pairs.add(`0x${strip(l.topics[2]).slice(24)}|0x${strip(l.topics[3]).slice(24)}|p`);
    }
  };
  const q = (a, b) => getLogs({ topics: [[T_APPROVAL, T_P2_APPROVAL], topic1], fromBlock: toQty(a), toBlock: toQty(b) });
  // new blocks first, then further back until the start of the chain
  while (doc.hi < latest.number && left() > 2500) {
    const ranges = []; let a = doc.hi + 1;
    for (let k = 0; k < 10 && a <= latest.number; k++) { const b = Math.min(latest.number, a + CH - 1); ranges.push([a, b]); a = b + 1; }
    eat((await pool(ranges, 10, ([x, y]) => q(x, y))).flat()); doc.hi = ranges[ranges.length - 1][1];
  }
  while (doc.lo > 0 && left() > 2500) {
    const ranges = []; let b = doc.lo - 1;
    for (let k = 0; k < 10 && b >= 0; k++) { const a = Math.max(0, b - CH + 1); ranges.push([a, b]); b = a - 1; }
    eat((await pool(ranges, 10, ([x, y]) => q(x, y))).flat()); doc.lo = ranges[ranges.length - 1][0];
  }
  // always look at the usual pairs too: $ARCIRCLE, USDC and the ArcPad coins × the site's own spenders
  const toks = [ARCIRCLE, core.ADDR.usdc, ...(await allPools().then((ps) => ps.map((p) => lc(p.token))).catch(() => []))].slice(0, 60);
  const known = KNOWN_SPENDERS();
  const probe = new Set(pairs);
  for (const t of toks) for (const [s] of known) probe.add(`${t}|${s}|e`);
  doc.pairs = [...pairs].slice(0, 400);
  if (st) { try { await st.set(key, doc); } catch { /* too big: this answer still works */ } }
  const list = [...probe].map((x) => x.split("|")).filter(([t, s]) => isAddr(t) && isAddr(s));
  const calls = list.map(([t, s, k]) => (k === "p"
    ? { to: core.ADDR.permit2, data: selOf("allowance(address,address,address)") + pad(wallet) + pad(t) + pad(s) }
    : { to: t, data: "0xdd62ed3e" + pad(wallet) + pad(s) }));
  const res = [];
  for (let i = 0; i < calls.length; i += 100) res.push(...(await ethCalls(calls.slice(i, i + 100)).catch(() => calls.slice(i, i + 100).map(() => null))));
  const live = [];
  list.forEach(([t, s, k], i) => {
    const h = strip(res[i]);
    if (!h) return;
    let amt = BigInt("0x" + (h.slice(0, 64) || "0"));
    let expires = null;
    if (k === "p") { expires = Number(BigInt("0x" + (h.slice(64, 128) || "0"))); if (expires && expires < now()) return; }
    if (amt === 0n) return;
    live.push({ token: t, spender: s, kind: k, amount: amt.toString(), unlimited: amt >= MAX_UINT / 2n || (k === "p" && amt >= (1n << 159n)), expires });
  });
  // what each token and spender is
  const toksU = [...new Set(live.map((x) => x.token))], spU = [...new Set(live.map((x) => x.spender))];
  const [meta, codes] = await Promise.all([
    decimalsOf(toksU),
    Promise.all(spU.map((a) => rpcCall("eth_getCode", [a, "latest"]).then((c) => [a, !!(c && c !== "0x")]).catch(() => [a, null]))),
  ]);
  const isCode = new Map(codes);
  const names = new Map(known);
  const out = live.map((x) => {
    const m = meta.get(x.token) || { dec: 18, sym: "" };
    const nm = names.get(x.spender) || (core.labelOf(x.spender) || {}).name || null;
    const risk = nm ? "known" : isCode.get(x.spender) === false ? "wallet" : "contract";
    return { ...x, symbol: m.sym || "", decimals: m.dec, spenderName: nm, risk, human: x.unlimited ? null : core.units(x.amount, m.dec) };
  }).sort((a, b) => ({ wallet: 0, contract: 1, known: 2 }[a.risk] - { wallet: 0, contract: 1, known: 2 }[b.risk]) || (b.unlimited ? 1 : 0) - (a.unlimited ? 1 : 0));
  const done = doc.lo <= 0;
  return { wallet, approvals: out, done, progress: done ? 1 : 1 - doc.lo / Math.max(1, latest.number), block: latest.number };
}

// ================================================================ new pools on Arc
export async function feedOf({ budgetMs = 8000 } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const st = store();
  const key = "scanFeed/v1";
  let doc = st ? await st.get(key).catch(() => null) : null;
  const { latest, spb } = await spbNow();
  if (!doc || !doc.hi) doc = { hi: Math.max(0, latest.number - Math.ceil((36 * HOUR) / spb)), items: [] };
  const items = doc.items || [];
  const CH = 9000;
  while (doc.hi < latest.number && left() > 3000) {
    const ranges = []; let a = doc.hi + 1;
    for (let k = 0; k < 10 && a <= latest.number; k++) { const b = Math.min(latest.number, a + CH - 1); ranges.push([a, b]); a = b + 1; }
    const logs = (await pool(ranges, 10, ([x, y]) => getLogs({ address: L.LIQ_ADDR.poolManager, topics: [T_INIT], fromBlock: toQty(x), toBlock: toQty(y) }))).flat();
    for (const l of logs) {
      const c0 = "0x" + strip(l.topics[2]).slice(24), c1 = "0x" + strip(l.topics[3]).slice(24);
      const tok = !QUOTES.has(c1) ? c1 : !QUOTES.has(c0) ? c0 : null;
      if (!tok) continue;
      const hooks = "0x" + strip(l.data).slice(128 + 24, 192);
      items.push(`${lc(l.topics[1])}|${tok}|${QUOTES.has(c0) || QUOTES.has(c1) ? "usdc" : "other"}|${hooks}|${parseInt(l.blockNumber, 16)}`);
    }
    doc.hi = ranges[ranges.length - 1][1];
  }
  const uniq = new Map();
  for (const s of items) { const [id, tok, q, hooks, b] = s.split("|"); if (!uniq.has(tok) || Number(uniq.get(tok).b) > Number(b)) uniq.set(tok, { id, tok, q, hooks, b: Number(b) }); }
  const list = [...uniq.values()].sort((a, b) => b.b - a.b).slice(0, 60);
  doc.items = list.map((x) => `${x.id}|${x.tok}|${x.q}|${x.hooks}|${x.b}`);
  if (st) { try { await st.set(key, doc); } catch { /* next time */ } }
  const meta = await decimalsOf(list.map((x) => x.tok));
  // scores: the cached ones, and up to two new scans per call (the rest fill in on later visits)
  let fresh = 0;
  const out = [];
  for (const x of list.slice(0, 40)) {
    let d = await scanner.scoreOf(x.tok, { store: st, compute: false }).catch(() => null);
    if ((!d || d.stale) && fresh < 2 && left() > 4000) { fresh++; d = await scanner.scoreOf(x.tok, { store: st }).catch(() => d); }
    const hk = lc(x.hooks);
    out.push({ token: x.tok, sym: (meta.get(x.tok) || {}).sym || (d && d.sym) || "", pool: x.id, quote: x.q, venue: hk === core.ADDR.arcpadHook ? "ArcPad" : /^0x0{40}$/.test(hk) ? "Uniswap v4" : "Uniswap v4 + hook",
      ts: Math.round(latest.ts - (latest.number - x.b) * spb), score: d && !d.notToken && !d.stale ? d.score : null, k: d && !d.stale ? d.k : null, crit: d && d.crit ? d.crit : [] });
  }
  return { items: out, hi: doc.hi, at: now() };
}

// ================================================================ project notes (signed by the token's owner / deployer / creator)
export const noteMessage = (token, w, t, text) => `ARCIRCLE Token Scanner · project note\nToken: ${lc(token)}\nWallet: ${lc(w)}\nTime: ${t}\nNote: ${strip(keccakHex(Buffer.from(String(text || ""), "utf8").toString("hex"))).slice(0, 16)}`;
export async function noteGet(token) {
  if (!storeEnabled() || !isAddr(token)) return null;
  return (await getDocs([`scanNote/${lc(token)}`]))[`scanNote/${lc(token)}`] || null;
}
/// Who may speak for a token: its owner(), the wallet that deployed it, or its ArcPad / Argus creator.
async function rolesOf(token) {
  const io = scanner.io;
  const [c, ap, ag, sdoc] = await Promise.all([
    core.readContract(io, token).catch(() => null), core.readArcPad(io, token).catch(() => null), core.readArgus(io, token).catch(() => null),
    getDocs([`scan/${token}`]).then((d) => d[`scan/${token}`]).catch(() => null),
  ]);
  const r = new Map();
  if (c && c.owner && !core.BURN.includes(c.owner)) r.set(lc(c.owner), "owner");
  if (sdoc && sdoc.deployer) r.set(lc(sdoc.deployer), r.get(lc(sdoc.deployer)) || "deployer");
  if (ap && ap.creator) r.set(lc(ap.creator), r.get(lc(ap.creator)) || "creator");
  if (ag && ag.creator) r.set(lc(ag.creator), r.get(lc(ag.creator)) || "creator");
  return r;
}
export async function noteSet({ token, w, t, sig, text, links }) {
  token = lc(token); w = lc(w);
  if (!isAddr(token) || !isAddr(w)) return { error: "token and wallet must be addresses" };
  text = String(text || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 500);
  if (text.length < 10) return { error: "Write at least a sentence." };
  if (!/^\d{10}$/.test(String(t)) || Math.abs(now() - Number(t)) > 600) return { error: "That signature is too old — sign again." };
  if (personalSigner(noteMessage(token, w, t, text), sig) !== w) return { error: "The signature doesn't match that wallet." };
  const roles = await rolesOf(token);
  const role = roles.get(w);
  if (!role) return { error: "Only the token's owner, the wallet that deployed it or its launchpad creator can post a note." };
  const ls = (Array.isArray(links) ? links : []).map((u) => String(u || "").trim()).filter((u) => /^https:\/\/[^\s<>"']{4,200}$/.test(u)).slice(0, 3);
  const doc = { token, text, links: ls, by: w, role, at: now() };
  await commit([{ set: `scanNote/${token}`, data: doc }]);
  return { ok: true, note: doc };
}

// ================================================================ reports: a scan frozen at a block
export async function reportCreate(token, w) {
  token = lc(token);
  const st = store();
  const r = await scanner.apiResult(token, { store: st });
  if (!r || r.verdict == null) return { error: "That isn't a token." };
  const at = now();
  const id = strip(keccakHex(Buffer.from(`${token}|${at}|${w}|${Math.random()}`).toString("hex"))).slice(0, 12);
  await commit([{ create: `scanRep/${id}`, data: { id, token, at, by: lc(w), r } }]);
  return { ok: true, id, url: `${SITE}/scan-report/${id}` };
}
export async function reportGet(id) {
  if (!/^[0-9a-f]{12}$/.test(String(id || "")) || !storeEnabled()) return null;
  return (await getDocs([`scanRep/${id}`]))[`scanRep/${id}`] || null;
}
const STC = { pass: "#1f9d57", warn: "#b7791f", risk: "#c53030", info: "#4a5568", unknown: "#718096" };
export function reportPage(rep) {
  if (!rep) return `<!doctype html><meta charset="utf-8"><title>Report not found</title><p style="font-family:sans-serif;padding:40px">No such report. <a href="/arc#scanner">Open the Token Scanner</a></p>`;
  const r = rep.r, when = new Date(rep.at * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const groups = [...new Set(r.checks.map((c) => c.group))];
  const vcol = r.score >= 75 ? "#1f9d57" : r.score >= 45 ? "#b7791f" : "#c53030";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scan report · $${esc(r.symbol)} · ARCIRCLE Token Scanner</title><meta name="robots" content="noindex">
<style>
:root{--ink:#10151c;--mut:#5b6472;--line:#e3e7ec;--bg:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#e7edf3;--mut:#9aa6b4;--line:#243140;--bg:#0b1119}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 60px}
.top{display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-bottom:2px solid var(--line);padding-bottom:18px}
h1{margin:0;font-size:26px}h1 small{color:var(--mut);font-weight:500;font-size:15px}
.sc{font-size:44px;font-weight:800;color:${vcol};line-height:1}.sc small{font-size:16px;color:var(--mut)}
.meta{color:var(--mut);font-size:13px;word-break:break-all}.v{font-weight:700;color:${vcol}}
.crit{margin:14px 0;padding:10px 12px;border:1px solid #c53030;border-radius:10px;color:#c53030;font-weight:600}
.sum{margin:16px 0;font-size:16px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:26px 0 8px}
table{width:100%;border-collapse:collapse}td{padding:8px 6px;border-top:1px solid var(--line);vertical-align:top}
td.st{width:84px;font-weight:700;font-size:12px;text-transform:uppercase}td.src{width:80px;color:var(--mut);font-size:12px}
.foot{margin-top:30px;color:var(--mut);font-size:12.5px}.acts{display:flex;gap:10px;margin-top:10px}
.acts a,.acts button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:none;color:var(--ink);text-decoration:none;cursor:pointer}
@media print{.acts{display:none}body{background:#fff;color:#000}}
</style></head><body><main>
<div class="top"><div><h1>$${esc(r.symbol)} <small>${esc(r.name)}</small></h1><div class="meta">${esc(r.token)}<br>Frozen at block ${esc(r.block || "—")} · ${esc(when)} · Scanner ${esc(r.scanner || "v3")}</div></div>
<div style="text-align:right"><div class="sc">${esc(r.score)}<small> / 100</small></div><div class="v">${esc(r.verdict)}</div><div class="meta">Confidence: ${esc(r.confidence || "—")}</div></div></div>
${(r.critical || []).length ? `<div class="crit">Critical: ${r.critical.map(esc).join(" · ")}</div>` : ""}
<p class="sum">${esc(r.summary || "")}</p>
${groups.map((g) => `<h2>${esc(g)}</h2><table>${r.checks.filter((c) => c.group === g).map((c) => `<tr><td class="st" style="color:${STC[c.status] || "inherit"}">${esc(c.status)}</td><td><b>${esc(c.title)}</b>${c.detail ? `<br><span class="meta">${esc(c.detail)}</span>` : ""}</td><td class="src">${esc(c.source || "")}</td></tr>`).join("")}</table>`).join("")}
<div class="acts"><button onclick="print()">Save as PDF</button><a href="/s/${esc(r.token)}">Scan it again now</a><a href="/api/v1/report/${esc(rep.id)}">JSON</a></div>
<p class="foot">This page keeps the scan exactly as it was at the block above; the token may have changed since. Automated checks read from Arc and Dexscreener — not financial advice.</p>
</main></body></html>`;
}

// ================================================================ webhooks
const HOOKS = "scanHooks/v1";
const hookSecret = (id) => hmac(`hook|${id}`).toString("hex").slice(0, 32);
function badUrl(u) {
  let x; try { x = new URL(String(u || "")); } catch { return "That isn't a URL."; }
  if (x.protocol !== "https:") return "Webhooks must be https.";
  const h = x.hostname.toLowerCase();
  if (/^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(h) || !h.includes(".")) return "Use a public hostname.";
  if (String(u).length > 300) return "That URL is too long.";
  return null;
}
export const HOOK_EVENTS = ["owner", "supply", "liquidity", "lp", "score", "sell"];
export async function hookOp({ op, w, token, url, events, id }) {
  const st = store();
  if (!st) return { error: "Storage isn't set up yet." };
  const doc = (await st.get(HOOKS)) || { items: [] };
  let items = doc.items || [];
  if (op === "list") return { hooks: items.filter((x) => x.w === lc(w)).map(({ secret: _s, ...x }) => x) };
  if (op === "del") { items = items.filter((x) => !(x.id === id && x.w === lc(w))); await st.set(HOOKS, { items }); return { ok: true }; }
  if (op !== "add") return { error: "op must be add, del or list" };
  if (!isAddr(token)) return { error: "token must be an address" };
  const bad = badUrl(url);
  if (bad) return { error: bad };
  if (items.filter((x) => x.w === lc(w)).length >= 5) return { error: "Up to 5 webhooks per wallet." };
  if (items.length >= 300) return { error: "The webhook list is full." };
  const ev = (Array.isArray(events) ? events : HOOK_EVENTS).filter((e) => HOOK_EVENTS.includes(e));
  const hid = strip(keccakHex(Buffer.from(`${w}|${token}|${url}|${now()}`).toString("hex"))).slice(0, 12);
  items.push({ id: hid, w: lc(w), token: lc(token), url: String(url), ev: ev.length ? ev : HOOK_EVENTS, at: now() });
  await st.set(HOOKS, { items });
  return { ok: true, id: hid, secret: hookSecret(hid), note: "Every call carries x-arcircle-signature: hex HMAC-SHA256 of the raw body with this secret. It's shown once." };
}
export async function hookTargets() {
  const st = store();
  if (!st) return [];
  const doc = (await st.get(HOOKS).catch(() => null)) || { items: [] };
  return doc.items || [];
}
/// POSTs one alert to a webhook (5 s, no redirects), signed with its secret.
export async function hookSend(h, payload) {
  const body = JSON.stringify({ ...payload, hook: h.id, at: new Date().toISOString() });
  const sig = createHmac("sha256", hookSecret(h.id)).update(body).digest("hex");
  try {
    const r = await fetch(h.url, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "user-agent": "ARCIRCLE-Scanner-Webhook/1", "x-arcircle-signature": sig }, body, signal: AbortSignal.timeout(5000) });
    return r.status;
  } catch { return 0; }
}

// ================================================================ batch, search, ARCIA's take
export async function batch(tokens) {
  const list = [...new Set((tokens || []).map(lc).filter(isAddr))].slice(0, 25);
  const st = store();
  let fresh = 0;
  const out = [];
  for (const t of list) {
    let d = await scanner.scoreOf(t, { store: st, compute: false }).catch(() => null);
    if ((!d || d.stale) && fresh < 3) { fresh++; d = await scanner.scoreOf(t, { store: st }).catch(() => d); }
    out.push(d && !d.stale ? (d.notToken ? { token: t, notToken: true } : { token: t, sym: d.sym, score: d.score, verdict: d.t, k: d.k, confidence: d.conf || null, critical: d.crit || [], sections: d.sub || null, summary: d.summary || "", at: d.at })
      : { token: t, pending: true });
  }
  return { results: out, pending: out.filter((x) => x.pending).length };
}
let namesMem = null;
async function arcpadNames(st) {
  if (namesMem && Date.now() - namesMem.at < 3600e3) return namesMem.list;
  let doc = st ? await st.get("scanNames/v1").catch(() => null) : null;
  if (!doc || Date.now() - (doc.at || 0) > 3600e3) {
    const ps = await allPools().catch(() => []);
    const meta = await decimalsOf(ps.map((p) => lc(p.token)).slice(0, 300));
    doc = { at: Date.now(), list: ps.slice(0, 300).map((p) => `${lc(p.token)}|${(meta.get(lc(p.token)) || {}).sym || ""}`) };
    if (st) { try { await st.set("scanNames/v1", doc); } catch { /* memory */ } }
  }
  namesMem = { at: Date.now(), list: doc.list || [] };
  return namesMem.list;
}
export async function search(q) {
  q = String(q || "").trim().replace(/^\$/, "");
  if (q.length < 2 || q.length > 40) return { results: [] };
  const st = store();
  const ql = q.toLowerCase();
  const byTok = new Map();
  const addHit = (token, sym, name, liq, src) => {
    token = lc(token); if (!isAddr(token)) return;
    const cur = byTok.get(token) || { token, sym, name: name || "", liq: 0, src: [] };
    cur.liq = Math.max(cur.liq, liq || 0); if (!cur.src.includes(src)) cur.src.push(src); if (!cur.sym) cur.sym = sym; byTok.set(token, cur);
  };
  const [dex, names] = await Promise.all([scanner.io.fetchJson(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, 8000), arcpadNames(st)]);
  for (const p of (dex && dex.pairs) || []) if (p && p.chainId === "arc" && p.baseToken) addHit(p.baseToken.address, p.baseToken.symbol, p.baseToken.name, p.liquidity && p.liquidity.usd, "dex");
  for (const s of names) { const [t, sym] = s.split("|"); if (sym && sym.toLowerCase().includes(ql)) addHit(t, sym, "", 0, "arcpad"); }
  let list = [...byTok.values()].filter((x) => String(x.sym || "").toLowerCase().includes(ql) || String(x.name || "").toLowerCase().includes(ql));
  list.sort((a, b) => (String(b.sym).toLowerCase() === ql ? 1 : 0) - (String(a.sym).toLowerCase() === ql ? 1 : 0) || b.liq - a.liq);
  list = list.slice(0, 12);
  const docs = await Promise.all(list.map((x) => scanner.scoreOf(x.token, { store: st, compute: false }).catch(() => null)));
  const symCount = new Map();
  list.forEach((x) => symCount.set(String(x.sym).toLowerCase(), (symCount.get(String(x.sym).toLowerCase()) || 0) + 1));
  return { q, results: list.map((x, i) => ({ ...x, score: docs[i] && !docs[i].stale && docs[i].score != null ? docs[i].score : null, k: docs[i] && !docs[i].stale ? docs[i].k : null, same: symCount.get(String(x.sym).toLowerCase()) || 1 })) };
}
export async function take(token) {
  token = lc(token);
  const st = store();
  const d = await scanner.scoreOf(token, { store: st, maxAgeMs: 6 * 3600e3 }).catch(() => null);
  if (!d || d.notToken) return { error: "That isn't a token." };
  const key = `scanTake/${token}`;
  const hit = st ? await st.get(key).catch(() => null) : null;
  if (hit && hit.score === d.score && Date.now() - (hit.at || 0) < 6 * 3600e3) return { text: hit.text, at: hit.at, ai: hit.ai };
  const facts = { symbol: d.sym, score: d.score, verdict: d.t, confidence: d.conf, critical: d.crit || [], reasons: d.reasons || [], trade: d.trade || [], summary: d.summary || "" };
  let text = null;
  try {
    const B = await import("./_arcia-brain.mjs");
    text = await B.askClaude({ L: null, maxTokens: 260, timeoutMs: 15000,
      messages: [{ role: "user", content: `Token Scanner v3 result for $${d.sym} (${token}):\n${JSON.stringify(facts)}\n\nIn 2–3 short sentences for a beginner: what matters most in this result, and the one thing to check before buying. Don't give financial advice, don't invent numbers, don't say it's safe.` }] });
  } catch { text = null; }
  const ai = !!text;
  if (!text) text = d.summary || `$${d.sym}: ${d.score}/100 · ${d.t}.`;
  const doc = { score: d.score, text: String(text).slice(0, 900), at: Date.now(), ai };
  if (st) { try { await st.set(key, doc); } catch { /* memory only */ } }
  return { text: doc.text, at: doc.at, ai };
}

/// The live embed card (/embed/scan/<address>): score, verdict, the top reasons — for iframes.
export function embedPage(token, d) {
  const ok = d && !d.notToken && d.score != null;
  const col = !ok ? "#9aa4b2" : d.k === "ok" ? "#39ff88" : d.k === "care" ? "#ffc861" : "#ff6e5a";
  const reasons = ok ? (d.reasons || []).slice(0, 3).map((s) => String(s).split("|")) : [];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${ok ? `$${esc(d.sym)} ${d.score}/100` : "Token Scanner"} · ARCIRCLE</title>
<style>*{box-sizing:border-box}html,body{margin:0;height:100%;background:transparent}body{font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#e8eef5}
a.card{display:flex;gap:14px;align-items:center;height:100%;min-height:96px;padding:12px 14px;border-radius:14px;background:#0b1320;border:1px solid ${col}66;color:inherit;text-decoration:none}
.ring{--p:${ok ? d.score : 0};width:62px;height:62px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(${col} calc(var(--p)*1%),#1d2a38 0)}
.ring b{width:48px;height:48px;border-radius:50%;background:#0b1320;display:grid;place-items:center;font-size:18px}
.t{min-width:0}.t h1{margin:0;font-size:15px}.t .v{color:${col};font-weight:700}.t ul{margin:4px 0 0;padding:0;list-style:none;color:#b9c6d4;font-size:12px}
.t li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.t li.risk{color:#ff9a8a}.t li.warn{color:#ffd48a}.f{color:#7f8fa3;font-size:11px;margin-top:4px}</style></head>
<body><a class="card" href="${SITE}/s/${esc(token)}" target="_blank" rel="noopener"><div class="ring"><b>${ok ? d.score : "—"}</b></div>
<div class="t"><h1>${ok ? `$${esc(d.sym)}` : esc(core.short(token))} · <span class="v">${ok ? esc(d.t) : "not scanned yet"}</span></h1>
<ul>${reasons.map(([st, t]) => `<li class="${esc(st)}">${st === "pass" ? "✓" : "•"} ${esc(t)}</li>`).join("")}</ul>
<div class="f">Token Scanner ${esc(core.SCANNER_VERSION)} · ARCIRCLE PAD${d && d.at ? ` · ${new Date(d.at).toISOString().slice(0, 10)}` : ""}</div></div></a></body></html>`;
}
