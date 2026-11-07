# Arc chain sample — 2026-11-07T01:14:08.384Z

## RPCs
- https://rpc.mainnet.arc.io: block 29927962, chain 5042, 243 ms
- https://rpc.drpc.mainnet.arc.io: block 29927962, chain 5042, 150 ms
- https://rpc.quicknode.mainnet.arc.io: block 29927962, chain 5042, 214 ms
- https://rpc.blockdaemon.mainnet.arc.io: block 29927964, chain 5042, 543 ms
Using **https://rpc.mainnet.arc.io**

## a) Block rate
- eth_blockNumber 29927964 → 29927984 in 10.1 s = **1.98 blocks/s**
- last 60 blocks (29927925…29927984): timestamps span 30 s → mean block time 0.508 s; gaps (s) min 0 / max 1; distinct gap values: [0,1]
- txs: 110 total, per block min 0 / median 1 / max 8 → **3.67 TPS** over the span
- block fields: hash, parentHash, sha3Uncles, miner, stateRoot, transactionsRoot, receiptsRoot, logsBloom, difficulty, number, gasLimit, gasUsed, timestamp, extraData, mixHash, nonce, baseFeePerGas, withdrawalsRoot, blobGasUsed, excessBlobGas, parentBeaconBlockRoot, requestsHash, size, uncles, transactions, withdrawals
- gasLimit 30000000, baseFeePerGas 20000000000 wei

## b) Receipts
- eth_getBlockReceipts on https://rpc.mainnet.arc.io: yes (0 receipts)
- eth_getBlockReceipts on https://rpc.drpc.mainnet.arc.io: yes (0 receipts)
- eth_getBlockReceipts on https://rpc.quicknode.mainnet.arc.io: yes (0 receipts)
- eth_getBlockReceipts on https://rpc.blockdaemon.mainnet.arc.io: yes (0 receipts)
- block 29927984: 1 txs, receipts 1
- block 29927983: 2 txs, receipts 2
- block 29927981: 2 txs, receipts 2

## c) WebSocket newHeads
- wss://rpc.mainnet.arc.io: works — 3 heads, last 29927990
- wss://rpc.drpc.mainnet.arc.io: works — 3 heads, last 29927992
- wss://rpc.quicknode.mainnet.arc.io: works — 3 heads, last 29927995
- wss://rpc.blockdaemon.mainnet.arc.io: error Received network error or non-101 status code.

## d) JSON-RPC batches
- https://rpc.mainnet.arc.io: 10: 10/10 ok · 50: 50/50 ok · 100: 100/100 ok · 200: 40/200 ok err {"code":-32005,"message":"rate limit exceeded"}
- https://rpc.drpc.mainnet.arc.io: 10: 10/10 ok · 50: 0/50 ok err {"message":"Batch of more than 10 requests are not allowed on free plan, to use 
- https://rpc.quicknode.mainnet.arc.io: 10: 10/10 ok · 50: 50/50 ok · 100: 100/100 ok · 200: 40/200 ok err {"code":-32005,"message":"rate limit exceeded"}
- https://rpc.blockdaemon.mainnet.arc.io: 10: 10/10 ok · 50: 50/50 ok · 100: 100/100 ok · 200: refused (HTTP 200 {"code":-32600,"message":"batch size 200 exceeds limit of 100"}) err {"code":-32600,"message":"batch size 200 exceeds limit of 100"}

## e) Last 300 blocks
- blocks 29927699…29927998: 300 read, 559 txs over 152 s → 3.68 TPS; empty blocks 64
- contract deployments (to == null): 0
- native-value transfers (value > 0): 110; calls with no input: 46
- tx types: {"0x0":142,"0x2":417}
- receipts read 559: failed (status 0) **2** (0.36 %), logs 2902 (5.19 a tx)

