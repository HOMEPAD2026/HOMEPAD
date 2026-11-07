// ARC GALAXY's daily records (api/_galaxy-daily.mjs): the keeper's cursor, lock, day folding, gaps, HLL and the reads
import { makeDaily, blank, addBlock, summary, hllNew, hllAdd, hllCount, hllMerge, dayOf, MAX_BEHIND, START_BACK, HLL_M } from "../../api/_galaxy-daily.mjs";
import { classify, USDC } from "../../api/_arc-galaxy.mjs";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const pad = (h, n = 64) => h.replace(/^0x/, "").padStart(n, "0");
const hx = (n) => "0x" + Number(n).toString(16);
const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ---- HLL
{ let r = hllNew(); ok(r.length === HLL_M && hllCount(r) === 0, "an empty HLL counts 0");
  const addrs = Array.from({ length: 5000 }, (_, i) => "0x" + (BigInt(i + 1) * 0x9e3779b97f4a7c15n * 0x2545f4914f6cdd1dn % (1n << 160n)).toString(16).padStart(40, "0"));
  r = hllAdd(r, addrs); const c = hllCount(r);
  ok(Math.abs(c - 5000) / 5000 < 0.06, "5,000 wallets ≈ " + c);
  ok(hllCount(hllAdd(r, addrs)) === c, "the same wallets again don't count twice");
  const a = hllAdd(hllNew(), addrs.slice(0, 2500)), b = hllAdd(hllNew(), addrs.slice(2500));
  ok(Math.abs(hllCount(hllMerge(a, b)) - c) <= c * 0.01, "two halves merged ≈ the whole");
  ok(Math.abs(hllCount(hllAdd(hllNew(), ["0x" + "a".repeat(40), "0x" + "b".repeat(40), "0x" + "c".repeat(40)])) - 3) <= 0, "3 wallets = 3 (small range)"); }

// ---- a fake Arc: block n at ts0 + n/2 s, 3 txs each (a USDC send, a call, a failed call), receipts
const T0 = Date.UTC(2026, 10, 7, 23, 52, 0) / 1000; // 23:52 UTC → days roll over during the test
const W = (i) => "0x" + pad((0x1000 + i).toString(16), 40);
const CONTRACT = "0x" + "c".repeat(40);
function block(n) {
  const ts = T0 + Math.floor(n / 2);
  const txs = [
    { hash: "0x" + pad("a" + n.toString(16)), from: W(n % 50), to: W((n + 1) % 50), input: "0x", value: hx(10n ** 18n) }, // $1 native
    { hash: "0x" + pad("b" + n.toString(16)), from: W(n % 7), to: CONTRACT, input: "0x12345678", value: "0x0" },
    { hash: "0x" + pad("f" + n.toString(16)), from: W(3), to: CONTRACT, input: "0x12345678", value: "0x0" },
  ];
  const rcs = txs.map((t, i) => ({ transactionHash: t.hash, status: i === 2 ? "0x0" : "0x1", logs: [], gasUsed: hx(21000), effectiveGasPrice: hx(20n * 10n ** 9n) }));
  return { b: { number: hx(n), timestamp: hx(ts), gasUsed: "0x0", transactions: txs }, rcs };
}
function fakeRpc(state) {
  return async (body) => {
    const one = (q) => {
      state.calls++;
      if (q.method === "eth_blockNumber") return { id: q.id, result: hx(state.head) };
      const n = Number(q.params[0]);
      if (n > state.head || (state.missing && state.missing.has(n))) return { id: q.id, result: null };
      if (q.method === "eth_getBlockByNumber") return { id: q.id, result: block(n).b };
      if (q.method === "eth_getBlockReceipts") return { id: q.id, result: block(n).rcs };
      return { id: q.id, error: { message: "unknown" } };
    };
    if (Array.isArray(body)) { ok(body.length <= 40, "batches of 40 at most"); return body.map(one); }
    return one(body);
  };
}
function memStore() {
  const docs = new Map();
  return {
    docs, on: () => true,
    get: async (ps) => Object.fromEntries(ps.map((p) => [p, docs.has(p) ? JSON.parse(JSON.stringify(docs.get(p))) : null])),
    set: async (p, d) => { docs.set(p, d); },
    commit: async (w) => {
      for (const x of w) if (x.create && docs.has(x.create)) return { ok: false, conflict: true };
      for (const x of w) { if (x.create) docs.set(x.create, x.data); if (x.set) docs.set(x.set, x.data); if (x.del) docs.delete(x.del); }
      return { ok: true };
    },
  };
}

// ---- addBlock / summary on their own
{ const day = blank(dayOf((T0 + 120) * 1000)); let prev = null;
  for (let n = 240; n < 250; n++) { const { b, rcs } = block(n); prev = addBlock(day, b, rcs, classify, prev); }
  const s = summary(day);
  ok(day.txs === 30 && day.blocks === 10, "10 blocks, 30 txs");
  ok(day.fail === 10 && Math.abs(s.failRate - 1 / 3) < 1e-9, "a third failed");
  ok(day.usd === 1000, "$1 native a block = $10");
  ok(day.fee === 30 * 420, "fees: 21,000 gas × 20 gwei = $0.00042 each (millionths)");
  ok(day.top[CONTRACT] === 20, "the contract's 20 calls ranked; plain sends left out");
  ok(day.secs >= 4 && day.secs <= 5, "seconds covered from back-to-back blocks: " + day.secs);
  ok(s.peakBlock[0] === 3 && day.first === 240 && day.last === 249, "peak block + first / last");
  ok(s.wallets >= 16 && s.wallets <= 18, "wallets ≈ 17 senders: " + s.wallets);
  ok(s.whale && s.whale[0] === 100, "the biggest move: $1"); }

