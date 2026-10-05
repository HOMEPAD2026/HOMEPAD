/* global CONFIG, state */
// circlepad-plan.js — a CirclePad round that launches no new coin (CONFIG.CIRCLEPAD_ROUND_PLAN, set by circlepad-boot.js
// from CONFIG.CIRCLEPAD_GOV[n].plan). Round #3 (4 Oct 2026): the raise buys $ARCIA on Robinhood Chain for its
// contributors, and they also get an allocation of Round #4's Solana token ($TBA). The other CirclePad scripts ask this
// one for their copy when a plan is set:
//   cpPlan.copy()        the featured card (title, tags, description) and the Governance tab's note
//   cpPlan.steps(set)    the launch-process timeline on Home
//   cpPlan.hero(ph, r)   the Home hero: two allocations, your share, the closed vote's record
//   cpPlan.coin()        what Projects' live-round card shows instead of a vote's winner
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ROUND_PLAN) return;
  const P = CONFIG.CIRCLEPAD_ROUND_PLAN, B = P.buy || {}, A = P.also || {};
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const lc = (a) => String(a || "").toLowerCase();
  const SYM = "$" + (B.sym || "ARCIA"), NEXT = "$" + (A.sym || "TBA"), R4 = A.round || N() + 1;
  // 5 Oct 2026: Round #4 merged into this round — no raise of its own; the team runs it on Solana (pump.fun) with ARCIRCLE Orders
  const MERGED = !!A.merged, VIA = A.via || "pump.fun", WITH = A.with || "ARCIRCLE Orders";
  // 6 Oct 2026: both rewards go out as a snapshot airdrop, with more updates to follow
  const SNAP = !!A.snapshot;
  const num = (n, d = 0) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  let votes = null; // the closed vote's record (/api/social?circle=burns&round=n)

  async function loadVotes() {
    try {
      const r = await fetch(`/api/social?circle=burns&round=${N()}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.totals) { votes = { votes: Number(j.totals.votes || 0), voters: Number(j.totals.voters || 0), burned: Number(BigInt(j.totals.burned || "0") / 10n ** 18n) }; document.dispatchEvent(new CustomEvent("circlepad:state")); }
    } catch { /* the line just leaves the numbers out */ }
  }

  function copy() {
    const h2 = document.querySelector("#bp-featured .bp-featured-info h2");
    if (h2) {
      const tk = h2.querySelector(".bp-ticker");
      if (tk) { tk.setAttribute("data-no-i18n", ""); tk.textContent = `${SYM} + ${NEXT}`; }
    }
    const tags = document.querySelector("#bp-featured .bp-tags");
    if (tags && !tags.dataset.plan) { tags.dataset.plan = "1"; tags.innerHTML = ["Team-led", "USDC raise", B.chain || "Robinhood Chain", A.chain || "Solana"].map((t) => `<span>${T(t)}</span>`).join(""); }
    const desc = document.getElementById("bp-featured-desc");
    if (desc) desc.textContent = MERGED
      ? tr(`USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. Round #${N()} and Round #${R4} are merged: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and Round #${R4} — ARCIRCLE's move to ${A.chain || "Solana"} through ${VIA} — is run by the ARCIRCLE team with ${WITH}, with no separate raise. Everyone in Round #${N()} is in Round #${R4} automatically; both rewards go by your share of the raise.`)
      : tr(`USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72 hours are up. Round #${N()} launches no new coin: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and every contributor also gets an allocation of Round #${R4}'s token on ${A.chain || "Solana"} — both by their share of the raise.`);
    const gn = document.getElementById("bp-gov-note");
    if (gn) gn.textContent = tr(`No vote this round — Round #${N()} buys ${SYM} instead of launching a new coin.`);
    const pn = document.getElementById("bp-gov-panel-note");
    if (pn) {
      pn.innerHTML = `<b>${T(`Round #${N()}'s vote is closed.`)}</b> ${T(`It launches no new coin: the raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, and contributors also get an allocation of Round #${R4}'s token on ${A.chain || "Solana"}. The votes cast before 4 Oct 2026 stay on record, and their $ARCIRCLE stays burned.`)}${votes && votes.votes ? ` <span class="cp-plan-rec" data-no-i18n>${num(votes.votes)} ${esc(tr(votes.votes === 1 ? "vote" : "votes"))} · ${num(votes.burned)} $ARCIRCLE ${esc(tr("burned"))}</span>` : ""}`;
      pn.classList.add("cp-plan-note");
    }
  }

  function steps(set) {
    const tl = document.getElementById("cp-timeline");
    if (tl) tl.querySelectorAll(".bp-steps > li").forEach((li, i) => { const w = li.querySelector(".bp-step-when"); const t = i === 1 ? "Closed 4 Oct" : i === 4 ? (SNAP ? "Snapshot airdrop" : "After the split") : ""; if (w && t) w.textContent = tr(t); });
    set(2, "", "Contributions and withdrawals stop. The escrow sends 80% to the recipient, 15% to the treasury, 5% to the platform.");
    set(1, "No vote this round", `Round #${N()} launches no new coin, so there's nothing to vote on. Its burn-to-vote closed on 4 Oct 2026; the votes cast before stay on record.`);
    set(3, "", CONFIG.CIRCLEPAD_ROUND_GOV && CONFIG.CIRCLEPAD_ROUND_GOV.top === true ? "The largest contributor at the close receives the 15%, over 3 days." : "Whether the top contributor receives the 15% this round: not decided yet.");
    set(4, `${SYM} + Round #${R4}`, SNAP ? `Both rewards go out as a snapshot airdrop to the contributor list, by share of the raise: ${SYM} on ${B.chain || "Robinhood Chain"} and the Round #${R4} share on ${A.chain || "Solana"}. More updates to follow.` : MERGED ? `The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, sent to contributors by their share. Round #${R4} on ${A.chain || "Solana"} — through ${VIA}, run by the team with ${WITH} — is shared the same way.` : `The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}, sent to contributors by their share. Round #${R4}'s token on ${A.chain || "Solana"} follows, shared the same way.`);
  }

  // your share of the raise, from the leaderboard (circlepad.js)
  function mine() {
    const me = typeof state !== "undefined" && state.account ? lc(state.account) : "";
    const rows = window.circlepadLbRows || [];
    if (!me || !rows.length) return null;
    const total = rows.reduce((s, r) => s + BigInt(r.amount || 0), 0n);
    const r = rows.find((x) => lc(x.address) === me);
    if (!r || total <= 0n) return { in: false };
    return { in: true, pct: Number((BigInt(r.amount) * 1000000n) / total) / 1e4, usdc: Number(BigInt(r.amount) / 10n ** 14n) / 1e4 };
  }

  function hero(ph, r) {
    if (!r || !r.started) return "";
    const open = !!r.isOpen, dl = Number(r.deadline || 0), m = mine();
    const you = m && m.in
      ? `<div class="cp-plan-you"><small>${T("Your share of the raise")}</small><b data-no-i18n>${num(m.pct, m.pct < 1 ? 3 : 2)}%</b><span>${T(`of the ${SYM} bought and of Round #${R4}'s allocation`)}</span></div>`
      : open ? `<div class="cp-plan-you"><small>${T("Your share of the raise")}</small><b data-no-i18n>—</b><span>${T(MERGED ? `Contribute any amount to be in both — you join Round #${R4} automatically.` : "Contribute any amount to be in both.")}</span></div>` : "";
    const rec = votes && votes.votes ? `<p class="cp-plan-vote"><i aria-hidden="true"></i>${T("Burn-to-vote closed on 4 Oct 2026")} · <span data-no-i18n>${num(votes.votes)}</span> ${T(votes.votes === 1 ? "vote" : "votes")} · <span data-no-i18n>${num(votes.burned)} $ARCIRCLE</span> ${T("burned, on record")}</p>` : "";
    return `<div class="cp-phero-copy">
        ${MERGED ? `<div class="cp-merge" aria-hidden="true"><svg viewBox="0 0 220 84"><defs><linearGradient id="cpMg" x1="0" x2="1"><stop offset="0" stop-color="#ff8bd8"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle class="cp-merge-a" cx="70" cy="42" r="30"/><circle class="cp-merge-b" cx="150" cy="42" r="30"/><circle class="cp-merge-c" cx="110" cy="42" r="30"/><text class="cp-merge-ta" x="70" y="47">#${esc(N())}</text><text class="cp-merge-tb" x="150" y="47">#${esc(R4)}</text><text class="cp-merge-tc" x="110" y="47">#${esc(N())}+${esc(R4)}</text></svg></div>` : ""}
        <span class="cp-phero-eyebrow">${MERGED ? T(`Round #${N()} + Round #${R4} · ${open ? "merged" : "raise closed"}`) : T(`Round #${N()} · ${open ? "the plan changed" : "raise closed"}`)}</span>
        <h2>${T(MERGED ? "Two rounds in one. Robinhood Chain and Solana." : "One round. Two chains. Two allocations.")}</h2>
        <p class="cp-phero-lede">${MERGED
          ? T(`Round #${R4} is merged into Round #${N()}. Round #${R4} is ARCIRCLE's move to ${A.chain || "Solana"} through ${VIA}: no separate 3-day raise — the ARCIRCLE team runs it on ${A.chain || "Solana"} with ${WITH}, and everyone in Round #${N()} is in it automatically. The raise buys ${SYM} on ${B.chain || "Robinhood Chain"}; both rewards go by your share, new contributors included.`)
          : T(`Round #${N()} launches no new coin. The raise buys ${SYM} — ARCIA's own coin on ${B.chain || "Robinhood Chain"} — and every contributor also gets an allocation of Round #${R4}'s token on ${A.chain || "Solana"}. Both by your share of the raise, new contributors included.`)}</p>
        <div class="cp-phero-cta">${open ? `<button type="button" class="bp-btn-primary" data-cp-plan="contribute">${T("Contribute USDC")}</button>` : ""}${B.url ? `<a class="bp-btn-ghost" href="${esc(B.url)}" target="_blank" rel="noopener">${esc(SYM)} ${T("on Pons")} ↗</a>` : ""}${open && dl ? `<span class="cp-phero-clock"><small>${T("Raise closes in")}</small><b data-no-i18n data-cp-to="${dl}">…</b></span>` : ""}</div>
        ${SNAP ? `<p class="cp-plan-snap"><i aria-hidden="true"></i><span><b>${T("Snapshot airdrop")}</b> ${T(`Round #${N()} and Round #${R4}'s rewards go out as a snapshot airdrop to the contributor list, by share of the raise. More updates to follow.`)}</span></p>` : ""}
        ${rec}
      </div>
      <div class="cp-phero-side cp-plan-side">
        <div class="cp-plan-pair">
          <div class="cp-plan-card rh"><span class="cp-plan-chain"><i></i>${T(B.chain || "Robinhood Chain")}</span><b data-no-i18n>${esc(SYM)}</b><span>${T("Bought with the raise · ARCIA's own coin, the flagship of the ARCIRCLE NFT ecosystem")}</span>${B.token ? `<button type="button" class="cp-plan-ca" data-cp-copy="${esc(B.token)}" title="${T("Copy address")}" data-no-i18n>${short(B.token)}</button>` : ""}</div>
          <span class="cp-plan-plus" aria-hidden="true">+</span>
          <div class="cp-plan-card sol"><span class="cp-plan-chain"><i></i>${T(`${A.chain || "Solana"} · Round #${R4}`)}</span><b data-no-i18n>${esc(MERGED ? VIA : NEXT)}</b><span>${T(MERGED ? `ARCIRCLE's move to ${A.chain || "Solana"}, run by the team with ${WITH}. You're in automatically, by the same share.` : `Round #${R4}'s token — not revealed yet. Allocated by the same share.`)}</span></div>
        </div>
        ${MERGED ? `<p class="cp-plan-merge"><b>${T("Why merged:")}</b> ${T(`ARCIRCLE built a new contract on ${A.chain || "Solana"} for ${WITH} — on ${A.chain || "Solana"} that costs over about $1,000 — so the team is putting its focus there and taking ARCIRCLE to ${A.chain || "Solana"} together with this round.`)}</p>` : ""}
        ${you}
        ${delivery(r)}
      </div>`;
  }

  // v8: the delivery board — after the close, each step the team takes, with its transactions (CONFIG.CIRCLEPAD_DELIVERY)
  const EXPL = { rh: "https://robinhoodchain.blockscout.com/tx/", sol: "https://solscan.io/tx/", arc: "https://arc.etherscan.io/tx/" };
  function delivery(r) {
    const D = (CONFIG.CIRCLEPAD_DELIVERY || {})[N()] || {};
    const closed = r && r.started && Math.floor(Date.now() / 1000) >= Number(r.deadline || 0);
    const rows = SNAP ? [
      ["close", closed ? "done" : "now", "The raise closes", closed ? "Closed — the split goes out from the escrow" : "Contributions are still open"],
      ["snap", D.snap && D.snap.status, "Snapshot of the contributors", "Everyone in the raise, by share — Round #2's list included"],
      ["drop", D.drop && D.drop.status, "Snapshot airdrop", `${SYM} on ${B.chain || "Robinhood Chain"} and your Round #${R4} share`],
      ["more", D.more && D.more.status, "More updates to follow", `Round #${R4} on ${A.chain || "Solana"}, through ${VIA} with ${WITH}`],
    ] : [
      ["close", closed ? "done" : "now", "The raise closes", closed ? "Closed — the split goes out from the escrow" : "Contributions are still open"],
      ["buy", D.buy && D.buy.status, `${SYM} is bought on ${B.chain || "Robinhood Chain"}`, "With the raise, after the split"],
      ["send", D.send && D.send.status, `${SYM} goes to every contributor`, "By your share of the raise"],
      ...(MERGED ? [["r4", D.r4 && D.r4.status, `Round #${R4} on ${A.chain || "Solana"}`, `Through ${VIA}, run by the team with ${WITH}`], ["r4send", D.r4send && D.r4send.status, `Round #${R4}'s share goes out`, "By the same share"]] : []),
    ];
    const txs = (k) => ((D[k] && D[k].txs) || []).filter((x) => x && x.hash).map((x) => `<a href="${esc((EXPL[x.chain] || EXPL.rh) + x.hash)}" target="_blank" rel="noopener" data-no-i18n>${esc(x.label || `${x.hash.slice(0, 8)}…`)} ↗</a>`).join("");
    const rowsHtml = rows.map(([k, st, t, sub], i) => `<li class="${st === "done" ? "done" : st === "now" ? "now" : ""}" data-dl="${esc(N() + ":" + k)}" data-dl-st="${esc(st || "")}"><i>${st === "done" ? "✓" : i + 1}</i><div><b>${T(t)}</b><small>${T(sub)}</small>${txs(k) ? `<span class="cp-dl-tx">${txs(k)}</span>` : ""}</div><em>${T(st === "done" ? "Done" : st === "now" ? "In progress" : "Waiting")}</em></li>`).join("");
    const n = (window.circlepadLbRows || []).length;
    return `<div class="cp-dl"><div class="cp-dl-h"><b>${T("Delivery board")}</b>${n ? `<small data-no-i18n>${esc(n)} ${esc(tr(n === 1 ? "contributor" : "contributors"))}</small>` : ""}</div><ol>${rowsHtml}</ol></div>`;
  }

  const coin = () => ({ name: `${SYM} + Round #${R4}`, ticker: `${B.sym || "ARCIA"} · ${NEXT}`, logo: "", date: null, road: "", any: true });

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cp-plan]");
    if (!b) return;
    if (b.dataset.cpPlan === "contribute") {
      const el = document.getElementById("bp-contribute-amount") || document.getElementById("bp-contribute-btn");
      const box = el && (el.closest(".bp-featured-side, .bp-contribute, .bp-card") || el);
      if (box) box.scrollIntoView({ behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      if (el && el.offsetParent && el.tagName === "INPUT") setTimeout(() => el.focus({ preventScroll: true }), 450);
    }
  });
  document.addEventListener("arc:lang", copy);
  window.cpPlan = { copy, steps, hero, coin };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { copy(); loadVotes(); });
  else { copy(); loadVotes(); }
})();
