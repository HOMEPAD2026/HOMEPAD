// api/_tg-buybot-rh.mjs — the Telegram buy & burn alerts for $ARCIA on Robinhood Chain (ARCIA's own Pons launch,
// 0xF0C0…CA25), the $ARCIA every alert follows since 4 Oct 2026. api/_tg-buybot.mjs calls pass() on each poll.
// A buy is a $ARCIA Transfer to the wallet that sent the transaction with ETH attached (a buy on Pons' curve or, once
// graduated, through a router into its Uniswap v4 pool): what it got is the Transfer, what it spent is the
// transaction's ETH (dollars at the current ETH price). A burn is a Transfer to 0x…dEaD.
import { evmChain } from "./_evm.mjs";

const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const lc = (a) => String(a || "").toLowerCase();
export const ARCIA_RH = "0xf0c0fc281314a48ae4e52a9db08731cb6a38ca25";
export const CFG = {
  rpcs: () => [env("ROBINHOOD_RPC_URL"), "https://rpc.mainnet.chain.robinhood.com"].filter(Boolean),
  chainId: 4663,
  token: ARCIA_RH,
  explorer: "https://robinhoodchain.blockscout.com",
  buyUrl: `https://www.ponsfamily.com/launchpad/${ARCIA_RH}`,
  chartUrl: `https://dexscreener.com/robinhood/${ARCIA_RH}`,
  maxRange: 20000, // blocks per poll; further behind than this (downtime), old buys aren't news
  ethUsd: async () => { try { const P = await import("./_pons-arcpad.mjs"); return await P.ethUsd(); } catch { return null; } },
};
export function configure(o) { Object.assign(CFG, o || {}); ch = null; }
let ch = null;
const chain = () => (ch = ch || evmChain({ rpcs: CFG.rpcs, chainId: CFG.chainId }));
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";
const SEL = { decimals: "0x313ce567", totalSupply: "0x18160ddd", balanceOf: "0x70a08231" };
const pad = (a) => lc(a).replace(/^0x/, "").padStart(64, "0");
const topicAddr = (t) => lc("0x" + String(t || "").slice(26));
const qty = (n) => "0x" + Number(n).toString(16);

/// the followed coin's entry in the buybot's token list (kept with its decimals and supply)
export function entry(S) {
  let tk = S.tokens.find((t) => t.t === CFG.token);
  if (!tk) { tk = { t: CFG.token, chain: "rh", sym: "ARCIA", symFixed: true }; S.tokens.unshift(tk); }
  tk.chain = "rh";
  return tk;
}
export async function fill(tk) {
  if (tk.dec != null && tk.supply && Date.now() - (tk.at || 0) < 3600e3) return tk;
  tk.at = Date.now();
  const [d, s] = await chain().ethCalls([{ to: tk.t, data: SEL.decimals }, { to: tk.t, data: SEL.totalSupply }]);
  if (d) tk.dec = Number(BigInt(d));
  if (s) tk.supply = BigInt(s).toString();
  return tk;
}
/// the share of the supply at 0x…dEaD now (for burn alerts)
export async function burnedPct(tk) {
  const [b] = await chain().ethCalls([{ to: tk.t, data: SEL.balanceOf + pad(DEAD) }]);
  return b && tk.supply ? (Number(BigInt(b)) / Number(BigInt(tk.supply))) * 100 : null;
}

