/* global ethers, CONFIG, state, renderHeader */

// Reown AppKit gives a polished multi-wallet connect modal (the one you see
// on kekfun.xyz, credited "UX by reown" at the bottom of it) — a list of
// installed/popular wallets plus a "search 80+ wallets" option, with
// WalletConnect QR support for mobile wallets baked in.
//
// This site has no build step by design, and AppKit's main package expects
// a bundler (Vite). This uses Reown's own purpose-built CDN bundle,
// @reown/appkit-cdn, which ships a single pre-bundled ESM file specifically
// so it can be used directly with no bundler. It exposes createAppKit + a
// Wagmi adapter (not an Ethers one), so this file bridges the connected
// wagmi/viem client into an ethers.Signer via ethers.BrowserProvider — the
// standard pattern for mixing wagmi's wallet layer with ethers-based
// contract code — so nothing else in app.js has to change.
//
// The modal itself is confirmed working. What's NOT fully confirmed is
// which of this pinned version's account-change events actually fire
// reliably (the docs for the current npm version describe APIs this older
// CDN build may not match exactly). Rather than depend on any single event
// working, this registers every plausible listener defensively AND polls
// for a short window after the modal opens as a guaranteed fallback — so
// the header updates even if every event hook above it turns out to be a
// no-op on this build.

let appKitModal = null;
let appKitReady = false;
let wagmiConfigRef = null;
let WagmiCoreRef = null;
let appKitNetwork = null;

// True from the moment the connect modal opens until a session is
// confirmed or the modal closes without one. While it's set, transient
// errors from a half-established session (WalletConnect pairing still
// settling, wallet app not back in the foreground yet) must NOT be treated
// as "stale session, wipe storage" — that exact cleanup, firing mid-handshake
// from the poller, is what killed connection attempts and forced people to
// clear their cache and start over.
let connectInFlight = false;
let connectPoll = null;

// On a phone, "Connect" hands off to the wallet app (MetaMask, …) and the
// browser tab goes to the background — Chrome may freeze its timers, drop the
// WalletConnect socket, or even reload the tab before the person comes back.
// The fact that a connect is under way therefore has to outlive the tab's JS
// state: it's kept in sessionStorage for a few minutes, and while it's set,
// nothing may treat the half-finished session as "stale" and wipe it.
const CONNECT_PENDING_KEY = "wallet.connectPending";
const CONNECT_PENDING_MS = 5 * 60 * 1000;
let lastResumeAt = 0;
function markConnectPending() { try { sessionStorage.setItem(CONNECT_PENDING_KEY, String(Date.now())); } catch { /* fine */ } }
function clearConnectPending() { try { sessionStorage.removeItem(CONNECT_PENDING_KEY); } catch { /* fine */ } }
function connectPending() {
  try { const t = Number(sessionStorage.getItem(CONNECT_PENDING_KEY)); return t > 0 && Date.now() - t < CONNECT_PENDING_MS; } catch { return false; }
}
/// True while a connect is being set up here or in the wallet app, or just
/// after the tab came back to the foreground (WalletConnect replays queued
/// relay messages then, and some of them throw harmless "No matching key"
/// errors while it catches up).
function connectBusy() { return connectInFlight || connectPending() || Date.now() - lastResumeAt < 30000; }

// "Disconnect" has to survive a reload. The wallet extension still has the
// site permission (a website can't revoke that), so wagmi's reconnect-on-
// mount would otherwise quietly bring the session straight back and the
// header would say "connected" again — the "it never disconnects" report.
// This flag makes the next load stay disconnected until Connect is clicked.
const USER_DISCONNECTED_KEY = "homepad.walletDisconnected";
const userDisconnected = () => { try { return localStorage.getItem(USER_DISCONNECTED_KEY) === "1"; } catch { return false; } };
function setUserDisconnected(on) { try { on ? localStorage.setItem(USER_DISCONNECTED_KEY, "1") : localStorage.removeItem(USER_DISCONNECTED_KEY); } catch { /* fine */ } }