### Top 40 `to` addresses
| # | address | txs | top selectors |
|---|---|---|---|
| 1 | 0x03a13352ef67977d1601ec1276e9bc27c0ee7b75 | 118 | 0x797af627×59 0x38aaba3d×53 0xbd66528a×3 |
| 2 | 0x1df38a762c158e96556596382ea1f74b6bb41b70 | 89 | 0x05f1065f×5 0x04f1065f×5 0x06f1065f×5 |
| 3 | 0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1 | 45 | 0x24856bc3×41 0x3593564c×4 |
| 4 | 0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77 | 31 | 0x04e45aaf×31 |
| 5 | 0x43d894e229a008c72e96872739719b9cfda941d5 | 30 | 0xc1120e3d×29 0xa0f7978d×1 |
| 6 | 0x934412cf3a409f009e8c4cc546a4bc03c300e51f | 29 | 0xc1120e3d×27 0xa0f7978d×1 0x7422a284×1 |
| 7 | 0x000000000022d473030f116ddee9f6b43ac78ba3 | 25 | 0x87517c45×25 |
| 8 | 0xd33c142a811dbd638cbd3a99613240e6bedd04b0 | 21 | 0x(none)×21 |
| 9 | 0x25aea440a154e19dc62cc6191b7875b08f4504b7 | 17 | 0x(none)×17 |
| 10 | 0xa50c46662c5546d015d1e3e003b8d03be7497777 | 14 | 0x095ea7b3×14 |
| 11 | 0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789 | 14 | 0x1fad948c×14 |
| 12 | 0xc1db5b459bbaf9aedb52e71937566856fee67c4a | 14 | 0xfe7cdd42×10 0x1787a11f×4 |
| 13 | 0x4414958386f28a77d2146ac9df2923bafef50777 | 11 | 0x095ea7b3×11 |
| 14 | 0xc2eedf3bc7f93366c00c6074df0e6f122fa2445c | 9 | 0x00000000×6 0x0d390afd×3 |
| 15 | 0x34cd04070dd72b14e241112f6d83812df5af7fcd | 7 | 0x20b76e81×4 0x8720316d×3 |
| 16 | 0x0a2668e8043c08830f1d200f3e58c0889c8ca959 | 6 | 0x67bf9bac×6 |
| 17 | 0x38f193831e79365f72ed2885bd6751efda834777 | 5 | 0x095ea7b3×5 |
| 18 | 0x401ff2ddd8f72b0db8da09eb38dfc366666040d4 | 4 | 0x237f4b66×2 0xd5f8f782×1 0x14995989×1 |
| 19 | 0xc9134c890db35b945b2da15a9a107477a0321bb4 | 3 | 0x8d5090dd×3 |
| 20 | 0xe807a76385ec3d76d17ab955091c12329d0a1403 | 3 | 0x9abd4bed×3 |
| 21 | 0x0000000071727de22e5e9d8baf0edac6f37da032 | 3 | 0x765e827f×3 |
| 22 | 0x990112de77499f8215a1d7a56498aae1153338f1 | 3 | 0x6915853f×3 |
| 23 | 0x1f7d7550b1b028f7571e69a784071f0205fd2efa | 3 | 0x5c11d795×3 |
| 24 | 0x3600000000000000000000000000000000000000 | 3 | 0x095ea7b3×2 0xa9059cbb×1 |
| 25 | 0x171a4217b86a807a64eb94757db6849fb4bdbaa0 | 3 | 0x095ea7b3×3 |
| 26 | 0x50c4e75a512f2a14a7b304787adf79c4531a5909 | 3 | 0x2213bc0b×3 |
| 27 | 0x4cd902a75efed8e18b7eb2fb044926d7352db169 | 2 | 0xd5f8f782×1 0x237f4b66×1 |
| 28 | 0x2c3b1565677959e1e4633a47b4d5c6a32d653662 | 2 | 0x14995989×1 0x237f4b66×1 |
| 29 | 0x5af5194b4b0909eb978e3cf1e25333852277f07d | 2 | 0x9aefaff8×2 |
| 30 | 0x77905f095fa62fc472e56f17bdc039dc764c1595 | 2 | 0x624b1848×2 |
| 31 | 0x30beab0aed19b3f6a5c3bb0690154fc26a4d5126 | 2 | 0x14995989×1 0x237f4b66×1 |
| 32 | 0x031dbf964fc94b639912f334440845687e92cb8d | 2 | 0x4f6b7df0×2 |
| 33 | 0xa203b1a3e60ba6d72773cec0ca4fccf1dc588156 | 2 | 0xd5f8f782×1 0x237f4b66×1 |
| 34 | 0x03d1290b907375bdf2834c56bf1822c84984453d | 2 | 0xd5f8f782×1 0x237f4b66×1 |
| 35 | 0x81d40f21f12a8f0e3252bccb954d722d4c464b64 | 2 | 0x57ecfd28×2 |
| 36 | 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b | 2 | 0xac9650d8×1 0x095ea7b3×1 |
| 37 | 0x84f02544549a150669f417c84aee8f4837fab6eb | 1 | 0x(none)×1 |
| 38 | 0x92df01db3c69a49f4c4e694849e44c75d62b6752 | 1 | 0x(none)×1 |
| 39 | 0x5567954cd026cebfe486062cb75848e0f1c12e58 | 1 | 0x0a2b8f36×1 |
| 40 | 0x732784fc135e7889809f3fd65be1173faca8ac63 | 1 | 0x28863cc7×1 |

### Top 30 selectors
| selector | txs |
|---|---|
| 0x797af627 | 59 |
| 0xc1120e3d | 56 |
| 0x38aaba3d | 53 |
| 0x(none) | 46 |
| 0x24856bc3 | 41 |
| 0x095ea7b3 | 38 |
| 0x04e45aaf | 31 |
| 0x87517c45 | 25 |
| 0x1fad948c | 14 |
| 0xfe7cdd42 | 10 |
| 0x237f4b66 | 7 |
| 0x00000000 | 6 |
| 0x67bf9bac | 6 |
| 0x05f1065f | 5 |
| 0x04f1065f | 5 |
| 0x06f1065f | 5 |
| 0x07f1065f | 5 |
| 0x08f1065f | 5 |
| 0x09f1065f | 5 |
| 0x0ff1065f | 5 |
| 0x10f1065f | 5 |
| 0x11f1065f | 5 |
| 0x12f1065f | 5 |
| 0x13f1065f | 5 |
| 0x14f1065f | 5 |
| 0x15f1065f | 5 |
| 0xd5f8f782 | 4 |
| 0x1787a11f | 4 |
| 0x16f1065f | 4 |
| 0x17f1065f | 4 |
