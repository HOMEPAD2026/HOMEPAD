// agentvault.test.mjs — AGENT DIMENSION AD3 (api/_world-agentvault.mjs): the rules a player sets for their agent's
// trading vault (DCA, buy below, take profit, stop loss; ≤ 100 USDC a trade), linking the vault from the chain, and the
// executor (dry without the key: it decides and records, sends nothing; with it, one trade a vault a run).
// The chain is a fake vault here (the contract itself: contracts/test/agent-dimension.test.js). Run: node tests/world/agentvault.test.mjs
import { ethers } from "ethers";
const { make, loginMessage } = await import("../../api/_world.mjs");
const { recoverSigner } = await import("../../api/social.mjs");
const { decideRule, cleanRule, VAULT } = await import("../../api/_world-agentvault.mjs");
const { AGENT } = await import("../../api/_world-agent.mjs");
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const db = new Map();
const store = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db.has(p) ? structuredClone(db.get(p)) : null])),
  setDoc: async (p, d) => { db.set(p, JSON.parse(JSON.stringify(d))); },
  commit: async () => ({ ok: true }),
};
const json = (status, b, cache) => ({ status, body: b, cache });
let T = Date.parse("2026-10-22T03:00:00Z");
const issuedOk = (iso, max) => { const t = Date.parse(iso); return Number.isFinite(t) && T - t <= max && T - t >= -60e3; };
const me = ethers.Wallet.createRandom(), lc = me.address.toLowerCase();
const FAC = "0x" + "fa".repeat(20), VLT = "0x" + "7a".repeat(20), TOK = "0x" + "11".repeat(20), OTHER = "0x" + "22".repeat(20);
process.env.AGENT_DIM_FACTORY = FAC; process.env.CRON_SECRET = "s3cret"; delete process.env.AGENT_DIM_KEY;
// the fake chain: a vault holding USDC and TOK; the price is USDC per TOK (18 decimals)
const chain = { price: 0.5, usdc: 500_000000n, hold: 0n, maxPerTx: 100_000000n, spendable: 300_000000n, paused: false, agentOn: true, next: 0, allowed: true, owner: lc, sent: [] };
const u = (n) => BigInt(n).toString(16).padStart(64, "0"), addr = (a) => a.replace(/^0x/, "").padStart(64, "0");
const outOf = (buy, amt) => (buy ? (BigInt(amt) * 10n ** 18n) / BigInt(Math.round(chain.price * 1e6)) : (BigInt(amt) * BigInt(Math.round(chain.price * 1e6))) / 10n ** 18n);
const agentVaultIo = {
  calls: async (cs) => cs.map(({ to, data }) => { const f = data.slice(0, data.indexOf(")") + 1), arg = data.slice(f.length);
    if (to === FAC && f === "vaultOf(address)") return "0x" + (arg.endsWith(lc.slice(2)) ? addr(VLT) : u(0));
    if (to === VLT) return "0x" + ({ "owner()": addr(chain.owner), "paused()": u(chain.paused ? 1 : 0), "agentOn()": u(chain.agentOn ? 1 : 0), "maxPerTx()": u(chain.maxPerTx), "spendableToday()": u(chain.spendable), "nextTradeAt()": u(chain.next), "usdcBalance()": u(chain.usdc), "feeBalance()": u(10n ** 21n), "factory()": addr(FAC), "allowed(address)": u(chain.allowed ? 1 : 0) }[f] || u(0));
    if (to === TOK && f === "balanceOf(address)") return "0x" + u(chain.hold);
    if (to === TOK && f === "decimals()") return "0x" + u(18);
    return null; }),
  reverts: async (cs) => cs.map(({ data }) => { const f = data.slice(0, data.indexOf(")") + 1), a = data.slice(f.length); const buy = BigInt("0x" + a.slice(64, 128)) === 1n, amt = BigInt("0x" + a.slice(128, 192)); return f === "quote(address,bool,uint256)" ? "QuoteResult(uint256)" + u(outOf(buy, amt)) : null; }),
  send: async (t) => { chain.sent.push(t); return { ok: true, hash: "0x" + "ab".repeat(32) }; },
  addressOfKey: () => "0x" + "0e".repeat(20),
};
const W = make({ ...store, recover: recoverSigner, issuedOk, json, now: () => T, tokenBalance: async () => "0", agentVaultIo, agentVaultSel: (s) => s });
const sign = async (w) => { const issued = new Date(T).toISOString(); return { wallet: w.address, issued, signature: await w.signMessage(loginMessage(w.address, issued)) }; };
const call = async (w, action, extra = {}) => W.handle({ action, ...(await sign(w)), ...extra });
const view = async () => (await W.read(new URL("https://x/api/social?world=agent-vault&wallet=" + lc))).body;
const tick = async (key = "s3cret") => W.read(new URL("https://x/api/social?world=agent-vault-tick&key=" + key));