/// The one way to end a session. Goes through AppKit's own disconnect
/// FIRST — AppKit keeps its own account store beside wagmi's, and calling
/// wagmi's disconnect() underneath it left AppKit still showing the
/// account (so its own Disconnect button then failed with "Failed to
/// disconnect", because wagmi had nothing left to disconnect). Then wagmi,
/// then storage, then our header.
async function hardDisconnect() {
  // Local state first, so the header flips to "Connect wallet" immediately
  // even if the wallet side never answers (a WalletConnect relay waiting on
  // a phone wallet that's in the background can hang the disconnect call
  // indefinitely — which looked like "Disconnect does nothing").
  state.account = null; state.signer = null; state.chainId = null; state.walletProvider = null;
  if (typeof renderHeader === "function") renderHeader();
  if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
  if (connectPoll) { clearInterval(connectPoll); connectPoll = null; }
  connectInFlight = false;
  try { if (appKitModal && typeof appKitModal.disconnect === "function") await withTimeout(appKitModal.disconnect(), 4000); } catch (e) { console.warn("appkit disconnect", e && e.message); }
  try {
    if (WagmiCoreRef && wagmiConfigRef && WagmiCoreRef.getAccount(wagmiConfigRef).isConnected) await withTimeout(WagmiCoreRef.disconnect(wagmiConfigRef), 3000);
  } catch (e) { console.warn("wagmi disconnect", e && e.message); }
  clearStaleWalletStorage();
}

// wagmi v2 persists its connection state in a single 'wagmi.*'-prefixed
// localStorage blob; WalletConnect/Reown add their own 'wc@2:' and
// '@appkit'/'@w3m' keys for relay sessions and UI state. A stale entry
// here — most often an expired WalletConnect relay session that wagmi
// still optimistically flags as connected — is exactly what produces
// "the button says Connect, but I'm secretly still connected" bugs that
// only clearing site data used to fix: wagmi reports isConnected on every
// load, syncFromWagmi() below tries to actually use that session, fails,
// and nothing ever cleans up the flag that caused it to try again next
// time. Any place that detects a broken session calls this directly
// instead of asking the person to clear their cache.
const WALLET_STORAGE_PREFIXES = ["wagmi.", "wc@2:", "@w3m", "@appkit", "WCM_VERSION", "-walletlink"];
function clearLocalWalletKeys() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (WALLET_STORAGE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch (e) { /* storage blocked (private mode etc.) — nothing to clear anyway */ }
}
function clearStaleWalletStorage() {
  clearLocalWalletKeys();
  // WalletConnect keeps its sessions / pairings / provider namespaces in
  // IndexedDB, not localStorage. Clearing only localStorage left the two
  // halves disagreeing, and the next connect died inside AppKit with
  // "Cannot read properties of undefined (reading 'setDefaultChain')".
  // IndexedDB can't be deleted while WalletConnect has it open, so the
  // full wipe happens at the start of the next page load (see initAppKit).
  try { localStorage.setItem(WALLET_RESET_FLAG, "1"); } catch { /* fine */ }
}

// ---- WalletConnect storage self-repair ----
const WC_IDB_NAME = "WALLET_CONNECT_V2_INDEXED_DB";
const WALLET_RESET_FLAG = "wallet.resetPending";
// Bump to force every browser to start from a clean WalletConnect store
// once (v2: clears the half-wiped state older builds could leave behind).
const WALLET_STORE_VERSION_KEY = "wallet.storeVersion";
const WALLET_STORE_VERSION = "2";
const BROKEN_WC_SESSION = /setDefaultChain|Please call connect\(\)|No matching key|session topic doesn't exist|Record was recently deleted|Missing or invalid\. (?:pairing|session)/i;

function deleteWalletConnectDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(WC_IDB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
      setTimeout(resolve, 1500);
    } catch { resolve(); }
  });
}

/// Runs before AppKit loads (so nothing has the database open yet).
async function repairWalletStorageIfNeeded() {
  let need = false;
  try { need = localStorage.getItem(WALLET_RESET_FLAG) === "1" || localStorage.getItem(WALLET_STORE_VERSION_KEY) !== WALLET_STORE_VERSION; } catch { return; }
  if (!need) return;
  clearLocalWalletKeys();
  await deleteWalletConnectDb();
  try { localStorage.removeItem(WALLET_RESET_FLAG); localStorage.setItem(WALLET_STORE_VERSION_KEY, WALLET_STORE_VERSION); } catch { /* fine */ }
}

