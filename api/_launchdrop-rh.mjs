// api/_launchdrop-rh.mjs — the Launch Drop for ArcPad coins on Robinhood Chain (contracts/ArcLaunchDropRH.sol).
//
// Same rule as on Arc: a coin's drop (4% of its supply) belongs to whoever held veARCIRCLE when the week it launched
// began (Thursday 00:00 UTC), pro rata. veARCIRCLE lives on Arc, so the vault on Robinhood Chain takes a Merkle root
// per week instead of reading it:
//   tree(ws)      every veARCIRCLE holder at ws (ArcircleStaking.balanceOfAt, the contract's own history — anyone can
//                 rebuild it), leaf = keccak256(keccak256(abi.encode(holder, ve))), sorted-pair hashing (OpenZeppelin
//                 MerkleProof). Built once per week and stored: launchDropRH/<ws>
//   state(me)     the vault's drops and posted roots, the treasury's to-do (roots to post, coins to deposit), and a
//                 wallet's claims: ve, proof and what it can claim now, per coin
// Read-only and keyless — the treasury wallet posts the root and deposits from the console (arc-launchdrop.js).
import { evmChain } from "./_evm.mjs";
import { keccakHex, pad, strip, isAddr } from "./_arc.mjs";
import * as LD from "./_launchdrop.mjs";
import * as RHP from "./_arcpad-rh.mjs";

const lc = (a) => String(a || "").toLowerCase();
const env = (k) => (typeof process !== "undefined" && process.env ? String(process.env[k] || "").trim() : "");
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");
const sel = (sig) => keccakHex(Buffer.from(sig, "utf8").toString("hex")).slice(0, 10);
const W = (h, i) => { const s = strip(h || ""); return s.length >= (i + 1) * 64 ? BigInt("0x" + s.slice(i * 64, (i + 1) * 64)) : 0n; };
export const VAULT_DEFAULT = ""; // contracts/scripts/deploy-arc-launch-drop-rh.js — filled in once deployed
export const DELAY = 12 * 3600;
export const CFG = {
  vault: () => { const e = env("LAUNCHDROP_RH_ADDRESS"); return isAddr(e) ? lc(e) : isAddr(VAULT_DEFAULT) ? lc(VAULT_DEFAULT) : ""; },
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  now: null, weights: null, coins: null, settle: 600, // a week's tree is built 10 min after it starts (the lock index catches up)
};
export function configure(o) { Object.assign(CFG, o); ch = null; mem.clear(); }
let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: 4663 }));
const mem = new Map();
const T0 = () => (CFG.now ? CFG.now() : Math.floor(Date.now() / 1000));
const VS = {
  dropCount: sel("dropCount()"), tokens: sel("tokens(uint256)"), drops: sel("drops(address)"), roots: sel("roots(uint256)"),
  paid: sel("paid(address,address)"), poster: sel("poster()"), startWeek: sel("startWeek()"),
};

// ---------------- the tree ----------------
const leafOf = (a, ve) => keccakHex(strip(keccakHex(pad(a) + u256(ve))));
const pair = (x, y) => (x < y ? keccakHex(strip(x) + strip(y)) : keccakHex(strip(y) + strip(x)));
/// layers bottom-up over the sorted leaves; an odd node moves up as is
export function build(rows) {
  const leaves = rows.map(([a, ve]) => ({ a: lc(a), ve: BigInt(ve), h: leafOf(a, ve) })).sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0));
  const layers = [leaves.map((l) => l.h)];
  while (layers[layers.length - 1].length > 1) {
    const L = layers[layers.length - 1], up = [];
    for (let i = 0; i < L.length; i += 2) up.push(i + 1 < L.length ? pair(L[i], L[i + 1]) : L[i]);
    layers.push(up);
  }
  const proof = (idx) => {
    const out = [];
    for (let k = 0; k < layers.length - 1; k++) { const sib = idx ^ 1; if (sib < layers[k].length) out.push(layers[k][sib]); idx >>= 1; }
    return out;
  };
  return { root: layers[layers.length - 1][0] || null, leaves, proof };
}
export function verify(proof, root, leaf) { let h = leaf; for (const p of proof) h = pair(h, p); return h === root; }

async function getDoc(store, k) { if (mem.has(k)) return mem.get(k); if (!store) return null; try { return (await store.get(k)) || null; } catch { return null; } }
async function putDoc(store, k, d) { mem.set(k, d); if (store) { try { await store.set(k, d); } catch { /* this instance keeps it */ } } }
/// the veARCIRCLE tree of the week starting `ws` (null until it's settled)
export async function tree(ws, store) {
  ws = LD.weekOf(Number(ws));
  if (ws < LD.CFG.start() || T0() < ws + CFG.settle) return null;
  const k = `launchDropRH/${ws}`;
  const hit = await getDoc(store, k);
  if (hit && hit.v === 1) return hit;
  const rows = CFG.weights ? await CFG.weights(ws) : await LD.weightsAt(ws, store, 1n);
  if (!rows.length) return null;
  const t = build(rows);
  const doc = { v: 1, ws, root: t.root, supply: rows.reduce((s, [, v]) => s + BigInt(v), 0n).toString(), holders: rows.length, rows: rows.map(([a, v]) => [lc(a), BigInt(v).toString()]), made: T0() };
  await putDoc(store, k, doc);
  return doc;
}
/// ve + proof of `me` in the week's tree (null if not in it)
function proofIn(doc, me) {
  const t = build(doc.rows);
  const i = t.leaves.findIndex((l) => l.a === me);
  if (i < 0) return null;
  return { ve: t.leaves[i].ve.toString(), proof: t.proof(i) };
}

