# ARC GALAXY v2 — network checks (2026-11-07, ~02:00 UTC, plain Node fetch from a cloud container)

## 1. Arc TESTNET (chain id 5042002 = 0x4cef52)

Official list (docs.arc.network/arc/references/connect-to-arc): rpc.testnet.arc.io, rpc.blockdaemon / drpc / quicknode .testnet.arc.io;
explorer **https://explorer.testnet.arc.io** (Blockscout; testnet.arcscan.app 301 → it); faucet faucet.circle.com.
`https://rpc.testnet.arc.network` also answers (same chain).

| RPC | chainId | blocks/s | tx in 60 blocks | getBlockReceipts | batch 10/50/100 | CORS (Origin www.arcircle.app) |
|---|---|---|---|---|---|---|
| rpc.testnet.arc.network | 5042002 | 0.517 s | 142–174 | yes* | 10/50/100 ok | echoes origin, preflight 204 |
| rpc.testnet.arc.io | 5042002 | 0.500 s | 129–159 | yes* | ok/ok/ok | echoes origin, preflight 204 |
| rpc.blockdaemon.testnet.arc.io | 5042002 | 0.517 s | 262–276 | yes | ok/ok/ok | `*` (preflight 200 `*`) — answers gzip |
| rpc.drpc.testnet.arc.io | 5042002 | 0.517 s | 256 | yes | 10 ok, **>10 refused** (free plan) | `*` / preflight echoes origin |
| rpc.quicknode.testnet.arc.io | 5042002 | 0.517 s | 140–164 | yes* | ok/ok/ok | echoes origin, preflight 204 |

\* the first call answered `-32005 rate limit exceeded` right after a 60-request batch; the same call 3 s later worked. Treat a 60–100 batch
as costing the rate budget — back off ~2 s on -32005.

Testnet load: **~0.5 s blocks, ~4.5–9 tx/s** (the counts moved between runs; Blockscout stats: 1.06 M tx "today", 57 M addresses, avg block 500 ms).
File: testnet.json.

## 2. CCTP V2 on Arc MAINNET (rpc.mainnet.arc.io, blocks 29,913,807 → 29,933,807 ≈ 2.8 h)

eth_getLogs in 2,000-block chunks worked without errors (needs ~0.3 s pause between chunks to avoid -32005). 239 logs.
All four topic0s **confirmed** (I re-hashed the signatures with keccak-256):

| contract | topic0 | event (signature) | n | topics | data |
|---|---|---|---|---|---|
| MessageTransmitter 0x81D4…B64 | 0xff48c13e…db1c | MessageReceived(address indexed caller, uint32 sourceDomain, bytes32 indexed nonce, bytes32 sender, uint32 indexed finalityThresholdExecuted, bytes messageBody) | 90 | sig, caller, nonce, finality | w0 sourceDomain, w1 sender, w2 offset, w3 len, body |
| TokenMessenger 0x28b5…cf5d | 0x50c55e91…ab63 | MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected) | 87 | sig, mintRecipient, mintToken (= 0x3600…0000 USDC) | w0 amount (6 dp), w1 feeCollected |
| MessageTransmitter | 0x8c526166…b036 | MessageSent(bytes message) | 33 | sig only | offset, len, message: version(4) srcDomain(4) dstDomain(4) nonce(32) sender recipient destCaller minFinality(4) finalityExecuted(4) body |
| TokenMessenger | 0x0c8c1cbd…30a5 | DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData) | 29 | sig, burnToken, depositor, minFinalityThreshold | w0 amount, w1 mintRecipient, w2 destinationDomain, w3 destTM, w4 destCaller, w5 maxFee, w6 offset, w7 len, hookData |

**Arc's own domain = 26** (every MessageSent's sourceDomain).

