// arcircle-orders — a small client for ARCIRCLE Orders (https://www.arcircle.app/arc#orders).
// Reads are plain HTTPS (no key). Orders are EIP-712 signatures made by the maker's own wallet; this file never holds a
// private key and never signs on its own — you pass a signer (ethers v6) and approve the sell token yourself.
export const CHAINS = {
  arc: { id: "arc", chainId: 5042, orders: "0x1A31C2539d6e3fBdF276E8D74bA67aEc4De9008e", quote: "USDC" },
  rh: { id: "rh", chainId: 4663, orders: "0xa53dBd06d8c604107e1Fe1B5936EFCf32D895eE3", quote: "ETH" },
};
export const ORDER_TYPES = {
  Order: [["maker", "address"], ["sell", "address"], ["buy", "address"], ["sellAmount", "uint256"], ["buyAmount", "uint256"], ["triggerSqrtP", "uint160"], ["triggerBelow", "bool"], ["poolId", "bytes32"], ["expiry", "uint64"], ["start", "uint64"], ["duration", "uint32"], ["group", "uint256"], ["epoch", "uint32"], ["salt", "uint256"]].map(([name, type]) => ({ name, type })),
};
const ZERO32 = "0x" + "0".repeat(64);
const json = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

/// new OrdersClient({ chain: "rh" }) — base defaults to https://www.arcircle.app
export class OrdersClient {
  constructor({ chain = "arc", base = "https://www.arcircle.app", fetch: f = globalThis.fetch } = {}) {
    if (!CHAINS[chain]) throw new Error(`chain is "arc" or "rh"`);
    this.chain = CHAINS[chain]; this.base = base.replace(/\/$/, ""); this.f = f;
  }
  url(q) { return `${this.base}/api/social?${q}${this.chain.id === "rh" ? "&chain=rh" : ""}`; }
  async get(q) { const r = await this.f(this.url(q)); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; }
  async post(body) { const r = await this.f(`${this.base}/api/social`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...json(body), chain: this.chain.id === "rh" ? "rh" : undefined }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; }
  // ---- reads
  markets() { return this.get("orders=markets"); }
  book(token) { return this.get(`orders=book&token=${token}`); }
  pools(token) { return this.get(`orders=pools&token=${token}`); }
  candles(poolId) { return this.get(`orders=candles&pool=${poolId}`); }
  explore() { return this.get("orders=explore"); }
  stats() { return this.get("orders=stats"); }
  status() { return this.get("orders=status"); }
  /// the public fills after a cursor (each fill's id) — no wallet named
  feed(since = 0, limit = 100) { return this.get(`orders=feed&since=${since}&limit=${limit}`); }
  /// follow fills as they happen: onFill(fill) for each; returns stop(). Uses EventSource where there is one, else polls the feed.
  follow(onFill, { since = 0, everyMs = 4000 } = {}) {
    let stop = false, es = null, cur = since;
    if (typeof EventSource !== "undefined") {
      es = new EventSource(this.url(`orders=stream${cur ? `&since=${cur}` : ""}`));
      es.addEventListener("fill", (m) => { try { const e = JSON.parse(m.data); cur = Math.max(cur, e.id); onFill(e); } catch { /* skip */ } });
      return () => { stop = true; es.close(); };
    }
    (async () => {
      if (!cur) cur = (await this.feed(0, 1).catch(() => ({ seq: 0 }))).seq || 0;
      while (!stop) {
        const f = await this.feed(cur).catch(() => null);
        for (const e of (f && f.list) || []) { cur = Math.max(cur, e.id); onFill(e); }
        await new Promise((r) => setTimeout(r, everyMs));
      }
    })();
    return () => { stop = true; };
  }
  // ---- orders
  domain() { return { name: "ARCIRCLE Orders", version: "1", chainId: this.chain.chainId, verifyingContract: this.chain.orders }; }
  /// a limit order: sell `sellAmount` of `sell` for at least `buyAmount` of `buy` (both in base units; the 0.1% fee is
  /// taken from what you receive, so a page-made order asks for buyAmount × 0.999). epoch: the contract's epochOf(maker).
  limit({ maker, sell, buy, sellAmount, buyAmount, expiry = Math.floor(Date.now() / 1000) + 7 * 86400, epoch = 0, salt }) {
    return { maker, sell, buy, sellAmount: BigInt(sellAmount), buyAmount: BigInt(buyAmount), triggerSqrtP: 0n, triggerBelow: false, poolId: ZERO32, expiry: BigInt(expiry), start: 0n, duration: 0, group: 0n, epoch, salt: salt != null ? BigInt(salt) : BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000)) };
  }
  /// the order's hash (what a grid's sell names as `after`)
  async hash(order) { const { TypedDataEncoder } = await import("ethers"); return TypedDataEncoder.hash(this.domain(), ORDER_TYPES, order); }
  /// signed by your wallet (an ethers v6 Signer) — nothing else signs
  sign(order, signer) { return signer.signTypedData(this.domain(), ORDER_TYPES, order); }
  /// place a signed order. key: the pool key { currency0, currency1, fee, tickSpacing, hooks }. extra: { after } for a
  /// sell that waits on your buy, { cond } for a price condition, { trail, parts, leg, triggerPrice } as the page sends them.
  place({ token, key, order, sig, ...extra }) { return this.post({ action: "orderplace", token, key, order: json(order), sig, ...extra }); }
  /// your orders and webhooks open with one signed message, good for 30 days: signer.signMessage(viewMessage(wallet, until))
  mine(wallet, until, sig) { return this.get(`orders=mine&wallet=${wallet}&until=${until}&sig=${sig}`); }
  setWebhook({ wallet, until, sig, url }) { return this.post({ action: "orderhook", wallet, until, sig, url }); }
  removeWebhook({ wallet, until, sig }) { return this.post({ action: "orderhook", wallet, until, sig, remove: true }); }
}
/// the message a wallet signs (personal_sign) once to open its orders, alerts and webhook for up to 30 days
export const viewMessage = (wallet, until) => `ARCIRCLE Orders: show my orders\n${String(wallet).toLowerCase()}\nuntil ${Number(until)}`;
/// check a webhook delivery: the raw body, the x-arcircle-signature header and your secret → true / false
export async function verifyWebhook(rawBody, header, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(rawBody)));
  const want = "sha256=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (typeof header !== "string" || header.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return d === 0;
}