/// A corrupted WalletConnect store surfaces as one of a handful of AppKit
/// errors. Instead of leaving the person stuck on it, wipe the store and
/// reload, then reopen the connect window so they can just pick the wallet
/// again.
let healingWallet = false;
function healBrokenWalletConnect(reason) {
  if (healingWallet) return;
  if (connectBusy() || document.visibilityState === "hidden") {
    // Mid-handshake or just back from the wallet app: this is WalletConnect
    // catching up, not a broken store. Wiping + reloading here is exactly
    // what erased a connection the person had just approved in MetaMask.
    console.warn("WalletConnect error during connect — not resetting.", reason);
    return;
  }
  healingWallet = true;
  console.warn("WalletConnect store is inconsistent — resetting it and reloading.", reason);
  try { localStorage.setItem(WALLET_RESET_FLAG, "1"); sessionStorage.setItem("wallet.reopenModal", "1"); } catch { /* fine */ }
  setTimeout(() => location.reload(), 250);
}
window.addEventListener("unhandledrejection", (e) => {
  const m = String(e && e.reason && (e.reason.message || e.reason) || "");
  if (BROKEN_WC_SESSION.test(m)) healBrokenWalletConnect(m);
});
window.addEventListener("error", (e) => {
  const m = String(e && (e.message || (e.error && e.error.message)) || "");
  if (BROKEN_WC_SESSION.test(m)) healBrokenWalletConnect(m);
});

/// Races a promise against a plain timeout so a hung reconnect attempt
/// (dead WalletConnect relay, a wallet extension that never responds)
/// resolves into "treat as disconnected" instead of leaving the header in
/// limbo indefinitely with no visible next step.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve("timeout"); });
  });
}

// Bridges a connected viem/wagmi client into an ethers v6 Signer. Standard
// wagmi<->ethers adapter pattern — the viem WalletClient's transport is an
// EIP-1193-compatible provider, which is exactly what ethers.BrowserProvider
// expects. Returns true if a wallet is connected, so the poller below can
// stop early.
// One automatic "switch to <chain>" request per address per browser tab session,
// right after a wallet connects on another chain — enough to land people on
// the right network by default, without the repeated prompts a switch on
// every sync used to cause.
let syncFailures = 0;
let syncRetryTimer = null;
function scheduleSyncRetry() {
  syncFailures++;
  if (syncRetryTimer) return;
  syncRetryTimer = setTimeout(() => { syncRetryTimer = null; syncFromWagmi(); }, Math.min(6000, 800 * syncFailures));
}

const autoSwitchTried = {
  has(a) { try { return sessionStorage.getItem("wallet.autoSwitch." + a) === "1"; } catch { return false; } },
  add(a) { try { sessionStorage.setItem("wallet.autoSwitch." + a, "1"); } catch { /* fine */ } },
};

