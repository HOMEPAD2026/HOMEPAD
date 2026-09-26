// api/_scan-core.mjs — the Token Scanner engine, shared by the browser and the
// server so a token gets the same checks and the same score everywhere:
//   • arcpad.html#scanner (arc-scanner.js) — tools/build-bundles.mjs turns this
//     file into scan-core.js (window.ArcScanCore) for the ArcPad bundle
//   • the Telegram /scan command and the X share card (api/_scan.mjs)
// Pure JavaScript, no imports. Every read goes through the `io` the caller
// passes in:  io.rpc(method, params) → result (throws on an RPC error),
//             io.fetchJson(url, ms) → parsed JSON or null,
//             io.keccak(hex) → 0x-prefixed keccak-256 of the bytes.
// Amounts travel as decimal strings (BigInt inside), so results are plain JSON.

export const CORE_VERSION = 3;

// ---------------------------------------------------------------- addresses
export const ADDR = {
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  arclock: "0x64f893947fe2c4fe7058cfba899ea269cba9f006",
  arcpadFactory: "0x0ebd6df354056ff469f17f8fd14dc0d2c87bd65e",
  arcpadHook: "0x484d416e73eb44d276ddef04cdbadf2f4907c044",
  arcpadRouter: "0xfca8fd788d44bb335b1451257366e06d67114785",
  circleEscrow: "0xc5998d7ce728fdd6f77217fde775aab90ec61703",
  arcircle: "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7",
  usdc: "0x3600000000000000000000000000000000000000",
  argusPortals: ["0xb021be536808f551b31789422fd28a6c9c6e97da", "0xa5628a11c412596e1f63b75a2c0284f843c549d6", "0x07a688a001f416cc433c68ff56aa26bc5131cc6e",
    "0xa36c443a797771df82533b8b4a86f0affd970862", "0x7a17ab0106c46c0be30623f3eb7f299cc0058338"],
  uniRouter: "0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1",
  uniPositions: "0x6049c9a0e26405c0985f9e3685c87d0ae917f82b",
};
export const BURN = ["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead", "0xdead000000000000000042069420694206942069"];
/// Addresses that aren't "people": left out of holder concentration.
export function labelOf(a, extra) {
  const k = String(a || "").toLowerCase();
  if (BURN.includes(k)) return { name: "Burned", kind: "burn" };
  if (k === ADDR.poolManager) return { name: "Uniswap v4 pools", kind: "pool" };
  if (k === ADDR.uniPositions) return { name: "Uniswap positions", kind: "pool" };
  if (k === ADDR.arclock) return { name: "ArcLock (locked)", kind: "lock" };
  if (k === ADDR.arcpadFactory || k === ADDR.arcpadHook || k === ADDR.arcpadRouter) return { name: "ArcPad", kind: "infra" };
  if (k === ADDR.circleEscrow) return { name: "CirclePad escrow", kind: "infra" };
  if (k === ADDR.uniRouter) return { name: "Uniswap router", kind: "infra" };
  if (ADDR.argusPortals.includes(k)) return { name: "Argus", kind: "infra" };
  if (extra && extra[k]) return extra[k];
  return null;
}

// ---------------------------------------------------------------- hex helpers
const strip = (h) => String(h || "").replace(/^0x/, "");
const pad = (h) => strip(h).toLowerCase().padStart(64, "0");
const word = (hex, i) => strip(hex).slice(i * 64, (i + 1) * 64);
const wBig = (hex, i) => { const w = word(hex, i); return w ? BigInt("0x" + w) : 0n; };
const wAddr = (hex, i) => "0x" + word(hex, i).slice(24).toLowerCase();
function utf8(hexBytes) {
  const arr = new Uint8Array(hexBytes.length / 2);
  for (let k = 0; k < arr.length; k++) arr[k] = parseInt(hexBytes.slice(k * 2, k * 2 + 2), 16);
  try { return new TextDecoder().decode(arr).replace(/\u0000+$/, ""); } catch { return ""; }
}
/// ABI string (dynamic) at head word i, or a bytes32 string (old tokens).
function wString(hex, i) {
  const h = strip(hex);
  const off = Number(BigInt("0x" + word(h, i))) * 2;
  const len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2;
  return utf8(h.slice(off + 64, off + 64 + len));
}
function decodeString(hex) {
  const h = strip(hex);
  if (!h) return null;
  try { if (h.length >= 128) return wString(h, 0); } catch { /* fall through */ }
  if (h.length === 64) return utf8(h);
  return null;
}
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
export const toBig = (v) => { try { return BigInt(v || 0); } catch { return 0n; } };
/// raw units → Number (good enough for display and percentages)
export function units(raw, dec) {
  const v = toBig(raw), d = BigInt(dec == null ? 18 : dec);
  const base = 10n ** d;
  return Number(v / base) + Number(v % base) / Number(base);
}

// ---------------------------------------------------------------- formatting
export function compact(n) {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 6 : 2 });
}
export function usd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1) return "$" + compact(n);
  if (n === 0) return "$0";
  return "$" + tinyNum(n);
}
/// 0.00004697 → "0.0₄4697" (the zeros after the point, as a subscript count)
export function tinyNum(n) {
  if (!(n > 0) || n >= 0.001) return Number(n.toPrecision(4)).toString();
  const s = n.toExponential(3); // "4.697e-5"
  const [m, e] = s.split("e");
  const zeros = -Number(e) - 1;
  const digits = m.replace(".", "").replace(/0+$/, "");
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");
  return `0.0${sub}${digits}`;
}
export function pct(p) {
  if (p == null || !isFinite(p)) return "—";
  const t = p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(p >= 0.01 ? 3 : 4);
  return t.replace(/\.?0+$/, "") + "%";
}
export function ageText(sec) {
  if (sec == null || !isFinite(sec)) return "—";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}
export const short = (a) => (a ? `${String(a).slice(0, 6)}…${String(a).slice(-4)}` : "—");
const cap1 = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

