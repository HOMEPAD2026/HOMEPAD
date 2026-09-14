// bigpad.js — BigPad dashboard interactivity. Still no live contract call
// anywhere in this file: the fund-pooling/auction/vote/vesting mechanism
// is a design, not a deployed contract (see the Docs > Safety design tab),
// so every number that would come from a real round is left as "—" in
// the markup rather than invented here.

(() => {
  // ---- Main sidebar tabs (Home / Projects / Governance / ...) ----
  const navItems = document.querySelectorAll(".bp-nav-item[data-tab]");
  const panels = document.querySelectorAll(".bp-panel");

  function showTab(tab) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `bp-panel-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

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

let _bigpadDeadline = null; // cached unix seconds
let _bigpadCountdownTimer = null;
let _bigpadPollTimer = null;

async function initBigpadRound() {
  if (!bigpadEscrowConfigured()) return;

  document.querySelectorAll(".bp-featured-badge").forEach((el) => { el.textContent = "LIVE"; el.classList.add("bp-live"); });
  const lengthLabel = document.getElementById("bp-stat-length-label");
  if (lengthLabel) lengthLabel.textContent = "Ends";
  const payoutLabel = document.getElementById("bp-stat-payout-label");
  if (payoutLabel) payoutLabel.textContent = "Payout wallet";

  // This contract only escrows ETH — it does not enforce the vote/lead/
  // vesting mechanism the rest of this page documents, so the copy that
  // assumed that mechanism was live needs to say so plainly instead.
  const desc = document.getElementById("bp-featured-desc");
  if (desc) desc.textContent = "This round is contribution-only on-chain: ETH is held in an escrow contract with a hard cap and deadline. Voting on name, ticker, logo, and roadmap is not enforced by this contract — see Docs > Safety design.";
  const govNote = document.getElementById("bp-gov-note");
  if (govNote) govNote.textContent = "Not enforced on-chain in this round — see Docs > Safety design for why.";
  const govPanelNote = document.getElementById("bp-gov-panel-note");
  if (govPanelNote) govPanelNote.textContent = "This round's contract only handles contributions. Voting on name, ticker, logo, roadmap, and launch date is not enforced by smart contract here — how that gets decided will be announced separately.";

  try {
    const escrow = bigpadEscrowRead();
    const recipient = await escrow.recipient();
    const payoutEl = document.getElementById("bp-stat-payout");
    if (payoutEl) payoutEl.innerHTML = `<a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">${short(recipient)}</a>`;
  } catch (err) {
    console.error("BigPad: failed to load recipient", err);
  }

  await refreshBigpadStats();
  await refreshBigpadLeaderboard();
  refreshBigpadMyPosition();
  wireBigpadContribute();
  wireBigpadWithdraw();

  if (_bigpadCountdownTimer) clearInterval(_bigpadCountdownTimer);
  _bigpadCountdownTimer = setInterval(updateBigpadCountdown, 1000);

  // Light polling for totals/leaderboard so other people's contributions
  // show up without a page reload. A contribution made from THIS tab
  // already triggers its own immediate refresh (see wireBigpadContribute).
  if (_bigpadPollTimer) clearInterval(_bigpadPollTimer);
  _bigpadPollTimer = setInterval(() => {
    refreshBigpadStats();
    refreshBigpadLeaderboard();
    refreshBigpadMyPosition();
  }, 15000);
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

async function refreshBigpadStats() {
  if (!bigpadEscrowConfigured()) return;
  const escrow = bigpadEscrowRead();
  const [cap, deadline, totalRaised, isOpen] = await Promise.all([
    escrow.cap(), escrow.deadline(), escrow.totalRaised(), escrow.isOpen(),
  ]);
  _bigpadDeadline = Number(deadline);
  const capUncapped = cap === 0n;
  const capReached = !capUncapped && totalRaised >= cap;

  const statusEl = document.getElementById("bp-round-status");
  if (statusEl) {
    if (isOpen) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Live — raise open`;
    else if (capReached) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Cap reached — raise closed`;
    else statusEl.innerHTML = `<span class="bp-status-dot"></span>Raise closed`;
  }

  const progressBarEl = document.getElementById("bp-round-progress-fill")?.parentElement;
  const fillEl = document.getElementById("bp-round-progress-fill");
  const labelEl = document.getElementById("bp-round-progress-label");
  if (capUncapped) {
    if (progressBarEl) progressBarEl.style.display = "none";
    if (labelEl) labelEl.innerHTML = `<strong>${fmtEth(totalRaised)} ETH</strong> raised so far — uncapped`;
  } else {
    const pct = cap > 0n ? Math.min(100, Number((totalRaised * 10000n) / cap) / 100) : 0;
    if (progressBarEl) progressBarEl.style.display = "";
    if (fillEl) fillEl.style.width = pct + "%";
    if (labelEl) labelEl.innerHTML = `<strong>${fmtEth(totalRaised)} ETH</strong> raised of <strong>${fmtEth(cap)} ETH</strong> goal`;
  }

  const lengthEl = document.getElementById("bp-stat-length");
  if (lengthEl) lengthEl.textContent = new Date(_bigpadDeadline * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const btn = document.getElementById("bp-contribute-btn");
  const row = document.getElementById("bp-contribute-row");
  const balanceRow = document.getElementById("bp-balance-row");
  if (btn && row) {
    if (isOpen) {
      row.style.display = "flex";
      btn.disabled = false;
      btn.textContent = "Contribute ETH";
    } else {
      row.style.display = "none";
      btn.disabled = true;
      btn.textContent = capReached ? "Cap reached — closed" : "Raise ended";
      if (balanceRow) balanceRow.style.display = "none";
    }
  }
  if (isOpen) refreshBigpadWalletBalance();

  updateBigpadCountdown();
}

// Shows the connected wallet's ETH balance right above the contribute
// input, so someone can see what they have before typing an amount.
// Only shown while the raise is actually open (same as the input itself).
async function refreshBigpadWalletBalance() {
  const row = document.getElementById("bp-balance-row");
  const valEl = document.getElementById("bp-wallet-balance");
  if (!row || !valEl) return;
  if (!state.account) { row.style.display = "none"; return; }
  try {
    const balance = await readProvider().getBalance(state.account);
    valEl.textContent = fmtEth(balance) + " ETH";
    row.style.display = "block";
  } catch (err) {
    console.error("BigPad: failed to load wallet balance", err);
  }
}

function updateBigpadCountdown() {
  const el = document.getElementById("bp-round-countdown");
  if (!el || _bigpadDeadline === null) return;
  const remaining = _bigpadDeadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) { el.innerHTML = "Raise ended"; return; }
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  el.innerHTML = `Ends in <strong>${d}d ${h}h ${m}m ${s}s</strong>`;
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

async function refreshBigpadLeaderboard() {
  if (!bigpadEscrowConfigured()) return;
  const escrow = bigpadEscrowRead();
  const sinceIso = CONFIG.BIGPAD_LIVE_SINCE || CONFIG.CONTRACTS_LIVE_SINCE;

  let fromBlock = 0;
  try { fromBlock = await blockAtOrAfter(sinceIso, "bigpad"); } catch { /* falls back to scanning from genesis */ }

  let events = [];
  try {
    events = await escrow.queryFilter(escrow.filters.Contributed(), fromBlock, "latest");
  } catch (err) {
    console.error("BigPad: failed to load Contributed events", err);
    return;
  }

  // Per-address totals read straight from the contract (authoritative)
  // rather than summed from events, so this can never double-count.
  const uniqueAddrs = [...new Set(events.map((e) => e.args.contributor))];
  const amounts = await Promise.all(uniqueAddrs.map((a) => escrow.contributions(a)));
  const rows = uniqueAddrs
    .map((address, i) => ({ address, amount: amounts[i] }))
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

  const activityEl = document.getElementById("bp-recent-activity");
  if (activityEl) {
    const recent = events.slice(-15).reverse();
    if (recent.length === 0) {
      activityEl.innerHTML = "";
    } else {
      const blockNumbers = [...new Set(recent.map((e) => e.blockNumber))];
      const blocks = await Promise.all(blockNumbers.map((n) => readProvider().getBlock(n)));
      const blockTime = new Map(blockNumbers.map((n, i) => [n, Number(blocks[i].timestamp)]));
      activityEl.innerHTML = `<h4>Recent activity</h4>` + recent.map((e) => `
        <div class="bp-activity-item">
          <span class="bp-activity-addr">${short(e.args.contributor)}</span>
          <span class="bp-activity-amount">${fmtEth(e.args.amount)} ETH</span>
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
  const positionEl = document.getElementById("bp-position-body");
  const sideEl = document.getElementById("bp-my-position");
  const mineStat = document.getElementById("bp-stat-mine");
  const shareStat = document.getElementById("bp-stat-myshare");

  if (!state.account) {
    if (positionEl) { positionEl.className = "bp-empty"; positionEl.textContent = "Connect your wallet to see your position."; }
    if (sideEl) sideEl.textContent = "";
    if (mineStat) mineStat.textContent = "—";
    if (shareStat) shareStat.textContent = "—";
    refreshBigpadWithdraw();
    refreshBigpadWalletBalance();
    return;
  }

  const escrow = bigpadEscrowRead();
  const myAddress = state.account;
  Promise.all([escrow.contributions(myAddress), escrow.totalRaised()])
    .then(([mine, total]) => {
      const pct = total > 0n ? (Number((mine * 10000n) / total) / 100).toFixed(2) : "0.00";
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
    })
    .catch((err) => console.error("BigPad: failed to load your position", err));

  refreshBigpadWithdraw();
  refreshBigpadWalletBalance();
}

// Shows a "Withdraw" button only to the recipient wallet itself, and only
// once the round has actually closed (deadline passed or cap reached) and
// there's an un-withdrawn balance — everyone else never sees it.
async function refreshBigpadWithdraw() {
  if (!bigpadEscrowConfigured()) return;
  const row = document.getElementById("bp-withdraw-row");
  const btn = document.getElementById("bp-withdraw-btn");
  if (!row || !btn) return;

  if (!state.account) { row.style.display = "none"; return; }

  try {
    const escrow = bigpadEscrowRead();
    const [recipient, isOpen, withdrawn, balance] = await Promise.all([
      escrow.recipient(), escrow.isOpen(), escrow.withdrawn(), readProvider().getBalance(CONFIG.BIGPAD_ESCROW_ADDRESS),
    ]);
    const isRecipient = state.account.toLowerCase() === recipient.toLowerCase();
    if (isRecipient && !isOpen && !withdrawn && balance > 0n) {
      row.style.display = "block";
      if (!btn.dataset.busy) btn.textContent = `Withdraw ${fmtEth(balance)} ETH to recipient wallet`;
    } else {
      row.style.display = "none";
    }
  } catch (err) {
    console.error("BigPad: failed to check withdraw eligibility", err);
  }
}

function wireBigpadWithdraw() {
  const btn = document.getElementById("bp-withdraw-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!confirm("This sends the full escrowed balance to the recipient wallet. Continue?")) return;
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
      await Promise.all([refreshBigpadStats(), refreshBigpadWithdraw()]);
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
      await Promise.all([refreshBigpadStats(), refreshBigpadLeaderboard()]);
      refreshBigpadMyPosition();
    } catch (err) {
      console.error("BigPad: contribution failed", err);
      alert(err?.reason || err?.shortMessage || "Transaction failed or was rejected.");
      btn.disabled = false;
      btn.textContent = originalText;
      refreshBigpadStats(); // re-applies the correct disabled/label state
    }
  });
}

initBigpadRound();
