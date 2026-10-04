// api/_vearcia.mjs — veARCIA (contracts/ArciaStaking.sol on Robinhood Chain): the $ARCIRCLE holder boost.
//   holding(wallet)   $ARCIRCLE the wallet holds: on Arc (in the wallet + locked in ARCIRCLE Staking) and on
//                     Robinhood Chain (ArcircleOFT)
//   boostNote(wallet) the tier (0 none · 1 ≥1M → 1.2x · 2 ≥5M → 1.5x · 3 ≥10M → 2.0x) signed by ARCIA_BOOST_KEY, ready
//                     for ArciaStaking.applyBoost(wallet, tier, issued, until, signature). A note lasts 3 days.
//   state()           totals, the reward streams, every staker (from the Staked events) with the top 20 by veARCIA, the
//                     $ARCIA pool's history — cached 30 s, the event scan kept in the store and read forward
//   me(wallet)        a wallet's position, tier, rank and its last 30 actions (stake, compound, claim, withdraw, boost)
//   card(wallet)      the share card's numbers (/vearcia/<wallet>)
//   veTierOf(wallet)  0 none · 1 Bronze ≥10K · 2 Silver ≥100K · 3 Gold ≥1M · 4 Diamond ≥5M veARCIA (perks, badges)
//   tick()            the keeper (GET /api/desk?veatick=1&key=…): pokes ended locks and lapsed boosts, and applies a
//                     lower signed boost to stakers whose $ARCIRCLE dropped below their tier. Key: VEARCIA_KEEPER_KEY,
//                     else ORDERS_KEEPER_RH_KEY / ORDERS_KEEPER_KEY (a little ETH on Robinhood Chain for gas)
// The key only signs these notes (it holds nothing and sends no transactions). Contract: env VEARCIA_ADDRESS ("none"
// turns it off), else VEARCIA_DEFAULT.
import { evmChain } from "./_evm.mjs";
import { RPCS } from "./_arc.mjs";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const VEARCIA_DEFAULT = ""; // contracts/scripts/deploy-arcia-staking-rh.js — filled in once deployed
export const VEARCIA_DEFAULT_BLOCK = 0;
const env = (k) => String(process.env[k] || "").trim();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const E18 = 10n ** 18n;
export const TIERS = [0n, 1_000_000n * E18, 5_000_000n * E18, 10_000_000n * E18]; // tier i from TIERS[i] $ARCIRCLE
export const BOOST_BPS = [10000, 12000, 15000, 20000];

export const CFG = {
  arcRpcs: () => [env("ARC_RPC_URL"), ...RPCS].filter(Boolean),
  rhRpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  chainId: 4663,
  address: () => { const e = env("VEARCIA_ADDRESS"); if (e === "none") return null; return isAddr(e) ? lc(e) : isAddr(VEARCIA_DEFAULT) ? lc(VEARCIA_DEFAULT) : null; },
  fromBlock: () => Number(env("VEARCIA_BLOCK")) || VEARCIA_DEFAULT_BLOCK || 0,
  key: () => env("ARCIA_BOOST_KEY") || null,
  arcircle: "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7", // $ARCIRCLE on Arc
  staking: "0x301e1e8dcb43cdddd3244889063ad4220536b38a", // ARCIRCLE Staking (veARCIRCLE) on Arc: locked $ARCIRCLE counts
  arcircleRh: "0x6f9ebd0dfc6de9ed47eec18efeb69a9b97c71ee4", // $ARCIRCLE on Robinhood Chain (ArcircleOFT)
  ttl: 3 * 86400,
  keeperKey: () => env("VEARCIA_KEEPER_KEY") || env("ORDERS_KEEPER_RH_KEY") || env("ORDERS_KEEPER_KEY") || null,
  logStep: 2_000_000, // blocks per eth_getLogs (halved on refusal)
  store: () => (storeEnabled() ? { get: async (k) => (await getDocs([k]))[k], set: (k, d) => setDoc(k, d) } : null),
  now: () => Math.floor(Date.now() / 1000),
};
export function configure(o) { Object.assign(CFG, o); arc = rh = null; mem.scan = mem.state = null; mem.at = 0; }
let arc = null, rh = null;
const arcChain = () => (arc = arc || evmChain({ rpcs: CFG.arcRpcs, chainId: 5042 }));
const rhChain = () => (rh = rh || evmChain({ rpcs: CFG.rhRpcs, chainId: CFG.chainId }));

