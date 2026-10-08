// tools/vearcia-stakers.mjs — every wallet staked in veARCIA right now (contracts/ArciaStaking.sol, Robinhood Chain).
// Read-only: no key, no signature, nothing is sent. Needs Node 18+ (built-in fetch), no packages.
//   node tools/vearcia-stakers.mjs            (ROBINHOOD_RPC_URL overrides the public RPC)
// Lists each wallet still holding a position: staked $ARCIA, veARCIA, auto-renew, lock, when it unlocks, rewards
// waiting to be claimed, and what withdrawing everything now would burn (50% on auto-renew; otherwise time left ÷
// the lock's length, at most 50%).
const RPC = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const VEA = "0x29c010620f6720582c310afa8d8115026ec73a7e", FROM = 79655827;
const STAKED = "0xbacd36622e1941346c1191d039c1e7bd8e6a32c477242d72945bd05b7a4da55d";
const SEL = { positions: "0x55f57510", earnedAll: "0x9e88ec10", stakers: "0xfed1252a" };
let id = 0;
async function rpc(method, params) {
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) { if (k === 3) throw e; await new Promise((r) => setTimeout(r, 600 * (k + 1))); }
  }
}
const words = (hex) => { const h = String(hex || "0x").slice(2); const out = []; for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64))); return out; };
const pad = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const tok = (w) => Number(w / 10n ** 12n) / 1e6;
const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const head = parseInt(await rpc("eth_blockNumber", []), 16);
const users = new Set();
let from = FROM, step = 2_000_000;
while (from <= head) {
  const to = Math.min(head, from + step - 1);
  let logs;
  try { logs = await rpc("eth_getLogs", [{ address: VEA, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [STAKED] }]); }
  catch (e) { if (step > 5_000) { step = Math.floor(step / 4); continue; } throw e; }
  for (const l of logs) users.add("0x" + l.topics[1].slice(26));
  from = to + 1;
}
const now = parseInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp, 16);
const rows = [];
for (const u of users) {
  const p = words(await rpc("eth_call", [{ to: VEA, data: SEL.positions + pad(u) }, "latest"]));
  if (!p.length || p[0] === 0n) continue;
  const e = words(await rpc("eth_call", [{ to: VEA, data: SEL.earnedAll + pad(u) }, "latest"]));
  const amount = tok(p[0]), start = Number(p[1]), end = Number(p[2]), lockDays = Number(p[4]), auto = p[5] === 1n;
  let bps = 0;
  if (auto) bps = 5000;
  else if (end > now && end > start) bps = Math.min(5000, Math.floor(((end - now) * 10000) / (end - start)));
  rows.push({
    wallet: u, staked: amount, veARCIA: tok(p[9]), autoRenew: auto, lockDays,
    unlocks: auto ? "auto-renew" : end > now ? new Date(end * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "unlocked",
    rewards: e.length > 2 ? tok(e[2]) : 0, burnIfOutNow: (amount * bps) / 10000, burnPct: bps / 100,
  });
}
rows.sort((a, b) => b.staked - a.staked);
const total = rows.reduce((s, r) => s + r.staked, 0);
console.log(`veARCIA ${VEA} on Robinhood Chain — block ${head}, ${new Date(now * 1000).toISOString()}`);
console.log(`${rows.length} wallets still staked (contract counts ${parseInt(await rpc("eth_call", [{ to: VEA, data: SEL.stakers }, "latest"]), 16)}), ${fmt(total)} $ARCIA in all\n`);
console.table(rows.map((r) => ({ wallet: r.wallet, "staked $ARCIA": fmt(r.staked), veARCIA: fmt(r.veARCIA), "auto-renew": r.autoRenew ? "on" : "off", lock: r.lockDays + "d", unlocks: r.unlocks, "rewards to claim": fmt(r.rewards), "burned if all out now": `${fmt(r.burnIfOutNow)} (${r.burnPct}%)` })));
