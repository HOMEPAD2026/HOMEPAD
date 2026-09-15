// bigpad.js — BigPad dashboard interactivity. Still no live contract call
// anywhere in this file: the fund-pooling/auction/vote/vesting mechanism
// is a design, not a deployed contract (see the Docs > Safety design tab),
// so every number that would come from a real round is left as "—" in
// the markup rather than invented here.

(() => {
  // ---- Main sidebar tabs (Home / Projects / Governance / ...) ----
  const navItems = document.querySelectorAll(".bp-nav-item[data-tab]");
  const panels = document.querySelectorAll(".bp-panel");
  const sidebar = document.getElementById("bp-sidebar");
  const mobileMenuLabel = document.getElementById("bp-mobile-menu-label");

  function showTab(tab) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `bp-panel-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (mobileMenuLabel) {
      const activeBtn = [...navItems].find((b) => b.dataset.tab === tab);
      if (activeBtn) mobileMenuLabel.textContent = activeBtn.textContent.trim();
    }
    if (sidebar) sidebar.classList.remove("bp-menu-open");
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // ---- Mobile-only dropdown: the sidebar nav is hidden by default on
  // narrow screens (see the max-width:900px block in style.css) and
  // opens as a dropdown from this trigger instead of the old horizontal
  // scroller. Desktop never shows the trigger, so the full vertical
  // sidebar there is untouched by any of this.
  const menuTrigger = document.getElementById("bp-mobile-menu-trigger");
  if (menuTrigger && sidebar) {
    menuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("bp-menu-open");
    });
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("bp-menu-open") && !sidebar.contains(e.target)) {
        sidebar.classList.remove("bp-menu-open");
      }
    });
  }

  // Small "Learn more →" / "How it works" links inside cards jump to
  // another sidebar tab, same as clicking the sidebar item itself.
  document.querySelectorAll("[data-tab-link]").forEach((el) => {
    el.addEventListener("click", () => showTab(el.dataset.tabLink));
  });

  // Hero's "See the preview" button scrolls to the preview round card
  // instead of switching tabs — it's already on the Home panel.
  const seePreviewBtn = document.getElementById("bp-see-preview");
  const featured = document.getElementById("bp-featured");
  if (seePreviewBtn && featured) {
    seePreviewBtn.addEventListener("click", () => {
      featured.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // ---- Docs sub-tabs (How it works / Economics / Safety / FAQ) ----
  const docTabs = document.querySelectorAll(".bp-doc-tab");
  const docPanels = document.querySelectorAll(".bp-doc-panel");
  docTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      docTabs.forEach((b) => b.classList.toggle("active", b === btn));
      docPanels.forEach((p) => p.classList.toggle("active", p.id === `bp-doc-${btn.dataset.doc}`));
    });
  });

  // Chain pill: pull the real chain name from config.js so this label
  // can't silently drift out of sync with the rest of the site.
  const chainNameEl = document.getElementById("bp-chain-name");
  if (chainNameEl && typeof CONFIG !== "undefined" && CONFIG.CHAIN_NAME) {
    chainNameEl.textContent = CONFIG.CHAIN_NAME;
  }

  // $BIGPAD token banner: copy the CA to clipboard.
  const tokenCopyBtn = document.getElementById("bp-token-copy-btn");
  const tokenCaEl = document.getElementById("bp-token-ca");
  if (tokenCopyBtn && tokenCaEl) {
    tokenCopyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(tokenCaEl.textContent.trim());
        tokenCopyBtn.textContent = "Copied!";
        tokenCopyBtn.classList.add("bp-copied");
        setTimeout(() => {
          tokenCopyBtn.textContent = "Copy";
          tokenCopyBtn.classList.remove("bp-copied");
        }, 1800);
      } catch (err) {
        console.error("BigPad: failed to copy CA", err);
      }
    });
  }
})();

// ---- BigPad first-round escrow (contracts/BigPadEscrow.sol) ----
// Everything below stays a no-op — the markup keeps showing its static
// "PREVIEW" state — until CONFIG.BIGPAD_ESCROW_ADDRESS is filled in after
// a real deploy (testnet rehearsed first, always). No fabricated numbers
// ever appear before that. See contracts/BigPadEscrow.sol for exactly
// what this contract does and does not enforce — it's a cap+deadline+
// escrow only, no on-chain voting/leader/vesting logic.

function bigpadEscrowConfigured() {
  return typeof CONFIG !== "undefined" && !!CONFIG.BIGPAD_ESCROW_ADDRESS && CONFIG.BIGPAD_ESCROW_ADDRESS.length === 42;
}
function bigpadEscrowRead() {
  return new ethers.Contract(CONFIG.BIGPAD_ESCROW_ADDRESS, BIGPAD_ESCROW_ABI, readProvider());
}
function bigpadEscrowWrite() {
  return new ethers.Contract(CONFIG.BIGPAD_ESCROW_ADDRESS, BIGPAD_ESCROW_ABI, state.signer);
}

let _bigpadState = null; // cached snapshot from the last fetchBigpadState() call
let _bigpadDeadline = null; // cached unix seconds, null until started
let _bigpadStarted = false;
let _bigpadCountdownTimer = null;
let _bigpadPollTimer = null;

// A small Multicall3 handle just for getEthBalance — MULTICALL3_ADDRESS and
// multicallRead() itself come from app.js (shared top-level scope, same as
// readProvider/state/short elsewhere in this file).
function bigpadMcBalance() {
  return new ethers.Contract(MULTICALL3_ADDRESS, ["function getEthBalance(address) view returns (uint256)"], readProvider());
}

// Every poll used to be a dozen-plus separate eth_calls spread across five
// different refresh functions — several of them re-fetching the exact same
// field more than once per cycle (isOpen(), started(), recipient(),
// totalRaised() were each read 2-3x). This batches all of it into one
// Multicall3 round trip (falls back to one request per call if Multicall3
// isn't deployed on the chain — see multicallRead in app.js).
async function fetchBigpadState() {
  if (!bigpadEscrowConfigured()) return null;
  const escrow = bigpadEscrowRead();
  const mcBal = bigpadMcBalance();

  const calls = [
    { contract: escrow, method: "cap" },
    { contract: escrow, method: "started" },
    { contract: escrow, method: "deadline" },
    { contract: escrow, method: "totalRaised" },
    { contract: escrow, method: "isOpen" },
    { contract: escrow, method: "recipient" },
    { contract: escrow, method: "distributed" },
    { contract: mcBal, method: "getEthBalance", args: [CONFIG.BIGPAD_ESCROW_ADDRESS] },
  ];
  let meIdx = -1, myBalIdx = -1;
  if (state.account) {
    meIdx = calls.push({ contract: escrow, method: "contributions", args: [state.account] }) - 1;
    myBalIdx = calls.push({ contract: mcBal, method: "getEthBalance", args: [state.account] }) - 1;
  }

  // multicallRead resolves a failed individual call to null rather than
  // rejecting the whole batch (see app.js) — right for most pages, but
  // silently treating a failed started()/isOpen()/distributed() read as
  // false would be actively wrong: a transient RPC hiccup could make an
  // already-live round flash back to "not started". Retry the whole
  // batch a couple times if any of those three come back null before
  // falling back to the last known-good value (or false, only if this is
  // the very first load and there's nothing to fall back to).
  let r = await multicallRead(calls);
  for (let attempt = 0; attempt < 2 && (r[1] === null || r[4] === null || r[6] === null); attempt++) {
    await new Promise((res) => setTimeout(res, 400));
    r = await multicallRead(calls);
  }

  const prev = _bigpadState || {};
  _bigpadState = {
    cap: r[0] ?? prev.cap ?? 0n,
    started: r[1] === null ? (prev.started ?? false) : !!r[1],
    deadline: r[2] ?? prev.deadline ?? 0n,
    totalRaised: r[3] ?? prev.totalRaised ?? 0n,
    isOpen: r[4] === null ? (prev.isOpen ?? false) : !!r[4],
    recipient: r[5] || prev.recipient || ethers.ZeroAddress,
    distributed: r[6] === null ? (prev.distributed ?? false) : !!r[6],
    balance: r[7] ?? prev.balance ?? 0n,
    myContribution: meIdx >= 0 ? (r[meIdx] ?? prev.myContribution ?? 0n) : 0n,
    myWalletBalance: myBalIdx >= 0 ? (r[myBalIdx] ?? prev.myWalletBalance ?? 0n) : null,
  };
  if (r[1] === null || r[4] === null || r[6] === null) {
    console.warn("BigPad: started/isOpen/distributed still unreadable after retries — showing last known state.");
  }
  return _bigpadState;
}

function fmtEth(wei, maxDecimals = 4) {
  const n = Number(ethers.formatEther(wei));
  return isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals }) : "—";
}

function timeAgo(unixSec) {
  if (!unixSec) return "";
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

// Single DOM-update pass from one fetchBigpadState() snapshot — status/
// badge, progress bar, countdown, contribute/start/refund/withdraw
// buttons, wallet balance, and the My Position panel all come from the
// same batch instead of each re-querying the chain independently.
function applyBigpadState(s) {
  if (!s) return;
  _bigpadStarted = s.started;
  _bigpadDeadline = s.started ? Number(s.deadline) : null;
  const capUncapped = s.cap === 0n;
  const capReached = !capUncapped && s.totalRaised >= s.cap;
  const isRecipient = !!(state.account && s.recipient && state.account.toLowerCase() === s.recipient.toLowerCase());

  const statusEl = document.getElementById("bp-round-status");
  if (statusEl) {
    if (!s.started) statusEl.innerHTML = `<span class="bp-status-dot amber"></span>Not started — waiting on BigPad`;
    else if (s.isOpen) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Live — raise open`;
    else if (capReached) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Cap reached — raise closed`;
    else statusEl.innerHTML = `<span class="bp-status-dot"></span>Raise closed`;
  }

  // Sidebar footer note + hero button both assumed "nothing is built yet"
  // — once the escrow is actually deployed that stops being true, so both
  // need to track the same real lifecycle the status row does.
  const footDot = document.getElementById("bp-side-status-dot");
  const footText = document.getElementById("bp-side-foot-text");
  const previewBtn = document.getElementById("bp-see-preview");
  if (footText) {
    if (!s.started) {
      footText.textContent = "Escrow is deployed — waiting for BigPad to start the raise.";
      if (footDot) footDot.className = "bp-side-status-dot";
    } else if (s.isOpen) {
      footText.textContent = "Live — the raise is open for contributions.";
      if (footDot) footDot.className = "bp-side-status-dot bp-live";
    } else {
      footText.textContent = "Raise closed — funds pending distribution.";
      if (footDot) footDot.className = "bp-side-status-dot" + (capReached ? " bp-live" : "");
    }
  }
  if (previewBtn) {
    previewBtn.textContent = !s.started ? "See the round" : s.isOpen ? "Join the round" : "See the results";
  }

  // Badge only turns green/"LIVE" once the recipient has actually called
  // start() — deployed-but-not-started stays "READY" so nobody mistakes
  // this for an open raise before it is one.
  document.querySelectorAll(".bp-featured-badge").forEach((el) => {
    if (s.started) { el.textContent = "LIVE"; el.classList.add("bp-live"); }
    else { el.textContent = "READY"; el.classList.remove("bp-live"); }
  });

  const progressBarEl = document.getElementById("bp-round-progress-fill")?.parentElement;
  const fillEl = document.getElementById("bp-round-progress-fill");
  const labelEl = document.getElementById("bp-round-progress-label");
  if (capUncapped) {
    if (progressBarEl) progressBarEl.style.display = "none";
    if (labelEl) labelEl.innerHTML = `<strong>${fmtEth(s.totalRaised)} ETH</strong> raised so far — uncapped`;
  } else {
    const pct = s.cap > 0n ? Math.min(100, Number((s.totalRaised * 10000n) / s.cap) / 100) : 0;
    if (progressBarEl) progressBarEl.style.display = "";
    if (fillEl) fillEl.style.width = pct + "%";
    if (labelEl) labelEl.innerHTML = `<strong>${fmtEth(s.totalRaised)} ETH</strong> raised of <strong>${fmtEth(s.cap)} ETH</strong> goal`;
  }

  const lengthEl = document.getElementById("bp-stat-length");
  if (lengthEl) lengthEl.textContent = s.started ? new Date(_bigpadDeadline * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not started";

  const btn = document.getElementById("bp-contribute-btn");
  const row = document.getElementById("bp-contribute-row");
  const balanceRow = document.getElementById("bp-balance-row");
  const balanceVal = document.getElementById("bp-wallet-balance");
  if (btn && row) {
    if (s.isOpen) {
      row.style.display = "flex";
      btn.disabled = false;
      btn.textContent = "Contribute ETH";
      if (state.account && balanceRow && balanceVal) {
        balanceVal.textContent = fmtEth(s.myWalletBalance ?? 0n) + " ETH";
        balanceRow.style.display = "block";
      } else if (balanceRow) {
        balanceRow.style.display = "none";
      }
    } else {
      row.style.display = "none";
      btn.disabled = true;
      btn.textContent = !s.started ? "Not started yet" : capReached ? "Cap reached — closed" : "Raise ended";
      if (balanceRow) balanceRow.style.display = "none";
    }
  }

  // Start button: recipient only, only before start().
  const startRow = document.getElementById("bp-start-row");
  if (startRow) startRow.style.display = state.account && isRecipient && !s.started ? "block" : "none";

  // Refund button: any contributor with an outstanding balance, any time
  // the raise is open — no lock-in.
  const refundRow = document.getElementById("bp-refund-row");
  const refundBtn = document.getElementById("bp-refund-btn");
  if (refundRow && refundBtn) {
    if (state.account && s.isOpen && s.myContribution > 0n) {
      refundRow.style.display = "block";
      if (!refundBtn.dataset.busy) refundBtn.textContent = `Withdraw my ${fmtEth(s.myContribution)} ETH`;
    } else {
      refundRow.style.display = "none";
    }
  }

  // Withdraw & split button: recipient only, only once closed and
  // undistributed with a nonzero balance.
  const withdrawRow = document.getElementById("bp-withdraw-row");
  const withdrawBtn = document.getElementById("bp-withdraw-btn");
  if (withdrawRow && withdrawBtn) {
    if (state.account && isRecipient && !s.isOpen && !s.distributed && s.balance > 0n) {
      withdrawRow.style.display = "block";
      if (!withdrawBtn.dataset.busy) withdrawBtn.textContent = `Withdraw ${fmtEth(s.balance)} ETH — split 80/5/15`;
    } else {
      withdrawRow.style.display = "none";
    }
  }

  // My Position panel + featured-side line + mini-stats.
  const positionEl = document.getElementById("bp-position-body");
  const sideEl = document.getElementById("bp-my-position");
  const mineStat = document.getElementById("bp-stat-mine");
  const shareStat = document.getElementById("bp-stat-myshare");
  if (!state.account) {
    if (positionEl) { positionEl.className = "bp-empty"; positionEl.textContent = "Connect your wallet to see your position."; }
    if (sideEl) sideEl.textContent = "";
    if (mineStat) mineStat.textContent = "—";
    if (shareStat) shareStat.textContent = "—";
  } else {
    const mine = s.myContribution;
    const pct = s.totalRaised > 0n ? (Number((mine * 10000n) / s.totalRaised) / 100).toFixed(2) : "0.00";
    if (mine === 0n) {
      if (positionEl) { positionEl.className = "bp-empty"; positionEl.textContent = "No contribution yet from this wallet."; }
      if (sideEl) sideEl.textContent = "";
      if (mineStat) mineStat.textContent = "0 ETH";
      if (shareStat) shareStat.textContent = "0%";
    } else {
      if (positionEl) { positionEl.className = ""; positionEl.innerHTML = `You've contributed <strong>${fmtEth(mine)} ETH</strong> — <strong>${pct}%</strong> of the raise so far.`; }
      if (sideEl) sideEl.innerHTML = `Your contribution: <strong>${fmtEth(mine)} ETH</strong> (${pct}%)`;
      if (mineStat) mineStat.textContent = fmtEth(mine) + " ETH";
      if (shareStat) shareStat.textContent = pct + "%";
    }
  }

  updateBigpadCountdown();
}