const hexToBytes = (h) => { h = String(h).replace(/^0x/, ""); if (h.length % 2) h = "0" + h; const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16); return a; };
const bytesToHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const addrWord = (a) => lc(a).replace(/^0x/, "").padStart(64, "0");
const sel = (sig) => bytesToHex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4)).slice(2);
const SEL_BAL = sel("balanceOf(address)"), SEL_LOCKED = sel("locked(address)");
const keyBytes = (k) => (/^(0x)?[0-9a-fA-F]{64}$/.test(String(k || "")) ? hexToBytes(k) : null);
export const signerOf = (k) => { const sk = keyBytes(k); return sk ? bytesToHex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1)).subarray(12)) : null; };

async function call(ch, to, data) {
  const r = await ch.rpcCall("eth_call", [{ to, data: "0x" + data }, "latest"]);
  return r && r !== "0x" ? r : "0x0";
}
const first = (hex) => BigInt("0x" + (String(hex).replace(/^0x/, "").slice(0, 64) || "0"));

/// $ARCIRCLE the wallet holds, in wei: Arc wallet + Arc veARCIRCLE lock + Robinhood Chain wallet. A chain that can't be
/// read counts as 0 (and is named in `missing`).
export async function holding(wallet) {
  const w = addrWord(wallet), missing = [];
  const safe = (p, what) => p.then(first).catch(() => { missing.push(what); return 0n; });
  const [arcBal, locked, rhBal] = await Promise.all([
    safe(call(arcChain(), CFG.arcircle, SEL_BAL + w), "arc"),
    safe(call(arcChain(), CFG.staking, SEL_LOCKED + w), "staking"), // locked(address) → (uint128 amount, uint64 end, bool permanent)
    safe(call(rhChain(), CFG.arcircleRh, SEL_BAL + w), "robinhood"),
  ]);
  return { arc: arcBal, staked: locked, rh: rhBal, total: arcBal + locked + rhBal, missing };
}
export const tierOf = (total) => { let t = 0; for (let i = 1; i < TIERS.length; i++) if (total >= TIERS[i]) t = i; return t; };

/// keccak256(abi.encode(keccak256("veARCIA boost"), chainid, contract, user, tier, issued, until)) — ArciaStaking.boostHash
export function boostHash(contract, user, tier, issued, until, chainId = CFG.chainId) {
  const type = bytesToHex(keccak_256(new TextEncoder().encode("veARCIA boost"))).slice(2);
  return keccak_256(hexToBytes(type + word(chainId) + addrWord(contract) + addrWord(user) + word(tier) + word(issued) + word(until)));
}
export function signNote(key, contract, user, tier, issued, until, chainId = CFG.chainId) {
  const sk = keyBytes(key); if (!sk) throw new Error("no signing key");
  const h = boostHash(contract, user, tier, issued, until, chainId);
  const prefix = new TextEncoder().encode("\x19Ethereum Signed Message:\n32");
  const msg = new Uint8Array(prefix.length + 32); msg.set(prefix); msg.set(h, prefix.length);
  const sig = secp256k1.sign(keccak_256(msg), sk, { prehash: false, format: "recovered" });
  return bytesToHex(sig.subarray(1, 33)) + bytesToHex(sig.subarray(33, 65)).slice(2) + (27 + sig[0]).toString(16);
}