// ---------------------------------------------------------------- privileged functions
// Found by their selectors in the contract's dispatcher (PUSH4 constants).
// sev: how bad it is while someone still holds the keys.
export const POWERS = [
  { key: "mint", sev: "high", title: "Can mint new tokens", why: "More supply can be created at any time, diluting every holder.", sels: ["40c10f19", "a0712d68", "449a52f8", "cc872b66", "94d008ef"] },
  { key: "pause", sev: "high", title: "Can pause transfers", why: "Trading and transfers can be frozen.", sels: ["8456cb59", "16c38b3c", "62a5af3b", "bedb86fb"] },
  { key: "block", sev: "high", title: "Can block wallets", why: "Specific wallets can be stopped from selling or moving tokens.",
    sels: ["f9f92be4", "44337ea1", "153b0d1e", "455a4396", "9cfe42da", "342aa8b5", "9c0db5f3", "d34628cc", "00b8cf2a", "d01dd6d2", "9155e083", "f26c159f"] },
  { key: "upgrade", sev: "high", title: "Code can be upgraded", why: "The contract's logic can be replaced with different code.", sels: ["3659cfe6", "4f1ef286", "17a68dd8"] },
  { key: "fees", sev: "med", title: "Can change buy/sell fees", why: "The tax on trades can be raised after you buy.",
    sels: ["69fe0e2d", "0b78f9c0", "c647b20e", "0cc835a3", "8b4cee08", "c4081a4c", "6db79437", "dc1052e2", "8cd09d50", "59acbe4e", "cec10c11", "8095d564", "c17b5b8c", "2e5bb6ff", "7ce3489b"] },
  { key: "limits", sev: "med", title: "Can cap trade or wallet size", why: "Limits can be set so that larger sells don't go through.", sels: ["ec28438a", "ea1644d5", "5d0044ca", "1e293c10", "d543dbeb", "203e727e", "c18bc195", "e99c9d09"] },
  { key: "trading", sev: "med", title: "Trading can be switched off", why: "The owner controls whether the token can be traded.", sels: ["c2e5ec04", "8f70ccf7", "0d295980", "21c03a97", "f275f64b", "0f120fc3"] },
  { key: "rescue", sev: "low", title: "Can pull tokens out of the contract", why: "Tokens or USDC held by the contract itself can be withdrawn by the owner.", sels: ["cb963728", "57376198", "364333f4", "8980f11f", "9e281a98", "8cd4426d"] },
];
const SEL = {
  name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567", totalSupply: "0x18160ddd", balanceOf: "0x70a08231",
  owner: "0x8da5cb5b", getOwner: "0x893d20e8", hasRole: "91d14854",
  launchIndexOf: "0x08b74625", launchAt: "0x7b443a76", argusLaunches: "0x1f2d8550", locksOfToken: "0x01c92e99", probe: "0xdd8e5ec9",
};
const SLOT = {
  impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};
export function selectorsOf(code) {
  const out = new Set();
  const h = strip(code);
  for (let i = 0; i < h.length; i += 2) {
    const op = parseInt(h.substr(i, 2), 16);
    if (op === 0x63) { out.add(h.substr(i + 2, 8)); i += 8; }
    else if (op >= 0x60 && op <= 0x7f) i += (op - 0x5f) * 2;
  }
  return out;
}
const slotAddr = (v) => { const x = pad(v).slice(24); return /^0{40}$/.test(x) ? null : "0x" + x; };

// ---------------------------------------------------------------- reads
async function call(io, to, data) {
  try { const r = await io.rpc("eth_call", [{ to, data }, "latest"]); return r && r !== "0x" ? r : null; } catch { return null; }
}
async function code(io, a) { try { return await io.rpc("eth_getCode", [a, "latest"]); } catch { return null; } }

/// Contract basics, owner, proxy slots and which powers its code exposes.
export async function readContract(io, addr) {
  addr = String(addr).toLowerCase();
  const c0 = await io.rpc("eth_getCode", [addr, "latest"]); // throws when the RPC is down: the caller says so
  if (!c0 || c0 === "0x") return { contract: false };
  const [nameH, symH, decH, supH, ownH, own2H, impl, admin, beacon] = await Promise.all([
    call(io, addr, SEL.name), call(io, addr, SEL.symbol), call(io, addr, SEL.decimals), call(io, addr, SEL.totalSupply),
    call(io, addr, SEL.owner), call(io, addr, SEL.getOwner),
    io.rpc("eth_getStorageAt", [addr, SLOT.impl, "latest"]).catch(() => null),
    io.rpc("eth_getStorageAt", [addr, SLOT.admin, "latest"]).catch(() => null),
    io.rpc("eth_getStorageAt", [addr, SLOT.beacon, "latest"]).catch(() => null),
  ]);
  const minimal = /^0x363d3d373d3d3d363d73([0-9a-f]{40})/i.exec(c0);
  const implAddr = slotAddr(impl) || (minimal ? "0x" + minimal[1].toLowerCase() : null);
  const sels = selectorsOf(c0);
  if (implAddr) { const ic = await code(io, implAddr); if (ic) selectorsOf(ic).forEach((s) => sels.add(s)); }
  const owner = ownH && strip(ownH).length >= 64 ? wAddr(ownH, 0) : own2H && strip(own2H).length >= 64 ? wAddr(own2H, 0) : null;
  let ownerIsContract = false;
  if (owner && !BURN.includes(owner)) { const oc = await code(io, owner); ownerIsContract = !!(oc && oc !== "0x"); }
  const name = decodeString(nameH), symbol = decodeString(symH);
  const decimals = decH ? Number(wBig(decH, 0)) : null;
  return {
    contract: true, codeSize: strip(c0).length / 2,
    token: name != null && symbol != null && decimals != null && decimals <= 36 && supH != null,
    name: name || "", symbol: symbol || "", decimals, supply: supH ? wBig(supH, 0).toString() : "0",
    owner, hasOwnerFn: sels.has("8da5cb5b") || sels.has("893d20e8") || !!owner, ownerIsContract, roles: sels.has(SEL.hasRole),
    proxy: implAddr ? { impl: implAddr, admin: slotAddr(admin), minimal: !!minimal } : slotAddr(beacon) ? { beacon: slotAddr(beacon) } : null,
    powers: POWERS.filter((p) => p.sels.some((s) => sels.has(s))).map((p) => p.key),
  };
}

