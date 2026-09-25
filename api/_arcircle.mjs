// api/_arcircle.mjs — $ARCIRCLE's contracts for the server side (edge-safe).
// Empty = NOT LIVE: $ARCIRCLE is being relaunched, so every endpoint answers
// "not live" instead of reading the retired contracts. At launch, set these
// two — and the same two in config-arc.js (ARCIRCLE_TOKEN / ARCIRCLE_CURVE).
// ARCIRCLE_CURVE only applies if the new coin trades on a bonding curve with
// the same CurveBuy / CurveSell events as before.
export const ARCIRCLE_TOKEN = "";
export const ARCIRCLE_CURVE = "";
// Unix time the curve went live (the stats scan starts there).
export const ARCIRCLE_LAUNCHED_AT = 0;
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
export const ARCIRCLE_LIVE = isAddr(ARCIRCLE_TOKEN);