/// The signed boost note for `wallet` (or why there isn't one).
export async function boostNote(wallet) {
  if (!isAddr(wallet)) return { ok: false, error: "wallet must be an address" };
  const contract = CFG.address();
  const h = await holding(wallet);
  const tier = tierOf(h.total);
  const out = { ok: true, wallet: lc(wallet), tier, bps: BOOST_BPS[tier], held: (h.total / E18).toString(), parts: { arc: (h.arc / E18).toString(), staked: (h.staked / E18).toString(), robinhood: (h.rh / E18).toString() }, missing: h.missing, next: tier < 3 ? (TIERS[tier + 1] / E18).toString() : null, contract, chainId: CFG.chainId };
  const key = CFG.key();
  if (!contract || !key) return { ...out, signed: false, reason: !contract ? "veARCIA isn't deployed yet" : "boost signing isn't switched on yet" };
  if (h.missing.length) return { ...out, signed: false, reason: "couldn't read every chain — try again in a moment" }; // never sign a tier read from a partial view
  const issued = CFG.now(), until = issued + CFG.ttl;
  return { ...out, signed: true, issued, until, signature: signNote(key, contract, wallet, tier, issued, until), signer: signerOf(key) };
}

// ================================================================ reading the contract
const E = (h) => BigInt(h || "0x0");
const words = (hex) => { const s = String(hex || "").replace(/^0x/, ""); const out = []; for (let i = 0; i + 64 <= s.length; i += 64) out.push(BigInt("0x" + s.slice(i, i + 64))); return out; };
const F = (w) => Number(w) / 1e18;
export const VE_TIERS = [["", 0], ["Bronze", 10_000], ["Silver", 100_000], ["Gold", 1_000_000], ["Diamond", 5_000_000]];
export const veTier = (ve) => { let t = 0; for (let i = 1; i < VE_TIERS.length; i++) if (ve >= VE_TIERS[i][1]) t = i; return t; };
const S = {
  stats: sel("stats()"), stakers: sel("stakers()"), streamCount: sel("streamCount()"), streamInfo: sel("streamInfo(uint256)"),
  positions: sel("positions(address)"), earnedAll: sel("earnedAll(address)"), owner: sel("owner()"),
  poke: sel("poke(address[])"), applyBoost: sel("applyBoost(address,uint8,uint64,uint64,bytes)"),
};
const TOPIC = (sig) => bytesToHex(keccak_256(new TextEncoder().encode(sig)));
export const EV = {
  Staked: TOPIC("Staked(address,address,uint256,uint256,uint256,uint256,uint256)"),
  Withdrawn: TOPIC("Withdrawn(address,uint256,uint256,uint256)"),
  Compounded: TOPIC("Compounded(address,uint256)"),
  AutoRenew: TOPIC("AutoRenew(address,bool,uint256)"),
  Claimed: TOPIC("Claimed(address,uint256,uint256)"),
  Boosted: TOPIC("Boosted(address,uint8,uint256)"),
  PoolChanged: TOPIC("PoolChanged(uint256,uint256,uint256,uint256)"),
};
const posOf = (hex) => {
  const w = words(hex); if (w.length < 11) return null;
  return { amount: F(w[0]), start: Number(w[1]), end: Number(w[2]), lockBps: Number(w[3]), lockDays: Number(w[4]), auto: w[5] === 1n, tier: Number(w[6]), boostUntil: Number(w[7]), ve: F(w[9]), weight: F(w[10]) };
};

