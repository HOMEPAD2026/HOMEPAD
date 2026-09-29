/* global CONFIG */
// circlepad-boot.js — which CirclePad round /circle runs, decided before any other CirclePad script reads
// CONFIG. Round #1 is config-arc.js's escrow. Later rounds come from /api/social?circle=boot (a small
// <script> in circlepad.html's <head> that sets window.CP_ROUNDS from api/_rounds.mjs): the newest round
// that the round wallet has prepared (deployed — started or not yet) becomes the page's round: before start() it
// shows in its pre-start state (the round wallet's Start button on Home), after it runs like any round. Its raise, leaderboard, position and split work exactly like
// Round #1's (same BigPadEscrow contract); burn-to-vote isn't set up for it, so the vote contracts are
// switched off here and Governance says so. The Q&A room stays Round #1's (CIRCLEPAD_COMMUNITY_ESCROW).
// Right after the round wallet starts a round, circlepad-rounds.js leaves a short-lived note in
// localStorage so this page switches at once, before the cached boot script catches up.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  CONFIG.CIRCLEPAD_ROUND1_ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  CONFIG.CIRCLEPAD_COMMUNITY_ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  CONFIG.CIRCLEPAD_ROUND = 1;
  const list = (window.CP_ROUNDS && Array.isArray(window.CP_ROUNDS.list) ? window.CP_ROUNDS.list : []).filter((r) => r && r.n > 1 && isAddr(r.escrow));
  let cur = list.slice().sort((a, b) => b.n - a.n)[0] || null;
  try {
    const o = JSON.parse(localStorage.getItem("circlepad.round.just-started") || "null");
    if (o && isAddr(o.escrow) && o.n > 1 && Date.now() - o.at < 10 * 60e3 && (!cur || o.n > cur.n)) cur = { n: o.n, escrow: o.escrow, started: !!o.started };
    else if (o && Date.now() - o.at >= 10 * 60e3) localStorage.removeItem("circlepad.round.just-started");
  } catch (e) { /* storage blocked: the boot script alone decides */ }
  if (cur) {
    const G = (CONFIG.CIRCLEPAD_GOV && CONFIG.CIRCLEPAD_GOV[cur.n]) || {};
    const voteOn = isAddr(G.vote) && isAddr(G.burnvote);
    CONFIG.CIRCLEPAD_ESCROW_ADDRESS = cur.escrow;
    CONFIG.CIRCLEPAD_ROUND = cur.n;
    CONFIG.CIRCLEPAD_ROUND_GOV = { ...G, voteOn, ballotOn: isAddr(G.vote) };
    // the round's own ballot (the ideas board and candidates) and burn-to-vote, once they're deployed
    CONFIG.CIRCLEPAD_VOTE_ADDRESS = isAddr(G.vote) ? G.vote : "";
    CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS = voteOn ? G.burnvote : "";
    CONFIG.CIRCLEPAD_VOTE_MODE = voteOn ? "burn" : "";
    CONFIG.CIRCLEPAD_EXTRA_CANDIDATES = {};
    CONFIG.CIRCLEPAD_OPENS_AT = 0;
    CONFIG.CIRCLEPAD_ESCROW_VERIFIED = false;
    CONFIG.CIRCLEPAD_ALLOCATION_NOTE = "";
    CONFIG.CIRCLEPAD_NEXT = [
      voteOn
        ? { id: "vote", title: "Burn-to-vote", body: "Until the raise closes. Anyone holding $ARCIRCLE votes on name, ticker, logo, roadmap and launch date; every vote burns 1,000 $ARCIRCLE.", status: "set" }
        : { id: "vote", title: "Governance, as in Round #1", body: "First the community suggests ideas, then the round wallet publishes the candidates and $ARCIRCLE holders burn-to-vote on name, ticker, logo, roadmap and launch date until the raise closes. Opens soon.", status: "policy" },
      { id: "close", title: "The raise closes", body: "Contributions, withdrawals and voting stop. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
      G.top === true ? { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet — as in Round #1.", status: "policy" }
        : { id: "top", title: "Top contributor", body: "Whether the largest contributor receives the 15% as in Round #1: not decided yet.", status: "open" },
      { id: "launch", title: "The coin launches", body: "On the launch date the vote picks, with the name, ticker and logo the vote picks. Where and how it launches: not decided yet.", status: "open" },
      { id: "airdrop", title: "Contributor airdrop", body: G.airdrop || "Not decided yet.", status: G.airdrop ? "policy" : "open" },
    ];
    document.documentElement.setAttribute("data-cp-round", String(cur.n));
  }
  // "Round #1" in page copy → this round's number (English "#1", Chinese "第 1 轮")
  window.cpRN = () => CONFIG.CIRCLEPAD_ROUND || 1;
  window.cpRT = function (s) {
    const t = (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
    const n = window.cpRN();
    return n === 1 ? t : String(t).replace(/#1(?!\d)/g, "#" + n).replace(/第 1 轮/g, "第 " + n + " 轮");
  };
})();