async function refreshBigpadCore() {
  applyBigpadState(await fetchBigpadState());
}

function updateBigpadCountdown() {
  const el = document.getElementById("bp-round-countdown");
  if (!el) return;
  if (!_bigpadStarted || _bigpadDeadline === null) { el.innerHTML = ""; return; }
  const remaining = _bigpadDeadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) { el.innerHTML = "Raise ended"; return; }
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  el.innerHTML = `Ends in <strong>${d}d ${h}h ${m}m ${s}s</strong>`;
}

async function initBigpadRound() {
  if (!bigpadEscrowConfigured()) return;

  const lengthLabel = document.getElementById("bp-stat-length-label");
  if (lengthLabel) lengthLabel.textContent = "Ends";
  const payoutLabel = document.getElementById("bp-stat-payout-label");
  if (payoutLabel) payoutLabel.textContent = "Payout wallet";

  // This contract only escrows ETH — it does not enforce the vote/lead/
  // vesting mechanism the rest of this page documents, so the copy that
  // assumed that mechanism was live needs to say so plainly instead.
  const desc = document.getElementById("bp-featured-desc");
  if (desc) desc.textContent = "This round is contribution-only on-chain: ETH sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap is not enforced by this contract — see Docs > Safety design.";
  const govNote = document.getElementById("bp-gov-note");
  if (govNote) govNote.textContent = "Not enforced on-chain in this round — see Docs > Safety design for why.";
  const govPanelNote = document.getElementById("bp-gov-panel-note");
  if (govPanelNote) govPanelNote.textContent = "This round's contract only handles contributions. Voting on name, ticker, logo, roadmap, and launch date is not enforced by smart contract here — how that gets decided will be announced separately.";

  try {
    const escrow = bigpadEscrowRead();
    const [recipient, platformWallet, treasuryWallet] = await Promise.all([
      escrow.recipient(), escrow.platformWallet(), escrow.treasuryWallet(),
    ]);
    const payoutEl = document.getElementById("bp-stat-payout");
    if (payoutEl) payoutEl.innerHTML = `<a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">${short(recipient)}</a>`;

    const nextTitle = document.getElementById("bp-nextcard-title");
    const nextBody = document.getElementById("bp-nextcard-body");
    if (nextTitle) nextTitle.textContent = "How this round actually closes";
    if (nextBody) {
      nextBody.innerHTML = `Once the recipient starts the clock, the raise runs for 72 hours. Contributors can withdraw their own ETH any time before it closes, no lock-in. When it closes, the balance splits automatically: 80% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">recipient wallet</a>, 5% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${platformWallet}" target="_blank" rel="noopener">platform wallet</a>, and 15% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${treasuryWallet}" target="_blank" rel="noopener">treasury wallet</a>. The bigger vote/lead/vesting mechanism described above this card is a separate contract, still in design and review.`;
    }
  } catch (err) {
    console.error("BigPad: failed to load recipient/platform/treasury", err);
  }

  // Independent of each other — no reason to wait for one before starting
  // the other, and the leaderboard's first-ever fetch (binary-searching
  // for the round's starting block, see blockAtOrAfter in app.js) is the
  // slower of the two on a fresh browser with nothing cached yet.
  await Promise.all([refreshBigpadCore(), refreshBigpadLeaderboard()]);
  wireBigpadContribute();
  wireBigpadWithdraw();
  wireBigpadStart();
  wireBigpadRefund();

  if (_bigpadCountdownTimer) clearInterval(_bigpadCountdownTimer);
  _bigpadCountdownTimer = setInterval(updateBigpadCountdown, 1000);

  // Light polling for totals/leaderboard so other people's contributions
  // show up without a page reload. A contribution made from THIS tab
  // already triggers its own immediate refresh (see wireBigpadContribute).
  if (_bigpadPollTimer) clearInterval(_bigpadPollTimer);
  _bigpadPollTimer = setInterval(() => {
    refreshBigpadCore();
    refreshBigpadLeaderboard();
  }, 15000);
}