/// every wallet that ever staked, from Staked events — scanned forward from the last block read (kept in the store)
async function stakersScan(ch, addr) {
  const st = CFG.store(), key = `vearcia/scan_${addr}`;
  let doc = (st && (await st.get(key).catch(() => null))) || mem.scan || { to: CFG.fromBlock() - 1, users: [], pools: [] };
  const head = parseInt(await ch.rpcCall("eth_blockNumber", []), 16);
  let from = Math.max(doc.to + 1, CFG.fromBlock()), step = CFG.logStep, n = 0;
  const users = new Set(doc.users || []), pools = doc.pools || [];
  const t0 = Date.now();
  while (from <= head && n < 40 && Date.now() - t0 < 6000) {
    const to = Math.min(head, from + step - 1);
    let logs;
    try { logs = await ch.getLogs({ address: addr, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [[EV.Staked, EV.PoolChanged]] }); }
    catch (e) { if (step > 10_000) { step = Math.floor(step / 4); continue; } throw e; }
    for (const l of logs) {
      if (l.topics[0] === EV.Staked) users.add("0x" + l.topics[1].slice(26));
      else if (E(l.topics[1]) === 0n) { const w = words(l.data); pools.push({ b: parseInt(l.blockNumber, 16), pool: F(w[0]), perDay: F(w[1]), finish: Number(w[2]) }); }
    }
    from = to + 1; n++;
  }
  doc = { to: from - 1, users: [...users], pools: pools.slice(-60) };
  mem.scan = doc;
  if (st) st.set(key, doc).catch(() => {});
  return doc;
}
const mem = { scan: null, state: null, at: 0, ts: new Map() };
async function blockTs(ch, b) {
  if (mem.ts.has(b)) return mem.ts.get(b);
  const blk = await ch.rpcCall("eth_getBlockByNumber", ["0x" + b.toString(16), false]).catch(() => null);
  const t = blk ? parseInt(blk.timestamp, 16) : 0;
  if (t) mem.ts.set(b, t);
  if (mem.ts.size > 3000) mem.ts.clear();
  return t;
}

/// the whole picture: totals, streams, stakers (top 20 by veARCIA), the $ARCIA pool's history
export async function state(fresh = false) {
  const addr = CFG.address();
  if (!addr) return { live: false, tiers: VE_TIERS.slice(1).map(([n, v]) => ({ name: n, ve: v })) };
  if (!fresh && mem.state && Date.now() - mem.at < 30_000) return mem.state;
  const ch = rhChain();
  const [statsHex, stakersHex, ncHex, ownerHex] = await ch.ethCalls([{ to: addr, data: "0x" + S.stats }, { to: addr, data: "0x" + S.stakers }, { to: addr, data: "0x" + S.streamCount }, { to: addr, data: "0x" + S.owner }]);
  const w = words(statsHex);
  const n = Number(E(ncHex)) || 1;
  const infos = await ch.ethCalls(Array.from({ length: n }, (_, i) => ({ to: addr, data: "0x" + S.streamInfo + word(i) })));
  const streams = infos.map((h, i) => { const x = words(h); return { i, token: x.length ? "0x" + x[0].toString(16).padStart(40, "0") : null, pool: x[1] || 0n, perDay: x[2] || 0n, finish: Number(x[3] || 0n), streamed: x[4] || 0n, claimed: x[5] || 0n }; });
  const scan = await stakersScan(ch, addr).catch(() => mem.scan || { users: [], pools: [] });
  const users = (scan.users || []).slice(0, 2000);
  const pos = users.length ? await ch.ethCalls(users.map((u) => ({ to: addr, data: "0x" + S.positions + addrWord(u) }))) : [];
  const list = users.map((u, k) => ({ a: u, ...(posOf(pos[k]) || {}) })).filter((x) => x.amount > 0).sort((x, y) => y.ve - x.ve);
  const blk = await ch.rpcCall("eth_getBlockByNumber", ["latest", false]).catch(() => null);
  const now = blk ? parseInt(blk.timestamp, 16) : CFG.now(); // the chain's clock: what the contract compares against
  const out = {
    live: true, address: addr, chainId: CFG.chainId, now, owner: ownerHex ? "0x" + ownerHex.slice(-40) : null,
    totals: { pool: F(w[0] || 0n), perDay: F(w[1] || 0n), finish: Number(w[2] || 0n), staked: F(w[3] || 0n), ve: F(w[4] || 0n), weight: F(w[5] || 0n), streamed: F(w[6] || 0n), claimed: F(w[7] || 0n), burned: F(w[8] || 0n), stakers: Number(E(stakersHex)) || list.length },
    streams: streams.map((s) => ({ i: s.i, token: s.token, pool: Number(s.pool), perDay: Number(s.perDay), finish: s.finish, streamed: Number(s.streamed), claimed: Number(s.claimed) })), // raw units (each token's own decimals)
    top: list.slice(0, 20).map((x, r) => ({ rank: r + 1, a: x.a, amount: x.amount, ve: x.ve, lockDays: x.lockDays, auto: x.auto, tier: x.tier, veTier: veTier(x.ve), end: x.end })),
    stakers: list.map((x) => ({ a: x.a, ve: x.ve, end: x.end, auto: x.auto, lockBps: x.lockBps, tier: x.tier, boostUntil: x.boostUntil })),
    pools: scan.pools || [],
    tiers: VE_TIERS.slice(1).map(([nm, v]) => ({ name: nm, ve: v })),
  };
  // the history points get their times (a few blocks, cached)
  for (const p of out.pools.slice(-30)) if (!p.t) p.t = await blockTs(ch, p.b);
  mem.state = out; mem.at = Date.now();
  return out;
}

