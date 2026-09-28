// api/activity.mjs — the last 24h of trading across every ArcPad pool, in
// the same compact form arc-activity.js keeps in the browser. Built from
// ~20 eth_getLogs calls and cached at Vercel's edge for 30s, so a first
// visit paints the ticker, card stats and Explore sorts from one request
// instead of walking the chain itself. The browser keeps scanning forward
// from `hi` on its own.
import { allPools, getLogs, latestBlock, blockTs, pool, toQty, PM_ADDRESS, TOPIC, keccakHex, pad, SITE } from "./_arc.mjs";

export const config = { runtime: "edge" };
const CHUNK = 9000;
const WINDOW = 24 * 3600;
import { ARCIRCLE_CURVE } from "./_arcircle.mjs";
const CURVE = ARCIRCLE_CURVE; // "" while $ARCIRCLE is not live
const signed = (hex) => { const v = BigInt(hex); return v >= (1n << 255n) ? v - (1n << 256n) : v; };

// coins launched on Argus through ArcPad trade on the same PoolManager: their pools join the
// ticker too (the list from /api/social, edge-cached; pool key = USDC pair, dynamic fee,
// tick spacing 200, the coin's hook — as in api/_argus-arcpad.mjs)
const USDC = "0x3600000000000000000000000000000000000000";
async function argusPools() {
  try {
    const r = await fetch(`${SITE}/api/social?argusarc=list`, { signal: AbortSignal.timeout(5000) });
    const j = r.ok ? await r.json() : null;
    return ((j && j.items) || []).filter((x) => x && x.active !== false && /^0x[0-9a-fA-F]{40}$/.test(x.token || "") && /^0x[0-9a-fA-F]{40}$/.test(x.hook || "")).map((x) => {
      const [c0, c1] = BigInt(x.token) < BigInt(USDC) ? [x.token, USDC] : [USDC, x.token];
      return { token: x.token, poolId: keccakHex(pad(c0) + pad(c1) + pad((0x800000).toString(16)) + pad((200).toString(16)) + pad(x.hook)).toLowerCase() };
    });
  } catch { return []; }
}

export default async function handler() {
  try {
    const [latest, own, argus] = await Promise.all([latestBlock(), allPools(), argusPools()]);
    const pools = own.concat(argus);
    let spb = 0.5;
    try {
      const back = Math.max(0, latest.number - 20000);
      const ts = await blockTs(back);
      const m = (latest.ts - ts) / Math.max(1, latest.number - back);
      if (m > 0.05 && m < 20) spb = m;
    } catch { /* default */ }
    const lo = Math.max(0, latest.number - Math.ceil(WINDOW / spb));
    const ids = pools.map((p) => p.poolId);
    const ranges = [];
    for (let a = lo; a <= latest.number; a += CHUNK) ranges.push([a, Math.min(latest.number, a + CHUNK - 1)]);
    const recs = ids.length ? (await pool(ranges, 6, ([a, b]) => getLogs({ address: PM_ADDRESS, topics: [TOPIC.swap, ids], fromBlock: toQty(a), toBlock: toQty(b) })))
      .flat().map((log) => {
        const d = log.data.slice(2);
        const w = (k) => "0x" + d.slice(k * 64, (k + 1) * 64);
        return { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash, p: log.topics[1].toLowerCase(),
          a0: signed(w(0)).toString(), a1: signed(w(1)).toString(), sq: BigInt(w(2)).toString() };
      }) : [];
    const curveFrom = latest.number - CHUNK + 1;
    const curve = !CURVE ? [] : (await getLogs({ address: CURVE, topics: [[TOPIC.curveBuy, TOPIC.curveSell]], fromBlock: toQty(curveFrom), toBlock: toQty(latest.number) }).catch(() => []))
      .map((log) => {
        const d = log.data.slice(2);
        const w = (k) => BigInt("0x" + d.slice(k * 64, (k + 1) * 64));
        const buy = log.topics[0] === TOPIC.curveBuy;
        return { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash, buy, usd: Number(buy ? w(0) : w(1)) / 1e6 };
      });
    recs.sort((x, y) => (x.b - y.b) || (x.i - y.i));
    return new Response(JSON.stringify({ v: 1, lo, hi: latest.number, anchor: { block: latest.number, ts: latest.ts }, spb, pools: ids, recs, curve, curveHi: latest.number }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=0, s-maxage=30, stale-while-revalidate=300", "access-control-allow-origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err && err.message || err).slice(0, 200) }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
}
