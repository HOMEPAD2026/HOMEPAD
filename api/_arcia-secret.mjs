// api/_arcia-secret.mjs — ARCIA's secret file (the "Secret" tab on arcircle.app/arc#arcia).
// A wallet opens it once, for good, by burning 100,000 $ARCIRCLE: a plain $ARCIRCLE transfer to the dead
// address 0x…dEaD, sent by that wallet from the page. Nobody receives the tokens; the burn is the price.
//   GET  /api/arcia?secret=1[&wallet=0x…]   price, how many opened it and how much was burned, whether this wallet has
//   POST /api/arcia { action: "secret-open", wallet, tx, signature }   checks the burn on-chain, then opens it
//   POST /api/arcia { action: "secret-photos", wallet, signature }     the photos (only for a wallet that opened it)
// The signature is a personal_sign of viewMessage(wallet): it proves the wallet is yours and can't move funds.
// The photos are never public: they live in api/_arcia-secret-img.mjs, inside the function bundle.
import { rpcCall, isAddr } from "./_arc.mjs";
import { storeEnabled, getDocs, commit } from "./_store.mjs";
import { personalSigner } from "./_tg-lib.mjs";
import { ARCIRCLE_TOKEN } from "./_arcircle.mjs";

export const PRICE = 100000n * 10n ** 18n;
export const DEAD = "0x000000000000000000000000000000000000dead";
const TOKEN = String(ARCIRCLE_TOKEN || "").toLowerCase();
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const TITLES = ["Dr. ARCIA", "Yoga morning", "Rooftop stretch", "Heist night", "Gym day"];
const lc = (a) => String(a || "").toLowerCase();
export const viewMessage = (wallet) => `Open ARCIA's secret file on arcircle.app\n\nWallet: ${lc(wallet)}\n\nThis signature only proves I own this wallet. It can't move funds.`;

let testStore = null; // tests only
const store = {
  on: () => !!testStore || storeEnabled(),
  get: async (k) => (testStore ? testStore.get(k) : (await getDocs([k]))[k]),
  commit: (w) => (testStore ? testStore.commit(w) : commit(w)),
};

function who(b) {
  const wallet = lc(b.wallet);
  if (!isAddr(wallet)) return { error: "wallet must be an address" };
  const signer = personalSigner(viewMessage(wallet), String(b.signature || ""));
  if (signer !== wallet) return { error: "sign with the wallet that burned" };
  return { wallet };
}

/// GET: price + totals (+ whether this wallet has opened it — its burn is public on-chain anyway)
export async function info(wallet) {
  const out = { price: PRICE.toString(), token: TOKEN, dead: DEAD, photos: TITLES.map((t, i) => ({ n: i + 1, title: t, blur: `/images/arcia-secret/blur-${i + 1}.webp` })), opened: 0, burned: 0, open: false, store: store.on() };
  if (!store.on()) return out;
  const keys = ["arciaSecret/_stats"];
  if (isAddr(wallet)) keys.push(`arciaSecret/${lc(wallet)}`);
  const d = await Promise.all(keys.map((k) => store.get(k).catch(() => null)));
  if (d[0]) { out.opened = Number(d[0].n || 0); out.burned = Number(d[0].burnedK || 0) * 1000; } // whole $ARCIRCLE
  if (d[1]) out.open = true;
  return out;
}

/// POST secret-open: the burn must be a successful $ARCIRCLE transfer of at least the price, from this wallet to 0x…dEaD
export async function open(b, json) {
  if (!store.on()) return json({ error: "not switched on yet" }, 503);
  if (!TOKEN) return json({ error: "$ARCIRCLE isn't live" }, 503);
  const w = who(b);
  if (w.error) return json({ error: w.error }, 403);
  const tx = lc(b.tx);
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return json({ error: "tx must be a transaction hash" }, 400);
  const have = await store.get(`arciaSecret/${w.wallet}`).catch(() => null);
  if (have) return json({ ok: true, already: true });
  const rc = await rpcCall("eth_getTransactionReceipt", [tx]);
  if (!rc) return json({ error: "the burn isn't on-chain yet — try again in a moment" }, 404);
  if (rc.status !== "0x1") return json({ error: "that transaction failed" }, 400);
  let burned = 0n;
  for (const l of rc.logs || []) {
    const t = l.topics || [];
    if (lc(l.address) !== TOKEN || lc(t[0]) !== TRANSFER || t.length < 3) continue;
    if ("0x" + lc(t[1]).slice(26) !== w.wallet || "0x" + lc(t[2]).slice(26) !== DEAD) continue;
    burned += BigInt(l.data && l.data !== "0x" ? l.data : "0x0");
  }
  if (burned < PRICE) return json({ error: "no burn of 100,000 $ARCIRCLE from this wallet in that transaction" }, 400);
  const r = await store.commit([
    { create: `arciaSecretTx/${tx}`, data: { wallet: w.wallet, amount: burned.toString(), at: Date.now() } },
    { create: `arciaSecret/${w.wallet}`, data: { tx, amount: burned.toString(), at: Date.now() } },
    { inc: "arciaSecret/_stats", fields: { n: 1, burnedK: Number(burned / 10n ** 21n) } },
  ]);
  if (r && r.conflict) return json({ ok: true, already: true });
  return json({ ok: true });
}

/// POST secret-photos: data URLs, only for a wallet that opened the file
export async function photos(b, json) {
  if (!store.on()) return json({ error: "not switched on yet" }, 503);
  const w = who(b);
  if (w.error) return json({ error: w.error }, 403);
  const have = await store.get(`arciaSecret/${w.wallet}`).catch(() => null);
  if (!have) return json({ error: "burn 100,000 $ARCIRCLE to open the secret file", locked: true }, 402);
  const { PHOTOS } = await import("./_arcia-secret-img.mjs");
  return json({ ok: true, photos: PHOTOS.map((p, i) => ({ n: i + 1, title: TITLES[i], src: "data:image/webp;base64," + p })) });
}

export const _test = { useStore: (s) => { testStore = s; } };