// the rules alone
const S = { price: 0.5, dec: 18, hold: 0n, usdc: 500_000000n, maxUsd: 100, spendable: 300, now: T };
check(JSON.stringify(decideRule({ kind: "dca", usd: 20, everyH: 24 }, S)) === JSON.stringify({ buy: true, usd: 20 }), "DCA: the first buy right away");
check(decideRule({ kind: "dca", usd: 20, everyH: 24, lastAt: T - 3600e3 }, S) === null, "DCA: not again within its hours");
check(decideRule({ kind: "dca", usd: 100, everyH: 1 }, { ...S, maxUsd: 40 }).usd === 40, "a buy is cut to the vault's own per-trade limit");
check(decideRule({ kind: "dca", usd: 100, everyH: 1 }, { ...S, spendable: 0.5 }) === null, "today's cap used up: nothing");
check(decideRule({ kind: "buyBelow", price: 0.4, usd: 50 }, S) === null && decideRule({ kind: "buyBelow", price: 0.6, usd: 50 }, S).usd === 50, "buy below a price");
const hold = 1000n * 10n ** 18n; // 1000 TOK = 500 USDC at 0.5
const tp = decideRule({ kind: "takeProfit", price: 0.5, pct: 50 }, { ...S, hold });
check(tp && tp.buy === false && Number(tp.amount) / 1e18 <= 196.01 && Number(tp.amount) / 1e18 > 195, `take profit: half the bag asked, cut to ≤ 100 USDC of it (${tp && Number(tp.amount) / 1e18} TOK)`);
check(decideRule({ kind: "takeProfit", price: 0.6, pct: 50 }, { ...S, hold }) === null, "take profit waits for its price");
check(decideRule({ kind: "stopLoss", price: 0.6, pct: 10 }, { ...S, hold }).amount === 100n * 10n ** 18n, "stop loss sells its share under the price");
check(decideRule({ kind: "stopLoss", price: 0.6, pct: 10, done: 1 }, { ...S, hold }) === null, "a rule that fired once is done");
check(cleanRule({ kind: "dca", token: TOK, usd: 101, everyH: 2 }) === null && cleanRule({ kind: "dca", token: TOK, usd: 0.5, everyH: 2 }) === null, "a rule over 100 USDC (or under 1) is refused");
check(cleanRule({ kind: "nope", token: TOK }) === null && cleanRule({ kind: "dca", token: "x", usd: 5, everyH: 2 }) === null, "an unknown kind or a bad token is refused");