Inbound (MessageReceived sourceDomain): Polygon PoS (7) 27 · Ethereum (0) 26 · Arbitrum (3) 13 · Base (6) 13 · Solana (5) 3 · World Chain (14) 3 · OP (2) 2 · Monad (15) 2 · HyperEVM (19) 1.
Outbound (DepositForBurn destinationDomain): Base 7 · Ethereum 6 · Solana 5 · HyperEVM 4 · Arbitrum 3 · Polygon 3 · Monad 1.
MessageSent 33 vs DepositForBurn 29: 4 extra Arc→Base messages are not burns (other senders) — count bridges by DepositForBurn, not MessageSent.
Volume in the window: **7.73 M USDC minted in** (fees 0.70 USDC), **72 k USDC burned out**. 87 of 90 MessageReceived share their tx with a MintAndWithdraw
(so one inbound bridge tx = MessageReceived + MintAndWithdraw; amount from MintAndWithdraw w0).
Domain names used: 0 Ethereum, 1 Avalanche, 2 OP, 3 Arbitrum, 5 Solana, 6 Base, 7 Polygon PoS, 10 Unichain, 11 Linea, 12 Codex, 13 Sonic, 14 World Chain,
15 Monad, 16 Sei, 17 BNB, 18 XDC, 19 HyperEVM, 21 Ink, 22 Plume, 25 Starknet, 26 Arc (only those seen above are verified against traffic; the names are Circle's list).
Files: cctp-logs.json (2 samples each), cctp-decoded.json.

## 3. Busiest `to` over the last 600 mainnet blocks (head 29,934,4xx; 1,106 tx, ≈ 3.7 tx/s)

| address | txs | symbol / name (eth_call) | code bytes |
|---|---|---|---|
| 0x1df38a762c158e96556596382ea1f74b6bb41b70 | 219 | — | 6,476 |
| 0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1 | 125 | — | 24,546 |
| 0x03a13352ef67977d1601ec1276e9bc27c0ee7b75 | 107 | — | 758 (proxy?) |
| 0x934412cf3a409f009e8c4cc546a4bc03c300e51f | 78 | — | 22,816 |
| 0x43d894e229a008c72e96872739719b9cfda941d5 | 77 | — | 20,472 |
| 0x000000000022d473030f116ddee9f6b43ac78ba3 | 64 | — (Permit2, canonical address) | 9,152 |
| 0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77 | 48 | — | 24,497 |
| 0x7c7e0364d8c04a312abedfd25ab8ce4027dada3c | 29 | EOA | 0 |
| 0x79ba27fee3fb23d23d2069c4526d450bff777777 | 27 | BAGSPAY / BagsPay (18) | 1,526 |
| 0x00c7f157de532f64ad7e7203f745d8595ddea777 | 26 | BAGSPAY / BagsPay (18) | 1,526 |
| 0xc1db5b459bbaf9aedb52e71937566856fee67c4a | 26 | — | 1,167 |
| 0xe4067b5dbb5e04b6ec23c5c4ab2b63320f48e55b | 20 | EOA | 0 |
| 0x0000000071727de22e5e9d8baf0edac6f37da032 | 18 | — (EntryPoint v0.7) | 16,035 |
| 0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789 | 15 | — (EntryPoint v0.6) | 23,689 |
| 0x0a2668e8043c08830f1d200f3e58c0889c8ca959 | 12 | — | 8,647 |
| 0x3600000000000000000000000000000000000000 | 8 | USDC / USDC (6) | 1,798 |
| 0x1f7d7550b1b028f7571e69a784071f0205fd2efa | 7 | — | 21,902 |
| 0x9945bacd9912361f7b184267f0d0b59dec257777 | 7 | Booth / The Motorized DJ Booth (18) | 1,526 |
| 0xb3926def2e0989b0700a57034c9a211bfbcf858b | 6 | — | 194 |
| 0x58327cd3cd1a7df5499e4054489effd183241895 | 6 | — | 3,620 |
| 0x34cd04070dd72b14e241112f6d83812df5af7fcd | 6 | — | 15,582 |
| 0x77905f095fa62fc472e56f17bdc039dc764c1595 | 5 | — | 3,878 |
| 0xc9134c890db35b945b2da15a9a107477a0321bb4 | 5 | — | 14,310 |
| 0xac648340b8c17d29c6a02e5df939fd4f6f9ae697 | 5 | — | 3,620 |
| 0x43cdbf8edb8fe41dde4ba519f49499d1ed78e74a | 5 | — | 9,641 |
| 0x5567954cd026cebfe486062cb75848e0f1c12e58 | 5 | — | 13,884 |
| 0xf35d92db4b155e2b0f1f8f6ff5a8f1cbc34f1777 | 5 | scamsem / scamsem (18) | 1,526 |
| 0x01246ed920dd51b3e46db6ce98d18f6a05142998 | 4 | — | 23,808 |
| 0x0e8da18ded1d2d5d2caed889f7189e0f123ab633 | 4 | — | 24,335 |
| 0x374aaaeb7d93b52143d57f28b75fcb66a3959675 | 4 | — | 23 (EIP-7702 delegated EOA) |

Only plain ERC-20s answer symbol()/name(); the busy routers / apps don't. The ...7777 tokens (1,526-byte clones) look like a launchpad's tokens.
Busiest senders: 0x8e3b…fe77 48, 0x467f…3d3f 26, 0xb143…b048 18 (busy-to.json topFrom).

**explorer.arc.io (mainnet Blockscout) does NOT answer from here:** every /api/v2/... call → **HTTP 403, `cf-mitigated: challenge`** (Cloudflare bot
challenge, HTML "Just a moment..."), with or without an Origin header; the site root answers 200. So no Blockscout names / verified flags for the table
above, and no CORS header to report. A server function (Vercel) will most likely get the same challenge; a real browser on the page may pass it, but
don't build on it — keep names from eth_call + our own LABELS. (I didn't try to get past the challenge.)

**explorer.testnet.arc.io works:** 200, `access-control-allow-origin: *` (+ credentials true, exposes x-ratelimit-*). Same Blockscout v2 shape, e.g. USDC
0x3600…: name "FiatTokenProxy", is_contract true, is_verified true, token {USDC, USDC, ERC-20}, implementations [{name "NativeFiatTokenV2_2"}]
(explorer-testnet-address.sample.json).

Wallet history (testnet shape, explorer-testnet-address-txs.sample.json): `GET /api/v2/addresses/<addr>/transactions` → `{ items[50], next_page_params
{block_number, index, hash, inserted_at, fee, value} }` (pass those back as query params for the next page). Each item: hash, block_number, timestamp
(ISO), from{hash,…}, to{hash, name, is_contract, …} (null for a deploy → created_contract), method (decoded name e.g. "add_liquidity"),
transaction_types ["contract_call" | "coin_transfer" | "token_transfer" | "contract_creation" …], value (wei string), fee, status "ok"/"error",
result ("success" / "execution reverted"), token_transfers, decoded_input, revert_reason. **`filter=to | from` is rejected** (422 "Invalid value for
enum"); use `filter=to` or `filter=from`, or omit it for both.