// ---------------- the vault ----------------
async function calls(list) { const out = []; for (let i = 0; i < list.length; i += 100) out.push(...(await chain().ethCalls(list.slice(i, i + 100)))); return out; }
async function vaultDrops(V) {
  const [cnt] = await chain().ethCalls([{ to: V, data: VS.dropCount }]);
  const n = Math.min(cnt ? Number(BigInt(cnt)) : 0, 500);
  if (!n) return [];
  const toks = (await calls(Array.from({ length: n }, (_, i) => ({ to: V, data: VS.tokens + u256(i) })))).map((h) => lc("0x" + strip(h).slice(24, 64)));
  const d = await calls(toks.map((t) => ({ to: V, data: VS.drops + pad(t) })));
  return toks.map((t, i) => ({ token: t, ws: Number(W(d[i], 0)), amount: W(d[i], 1).toString(), claimed: W(d[i], 2).toString() }));
}
async function rootsOf(V, weeks) {
  const r = weeks.length ? await calls(weeks.map((w) => ({ to: V, data: VS.roots + u256(w) }))) : [];
  return new Map(weeks.map((w, i) => { const root = "0x" + strip(r[i] || "").slice(0, 64).padEnd(64, "0"); const at = Number(W(r[i], 2)); return [w, at ? { root, supply: W(r[i], 1).toString(), postedAt: at, opensAt: at + DELAY } : null]; }));
}

/// everything the Launch Drop card shows for Robinhood Chain
export async function state({ store, me = "" } = {}) {
  const V = CFG.vault();
  if (!V) return { live: false };
  me = isAddr(me) ? lc(me) : "";
  const t = T0();
  const [drops, coins] = await Promise.all([vaultDrops(V).catch(() => []), (CFG.coins ? CFG.coins() : RHP.list().then((l) => l.coins)).catch(() => [])]);
  const start = LD.CFG.start(), per = LD.perCoin();
  const sym = new Map(coins.map((c) => [lc(c.token), c.symbol || "?"]));
  const ours = coins.filter((c) => c.launchedAt >= start).map((c) => ({ token: lc(c.token), sym: c.symbol || "?", launchedAt: c.launchedAt, ws: LD.weekOf(c.launchedAt) }));
  const weeks = [...new Set([...ours.map((c) => c.ws), ...drops.map((d) => d.ws)])].filter((w) => w <= t).sort((a, b) => b - a);
  const posted = await rootsOf(V, weeks);
  const trees = new Map();
  for (const w of weeks.slice(0, 12)) trees.set(w, await tree(w, store).catch(() => null));
  const have = new Map(drops.map((d) => [d.token, BigInt(d.amount)]));
  // the treasury's to-do: roots to post (or that don't match the tree), coins whose 4% isn't in yet
  const roots = weeks.slice(0, 12).map((w) => {
    const tr = trees.get(w), p = posted.get(w);
    return { ws: w, tree: tr ? { root: tr.root, supply: tr.supply, holders: tr.holders } : null, posted: p, match: !!(tr && p && p.root === tr.root && p.supply === tr.supply), open: !!(p && t >= p.opensAt) };
  });
  const waiting = ours.filter((c) => (have.get(c.token) || 0n) < per).map((c) => ({ ...c, deposited: (have.get(c.token) || 0n).toString(), need: (per - (have.get(c.token) || 0n)).toString() }));
  // a wallet's claims
  let mine = null;
  if (me) {
    const paid = drops.length ? await calls(drops.map((d) => ({ to: V, data: VS.paid + pad(d.token) + pad(me) }))) : [];
    mine = [];
    drops.forEach((d, i) => {
      const tr = trees.get(d.ws), p = posted.get(d.ws);
      if (!tr || !p || p.root !== tr.root) return;
      const pr = proofIn(tr, me);
      if (!pr) return;
      const amt = BigInt(d.amount), owed = (amt * BigInt(pr.ve)) / BigInt(p.supply), done = W(paid[i], 0), left = amt - BigInt(d.claimed);
      let c = owed > done ? owed - done : 0n; if (c > left) c = left;
      mine.push({ token: d.token, sym: sym.get(d.token) || "?", ws: d.ws, ve: pr.ve, proof: pr.proof, owed: owed.toString(), paid: done.toString(), claimable: t >= p.opensAt ? c.toString() : "0", opensAt: p.opensAt, open: t >= p.opensAt });
    });
  }
  return {
    live: true, vault: V, start, per: per.toString(), delay: DELAY,
    drops: drops.map((d) => ({ ...d, sym: sym.get(d.token) || "?" })).reverse(), roots, waiting, mine,
  };
}
/// a wallet's ve + proof for one week (for anyone who wants to claim from the contract directly)
export async function proof({ store, ws, me }) {
  if (!isAddr(me)) return { error: "bad wallet" };
  const tr = await tree(ws, store);
  if (!tr) return { error: "no tree for that week yet" };
  const p = proofIn(tr, lc(me));
  return p ? { ws: tr.ws, root: tr.root, supply: tr.supply, ...p } : { ws: tr.ws, root: tr.root, supply: tr.supply, ve: "0", proof: [] };
}
export const _test = { build, verify, leafOf, proofIn };
