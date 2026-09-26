// api/_bridge.mjs — the server half of the Bridge utility (arc-bridge.js).
//   bridgeHistory(wallet)  a wallet's CCTP transfers seen on Arc, read from
//        Circle's TokenMessengerV2 there: DepositForBurn (USDC leaving Arc)
//        and MintAndWithdraw (USDC arriving), so the page can rebuild "Your
//        transfers" on any device. The last 30 days are kept in the store and
//        each call only reads new blocks (and a little further back).
//   logBridge / bridgeStats  "bridged through ARCIRCLE PAD" totals — a
//        transfer is only counted once Circle's own API confirms it.
import { getLogs, latestBlock, blockTs, pool, toQty, rpcCall, isAddr } from "./_arc.mjs";
import { cctp } from "./_cctp.mjs";

const TM = "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d"; // TokenMessengerV2 (same on every chain)
const MT = "0x81d40f21f12a8f0e3252bccb954d722d4c464b64"; // MessageTransmitterV2
const T_DEPOSIT = "0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5"; // DepositForBurn(address,uint256,address,bytes32,uint32,bytes32,bytes32,uint256,uint32,bytes)
const T_MINT = "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63"; // MintAndWithdraw(address,uint256,address,uint256)
const T_RECEIVED = "0xff48c13eda96b1cceacc6b9edeedc9e9db9d6226afbc30146b720c19d3addb1c"; // MessageReceived(address,uint32,bytes32,bytes32,uint32,bytes)
const CHUNK = 9000, WAVE = 8, KEEP_DAYS = 30;
const lc = (a) => String(a || "").toLowerCase();
const padAddr = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const word = (data, i) => String(data || "").replace(/^0x/, "").slice(i * 64, (i + 1) * 64);
const big = (data, i) => { const w = word(data, i); return w ? BigInt("0x" + w) : 0n; };
const mem = new Map();

async function blocksPerDay(latest) {
  try {
    const back = Math.max(0, latest.number - 20000), t = await blockTs(back);
    const spb = (latest.ts - t) / Math.max(1, latest.number - back);
    if (spb > 0.05 && spb < 30) return Math.round(86400 / spb);
  } catch { /* default */ }
  return 172800; // 0.5 s blocks
}

function parse(logs) {
  const out = [];
  for (const l of logs) {
    const t0 = lc(l.topics && l.topics[0]), b = parseInt(l.blockNumber, 16), tx = lc(l.transactionHash);
    if (t0 === T_DEPOSIT) {
      const off = Number(big(l.data, 6)) * 2, hookLen = off ? Number(BigInt("0x" + (String(l.data).replace(/^0x/, "").slice(off, off + 64) || "0"))) : 0;
      out.push({ k: "out", tx, b, amount: big(l.data, 0).toString(), recipient: "0x" + word(l.data, 1).slice(24), dst: Number(big(l.data, 2)), maxFee: big(l.data, 5).toString(), forward: hookLen > 0 });
    } else if (t0 === T_MINT) {
      out.push({ k: "in", tx, b, amount: big(l.data, 0).toString(), fee: big(l.data, 1).toString(), src: null });
    }
  }
  return out;
}