async function syncFromWagmi() {
  if (!WagmiCoreRef || !wagmiConfigRef) return false;
  // After Disconnect, AppKit's own account store can still report the old
  // address for a while (its disconnect goes over the relay). Don't let that
  // bring the session back until Connect is pressed again.
  if (userDisconnected() && !connectBusy()) {
    if (state.account) {
      state.account = null; state.signer = null; state.chainId = null;
      if (typeof renderHeader === "function") renderHeader();
    }
    return false;
  }
  let connectorType = null;
  try {
    let account = WagmiCoreRef.getAccount(wagmiConfigRef);
    connectorType = account.connector && account.connector.type;
    if (!(account.isConnected && account.address) && appKitModal && typeof appKitModal.getAddress === "function") {
      // AppKit keeps its own account store; if it has a session wagmi's
      // store doesn't (seen on some injected builds), trust AppKit.
      const addr = appKitModal.getAddress && appKitModal.getAddress();
      const connected = typeof appKitModal.getIsConnectedState === "function" ? appKitModal.getIsConnectedState() : !!addr;
      if (addr && connected) {
        const provider = typeof appKitModal.getWalletProvider === "function" ? appKitModal.getWalletProvider() : null;
        account = { isConnected: true, address: addr, chainId: Number(appKitModal.getChainId && appKitModal.getChainId()) || null, connector: provider ? { type: "appkit", getProvider: async () => provider } : null };
      }
    }
    if (account.isConnected && account.address) {
      // The basic (non-AppKit) connect flow force-switches to Robinhood
      // Chain via ensureNetwork() in app.js. This path needs the same
      // guarantee — otherwise a wallet connected via AppKit while active
      // on some other chain would silently point every contract call here
      // at the wrong network.
      // Don't force a network switch here. This runs on every account
      // event AND on a 1.3s poll while the modal is open, so switching
      // from here meant a wallet on another chain got a "switch network?"
      // prompt over and over, and rejecting it just queued the next one.
      // The wrong-chain state is shown in the header instead, and the
      // switch happens exactly once, right before a transaction is sent
      // (ensureAppKitChain in tryWagmiWrite) or when the badge is tapped.
      state.chainId = account.chainId;

      // The connector's raw EIP-1193 provider works on any chain. (wagmi's
      // getConnectorClient is gated to chains in the config, so on a
      // wrong-chain session it threw — and the header stayed on "Connect
      // wallet" even though the wallet was connected.)
      const eip1193 = account.connector && typeof account.connector.getProvider === "function"
        ? await account.connector.getProvider()
        : (await WagmiCoreRef.getConnectorClient(wagmiConfigRef)).transport;
      const changed = state.account !== account.address;
      state.account = account.address; // header first — a signer failure below must not hide a connected wallet
      state.walletProvider = eip1193;
      if (Number(account.chainId) !== CONFIG.CHAIN_ID_DECIMAL && !autoSwitchTried.has(account.address)) {
        autoSwitchTried.add(account.address);
        setTimeout(() => { ensureAppKitChain().catch((e) => console.warn("auto network switch declined/failed", e && e.message)); }, 400);
      }
      try {
        const browserProvider = new ethers.BrowserProvider(eip1193);
        state.signer = await browserProvider.getSigner(account.address);
      } catch (signerErr) {
        console.warn("signer unavailable for now (writes still go through wagmi)", signerErr && signerErr.message);
        state.signer = state.signer || null;
      }
      // This sync is wired to several triggers (watchAccount, AppKit
      // subscribeAccount, modal close, initial load) and they often fire
      // back-to-back for the same account. Only re-render on an ACTUAL
      // change — re-rendering the Profile page 3-4 times in a row started
      // overlapping async loads that overwrote each other's results.
      connectInFlight = false;
      clearConnectPending();
      syncFailures = 0;
      if (connectPoll) { clearInterval(connectPoll); connectPoll = null; }
      if (changed) {
        if (typeof renderHeader === "function") renderHeader();
        // Wallet auto-reconnect finishes AFTER the page's initial route()
        // call, so a view that depends on state.account (Profile, a token
        // page's Balance) would otherwise sit on stale data — Profile's
        // "not connected" state forever, or a token page silently keeping
        // whichever account's numbers it had before this account switch.
        if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
      } else if (typeof updateNetworkBadge === "function") {
        updateNetworkBadge(); // chain may still have changed
      }
      return true;
    } else {
      if (state.account) {
        state.account = null;
        state.signer = null;
        if (typeof renderHeader === "function") renderHeader();
        if (typeof refreshAccountDependentViews === "function") refreshAccountDependentViews();
      }
      return false;
    }
  } catch (err) {
    // wagmi said isConnected, but actually using that session threw —
    // an expired WalletConnect relay or a revoked permission are the
    // usual causes. Left alone, wagmi's own persisted flag keeps saying
    // "connected" on every future load and this same failure repeats
    // forever (the exact "stuck" bug this file exists to prevent).
    // Force-disconnect and sweep storage so the NEXT check starts from a
    // state that's actually true, and reflect that in the header now
    // instead of leaving it on whatever it last showed.
    if (connectBusy()) {
      // Mid-handshake — the session may simply not be usable yet. Leave
      // storage alone; the poller / next event will try again.
      console.warn("syncFromWagmi: session not usable yet (connect in progress)", err && err.message);
      return false;
    }
    if (connectorType === "injected" || connectorType === "metaMask") {
      // An in-app browser / extension wallet can't have a "stale relay
      // session" — it re-authorises itself on every load. A failure here
      // is transient (provider not ready yet); killing the session for it
      // is what produced "connected in the wallet, Connect in the header".
      console.warn("syncFromWagmi: injected provider not ready yet", err && err.message);
      scheduleSyncRetry();
      return false;
    }
    // Right after a page load (e.g. going from /arc to /circle) wagmi is
    // still re-hydrating the WalletConnect session, and touching it throws
    // things like "connector.getChainId is not a function" for a moment.
    // Treating that as a dead session and disconnecting is what logged
    // people out every time they changed pages. Retry for a while first;
    // only a session that keeps failing is cleared as stale.
    if (syncFailures < 6) {
      console.warn("syncFromWagmi: session not ready yet — retrying", err && err.message);
      scheduleSyncRetry();
      return false;
    }
    console.warn("syncFromWagmi kept failing — clearing the stale session so it doesn't repeat.", err);
    syncFailures = 0;
    await hardDisconnect();
    return false;
  }
}

