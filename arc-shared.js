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

// Arc's public RPC rejects any eth_getLogs spanning more than ~10,000 blocks
// ("requested range too large", -32012; measured cap 9,960) and Arc makes a
// block every ~0.5s — ~170k blocks a day — so a single "since deploy" log
// query stops working within hours. This splits [fromBlock, toBlock] into
// ranges the RPC accepts. `filter` is anything contract.queryFilter takes
// (an event filter, an event name, or "*").
// The public RPC also rate-limits eth_getLogs (-32005 "rate limit
// exceeded"). Measured on mainnet: one request at a time with exponential
// backoff on a rate-limit hit is FASTER than running in parallel (10 chunks
// in ~2.7s sequential vs ~5s with 2 in flight), so concurrency defaults to 1.
const LOG_CHUNK_BLOCKS = 9_000;
const RATE_LIMITED = /rate limit|429|-32005|too many requests/i;
// onChunk(events, [from, to]) fires as each range completes — with the
// default concurrency of 1 that's strictly in block order, so a caller can
// checkpoint progress and resume after a failure instead of starting over.
async function queryFilterChunked(contract, filter, fromBlock, toBlock, { chunk = LOG_CHUNK_BLOCKS, concurrency = 1, onChunk = null } = {}) {
  if (toBlock == null || toBlock === "latest") toBlock = await withRetry(() => readProvider().getBlockNumber());
  if (fromBlock > toBlock) return [];
  const ranges = [];
  for (let a = fromBlock; a <= toBlock; a += chunk) ranges.push([a, Math.min(toBlock, a + chunk - 1)]);
  const fetchRange = async ([a, b]) => {
    for (let attempt = 0; ; attempt++) {
      try { return await contract.queryFilter(filter, a, b); }
      catch (err) {
        const text = JSON.stringify(err && err.error || "") + String(err && (err.shortMessage || err.message) || err);
        const retryable = RATE_LIMITED.test(text) || TRANSIENT_RPC.test(text);
        if (!retryable || attempt >= 9) throw err;
        await new Promise((r) => setTimeout(r, Math.min(8000, 500 * 2 ** attempt)));
      }
    }
  };
  const out = new Array(ranges.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, async () => {
    while (next < ranges.length) {
      const i = next++;
      out[i] = await fetchRange(ranges[i]);
      if (onChunk) onChunk(out[i], ranges[i], i + 1, ranges.length);
    }
  }));
  return out.flat();
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

/// Docs → "Contracts" table shared by ArcPad and CirclePad. `rows` is
/// [label, address, one-line role]; an empty address renders as a
/// "not deployed yet" row instead of a broken explorer link. Every address
/// links to the block explorer from config-arc.js and has a copy button.
function renderContractRows(rows) {
  const isAddr = (a) => typeof a === "string" && a.length === 42;
  return `<div class="ac-contracts">${rows.map(([label, addr, role]) => `
    <div class="ac-row">
      <div class="ac-row-main">
        <div class="ac-label">${label}</div>
        <div class="ac-role">${role}</div>
      </div>
      ${isAddr(addr)
        ? `<div class="ac-addr">
            <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/address/${addr}" target="_blank" rel="noopener" title="${addr}"><span class="ac-addr-full">${addr}</span><span class="ac-addr-short">${short(addr)}</span> ↗</a>
            <button type="button" class="ac-copy" data-copy="${addr}" title="Copy address">Copy</button>
          </div>`
        : `<div class="ac-addr ac-addr-pending">not deployed yet</div>`}
    </div>`).join("")}
    <div class="ac-foot">Chain: ${CONFIG.CHAIN_NAME} (id ${CONFIG.CHAIN_ID_DECIMAL}) · RPC <code>${CONFIG.RPC_URL}</code> · Explorer <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}" target="_blank" rel="noopener">${CONFIG.BLOCK_EXPLORER.replace(/^https?:\/\//, "")} ↗</a></div>
  </div>`;
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".ac-copy");
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const prev = btn.textContent; btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  }).catch(() => {});
});

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
  if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
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
            <button type="button" class="wallet-dropdown-switch" id="wallet-dropdown-switch" hidden>Switch to ${CONFIG.CHAIN_NAME}</button>
            <div class="wallet-dropdown-note" id="wallet-dropdown-note" hidden></div>
            <a class="wallet-dropdown-item" href="${CONFIG.BLOCK_EXPLORER}/address/${state.account}" target="_blank">View on Explorer ↗</a>
            <button type="button" class="wallet-dropdown-item wallet-dropdown-disconnect" id="wallet-dropdown-disconnect">Disconnect</button>
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
    document.getElementById("wallet-dropdown-disconnect").onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      disconnectWallet();
    };
    document.getElementById("wallet-dropdown-switch").onclick = (e) => { e.stopPropagation(); switchToArcNetwork(); };
    dropdown.onclick = (e) => e.stopPropagation();
    if (!renderHeader._outsideClose) {
      renderHeader._outsideClose = true;
      document.addEventListener("click", () => {
        const d = document.getElementById("wallet-dropdown");
        if (d) d.classList.remove("open");
      });
    }
    updateNetworkBadge();
  } else {
    el.innerHTML = `<button class="btn btn-primary" id="connect-btn">Connect wallet</button>`;
    document.getElementById("connect-btn").onclick = connectWallet;
  }
}

