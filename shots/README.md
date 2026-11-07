# ARC GALAXY v2 (GX5, main d09934b) — real screenshots, 2026-11-07 ~02:54 UTC

Local server: static files + `api/social.mjs` GET (the real `api/_arc-galaxy.mjs`) against Arc mainnet / `&net=testnet`.
Playwright Chromium (SwiftShader WebGL), `arcircle.lang=en`, each shot after 40 s of live data.

- desktop-mainnet-contracts.png / desktop-mainnet-wallets.png — 1440×900, busiest panel on Contracts then Wallets
- desktop-testnet.png — 1440×900, ?net=testnet
- phone-live.png / phone-top.png — 390×844 isMobile + hasTouch (DPR 2), Live tab then Top tab
- embed-800x450.png — /embed/galaxy at 800×450

Page errors / console errors / failed requests: none in any of the four runs.

Testnet CCTP V2 (chain 5042002, rpc.testnet.arc.io, blocks 71,110,153 → 71,130,153 ≈ 2.8 h):
TokenMessengerV2 0x8fe6b999…2daa and MessageTransmitterV2 0xe737e5ce…1275 both have code (2,175 bytes each — proxies).
Logs: MessageSent 180, DepositForBurn 170, MessageReceived 20, MintAndWithdraw 19 (same topic0s as mainnet; MessageSent srcDomain 26).
DepositForBurn destinations: Ethereum Sepolia (0) 160, Base 6, Arbitrum 1, Avalanche 1, Polygon 1, 18 1.
MessageReceived sources: 0 → 10, Base 5, Polygon 2, Arbitrum 1, Solana 1, 12 1.
