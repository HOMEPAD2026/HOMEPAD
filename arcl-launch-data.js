// arcl-launch-data.js — the ARCL launch on Robinhood Chain (the owner, 2026-11-03): one place for the time, the delay and the
// official links. Read by /arcl (arcl.html → arcl.js: the countdown) and /game (game.html → gw.js: the footer's ARCL card and
// its news). A plain script: it sets window.ARC_ARCL (tests read it with node's vm).
//
//   LAUNCH   Tue 3 Nov 2026, 8:00 PM Korea (KST) = 11:00 UTC = 6:00 AM US Eastern — the owner, 13:08 KST: "8:00 예정, 6시간 52분 뒤"
//   DELAY    it may start up to 30 minutes late: the page shows "launch window" until LAUNCH + DELAY, then "see X / Telegram"
//   FEE      2% a trade — 1% buys back and burns $ARCIRCLE, 1% for the game's development and in-game use
//   CA       the token's contract address: empty until the owner posts it (then set it here, and the pages show it)
(function (g) {
  "use strict";
  var LAUNCH = "2026-11-03T11:00:00Z", DELAY_MIN = 30;
  g.ARC_ARCL = {
    launch: Date.parse(LAUNCH), launchIso: LAUNCH, delayMin: DELAY_MIN, delayEnd: Date.parse(LAUNCH) + DELAY_MIN * 60e3,
    zone: "Asia/Seoul", // (the owner's own clock; the page names each language's zone first: en ET, ko KST, zh 北京, tr TSİ)
    chain: "Robinhood Chain", explorer: "https://robinhoodchain.blockscout.com",
    ca: "", // (the official contract, set at launch; until then the page says it's posted on X and Telegram only)
    fee: { total: 2, burn: 1, game: 1 },
    x: "https://x.com/ARCIRCLEonArc", tg: "https://t.me/ARCIRCLEonarc",
    // the phases the pages show: "soon" before the launch, "window" until the delay runs out, "live" after
    phase: function (t) { t = t == null ? Date.now() : t; return t < this.launch ? "soon" : t < this.delayEnd ? "window" : "live"; },
  };
})(typeof window !== "undefined" ? window : globalThis);