let switchingNetwork = false;
/// The one "put my wallet on Arc" action — used by the header badge and
/// the dropdown's Switch button. On a phone connected over WalletConnect
/// the approval only appears inside the wallet app, so this also brings
/// that app to the front (openConnectedWalletApp — must stay synchronous
/// inside the tap, before any await).
async function switchToArcNetwork() {
  if (switchingNetwork) return;
  switchingNetwork = true;
  const note = document.getElementById("wallet-dropdown-note");
  const btn = document.getElementById("wallet-dropdown-switch");
  const badge = document.getElementById("network-badge");
  const setNote = (text, bad) => { if (note) { note.hidden = !text; note.textContent = text || ""; note.classList.toggle("bad", !!bad); } };
  const usingAppKit = typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function" && !(typeof IN_APP_WALLET_BROWSER !== "undefined" && IN_APP_WALLET_BROWSER);
  const request = usingAppKit ? ensureAppKitChain() : (window.ethereum ? ensureNetwork() : Promise.reject(new Error("No wallet connected.")));
  const jumped = usingAppKit && typeof openConnectedWalletApp === "function" && openConnectedWalletApp();
  if (btn) { btn.disabled = true; btn.textContent = "Waiting for your wallet…"; }
  if (badge) badge.classList.add("network-busy");
  setNote(jumped ? `Approve the switch to ${CONFIG.CHAIN_NAME} in your wallet app, then come back here.` : `Approve the switch to ${CONFIG.CHAIN_NAME} in your wallet.`);
  try {
    await request;
    setNote("");
    if (!usingAppKit) state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  } catch (err) {
    const msg = String(err && (err.shortMessage || err.message) || err);
    setNote(/reject|denied|cancel/i.test(msg) ? "Switch cancelled in the wallet." : msg.slice(0, 260), true);
  } finally {
    switchingNetwork = false;
    if (btn) { btn.disabled = false; btn.textContent = `Switch to ${CONFIG.CHAIN_NAME}`; }
    if (badge) badge.classList.remove("network-busy");
    updateNetworkBadge();
  }
}

/// Called right before every transaction on ArcPad / CirclePad: if the
/// wallet is on another chain, switch it to Arc first (and pick up a
/// signer for the new chain), so a write never goes out on the wrong
/// network or fails with a confusing chain-mismatch error.
async function ensureArcForWrite() {
  const id = await currentChainId().catch(() => null);
  if (id === CONFIG.CHAIN_ID_DECIMAL) return;
  const usingAppKit = typeof appKitReady !== "undefined" && appKitReady && typeof ensureAppKitChain === "function" && !(typeof IN_APP_WALLET_BROWSER !== "undefined" && IN_APP_WALLET_BROWSER);
  if (usingAppKit) { await ensureAppKitChain(); return; }
  if (!window.ethereum) throw new Error(`Switch your wallet to ${CONFIG.CHAIN_NAME} and try again.`);
  await ensureNetwork();
  state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  state.signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

async function currentChainId() {
  if (state.chainId != null && Number.isFinite(Number(state.chainId))) return Number(state.chainId);
  if (state.signer && state.signer.provider) return Number((await state.signer.provider.getNetwork()).chainId);
  if (window.ethereum) return Number.parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
  return null;
}

async function updateNetworkBadge() {
  const badge = document.getElementById("network-badge");
  if (!badge || !state.account) return;
  const line = document.getElementById("wallet-dropdown-network");
  const btn = document.getElementById("wallet-dropdown-switch");
  try {
    const chainId = await currentChainId();
    if (chainId == null) throw new Error("unknown");
    const isCorrect = chainId === CONFIG.CHAIN_ID_DECIMAL;
    badge.textContent = isCorrect ? CONFIG.CHAIN_NAME : `Switch to ${CONFIG.CHAIN_NAME}`;
    badge.title = isCorrect ? `Connected to ${CONFIG.CHAIN_NAME}` : `Your wallet is on chain ${chainId} — tap to switch to ${CONFIG.CHAIN_NAME}`;
    badge.classList.toggle("network-bad", !isCorrect);
    badge.style.cursor = isCorrect ? "" : "pointer";
    badge.onclick = isCorrect ? null : (e) => { e.stopPropagation(); switchToArcNetwork(); };
    if (line) {
      line.textContent = isCorrect ? `Connected to ${CONFIG.CHAIN_NAME}` : `Wallet is on another network (chain ${chainId})`;
      line.classList.toggle("network-bad", !isCorrect);
      line.classList.toggle("network-ok", isCorrect);
    }
    if (btn) btn.hidden = isCorrect;
  } catch (err) {
    badge.textContent = "Network?";
    if (line) line.textContent = "Network unknown";
    if (btn) btn.hidden = false;
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