// ---- the keeper
(async () => {
  const st = { head: 1000, calls: 0 }, store = memStore();
  let clock = (T0 + 500) * 1000;
  const D = makeDaily({ rpc: fakeRpc(st), classify, store, now: () => clock, chunk: 60 });
  let r = await D.collect({ budgetMs: 20000 });
  ok(r.from === 1000 - START_BACK + 1 && r.to === 1000 && r.read === START_BACK, "the first call starts START_BACK blocks back: " + JSON.stringify(r));
  const cur = store.docs.get("arcGalaxyDaily/cursor");
  ok(cur && cur.n === 1000, "the cursor saved at the head");
  ok(![...store.docs.keys()].some((k) => k.includes("DailyLock/")), "the lock freed after the call");
  r = await D.collect(); ok(r.upToDate, "nothing new → up to date");
  st.head = 1300; r = await D.collect();
  ok(r.from === 1001 && r.to === 1300 && r.read === 300, "the next call goes on from the cursor");
  // the blocks span 23:59 → past midnight: two day docs
  const days = [...store.docs.keys()].filter((k) => k.startsWith("arcGalaxyDay/")).sort();
  ok(days.length === 2 && days[0] === "arcGalaxyDay/2026-11-07" && days[1] === "arcGalaxyDay/2026-11-08", "split by UTC day: " + days.join(","));
  const tot = days.map((k) => JSON.parse(store.docs.get(k).j)).reduce((s, d) => s + d.txs, 0);
  ok(tot === (1300 - 880) * 3, "every block counted once: " + tot);
  // a second call while the cursor's lock is held → busy, nothing double counted
  store.docs.set("arcGalaxyDailyLock/1301_" + Math.floor(clock / 300e3), { at: clock });
  st.head = 1400; r = await D.collect(); ok(r.busy === true, "a held lock → busy");
  clock += 300e3; r = await D.collect(); ok(r.from === 1301 && r.read === 100, "the stale lock frees in its slot");
  // a block the node doesn't have yet stops the read there (contiguous)
  st.missing = new Set([1450]); st.head = 1500; r = await D.collect();
  ok(r.to === 1449, "stops before a missing block: " + r.to);
  st.missing = null; r = await D.collect(); ok(r.from === 1450 && r.to === 1500, "and picks it up next time");
  // the budget stops a long read; the next call carries on
  st.head = 2600; let t = 0; const D2 = makeDaily({ rpc: fakeRpc(st), classify, store, now: () => clock + (t += 400), chunk: 60 });
  r = await D2.collect({ budgetMs: 3000 }); ok(r.read > 0 && r.read < 1100 && r.behind > 0, "the budget stops the read: " + r.read);
  const c2 = store.docs.get("arcGalaxyDaily/cursor").n; ok(c2 === r.to, "the cursor kept where it stopped");
  // asleep too long → skip ahead, counted as a gap
  st.head = 2600 + MAX_BEHIND + 500; r = await D.collect();
  ok(r.gap > 0 && r.from === st.head - START_BACK + 1, "a long sleep skips ahead: gap " + r.gap);
  ok(store.docs.get("arcGalaxyDaily/cursor").gaps === r.gap, "the gap remembered");
  // reads
  clock = (T0 + 900) * 1000;
  const L = await D.list(7);
  ok(L.days.length === 2 && L.days[1].d === "2026-11-08" && L.days[1].txs > 0 && L.cursor.n === st.head, "list: the days read + the cursor");
  ok(L.days.every((d) => d.cov >= 0 && d.cov <= 1 && d.wallets > 0), "coverage and wallets in each");
  const one = await D.one("2026-11-08");
  ok(one && one.hTx.length === 24 && one.min.length === 1440 && one.top[0][0] === CONTRACT, "one day in full: hours, minutes, top");
  ok(one.min.reduce((s, v) => s + v, 0) === one.txs, "the minutes add up to the day");
  ok((await D.one("bad")) === null && (await D.one("2020-01-01")) === null, "a bad / empty day → null");
  // a store that's off → nothing
  const off = makeDaily({ rpc: fakeRpc(st), classify, store: { ...memStore(), on: () => false } });
  ok((await off.collect()).skipped, "no store → skipped");
  // wiring
  const tg = fs.readFileSync(new URL("../../api/arcia-tg.mjs", import.meta.url), "utf8"), so = fs.readFileSync(new URL("../../api/social.mjs", import.meta.url), "utf8");
  ok(/galaxyCollect\(/.test(tg) && /Promise\.all\(\[BB\.run/.test(tg), "the every-minute cron runs the keeper beside the buybot");
  ok(/arc"\) === "galaxy-daily"/.test(so) && /arc"\) === "galaxy-collect"/.test(so) && /CRON_SECRET/.test(so), "social: the reads + the keyed keeper");
  console.log(`galaxydaily: ${pass} passed, ${fail} failed`); if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