// A wallet app's built-in browser (MetaMask, Robinhood Wallet, Trust, …)
// injects window.ethereum and is already "the wallet". Putting AppKit +
// WalletConnect + wagmi's own account store in front of that added three
// places for the connection state to disagree — which is exactly what
// showed up: the wallet connected, AppKit showing the account, our header
// saying Connect. On these browsers the plain injected flow in app.js is
// used instead: one provider, one state, nothing to get out of sync.
const IN_APP_WALLET_BROWSER = !!window.ethereum && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

async function initAppKit() {
  if (IN_APP_WALLET_BROWSER || !CONFIG.REOWN_PROJECT_ID) {
    if (typeof restoreBasicWallet === "function") restoreBasicWallet();
    return;
  }

  await repairWalletStorageIfNeeded();
  try {
    // Pinned to a specific version on purpose (never @latest — that can change
// under us with no warning) but this was stuck on 1.4.1, an ~11-month-old
// build. allowUnsupportedChain (below) is documented AppKit behavior, but
// 1.4.1 predates it — or has a bug in it — which is why the "Switch
// Network" trap kept happening even with the option set correctly. Bumped
// to a current stable release.
const appkitCdn = await import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.8.18/dist/appkit.min.js");
    const { createAppKit, WagmiAdapter, WagmiCore } = appkitCdn;
    WagmiCoreRef = WagmiCore;

    // Shape AppKit's own defineChain() produces. Without chainNamespace /
    // caipNetworkId this build treated the wallet's chain as "unsupported"
    // and showed its Select-network screen with nothing it could switch
    // to — the "it asks me to pick a chain and then nothing happens" bug.
    const robinhoodNetwork = {
      id: CONFIG.CHAIN_ID_DECIMAL,
      name: CONFIG.CHAIN_NAME,
      nativeCurrency: CONFIG.NATIVE_CURRENCY,
      rpcUrls: { default: { http: [CONFIG.RPC_URL] } },
      blockExplorers: { default: { name: "Explorer", url: CONFIG.BLOCK_EXPLORER } },
      chainNamespace: "eip155",
      caipNetworkId: `eip155:${CONFIG.CHAIN_ID_DECIMAL}`,
      testnet: false,
    };

    appKitNetwork = robinhoodNetwork;
    // The Bridge utility (arc-bridge.js) moves USDC to and from these chains:
    // listing them lets the wallet switch to them over WalletConnect too.
    // The site's own chain stays the default and the one every write checks.
    const bridgeNetworks = ((CONFIG.BRIDGE && CONFIG.BRIDGE.CHAINS) || []).map((c) => ({
      id: c.chainId, name: c.name, nativeCurrency: c.native,
      rpcUrls: { default: { http: [c.rpc] } },
      blockExplorers: { default: { name: "Explorer", url: c.explorer } },
      chainNamespace: "eip155", caipNetworkId: `eip155:${c.chainId}`, testnet: false,
    }));
    const allNetworks = [robinhoodNetwork].concat(bridgeNetworks);
    const wagmiAdapter = new WagmiAdapter({
      projectId: CONFIG.REOWN_PROJECT_ID,
      networks: allNetworks,
    });
    wagmiConfigRef = wagmiAdapter.wagmiConfig;

    appKitModal = createAppKit({
      adapters: [wagmiAdapter],
      networks: allNetworks,
      defaultNetwork: robinhoodNetwork,
      // A wallet that connects while on another chain (very common on
      // mobile — WalletConnect sessions come back on whatever chain the
      // wallet app is showing) must NOT be trapped in AppKit's own
      // "Switch Network" screen: on WalletConnect that screen's button
      // fires a request the wallet app can't see from the browser, so it
      // looks like it does nothing. Let the session through; the header
      // shows the wrong-chain state and ensureAppKitChain() handles the
      // switch (with wallet_addEthereumChain) when it actually matters.
      allowUnsupportedChain: true,
      projectId: CONFIG.REOWN_PROJECT_ID,
      // Shown by the wallet on its connect / approve screens.
      metadata: {
        name: CONFIG.APP_NAME || "HOMEPAD",
        description: CONFIG.APP_DESCRIPTION || "A permissionless launchpad on Robinhood Chain, built by $HOME.",
        url: location.origin,
        icons: [location.origin + (CONFIG.APP_ICON || "/images/gallery-mark.png")],
      },
      // Wallets only — no email/social login. This is a crypto-native
      // launchpad; an email-created custodial-ish wallet isn't the flow
      // we want people landing in by default.
      features: {
        email: false,
        socials: false,
      },
    });

    // AppKit reports connect failures as events (the red banner in its
    // modal). The ones that mean "the stored WalletConnect state is broken"
    // get repaired automatically instead of shown forever.
    try {
      appKitModal.subscribeEvents && appKitModal.subscribeEvents((ev) => {
        const d = ev && ev.data;
        const msg = d && d.properties && d.properties.message;
        if (d && /ERROR/.test(String(d.event)) && BROKEN_WC_SESSION.test(String(msg || ""))) healBrokenWalletConnect(msg);
      });
    } catch (e) { console.warn("subscribeEvents unavailable", e); }

    // Register every plausible "something changed" hook defensively — if a
    // given method doesn't exist or throws on this build, that's caught
    // and the others (plus the poller in tryOpenAppKit) still cover it.
    try { WagmiCoreRef.watchAccount(wagmiConfigRef, { onChange: syncFromWagmi }); } catch (e) { console.warn("watchAccount unavailable", e); }
    try { appKitModal.subscribeAccount && appKitModal.subscribeAccount(syncFromWagmi); } catch (e) { console.warn("subscribeAccount unavailable", e); }
    try {
      appKitModal.subscribeState && appKitModal.subscribeState((s) => {
        if (s.open) return;
        // Closed while the page is in front and not right after coming back
        // from the wallet app = the person dismissed it.
        if (document.visibilityState === "visible" && Date.now() - lastResumeAt > 4000) clearConnectPending();
        // One last check, then stop treating errors as "still connecting".
        syncFromWagmi().finally(() => {
          setTimeout(() => {
            const a = WagmiCoreRef.getAccount(wagmiConfigRef);
            if (!a.isConnected && !connectPending()) { connectInFlight = false; if (connectPoll) { clearInterval(connectPoll); connectPoll = null; } }
          }, 1500);
        });
      });
    } catch (e) { console.warn("subscribeState unavailable", e); }

    if (connectPending()) {
      // The tab was reloaded (or restored) in the middle of a connect — most
      // often Chrome discarding it while MetaMask was in front. Keep waiting
      // for the approved session instead of starting from "disconnected".
      connectInFlight = true;
      lastResumeAt = Date.now();
      setUserDisconnected(false);
    }
    // In case a session is already restored on load. Timeout-guarded
    // separately from syncFromWagmi's own error handling above, since a
    // HUNG reconnect (relay never responds, rather than responding with
    // an error) wouldn't hit that catch block at all.
    if (userDisconnected()) {
      // They pressed Disconnect last time. An in-app / extension wallet
      // re-authorises on every load regardless, so wagmi will have
      // reconnected on mount — undo it through AppKit's own API so both
      // stores agree, and stay disconnected until Connect is pressed.
      // (Give the auto-reconnect a beat to land first, or there's nothing
      // to undo yet and it comes back a second later.)
      await new Promise((r) => setTimeout(r, 600));
      await hardDisconnect();
    }
    const restored = userDisconnected() ? false : await withTimeout(syncFromWagmi(), 8000);
    if (restored !== true && connectPending()) startConnectPoll(90);
    if (restored === "timeout") {
      // A WalletConnect relay on a phone can take longer than this to come
      // back. Don't destroy the session for being slow — keep listening
      // (watchAccount / subscribeAccount) and check again shortly.
      console.warn("Wallet session restore is slow — will keep checking.");
      scheduleSyncRetry();
    }
    appKitReady = true;
    let reopen = false;
    try { reopen = sessionStorage.getItem("wallet.reopenModal") === "1"; sessionStorage.removeItem("wallet.reopenModal"); } catch { /* fine */ }
    if (reopen && !state.account) setTimeout(() => { tryOpenAppKit(); }, 400);
  } catch (err) {
    console.warn("Reown AppKit failed to load — falling back to the basic wallet connect button.", err);
    appKitReady = false;
  }
}