// not open yet: a player who isn't a GM can't link a vault or set rules
{ const r = await call(me, "world-agent-vault-link"); check(r.status === 403 && r.body.closed, "closed: no vault link for a player"); check((await view()).closed === true, "closed: the vault view says so"); }
AGENT.OPEN = true;
// linking and saving
let r = await W.handle({ action: "world-agent-vault-link" }); check(r.status >= 400, "no signature: no link");
const stranger = ethers.Wallet.createRandom();
r = await call(stranger, "world-agent-vault-link"); check(r.status === 404, "no vault on the chain: nothing linked");
r = await call(me, "world-agent-vault-link"); check(r.status === 200 && r.body.vault === VLT, "the vault is read from factory.vaultOf(wallet)");
r = await call(me, "world-agent-rules", { rules: Array.from({ length: 7 }, (_, i) => ({ kind: "dca", token: TOK, usd: 5, everyH: 2, id: "d" + i })) }); check(r.status === 400, "at most 6 rules");
r = await call(me, "world-agent-rules", { rules: [{ id: "dca", kind: "dca", token: TOK, usd: 150, everyH: 24 }] }); check(r.status === 400, "a trade over 100 USDC is refused");
r = await call(me, "world-agent-rules", { rules: [{ id: "dca", kind: "dca", token: TOK, usd: 25, everyH: 24 }, { id: "tp", kind: "takeProfit", token: TOK, price: 0.8, pct: 50 }] });
check(r.status === 200 && r.body.rules.length === 2, "two rules saved");
let v = await view(); check(v.vault === VLT && v.rules.length === 2 && v.live === false && v.max === 100, "the view: the vault, the rules, not live without the key");

// the executor
r = await tick("wrong"); check(r.status === 401, "the run needs the cron secret");
r = await tick(); check(r.status === 200 && r.body.runs[0].dry && chain.sent.length === 0, "no key: it decides (the DCA buy) and sends nothing");
v = await view(); check(/key isn't set/.test(v.log[0].why) && v.log[0].kind === "dca", "the dry run is in the log");
process.env.AGENT_DIM_KEY = "0x" + "1".repeat(64);
r = await tick(); const tx = chain.sent[0];
check(r.body.live && tx && tx.to === VLT && tx.data.startsWith("trade(address,bool,uint256,uint256)"), "with the key: one trade, sent to the vault's trade()");
const args = tx.data.slice("trade(address,bool,uint256,uint256)".length);
check(BigInt("0x" + args.slice(128, 192)) === 25_000000n && BigInt("0x" + args.slice(64, 128)) === 1n, "a 25 USDC buy");
check(BigInt("0x" + args.slice(192, 256)) === (outOf(true, 25_000000n) * 98n) / 100n, "with 2% slippage at most");
r = await tick(); check(chain.sent.length === 1, "the DCA waits its 24 hours");
chain.price = 0.9; chain.hold = 1000n * 10n ** 18n;
r = await tick(); const sell = chain.sent[1];
check(sell && BigInt("0x" + sell.data.slice(35 + 64, 35 + 128)) === 0n, "take profit fires above its price: a sell");
{ const amt = Number(BigInt("0x" + sell.data.slice(35 + 128, 35 + 192))) / 1e18; check(amt * 0.9 <= 100 && amt > 100, `the sell is worth ≤ 100 USDC (${amt.toFixed(2)} TOK)`); }
r = await tick(); check(chain.sent.length === 2, "take profit fired once");
chain.paused = true; T += 25 * 3600e3; r = await tick(); check(chain.sent.length === 2 && /paused/.test(r.body.runs[0].skip), "a vault paused by its owner: nothing");
chain.paused = false; chain.agentOn = false; r = await tick(); check(chain.sent.length === 2 && /agent is off/.test(r.body.runs[0].skip), "the agent turned off on the vault: nothing");
chain.agentOn = true; chain.owner = "0x" + "99".repeat(20); r = await tick(); check(chain.sent.length === 2 && /owner changed/.test(r.body.runs[0].skip), "a vault that changed hands: nothing");
chain.owner = lc; await call(me, "world-agent-rules", { rules: (await view()).rules, on: false }); r = await tick(); check(chain.sent.length === 2 && /off in the game/.test(r.body.runs[0].skip), "off in the game: nothing");
await call(me, "world-agent-rules", { rules: (await view()).rules, on: true }); r = await tick(); check(chain.sent.length === 3, "back on: the next DCA buy (a day later)");
v = await view(); check(v.rules.find((x) => x.id === "tp").done && v.log.length >= 3 && v.log[0].tx, "rules keep their progress; the log has the trades");
delete process.env.AGENT_DIM_KEY;
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