function bigpadLbRowHtml(r, i, pctFn) {
  return `<div class="bp-lb-row">
    <span class="bp-lb-rank">#${i + 1}</span>
    <span class="bp-lb-addr">${short(r.address)}</span>
    <span class="bp-lb-amount">${fmtEth(r.amount)} ETH</span>
    <span class="bp-lb-pct">${pctFn(r.amount)}%</span>
    <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${r.address}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
  </div>`;
}

let _bigpadLeaderboardLoadedOnce = false;

async function refreshBigpadLeaderboard() {
  if (!bigpadEscrowConfigured()) return;
  const escrow = bigpadEscrowRead();
  const sinceIso = CONFIG.BIGPAD_LIVE_SINCE || CONFIG.CONTRACTS_LIVE_SINCE;

  // The very first fetch has to binary-search for the round's starting
  // block (see blockAtOrAfter in app.js) — a handful of sequential RPC
  // round trips on a browser with nothing cached yet, easily a couple of
  // seconds. Say so instead of leaving the static "No contributors yet"
  // text sitting there looking like a real (and possibly wrong) answer.
  if (!_bigpadLeaderboardLoadedOnce) {
    const homeElInit = document.getElementById("bp-home-leaderboard");
    if (homeElInit) { homeElInit.className = "bp-empty"; homeElInit.textContent = "Loading…"; }
    const fullElInit = document.getElementById("bp-full-leaderboard");
    if (fullElInit) fullElInit.textContent = "Loading…";
  }

  let fromBlock = 0;
  try { fromBlock = await blockAtOrAfter(sinceIso, "bigpad"); } catch { /* falls back to scanning from genesis */ }

  let events = [], refundEvents = [];
  let loaded = false;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      [events, refundEvents] = await Promise.all([
        escrow.queryFilter(escrow.filters.Contributed(), fromBlock, "latest"),
        escrow.queryFilter(escrow.filters.Refunded(), fromBlock, "latest"),
      ]);
      loaded = true;
    } catch (err) {
      console.error(`BigPad: failed to load Contributed/Refunded events (attempt ${attempt + 1})`, err);
      if (attempt < 2) await new Promise((res) => setTimeout(res, 600));
    }
  }
  if (!loaded) {
    // Only show this if we've never once loaded successfully — a poll
    // that fails after an earlier success just leaves the last good data
    // up rather than replacing it with an error.
    if (!_bigpadLeaderboardLoadedOnce) {
      const homeEl = document.getElementById("bp-home-leaderboard");
      if (homeEl) { homeEl.className = "bp-empty"; homeEl.textContent = "Couldn't load the leaderboard — retrying shortly."; }
      const fullEl = document.getElementById("bp-full-leaderboard");
      if (fullEl) fullEl.textContent = "Couldn't load the leaderboard — retrying shortly.";
    }
    return;
  }
  _bigpadLeaderboardLoadedOnce = true;

  // Per-address totals read straight from the contract (authoritative)
  // rather than summed from events, so this can never double-count and
  // automatically reflects any refunds already paid out. Batched through
  // Multicall3 — one round trip instead of one eth_call per contributor.
  const uniqueAddrs = [...new Set(events.map((e) => e.args.contributor))];
  const amounts = uniqueAddrs.length > 0
    ? await multicallRead(uniqueAddrs.map((a) => ({ contract: escrow, method: "contributions", args: [a] })))
    : [];
  const rows = uniqueAddrs
    .map((address, i) => ({ address, amount: amounts[i] ?? 0n }))
    .filter((r) => r.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  const total = rows.reduce((sum, r) => sum + r.amount, 0n);
  const pctOf = (amount) => (total > 0n ? (Number((amount * 10000n) / total) / 100).toFixed(2) : "0.00");

  const homeEl = document.getElementById("bp-home-leaderboard");
  if (homeEl) {
    if (rows.length === 0) {
      homeEl.className = "bp-empty";
      homeEl.textContent = "No contributors yet. The leaderboard fills in once a raise opens.";
    } else {
      homeEl.className = "bp-lb-mini";
      homeEl.innerHTML = rows.slice(0, 3).map((r, i) => bigpadLbRowHtml(r, i, pctOf)).join("")
        + (rows.length > 3 ? `<div class="bp-lb-more">+${rows.length - 3} more</div>` : "");
    }
  }

  const fullEl = document.getElementById("bp-full-leaderboard");
  if (fullEl) {
    fullEl.innerHTML = rows.length === 0
      ? "No contributors yet. The leaderboard fills in once a raise opens."
      : rows.map((r, i) => bigpadLbRowHtml(r, i, pctOf)).join("");
  }

  // Recent activity merges contributions (+) and refunds (−) in one feed,
  // newest first, so it's an honest picture of money moving both ways —
  // not just inflows.
  const activityEl = document.getElementById("bp-recent-activity");
  if (activityEl) {
    const merged = [
      ...events.map((e) => ({ e, kind: "in" })),
      ...refundEvents.map((e) => ({ e, kind: "out" })),
    ].sort((a, b) => (a.e.blockNumber - b.e.blockNumber) || ((a.e.index || 0) - (b.e.index || 0)));
    const recent = merged.slice(-15).reverse();
    if (recent.length === 0) {
      activityEl.innerHTML = "";
    } else {
      const blockNumbers = [...new Set(recent.map((item) => item.e.blockNumber))];
      const blocks = await Promise.all(blockNumbers.map((n) => readProvider().getBlock(n)));
      const blockTime = new Map(blockNumbers.map((n, i) => [n, Number(blocks[i].timestamp)]));
      activityEl.innerHTML = `<h4>Recent activity</h4>` + recent.map(({ e, kind }) => `
        <div class="bp-activity-item${kind === "out" ? " bp-activity-out" : ""}">
          <span class="bp-activity-addr">${short(e.args.contributor)}</span>
          <span class="bp-activity-amount">${kind === "out" ? "−" : "+"}${fmtEth(e.args.amount)} ETH</span>
          <span class="bp-activity-time">${timeAgo(blockTime.get(e.blockNumber))}</span>
          <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${e.args.contributor}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
        </div>`).join("");
    }
  }

  const contributorsEl = document.getElementById("bp-stat-contributors");
  if (contributorsEl) contributorsEl.textContent = rows.length > 0 ? String(rows.length) : "—";
  const leadEl = document.getElementById("bp-stat-lead");
  if (leadEl) leadEl.textContent = rows.length > 0 ? short(rows[0].address) : "—";
}

