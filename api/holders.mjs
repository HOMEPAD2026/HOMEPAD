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
  const params = new URL(req.url).searchParams;
  if (params.has("scan")) return scan(params.get("scan") || "");
  const token = params.get("token") || "";
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

// ---------------------------------------------------------------------------
// GET /api/holders?scan=0x…  — holder picture for ANY Arc ERC-20 (Token Scanner).
// Walks the token's Transfer events backwards from the newest block until the
// mints it has seen add up to the current supply (then the history is
// complete), or a scan budget runs out (then it's the recent window only and
// the answer says so). Balances of the biggest wallets are then read with
// balanceOf, so fee-on-transfer / reflection tokens still show real numbers.
const SCAN_CHUNK = 9000;
const SCAN_WAVE = 10;
const SCAN_MAX_CHUNKS = 200;
const ZERO = "0x0000000000000000000000000000000000000000";
async function scan(token) {
  if (!isAddr(token)) return json(400, { error: "not an address" });
  token = token.toLowerCase();
  try {
    const [supHex, decHex] = await ethCalls([{ to: token, data: "0x18160ddd" }, { to: token, data: "0x313ce567" }]);
    if (supHex == null) return json(404, { error: "not an ERC-20 token (no totalSupply)" }, "public, s-maxage=300");
    const supply = BigInt(supHex);
    const decimals = decHex ? Number(BigInt(decHex)) : 18;
    const latest = await latestBlock();
    const net = new Map(), got = new Map();
    let mints = 0n, burns = 0n, transfers = 0, firstBlock = null, hi = latest.number, chunks = 0, complete = false, lo = hi;
    while (chunks < SCAN_MAX_CHUNKS && hi >= 0) {
      const ranges = [];
      for (let k = 0; k < SCAN_WAVE && hi >= 0; k++) { const a = Math.max(0, hi - SCAN_CHUNK + 1); ranges.push([a, hi]); hi = a - 1; }
      const logs = (await pool(ranges, SCAN_WAVE, ([a, b]) => getLogs({ address: token, topics: [TOPIC.transfer], fromBlock: toQty(a), toBlock: toQty(b) }))).flat();
      for (const l of logs) {
        if (!l.topics || l.topics.length < 3) continue; // ERC-721 style or odd events
        const fr = "0x" + l.topics[1].slice(26).toLowerCase(), to = "0x" + l.topics[2].slice(26).toLowerCase();
        const v = BigInt(l.data && l.data !== "0x" ? l.data.slice(0, 66) : "0x0");
        const bn = parseInt(l.blockNumber, 16);
        transfers++;
        if (fr === ZERO) { mints += v; if (firstBlock == null || bn < firstBlock) firstBlock = bn; }
        else net.set(fr, (net.get(fr) || 0n) - v);
        if (to === ZERO) burns += v;
        else { net.set(to, (net.get(to) || 0n) + v); got.set(to, (got.get(to) || 0n) + v); }
      }
      chunks += ranges.length;
      lo = ranges[ranges.length - 1][0];
      if (supply > 0n && mints - burns >= supply) { complete = true; break; }
      if (lo === 0) { complete = mints > 0n; break; }
    }
    // Candidates: by computed balance when the history is complete, by what
    // they received in the window otherwise. Then read the real balances.
    const cand = complete
      ? [...net.entries()].filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0)).slice(0, 150).map(([a]) => a)
      // partial: the biggest receivers, plus the biggest senders (a deployer
      // that only ever sent in this window can still hold most of the supply)
      : [...new Set([
        ...[...got.entries()].sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0)).slice(0, 120).map(([a]) => a),
        ...[...net.entries()].filter(([, v]) => v < 0n).sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0)).slice(0, 30).map(([a]) => a),
      ])];
    const bals = [];
    for (let i = 0; i < cand.length; i += 50) {
      const part = cand.slice(i, i + 50);
      const r = await ethCalls(part.map((a) => ({ to: token, data: "0x70a08231" + pad(a) })));
      part.forEach((a, k) => bals.push([a, r[k] ? BigInt(r[k]) : 0n]));
    }
    const top = bals.filter(([, v]) => v > 0n).sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
    const holderCount = complete ? [...net.values()].filter((v) => v > 0n).length : top.length;
    const [fromTs, firstTs] = await Promise.all([blockTs(lo).catch(() => null), firstBlock != null ? blockTs(firstBlock).catch(() => null) : null]);
    return json(200, {
      v: 1, token, supply: supply.toString(), decimals, complete, transfers,
      fromBlock: lo, toBlock: latest.number, fromTs, nowTs: latest.ts,
      firstMint: complete && firstBlock != null ? { block: firstBlock, ts: firstTs } : null,
      holderCount, holderCountExact: complete,
      top: top.slice(0, 25).map(([a, v]) => [a, v.toString()]),
    }, "public, max-age=30, s-maxage=120, stale-while-revalidate=600");
  } catch (err) {
    return json(502, { error: String(err && err.message || err).slice(0, 200) });
  }
}
