// api/_arcircle.mjs — $ARCIRCLE's contracts for the server side (edge-safe).
// The client side reads the same values from config-arc.js — keep both in step.
//
// $ARCIRCLE launched on Argus (argus.world) on 25 Sep 2026: it trades in a
// Uniswap v4 pool on Arc's shared PoolManager from the first block — the whole
// supply sits in one locked liquidity position, there is no virtual curve and
// the pool never migrates. The pool pairs it with USDC's ERC-20 interface
// (0x3600…, 6 decimals) and has its own Argus hook, which charges the launch's
// fixed buy / sell tax on the USDC leg (plus the 1% v4 pool fee).
// Pool id cross-checked on Dexscreener (pair 0xfd28…ebba, ARCIRCLE / USDC).
// Empty ARCIRCLE_TOKEN = NOT LIVE: every endpoint answers "not live".
export const ARCIRCLE_TOKEN = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
export const ARCIRCLE_POOL_ID = "0xfd282cf8bbc57813724e7c6cb1bda6bdf5d2caf02b3bce60cc6aac38ed26ebba";
// The pool's quote currency and how prices convert (see arcircleUsd below).
export const ARCIRCLE_QUOTE = "0x3600000000000000000000000000000000000000"; // USDC, ERC-20 interface
export const ARCIRCLE_QUOTE_DECIMALS = 6;
// Only for a coin that trades on a foci-style bonding curve (the first launch did).
export const ARCIRCLE_CURVE = "";
// Unix time the pool was created (the stats scan starts there).
export const ARCIRCLE_LAUNCHED_AT = 1790345391;

// ---- Argus (docs: argus.world/docs, github.com/arguspad/argus-world) ----
// Every launch has its own hook / locker / splitter, recorded by the Portal
// that created it. _token.mjs reads the record once and only trusts it when
// the hook it names hashes to ARCIRCLE_POOL_ID (so a wrong layout can't leak in).
export const ARGUS_PORTALS = [
  "0xeed7559b8a6abf64427dc41cb5cc6400109c5d93", // V5 — launched $ARCIRCLE (tx 0x2fad1fcd…4548)
  "0xb021be536808f551b31789422fd28a6c9c6e97da", // #7
  "0xa5628a11c412596e1f63b75a2c0284f843c549d6", // #6
  "0x07a688a001f416cc433c68ff56aa26bc5131cc6e", // #5
  "0xa36c443a797771df82533b8b4a86f0affd970862", // #4
  "0x7a17ab0106c46c0be30623f3eb7f299cc0058338", // #3
];
// V5 pools carry the dynamic-fee flag (0x800000) — the hook sets the fee; older ones 1%.
export const ARGUS_POOL_FEE = 10000, ARGUS_POOL_FEE_DYNAMIC = 0x800000, ARGUS_TICK_SPACING = 200;
// Argus keeps 10% of the tax it collects; 90% goes to the creator's allocation
// (creator funds / buyback & burn / holder dividends / liquidity).
export const ARGUS_SHARE_BPS = 1000;
// Never counted as a trader or a holder: Argus's portals and Uniswap's
// periphery on Arc (the launch's own hook / locker / splitter are added at
// runtime from its launch record).
export const ARCIRCLE_VENUE_CONTRACTS = [
  ...ARGUS_PORTALS,
  "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1", // Uniswap UniversalRouter
  "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b", // Uniswap PositionManager
];

const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
export const ARCIRCLE_LIVE = isAddr(ARCIRCLE_TOKEN);
// v4 sorts currencies by address: 0x36… (USDC) < 0xe5… ($ARCIRCLE)
export const ARCIRCLE_IS_CURRENCY0 = ARCIRCLE_LIVE && BigInt(ARCIRCLE_TOKEN) < BigInt(ARCIRCLE_QUOTE);

/// USD per $ARCIRCLE from the pool's sqrtPriceX96. r = sqrtP² / 2^192 is raw
/// currency1 per raw currency0; $ARCIRCLE has 18 decimals, USDC 6.
export function arcircleUsd(sqrtX96) {
  const sp = Number(sqrtX96);
  if (!(sp > 0)) return null;
  const r = (sp / 2 ** 96) ** 2;
  const raw = ARCIRCLE_IS_CURRENCY0 ? r : 1 / r;
  const p = raw * 10 ** (18 - ARCIRCLE_QUOTE_DECIMALS);
  return Number.isFinite(p) && p > 0 ? p : null;
}
