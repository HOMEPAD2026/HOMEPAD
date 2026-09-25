// circlepad.js — CirclePad dashboard interactivity. Still no live contract call
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

  // Deep links: circlepad.html#governance / #docs etc. open that tab.
  const openTabFromHash = () => {
    const tab = (location.hash || "").replace(/^#\/?/, "");
    if (tab && document.getElementById(`bp-panel-${tab}`)) showTab(tab);
  };
  openTabFromHash();
  window.addEventListener("hashchange", openTabFromHash);

  // Docs → Contracts: addresses straight from config-arc.js (see
  // renderContractRows in arc-shared.js). The vote contract deploys only
  // after start() is called, so it's expected to read "not deployed yet"
  // until then.
  const contractsEl = document.getElementById("cp-contracts");
  if (contractsEl && typeof renderContractRows === "function") {
    contractsEl.innerHTML = renderContractRows([
      ["BigPadEscrow (CirclePad round #1)", CONFIG.CIRCLEPAD_ESCROW_ADDRESS, "Holds the 72h USDC raise; withdraw any time before close; 80/5/15 split at close"],
      ["BigPadVote (identity voting)", CONFIG.CIRCLEPAD_VOTE_ADDRESS, "Name / ticker / logo / roadmap / launch-date votes, weighted by contribution — deploys once the raise has started"],
    ]);
  }
})();

// ---- In-page messages instead of the browser's alert()/confirm() ----
// cpToast(text, kind) shows a short note; cpConfirm({ title, body, ok })
// resolves true/false from a small modal (arc-a11y.js gives it focus
// handling and Escape). cpErrText(err) turns a revert or wallet error into
// a sentence.
function cpToast(msg, kind) {
  let host = document.getElementById("cp-toasts");
  if (!host) { host = document.createElement("div"); host.id = "cp-toasts"; host.className = "cp-toasts"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = "cp-toast" + (kind ? " cp-toast-" + kind : "");
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, kind === "bad" ? 6000 : 3600);
}
if (typeof window.arcToast !== "function") window.arcToast = (m, k) => cpToast(m, k === "warn" ? "bad" : k);
function cpConfirm({ title, body, ok = "Continue", cancel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "cm-modal cp-confirm";
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    m.innerHTML = `<div class="cm-backdrop" data-close></div><div class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cp-cf-t">
      <div class="cm-dhead"><div><h2 id="cp-cf-t">${esc(title)}</h2><p>${esc(body)}</p></div>
      <button type="button" class="cm-x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="cm-foot"><button type="button" class="cm-btn" data-close>${esc(cancel)}</button><button type="button" class="cm-btn cm-btn-primary${danger ? " cp-danger" : ""}" data-ok>${esc(ok)}</button></div></div>`;
    const done = (v) => { m.classList.remove("in"); setTimeout(() => m.remove(), 200); resolve(v); };
    m.addEventListener("click", (e) => { if (e.target.closest("[data-ok]")) done(true); else if (e.target.closest("[data-close]")) done(false); });
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add("in"));
  });
}
const CP_ERRORS = {
  NotStarted: "The raise hasn't started yet.",
  RaiseEnded: "The raise has already closed.",
  ZeroContribution: "Enter an amount above zero.",
  CapExceeded: "That would go over the round's cap — try a smaller amount.",
  ZeroRefundAmount: "Enter an amount above zero to withdraw.",
  InsufficientContribution: "That's more than you've put in.",
  AlreadyStarted: "The raise has already been started.",
  NotOpen: "The raise isn't open.",
  AlreadyDistributed: "The funds have already been split.",
  OwnableUnauthorizedAccount: "Only the round's recipient wallet can do that.",
};
function cpErrText(err, fallback = "Something went wrong — try again.") {
  if (!err) return fallback;
  if (err.code === "ACTION_REJECTED" || err.code === 4001 || /user (rejected|denied)|rejected the request/i.test(err.message || "")) return "Cancelled in your wallet.";
  if (err.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(err.message || "")) return "Not enough USDC in this wallet for the amount plus gas.";
  const name = (err.revert && err.revert.name) || (/reverted with custom error '(\w+)/.exec(err.message || "") || [])[1] || (/error="?(\w+)\(/.exec(err.message || "") || [])[1];
  if (name && CP_ERRORS[name]) return CP_ERRORS[name];
  for (const k of Object.keys(CP_ERRORS)) if ((err.message || "").includes(k) || (err.data && String(err.data).includes(k))) return CP_ERRORS[k];
  return err.reason || err.shortMessage || fallback;
}

// ---- CirclePad first-round escrow (contracts/CirclePadEscrow.sol) ----
// Everything below stays a no-op — the markup keeps showing its static
// "PREVIEW" state — until CONFIG.CIRCLEPAD_ESCROW_ADDRESS is filled in after
// a real deploy (testnet rehearsed first, always). No fabricated numbers
// ever appear before that. See contracts/CirclePadEscrow.sol for exactly
// what this contract does and does not enforce — it's a cap+deadline+
// escrow only, no on-chain voting/leader/vesting logic.

function circlepadEscrowConfigured() {
  return typeof CONFIG !== "undefined" && !!CONFIG.CIRCLEPAD_ESCROW_ADDRESS && CONFIG.CIRCLEPAD_ESCROW_ADDRESS.length === 42;
}
function circlepadEscrowRead() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_ESCROW_ADDRESS, CIRCLEPAD_ESCROW_ABI, readProvider());
}
function circlepadEscrowWrite() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_ESCROW_ADDRESS, CIRCLEPAD_ESCROW_ABI, state.signer);
}

let _circlepadState = null; // cached snapshot from the last fetchCirclepadState() call
let _circlepadDeadline = null; // cached unix seconds, null until started
let _circlepadStarted = false;
let _circlepadCountdownTimer = null;
let _circlepadPollTimer = null;

// A small Multicall3 handle just for getEthBalance — MULTICALL3_ADDRESS and
// multicallRead() itself come from app.js (shared top-level scope, same as
// readProvider/state/short elsewhere in this file).
function circlepadMcBalance() {
  return new ethers.Contract(MULTICALL3_ADDRESS, ["function getEthBalance(address) view returns (uint256)"], readProvider());
}

// ---- Stale-while-revalidate cache ----
// The first paint used to sit on the static "PREVIEW" markup until every
// RPC round trip finished — on a public node that's easily a couple of
// seconds of a live round looking like it isn't one. Now the last known
// state and leaderboard are kept in localStorage (keyed by the escrow
// address, so a future round at a new address starts clean) and applied
// synchronously on load, then the real fetch overwrites them as soon as
// it lands. BigInts are serialized as tagged strings since JSON can't
// carry them natively.
function circlepadCacheKey(kind) {
  // Governance state is keyed by the vote contract, everything else by
  // the escrow — so redeploying either one starts its own cache clean.
  const addr = kind === "gov" ? CONFIG.CIRCLEPAD_VOTE_ADDRESS : CONFIG.CIRCLEPAD_ESCROW_ADDRESS;
  return `circlepad.${kind}.${addr}`;
}
function circlepadSaveCache(kind, obj) {
  try {
    localStorage.setItem(circlepadCacheKey(kind), JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? { __big: v.toString() } : v)));
  } catch { /* private mode / quota — cache is best-effort only */ }
}
function circlepadLoadCache(kind) {
  try {
    const raw = localStorage.getItem(circlepadCacheKey(kind));
    if (!raw) return null;
    return JSON.parse(raw, (_k, v) => (v && typeof v === "object" && "__big" in v ? BigInt(v.__big) : v));
  } catch { return null; }
}

