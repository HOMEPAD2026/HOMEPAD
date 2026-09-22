/* global ethers, CONFIG */
// arc-shared.js — the small set of chain-agnostic read helpers ARCPAD and
// CIRCLEPAD both need (readProvider, multicallRead, blockAtOrAfter), copied
// out of app.js rather than loading all of it. app.js's own `route()` call
// at the bottom of that file drives the main HOMEPAD (Robinhood Chain)
// launchpad UI unconditionally on load — wrong DOM, wrong config, wrong
// chain for these pages. These specific helpers were already
// config-driven/chain-agnostic in app.js (nothing Robinhood-specific in
// them), so they're reproduced here verbatim rather than reimplemented.

const state = {
  account: null,
  signer: null,
  provider: null, // read-only, always available
};

function readProvider() {
  if (!state.provider) {
    state.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  }
  return state.provider;
}

const TRANSIENT_RPC = /failed to fetch|timed out|timeout|429|rate limit|too many|coalesce|network error|ECONNRESET/i;
async function withRetry(fn, { tries = 3, delayMs = 900 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (!TRANSIENT_RPC.test(String(err && (err.shortMessage || err.message) || err))) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// Same technique as app.js's blockAtOrAfter: bounds every eth_getLogs to
// "since these contracts went live" instead of scanning from block 0,
// cached in localStorage per chain+namespace so the answer is computed once.
const _blockAtOrAfterPromises = new Map();
function blockAtOrAfter(isoTimestamp, namespace) {
  const memoKey = `${namespace}:${isoTimestamp}`;
  if (_blockAtOrAfterPromises.has(memoKey)) return _blockAtOrAfterPromises.get(memoKey);
  const p = (async () => {
    const target = Math.floor(Date.parse(isoTimestamp) / 1000);
    const cacheKey = `arcircle.firstBlock.${CONFIG.CHAIN_ID_DECIMAL}.${namespace}.${target}`;
    try { const c = localStorage.getItem(cacheKey); if (c) return Number(c); } catch { /* storage blocked */ }
    const provider = readProvider();
    const blockAt = (n) => withRetry(() => provider.getBlock(n));

    const latest = await blockAt("latest");
    if (Number(latest.timestamp) < target) return latest.number;
    const probeN = Math.max(0, latest.number - 500_000);
    const probe = await blockAt(probeN);
    const secPerBlock = Math.max(0.01, (Number(latest.timestamp) - Number(probe.timestamp)) / Math.max(1, latest.number - probeN));
    let guess = Math.round(latest.number - (Number(latest.timestamp) - target) / secPerBlock);
    guess = Math.min(Math.max(0, guess), latest.number);
    let span = 8_000, lo, hi;
    for (;;) {
      lo = Math.max(0, guess - span); hi = Math.min(latest.number, guess + span);
      const [bLo, bHi] = await Promise.all([blockAt(lo), blockAt(hi)]);
      const loBefore = Number(bLo.timestamp) < target, hiAfter = Number(bHi.timestamp) >= target;
      if ((loBefore || lo === 0) && (hiAfter || hi === latest.number)) break;
      span *= 4;
    }
    while (hi - lo > 2048) {
      const mid = Math.floor((lo + hi) / 2);
      const b = await blockAt(mid);
      if (Number(b.timestamp) < target) lo = mid; else hi = mid;
    }
    try { localStorage.setItem(cacheKey, String(lo)); } catch { /* fine */ }
    return lo;
  })().catch((err) => { _blockAtOrAfterPromises.delete(memoKey); throw err; });
  _blockAtOrAfterPromises.set(memoKey, p);
  return p;
}

// Multicall3 — same canonical cross-chain address, confirmed present on Arc
// mainnet too (Circle's own docs list it at this exact address).
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];
let multicallAvailable = null;

async function isMulticallAvailable() {
  if (multicallAvailable !== null) return multicallAvailable;
  try {
    const code = await readProvider().getCode(MULTICALL3_ADDRESS);
    multicallAvailable = code !== "0x";
  } catch {
    multicallAvailable = false;
  }
  if (!multicallAvailable) {
    console.warn("Multicall3 not found on this chain — falling back to one request per call.");
  }
  return multicallAvailable;
}

async function multicallRead(calls) {
  if (calls.length === 0) return [];
  const available = await isMulticallAvailable();
  const plainFallback = () => Promise.all(calls.map((c) =>
    c.contract[c.method](...(c.args || [])).catch((err) => {
      console.warn(`multicallRead fallback: ${c.method} failed`, err);
      return null;
    })
  ));

  if (!available) return plainFallback();

  try {
    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider());
    const encoded = calls.map((c) => ({
      target: c.contract.target,
      allowFailure: true,
      callData: c.contract.interface.encodeFunctionData(c.method, c.args || []),
    }));
    const results = await mc.aggregate3.staticCall(encoded);
    return results.map((r, i) => {
      if (!r.success) return null;
      try {
        const decoded = calls[i].contract.interface.decodeFunctionResult(calls[i].method, r.returnData);
        return decoded.length === 1 ? decoded[0] : decoded;
      } catch {
        return null;
      }
    });
  } catch (err) {
    console.warn("Multicall3 call failed — falling back to one request per call.", err);
    return plainFallback();
  }
}