/// store: { get(key), set(key, doc) } or null.
export async function bridgeHistory(wallet, { store = null, budgetMs = 6500 } = {}) {
  if (!isAddr(wallet)) throw Object.assign(new Error("wallet must be an address"), { status: 400 });
  wallet = lc(wallet);
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0);
  const key = `bridgeHist/${wallet}`;
  let S = mem.get(wallet) || null;
  if (!S && store) { try { S = await store.get(key); } catch { S = null; } }
  if (!S || S.v !== 1) S = { v: 1, hi: null, lo: null, items: [] };
  const latest = await latestBlock();
  const floor = Math.max(0, latest.number - KEEP_DAYS * (await blocksPerDay(latest)));
  const read = async ([a, b]) => {
    const r = { address: TM, fromBlock: toQty(a), toBlock: toQty(b) };
    const [dep, mint] = await Promise.all([getLogs({ ...r, topics: [T_DEPOSIT, null, padAddr(wallet)] }), getLogs({ ...r, topics: [T_MINT, padAddr(wallet)] })]);
    return dep.concat(mint);
  };
  const found = [];
  // new blocks first
  if (S.hi != null) {
    while (S.hi < latest.number && left() > 1500) {
      const ranges = []; let a = S.hi + 1;
      for (let k = 0; k < WAVE && a <= latest.number; k++) { const b = Math.min(latest.number, a + CHUNK - 1); ranges.push([a, b]); a = b + 1; }
      found.push(...parse((await pool(ranges, WAVE, read)).flat()));
      S.hi = ranges[ranges.length - 1][1];
    }
  } else { S.hi = latest.number; S.lo = latest.number + 1; }
  // then further back, down to 30 days
  while (S.lo > floor && left() > 1500) {
    const ranges = []; let hi = S.lo - 1;
    for (let k = 0; k < WAVE && hi >= floor; k++) { const a = Math.max(floor, hi - CHUNK + 1); ranges.push([a, hi]); hi = a - 1; }
    found.push(...parse((await pool(ranges, WAVE, read)).flat()));
    S.lo = ranges[ranges.length - 1][0];
  }
  // arrivals: which chain they came from (MessageReceived in the same transaction), and times
  await pool(found.filter((x) => x.k === "in"), 4, async (x) => {
    try {
      const rc = await rpcCall("eth_getTransactionReceipt", [x.tx]);
      const m = (rc && rc.logs || []).find((l) => lc(l.address) === MT && lc(l.topics[0]) === T_RECEIVED);
      if (m) x.src = Number(big(m.data, 0));
    } catch { /* unknown source */ }
  });
  await pool(found, 6, async (x) => { x.ts = await blockTs(x.b).catch(() => null); });
  const seen = new Set(S.items.map((x) => `${x.k}:${x.tx}`));
  for (const x of found) if (!seen.has(`${x.k}:${x.tx}`)) S.items.push(x);
  S.items.sort((a, b) => b.b - a.b);
  S.items = S.items.slice(0, 60);
  mem.set(wallet, S);
  if (mem.size > 500) mem.delete(mem.keys().next().value);
  if (store) { try { await store.set(key, S); } catch { /* memory copy */ } }
  return { wallet, items: S.items, complete: S.lo <= floor, days: KEEP_DAYS };
}

// ---- "bridged through ARCIRCLE PAD" ----
const STATS_KEY = "bridgeStats/v1";
export async function logBridge(store, { tx, src }) {
  tx = lc(tx);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return { ok: false, error: "bad transaction hash" };
  const seenKey = `bridgeTx/${tx}`;
  if ((await store.get(seenKey))) return { ok: true, duplicate: true };
  const [st, body] = await cctp(new URLSearchParams({ cctp: "msg", src: String(src), tx }));
  const m = st === 200 && body.messages && body.messages[0];
  if (!m || !m.amount || m.dstDomain == null || m.status !== "complete") return { ok: false, error: "Circle hasn't signed this transfer yet" };
  if (Number(src) !== 26 && m.dstDomain !== 26) return { ok: false, error: "not an Arc transfer" };
  const usd = Number(BigInt(m.amount)) / 1e6;
  if (!(usd > 0) || usd > 1e9) return { ok: false, error: "odd amount" };
  await store.set(seenKey, { src: Number(src), dst: m.dstDomain, usd, at: Date.now() });
  const cur = (await store.get(STATS_KEY)) || { n: 0, usd: 0, in: 0, out: 0 };
  const next = { n: (cur.n || 0) + 1, usd: (cur.usd || 0) + usd, in: (cur.in || 0) + (m.dstDomain === 26 ? usd : 0), out: (cur.out || 0) + (Number(src) === 26 ? usd : 0), at: Date.now() };
  await store.set(STATS_KEY, next);
  return { ok: true };
}
export async function bridgeStats(store) {
  if (!store) return { n: 0, usd: 0 };
  try { const d = await store.get(STATS_KEY); return d ? { n: d.n || 0, usd: Math.round((d.usd || 0) * 100) / 100 } : { n: 0, usd: 0 }; } catch { return { n: 0, usd: 0 }; }
}