/// Transfer logs → buys: [{ tk, tx, idx, block, eth, usd, tokens, px, buyer, held, fresh }]
export async function toBuys(tk, logs) {
  const by = new Map(); // one buy per transaction and buyer
  for (const l of logs) {
    const from = topicAddr(l.topics[1]), to = topicAddr(l.topics[2]);
    if (to === DEAD || to === ZERO || from === ZERO) continue;
    const k = lc(l.transactionHash) + ":" + to;
    const b = by.get(k) || { tk, tx: lc(l.transactionHash), idx: parseInt(l.logIndex, 16), block: parseInt(l.blockNumber, 16), buyer: to, raw: 0n };
    b.raw += BigInt(l.data || "0x0");
    by.set(k, b);
  }
  const cands = [...by.values()];
  if (!cands.length) return [];
  const txs = [...new Set(cands.map((b) => b.tx))];
  const res = await chain().rpc(txs.map((h, id) => ({ jsonrpc: "2.0", id, method: "eth_getTransactionByHash", params: [h] }))).catch(() => []);
  const tx = new Map((Array.isArray(res) ? res : [res]).filter((x) => x && x.result).map((x) => [txs[x.id], x.result]));
  const buys = cands.filter((b) => { const t = tx.get(b.tx); return t && lc(t.from) === b.buyer && BigInt(t.value || "0x0") > 0n; });
  if (!buys.length) return [];
  const usdPerEth = await CFG.ethUsd();
  const dec = tk.dec != null ? tk.dec : 18;
  buys.forEach((b) => { b.eth = Number(BigInt(tx.get(b.tx).value)) / 1e18; b.tokens = Number(b.raw) / 10 ** dec; b.usd = usdPerEth ? b.eth * usdPerEth : null; b.px = b.usd != null && b.tokens > 0 ? b.usd / b.tokens : null; delete b.raw; });
  const bal = await chain().ethCalls(buys.map((b) => ({ to: tk.t, data: SEL.balanceOf + pad(b.buyer) }))).catch(() => []);
  buys.forEach((b, i) => { const held = bal[i] ? Number(BigInt(bal[i])) / 10 ** dec : null; b.held = held; b.fresh = held != null && held <= b.tokens * 1.02; });
  return buys;
}

/// one poll on Robinhood Chain: new buys (returned, for the caller to post) and burns (into S.burnPend)
export async function pass(S) {
  const tk = entry(S);
  await fill(tk);
  const R = (S.rh = S.rh || { hi: 0, seen: [], burnSeen: [] });
  const head = (await chain().latestBlock()).number;
  let from = R.hi ? R.hi + 1 : head - 30;
  if (head - from > CFG.maxRange) from = head - 2000;
  from = Math.max(0, from);
  if (from > head) return [];
  const logs = await chain().getLogs({ address: tk.t, topics: [TRANSFER], fromBlock: qty(from), toBlock: qty(head) });
  // burns: gathered like the Arc coins' (api/_tg-buybot.mjs flushBurns posts them)
  for (const l of logs || []) {
    if (topicAddr(l.topics[2]) !== DEAD) continue;
    const key = `${l.transactionHash}:${parseInt(l.logIndex, 16)}`;
    if (R.burnSeen.includes(key)) continue;
    R.burnSeen = [...R.burnSeen, key].slice(-300);
    const p = S.burnPend[tk.t] || (S.burnPend[tk.t] = { tok: 0, n: 0, txs: [], froms: [] });
    p.tok += Number(BigInt(l.data || "0x0")) / 10 ** (tk.dec != null ? tk.dec : 18); p.n++;
    p.txs = [...p.txs, l.transactionHash].slice(-12);
    p.froms = [...p.froms, topicAddr(l.topics[1])].slice(-12);
  }
  const buys = (await toBuys(tk, logs || [])).filter((b) => !R.seen.includes(`${b.tx}:${b.buyer}`));
  buys.forEach((b) => { R.seen = [...R.seen, `${b.tx}:${b.buyer}`].slice(-200); });
  R.hi = head;
  return buys;
}
/// the latest buy in the last few thousand blocks (for /buybot test)
export async function latestBuy(S) {
  const tk = entry(S);
  await fill(tk);
  const head = (await chain().latestBlock()).number;
  for (let to = head, k = 0; k < 4; k++, to -= CFG.maxRange) {
    const logs = await chain().getLogs({ address: tk.t, topics: [TRANSFER], fromBlock: qty(Math.max(0, to - CFG.maxRange + 1)), toBlock: qty(to) });
    const buys = await toBuys(tk, (logs || []).slice(-60));
    if (buys.length) return buys[buys.length - 1];
  }
  return null;
}