function short(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

// ---------- Wallet connect (copied from app.js lines 523-653 verbatim —
// already CONFIG-driven/chain-agnostic there, nothing Robinhood-specific).
// wallet-appkit.js must be loaded on the page too (config-arc.js first) —
// it supplies tryOpenAppKit/hardDisconnect/setUserDisconnected/
// userDisconnected/clearStaleWalletStorage/ensureAppKitChain/appKitReady,
// all of which already read CONFIG rather than assuming Robinhood Chain.

async function connectWallet() {
  if (typeof setUserDisconnected === "function") setUserDisconnected(false);
  if (typeof tryOpenAppKit === "function" && await tryOpenAppKit()) return;

  if (!window.ethereum) {
    alert("No wallet found. Install MetaMask, Rabby, or another EVM wallet.");
    return;
  }
  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await browserProvider.send("eth_requestAccounts", []);
  if (!accounts || !accounts.length) return;
  state.account = accounts[0];
  state.signer = await browserProvider.getSigner();
  renderHeader();
  attachBasicWalletListeners();
  try { await ensureNetwork(); } catch (err) { console.warn("network switch declined/failed — showing wrong-network badge instead", err && err.message); }
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

async function restoreBasicWallet() {
  if (!window.ethereum) return;
  try {
    if (typeof userDisconnected === "function" && userDisconnected()) return;
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || !accounts.length) return;
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    state.account = accounts[0];
    state.signer = await browserProvider.getSigner();
    renderHeader();
    attachBasicWalletListeners();
    if (typeof updateNetworkBadge === "function") updateNetworkBadge();
    if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  } catch (err) {
    console.warn("basic wallet restore failed", err && err.message);
  }
}

let basicListenersAttached = false;
function attachBasicWalletListeners() {
  if (basicListenersAttached || !window.ethereum) return;
  basicListenersAttached = true;

  window.ethereum.on("accountsChanged", async (accounts) => {
    const prevAccount = state.account;
    if (accounts.length === 0) {
      state.account = null;
      state.signer = null;
    } else {
      state.account = accounts[0];
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      state.signer = await browserProvider.getSigner();
    }
    renderHeader();
    if (state.account !== prevAccount && typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  });

  window.ethereum.on("chainChanged", () => {
    location.reload();
  });
}

async function disconnectWallet() {
  if (typeof setUserDisconnected === "function") setUserDisconnected(true);
  if (typeof hardDisconnect === "function") { await hardDisconnect(); return; }
  try {
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      await WagmiCoreRef.disconnect(wagmiConfigRef);
    }
  } catch (err) {
    console.warn("Wallet disconnect (AppKit side) failed — clearing local state anyway.", err);
  }
  if (typeof clearStaleWalletStorage === "function") clearStaleWalletStorage();
  state.account = null;
  state.signer = null;
  renderHeader();
}

async function ensureNetwork() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CONFIG.CHAIN_ID_HEX,
          chainName: CONFIG.CHAIN_NAME,
          rpcUrls: [CONFIG.RPC_URL],
          blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
          nativeCurrency: CONFIG.NATIVE_CURRENCY,
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

// renderHeader() — same wallet-pill/dropdown markup as app.js's, minus the
// "My Profile" link (no explore.html#/profile equivalent on Arc pages yet).
// Pages using this must have a `<div id="wallet-slot"></div>` in the header.
function renderHeader() {
  const el = document.getElementById("wallet-slot");
  if (!el) return;
  if (state.account) {
    el.innerHTML = `
      <div class="wallet-info">
        <span class="network-badge" id="network-badge">…</span>
        <div class="wallet-dropdown-wrap" id="wallet-dropdown-wrap">
          <button class="wallet-pill" id="wallet-pill-btn">${short(state.account)} <svg class="wallet-pill-chevron" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg></button>
          <div class="wallet-dropdown" id="wallet-dropdown">
            <div class="wallet-dropdown-address">
              <code>${short(state.account)}</code>
              <span class="btn-mini" id="wallet-dropdown-copy" style="cursor:pointer">Copy</span>
            </div>
            <div class="wallet-dropdown-network" id="wallet-dropdown-network">…</div>
            <a class="wallet-dropdown-item" href="${CONFIG.BLOCK_EXPLORER}/address/${state.account}" target="_blank">View on Explorer ↗</a>
            <div class="wallet-dropdown-item wallet-dropdown-disconnect" id="wallet-dropdown-disconnect">Disconnect</div>
          </div>
        </div>
      </div>
    `;
    const dropdown = document.getElementById("wallet-dropdown");
    document.getElementById("wallet-pill-btn").onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };
    document.getElementById("wallet-dropdown-copy").onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(state.account);
    };
    document.getElementById("wallet-dropdown-disconnect").onclick = () => {
      dropdown.classList.remove("open");
      disconnectWallet();
    };
    updateNetworkBadge();
  } else {
    el.innerHTML = `<button class="btn btn-primary" id="connect-btn">Connect wallet</button>`;
    document.getElementById("connect-btn").onclick = connectWallet;
  }
}