/// one wallet: its position, rank and tier, and its last actions
export async function me(wallet) {
  if (!isAddr(wallet)) return { ok: false, error: "wallet must be an address" };
  const addr = CFG.address(), u = lc(wallet);
  if (!addr) return { ok: true, live: false };
  const ch = rhChain();
  const [ph, eh] = await ch.ethCalls([{ to: addr, data: "0x" + S.positions + addrWord(u) }, { to: addr, data: "0x" + S.earnedAll + addrWord(u) }]);
  const p = posOf(ph) || null;
  const ew = words(eh); const earned = ew.length > 2 ? ew.slice(2).map((x) => x.toString()) : [];
  const st = await state().catch(() => null);
  const rank = st ? st.stakers.findIndex((x) => x.a === u) + 1 : 0;
  // the last actions: this wallet's events (topic 1 = the wallet), newest first
  const hist = [];
  try {
    const head = parseInt(await ch.rpcCall("eth_blockNumber", []), 16);
    const span = Math.min(CFG.logStep * 3, head - CFG.fromBlock() + 1);
    const from = Math.max(CFG.fromBlock(), head - span + 1);
    const logs = await ch.getLogs({ address: addr, fromBlock: "0x" + from.toString(16), toBlock: "0x" + head.toString(16), topics: [[EV.Staked, EV.Withdrawn, EV.Compounded, EV.Claimed, EV.Boosted, EV.AutoRenew], "0x" + addrWord(u)] });
    for (const l of logs.slice(-30).reverse()) {
      const x = words(l.data), b = parseInt(l.blockNumber, 16), t0 = l.topics[0];
      const kind = t0 === EV.Staked ? "stake" : t0 === EV.Withdrawn ? "withdraw" : t0 === EV.Compounded ? "compound" : t0 === EV.Claimed ? "claim" : t0 === EV.Boosted ? "boost" : "auto";
      const row = { kind, b, tx: l.transactionHash };
      if (kind === "stake") { row.amount = F(x[0]); row.days = Number(x[2]); }
      else if (kind === "withdraw") { row.amount = F(x[0]); row.penalty = F(x[1]); }
      else if (kind === "compound") row.amount = F(x[0]);
      else if (kind === "claim") { row.stream = Number(E(l.topics[2])); row.raw = x[0].toString(); row.amount = row.stream === 0 ? F(x[0]) : null; }
      else if (kind === "boost") { row.tier = Number(x[0]); row.until = Number(x[1]); }
      else row.on = x[0] === 1n;
      hist.push(row);
    }
    for (const r of hist.slice(0, 30)) r.t = await blockTs(ch, r.b);
  } catch { /* the history is a nice-to-have */ }
  const claimed = hist.filter((r) => r.kind === "claim" && r.stream === 0).reduce((s, r) => s + r.amount, 0) + hist.filter((r) => r.kind === "compound").reduce((s, r) => s + r.amount, 0);
  return { ok: true, live: true, wallet: u, position: p, earned, rank, stakers: st ? st.totals.stakers : null, veTier: p ? veTier(p.ve) : 0, history: hist, received: claimed };
}