/// ArcPad launch record (creator, fee, launch time, links), or null.
export async function readArcPad(io, addr) {
  const idxH = await call(io, ADDR.arcpadFactory, SEL.launchIndexOf + pad(addr));
  const idx = idxH ? Number(wBig(idxH, 0)) : 0;
  if (!idx) return null;
  const rec = await call(io, ADDR.arcpadFactory, SEL.launchAt + pad((idx - 1).toString(16)));
  if (!rec) return { index: idx };
  const s = (i) => { try { return wString(rec, i); } catch { return ""; } };
  return {
    index: idx, quote: wAddr(rec, 1), creator: wAddr(rec, 4), launchedAt: Number(wBig(rec, 5)), extraFeeBps: Number(wBig(rec, 6)),
    imageUrl: s(7), twitter: s(9), telegram: s(10), website: s(12),
  };
}

/// Argus launch record from any of its portals (creator, hook, taxes), or null.
export async function readArgus(io, addr) {
  const r = await Promise.all(ADDR.argusPortals.map((p) => call(io, p, SEL.argusLaunches + pad(addr))));
  for (let i = 0; i < r.length; i++) {
    const h = strip(r[i]);
    if (Math.floor(h.length / 64) < 9) continue;
    const rec = {
      portal: ADDR.argusPortals[i], creator: wAddr(h, 0), hook: wAddr(h, 4), locker: wAddr(h, 3),
      buyTaxBps: Number(wBig(h, 6)), sellTaxBps: Number(wBig(h, 7)),
    };
    if (/^0x0{40}$/.test(rec.creator) || /^0x0{40}$/.test(rec.hook) || rec.buyTaxBps > 1000 || rec.sellTaxBps > 1000) continue;
    return rec;
  }
  return null;
}

/// Active ArcLock locks for the token → { locked, count }.
export async function readLocks(io, addr) {
  const h = strip(await call(io, ADDR.arclock, SEL.locksOfToken + pad(addr)));
  if (!h) return { locked: "0", count: 0 };
  try {
    const outOff = Number(BigInt("0x" + h.slice(64, 128))) * 2;
    const n = Number(BigInt("0x" + h.slice(outOff, outOff + 64)));
    const now = Math.floor(Date.now() / 1000);
    let locked = 0n, count = 0;
    for (let i = 0; i < n && i < 500; i++) {
      const base = outOff + 64 + i * 6 * 64, w = (k) => BigInt("0x" + h.slice(base + k * 64, base + (k + 1) * 64));
      const amount = w(2), unlockAt = Number(w(4)), withdrawn = w(5) !== 0n;
      if (!withdrawn && unlockAt > now) { locked += amount; count++; }
    }
    return { locked: locked.toString(), count };
  } catch { return { locked: "0", count: 0 }; }
}

/// Dexscreener pairs on Arc, deepest first (null if it didn't answer).
export async function readMarket(io, addr) {
  const j = await io.fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, 9000);
  if (!j) return null;
  const pairs = (j.pairs || []).filter((p) => p && p.chainId === "arc").map((p) => {
    const info = p.info || {};
    return {
      dex: (p.dexId === "uniswap" ? "Uniswap" : cap1(p.dexId)) + ((p.labels || []).length ? " " + p.labels.join(" ") : ""),
      url: /^https:\/\//.test(p.url || "") ? p.url : null, pair: p.pairAddress || null,
      base: (p.baseToken && p.baseToken.symbol) || "", quote: (p.quoteToken && p.quoteToken.symbol) || "",
      price: p.priceUsd != null ? Number(p.priceUsd) : null, liq: (p.liquidity && Number(p.liquidity.usd)) || 0,
      mcap: Number(p.marketCap || p.fdv || 0) || null, created: p.pairCreatedAt ? Number(p.pairCreatedAt) / 1000 : null,
      buys: (p.txns && p.txns.h24 && p.txns.h24.buys) || 0, sells: (p.txns && p.txns.h24 && p.txns.h24.sells) || 0,
      vol: (p.volume && p.volume.h24) || 0, change: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null,
      image: /^https:\/\//.test(info.imageUrl || "") ? info.imageUrl : null,
      links: [...(info.websites || []).map((w) => ({ u: w.url, t: w.label || "Website" })), ...(info.socials || []).map((x) => ({ u: x.url, t: cap1(x.type) }))]
        .filter((l) => /^https:\/\//.test(String(l.u || ""))).slice(0, 4),
    };
  }).sort((a, b) => b.liq - a.liq);
  return { source: "dex", pairs };
}