async function updateNetworkBadge() {
  const badge = document.getElementById("network-badge");
  if (!badge || !state.signer) return;
  try {
    const network = await state.signer.provider.getNetwork();
    const chainId = Number(network.chainId);
    const isCorrect = chainId === CONFIG.CHAIN_ID_DECIMAL;
    const label = isCorrect ? CONFIG.CHAIN_NAME : `Wrong network (chain ${chainId}) — switch to ${CONFIG.CHAIN_NAME}`;
    badge.textContent = isCorrect ? CONFIG.CHAIN_NAME : `⚠ wrong network (${chainId}) · tap to switch`;
    badge.title = label;
    badge.classList.toggle("network-bad", !isCorrect);
    badge.style.cursor = isCorrect ? "" : "pointer";
    badge.onclick = isCorrect ? null : async () => {
      const prev = badge.textContent;
      badge.textContent = "check your wallet…";
      try {
        if (typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function") await ensureAppKitChain();
        else if (window.ethereum) { await ensureNetwork(); location.reload(); }
      } catch (err) { badge.textContent = prev; alert(String(err && err.message || err)); }
    };
    const line = document.getElementById("wallet-dropdown-network");
    if (line) {
      line.textContent = label;
      line.classList.toggle("network-bad", !isCorrect);
    }
  } catch (err) {
    badge.textContent = "network unknown";
    const line = document.getElementById("wallet-dropdown-network");
    if (line) line.textContent = "Network unknown";
  }
}

// Boot — same tail app.js itself has (`renderHeader(); route();`), minus
// route() since Arc pages have no HOMEPAD-style hash router. This paints
// the "Connect wallet" button the instant this script runs, before
// wallet-appkit.js even loads; wallet-appkit.js's own self-invoked
// initAppKit() (see its last line) then repaints it if a wallet is
// already authorized (restoreBasicWallet, called from there) or once
// AppKit finishes restoring a session. Script order matters: this file
// must load before wallet-appkit.js so these functions already exist
// when initAppKit() runs.
renderHeader();
