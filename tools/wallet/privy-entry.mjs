// tools/wallet/privy-entry.mjs — the ARCIRCLE Wallet core: Privy (email · Google · Apple · X → an embedded wallet), built by
// tools/build-wallet.mjs into wallet-privy.bundle.js and loaded on demand by wallet-arc.js. It renders nothing of its
// own except Privy's dialogs (login, transaction confirmation, key export); the site's pages talk to it through
// window.__arcPrivy: { ready, authenticated, address, email, login(), logout(), exportWallet(), provider() }.
// Keys never touch arcircle.app: Privy keeps the embedded wallet's key split and isolated (its own iframe and
// servers), and the user can export it to any wallet at any time.
import { createElement as h, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, useWallets, useLogin } from "@privy-io/react-auth";

const ARC = { id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } }, blockExplorers: { default: { name: "Arcscan", url: "https://arc.etherscan.io" } } };
const RH = { id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } }, blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } };

const P = (window.__arcPrivy = window.__arcPrivy || {});
const emit = () => { try { window.dispatchEvent(new CustomEvent("arcprivy:change")); } catch (e) { /* old browsers */ } };
let waiters = [];

function Bridge() {
  const { ready, authenticated, user, logout, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { login } = useLogin({
    onComplete: () => { waiters.forEach((w) => w.ok(true)); waiters = []; },
    onError: (e) => { waiters.forEach((w) => w.no(new Error(String(e || "login cancelled")))); waiters = []; },
  });
  const last = useRef("");
  useEffect(() => {
    const w = (wallets || []).find((x) => x.walletClientType === "privy") || null;
    // what the page shows as "signed in with": the email, or @handle for X
    const email = (user && (user.email && user.email.address)) || (user && user.google && user.google.email) || (user && user.apple && user.apple.email) || (user && user.twitter && user.twitter.username ? "@" + user.twitter.username : "") || "";
    Object.assign(P, {
      ready, authenticated: !!(ready && authenticated), address: w ? String(w.address).toLowerCase() : "", email,
      method: user && user.google ? "google" : user && user.apple ? "apple" : user && user.twitter ? "x" : user && user.email ? "email" : "",
      login: () => new Promise((ok, no) => { if (authenticated) return ok(true); waiters.push({ ok, no }); login(); }),
      logout: () => logout(),
      exportWallet: () => (w ? exportWallet({ address: w.address }) : Promise.reject(new Error("no wallet"))),
      provider: () => (w ? w.getEthereumProvider() : Promise.resolve(null)),
      switchChain: (id) => (w ? w.switchChain(id) : Promise.resolve()),
    });
    const sig = [ready, P.authenticated, P.address, email].join("|");
    if (sig !== last.current) { last.current = sig; emit(); }
  }, [ready, authenticated, user, wallets]);
  return null;
}

export function mount(appId) {
  if (P.mounted) return;
  P.mounted = true;
  const el = document.createElement("div");
  el.id = "arc-privy-root";
  document.body.appendChild(el);
  createRoot(el).render(h(PrivyProvider, {
    appId,
    config: {
      loginMethods: ["email", "google", "apple", "twitter"],
      appearance: { theme: "dark", accentColor: "#1fe0a6", logo: "https://www.arcircle.app/images/apple-touch-icon.png", landingHeader: "ARCIRCLE Wallet", showWalletLoginFirst: false, walletChainType: "ethereum-only" },
      embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
      defaultChain: ARC,
      supportedChains: [ARC, RH],
    },
  }, h(Bridge)));
}
window.__arcPrivyMount = mount;
