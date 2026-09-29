// tools/scan-golden.mjs — Token Scanner regression set. Known token patterns, built as
// scanner inputs, each with the verdict band and critical flags it must get. Run after
// touching api/_scan-core.mjs:   node tools/scan-golden.mjs
// With --reports it also prints which checks people report as wrong most often
// (https://www.arcircle.app/api/social?scanreports=summary), to see where weights need a look.
import * as core from "../api/_scan-core.mjs";

const T = "0x1111111111111111111111111111111111111111";
const W = (i) => "0x" + (0xa000 + i).toString(16).padStart(40, "0");
const E18 = 10n ** 18n;
const supply = (1_000_000n * E18).toString();
const contract = (o = {}) => ({ contract: true, token: true, name: "Test", symbol: "TEST", decimals: 18, supply, owner: null, hasOwnerFn: false, ownerIsContract: false,
  roles: false, proxy: null, powers: [], ownerCtl: null, altAdmins: [], ops: {}, fp: null, generic: true, ...o });
// holders: pool 30%, the rest over `n` wallets (first one `big`% of supply)
function holders({ n = 60, big = 3, pool = 30, deployer = null } = {}) {
  const top = [[core.ADDR.poolManager, (BigInt(pool) * 10_000n * E18).toString()]];
  const restPct = 100 - pool - big;
  top.push([W(0), (BigInt(Math.round(big * 100)) * 100n * E18).toString(), { n: 40 }]);
  for (let i = 1; i < 24; i++) top.push([W(i), ((BigInt(Math.round((restPct / n) * 100)) * 100n) * E18).toString(), { n: 30 }]);
  return { top, holderCount: n, holderCountExact: true, complete: true, deployer, firstMint: { block: 1, ts: 1 }, events: [{ k: "mint", b: 1, v: supply }], links: [], flow: { n: 60, buyers: 40, sellers: 30, top3: 0.2 } };
}
const pair = (o = {}) => ({ pairs: [{ dex: "Uniswap v4", pair: "0x" + "ab".repeat(32), base: "TEST", quote: "USDC", price: 0.001, liq: 60000, mcap: 1_000_000, created: Date.now() / 1000 - 30 * 86400, buys: 300, sells: 250, vol: 40000, links: [{ u: "https://example.org", t: "Website" }], ...o }], source: "dex" });
const leg = (ok, tax = 0) => ({ ok, tax, reason: ok ? "" : "blocked" });
const sim = (o = {}) => ({ supported: true, v: 3, legs: { sell: [{ k: "small", ...leg(true) }, { k: "mid", ...leg(true) }, { k: "large", ...leg(true) }], buy: [{ k: "small", ...leg(true) }], send: leg(true), fresh: { ok1: true, ok2: true, tax: 0 }, twice: { ok1: true, ok2: true }, ...o } });
const lp = { locked: 95, burned: 0, free: 5, soonest: null, forever: true };
const src = { verified: true, name: "Test", compiler: "v0.8.26" };

const CASES = [
  { name: "clean, locked, verified", data: { c: contract(), m: pair(), h: holders(), sim: sim(), lp, src }, band: "ok", crit: [] },
  { name: "sell fails (honeypot)", data: { c: contract(), m: pair(), h: holders(), sim: sim({ sell: [{ k: "small", ...leg(false) }] }), lp, src }, band: "risk", crit: ["Selling fails"] },
  { name: "new buyers can't sell (whitelist honeypot)", data: { c: contract(), m: pair(), h: holders(), sim: sim({ fresh: { ok1: true, ok2: false, reason: "not allowed" } }), lp, src }, band: "risk", crit: ["New buyers can't sell"] },
  { name: "tax jumps to 30% on big sells", data: { c: contract(), m: pair(), h: holders(), sim: sim({ sell: [{ k: "small", ...leg(true, 2) }, { k: "mid", ...leg(true, 2) }, { k: "large", ...leg(true, 30) }] }), lp, src }, band: "risk", crit: ["Tax grows with trade size"] },
  { name: "a wallet can still mint", data: { c: contract({ owner: W(90), hasOwnerFn: true, powers: ["mint"], generic: false }), m: pair(), h: holders(), sim: sim(), lp, src }, band: "care", crit: ["Can mint new tokens"] },
  { name: "one wallet can swap the code", data: { c: contract({ proxy: { impl: W(91), admin: W(92), ctl: { kind: "wallet", addr: W(92) } }, generic: false }), m: pair(), h: holders(), sim: sim(), lp, src }, band: "risk", crit: ["One wallet can swap the code"] },
  { name: "liquidity can be pulled", data: { c: contract(), m: pair(), h: holders(), sim: sim(), lp: { locked: 5, burned: 0, free: 95 }, src }, band: "care", crit: ["Liquidity can be pulled"] },
  { name: "whale holds 40%", data: { c: contract(), m: pair(), h: holders({ big: 40 }), sim: sim(), lp, src }, band: "risk", crit: [] },
  { name: "tiny pool", data: { c: contract(), m: pair({ liq: 600 }), h: holders(), sim: sim(), lp, src }, band: "care", crit: [] },
  { name: "dry run unavailable → not 'Looks OK'", data: { c: contract(), m: pair(), h: holders(), sim: { supported: false, legs: {} }, lp, src }, band: "care", crit: [], conf: "medium" },
  { name: "nothing readable → low confidence", data: { c: contract(), m: null, h: null, sim: null, lp: null, src: null }, band: "care", crit: [], conf: "low" },
  { name: "cooldown between sells", data: { c: contract(), m: pair(), h: holders(), sim: sim({ twice: { ok1: true, ok2: false, reason: "cooldown" } }), lp, src }, band: "ok", crit: [] },
];

let fails = 0;
for (const k of CASES) {
  const r = core.evaluate(T, { ...k.data, now: Date.now() / 1000 });
  const crit = (r.critical || []).map((x) => x.title);
  const ok = r.verdict.k === k.band && k.crit.every((c) => crit.includes(c)) && (!k.conf || r.confidence === k.conf);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${k.name.padEnd(46)} ${String(r.score).padStart(3)} ${r.verdict.t.padEnd(10)} conf=${r.confidence}${crit.length ? "  crit: " + crit.join(", ") : ""}${ok ? "" : `   (wanted ${k.band}${k.crit.length ? " + " + k.crit.join(", ") : ""}${k.conf ? " conf " + k.conf : ""})`}`);
}
if (process.argv.includes("--reports")) {
  try {
    const j = await (await fetch("https://www.arcircle.app/api/social?scanreports=summary")).json();
    console.log("\nMost reported checks:"); (j.checks || []).slice(0, 20).forEach((c) => console.log(String(c.n).padStart(5), c.title));
  } catch (e) { console.log("couldn't read the report summary:", e.message); }
}
console.log(fails ? `\n${fails} case(s) failed` : `\nall ${CASES.length} cases pass`);
process.exitCode = fails ? 1 : 0;