// ---------------------------------------------------------------- transfer simulation
// eth_call with a state override: ScanProbe's code (contracts/contracts/ScanProbe.sol)
// is placed at an address that already holds the token, which then "sends"
// some — so the token sees an ordinary transfer from a real holder.
export const PROBE_CODE = "0x608060405234801561001057600080fd5b506004361061002b5760003560e01c8063dd8e5ec914610030575b600080fd5b61004a600480360381019061004591906103ab565b610063565b60405161005a94939291906104b8565b60405180910390f35b600080600060606000610076883061021a565b90506000610084898961021a565b90506000808a73ffffffffffffffffffffffffffffffffffffffff1663a9059cbb8b8b6040516024016100b8929190610513565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff83818316178352505050506040516101069190610578565b6000604051808303816000865af19150503d8060008114610143576040519150601f19603f3d011682016040523d82523d6000602084013e610148565b606091505b50915091508161016957600080600083975097509750975050505050610211565b602081511015801561018e575060008180602001905181019061018c91906105a4565b145b156101aa57600080600083975097509750975050505050610211565b60006101b68c3061021a565b905060006101c48d8d61021a565b90508186116101d45760006101d8565b8186035b98508481116101e85760006101ec565b8481035b9750600189896040518060200160405280600081525099509950995099505050505050505b93509350935093565b60008060008473ffffffffffffffffffffffffffffffffffffffff166370a082318560405160240161024c91906105d1565b6040516020818303038152906040529060e01b6020820180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff838183161783525050505060405161029a9190610578565b600060405180830381855afa9150503d80600081146102d5576040519150601f19603f3d011682016040523d82523d6000602084013e6102da565b606091505b50915091508180156102ee57506020815110155b1561030a578080602001905181019061030791906105a4565b92505b505092915050565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b600061034282610317565b9050919050565b61035281610337565b811461035d57600080fd5b50565b60008135905061036f81610349565b92915050565b6000819050919050565b61038881610375565b811461039357600080fd5b50565b6000813590506103a58161037f565b92915050565b6000806000606084860312156103c4576103c3610312565b5b60006103d286828701610360565b93505060206103e386828701610360565b92505060406103f486828701610396565b9150509250925092565b60008115159050919050565b610413816103fe565b82525050565b61042281610375565b82525050565b600081519050919050565b600082825260208201905092915050565b60005b83811015610462578082015181840152602081019050610447565b60008484015250505050565b6000601f19601f8301169050919050565b600061048a82610428565b6104948185610433565b93506104a4818560208601610444565b6104ad8161046e565b840191505092915050565b60006080820190506104cd600083018761040a565b6104da6020830186610419565b6104e76040830185610419565b81810360608301526104f9818461047f565b905095945050505050565b61050d81610337565b82525050565b60006040820190506105286000830185610504565b6105356020830184610419565b9392505050565b600081905092915050565b600061055282610428565b61055c818561053c565b935061056c818560208601610444565b80840191505092915050565b60006105848284610547565b915081905092915050565b60008151905061059e8161037f565b92915050565b6000602082840312156105ba576105b9610312565b5b60006105c88482850161058f565b91505092915050565b60006020820190506105e66000830184610504565b9291505056fea2646970667358221220c10762cc00379910ad5b88ebd95bde6d2582f4fc497bb3ae3f9adb35d53e90ec64736f6c634300081a0033";
const FRESH = "0x5ca9000000000000000000000000000000c0ffee";
async function probeLeg(io, token, from, to, amount) {
  const data = SEL.probe + pad(token) + pad(to) + pad(toBig(amount).toString(16));
  let out;
  // io.rpcSim (optional) tries each RPC endpoint in turn: not every node
  // accepts the state-override argument this dry run needs.
  const send = io.rpcSim || io.rpc;
  try { out = await send("eth_call", [{ from, to: from, data, gas: "0x1c9c380" }, "latest", { [from]: { code: PROBE_CODE } }]); }
  catch (e) {
    const m = String((e && (e.message || e.shortMessage)) || e);
    if (/override|unsupported|invalid.*param|not supported|too many arguments|expected 2|unknown field/i.test(m)) return { unsupported: true };
    return { ok: false, reason: m.slice(0, 120) };
  }
  const h = strip(out);
  if (h.length < 4 * 64) return { unsupported: true };
  const ok = wBig(h, 0) !== 0n, sent = wBig(h, 1), received = wBig(h, 2);
  if (!ok) {
    let reason = "";
    try {
      const off = Number(wBig(h, 3)) * 2, len = Number(BigInt("0x" + h.slice(off, off + 64))) * 2, err = h.slice(off + 64, off + 64 + len);
      if (err.startsWith("08c379a0")) reason = wString(err.slice(8), 0);
    } catch { /* no reason */ }
    return { ok: false, reason };
  }
  const tax = sent > 0n ? Number(((sent - received) * 10000n) / sent) / 100 : 0;
  return { ok: true, tax: Math.max(0, tax) };
}
/// → { supported, legs: { buy, sell, send } } — each leg { ok, tax, reason } or null when it couldn't be set up.
export async function simulate(io, token, { holder, holderBal, poolBal, supply }) {
  token = String(token).toLowerCase();
  const out = { supported: true, legs: { buy: null, sell: null, send: null } };
  const tiny = (b) => { const s = toBig(supply), v = toBig(b); let a = v / 10n; const cap = s / 1000n; if (cap > 0n && a > cap) a = cap; return a > 0n ? a : 0n; };
  const jobs = [];
  if (holder && toBig(holderBal) > 0n) {
    const amt = tiny(holderBal);
    jobs.push(probeLeg(io, token, holder, ADDR.poolManager, amt).then((r) => { out.legs.sell = r; }));
    jobs.push(probeLeg(io, token, holder, FRESH, amt).then((r) => { out.legs.send = r; }));
  }
  if (toBig(poolBal) > 0n) {
    const amt = tiny(poolBal);
    jobs.push(probeLeg(io, token, ADDR.poolManager, FRESH, amt).then((r) => { out.legs.buy = r; }));
  }
  await Promise.all(jobs);
  if (Object.values(out.legs).some((l) => l && l.unsupported)) return { supported: false, legs: {} };
  return out;
}