/// Guaranteed fallback: poll for a connected account, independent of whether
/// any event listener fires on this build. Only time the tab is in front
/// counts toward the limit — on a phone the person is in the wallet app for
/// most of the connect, with this tab frozen in the background.
function startConnectPoll(visibleSeconds) {
  if (connectPoll) clearInterval(connectPoll);
  let ticks = 0;
  const maxTicks = Math.ceil((visibleSeconds * 1000) / 1300);
  connectPoll = setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    ticks++;
    const connected = await syncFromWagmi();
    if (connected || ticks > maxTicks) {
      clearInterval(connectPoll); connectPoll = null;
      if (!connected) { connectInFlight = false; clearConnectPending(); }
    }
  }, 1300);
}

/// Back from the wallet app: wake WalletConnect up (its socket is usually
/// gone after the tab was in the background) and look for the session the
/// person just approved.
async function onWalletResume() {
  if (!appKitReady || !WagmiCoreRef || !wagmiConfigRef) return;
  if (!(connectInFlight || connectPending())) {
    // Not connecting — just make sure an existing session is still reflected.
    syncFromWagmi().catch(() => {});
    return;
  }
  lastResumeAt = Date.now();
  connectInFlight = true;
  try { if (typeof WagmiCoreRef.reconnect === "function") await withTimeout(WagmiCoreRef.reconnect(wagmiConfigRef), 6000); } catch { /* the poll below covers it */ }
  if (!(await syncFromWagmi())) startConnectPoll(90);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onWalletResume(); });