// Every poll used to be a dozen-plus separate eth_calls spread across five
// different refresh functions — several of them re-fetching the exact same
// field more than once per cycle (isOpen(), started(), recipient(),
// totalRaised() were each read 2-3x). This batches all of it into one
// Multicall3 round trip (falls back to one request per call if Multicall3
// isn't deployed on the chain — see multicallRead in app.js).
async function fetchCirclepadState() {
  if (!circlepadEscrowConfigured()) return null;
  const escrow = circlepadEscrowRead();
  const mcBal = circlepadMcBalance();

  const calls = [
    { contract: escrow, method: "cap" },
    { contract: escrow, method: "started" },
    { contract: escrow, method: "deadline" },
    { contract: escrow, method: "totalRaised" },
    { contract: escrow, method: "isOpen" },
    { contract: escrow, method: "recipient" },
    { contract: escrow, method: "distributed" },
    { contract: mcBal, method: "getEthBalance", args: [CONFIG.CIRCLEPAD_ESCROW_ADDRESS] },
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

  // Native balances come through Multicall3's getEthBalance; if that one
  // read fails, ask the node directly — the recipient's "Withdraw & split"
  // button depends on the escrow's balance, so it must never read as 0 by mistake.
  if (r[7] == null) r[7] = await readProvider().getBalance(CONFIG.CIRCLEPAD_ESCROW_ADDRESS).catch(() => null);
  if (myBalIdx >= 0 && r[myBalIdx] == null) r[myBalIdx] = await readProvider().getBalance(state.account).catch(() => null);

  const prev = _circlepadState || {};
  _circlepadState = {
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
    console.warn("CirclePad: started/isOpen/distributed still unreadable after retries — showing last known state.");
  } else {
    // Only the account-independent fields — a different wallet may load
    // this next time, and its own contribution/balance is fetched fresh.
    const { cap, started, deadline, totalRaised, isOpen, recipient, distributed, balance } = _circlepadState;
    circlepadSaveCache("state", { cap, started, deadline, totalRaised, isOpen, recipient, distributed, balance, savedAt: Date.now() });
  }
  return _circlepadState;
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

// Single DOM-update pass from one fetchCirclepadState() snapshot — status/
// badge, progress bar, countdown, contribute/start/refund/withdraw
// buttons, wallet balance, and the My Position panel all come from the
// same batch instead of each re-querying the chain independently.
// `accountUnknown: true` (used when painting from the localStorage cache
// before the real fetch lands) skips everything that depends on the
// connected wallet, since the cache deliberately doesn't hold that.
function applyCirclepadState(s, { accountUnknown = false } = {}) {
  if (!s) return;
  _circlepadStarted = s.started;
  _circlepadDeadline = s.started ? Number(s.deadline) : null;
  const capUncapped = s.cap === 0n;
  const capReached = !capUncapped && s.totalRaised >= s.cap;
  const isRecipient = !!(state.account && s.recipient && state.account.toLowerCase() === s.recipient.toLowerCase());

  const statusEl = document.getElementById("bp-round-status");
  if (statusEl) {
    if (!s.started) statusEl.innerHTML = `<span class="bp-status-dot amber"></span>Not started — waiting on CirclePad`;
    else if (s.isOpen) statusEl.innerHTML = `<span class="bp-status-dot bp-live"></span>Live — raise open`;
    else if (s.distributed) statusEl.innerHTML = `<span class="bp-status-dot"></span>Closed — split 80/5/15 done`;
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
      footText.textContent = "Escrow is deployed — waiting for CirclePad to start the raise.";
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
    if (labelEl) labelEl.innerHTML = `<span class="bp-raised-big">${fmtEth(s.totalRaised)} USDC</span><span class="bp-raised-suffix">raised so far — uncapped</span>`;
  } else {
    const pct = s.cap > 0n ? Math.min(100, Number((s.totalRaised * 10000n) / s.cap) / 100) : 0;
    if (progressBarEl) progressBarEl.style.display = "";
    if (fillEl) fillEl.style.width = pct + "%";
    if (labelEl) labelEl.innerHTML = `<span class="bp-raised-big">${fmtEth(s.totalRaised)} USDC</span><span class="bp-raised-suffix">of <strong>${fmtEth(s.cap)} USDC</strong> goal</span>`;
  }

  const lengthEl = document.getElementById("bp-stat-length");
  if (lengthEl) lengthEl.textContent = s.started ? new Date(_circlepadDeadline * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not started";

  const btn = document.getElementById("bp-contribute-btn");
  const row = document.getElementById("bp-contribute-row");
  const balanceRow = document.getElementById("bp-balance-row");
  const balanceVal = document.getElementById("bp-wallet-balance");
  if (btn && row) {
    if (s.isOpen) {
      row.style.display = "flex";
      btn.disabled = false;
      btn.textContent = "Contribute USDC";
      if (accountUnknown) {
        // leave the balance row exactly as it was — real fetch fills it in
      } else if (state.account && balanceRow && balanceVal) {
        balanceVal.textContent = fmtEth(s.myWalletBalance ?? 0n) + " USDC";
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

  updateCirclepadCountdown();
  if (accountUnknown) return;

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
      if (!refundBtn.dataset.busy) refundBtn.textContent = `Withdraw my ${fmtEth(s.myContribution)} USDC`;
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
      if (!withdrawBtn.dataset.busy) withdrawBtn.textContent = `Withdraw ${fmtEth(s.balance)} USDC — split 80/5/15`;
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
      if (mineStat) mineStat.textContent = "0 USDC";
      if (shareStat) shareStat.textContent = "0%";
    } else {
      if (positionEl) { positionEl.className = ""; positionEl.innerHTML = `You've contributed <strong>${fmtEth(mine)} USDC</strong> — <strong>${pct}%</strong> of the raise so far.`; }
      if (sideEl) sideEl.innerHTML = `Your contribution: <strong>${fmtEth(mine)} USDC</strong> (${pct}%)`;
      if (mineStat) mineStat.textContent = fmtEth(mine) + " USDC";
      if (shareStat) shareStat.textContent = pct + "%";
    }
  }
}

async function refreshCirclepadCore() {
  applyCirclepadState(await fetchCirclepadState());
}

function updateCirclepadCountdown() {
  const el = document.getElementById("bp-round-countdown");
  if (!el) return;
  if (!_circlepadStarted || _circlepadDeadline === null) { el.innerHTML = ""; return; }
  const remaining = _circlepadDeadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) { el.innerHTML = "Raise ended"; return; }
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  el.innerHTML = `Ends in <strong>${d}d ${h}h ${m}m ${s}s</strong>`;
}

async function initCirclepadRound() {
  if (!circlepadEscrowConfigured()) {
    // No escrow wired in: the markup's neutral "Loading…" defaults would
    // otherwise sit there forever. Paint the honest pre-deploy state.
    document.querySelectorAll(".bp-featured-badge").forEach((el) => { el.textContent = "PREVIEW"; el.classList.remove("bp-live"); });
    const st = document.getElementById("bp-round-status");
    if (st) st.innerHTML = `<span class="bp-status-dot amber"></span>Preview — no round open`;
    const cb = document.getElementById("bp-contribute-btn");
    if (cb) { cb.disabled = true; cb.textContent = "Contribute USDC — not open"; }
    const ft = document.getElementById("bp-side-foot-text");
    if (ft) ft.textContent = "Not live yet — the fund-pooling contract is in design and review.";
    return;
  }

  // Paint from the last visit's cache first — synchronous, no RPC — so a
  // returning visitor sees the live round and leaderboard immediately
  // instead of a "PREVIEW"/"Loading…" flash. isOpen is recomputed against
  // the clock rather than trusted from the cache, since the deadline may
  // have passed since it was saved. The real fetch below overwrites all
  // of this as soon as it lands.
  const cachedState = circlepadLoadCache("state");
  if (cachedState && typeof cachedState.started === "boolean") {
    const now = Math.floor(Date.now() / 1000);
    const capReached = cachedState.cap > 0n && cachedState.totalRaised >= cachedState.cap;
    const isOpen = cachedState.started && now < Number(cachedState.deadline) && !capReached;
    const painted = { ...cachedState, isOpen, myContribution: 0n, myWalletBalance: null };
    applyCirclepadState(painted, { accountUnknown: true });
    // Also seed the in-memory snapshot fetchCirclepadState() falls back to on
    // a failed read — otherwise the first real fetch of the session has
    // no "previous" to recover to, and a single flaky started()/isOpen()
    // call would default to false and flip an actually-live round back
    // to READY right after the correct cached value was just shown.
    _circlepadState = painted;
  }
  const cachedLb = circlepadLoadCache("leaderboard");
  if (cachedLb && Array.isArray(cachedLb.rows) && Array.isArray(cachedLb.activity)) {
    renderCirclepadLeaderboard(cachedLb.rows, cachedLb.activity);
    _circlepadLeaderboardLoadedOnce = true; // don't replace this with "Loading…" or an error
  }

  // One-time diagnostic: if Multicall3 isn't actually deployed on this
  // chain, every "batched" read below silently falls back to one request
  // per call (see multicallRead in app.js) — same correctness, much
  // slower. Logged once so a slow-loading report can be told apart from
  // "Multicall3 isn't there" vs. "something else is wrong."
  const t0 = performance.now();
  isMulticallAvailable().then((ok) => {
    console.log(`CirclePad: Multicall3 ${ok ? "available" : "NOT available — falling back to one request per call"} (checked in ${Math.round(performance.now() - t0)}ms)`);
  });

  const lengthLabel = document.getElementById("bp-stat-length-label");
  if (lengthLabel) lengthLabel.textContent = "Ends";
  const payoutLabel = document.getElementById("bp-stat-payout-label");
  if (payoutLabel) payoutLabel.textContent = "Payout wallet";

  // This contract only escrows USDC — it does not enforce the vote/lead/
  // vesting mechanism the rest of this page documents, so the copy that
  // assumed that mechanism was live needs to say so plainly instead.
  const desc = document.getElementById("bp-featured-desc");
  if (desc) desc.textContent = "This round is contribution-only on-chain: USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap is not enforced by this contract — see Docs > Safety design.";
  const govNote = document.getElementById("bp-gov-note");
  if (govNote) govNote.textContent = "Not enforced on-chain in this round — see Docs > Safety design for why.";
  const govPanelNote = document.getElementById("bp-gov-panel-note");
  if (govPanelNote) govPanelNote.textContent = "This round's contract only handles contributions. Voting on name, ticker, logo, roadmap, and launch date is not enforced by smart contract here — how that gets decided will be announced separately.";

  try {
    const escrow = circlepadEscrowRead();
    const [recipient, platformWallet, treasuryWallet] = await Promise.all([
      escrow.recipient(), escrow.platformWallet(), escrow.treasuryWallet(),
    ]);
    const payoutEl = document.getElementById("bp-stat-payout");
    // A zero recipient (or a failed read) would print "0x0000…0000", which
    // reads like a bug — say what it means instead.
    if (payoutEl) payoutEl.innerHTML = recipient && recipient !== ethers.ZeroAddress
      ? `<a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">${short(recipient)}</a>`
      : "Set when the round starts";

    const nextTitle = document.getElementById("bp-nextcard-title");
    const nextBody = document.getElementById("bp-nextcard-body");
    if (nextTitle) nextTitle.textContent = "How this round actually closes";
    if (nextBody) {
      nextBody.innerHTML = `Once the recipient starts the clock, the raise runs for 72 hours. Contributors can withdraw their own USDC any time before it closes, no lock-in. When it closes, the balance splits automatically: 80% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${recipient}" target="_blank" rel="noopener">recipient wallet</a>, 5% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${platformWallet}" target="_blank" rel="noopener">platform wallet</a>, and 15% to the <a href="${CONFIG.BLOCK_EXPLORER}/address/${treasuryWallet}" target="_blank" rel="noopener">treasury wallet</a>. The bigger vote/lead/vesting mechanism described above this card is a separate contract, still in design and review.`;
    }
  } catch (err) {
    console.error("CirclePad: failed to load recipient/platform/treasury", err);
  }

  // Independent of each other — no reason to wait for one before starting
  // the other, and the leaderboard's first-ever fetch (binary-searching
  // for the round's starting block, see blockAtOrAfter in app.js) is the
  // slower of the two on a fresh browser with nothing cached yet.
  await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
  wireCirclepadContribute();
  wireCirclepadWithdraw();
  wireCirclepadStart();
  wireCirclepadRefund();

  if (_circlepadCountdownTimer) clearInterval(_circlepadCountdownTimer);
  _circlepadCountdownTimer = setInterval(updateCirclepadCountdown, 1000);

  // Light polling for totals/leaderboard so other people's contributions
  // show up without a page reload. A contribution made from THIS tab
  // already triggers its own immediate refresh (see wireCirclepadContribute).
  if (_circlepadPollTimer) clearInterval(_circlepadPollTimer);
  _circlepadPollTimer = setInterval(() => {
    refreshCirclepadCore();
    refreshCirclepadLeaderboard();
  }, 15000);
}

// Full Leaderboard panel AND the Home teaser both use this — adds a
// deposited/withdrawn breakdown line, but only for addresses that have
// actually withdrawn something. Someone who only ever contributed sees
// a plain row — "deposited: X, withdrew: 0" would just repeat the net.
function circlepadLbRowDetailedHtml(r, i, pctFn) {
  const flows = r.withdrawnTotal > 0n
    ? `<div class="bp-lb-flows">↓ ${fmtEth(r.depositedTotal)} USDC in · ↑ ${fmtEth(r.withdrawnTotal)} USDC out</div>`
    : "";
  return `<div class="bp-lb-row bp-lb-row-detailed">
    <span class="bp-lb-rank">#${i + 1}</span>
    <div class="bp-lb-addr-block">
      <span class="bp-lb-addr">${short(r.address)}</span>
      ${flows}
    </div>
    <span class="bp-lb-amount">${fmtEth(r.amount)} USDC</span>
    <span class="bp-lb-pct">${pctFn(r.amount)}%</span>
    <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${r.address}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
  </div>`;
}

let _circlepadLeaderboardLoadedOnce = false;
let _circlepadLbBusy = false;
let _circlepadLog = null;

// Contributed/Refunded events scanned so far, kept in memory and in
// localStorage (keyed by escrow address) so every refresh — and every
// return visit — only reads the blocks added since the last scan.
// Amounts are stored as strings since JSON can't carry BigInt.
function circlepadLogCache() {
  if (_circlepadLog) return _circlepadLog;
  let c = null;
  try { c = JSON.parse(localStorage.getItem(circlepadCacheKey("logs.v1")) || "null"); } catch { /* storage blocked */ }
  _circlepadLog = (c && Array.isArray(c.contributed) && Array.isArray(c.refunded))
    ? c : { from: null, scannedTo: null, endBlock: null, contributed: [], refunded: [] };
  return _circlepadLog;
}
function circlepadSaveLogCache(log) {
  try { localStorage.setItem(circlepadCacheKey("logs.v1"), JSON.stringify(log)); } catch { /* quota — memory copy still works */ }
}

function showCirclepadLeaderboardText(text) {
  const homeEl = document.getElementById("bp-home-leaderboard");
  if (homeEl) { homeEl.className = "bp-empty"; homeEl.textContent = text; }
  const fullEl = document.getElementById("bp-full-leaderboard");
  if (fullEl) fullEl.textContent = text;
}

async function refreshCirclepadLeaderboard() {
  if (!circlepadEscrowConfigured()) return;
  if (_circlepadLbBusy) return; // a long first scan must not overlap the next 15s poll
  _circlepadLbBusy = true;
  try { await refreshCirclepadLeaderboardInner(); } finally { _circlepadLbBusy = false; }
}

async function refreshCirclepadLeaderboardInner() {
  const escrow = circlepadEscrowRead();
  if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Loading…");

  // The server aggregates the round's events once for everyone
  // (/api/social?circle=lb); the in-browser scan below is only the fallback.
  try {
    const r = await fetch("/api/social?circle=lb", { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    if (j && Array.isArray(j.rows) && Array.isArray(j.activity) && (j.complete || j.rows.length || !j.started)) {
      const B = (v) => BigInt(v || 0);
      const rows = j.rows.map((x) => ({ address: ethers.getAddress(x.address), amount: B(x.amount), depositedTotal: B(x.depositedTotal), withdrawnTotal: B(x.withdrawnTotal) }));
      const activity = j.activity.map((a) => ({ contributor: ethers.getAddress(a.contributor), amount: B(a.amount), kind: a.kind, ts: a.ts }));
      _circlepadLeaderboardLoadedOnce = true;
      renderCirclepadLeaderboard(rows, activity);
      circlepadSaveCache("leaderboard", { rows, activity, savedAt: Date.now() });
      return;
    }
  } catch (err) { console.warn("CirclePad: server leaderboard unavailable, scanning in the browser", err); }

  // contribute() and refund() only succeed while the raise is open —
  // between start() and the deadline — so that window is the only place
  // these events can exist: nothing to scan before start(), nothing after
  // the deadline. Arc's RPC rejects eth_getLogs over ~10k blocks, so the
  // window is read in chunks (queryFilterChunked in arc-shared.js).
  let started, deadline, duration;
  try {
    [started, deadline, duration] = await Promise.all([
      withRetry(() => escrow.started()), withRetry(() => escrow.deadline()), withRetry(() => escrow.FUNDING_DURATION()),
    ]);
  } catch (err) {
    console.error("CirclePad: failed to read round state for the leaderboard", err);
    if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Couldn't load the leaderboard — retrying shortly.");
    return;
  }
  if (!started) {
    _circlepadLeaderboardLoadedOnce = true;
    renderCirclepadLeaderboard([], []);
    return;
  }

  const log = circlepadLogCache();
  try {
    if (log.from == null) {
      // blockAtOrAfter returns a block at or just BEFORE the target time,
      // so starting there can never skip the start() block itself.
      log.from = await blockAtOrAfter(new Date(Number(deadline - duration) * 1000).toISOString(), "circlepad-start");
      log.scannedTo = log.from - 1;
    }
    const latest = await withRetry(() => readProvider().getBlockNumber());
    let to = latest;
    if (Math.floor(Date.now() / 1000) > Number(deadline) + 60) {
      // Raise is over: cap the window at the deadline so a visit weeks later
      // doesn't scan weeks of empty blocks. blockAtOrAfter's answer is within
      // 2,048 blocks before the deadline, so +2,100 always covers it.
      if (log.endBlock == null) {
        log.endBlock = (await blockAtOrAfter(new Date(Number(deadline) * 1000).toISOString(), "circlepad-end")) + 2100;
      }
      to = Math.min(latest, log.endBlock);
    }
    if (to > log.scannedTo) {
      const plain = (e) => ({ contributor: e.args.contributor, amount: e.args.amount.toString(), blockNumber: e.blockNumber, index: e.index ?? 0 });
      // Checkpoint after every chunk (they complete in block order), so a
      // rate-limit failure halfway through resumes from there next poll.
      await queryFilterChunked(escrow, "*", log.scannedTo + 1, to, {
        onChunk: (found, [, chunkTo], done, total) => {
          for (const e of found) {
            if (e.eventName === "Contributed") log.contributed.push(plain(e));
            else if (e.eventName === "Refunded") log.refunded.push(plain(e));
          }
          log.scannedTo = chunkTo;
          if (done === total || done % 5 === 0) circlepadSaveLogCache(log);
          if (!_circlepadLeaderboardLoadedOnce && total > 3) showCirclepadLeaderboardText(`Loading contributions… ${Math.round((done / total) * 100)}%`);
        },
      });
    }
  } catch (err) {
    circlepadSaveLogCache(log); // keep whatever chunks did complete
    console.error("CirclePad: failed to load Contributed/Refunded events", err);
    // A poll that fails after an earlier success leaves the last good data up.
    if (!_circlepadLeaderboardLoadedOnce) showCirclepadLeaderboardText("Couldn't load the leaderboard — retrying shortly.");
    return;
  }
  _circlepadLeaderboardLoadedOnce = true;

  const events = log.contributed.map((e) => ({ ...e, amount: BigInt(e.amount) }));
  const refundEvents = log.refunded.map((e) => ({ ...e, amount: BigInt(e.amount) }));

  // Per-address totals read straight from the contract (authoritative)
  // rather than summed from events, so this can never double-count and
  // automatically reflects any refunds already paid out. Batched through
  // Multicall3 — one round trip instead of one eth_call per contributor.
  const uniqueAddrs = [...new Set(events.map((e) => e.contributor))];
  const amounts = uniqueAddrs.length > 0
    ? await multicallRead(uniqueAddrs.map((a) => ({ contract: escrow, method: "contributions", args: [a] })))
    : [];

  // Deposited/withdrawn totals ARE summed from the events themselves —
  // there's no single contract getter for "lifetime total in" or "lifetime
  // total out" (only the current net contributions() balance), so this is
  // the one place events are the right source, purely for display.
  const inByAddr = new Map(), outByAddr = new Map();
  for (const e of events) inByAddr.set(e.contributor, (inByAddr.get(e.contributor) ?? 0n) + e.amount);
  for (const e of refundEvents) outByAddr.set(e.contributor, (outByAddr.get(e.contributor) ?? 0n) + e.amount);

  const rows = uniqueAddrs
    .map((address, i) => ({ address, amount: amounts[i] ?? 0n, depositedTotal: inByAddr.get(address) ?? 0n, withdrawnTotal: outByAddr.get(address) ?? 0n }))
    .filter((r) => r.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  // Recent activity merges contributions (+) and refunds (−) in one feed,
  // newest first, so it's an honest picture of money moving both ways —
  // not just inflows. Block timestamps are resolved here (once, cached per
  // block) so the rendered list — and its cached copy — carries plain
  // unix seconds rather than needing another RPC to display "3m ago".
  const merged = [
    ...events.map((e) => ({ e, kind: "in" })),
    ...refundEvents.map((e) => ({ e, kind: "out" })),
  ].sort((a, b) => (a.e.blockNumber - b.e.blockNumber) || ((a.e.index || 0) - (b.e.index || 0)));
  const recent = merged.slice(-15).reverse();
  const blockNumbers = [...new Set(recent.map((item) => item.e.blockNumber))];
  const blocks = blockNumbers.length > 0 ? await Promise.all(blockNumbers.map((n) => readProvider().getBlock(n))) : [];
  const blockTime = new Map(blockNumbers.map((n, i) => [n, Number(blocks[i]?.timestamp ?? 0)]));
  const activity = recent.map(({ e, kind }) => ({
    contributor: e.contributor, amount: e.amount, kind, ts: blockTime.get(e.blockNumber) || 0,
  }));

  renderCirclepadLeaderboard(rows, activity);
  circlepadSaveCache("leaderboard", { rows, activity, savedAt: Date.now() });
}

// Pure DOM render — called with fresh data from the chain, and on load with
// whatever the last visit cached, so the leaderboard is on screen instantly
// instead of after the block search + log queries finish.
function renderCirclepadLeaderboard(rows, activity) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0n);
  const pctOf = (amount) => (total > 0n ? (Number((amount * 10000n) / total) / 100).toFixed(2) : "0.00");

  const homeEl = document.getElementById("bp-home-leaderboard");
  if (homeEl) {
    if (rows.length === 0) {
      homeEl.className = "bp-empty";
      homeEl.textContent = "No contributors yet. The leaderboard fills in once a raise opens.";
    } else {
      homeEl.className = "bp-lb-mini";
      homeEl.innerHTML = rows.slice(0, 3).map((r, i) => circlepadLbRowDetailedHtml(r, i, pctOf)).join("")
        + (rows.length > 3 ? `<div class="bp-lb-more">+${rows.length - 3} more</div>` : "");
    }
  }

  const fullEl = document.getElementById("bp-full-leaderboard");
  if (fullEl) {
    fullEl.innerHTML = rows.length === 0
      ? "No contributors yet. The leaderboard fills in once a raise opens."
      : rows.map((r, i) => circlepadLbRowDetailedHtml(r, i, pctOf)).join("");
  }

  const activityEl = document.getElementById("bp-recent-activity");
  if (activityEl) {
    activityEl.innerHTML = activity.length === 0 ? "" : `<h4>Recent activity</h4>` + activity.map((a) => `
        <div class="bp-activity-item${a.kind === "out" ? " bp-activity-out" : ""}">
          <span class="bp-activity-addr">${short(a.contributor)}</span>
          <span class="bp-activity-amount">${a.kind === "out" ? "−" : "+"}${fmtEth(a.amount)} USDC</span>
          <span class="bp-activity-time">${timeAgo(a.ts)}</span>
          <a class="bp-lb-ext" href="${CONFIG.BLOCK_EXPLORER}/address/${a.contributor}" target="_blank" rel="noopener" title="View on explorer"><svg><use href="#i-ext" xlink:href="#i-ext"/></svg></a>
        </div>`).join("");
  }

  const contributorsEl = document.getElementById("bp-stat-contributors");
  if (contributorsEl) contributorsEl.textContent = rows.length > 0 ? String(rows.length) : "—";
  const leadEl = document.getElementById("bp-stat-lead");
  if (leadEl) leadEl.textContent = rows.length > 0 ? short(rows[0].address) : "—";
}

// Called by arc-shared.js's connectWallet/restoreBasicWallet/
// attachBasicWalletListeners on every account change (connect / disconnect
// / switch) — see arc-shared.js's `typeof refreshAccountDependentViews ===
// "function"` guards. No-op if the round isn't configured yet.
function refreshCirclepadMyPosition() {
  if (!circlepadEscrowConfigured()) return;
  refreshCirclepadCore();
}

// This page's own version of app.js's global refreshAccountDependentViews()
// — arc-shared.js is a shared library across ARCPAD and CIRCLEPAD, so it
// doesn't know which page-specific refresh functions exist; each page
// defines its own top-level refreshAccountDependentViews() instead.
function refreshAccountDependentViews() {
  refreshCirclepadMyPosition();
  if (typeof refreshCirclepadGovernance === "function") refreshCirclepadGovernance();
}

function wireCirclepadStart() {
  const btn = document.getElementById("bp-start-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!(await cpConfirm({ title: "Start the 72-hour raise?", body: "The funding window opens right now and closes 72 hours later. This can't be undone or redone.", ok: "Start the raise" }))) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const tx = await escrow.start();
      btn.textContent = "Confirming…";
      await tx.wait();
      await refreshCirclepadCore();
    } catch (err) {
      console.error("CirclePad: start failed", err);
      cpToast(cpErrText(err, "Start failed or was rejected."), "bad");
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadRefund() {
  const btn = document.getElementById("bp-refund-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  // Partial withdrawals: the contract's refund(amount) takes any amount up to
  // what this wallet put in; leaving the box empty withdraws all of it.
  const amt = document.createElement("div");
  amt.className = "bp-contribute-row cp-refund-amt";
  amt.innerHTML = `<input type="number" min="0" step="0.01" class="bp-contribute-input" id="bp-refund-amount" placeholder="Amount (empty = all)"><button type="button" class="bp-btn-ghost bp-contribute-max" id="bp-refund-all">Max</button>`;
  btn.parentNode.insertBefore(amt, btn);
  const refIn = amt.querySelector("#bp-refund-amount");
  amt.querySelector("#bp-refund-all").addEventListener("click", () => { refIn.value = ""; refIn.focus(); });
  btn.addEventListener("click", async () => {
    let want = null;
    if (refIn.value.trim()) {
      try { want = ethers.parseEther(refIn.value.trim()); } catch { cpToast("That doesn't look like a valid USDC amount.", "bad"); return; }
      if (want <= 0n) { cpToast(CP_ERRORS.ZeroRefundAmount, "bad"); return; }
    }
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const mine = await escrow.contributions(state.account);
      if (want !== null && want > mine) throw Object.assign(new Error("InsufficientContribution"), { revert: { name: "InsufficientContribution" } });
      const tx = await escrow.refund(want === null ? mine : want);
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      refIn.value = "";
      cpToast("Withdrawn to your wallet.", "ok");
      await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
    } catch (err) {
      console.error("CirclePad: refund failed", err);
      cpToast(cpErrText(err, "Withdraw failed or was rejected."), "bad");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadWithdraw() {
  const btn = document.getElementById("bp-withdraw-btn");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  btn.addEventListener("click", async () => {
    if (!(await cpConfirm({ title: "Split the raise now?", body: "The full balance goes out in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet.", ok: "Split 80 / 15 / 5" }))) return;
    btn.disabled = true;
    btn.dataset.busy = "1";
    const original = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      const tx = await escrow.withdraw();
      btn.textContent = "Confirming…";
      await tx.wait();
      delete btn.dataset.busy;
      await refreshCirclepadCore();
    } catch (err) {
      console.error("CirclePad: withdraw failed", err);
      cpToast(cpErrText(err, "Withdraw failed or was rejected."), "bad");
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

function wireCirclepadContribute() {
  const btn = document.getElementById("bp-contribute-btn");
  const input = document.getElementById("bp-contribute-amount");
  const maxBtn = document.getElementById("bp-contribute-max");
  if (!btn || !input || !maxBtn || btn.dataset.wired) return;
  btn.dataset.wired = "1";

  maxBtn.addEventListener("click", async () => {
    try {
      // "Max" is what this wallet can spend (less a little for gas), capped by
      // what's left of the round's cap. An uncapped round reports "unlimited"
      // room, so without a wallet there is no max to show — connect first.
      if (!state.account) {
        if (typeof connectWallet === "function") await connectWallet();
        if (!state.account) return;
      }
      const escrow = circlepadEscrowRead();
      let amount = await escrow.remainingCap();
      const balance = await readProvider().getBalance(state.account);
      const gasBuffer = ethers.parseEther("0.05"); // leave headroom for gas (paid in USDC on Arc)
      const spendable = balance > gasBuffer ? balance - gasBuffer : 0n;
      if (spendable < amount) amount = spendable;
      // two decimals is plenty for a USDC amount
      input.value = amount > 0n ? String(Math.floor(Number(ethers.formatEther(amount)) * 100) / 100) : "0";
    } catch (err) {
      console.error("CirclePad: failed to compute max contribution", err);
    }
  });

  btn.addEventListener("click", async () => {
    if (!state.account) {
      if (typeof connectWallet === "function") await connectWallet();
      if (!state.account) return;
    }
    const amountStr = input.value;
    if (!amountStr || Number(amountStr) <= 0) { cpToast("Enter a USDC amount to contribute.", "bad"); input.focus(); return; }

    let amount;
    try { amount = ethers.parseEther(amountStr); }
    catch { cpToast("That doesn't look like a valid USDC amount.", "bad"); return; }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Confirm in wallet…";
    try {
      await ensureArcForWrite();
      const escrow = circlepadEscrowWrite();
      // Referral links (?ref=0x…) append the referrer's address after the
      // contribute() selector. The contract ignores the extra bytes; the site
      // reads them back from the transaction to credit the referrer.
      const ref = typeof circlepadReferrer === "function" ? circlepadReferrer() : null;
      const tx = ref
        ? await state.signer.sendTransaction({ to: CONFIG.CIRCLEPAD_ESCROW_ADDRESS, value: amount, data: escrow.interface.encodeFunctionData("contribute") + ref.slice(2).toLowerCase() })
        : await escrow.contribute({ value: amount });
      btn.textContent = "Confirming…";
      await tx.wait();
      input.value = "";
      cpToast("Contribution confirmed.", "ok");
      if (ref) { try { fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cref", tx: tx.hash }), keepalive: true }).catch(() => {}); } catch { /* best effort */ } }
      await Promise.all([refreshCirclepadCore(), refreshCirclepadLeaderboard()]);
    } catch (err) {
      console.error("CirclePad: contribution failed", err);
      cpToast(cpErrText(err, "Transaction failed or was rejected."), "bad");
      btn.disabled = false;
      btn.textContent = originalText;
      refreshCirclepadCore(); // re-applies the correct disabled/label state
    }
  });
}

// NOTE: initCirclepadRound() / initCirclepadGovernance() are called at the very
// bottom of this file, after every const/let they depend on has been
// declared. Calling them from up here — before CIRCLEPAD_VOTE_CATEGORIES,
// _circlepadGovLoadedOnce etc. exist — throws a ReferenceError (temporal
// dead zone) synchronously, before any try/catch, and left the Governance
// tab stuck on its static "Loading…" text with the failure only visible
// in the console.

// ---- Governance / voting (contracts/CirclePadVote.sol) ----
// Entirely separate from the escrow above — reads weight live from it
// but holds no funds and isn't part of that contract. No-op (fallback
// copy in the HTML stays as-is) until CONFIG.CIRCLEPAD_VOTE_ADDRESS is
// filled in after deploy.

const CIRCLEPAD_VOTE_CATEGORIES = [
  { id: 0, label: "Coin name" },
  { id: 1, label: "Ticker" },
  { id: 2, label: "Logo" },
  { id: 3, label: "Roadmap" },
  { id: 4, label: "Launch date" },
];

let _circlepadGovPollTimer = null;

function circlepadVoteConfigured() {
  return typeof CONFIG !== "undefined" && !!CONFIG.CIRCLEPAD_VOTE_ADDRESS && CONFIG.CIRCLEPAD_VOTE_ADDRESS.length === 42;
}
function circlepadVoteRead() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_VOTE_ADDRESS, CIRCLEPAD_VOTE_ABI, readProvider());
}
function circlepadVoteWrite() {
  return new ethers.Contract(CONFIG.CIRCLEPAD_VOTE_ADDRESS, CIRCLEPAD_VOTE_ABI, state.signer);
}

async function initCirclepadGovernance() {
  if (!circlepadVoteConfigured()) return; // fallback copy in the HTML stays put
  const fallback = document.getElementById("bp-gov-fallback");
  const live = document.getElementById("bp-gov-live");
  if (fallback) fallback.style.display = "none";
  if (live) live.style.display = "block";

  // The escrow-only copy elsewhere on the page assumed voting wasn't
  // enforced anywhere on-chain — now that it is (via this separate
  // contract), say so instead of leaving the older disclaimer standing.
  const govNote = document.getElementById("bp-gov-note");
  if (govNote) govNote.textContent = "Voting is live — cast yours →";
  const desc = document.getElementById("bp-featured-desc");
  if (desc) desc.textContent = "This round is contribution-only on-chain: USDC sits in an escrow contract and you can withdraw your own contribution any time before the 72-hour window closes. Voting on name, ticker, logo, and roadmap runs in a separate contract — see the Governance tab.";

  paintCirclepadGovernanceFromCache(); // instant on a return visit; real fetch overwrites it below
  await refreshCirclepadGovernance();
  if (_circlepadGovPollTimer) clearInterval(_circlepadGovPollTimer);
  _circlepadGovPollTimer = setInterval(refreshCirclepadGovernance, 15000);
}

// Three small batched rounds rather than one call per category/option:
// round 1 finds which categories have options published, round 2 fetches
// those categories' option lists (now that their lengths are known),
// round 3 fetches every option's weight plus the caller's own vote per
// category — all through multicallRead (see app.js), same pattern as
// the round/leaderboard fetches above.
async function fetchCirclepadGovernanceState() {
  const vote = circlepadVoteRead();

  const round1 = [
    { contract: vote, method: "votingOpen" },
    { contract: vote, method: "votingEnds" },
    { contract: vote, method: "recipient" },
    ...CIRCLEPAD_VOTE_CATEGORIES.map((c) => ({ contract: vote, method: "optionsSet", args: [c.id] })),
  ];
  const r1 = await multicallRead(round1);
  const votingOpen = !!r1[0];
  const votingEnds = r1[1] ?? 0n;
  const recipient = r1[2] || ethers.ZeroAddress;
  const setFlags = CIRCLEPAD_VOTE_CATEGORIES.map((_c, i) => !!r1[3 + i]);
  const setCats = CIRCLEPAD_VOTE_CATEGORIES.filter((_c, i) => setFlags[i]);

  const round2 = setCats.map((c) => ({ contract: vote, method: "options", args: [c.id] }));
  const r2 = setCats.length > 0 ? await multicallRead(round2) : [];
  const optionsByCategory = new Map(setCats.map((c, i) => [c.id, r2[i] || []]));

  const round3 = [];
  const round3Meta = [];
  for (const c of setCats) {
    const opts = optionsByCategory.get(c.id) || [];
    for (let j = 0; j < opts.length; j++) {
      round3.push({ contract: vote, method: "optionWeight", args: [c.id, j] });
      round3Meta.push({ type: "weight", category: c.id, option: j });
    }
    if (state.account) {
      round3.push({ contract: vote, method: "myVote", args: [c.id, state.account] });
      round3Meta.push({ type: "myVote", category: c.id });
    }
  }
  const r3 = round3.length > 0 ? await multicallRead(round3) : [];

  const weightsByCategory = new Map();
  const myVoteByCategory = new Map();
  round3Meta.forEach((meta, i) => {
    if (meta.type === "weight") {
      if (!weightsByCategory.has(meta.category)) weightsByCategory.set(meta.category, []);
      weightsByCategory.get(meta.category)[meta.option] = r3[i] ?? 0n;
    } else {
      myVoteByCategory.set(meta.category, r3[i]);
    }
  });

  const categories = CIRCLEPAD_VOTE_CATEGORIES.map((c, i) => {
    const opts = optionsByCategory.get(c.id) || [];
    const weights = weightsByCategory.get(c.id) || [];
    const myVote = myVoteByCategory.get(c.id);
    return {
      id: c.id,
      label: c.label,
      set: setFlags[i],
      options: opts.map((text, j) => ({ text, weight: weights[j] ?? 0n })),
      myVoteIndex: myVote && myVote[0] ? Number(myVote[1]) : null,
    };
  });

  return { votingOpen, votingEnds, recipient, categories };
}

function renderCirclepadGovernance(g) {
  const statusEl = document.getElementById("bp-gov-live-status");
  if (statusEl) {
    const now = Math.floor(Date.now() / 1000);
    if (g.votingOpen) {
      const hoursLeft = Math.max(0, Math.ceil((Number(g.votingEnds) - now) / 3600));
      statusEl.textContent = `Voting is open — closes in about ${hoursLeft}h.`;
    } else if (Number(g.votingEnds) > 0 && now >= Number(g.votingEnds)) {
      statusEl.textContent = "Voting has closed.";
    } else {
      statusEl.textContent = "Voting opens once the raise closes.";
    }
  }

  const wrap = document.getElementById("bp-gov-categories");
  if (!wrap) return;

  const isRecipient = !!(state.account && g.recipient && state.account.toLowerCase() === g.recipient.toLowerCase());
  const canPropose = isRecipient && Number(g.votingEnds) > Math.floor(Date.now() / 1000);

  wrap.innerHTML = g.categories.map((c) => {
    if (!c.set) {
      const proposeHtml = canPropose ? `
        <div class="bp-gov-propose">
          <input type="text" class="bp-gov-propose-input" data-category="${c.id}" placeholder="Comma-separated options, e.g. Option A, Option B, Option C">
          <button type="button" class="bp-gov-propose-btn" data-category="${c.id}">Publish options</button>
          <span class="bp-gov-propose-hint">Only you (the recipient wallet) can see this — enter at least 2 options, separated by commas.</span>
        </div>` : "";
      return `<div class="bp-gov-cat"><div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${c.label}</span></div><div class="bp-empty">Options not published yet.</div>${proposeHtml}</div>`;
    }
    const total = c.options.reduce((sum, o) => sum + o.weight, 0n);
    const pctOf = (w) => (total > 0n ? (Number((w * 10000n) / total) / 100).toFixed(1) : "0.0");
    const optionsHtml = c.options.map((o, i) => {
      const pct = pctOf(o.weight);
      const mine = c.myVoteIndex === i;
      const label = mine ? "Voted" : c.myVoteIndex !== null ? "Change vote" : "Vote";
      return `
        <div class="bp-gov-option${mine ? " bp-gov-option-mine" : ""}">
          <div class="bp-gov-option-row">
            <span class="bp-gov-option-text">${o.text}${mine ? '<span class="bp-gov-mine-tag">your vote</span>' : ""}</span>
            <span class="bp-gov-option-pct">${pct}%</span>
          </div>
          <div class="bp-gov-option-bar"><div class="bp-gov-option-fill" style="width:${pct}%"></div></div>
          <button type="button" class="bp-gov-vote-btn" data-category="${c.id}" data-option="${i}" ${mine || !g.votingOpen ? "disabled" : ""}>${label}</button>
        </div>`;
    }).join("");
    return `<div class="bp-gov-cat"><div class="bp-gov-cat-head"><span class="bp-gov-cat-title">${c.label}</span></div><div class="bp-gov-options">${optionsHtml}</div></div>`;
  }).join("");

  wrap.querySelectorAll(".bp-gov-vote-btn").forEach((btn) => {
    btn.addEventListener("click", () => castCirclepadVote(Number(btn.dataset.category), Number(btn.dataset.option)));
  });
  wrap.querySelectorAll(".bp-gov-propose-btn").forEach((btn) => {
    btn.addEventListener("click", () => proposeCirclepadOptions(Number(btn.dataset.category)));
  });
}

let _circlepadGovLoadedOnce = false;

async function refreshCirclepadGovernance() {
  if (!circlepadVoteConfigured()) return;
  const statusEl = document.getElementById("bp-gov-live-status");
  if (!_circlepadGovLoadedOnce && statusEl) statusEl.textContent = "Loading…";

  let g = null;
  for (let attempt = 0; attempt < 3 && !g; attempt++) {
    try {
      // A hung RPC call (rather than an outright error) would otherwise
      // leave this on "Loading…" forever with no console trace at all —
      // races it against a timeout so a stall surfaces the same as any
      // other failure, and always logs what actually went wrong.
      g = await Promise.race([
        fetchCirclepadGovernanceState(),
        new Promise((_res, rej) => setTimeout(() => rej(new Error("timed out after 10s")), 10000)),
      ]);
    } catch (err) {
      console.error(`CirclePad: failed to load governance data (attempt ${attempt + 1})`, err);
      if (attempt < 2) await new Promise((res) => setTimeout(res, 600));
    }
  }

  if (!g) {
    if (!_circlepadGovLoadedOnce && statusEl) statusEl.textContent = "Couldn't load governance data — retrying shortly. Check the browser console for details.";
    return;
  }
  _circlepadGovLoadedOnce = true;
  renderCirclepadGovernance(g);
  // Same stale-while-revalidate cache the round state and leaderboard use
  // (see circlepadSaveCache) — keyed by the vote contract's address so a
  // future vote contract starts clean. myVoteIndex is wallet-specific and
  // deliberately dropped: whoever loads next may be a different wallet.
  circlepadSaveCache("gov", {
    votingOpen: g.votingOpen,
    votingEnds: g.votingEnds,
    recipient: g.recipient,
    categories: g.categories.map((c) => ({ ...c, myVoteIndex: null })),
    savedAt: Date.now(),
  });
}

// Paints the Governance tab from the last visit's cache — synchronous, no
// RPC — so it's on screen immediately; refreshCirclepadGovernance() then
// overwrites it as soon as the real fetch lands.
function paintCirclepadGovernanceFromCache() {
  const cached = circlepadLoadCache("gov");
  if (!cached || !Array.isArray(cached.categories)) return false;
  const now = Math.floor(Date.now() / 1000);
  const votingEnds = cached.votingEnds ?? 0n;
  // Never trust a cached "open" past the cached close time.
  const votingOpen = !!cached.votingOpen && now < Number(votingEnds);
  renderCirclepadGovernance({ votingOpen, votingEnds, recipient: cached.recipient || ethers.ZeroAddress, categories: cached.categories });
  _circlepadGovLoadedOnce = true; // don't replace the cached paint with "Loading…"
  return true;
}

// Recipient-only: publishes the candidate options for one category, once.
// Reverts on-chain (OptionsAlreadySet) if called twice for the same
// category, or (TooFewOptions) with fewer than 2 entries — both surfaced
// to the recipient via the same err.reason/shortMessage alert pattern used
// everywhere else on this page.
async function proposeCirclepadOptions(category) {
  if (!state.account) {
    if (typeof connectWallet === "function") await connectWallet();
    if (!state.account) return;
  }
  const input = document.querySelector(`.bp-gov-propose-input[data-category="${category}"]`);
  const btn = document.querySelector(`.bp-gov-propose-btn[data-category="${category}"]`);
  if (!input) return;
  const options = input.value.split(",").map((s) => s.trim()).filter(Boolean);
  if (options.length < 2) { cpToast("Enter at least 2 options, separated by commas.", "bad"); return; }

  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Confirm in wallet…"; }
  input.disabled = true;
  try {
    await ensureArcForWrite();
    const vote = circlepadVoteWrite();
    const tx = await vote.proposeOptions(category, options);
    if (btn) btn.textContent = "Confirming…";
    await tx.wait();
    await refreshCirclepadGovernance();
  } catch (err) {
    console.error("CirclePad: proposeOptions failed", err);
    cpToast(cpErrText(err, "Publishing options failed or was rejected."), "bad");
    if (btn) { btn.disabled = false; btn.textContent = original; }
    input.disabled = false;
  }
}

async function castCirclepadVote(category, optionIndex) {
  if (!state.account) {
    if (typeof connectWallet === "function") await connectWallet();
    if (!state.account) return;
  }
  const btn = document.querySelector(`.bp-gov-vote-btn[data-category="${category}"][data-option="${optionIndex}"]`);
  const original = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Confirm in wallet…"; }
  try {
    await ensureArcForWrite();
    const vote = circlepadVoteWrite();
    const tx = await vote.vote(category, optionIndex);
    if (btn) btn.textContent = "Confirming…";
    await tx.wait();
    await refreshCirclepadGovernance();
  } catch (err) {
    console.error("CirclePad: vote failed", err);
    cpToast(cpErrText(err, "Vote failed or was rejected."), "bad");
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

// Boot — deliberately the last lines in the file, after every const/let
// above has been initialized (see the note near the middle of the file
// for why calling these any earlier breaks the Governance tab).
initCirclepadRound();
initCirclepadGovernance();

// ---- Round alerts: "alert me when it opens" + a calendar reminder for the close ----
// Browser-only: the alert fires while a CirclePad tab is open (the page
// already polls the escrow every 15s); nothing is sent to any server.
(() => {
  const countdown = document.getElementById("bp-round-countdown");
  if (!countdown || typeof applyCirclepadState !== "function") return;
  const KEY = "circlepad.notify.v1";
  const escrow = () => (typeof CONFIG !== "undefined" && CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "").toLowerCase();
  const armed = () => { try { return localStorage.getItem(KEY) === escrow(); } catch { return false; } };
  const arm = (on) => { try { if (on) localStorage.setItem(KEY, escrow()); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
  const box = document.createElement("div");
  box.className = "bp-notify";
  countdown.insertAdjacentElement("afterend", box);
  let last = null;
  function ping(title, body) {
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/images/favicon-32.png" }); } catch { /* not supported */ }
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch { /* fine */ } }
    const t = document.title; let n = 0;
    const iv = setInterval(() => { document.title = n++ % 2 ? t : `● ${title}`; if (n > 12) { clearInterval(iv); document.title = t; } }, 900);
  }
  function icsFor(deadline) {
    const d = (x) => new Date(x * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//CirclePad//EN", "BEGIN:VEVENT",
      `UID:circlepad-${escrow()}-${deadline}@arcircle.app`, `DTSTAMP:${d(Math.floor(Date.now() / 1000))}`,
      `DTSTART:${d(deadline - 3600)}`, `DTEND:${d(deadline)}`,
      "SUMMARY:CirclePad raise closes", "DESCRIPTION:The 72-hour CirclePad raise closes at the end of this event. https://www.arcircle.app/circle",
      "URL:https://www.arcircle.app/circle", "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:CirclePad raise closes soon", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "circlepad-raise-close.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function paint() {
    if (!last) return;
    if (!last.started) {
      box.innerHTML = armed()
        ? `<div class="bp-notify-on"><span class="bp-status-dot bp-live"></span>Alert set — keep a CirclePad tab open and this browser will ping you the moment the raise opens.</div><button type="button" class="bp-notify-link" data-notify="off">Cancel alert</button>`
        : `<button type="button" class="bp-btn-ghost bp-btn-block bp-notify-btn" data-notify="on">Alert me when the raise opens</button>`;
    } else if (last.isOpen) {
      if (armed()) { arm(false); ping("The CirclePad raise is open", "Contributions are live for 72 hours."); }
      box.innerHTML = `<button type="button" class="bp-notify-link" data-notify="ics">Add the close to my calendar</button>`;
    } else box.innerHTML = "";
  }
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-notify]");
    if (!b) return;
    const k = b.dataset.notify;
    if (k === "on") {
      arm(true);
      // Ask for OS notifications too, but don't wait on the prompt.
      try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch { /* fine */ }
    } else if (k === "off") arm(false);
    else if (k === "ics" && last && last.deadline) icsFor(Number(last.deadline));
    paint();
  });
  const orig = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) { orig(s, opts); if (s && !(opts && opts.accountUnknown && last)) { last = s; try { paint(); } catch (err) { console.warn(err); } } };
})();
