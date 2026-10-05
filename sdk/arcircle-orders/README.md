# arcircle-orders

A small client for **ARCIRCLE Orders**: limit, stop, TP/SL, scaled and grid orders on Uniswap v4 pools, on Arc (USDC) and Robinhood Chain (ETH). Docs and the app: https://www.arcircle.app/arc#orders

Your tokens stay in your wallet until an order fills. Orders are EIP-712 signatures from your own wallet. This package never holds a key and never signs anything by itself.

```js
import { OrdersClient, viewMessage, verifyWebhook } from "arcircle-orders";
const rh = new OrdersClient({ chain: "rh" });

const { markets } = await rh.markets();          // every market, its price and day
const book = await rh.book("0x…token");           // price levels, recent fills, 24h numbers
const stop = rh.follow((fill) => console.log(fill.sym, fill.side, fill.price)); // public fills, no wallet named
```

## Placing an order

```js
import { ethers } from "ethers";
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
// 1. approve the sell token to the Orders contract (rh.chain.orders) yourself
// 2. build, sign, place
const order = rh.limit({ maker: await signer.getAddress(), sell: WETH, buy: TOKEN, sellAmount, buyAmount, epoch });
const sig = await rh.sign(order, signer);
await rh.place({ token: TOKEN, key: poolKey, order, sig });
```

A grid's sell waits on its buy. Place the buy first, then the sell with `after: await rh.hash(buyOrder)`. The sell joins the book once that buy fills.

## Your orders and a webhook

Sign `viewMessage(wallet, until)` once with `signer.signMessage`. It is good for up to 30 days. With that signature:

- `rh.mine(wallet, until, sig)` lists your orders.
- `rh.setWebhook({ wallet, until, sig, url })` sends your wallet's events (fills, triggered stops, near-price heads-ups, armed grid sells) to your https URL as JSON. The secret is returned once.

To check a delivery:

```js
const ok = await verifyWebhook(rawBody, req.headers["x-arcircle-signature"], secret);
```

## Risks

The contracts are new and not audited. Their source is public on the explorers. A limit order fills only if a wallet or the pool meets its price. Nothing here is financial advice.
