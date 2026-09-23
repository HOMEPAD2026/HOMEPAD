// api/holders.mjs — full on-chain history of one ArcPad coin (its pool's
// Swap events + the token's Transfer events since launch) and the holder
// list rebuilt from it. Same compact records arcpad-coin.js scans for
// itself, so a first visit to a coin page gets trades, chart and holders
// from one edge-cached request instead of dozens of eth_getLogs calls.
//   GET /api/holders?token=0x…
import { getLogs, latestBlock, blockTs, pool, toQty, ethCalls, isAddr, pad, strip, keccakHex, wBig, PM_ADDRESS, FACTORY_ADDRESS, TOPIC } from "./_arc.mjs";

export const config = { runtime: "edge" };
const CHUNK = 9000;
const MAX_CHUNKS = 400; // ≈ 3 weeks of Arc blocks; older coins fall back to the browser's own scan
const json = (status, body, cache) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache || "no-store", "access-control-allow-origin": "*" } });
const signed128 = (hex) => BigInt.asIntN(128, BigInt(hex));

export default async function handler(req) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!isAddr(token)) return json(400, { error: "token must be an address" });
  try {
    const [idxHex] = await ethCalls([{ to: FACTORY_ADDRESS, data: "0x08b74625" + pad(token) }]);
    const idx = idxHex ? Number(BigInt(idxHex)) : 0;
    if (!idx) return json(404, { error: "not an ArcPad launch" }, "public, s-maxage=300");
    const [rec, keyHex] = await ethCalls([
      { to: FACTORY_ADDRESS, data: "0x7b443a76" + pad((idx - 1).toString(16)) },
      { to: FACTORY_ADDRESS, data: "0x8652edf9" + pad(token) },
    ]);
    const launchedAt = Number(wBig(rec, 5));
    const poolId = keccakHex(strip(keyHex).slice(0, 5 * 64));
    const latest = await latestBlock();
    // launch block: estimate from the timestamp, then step back until we're before it
    let spb = 0.5;
    try { const back = Math.max(0, latest.number - 20000); const t = await blockTs(back); const m = (latest.ts - t) / Math.max(1, latest.number - back); if (m > 0.05 && m < 20) spb = m; } catch { /* default */ }
    let from = Math.max(0, latest.number - Math.ceil((latest.ts - launchedAt) / spb) - 600);
    for (let k = 0; k < 6; k++) { const t = await blockTs(from); if (t == null || t <= launchedAt) break; from = Math.max(0, from - 4000 * (k + 1)); }
    const ranges = [];
    for (let a = from; a <= latest.number; a += CHUNK) ranges.push([a, Math.min(latest.number, a + CHUNK - 1)]);
    if (ranges.length > MAX_CHUNKS) return json(413, { error: "history too long for one request", chunks: ranges.length }, "public, s-maxage=3600");
    const logs = (await pool(ranges, 8, async ([a, b]) => {
      const r = { fromBlock: toQty(a), toBlock: toQty(b) };
      const [sw, tr] = await Promise.all([
        getLogs({ address: PM_ADDRESS, topics: [TOPIC.swap, poolId], ...r }),
        getLogs({ address: token, topics: [TOPIC.transfer], ...r }),
      ]);
      return sw.concat(tr);
    })).flat();
    const recs = logs.map((log) => {
      const base = { b: parseInt(log.blockNumber, 16), i: parseInt(log.logIndex, 16), h: log.transactionHash };
      if (log.topics[0] === TOPIC.swap) {
        const d = log.data.slice(2); const w = (k) => "0x" + d.slice(k * 64, (k + 1) * 64);
        return { ...base, k: "S", a0: signed128(w(0)).toString(), a1: signed128(w(1)).toString(), sq: BigInt(w(2)).toString() };
      }
      return { ...base, k: "T", fr: "0x" + log.topics[1].slice(26), to: "0x" + log.topics[2].slice(26), v: BigInt(log.data).toString() };
    }).sort((x, y) => (x.b - y.b) || (x.i - y.i));
    const bal = new Map();
    for (const r of recs) if (r.k === "T") {
      const v = BigInt(r.v), fr = r.fr.toLowerCase(), to = r.to.toLowerCase();
      if (!/^0x0{40}$/.test(fr)) bal.set(fr, (bal.get(fr) || 0n) - v);
      if (!/^0x0{40}$/.test(to)) bal.set(to, (bal.get(to) || 0n) + v);
    }
    const holders = [...bal.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
    return json(200, {
      v: 1, token: token.toLowerCase(), poolId, launchBlock: from, lo: from, hi: latest.number, anchor: { block: latest.number, ts: latest.ts },
      recs, holderCount: holders.length, holders: holders.slice(0, 100).map(([a, v]) => [a, v.toString()]),
    }, "public, max-age=0, s-maxage=20, stale-while-revalidate=300");
  } catch (err) {
    return json(502, { error: String(err && err.message || err).slice(0, 200) });
  }
}
