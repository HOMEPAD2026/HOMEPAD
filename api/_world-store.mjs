// api/_world-store.mjs — the Studio's ASSET STORE (2026-10-29, the owner): 15 Meshy models in five kinds, one free and two
// premium in each (world-store-data.js STORE). A premium asset is bought with $ARCIRCLE from the player's own wallet: a
// transfer of STORE.PRICE to FeeBurn (half burned, half to the treasury — the same contract as the agent and the SECRET), and
// the server only reads the receipt back (the Transfer from this wallet to FeeBurn, each transaction used once: worldPayTx).
//   GET  ?world=studio-store[&wallet=0x…]            → { items, cats, price, burnPct, owned: [ids], pay }
//   POST { action: "world-studio-store-buy", …sig, id, tx } → { ok, owned }
//   POST { action: "world-studio-store-dl",  …sig, id }     → { ok, url, name } (free ones, or ones you own)
// owns(w, ids) lets the Studio refuse to save a course that uses a premium asset its maker hasn't bought.
// Firestore: worldStoreOwn/<wallet> { ids } · worldPayTx/<tx> · worldStats/store { sold, arc, burned, dl }
import { STORE, storeItem, storeGlb } from "../world-store-data.js";
import { ARCIRCLE, FEE_BURN } from "./_world-shop.mjs";

const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
export const storePay = () => ({ price: STORE.PRICE, to: FEE_BURN, token: ARCIRCLE, amount: (BigInt(STORE.PRICE) * 10n ** 18n).toString(), burnPct: STORE.BURN_PCT });

export function makeStore(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const ownedOf = async (w) => ((w && (await one(`worldStoreOwn/${w}`))) || {}).ids || [];
  const card = (it) => ({ id: it.id, file: it.file, cat: it.cat, free: !!it.free, name: it.name, line: it.line, h: it.h });
  async function view(w) { return json(200, { items: STORE.ITEMS.map(card), cats: STORE.CATS.map(([id]) => id), price: STORE.PRICE, burnPct: STORE.BURN_PCT, owned: await ownedOf(w), pay: storePay() }, "no-store"); }
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, it = storeItem(String(b.id || ""));
    if (!it) return json(404, { error: "no such asset" }); if (it.free) return json(400, { error: "this one is free" });
    if ((await ownedOf(w)).includes(it.id)) return json(200, { ok: true, owned: await ownedOf(w), already: true });
    const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "which transaction?", pay: storePay() });
    const txk = `worldPayTx/${tx}`; if (await one(txk)) return json(409, { error: "this transaction was already used" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const paid = (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(FEE_BURN)).reduce((x, l) => x + BigInt(l.data), 0n);
    if (paid < BigInt(STORE.PRICE) * 10n ** 18n) return json(400, { error: `the transfer is less than ${STORE.PRICE.toLocaleString("en-US")} $ARCIRCLE` });
    if (!(await commit([{ create: txk, data: { wallet: w, item: "store-" + it.id, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    const ids = [...new Set([...(await ownedOf(w)), it.id])]; await setDoc(`worldStoreOwn/${w}`, { ids, at: now() });
    const tok = Number(paid / 10n ** 12n) / 1e6;
    await commit([{ inc: "worldStats/store", fields: { sold: 1, arc: tok, burned: tok * STORE.BURN_PCT / 100 } }, { inc: "worldStats/shop", fields: { paid: 1, arcPaid: tok, arcBurned: tok * STORE.BURN_PCT / 100 } }]);
    return json(200, { ok: true, owned: ids });
  }
  async function dl(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, it = storeItem(String(b.id || "")); if (!it) return json(404, { error: "no such asset" });
    if (!it.free && !(await ownedOf(w)).includes(it.id)) return json(403, { error: "buy it first", pay: storePay() });
    await commit([{ inc: "worldStats/store", fields: { dl: 1 } }]).catch(() => {});
    return json(200, { ok: true, url: storeGlb(it), name: `ARCIRCLE-${it.file}.glb` });
  }
  /// the premium store assets in `ids` this wallet doesn't own (a course may only use what its maker has)
  async function missing(w, ids) { const own = await ownedOf(w); return (ids || []).filter((id) => { const it = storeItem(id); return it && !it.free && !own.includes(id); }); }
  return {
    missing,
    async read(v, url) { if (v === "studio-store") { const a = url.searchParams.get("wallet"); return view(isAddr(a) ? lc(a) : ""); } return null; },
    async handle(b) { if (b.action === "world-studio-store-buy") return buy(b); if (b.action === "world-studio-store-dl") return dl(b); return null; },
  };
}