window.addEventListener("pageshow", (e) => { if (e.persisted) onWalletResume(); });

/// Called by app.js's connect button instead of its own basic flow, when
/// AppKit is available. Returns true if it handled the click, false if the
/// caller should fall back to its own logic.
async function tryOpenAppKit() {
  if (appKitReady && appKitModal) {
    setUserDisconnected(false);
    // In-app wallet browsers (MetaMask, Robinhood Wallet, …) auto-connect
    // their injected provider; if wagmi already has the session, "Connect"
    // just means "show it" — opening the modal here lands people on
    // AppKit's Account view with a Disconnect button, which reads as a bug.
    if (await syncFromWagmi()) return true;
    connectInFlight = true;
    markConnectPending();
    appKitModal.open();
    startConnectPoll(120);
    return true;
  }
  return false;
}

/// Switches the AppKit/wagmi session to Robinhood Chain, adding the chain
/// to the wallet first if it doesn't have it. Called exactly where a
/// switch is actually needed: right before a write, or when the person
/// taps the wrong-network badge. Never from a background sync.
async function ensureAppKitChain() {
  if (!(WagmiCoreRef && wagmiConfigRef)) return;
  const account = WagmiCoreRef.getAccount(wagmiConfigRef);
  if (!account.isConnected) {
    // Session lives only in AppKit's store (see syncFromWagmi) — let AppKit
    // do the switch itself.
    if (appKitModal && typeof appKitModal.switchNetwork === "function" && appKitNetwork && Number(state.chainId) !== CONFIG.CHAIN_ID_DECIMAL) {
      await appKitModal.switchNetwork(appKitNetwork);
      state.chainId = CONFIG.CHAIN_ID_DECIMAL;
      if (typeof updateNetworkBadge === "function") updateNetworkBadge();
    }
    return;
  }
  if (account.chainId === CONFIG.CHAIN_ID_DECIMAL) return;
  const addParams = {
    chainId: CONFIG.CHAIN_ID_HEX,
    chainName: CONFIG.CHAIN_NAME,
    rpcUrls: [CONFIG.RPC_URL],
    blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
    nativeCurrency: CONFIG.NATIVE_CURRENCY,
  };
  try {
    await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CONFIG.CHAIN_ID_DECIMAL, addEthereumChainParameter: addParams });
  } catch (err) {
    // Some connectors won't auto-add. Ask the wallet directly through the
    // connector's own provider (works for WalletConnect too), then retry.
    try {
      const provider = account.connector && typeof account.connector.getProvider === "function"
        ? await account.connector.getProvider()
        : (await WagmiCoreRef.getConnectorClient(wagmiConfigRef)).transport;
      await provider.request({ method: "wallet_addEthereumChain", params: [addParams] });
      await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CONFIG.CHAIN_ID_DECIMAL });
    } catch (err2) {
      const e = new Error(
        `Your wallet needs to be on ${CONFIG.CHAIN_NAME}. If it didn't prompt you, open the wallet app and approve the network there — or add it manually: ` +
        `name ${CONFIG.CHAIN_NAME}, chain ID ${CONFIG.CHAIN_ID_DECIMAL}, RPC ${CONFIG.RPC_URL}, symbol ${(CONFIG.NATIVE_CURRENCY && CONFIG.NATIVE_CURRENCY.symbol) || "ETH"}, explorer ${CONFIG.BLOCK_EXPLORER}.`
      );
      e.cause = err2; throw e;
    }
  }
  state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  await syncFromWagmi().catch(() => {}); // fresh signer on the new chain
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
}