// ---------------------------------------------------------------- scoring
const WEIGHT = { risk: 26, warn: 10, pass: 0, info: 0 };
/// What each check means — the "?" on every row.
export const HELP = {
  token: "A standard token answers name, symbol, decimals and supply the same way wallets and exchanges expect.",
  proxy: "A proxy keeps its logic in another contract that can be swapped. Whoever controls the proxy can change how the token behaves.",
  origin: "Tokens from a known launchpad follow a fixed template, so there is less room for hidden tricks.",
  owner: "The owner can call owner-only functions. Renounced ownership means nobody can any more.",
  roles: "With role-based permissions several wallets can hold admin rights, even without an owner.",
  power: "Found by reading the function list in the contract's code. It shows what the code allows, not whether it has been used.",
  sim: "The scanner pretends to be a real holder and sends a little in a dry run — nothing is signed or spent — to see whether it arrives and how much is taken.",
  fee: "Taxes or fees charged on every trade go to the creator or the platform.",
  pool: "Without a pool with enough money in it you may not be able to sell at a fair price.",
  liq: "Liquidity is how much money sits in the pool. Thin pools move a lot on small trades.",
  age: "New pools have little history, which is when most rug pulls happen.",
  flow: "A token that is bought a lot but never sold is a classic sign that selling is blocked.",
  links: "Legit projects usually list a website and social accounts on Dexscreener.",
  impact: "How far one sell of a fixed size would push the price down. Big moves mean you'd get noticeably less than the price you see.",
  holders: "How many wallets hold the token, and whether a few of them could dump on everyone else.",
  mint: "New tokens minted after launch dilute every holder.",
  history: "Events read from the token's own on-chain history.",
  lplock: "Liquidity that is locked (until a date, or for good) or burned can't be pulled out of the pool. Unlocked liquidity can be removed by whoever holds it — the classic rug pull.",
};
/// data: { c: readContract, x: { arcpad, argus, locks }, m: market (readMarket or { source: "arcpad"|"argus", … }), h: holders (api), sim, now }
export function evaluate(addr, data) {
  addr = String(addr).toLowerCase();
  const { c, x = {}, m = null, h = null, sim = null } = data;
  const now = data.now || Date.now() / 1000;
  const rows = [];
  const add = (group, status, id, title, detail, more) => rows.push({ group, status, id, title, detail, pts: WEIGHT[status] || 0, ...(more || {}) });
  let cap = 100;
  const capAt = (n, why) => { if (n < cap) cap = n; if (why) capWhy.push(why); };
  const capWhy = [];

  if (!c || !c.contract) { add("contract", "risk", "token", "No contract at this address", "Nothing is deployed here on Arc — it isn't a token."); return { rows, score: 0, notToken: true, verdict: verdictOf(0) }; }
  if (!c.token) { add("contract", "risk", "token", "Not a standard token", "It doesn't answer the basic ERC-20 calls (name, symbol, decimals, supply)."); return { rows, score: 0, notToken: true, verdict: verdictOf(0) }; }
  const dec = c.decimals, S = units(c.supply, dec);

  // ---- contract ----
  add("contract", "pass", "token", "Standard ERC-20 token", `${c.name} ($${c.symbol}) · ${dec} decimals · ${compact(S)} supply`);
  if (c.proxy) add("contract", "warn", "proxy", "Upgradeable proxy", c.proxy.beacon ? "Its code lives behind a beacon and can be switched to new code." : `Its code lives at ${short(c.proxy.impl)} and can be pointed at new code${c.proxy.admin ? " by the proxy admin" : ""}.`);
  else add("contract", "pass", "proxy", "Fixed code", "Not a proxy — the code you see can't be swapped out.");
  const isArc = addr === ADDR.arcircle;
  if (isArc) add("contract", "pass", "origin", "ARCIRCLE PAD core coin", "$ARCIRCLE, launched on Argus — one pool, supply in a single locked position.");
  else if (x.arcpad) add("contract", "pass", "origin", "Launched on ArcPad", "The standard ArcPad token, launched through the ArcPad factory with its pool created in the same transaction.");
  else if (x.argus) add("contract", "pass", "origin", "Launched on Argus", "Launched through an Argus portal: a Uniswap v4 pool with the supply in one locked position.");
  else add("contract", "info", "origin", "Not a launchpad token", "Not launched through ArcPad or Argus, so every check below is the generic one.");

  // ---- control ----
  const renounced = c.owner != null && BURN.includes(String(c.owner).toLowerCase());
  const controlled = (c.owner != null && !renounced) || c.roles;
  if (!c.hasOwnerFn && !c.roles) add("control", "pass", "owner", "No owner", "The contract has no owner function — there's no admin wallet to call anything.");
  else if (renounced) add("control", "pass", "owner", "Ownership renounced", "The owner is the zero/dead address, so owner-only functions can't be called.");
  else if (c.owner) add("control", c.ownerIsContract ? "info" : "warn", "owner", c.ownerIsContract ? "Owned by a contract" : "Owned by a wallet",
    c.ownerIsContract ? "Often a multisig or timelock — check who controls it." : "One wallet can still call owner-only functions.", { addr: c.owner, pre: "Owner:" });
  if (c.roles) add("control", "warn", "roles", "Role-based permissions", "Access is managed with roles (AccessControl) — admins may hold mint or pause rights.");
  const found = POWERS.filter((p) => c.powers.includes(p.key));
  if (!found.length) add("control", "pass", "power", "No dangerous switches found", "No mint, pause, blacklist, fee or trading switches in its code.");
  found.forEach((p) => {
    const code = { href: "#code", label: "Read the code" };
    if (!controlled) add("control", "info", "power", p.title, p.why, { note: "Nobody holds the keys any more, so it can't be used.", est: true, code });
    else add("control", p.sev === "high" ? "risk" : p.sev === "med" ? "warn" : "info", "power", p.title, p.why, { est: true, code });
  });
  if (controlled && c.powers.includes("mint")) capAt(55, "mint");

  // ---- trading: simulation + launchpad fees ----
  if (sim && sim.supported) {
    const L = sim.legs || {};
    const legRow = (leg, name, verb) => {
      if (!leg) return;
      if (!leg.ok) { add("trade", "risk", "sim", `${name} fails`, `A dry-run ${verb} was refused${leg.reason ? ` ("${String(leg.reason).slice(0, 60)}")` : ""}.`); if (name === "Selling") capAt(20, "sell"); return; }
      if (leg.tax >= 25) { add("trade", "risk", "sim", `Very high ${verb} tax`, `${pct(leg.tax)} of a dry-run ${verb} never arrived.`); capAt(40, "tax"); }
      else if (leg.tax >= 10) add("trade", "warn", "sim", `High ${verb} tax`, `${pct(leg.tax)} of a dry-run ${verb} never arrived.`);
      else if (leg.tax > 0.01) add("trade", "info", "sim", `${cap1(verb)} tax ${pct(leg.tax)}`, `A dry-run ${verb} arrived minus ${pct(leg.tax)}.`);
      else add("trade", "pass", "sim", `${name} works`, `A dry-run ${verb} went through with nothing taken.`);
    };
    legRow(L.sell, "Selling", "sell");
    legRow(L.buy, "Buying", "buy");
    legRow(L.send, "Sending", "transfer");
    if (!L.sell && !L.buy && !L.send) add("trade", "info", "sim", "No trade simulation", "There was no holder the dry run could act as.");
  } else if (sim && !sim.supported) add("trade", "info", "sim", "Trade simulation unavailable", "The Arc RPC didn't accept the dry run, so buying and selling weren't simulated.");
  if (x.arcpad && x.arcpad.extraFeeBps != null) {
    const total = 1 + x.arcpad.extraFeeBps / 100;
    add("trade", total > 5 ? "warn" : "pass", "fee", `Trade fee ${pct(total)}`, `ArcPad's 1% pool fee${x.arcpad.extraFeeBps ? ` + ${pct(x.arcpad.extraFeeBps / 100)} to the creator` : ""}, taken on every buy and sell.`);
  }
  if (x.argus) {
    const b = x.argus.buyTaxBps / 100, s = x.argus.sellTaxBps / 100;
    const worst = Math.max(b, s);
    add("trade", worst > 10 ? "warn" : "pass", "fee", b === s ? `Trade tax ${pct(b)}` : `Tax ${pct(b)} buy · ${pct(s)} sell`,
      `Set by Argus at launch and fixed in its pool hook${isArc ? "; 90% of it goes to the creator" : ""}.`, { addr: x.argus.hook, pre: "Hook:" });
  }

  // ---- market ----
  let market = null;
  const pair = m && m.pairs && m.pairs[0];
  if (pair) {
    market = { ...pair, count: m.pairs.length, source: "dex" };
    add("market", "pass", "pool", `Trades on ${pair.dex}`, `${m.pairs.length > 1 ? `${m.pairs.length} pools; the deepest is ` : ""}${pair.base}/${pair.quote}`, pair.url ? { links: [{ href: pair.url, label: "Dexscreener" }] } : null);
    if (pair.liq < 1000) { add("market", "risk", "liq", "Very little liquidity", `${usd(pair.liq)} in the pool — even small sells will move the price a lot.`); capAt(50, "liq"); }
    else if (pair.liq < 10000) add("market", "warn", "liq", "Thin liquidity", `${usd(pair.liq)} in the pool — larger trades will move the price noticeably.`);
    else add("market", "pass", "liq", "Healthy liquidity", `${usd(pair.liq)} in the pool.`);
    if (pair.mcap && pair.liq > 0 && pair.liq / pair.mcap < 0.02) add("market", "warn", "liq", "Small pool for its size", `Liquidity is only ${pct((pair.liq / pair.mcap) * 100)} of the market cap.`);
    if (pair.liq > 0) {
      // x·y = k estimate from the pool's USD depth: selling $1,000 moves the spot price by 1 − (Q / (Q + 1000))²
      const Q = pair.liq / 2, move = (1 - Math.pow(Q / (Q + 1000), 2)) * 100;
      add("market", "info", "impact", `Selling $1,000 moves the price about ${pct(move)}`, "An estimate from the pool's depth on Dexscreener; concentrated pools can differ.");
    }
    const age = pair.created ? now - pair.created : null;
    if (age != null) {
      if (age < 86400) add("market", "warn", "age", "Brand new pool", `Created ${ageText(age)} ago — there's little history to judge it by.`);
      else if (age < 7 * 86400) add("market", "info", "age", "Young pool", `Created ${ageText(age)} ago.`);
      else add("market", "pass", "age", "Established pool", `Trading for ${ageText(age)}.`);
    }
    const b = pair.buys, s = pair.sells;
    if (b >= 15 && s === 0) { add("market", "risk", "flow", "Buys but no sells", `${b} buys and no sells in 24h — people may not be able to sell.`); capAt(25, "flow"); }
    else if (b > 30 && s / Math.max(1, b) < 0.12) add("market", "warn", "flow", "Very few sells", `${b} buys vs ${s} sells in 24h — worth a closer look before buying.`);
    else if (b + s > 0) add("market", "pass", "flow", "People buy and sell", `${b} buys · ${s} sells in the last 24h.`);
    else add("market", "info", "flow", "No trades in 24h", "Nobody has traded it in the last day.");
    if (pair.links && pair.links.length) add("market", "pass", "links", "Website and socials listed", "", { links: pair.links.map((l) => ({ href: l.u, label: l.t })) });
    else add("market", "info", "links", "No website or socials listed", "Its Dexscreener page lists no website or social accounts.");
  } else if (m && (m.source === "arcpad" || m.source === "argus")) {
    // Not on Dexscreener (yet): the launchpad's own pool is read from the chain.
    market = { ...m, source: m.source };
    add("market", "pass", "pool", m.source === "arcpad" ? "Trades in its ArcPad pool" : "Trades in its Argus pool",
      `A Uniswap v4 pool created at launch${m.source === "arcpad" ? ", its liquidity locked for good" : ""} — read from the chain because Dexscreener hasn't listed it yet.`);
    if (m.created) {
      const age = now - m.created;
      add("market", age < 86400 ? "warn" : age < 7 * 86400 ? "info" : "pass", "age", age < 86400 ? "Brand new pool" : age < 7 * 86400 ? "Young pool" : "Established pool",
        age < 86400 ? `Created ${ageText(age)} ago — there's little history to judge it by.` : age < 7 * 86400 ? `Created ${ageText(age)} ago.` : `Trading for ${ageText(age)}.`);
    }
    const links = (m.links || []).filter((l) => /^https:\/\//.test(l.u || ""));
    if (links.length) add("market", "pass", "links", "Website and socials listed", "", { links: links.map((l) => ({ href: l.u, label: l.t })) });
  } else if (!m) add("market", "info", "pool", "Market data unavailable", "Dexscreener didn't answer — try the scan again in a moment.");
  else { add("market", "risk", "pool", "No trading pool found", "Dexscreener doesn't list a pool for it on Arc, so there may be no way to buy or sell."); capAt(40, "pool"); }

  // ---- liquidity lock (the Liquidity Manager's read of the pool's positions) ----
  const lp = data.lp || null;
  if (lp) {
    const safe = Math.min(100, (lp.locked || 0) + (lp.burned || 0));
    const link = { links: [{ href: `/arc#liquidity?token=${addr}`, label: "Liquidity Manager" }] };
    const soonLeft = lp.soonest && !lp.forever ? lp.soonest - now : null;
    if (safe >= 80 && soonLeft != null && soonLeft < 7 * 86400) add("market", "warn", "lplock", "Liquidity lock ends soon", `${pct(safe)} of the liquidity at the current price is locked or burned, but a lock on it ends in ${ageText(Math.max(60, soonLeft))}.`, link);
    else if (safe >= 80) add("market", "pass", "lplock", "Liquidity locked", `${pct(safe)} of the liquidity at the current price is locked or burned${soonLeft != null ? ` — the earliest lock ends in ${ageText(soonLeft)}` : ""}.`, link);
    else if (safe >= 40) add("market", "warn", "lplock", "Liquidity partly locked", `${pct(safe)} of the liquidity at the current price is locked or burned — whoever holds the rest can pull it.`, link);
    else add("market", "risk", "lplock", "Liquidity can be pulled", `Only ${pct(safe)} of the liquidity at the current price is locked or burned — whoever holds the rest can remove it at any time.`, link);
  }

  // ---- holders ----
  let dist = null;
  const supply = toBig(c.supply);
  if (supply === 0n) { add("holders", "warn", "holders", "No supply yet", "Its total supply is zero — nothing has been minted."); capAt(50); }
  else if (!h) add("holders", "info", "holders", "Holder data unavailable", "The holder scan didn't finish — try again in a moment.");
  else {
    const n = (v) => units(v, dec);
    let inPool = 0, burned = 0, infra = 0, lockedIn = 0;
    const people = [];
    for (const row of h.top || []) {
      const [a, v, flags] = row;
      const k = labelOf(a), amt = n(v);
      if (k && k.kind === "pool") inPool += amt;
      else if (k && k.kind === "burn") burned += amt;
      else if (k && k.kind === "lock") lockedIn += amt;
      else if (k) infra += amt;
      else people.push({ a, v: amt, contract: !!(flags && flags.c), deployer: h.deployer && String(a).toLowerCase() === String(h.deployer).toLowerCase() });
    }
    const locked = x.locks && x.locks.count ? n(x.locks.locked) : lockedIn;
    const top10 = people.slice(0, 10).reduce((t, p) => t + p.v, 0);
    const biggest = people[0] || null;
    dist = { S, inPool, burned, locked, infra, top10, people: people.slice(0, 10), holders: h.holderCount, exact: h.holderCountExact, complete: h.complete, fromTs: h.fromTs, deployer: h.deployer || null, firstMint: h.firstMint || null };
    const cnt = h.holderCount || 0;
    const cntTxt = `${h.holderCountExact ? "" : "at least "}${cnt.toLocaleString("en-US")}`;
    add("holders", cnt < 25 ? "warn" : "pass", "holders", cnt < 25 ? "Few holders" : "Holder count", `${cntTxt} wallets hold it.`);
    const t10 = (top10 / S) * 100, big = biggest ? (biggest.v / S) * 100 : 0;
    if (t10 > 50) { add("holders", "risk", "holders", "Top 10 wallets hold most of it", `${pct(t10)} of the supply sits in 10 wallets (pool, burned and locked tokens left out).`); capAt(55, "holders"); }
    else if (t10 > 30) add("holders", "warn", "holders", "Top 10 wallets hold a lot", `${pct(t10)} of the supply sits in 10 wallets (pool, burned and locked left out).`);
    else add("holders", "pass", "holders", "Supply is spread out", `The top 10 wallets hold ${pct(t10)} (pool, burned and locked left out).`);
    if (biggest) {
      if (big > 20) add("holders", "risk", "holders", "One wallet holds a big share", `holds ${pct(big)} of the supply.`, { addr: biggest.a });
      else if (big > 10) add("holders", "warn", "holders", "Largest wallet over 10%", `holds ${pct(big)} of the supply.`, { addr: biggest.a });
      else add("holders", "pass", "holders", "No whale over 10%", `holds ${pct(big)} — the largest single wallet.`, { addr: biggest.a });
    }
    if (h.deployer) {
      const d = people.find((p) => p.deployer);
      const dp = d ? (d.v / S) * 100 : 0;
      add("holders", dp > 20 ? "warn" : "info", "holders", dp > 0.01 ? "Deployer still holds tokens" : "Deployer holds none", dp > 0.01 ? `holds ${pct(dp)} — the wallet that created the token.` : "The wallet that created the token has passed on everything it minted.", { addr: h.deployer });
    }
    if (burned > 0) add("holders", "pass", "holders", "Tokens burned", `${pct((burned / S) * 100)} of the supply sits in burn addresses.`);
    if (locked > 0) add("holders", "pass", "holders", "Tokens locked", `${pct((locked / S) * 100)} is locked in ArcLock${x.locks && x.locks.count ? ` (${x.locks.count} lock${x.locks.count === 1 ? "" : "s"})` : ""}.`, { links: [{ href: `/arc#locker?token=${addr}`, label: "See locks", internal: true }] });
    if (inPool > 0) add("holders", "info", "holders", "In the trading pool", `${pct((inPool / S) * 100)} of the supply is liquidity in Uniswap v4 pools.`);
    if (!h.complete) add("holders", "info", "holders", "Partial history", `The holder list covers transfers since ${h.fromTs ? new Date(h.fromTs * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "recently"}; balances shown are live.`);
    // ---- history (events from the token itself) ----
    const ev = h.events || [];
    const later = ev.filter((e) => e.k === "mint" && h.firstMint && e.b > h.firstMint.block);
    if (later.length) {
      const extraMint = later.reduce((t, e) => t + units(e.v, dec), 0);
      add("history", controlled ? "risk" : "warn", "mint", "Minted after launch", `${later.length} later mint${later.length === 1 ? "" : "s"} added ${compact(extraMint)} tokens (${pct((extraMint / S) * 100)} of today's supply).`);
    } else if (h.complete && h.firstMint) add("history", "pass", "mint", "No mints after launch", "Every token that exists was minted when it was created.");
    const own = ev.filter((e) => e.k === "owner");
    const ren = own.find((e) => BURN.includes(String(e.to || "").toLowerCase()));
    if (ren) add("history", "pass", "history", "Renounced on-chain", `Ownership went to the zero address${ren.ts ? " on " + new Date(ren.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}.`);
    else if (own.length > 1) add("history", "info", "history", "Ownership changed hands", `${own.length - 1} ownership transfer${own.length - 1 === 1 ? "" : "s"} since it was created.`);
    const pauses = ev.filter((e) => e.k === "pause");
    if (pauses.length) add("history", "warn", "history", "Has been paused before", `Transfers were paused ${pauses.length} time${pauses.length === 1 ? "" : "s"}.`);
    const ups = ev.filter((e) => e.k === "upgrade");
    if (ups.length > 1) add("history", "warn", "history", "Code was upgraded", `Its implementation changed ${ups.length - 1} time${ups.length - 1 === 1 ? "" : "s"}.`);
  }

  let score = 100;
  rows.forEach((r) => { score -= r.pts; });
  score = Math.max(0, Math.min(cap, score));
  const order = { risk: 0, warn: 1, info: 2, pass: 3 };
  const reasons = rows.filter((r) => r.status === "risk" || r.status === "warn").sort((a, b) => order[a.status] - order[b.status] || b.pts - a.pts).slice(0, 3).map((r) => ({ status: r.status, title: r.title }));
  if (!reasons.length) rows.filter((r) => r.status === "pass" && ["origin", "owner", "sim", "liq", "holders"].includes(r.id)).slice(0, 3).forEach((r) => reasons.push({ status: "pass", title: r.title }));
  return { rows, score, cap, verdict: verdictOf(score), reasons, market, dist, timeline: h && h.events ? h.events : [], version: CORE_VERSION };
}
export const verdictOf = (score) => (score >= 75 ? { k: "ok", t: "Looks OK" } : score >= 45 ? { k: "care", t: "Be careful" } : { k: "risk", t: "High risk" });

/// The Liquidity Manager's answer (/api/social?liq=) boiled down for evaluate(): the main pool's
/// locked / burned / free shares, the soonest timed lock and whether any lock is permanent.
export function lpSummary(liq) {
  if (!liq || !liq.done || !Array.isArray(liq.pools)) return null;
  const p = liq.pools.find((x) => toBig(x.liquidity) > 0n);
  if (!p || !p.share) return null;
  const timed = (p.positions || []).filter((q) => q.kind === "locked" && q.lock && q.inRange).map((q) => q.lock.unlockAt);
  return {
    locked: p.share.locked, burned: p.share.burned, free: p.share.free, venue: p.venue, pools: liq.pools.length,
    soonest: timed.length ? Math.min(...timed) : null,
    forever: p.share.launch > 0 || (p.positions || []).some((q) => q.kind === "forever" && q.inRange),
  };
}

// ---------------------------------------------------------------- one-call scan (server, Telegram, share card)
/// Runs every read and the evaluation. holders(addr) is supplied by the caller
/// (the server's own scan, or a fetch of /api/social?scan= in the browser).
export async function scanAll(io, addr, { holders, marketFallback, lp = null } = {}) {
  addr = String(addr).toLowerCase();
  if (!isAddr(addr)) throw new Error("not an address");
  const c = await readContract(io, addr);
  if (!c.contract || !c.token) return { c, res: evaluate(addr, { c }) };
  const [arcpad, argus, locks, dex, h] = await Promise.all([
    readArcPad(io, addr).catch(() => null), readArgus(io, addr).catch(() => null), readLocks(io, addr).catch(() => null),
    readMarket(io, addr).catch(() => null), holders ? holders(addr).catch(() => null) : null,
  ]);
  let m = dex;
  if ((!m || !m.pairs.length) && marketFallback) m = (await marketFallback(addr, { arcpad, argus }).catch(() => null)) || m;
  const sim = await simulateFor(io, addr, c, h).catch(() => null);
  const lpv = lp ? await Promise.resolve(lp).catch(() => null) : null;
  return { c, h, res: evaluate(addr, { c, x: { arcpad, argus, locks }, m, h, sim, lp: lpv }) };
}
/// Picks the holder to act as (largest wallet that isn't a contract or a pool) and runs the dry runs.
export async function simulateFor(io, addr, c, h) {
  if (!h || !h.top) return null;
  // Owners and deployers are often exempt from fees, so an ordinary holder
  // gives the honest answer; they're only the fallback.
  const insiders = [c.owner, h.deployer].filter(Boolean).map((a) => String(a).toLowerCase());
  let holder = null, holderBal = "0", poolBal = "0", fallback = null;
  for (const [a, v, f] of h.top) {
    const k = labelOf(a), al = String(a).toLowerCase();
    if (k && k.kind === "pool" && al === ADDR.poolManager) poolBal = v;
    if (k || (f && f.c) || toBig(v) === 0n) continue;
    if (insiders.includes(al)) { if (!fallback) fallback = [al, v]; continue; }
    if (!holder) { holder = al; holderBal = v; }
  }
  if (!holder && fallback) [holder, holderBal] = fallback;
  return simulate(io, addr, { holder, holderBal, poolBal, supply: c.supply });
}
