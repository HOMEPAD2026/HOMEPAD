// api/_world-land.mjs — ARCIRCLE LAND: the first 20 villages of the LAND DISTRICT, bought with $ARCIRCLE.
//
//   A village is bought with the buyer's own transfer of $ARCIRCLE to the ARCIRCLE treasury; the game never holds it.
//   1. reserve  a 5-minute hold on one village (one a wallet), so two people don't pay for the same one at once; the
//               chain's current block is noted, so an older transfer can't stand in for this payment
//   2. pay      the wallet sends the price to LAND.treasury
//   3. confirm  the server reads the receipt: $ARCIRCLE, from that wallet, to the treasury, after the hold's block, a
//               transaction once. Owning is a create (worldLandOwn/<n>), so only one owner can ever win.
//   A payment that can't buy (the village went to someone else first, the wallet already owns one, less than the
//   price) is kept in the refund list for the team to send back (the GM marks it refunded with the return transaction).
//   One village a wallet. No resale or transfer for now. The owner's island (world-island.js) stands on their village
//   in the LAND DISTRICT, and owners build bigger: 64×64 and up to LAND.bricks bricks (api/_world.mjs islandSave).
//   (The prices are the owner's plan v1.1. Village production is planned and isn't part of this.)
//
//   GET  ?world=land[&wallet=0x…]                       → { villages: [{ n, id, price, status, owner, name }], mine, hold, treasury, token, refunds }
//   GET  ?world=land-refunds                            → { list } (every payment waiting to be sent back)
//   POST world-land-reserve  { …sig, n }                → { ok, n, price, amount, to, token, exp }
//   POST world-land-confirm  { …sig, n, tx }            → { ok, village } · 202 { pending } until the chain shows it
//   POST world-land-refunded { …sig (a GM), tx, back }  → { ok } (the payment was sent back in transaction back)
//
// Firestore: worldLand/<n> { owner, at, tx, price } · worldLandOwn/<n> · worldLandBy/<w> { n } (both created once) ·
//            worldLandRes/<n> { w, exp } · worldLandResW/<w> { n, blk, at } · worldLandTx/<tx> · worldLandRefund/<tx>
const lc = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(lc(s));
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PRICES = [100000, 150000, 200000, 300000, 400000, 500000, 650000, 800000, 1000000, 1250000, 1500000, 1800000, 2200000, 2700000, 3300000, 4000000, 5000000, 6500000, 8000000, 10000000];
export const LAND = {
  treasury: "0xa066e6c5d1ac561a4065b9d6b00fef89c0bd02f8", // the ARCIRCLE treasury (config-arc.js PLATFORM_WALLET)
  holdMs: 5 * 60e3, bricks: 20000, size: 64,
  villages: PRICES.map((price, i) => ({ n: i + 1, id: "V" + String(i + 1).padStart(2, "0"), price })),
};
export const villageOf = (n) => LAND.villages[Number(n) - 1] || null;
const weiOf = (tokens) => BigInt(tokens) * 10n ** 18n;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), receipt(tx), blockNumber?(), token, nameOf(w) }
export function makeLand(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const ownerOf = async (w) => { const d = await one(`worldLandBy/${lc(w)}`); return d ? d.n : 0; };
  async function refund(tx, w, n, wei, why) {
    await setDoc(`worldLandRefund/${tx}`, { tx, w, n, amount: wei.toString(), tokens: Number(wei / 10n ** 14n) / 1e4, why, at: now(), back: "" });
    const L = (await one("worldStats/landRefunds")) || {}, list = Array.isArray(L.list) ? L.list : [];
    if (!list.includes(tx)) await setDoc("worldStats/landRefunds", { list: [tx, ...list].slice(0, 200) });
  }
  async function reserve(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, v = villageOf(b.n);
    if (!v) return json(400, { error: "no such village" });
    const t = now();
    const [mine, own, res, resW] = await Promise.all([ownerOf(w), one(`worldLandOwn/${v.n}`), one(`worldLandRes/${v.n}`), one(`worldLandResW/${w}`)]);
    if (mine) return json(409, { error: "you already own a village", mine });
    if (own) return json(409, { error: "this village is sold" });
    if (res && res.w !== w && res.exp > t) return json(409, { error: "someone is buying this village right now — try again in a few minutes", exp: res.exp });
    // one hold a wallet: holding another village lets that one go
    if (resW && resW.n !== v.n) { const old = await one(`worldLandRes/${resW.n}`); if (old && old.w === w) await setDoc(`worldLandRes/${resW.n}`, { ...old, exp: 0 }); }
    let blk = "0x0"; if (deps.blockNumber) { try { blk = String(await deps.blockNumber()); } catch { blk = "0x0"; } }
    const exp = t + LAND.holdMs;
    await setDoc(`worldLandRes/${v.n}`, { w, exp });
    const back = await one(`worldLandRes/${v.n}`); if (!back || back.w !== w) return json(409, { error: "someone is buying this village right now — try again in a few minutes" });
    await setDoc(`worldLandResW/${w}`, { n: v.n, blk, at: t });
    return json(200, { ok: true, n: v.n, id: v.id, price: v.price, amount: weiOf(v.price).toString(), to: LAND.treasury, token: lc(deps.token), exp });
  }
  async function confirm(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, v = villageOf(b.n), tx = lc(b.tx);
    if (!v) return json(400, { error: "no such village" });
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
    if (await one(`worldLandTx/${tx}`)) return json(409, { error: "this transaction was already used" });
    const resW = await one(`worldLandResW/${w}`);
    if (!resW || resW.n !== v.n) return json(400, { error: "reserve the village before paying for it" });
    if (!deps.receipt) return json(503, { error: "the chain can't be read right now" });
    const rc = await deps.receipt(tx).catch(() => null);
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    if (rc.blockNumber && resW.blk && BigInt(rc.blockNumber) <= BigInt(resW.blk)) return json(400, { error: "this transaction is older than your reservation" });
    const paid = (rc.logs || []).filter((l) => lc(l.address) === lc(deps.token) && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(LAND.treasury)).reduce((a, l) => a + BigInt(l.data), 0n);
    if (paid <= 0n) return json(400, { error: "no $ARCIRCLE went from your wallet to the treasury in this transaction" });
    if (!(await commit([{ create: `worldLandTx/${tx}`, data: { w, n: v.n, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    if (paid < weiOf(v.price)) { await refund(tx, w, v.n, paid, "less than the price"); return json(400, { error: "the payment is less than the price — it's on the refund list", refund: true }); }
    const won = (await commit([{ create: `worldLandOwn/${v.n}`, data: { w, at: now() } }, { create: `worldLandBy/${w}`, data: { n: v.n, at: now() } }])).ok;
    if (!won) {
      const mine = await ownerOf(w);
      await refund(tx, w, v.n, paid, mine ? "already owns a village" : "sold to someone else first");
      return json(409, { error: mine ? "you already own a village — this payment is on the refund list" : "someone else bought this village first — your payment is on the refund list", refund: true });
    }
    const village = { owner: w, at: now(), tx, price: v.price, paid: paid.toString() };
    await setDoc(`worldLand/${v.n}`, village);
    await setDoc(`worldLandRes/${v.n}`, { w, exp: 0 }).catch(() => {});
    await commit([{ inc: "worldStats/land", fields: { sold: 1 } }]).catch(() => {});
    return json(200, { ok: true, village: { n: v.n, id: v.id, ...village } });
  }
  async function refunded(b) {
    const s = signer(b); if (s.err) return s.err;
    if (!deps.isGM(s.wallet)) return json(403, { error: "only a GM wallet can mark a refund" });
    const tx = lc(b.tx), back = lc(b.back);
    if (!/^0x[0-9a-f]{64}$/.test(tx) || !/^0x[0-9a-f]{64}$/.test(back)) return json(400, { error: "that isn't a transaction hash" });
    const r = await one(`worldLandRefund/${tx}`); if (!r) return json(404, { error: "no such refund" });
    await setDoc(`worldLandRefund/${tx}`, { ...r, back, backAt: now() });
    return json(200, { ok: true });
  }
  async function view(w) {
    const t = now(), ns = LAND.villages.map((v) => v.n);
    const docs = await getDocs([...ns.map((n) => `worldLand/${n}`), ...ns.map((n) => `worldLandRes/${n}`)]);
    const villages = await Promise.all(LAND.villages.map(async (v) => {
      const d = docs[`worldLand/${v.n}`], r = docs[`worldLandRes/${v.n}`];
      const held = !d && r && r.exp > t;
      return { n: v.n, id: v.id, price: v.price, status: d ? "sold" : held ? "held" : "open", owner: d ? d.owner : "", name: d ? (await deps.nameOf(d.owner).catch(() => "")) || "" : "", at: d ? d.at : 0, tx: d ? d.tx : "", heldBy: held ? (r.w === w ? "you" : "other") : "", heldUntil: held ? r.exp : 0 };
    }));
    return { villages, sold: villages.filter((x) => x.status === "sold").length, treasury: LAND.treasury, token: lc(deps.token), holdMs: LAND.holdMs, perks: { size: LAND.size, bricks: LAND.bricks } };
  }
  return {
    ownerOf,
    async read(v, url) {
      if (v === "land") {
        const w = lc(url && url.searchParams && url.searchParams.get("wallet"));
        if (!w) return json(200, await view(""), "public, max-age=15");
        if (!isAddr(w)) return json(400, { error: "wallet must be an address" });
        const base = await view(w), mine = await ownerOf(w);
        const refunds = ((((await one("worldStats/landRefunds")) || {}).list) || []).slice(0, 60);
        const rs = refunds.length ? Object.values(await getDocs(refunds.map((x) => `worldLandRefund/${x}`))).filter((r) => r && r.w === w) : [];
        return json(200, { ...base, mine, refunds: rs }, "no-store");
      }
      if (v === "land-refunds") {
        const list = (((await one("worldStats/landRefunds")) || {}).list) || [];
        const docs = list.length ? await getDocs(list.map((x) => `worldLandRefund/${x}`)) : {};
        return json(200, { list: list.map((x) => docs[`worldLandRefund/${x}`]).filter(Boolean) }, "no-store");
      }
      return null;
    },
    async handle(b) {
      if (b.action === "world-land-reserve") return reserve(b);
      if (b.action === "world-land-confirm") return confirm(b);
      if (b.action === "world-land-refunded") return refunded(b);
      return null;
    },
  };
}
