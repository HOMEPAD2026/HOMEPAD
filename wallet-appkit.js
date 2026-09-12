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

// True from the moment the connect modal opens until a session is
// confirmed or the modal closes without one. While it's set, transient
// errors from a half-established session (WalletConnect pairing still
// settling, wallet app not back in the foreground yet) must NOT be treated
// as "stale session, wipe storage" — that exact cleanup, firing mid-handshake
// from the poller, is what killed connection attempts and forced people to
// clear their cache and start over.
let connectInFlight = false;
let connectPoll = null;

// "Disconnect" has to survive a reload. The wallet extension still has the
// site permission (a website can't revoke that), so wagmi's reconnect-on-
// mount would otherwise quietly bring the session straight back and the
// header would say "connected" again — the "it never disconnects" report.
// This flag makes the next load stay disconnected until Connect is clicked.
const USER_DISCONNECTED_KEY = "homepad.walletDisconnected";
const userDisconnected = () => { try { return localStorage.getItem(USER_DISCONNECTED_KEY) === "1"; } catch { return false; } };
function setUserDisconnected(on) { try { on ? localStorage.setItem(USER_DISCONNECTED_KEY, "1") : localStorage.removeItem(USER_DISCONNECTED_KEY); } catch { /* fine */ } }

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
function clearStaleWalletStorage() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (WALLET_STORAGE_PREFIXES.some((p) => key.startsWith(p))) localStorage.removeItem(key);
    }
  } catch (e) { /* storage blocked (private mode etc.) — nothing to clear anyway */ }
}

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
async function syncFromWagmi() {
  if (!WagmiCoreRef || !wagmiConfigRef) return false;
  try {
    const account = WagmiCoreRef.getAccount(wagmiConfigRef);
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
      const browserProvider = new ethers.BrowserProvider(eip1193);
      const changed = state.account !== account.address;
      state.account = account.address;
      state.signer = await browserProvider.getSigner(account.address);
      // This sync is wired to several triggers (watchAccount, AppKit
      // subscribeAccount, modal close, initial load) and they often fire
      // back-to-back for the same account. Only re-render on an ACTUAL
      // change — re-rendering the Profile page 3-4 times in a row started
      // overlapping async loads that overwrote each other's results.
      connectInFlight = false;
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
    if (connectInFlight) {
      // Mid-handshake — the session may simply not be usable yet. Leave
      // storage alone; the poller / next event will try again.
      console.warn("syncFromWagmi: session not usable yet (connect in progress)", err && err.message);
      return false;
    }
    console.warn("syncFromWagmi failed — clearing the stale session so it doesn't repeat.", err);
    try { if (WagmiCoreRef && wagmiConfigRef) await WagmiCoreRef.disconnect(wagmiConfigRef); } catch { /* already broken; storage sweep below covers it */ }
    clearStaleWalletStorage();
    if (state.account) {
      state.account = null;
      state.signer = null;
      if (typeof renderHeader === "function") renderHeader();
    }
    return false;
  }
}

async function initAppKit() {
  if (!CONFIG.REOWN_PROJECT_ID) return; // no project ID configured yet — see config.js

  try {
    const appkitCdn = await import("https://cdn.jsdelivr.net/npm/@reown/appkit-cdn@1.4.1/dist/appkit.min.js");
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

    const wagmiAdapter = new WagmiAdapter({
      projectId: CONFIG.REOWN_PROJECT_ID,
      networks: [robinhoodNetwork],
    });
    wagmiConfigRef = wagmiAdapter.wagmiConfig;

    appKitModal = createAppKit({
      adapters: [wagmiAdapter],
      networks: [robinhoodNetwork],
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
      metadata: {
        name: "HOMEPAD",
        description: "A permissionless launchpad on Robinhood Chain, built by $HOME.",
        url: location.origin,
        icons: [location.origin + "/images/gallery-mark.png"],
      },
      // Wallets only — no email/social login. This is a crypto-native
      // launchpad; an email-created custodial-ish wallet isn't the flow
      // we want people landing in by default.
      features: {
        email: false,
        socials: false,
      },
    });

    // Register every plausible "something changed" hook defensively — if a
    // given method doesn't exist or throws on this build, that's caught
    // and the others (plus the poller in tryOpenAppKit) still cover it.
    try { WagmiCoreRef.watchAccount(wagmiConfigRef, { onChange: syncFromWagmi }); } catch (e) { console.warn("watchAccount unavailable", e); }
    try { appKitModal.subscribeAccount && appKitModal.subscribeAccount(syncFromWagmi); } catch (e) { console.warn("subscribeAccount unavailable", e); }
    try {
      appKitModal.subscribeState && appKitModal.subscribeState((s) => {
        if (s.open) return;
        // One last check, then stop treating errors as "still connecting".
        syncFromWagmi().finally(() => {
          setTimeout(() => {
            const a = WagmiCoreRef.getAccount(wagmiConfigRef);
            if (!a.isConnected) { connectInFlight = false; if (connectPoll) { clearInterval(connectPoll); connectPoll = null; } }
          }, 1500);
        });
      });
    } catch (e) { console.warn("subscribeState unavailable", e); }

    // In case a session is already restored on load. Timeout-guarded
    // separately from syncFromWagmi's own error handling above, since a
    // HUNG reconnect (relay never responds, rather than responding with
    // an error) wouldn't hit that catch block at all.
    if (userDisconnected()) {
      // They pressed Disconnect last time. Wagmi will have reconnected on
      // mount anyway (the extension still allows it) — undo that quietly.
      try { await WagmiCoreRef.disconnect(wagmiConfigRef); } catch { /* fine */ }
      clearStaleWalletStorage();
    }
    const restored = userDisconnected() ? false : await withTimeout(syncFromWagmi(), 8000);
    if (restored === "timeout") {
      console.warn("Wallet session restore timed out — treating as disconnected and clearing it.");
      try { await WagmiCoreRef.disconnect(wagmiConfigRef); } catch { /* storage sweep below covers it */ }
      clearStaleWalletStorage();
    }
    appKitReady = true;
  } catch (err) {
    console.warn("Reown AppKit failed to load — falling back to the basic wallet connect button.", err);
    appKitReady = false;
  }
}

/// Called by app.js's connect button instead of its own basic flow, when
/// AppKit is available. Returns true if it handled the click, false if the
/// caller should fall back to its own logic.
function tryOpenAppKit() {
  if (appKitReady && appKitModal) {
    setUserDisconnected(false);
    connectInFlight = true;
    appKitModal.open();

    // Guaranteed fallback: poll for a connected account for a short window
    // after the modal opens, independent of whether any event listener
    // above actually fires on this build. Stops as soon as connected, when
    // the modal closes, or after ~40s (someone might sit on a QR a while).
    if (connectPoll) clearInterval(connectPoll);
    let ticks = 0;
    connectPoll = setInterval(async () => {
      ticks++;
      const connected = await syncFromWagmi();
      if (connected || ticks > 30) { clearInterval(connectPoll); connectPoll = null; if (!connected) connectInFlight = false; }
    }, 1300);

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
  if (!account.isConnected || account.chainId === CONFIG.CHAIN_ID_DECIMAL) return;
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
        `name ${CONFIG.CHAIN_NAME}, chain ID ${CONFIG.CHAIN_ID_DECIMAL}, RPC ${CONFIG.RPC_URL}, symbol ETH, explorer ${CONFIG.BLOCK_EXPLORER}.`
      );
      e.cause = err2; throw e;
    }
  }
  state.chainId = CONFIG.CHAIN_ID_DECIMAL;
  if (typeof updateNetworkBadge === "function") updateNetworkBadge();
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