/// the share card: amount, veARCIA, lock, rank, tier
export async function card(wallet) {
  const m = await me(wallet);
  if (!m.ok || !m.live || !m.position || !(m.position.amount > 0)) return { ok: true, live: !!m.live, position: null };
  return { ok: true, live: true, position: m.position, rank: m.rank, stakers: m.stakers, veTier: m.veTier, tierName: VE_TIERS[m.veTier][0], received: m.received };
}

/// 0…4 for perks and badges (cached a minute)
const tierMem = new Map();
export async function veTierOf(wallet) {
  const addr = CFG.address(); if (!addr || !isAddr(wallet)) return 0;
  const u = lc(wallet), c = tierMem.get(u);
  if (c && Date.now() - c.at < 60_000) return c.t;
  // never hold a chat or a comment up for this: 1.5 s, then "no tier"
  const h = await Promise.race([rhChain().rpcCall("eth_call", [{ to: addr, data: "0x" + S.positions + addrWord(u) }, "latest"]).catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]);
  const p = posOf(h);
  const t = p ? veTier(p.ve) : 0;
  tierMem.set(u, { t, at: Date.now() });
  if (tierMem.size > 5000) tierMem.clear();
  return t;
}

// ================================================================ the keeper
const encPoke = (users) => "0x" + S.poke + word(32) + word(users.length) + users.map(addrWord).join("");
function encApply(user, tier, issued, until, sig) {
  const s = String(sig).replace(/^0x/, ""), len = s.length / 2, padded = s.padEnd(Math.ceil(len / 32) * 64, "0");
  return "0x" + S.applyBoost + addrWord(user) + word(tier) + word(issued) + word(until) + word(5 * 32) + word(len) + padded;
}
export { encPoke, encApply };

/// pokes ended locks and lapsed boosts; lowers boosts whose $ARCIRCLE dropped (up to `maxDown` a run)
export async function tick({ maxDown = 8, dry = false } = {}) {
  const addr = CFG.address();
  if (!addr) return { ok: false, skipped: "not deployed" };
  const key = CFG.keeperKey();
  const st = await state(true);
  const now = st.now;
  const stale = st.stakers.filter((x) => (!x.auto && x.end && x.end <= now && x.lockBps > 10000) || (x.tier > 0 && x.boostUntil <= now)).map((x) => x.a).slice(0, 60);
  const out = { ok: true, stakers: st.stakers.length, poke: stale.length, lowered: [], sent: [] };
  if (!key) return { ...out, ok: false, skipped: "no keeper key" };
  const ch = rhChain();
  if (stale.length && !dry) { const r = await ch.sendTx({ to: addr, data: encPoke(stale), key }).catch((e) => ({ error: String(e.message || e).slice(0, 120) })); out.sent.push({ poke: stale.length, ...r }); }
  const bkey = CFG.key();
  if (bkey) {
    const boosted = st.stakers.filter((x) => x.tier > 0 && x.boostUntil > now).slice(0, 40);
    for (const x of boosted) {
      if (out.lowered.length >= maxDown) break;
      const h = await holding(x.a).catch(() => null);
      if (!h || h.missing.length) continue; // never lower on a partial read
      const t = tierOf(h.total);
      if (t >= x.tier) continue;
      const issued = Math.max(now, CFG.now()), until = issued + CFG.ttl;
      const sig = signNote(bkey, addr, x.a, t, issued, until);
      out.lowered.push({ a: x.a, from: x.tier, to: t });
      if (!dry) { const r = await ch.sendTx({ to: addr, data: encApply(x.a, t, issued, until, sig), key }).catch((e) => ({ error: String(e.message || e).slice(0, 120) })); out.sent.push({ lower: x.a, ...r }); }
    }
  }
  return out;
}
