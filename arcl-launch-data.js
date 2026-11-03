// arcl-launch-data.js — the ARCL launch on Robinhood Chain (the owner, 2026-11-03): one place for the time, the delay and the
// official links. Read by /arcl (arcl.html → arcl.js: the countdown) and /game (game.html → gw.js: the footer's ARCL card and
// its news). A plain script: it sets window.ARC_ARCL (tests read it with node's vm).
//
//   LAUNCH   Tue 3 Nov 2026, 6:00 PM US Eastern (EST, UTC−5) = 23:00 UTC — the owner: "18:00 US time" (asked at 10:20 PM ET)
//   DELAY    it may start up to 30 minutes late: the page shows "launch window" until LAUNCH + DELAY, then "see X / Telegram"
//   FEE      2% a trade — 1% buys back and burns $ARCIRCLE, 1% for the game's development and in-game use
//   CA       the token's contract address: empty until the owner posts it (then set it here, and the pages show it)
(function (g) {
  "use strict";
  var LAUNCH = "2026-11-03T23:00:00Z", DELAY_MIN = 30;
  g.ARC_ARCL = {
    launch: Date.parse(LAUNCH), launchIso: LAUNCH, delayMin: DELAY_MIN, delayEnd: Date.parse(LAUNCH) + DELAY_MIN * 60e3,
    zone: "America/New_York", // (the owner's "US time" — the time the page names first)
    chain: "Robinhood Chain", explorer: "https://robinhoodchain.blockscout.com",
    ca: "", // (the official contract, set at launch; until then the page says it's posted on X and Telegram only)
    fee: { total: 2, burn: 1, game: 1 },
    x: "https://x.com/ARCIRCLEonArc", tg: "https://t.me/ARCIRCLEonarc",
    // the phases the pages show: "soon" before the launch, "window" until the delay runs out, "live" after
    phase: function (t) { t = t == null ? Date.now() : t; return t < this.launch ? "soon" : t < this.delayEnd ? "window" : "live"; },
  };
})(typeof window !== "undefined" ? window : globalThis);