/// On a phone connected through WalletConnect, a switch/approve request is
/// only visible inside the wallet app. Bring it to the front using the
/// deep link the wallet published in its own session metadata. Must run
/// synchronously inside a tap handler, or the browser blocks the jump.
function openConnectedWalletApp() {
  try {
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return false;
    const p = state.walletProvider;
    const meta = p && p.session && p.session.peer && p.session.peer.metadata;
    const link = meta && meta.redirect && (meta.redirect.native || meta.redirect.universal);
    if (!link) return false;
    window.location.href = link;
    return true;
  } catch { return false; }
}

/// Sends a contract write DIRECTLY through wagmi's own writeContract
/// action when AppKit is the active connection, instead of routing it
/// through ethers.Contract + ethers.BrowserProvider. That extra ethers-side
/// wrapper does its own internal verification calls (chainId, account)
/// against whatever it's wrapping, and those calls have not survived being
/// layered on top of a WalletConnect-relayed session no matter what
/// transaction fields were pre-supplied ("could not coalesce error",
/// persistent across multiple attempts to fix it from the ethers side).
/// Wagmi's own write path talks to that same session the way it was
/// actually built to be talked to — no extra wrapper in between.
///
/// Returns an ethers-compatible tx handle ({ hash, wait() }) so the rest of
/// the app's code doesn't need to change at all. Returns null if this path
/// isn't available (AppKit not connected, or this CDN build doesn't
/// export writeContract), so the caller falls back to the ethers.Contract
/// approach instead.
async function tryWagmiWrite({ address, abi, functionName, args, value }) {
  if (!(appKitReady && WagmiCoreRef && wagmiConfigRef && typeof WagmiCoreRef.writeContract === "function")) {
    return null;
  }
  await ensureAppKitChain();
  const hash = await WagmiCoreRef.writeContract(wagmiConfigRef, {
    address,
    abi,
    functionName,
    args,
    value,
    // Pinned: if the wallet somehow isn't on 4663 at this point, wagmi
    // throws instead of broadcasting the call on whatever chain it's on.
    chainId: CONFIG.CHAIN_ID_DECIMAL,
  });
  return {
    hash,
    // Waiting for confirmation only needs a plain read-only RPC connection
    // — it doesn't need to go anywhere near the wallet's own connection,
    // so this uses app.js's shared readProvider() instead of anything
    // wagmi/AppKit-related.
    wait: async () => readProvider().waitForTransaction(hash),
  };
}

initAppKit();