// Called by app.js's refreshAccountDependentViews() on every account
// change (connect / disconnect / switch) — the same shared hook world.html
// and adventure.html plug into. No-op if the round isn't configured yet.
function refreshBigpadMyPosition() {
  if (!bigpadEscrowConfigured()) return;
  refreshBigpadCore();
}

function wireBigpadStart() {
  const btn = document.getElementById("bp-start-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!confirm("This starts the 72-hour funding window right now — it can't be undone or redone. Continue?")) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      const escrow = bigpadEscrowWrite();
      const tx = await escrow.start();
      btn.textContent = "Confirming…";
      await tx.wait();
      await refreshBigpadCore();
    } catch (err) {
      console.error("BigPad: start failed", err);
      alert(err?.reason || err?.shortMessage || "Start failed or was rejected.");
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireBigpadRefund() {
  const btn = document.getElementById("bp-refund-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      const escrow = bigpadEscrowWrite();
      const mine = await escrow.contributions(state.account);
      const tx = await escrow.refund(mine);
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      await Promise.all([refreshBigpadCore(), refreshBigpadLeaderboard()]);
    } catch (err) {
      console.error("BigPad: refund failed", err);
      alert(err?.reason || err?.shortMessage || "Withdraw failed or was rejected.");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireBigpadWithdraw() {
  const btn = document.getElementById("bp-withdraw-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!confirm("This splits the full balance 80% to the recipient wallet, 5% to the platform wallet, and 15% to the treasury wallet. Continue?")) return;
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      const escrow = bigpadEscrowWrite();
      const tx = await escrow.withdraw();
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      await refreshBigpadCore();
    } catch (err) {
      console.error("BigPad: withdraw failed", err);
      alert(err?.reason || err?.shortMessage || "Withdraw failed or was rejected.");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireBigpadContribute() {
  const btn = document.getElementById("bp-contribute-btn");
  const input = document.getElementById("bp-contribute-amount");
  const maxBtn = document.getElementById("bp-contribute-max");
  if (!btn || !input || !maxBtn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  maxBtn.addEventListener("click", async () => {
    try {
      const escrow = bigpadEscrowRead();
      let amount = await escrow.remainingCap();
      if (state.account) {
        const balance = await readProvider().getBalance(state.account);
        const gasBuffer = ethers.parseEther("0.005"); // leave a little headroom for gas
        const spendable = balance > gasBuffer ? balance - gasBuffer : 0n;
        if (spendable < amount) amount = spendable;
      }
      input.value = amount > 0n ? ethers.formatEther(amount) : "0";
    } catch (err) {
      console.error("BigPad: failed to compute max contribution", err);
    }
  });

  btn.addEventListener("click", async () => {
    if (!state.account) {
      if (typeof connectWallet === "function") await connectWallet();
      if (!state.account) return;
    }
    const amountStr = input.value;
    if (!amountStr || Number(amountStr) <= 0) { alert("Enter an ETH amount to contribute."); return; }

    let amount;
    try { amount = ethers.parseEther(amountStr); }
    catch { alert("That doesn't look like a valid ETH amount."); return; }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      const escrow = bigpadEscrowWrite();
      const tx = await escrow.contribute({ value: amount });
      btn.textContent = "Confirming…";
      await tx.wait();
      input.value = "";
      await Promise.all([refreshBigpadCore(), refreshBigpadLeaderboard()]);
    } catch (err) {
      console.error("BigPad: contribution failed", err);
      alert(err?.reason || err?.shortMessage || "Transaction failed or was rejected.");
      btn.disabled = false;
      btn.textContent = originalText;
      refreshBigpadCore(); // re-applies the correct disabled/label state
    }
  });
}

initBigpadRound();
