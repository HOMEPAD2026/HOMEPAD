/* global CONFIG */
// circlepad-boot.js — which CirclePad round /circle runs, decided before any other CirclePad script reads
// CONFIG. Round #1 is config-arc.js's escrow. Later rounds come from /api/social?circle=boot (a small
// <script> in circlepad.html's <head> that sets window.CP_ROUNDS from api/_rounds.mjs): the newest round
// that the round wallet has prepared (deployed — started or not yet) becomes the page's round: before start() it
// shows in its pre-start state (the round wallet's Start button on Home), after it runs like any round. Its raise, leaderboard, position and split work exactly like
// Round #1's (same BigPadEscrow contract); its governance comes from CONFIG.CIRCLEPAD_GOV[n]: its own vote contracts,
// or mode "direct" (no contracts — signed candidates, coded burns to 0x…dEaD), or "opens soon" until one is set. The Q&A room stays Round #1's (CIRCLEPAD_COMMUNITY_ESCROW).
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
    // direct: no vote contracts — signed candidates and coded burns to 0x…dEaD (circlepad.js govDirect)
    // plan: the round launches no new coin, so there's no vote on the page — circlepad-plan.js shows what the raise does
    const plan = G.mode === "plan" && G.plan ? G.plan : null;
    const direct = G.mode === "direct";
    const chain = direct && Array.isArray(G.chain) && G.chain.length ? G.chain.join(" / ") : "";
    const voteOn = direct || (isAddr(G.vote) && isAddr(G.burnvote));
    CONFIG.CIRCLEPAD_ESCROW_ADDRESS = cur.escrow;
    CONFIG.CIRCLEPAD_ROUND = cur.n;
    CONFIG.CIRCLEPAD_ROUND_GOV = { ...G, voteOn, ballotOn: direct || isAddr(G.vote) };
    CONFIG.CIRCLEPAD_GOV_DIRECT = direct;
    CONFIG.CIRCLEPAD_ROUND_PLAN = plan;
    // the round's own ballot (the ideas board and candidates) and burn-to-vote, once they're deployed
    CONFIG.CIRCLEPAD_VOTE_ADDRESS = !direct && isAddr(G.vote) ? G.vote : "";
    CONFIG.CIRCLEPAD_BURNVOTE_ADDRESS = !direct && voteOn ? G.burnvote : "";
    CONFIG.CIRCLEPAD_VOTE_MODE = voteOn ? "burn" : "";
    CONFIG.CIRCLEPAD_EXTRA_CANDIDATES = {};
    CONFIG.CIRCLEPAD_OPENS_AT = 0;
    CONFIG.CIRCLEPAD_ESCROW_VERIFIED = false;
    CONFIG.CIRCLEPAD_ALLOCATION_NOTE = "";
    CONFIG.CIRCLEPAD_NEXT = [
      voteOn
        ? direct
          ? { id: "vote", title: "Burn-to-vote, as in Round #1", body: chain ? "Until the raise closes. The team published Round #3's candidates — five per category, with Round #2's $TIE picks among them — plus the launch chain: Arc, Robinhood Chain or Solana. Anyone holding $ARCIRCLE burn-to-votes on them — every vote burns 1,000 $ARCIRCLE straight to 0x…dEaD. No new contract: the votes are counted from those burns on Arc." : "Until the raise closes. First a free pre-vote: anyone suggests ideas and votes on them with a wallet signature. The round wallet picks the candidates from the top, then anyone holding $ARCIRCLE burn-to-votes on name, ticker, logo, roadmap and launch date — every vote burns 1,000 $ARCIRCLE straight to 0x…dEaD. No new contract: the votes are counted from those burns on Arc.", status: "policy" }
          : { id: "vote", title: "Burn-to-vote", body: "Until the raise closes. Anyone holding $ARCIRCLE votes on name, ticker, logo, roadmap and launch date; every vote burns 1,000 $ARCIRCLE.", status: "set" }
        : { id: "vote", title: "Governance, as in Round #1", body: "First the community suggests ideas, then the round wallet publishes the candidates and $ARCIRCLE holders burn-to-vote on name, ticker, logo, roadmap and launch date until the raise closes. Opens soon.", status: "policy" },
      { id: "close", title: "The raise closes", body: "Contributions, withdrawals and voting stop. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
      G.top === true ? { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet — as in Round #1.", status: "policy" }
        : { id: "top", title: "Top contributor", body: "Whether the largest contributor receives the 15% as in Round #1: not decided yet.", status: "open" },
      chain
        ? { id: "launch", title: "The coin launches", body: "On the launch date and the chain the vote picks (Arc, Robinhood Chain or Solana), with the name, ticker and logo the vote picks.", status: "policy" }
        : { id: "launch", title: "The coin launches", body: "On the launch date the vote picks, with the name, ticker and logo the vote picks. Where and how it launches: not decided yet.", status: "open" },
      { id: "airdrop", title: "Contributor airdrop", body: G.airdrop || "Not decided yet.", status: G.airdrop ? "policy" : "open" },
    ];
    if (plan) {
      const b = plan.buy || {}, a = plan.also || {};
      CONFIG.CIRCLEPAD_ALLOCATION_NOTE = G.airdrop || "";
      CONFIG.CIRCLEPAD_NEXT = [
        { id: "vote", title: "No vote this round", body: `Round #${cur.n} launches no new coin, so its burn-to-vote closed on 4 Oct 2026. The votes cast before stay on record, and their $ARCIRCLE stays burned.`, status: "policy" },
        { id: "close", title: "The raise closes", body: "Contributions and withdrawals stop. The escrow splits everything: 80% recipient, 15% treasury, 5% platform.", status: "set" },
        G.top === true ? { id: "top", title: "Top contributor paid", body: "The largest contributor at the close receives the 15%, over 3 days, sent by the team from the treasury wallet — as in Round #1.", status: "policy" }
          : { id: "top", title: "Top contributor", body: "Whether the largest contributor receives the 15% as in Round #1: not decided yet.", status: "open" },
        { id: "launch", title: `$${b.sym || "ARCIA"} is bought`, body: `After the split, the round wallet buys $${b.sym || "ARCIA"} on ${b.chain || "Robinhood Chain"} with the raise — ARCIA's own coin, the flagship of the ARCIRCLE NFT ecosystem.`, status: "policy" },
        { id: "airdrop", title: a.snapshot ? "Snapshot airdrop" : "Two allocations", body: G.airdrop || "", status: "policy" },
        a.merged
          ? { id: "r4", title: `Round #${a.round || cur.n + 1} on ${a.chain || "Solana"} — merged in`, body: `Round #${a.round || cur.n + 1} is ARCIRCLE's move to ${a.chain || "Solana"} through ${a.via || "pump.fun"}. It has no 3-day raise of its own: the ARCIRCLE team runs it on ${a.chain || "Solana"} with ${a.with || "ARCIRCLE Orders"}, and everyone in Round #${cur.n} is in it automatically, by their share.`, status: "policy" }
          : { id: "r4", title: `Round #${a.round || cur.n + 1} on ${a.chain || "Solana"}`, body: `Round #${a.round || cur.n + 1}'s token launches on ${a.chain || "Solana"} — not revealed yet. Round #${cur.n}'s contributors get an allocation of it by their share, new contributors included.`, status: "policy" },
      ];
    }
    document.documentElement.setAttribute("data-cp-round", String(cur.n));
    if (plan) document.documentElement.setAttribute("data-cp-plan", "1");
  }
  // "Round #1" in page copy → this round's number (English "#1", Chinese "第 1 轮")
  window.cpRN = () => CONFIG.CIRCLEPAD_ROUND || 1;
  window.cpRT = function (s) {
    const t = (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
    const n = window.cpRN();
    return n === 1 ? t : String(t).replace(/#1(?!\d)/g, "#" + n).replace(/第 1 轮/g, "第 " + n + " 轮");
  };
})();
