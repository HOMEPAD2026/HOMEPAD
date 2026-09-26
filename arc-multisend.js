/* global ethers, CONFIG, ARC, state, readProvider, withRetry, connectWallet, ensureArcForWrite, arcQuoteMeta, arcQuotePriceUsd, apcErrText */
// arc-multisend.js — Multisender, an ARCIRCLE PAD utility (arcpad.html#multisend).
// Send tokens (or NFTs) to many wallets through ArcMultiSend / ArcMultiSendV2
// (contracts/contracts/ArcMultiSend*.sol), or deposit once for a claimable
// drop (ArcDrop.sol). Tokens always go straight from the sender's wallet.
//
//   1. Token     paste an address or pick USDC / $ARCIRCLE / your coins
//   2. List      paste, CSV, saved lists, holders of any token, CirclePad
//                contributors; amounts per line, the same for all, a total
//                split evenly / by weight / by percent; checked as you type
//                (bad lines, checksum typos, duplicates, contract addresses)
//   3. Send      a dry run first (transfer limits, taxes), then approve once
//                (or sign a permit), then batches sized to Arc's block gas;
//                a failing wallet is pinpointed, an unfinished send resumes
//   Afterwards   a public receipt (/drop/<tx>), "did I get an airdrop?",
//                recent airdrops, claim pages (/claim/<id>)
// Addresses come from config-arc.js: MULTISEND_ADDRESS (v1),
// MULTISEND_V2_ADDRESS (permit, a token per row, NFTs), DROP_ADDRESS (claim drops).
// With none set the page runs as a preview.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-multisend");
  if (!panel || typeof CONFIG === "undefined") return;
  const addrOr = (v) => (/^0x[0-9a-fA-F]{40}$/.test(v || "") ? v : "");
  const V1 = () => addrOr(CONFIG.MULTISEND_ADDRESS), V2 = () => addrOr(CONFIG.MULTISEND_V2_ADDRESS), DROPC = () => addrOr(CONFIG.DROP_ADDRESS);
  const SENDER = () => V2() || V1();
  const ABI = [
    "function send(address token, address[] to, uint256[] amounts) returns (uint256)",
    "function sendSame(address token, address[] to, uint256 amount) returns (uint256)",
    "function sendWithPermit(address token, address[] to, uint256[] amounts, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) returns (uint256)",
    "function sendMulti(address[] tokens, address[] to, uint256[] amounts)",
    "function sendERC721(address nft, address[] to, uint256[] ids)",
    "function sendERC1155(address nft, address[] to, uint256[] ids, uint256[] amounts)",
    "function batches() view returns (uint256)", "function transfers() view returns (uint256)",
  ];
  const DROP_ABI = [
    "function create(address token, bytes32 root, uint256 total, uint32 recipients, uint64 endsAt) returns (uint256)",
    "function claim(uint256 id, uint256 index, address account, uint256 amount, bytes32[] proof)",
    "function reclaim(uint256 id)",
    "function getDrop(uint256 id) view returns (tuple(address token, address creator, bytes32 root, uint128 total, uint128 claimed, uint64 createdAt, uint64 endsAt, uint32 recipients, uint32 claims, bool reclaimed))",
    "function isClaimed(uint256 id, uint256 index) view returns (bool)",
    "function idsOfCreator(address who) view returns (uint256[])",
    "event DropCreated(uint256 indexed id, address indexed token, address indexed creator, bytes32 root, uint256 total, uint256 recipients, uint64 endsAt)",
  ];
  const TOK_ABI = [
    "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)",
  ];
  const NFT_ABI = [
    "function supportsInterface(bytes4) view returns (bool)", "function ownerOf(uint256) view returns (address)",
    "function balanceOf(address,uint256) view returns (uint256)", "function isApprovedForAll(address,address) view returns (bool)",
    "function setApprovalForAll(address,bool)", "function name() view returns (string)", "function symbol() view returns (string)",
  ];
  const PERMIT_ABI = [
    "function nonces(address) view returns (uint256)", "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
    "function name() view returns (string)", "function version() view returns (string)",
  ];
  const MAX_CHUNK = 200, NFT_CHUNK = 100, MAX_ROWS = 5000, DROP_MAX = 20000;
  const GAS_PER = 30000n, GAS_BASE = 60000n; // a new holder costs ≈ 28k (contracts/test/arc-multisend.test.js)
  const JOB = "arcircle.multisend.job.v2", HIST = "arcircle.multisend.hist.v1", LISTS = "arcircle.multisend.lists.v1";
  const ARCIRCLE = String(CONFIG.ARCIRCLE_TOKEN || "").toLowerCase();
  const USDC = String(CONFIG.USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase();
  // wallets an airdrop should never go to: burn addresses, Uniswap v4's pool manager, ArcLock, these contracts
  const SYSTEM = () => new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead",
    CONFIG.POOL_MANAGER_ADDRESS, CONFIG.ARCLOCK_ADDRESS, V1(), V2(), DROPC()].filter(Boolean).map((a) => a.toLowerCase()));

  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const isTx = (h) => /^0x[0-9a-fA-F]{64}$/.test(String(h || ""));
  const lr = () => readProvider();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function fmt(raw, dec) {
    const n = Number(ethers.formatUnits(raw, dec));
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 1000 ? 4 : 2 });
  }
  const plain = (raw, dec) => ethers.formatUnits(raw, dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const money = (n) => (n == null || !isFinite(n) ? "—" : "$" + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 })));
  async function fetchJson(url, opt, ms = 15000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...(opt || {}), signal: ctl.signal }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }

  // ================= parsing =================
  // One recipient per line: an address, then a value, separated by a comma,
  // tab, semicolon, "=" or spaces. "1,000.5" reads as a thousands-separated
  // number. Lines starting with # and a header row are skipped.
  function cleanNum(str) {
    let v = String(str || "").trim().replace(/\s+/g, "").replace(/%$/, "");
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, "");
    return v;
  }
  function parseAmount(str, dec) {
    const v = cleanNum(str);
    if (!/^\d+(\.\d+)?$/.test(v) && !/^\.\d+$/.test(v)) return { err: v ? "isn't a number" : "has no amount" };
    const frac = (v.split(".")[1] || "");
    if (frac.length > dec) return { err: `has more than ${dec} decimals` };
    try { const a = ethers.parseUnits(v.startsWith(".") ? "0" + v : v, dec); return a > 0n ? { v: a } : { err: "is zero" }; } catch { return { err: "isn't a number" }; }
  }
  // weights / percents: up to 6 decimals, kept as integers ×1e6
  function parseWeight(str) {
    const v = cleanNum(str);
    if (!/^\d+(\.\d+)?$/.test(v) && !/^\.\d+$/.test(v)) return { err: v ? "isn't a number" : "has no value" };
    const [i, f = ""] = (v.startsWith(".") ? "0" + v : v).split(".");
    const w = BigInt(i) * 1000000n + BigInt((f + "000000").slice(0, 6));
    return w > 0n ? { v: w } : { err: "is zero" };
  }
  /// opts: { am: line|same|split|weight|pct, value, mixed, nft: 721|1155, decs: Map(token → decimals), token }
  function parseList(text, dec, opts) {
    opts = opts || {};
    const am = opts.nft ? "line" : opts.am || "line";
    const rows = [], errors = [], needDec = new Set();
    const sys = SYSTEM();
    const lines = String(text || "").split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim(), n = i + 1;
      if (!line || line.startsWith("#") || line.startsWith("//")) return;
      const m = /0x[0-9a-fA-F]+/.exec(line);
      if (!m) {
        if (i === 0 && /address|wallet|recipient/i.test(line)) return; // header row
        errors.push({ line: n, why: "has no wallet address" }); return;
      }
      if (m[0].length !== 42) { errors.push({ line: n, why: "has an address with the wrong length" }); return; }
      let addr;
      try { addr = ethers.getAddress(m[0]); } catch { errors.push({ line: n, why: "has a typo in the address (checksum doesn't match)" }); return; }
      if (addr === ethers.ZeroAddress) { errors.push({ line: n, why: "is the zero address" }); return; }
      if ([V1(), V2(), DROPC()].some((c) => c && lc(c) === lc(addr))) { errors.push({ line: n, why: "is the Multisender contract itself" }); return; }
      const rest = line.slice(m.index + m[0].length).replace(/^[\s,;=:|]+/, "").replace(/[\s,;|]+$/, "");
      const cols = rest ? rest.split(/[\s,;|=]+(?=\S)/).filter(Boolean) : [];
      const row = { line: n, addr, sys: sys.has(lc(addr)) };
      if (opts.nft) {
        if (!/^\d+$/.test(cols[0] || "")) { errors.push({ line: n, why: "needs a token ID" }); return; }
        row.id = BigInt(cols[0]);
        if (opts.nft === 1155) {
          const q = cols[1] == null ? { v: 1n } : /^\d+$/.test(cols[1]) && BigInt(cols[1]) > 0n ? { v: BigInt(cols[1]) } : { err: "needs a whole number of copies" };
          if (q.err) { errors.push({ line: n, why: q.err }); return; }
          row.amount = q.v;
        } else row.amount = 1n;
        rows.push(row); return;
      }
      if (am === "same" || am === "split") { rows.push(row); return; }
      if (am === "weight" || am === "pct") {
        const w = parseWeight(cols[0]);
        if (w.err) { errors.push({ line: n, why: w.err }); return; }
        row.weight = w.v; rows.push(row); return;
      }
      // per line — optionally with a token in a third column
      let rdec = dec;
      if (opts.mixed && cols[1]) {
        if (!isAddr(cols[1])) { errors.push({ line: n, why: "has a token that isn't an address" }); return; }
        row.token = ethers.getAddress(cols[1]);
        const d = opts.decs && opts.decs.get(lc(row.token));
        if (d == null) { needDec.add(lc(row.token)); row.pending = true; rows.push(row); return; }
        rdec = d;
      }
      const a = parseAmount(cols[0], rdec);
      if (a.err) { errors.push({ line: n, why: a.err }); return; }
      row.amount = a.v; rows.push(row);
    });
    // amounts for split / weight / percent / same
    let valueErr = null;
    if (!opts.nft && am !== "line" && rows.length) {
      const v = parseAmount(opts.value, dec);
      if (v.err) valueErr = v.err;
      else if (am === "same") rows.forEach((r) => { r.amount = v.v; });
      else if (am === "split") splitEven(rows, v.v);
      else {
        const W = rows.reduce((s, r) => s + r.weight, 0n);
        if (am === "pct" && W > 100n * 1000000n) valueErr = "percentages add up to more than 100";
        else {
          splitWeighted(rows, v.v, am === "pct" ? 100n * 1000000n : W);
          if (rows.some((r) => r.amount === 0n)) errors.push(...rows.filter((r) => r.amount === 0n).map((r) => ({ line: r.line, why: "gets nothing at this total" })));
        }
      }
    }
    const seen = new Map();
    rows.forEach((r) => { const k = lc(r.addr) + (r.token ? ":" + lc(r.token) : "") + (opts.nft ? ":" + r.id : ""); seen.set(k, (seen.get(k) || []).concat(r.line)); });
    const dups = [...seen.entries()].filter(([, l]) => l.length > 1).map(([k, l]) => [k.split(":")[0], l]);
    if (opts.nft === 721) {
      const ids = new Map();
      rows.forEach((r) => ids.set(String(r.id), (ids.get(String(r.id)) || []).concat(r.line)));
      for (const [id, l] of ids) if (l.length > 1) l.slice(1).forEach((line) => errors.push({ line, why: `repeats token ID ${id}` }));
    }
    const ok = rows.filter((r) => r.amount != null && !r.pending);
    const total = opts.mixed ? null : ok.reduce((s, r) => s + r.amount, 0n);
    const byToken = new Map();
    if (opts.mixed) ok.forEach((r) => { const k = lc(r.token || opts.token || ""); byToken.set(k, (byToken.get(k) || 0n) + r.amount); });
    errors.sort((a, b) => a.line - b.line);
    return { rows, errors, dups, total, byToken, valueErr, needDec: [...needDec], sameErr: valueErr };
  }
  function splitEven(rows, total) {
    const n = BigInt(rows.length), each = total / n;
    let left = total - each * n;
    rows.forEach((r) => { r.amount = each + (left > 0n ? 1n : 0n); if (left > 0n) left--; });
  }
  /// amount = total × weight / base; when the weights make up the whole base,
  /// the rounding dust goes to the biggest weights (one unit each) so it adds up exactly
  function splitWeighted(rows, total, base) {
    let given = 0n;
    rows.forEach((r) => { r.amount = (total * r.weight) / base; given += r.amount; });
    if (rows.reduce((s, r) => s + r.weight, 0n) !== base) return;
    let dust = total - given;
    [...rows].sort((a, b) => (b.weight > a.weight ? 1 : b.weight < a.weight ? -1 : 0)).forEach((r) => { if (dust > 0n) { r.amount += 1n; dust--; } });
  }
  function mergeDuplicates(text, dec, opts) {
    const P = parseList(text, dec, opts);
    const am = (opts && opts.am) || "line";
    const agg = new Map();
    P.rows.forEach((r) => {
      const k = lc(r.addr) + (r.token ? ":" + lc(r.token) : "");
      const x = agg.get(k);
      if (x) { x.amount = (x.amount || 0n) + (r.amount || 0n); x.weight = (x.weight || 0n) + (r.weight || 0n); }
      else agg.set(k, { addr: r.addr, amount: r.amount, weight: r.weight, token: r.token });
    });
    return [...agg.values()].map((x) => (am === "same" || am === "split" ? x.addr
      : am === "weight" || am === "pct" ? `${x.addr}, ${plainW(x.weight)}`
      : `${x.addr}, ${plain(x.amount || 0n, dec)}${x.token ? ", " + x.token : ""}`)).join("\n");
  }
  const plainW = (w) => { const s = (Number(w) / 1e6).toFixed(6); return s.replace(/\.?0+$/, ""); };

  // ================= Merkle tree (ArcDrop; same as api/_drop.mjs) =================
  const coder = () => ethers.AbiCoder.defaultAbiCoder();
  const leafOf = (i, a, v) => ethers.keccak256(ethers.keccak256(coder().encode(["uint256", "address", "uint256"], [i, a, v])));
  const pairHash = (a, b) => (a.toLowerCase() < b.toLowerCase() ? ethers.keccak256(ethers.concat([a, b])) : ethers.keccak256(ethers.concat([b, a])));
  function buildTree(rows) {
    const layers = [rows.map(([a, v], i) => leafOf(i, a, v))];
    while (layers[layers.length - 1].length > 1) {
      const cur = layers[layers.length - 1], next = [];
      for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? pairHash(cur[i], cur[i + 1]) : cur[i]);
      layers.push(next);
    }
    return { root: layers[layers.length - 1][0], proof: (k) => { const p = []; for (let l = 0; l < layers.length - 1; l++) { const s = k ^ 1; if (s < layers[l].length) p.push(layers[l][s]); k >>= 1; } return p; } };
  }

  // ================= state =================
  const F = {
    mode: "token", am: "line", info: null, bal: null, P: null, busy: false, gasPrice: null, price: null,
    decs: new Map(), code: new Map(), checks: null, chunk: MAX_CHUNK, undo: [], sort: "list", q: "",
  };
  const ta = () => $("ams-list");
  const listOpts = () => ({ am: F.am, value: $("ams-same").value, mixed: F.mode === "token" && !!V2() && $("ams-mixed").checked, nft: F.mode === "nft" && F.info ? F.info.kind : null, decs: F.decs, token: F.info && F.info.address });
  const symOf = (info) => { info = info || F.info; return info ? (lc(info.address) === USDC ? "USDC" : info.kind ? info.symbol : "$" + info.symbol) : ""; };
  const decOf = () => (F.info && !F.info.kind ? F.info.decimals : 0);

  // ---------- modes ----------
  function renderModes() {
    const box = $("ams-modes"), nft = !!V2(), drop = !!DROPC();
    box.hidden = !nft && !drop;
    box.querySelector('[data-mode="nft"]').hidden = !nft;
    box.querySelector('[data-mode="drop"]').hidden = !drop;
    box.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === F.mode)));
    const note = $("ams-mode-note");
    note.hidden = F.mode === "token";
    note.textContent = F.mode === "nft" ? tr("Send ERC-721 or ERC-1155 NFTs — one line per wallet: address, token ID (and copies for ERC-1155).")
      : F.mode === "drop" ? tr("For very long lists: deposit the total once and share a claim link — each wallet claims its own share and pays its own gas.") : "";
    $("ams-mixed-row").hidden = !(F.mode === "token" && nft);
    $("ams-amodes").hidden = F.mode === "nft";
    $("ams-drop-opts").hidden = F.mode !== "drop";
    $("ams-token-h").textContent = tr(F.mode === "nft" ? "NFT collection" : "Token");
    $("ams-token").placeholder = tr(F.mode === "nft" ? "Paste an NFT contract address (0x…)" : "Paste a token contract address (0x…)");
  }
  function setMode(m) {
    if (F.busy || m === F.mode) return;
    F.mode = m;
    if (m === "nft") F.am = "line";
    F.info = null; F.bal = null; $("ams-token").value = ""; $("ams-tokcard").hidden = true;
    say("", ""); steps(null);
    collapseToken(false);
    renderModes(); renderAm(); renderChips(); reparse();
  }

  // ---------- 1. token ----------
  function launchOf(addr) { return ((typeof ARC !== "undefined" && ARC.launches) || []).find((l) => lc(l.token) === lc(addr)) || null; }
  function renderChips() {
    const box = $("ams-quick");
    const chips = F.mode === "nft" ? [] : [{ a: USDC, s: "USDC" }].concat(ARCIRCLE ? [{ a: ARCIRCLE, s: "$ARCIRCLE" }] : []);
    if (state.account && F.mode !== "nft") ((typeof ARC !== "undefined" && ARC.launches) || []).filter((l) => lc(l.creator) === lc(state.account)).slice(0, 6).forEach((l) => chips.push({ a: l.token, s: "$" + l.symbol, mine: true }));
    const html = chips.map((c) => `<button type="button" class="ams-chip${c.mine ? " mine" : ""}${F.info && lc(F.info.address) === lc(c.a) ? " on" : ""}" data-token="${esc(c.a)}" data-no-i18n>${esc(c.s)}</button>`).join("");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
    box.hidden = !chips.length;
  }
  function avatar(info) {
    const l = launchOf(info.address);
    const logo = l && typeof l.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(l.imageUrl) ? l.imageUrl : lc(info.address) === ARCIRCLE ? "images/arcircle-mark-sm.png" : "";
    if (logo) return `<img class="ams-logo" src="${esc(logo)}" alt="">`;
    const bg = typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(info.address) : "";
    return `<span class="ams-logo ph" style="${bg}">${esc(String(info.symbol || "?").replace(/^\$/, "").slice(0, 1).toUpperCase())}</span>`;
  }
  async function nftMeta(addr) {
    const a = ethers.getAddress(addr), c = new ethers.Contract(a, NFT_ABI, lr());
    const [is721, is1155] = await Promise.all([c.supportsInterface("0x80ac58cd").catch(() => false), c.supportsInterface("0xd9b67a26").catch(() => false)]);
    if (!is721 && !is1155) throw new Error("That contract isn't an ERC-721 or ERC-1155 collection.");
    const [name, symbol] = await Promise.all([c.name().catch(() => "NFT"), c.symbol().catch(() => "NFT")]);
    return { address: a, name: String(name).replace(/[<>"'`&]/g, "").slice(0, 40), symbol: String(symbol).replace(/[^\w$.-]/g, "").slice(0, 16) || "NFT", kind: is721 ? 721 : 1155, decimals: 0 };
  }
  let pickSeq = 0;
  async function pickToken(addr) {
    const my = ++pickSeq, card = $("ams-tokcard");
    F.info = null; F.bal = null; F.price = null; F.checks = null;
    renderChips();
    if (!addr) { card.hidden = true; card.innerHTML = ""; collapseToken(false); reparse(); return; }
    card.hidden = false;
    card.innerHTML = `<div class="ams-load"><i></i><span>${esc(tr("Reading the token…"))}</span></div>`;
    try {
      const info = F.mode === "nft" ? await nftMeta(addr) : await arcQuoteMeta(addr);
      if (my !== pickSeq) return;
      F.info = info;
      renderChips();
      if (lc($("ams-token").value.trim()) !== lc(info.address)) $("ams-token").value = info.address;
      await readBalance();
      if (my !== pickSeq) return;
      const sym = symOf(info);
      card.innerHTML = `${avatar(info)}<div class="ams-tok-txt"><b data-no-i18n>${esc(sym)}</b><small data-no-i18n>${esc(info.name)} · ${short(info.address)} · ${info.kind ? "ERC-" + info.kind : info.decimals + " " + esc(tr("decimals"))}</small></div>
        <div class="ams-tok-bal"><small>${esc(tr(info.kind ? "You hold" : "Your balance"))}</small><b data-no-i18n id="ams-tok-bal">${balText()}</b></div>
        ${info.kind ? "" : `<a class="ams-scanlink" href="#scanner?t=${esc(info.address)}">${esc(tr("Scan"))} →</a>`}`;
      card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
      collapseToken(true);
      if (!info.kind) arcQuotePriceUsd(info.address).then((p) => { if (F.info === info) { F.price = p && p.price > 0 ? p.price : null; update(); } }).catch(() => {});
    } catch (err) {
      if (my !== pickSeq) return;
      card.innerHTML = `<p class="ams-err">${esc(tr((err && err.message) || "Couldn't read that token."))}</p>`;
    }
    renderAm();
    reparse();
  }
  const balText = () => (F.bal == null ? "—" : F.info && F.info.kind === 721 ? String(F.bal) : F.info && F.info.kind === 1155 ? "—" : fmt(F.bal, F.info.decimals));
  async function readBalance() {
    if (!F.info || !state.account) { F.bal = null; return; }
    if (F.info.kind === 1155) { F.bal = null; return; }
    F.bal = await withRetry(() => new ethers.Contract(F.info.address, TOK_ABI, lr()).balanceOf(state.account)).catch(() => null);
    const el = $("ams-tok-bal");
    if (el) el.textContent = balText();
  }
  function collapseToken(on) {
    const card = $("ams-step-token");
    card.classList.toggle("done", !!on);
    $("ams-change").hidden = !on;
    card.querySelector(".ams-token-body").hidden = !!on;
  }

  // ---------- 2. list ----------
  const AM_HELP = {
    line: "One wallet per line — address, then amount.",
    same: "One wallet address per line — everyone gets the amount above.",
    split: "One wallet address per line — the total above is split evenly.",
    weight: "One wallet per line — address, then a weight. The total above is split in proportion.",
    pct: "One wallet per line — address, then a percentage of the total above.",
  };
  function renderAm() {
    $("ams-amodes").querySelectorAll("[data-am]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.am === F.am)));
    const needVal = F.mode !== "nft" && F.am !== "line";
    $("ams-same-row").hidden = !needVal;
    $("ams-same").placeholder = tr(F.am === "same" ? "Amount per wallet" : "Total to send");
    $("ams-same").setAttribute("aria-label", $("ams-same").placeholder);
    $("ams-same-sym").textContent = symOf();
    $("ams-am-help").textContent = tr(F.mode === "nft" ? (F.info && F.info.kind === 1155 ? "One wallet per line — address, token ID, copies." : "One wallet per line — address, token ID.") : AM_HELP[F.am]);
    const ph = F.mode === "nft" ? "0x1234…abcd, 7\n0x5678…ef01, 8" : F.am === "line" ? "0x1234…abcd, 100\n0x5678…ef01, 250.5" : F.am === "same" || F.am === "split" ? "0x1234…abcd\n0x5678…ef01" : F.am === "pct" ? "0x1234…abcd, 60\n0x5678…ef01, 40" : "0x1234…abcd, 3\n0x5678…ef01, 1";
    ta().placeholder = ph + "\n" + $("ams-am-help").textContent;
    ta().setAttribute("aria-label", tr("Recipients, one per line: address, amount"));
    $("ams-add-amt").hidden = F.am === "same" || F.am === "split";
    $("ams-add-amt").placeholder = tr(F.mode === "nft" ? "Token ID" : F.am === "pct" ? "Percent" : F.am === "weight" ? "Weight" : "Amount");
  }
  function paintGutter() {
    const g = $("ams-gutter");
    const n = Math.max(1, ta().value.split("\n").length);
    const bad = new Set(((F.P && F.P.errors) || []).map((e) => e.line));
    const dup = new Set(((F.P && F.P.dups) || []).flatMap(([, l]) => l));
    const warn = new Set(((F.P && F.P.rows) || []).filter((r) => r.sys || F.code.get(lc(r.addr))).map((r) => r.line));
    // big lists: only number the lines, no per-line colours
    if (n > 3000) { if (g.__n !== n) { g.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); g.__n = n; } }
    else {
      let html = "";
      for (let i = 1; i <= n; i++) html += `<span${bad.has(i) ? ' class="bad"' : dup.has(i) ? ' class="dup"' : warn.has(i) ? ' class="warn"' : ""}>${i}</span>\n`;
      g.innerHTML = html; g.__n = 0;
    }
    g.scrollTop = ta().scrollTop;
  }
  function paintIssues() {
    const box = $("ams-issues"), P = F.P;
    const contracts = P ? P.rows.filter((r) => !r.sys && F.code.get(lc(r.addr))) : [];
    const system = P ? P.rows.filter((r) => r.sys) : [];
    const tokenSelf = P && F.info ? P.rows.filter((r) => lc(r.addr) === lc(F.info.address)) : [];
    const fails = (F.checks && F.checks.failed) || [];
    if (!P || (!P.errors.length && !P.dups.length && !P.valueErr && !contracts.length && !system.length && !tokenSelf.length && !fails.length && !(P.rows.length > rowCap()))) { box.hidden = true; box.innerHTML = ""; return; }
    const items = [];
    if (P.valueErr) items.push(`<li class="bad">${esc(tr(`The amount above ${P.valueErr}.`))}</li>`);
    P.errors.slice(0, 6).forEach((e) => items.push(`<li class="bad"><button type="button" class="ams-line" data-line="${e.line}">${esc(tr(`Line ${e.line}`))}</button> ${esc(tr(e.why))}</li>`));
    if (P.errors.length > 6) items.push(`<li class="bad">${esc(tr(`…and ${P.errors.length - 6} more lines with problems`))}</li>`);
    fails.slice(0, 4).forEach((f) => items.push(`<li class="bad"><button type="button" class="ams-line" data-line="${f.line}">${esc(tr(`Line ${f.line}`))}</button> ${esc(tr("would fail:"))} <span data-no-i18n>${esc(f.reason || tr("the token refused this transfer"))}</span></li>`));
    P.dups.slice(0, 3).forEach(([a, l]) => items.push(`<li class="dup"><span data-no-i18n>${esc(short(ethers.getAddress(a)))}</span> ${esc(tr(`appears ${l.length} times (lines ${l.join(", ")})`))}</li>`));
    if (P.dups.length > 3) items.push(`<li class="dup">${esc(tr(`…and ${P.dups.length - 3} more repeated wallets`))}</li>`);
    if (system.length) items.push(`<li class="dup">${esc(tr(`${plural(system.length, "line goes", "lines go")} to a burn address, a pool or a locker — tokens sent there are gone.`))}</li>`);
    if (tokenSelf.length) items.push(`<li class="dup">${esc(tr("The token's own contract is on the list — tokens sent there are usually lost."))}</li>`);
    if (contracts.length) items.push(`<li class="dup">${esc(tr(`${plural(contracts.length, "address is a contract", "addresses are contracts")} (lines ${contracts.slice(0, 5).map((r) => r.line).join(", ")}${contracts.length > 5 ? ", …" : ""}) — fine for a multisig, but not an exchange or a pool.`))}</li>`);
    if (P.rows.length > rowCap()) items.push(`<li class="bad">${esc(tr(`That's more than ${rowCap().toLocaleString("en-US")} wallets — split the list into smaller sends.`))}</li>`);
    const acts = [];
    if (P.errors.length) acts.push(`<button type="button" class="ams-mini" data-fix="drop">${esc(tr("Remove bad lines"))}</button>`);
    if (fails.length) acts.push(`<button type="button" class="ams-mini" data-fix="fails">${esc(tr("Remove failing lines"))}</button>`);
    if (P.dups.length && F.mode !== "nft") acts.push(`<button type="button" class="ams-mini" data-fix="merge">${esc(tr(F.am === "same" || F.am === "split" ? "Keep one of each" : "Merge duplicates"))}</button>`);
    if (system.length || tokenSelf.length) acts.push(`<button type="button" class="ams-mini" data-fix="system">${esc(tr("Remove burn / pool addresses"))}</button>`);
    if (contracts.length) acts.push(`<button type="button" class="ams-mini" data-fix="contracts">${esc(tr("Remove contract addresses"))}</button>`);
    box.hidden = false;
    box.innerHTML = `<ul>${items.join("")}</ul>${acts.length ? `<div class="ams-fix">${acts.join("")}</div>` : ""}`;
  }
  const rowCap = () => (F.mode === "drop" ? DROP_MAX : MAX_ROWS);
  // preview: search, sort, remove a row, a histogram of the amounts
  function paintTable() {
    const box = $("ams-table"), P = F.P;
    if (!P || !P.rows.length || !F.info) { box.hidden = true; box.innerHTML = ""; return; }
    const dec = decOf(), nft = F.mode === "nft";
    let rows = P.rows.filter((r) => r.amount != null);
    if (!rows.length) { box.hidden = true; return; }
    const all = rows;
    const max = all.reduce((m, r) => (r.amount > m ? r.amount : m), 0n);
    const min = all.reduce((m, r) => (r.amount < m ? r.amount : m), all[0].amount);
    const q = F.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => lc(r.addr).includes(q) || String(r.line) === q);
    if (F.sort === "desc") rows = [...rows].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
    else if (F.sort === "asc") rows = [...rows].sort((a, b) => (a.amount > b.amount ? 1 : a.amount < b.amount ? -1 : 0));
    const show = rows.slice(0, 60);
    const unit = (r) => (nft ? `#${r.id}${F.info.kind === 1155 ? " × " + r.amount : ""}` : fmt(r.amount, r.token ? F.decs.get(lc(r.token)) ?? dec : dec) + (r.token ? " " + short(r.token) : ""));
    box.hidden = false;
    box.innerHTML = `${nft || (P.byToken && P.byToken.size) ? "" : histogram(all, max)}
      <div class="ams-table-head"><span>${esc(tr("Preview"))}</span>${nft ? "" : `<small data-no-i18n>${esc(tr("min"))} ${fmt(min, dec)} · ${esc(tr("max"))} ${fmt(max, dec)}</small>`}</div>
      <div class="ams-table-tools">
        <input type="search" id="ams-q" placeholder="${esc(tr("Search a wallet or line"))}" value="${esc(F.q)}" autocomplete="off" spellcheck="false">
        ${nft ? "" : `<select id="ams-sort" aria-label="${esc(tr("Sort"))}"><option value="list"${F.sort === "list" ? " selected" : ""}>${esc(tr("List order"))}</option><option value="desc"${F.sort === "desc" ? " selected" : ""}>${esc(tr("Largest first"))}</option><option value="asc"${F.sort === "asc" ? " selected" : ""}>${esc(tr("Smallest first"))}</option></select>`}
      </div>
      <ol class="ams-rows">${show.map((r, i) => {
        const w = !nft && max > 0n ? Math.max(2, Number((r.amount * 1000n) / max) / 10) : 0;
        const flag = r.sys ? "sys" : F.code.get(lc(r.addr)) ? "ctr" : "";
        return `<li style="--w:${w}%;--i:${Math.min(i, 20)}" class="${flag}"><span class="ams-ln">${r.line}</span><button type="button" class="ams-addr" data-copy-addr="${esc(r.addr)}" title="${esc(r.addr)}" data-no-i18n>${esc(short(r.addr))}${flag ? `<em>${esc(tr(flag === "sys" ? "burn / pool" : "contract"))}</em>` : ""}</button><b data-no-i18n>${esc(unit(r))}</b><button type="button" class="ams-del" data-del="${r.line}" aria-label="${esc(tr("Remove"))}">×</button><i aria-hidden="true"></i></li>`;
      }).join("")}</ol>${rows.length > show.length ? `<p class="ams-more">${esc(tr(`+ ${(rows.length - show.length).toLocaleString("en-US")} more`))}</p>` : !rows.length ? `<p class="ams-more">${esc(tr("No match."))}</p>` : ""}`;
  }
  // ten bars, log-spaced between the smallest and largest amount, and how
  // much of the total the top tenth of wallets gets
  function histogram(rows, max) {
    if (rows.length < 3 || rows.every((r) => r.amount === rows[0].amount)) return "";
    const vals = rows.map((r) => Number(r.amount)).filter((v) => v > 0);
    const lo = Math.log10(Math.min(...vals)), hi = Math.log10(Number(max));
    const bins = new Array(10).fill(0);
    vals.forEach((v) => { const k = hi === lo ? 9 : Math.min(9, Math.floor(((Math.log10(v) - lo) / (hi - lo)) * 10)); bins[k]++; });
    const peak = Math.max(...bins);
    const sorted = [...vals].sort((a, b) => b - a), top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 10))).reduce((s, v) => s + v, 0);
    const share = (top / sorted.reduce((s, v) => s + v, 0)) * 100;
    return `<div class="ams-hist-chart" role="img" aria-label="${esc(tr("How the amounts are spread"))}">
      <div class="ams-bars">${bins.map((b, i) => `<i style="--h:${peak ? Math.max(b ? 8 : 0, (b / peak) * 100) : 0}%;--i:${i}" title="${b}"></i>`).join("")}</div>
      <small>${esc(tr(`Top 10% of wallets get ${share.toFixed(share >= 10 ? 0 : 1)}% of the total`))}</small></div>`;
  }
  // the recipient grid: one dot per wallet (up to 400), lit from the middle outwards
  function paintDots(done, running) {
    const box = $("ams-dots"), P = F.P;
    const n = P ? P.rows.length : 0;
    if (!n || n > rowCap()) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    const cells = Math.min(n, 400), per = n / cells;
    const cols = Math.max(1, Math.floor((box.clientWidth || 300) / 10)), rowsN = Math.ceil(cells / cols);
    const cx = (cols - 1) / 2, cy = (rowsN - 1) / 2;
    const cls = (i) => { const at = Math.floor(i * per); return at < (done || 0) ? "ok" : at < (running || 0) ? "run" : ""; };
    if (box.__n !== cells) {
      let html = "";
      for (let i = 0; i < cells; i++) { const x = i % cols, y = Math.floor(i / cols); html += `<i class="${cls(i)}" style="--d:${Math.round(Math.hypot(x - cx, y - cy) * 22)}ms"></i>`; }
      box.innerHTML = html; box.__n = cells;
    } else box.querySelectorAll("i").forEach((el, i) => { el.className = cls(i); });
    box.dataset.label = tr(plural(n, "wallet", "wallets"));
  }
  let reparseT = 0;
  function reparse() {
    if (!F.info) { F.P = null; paintAll(); return; }
    F.P = parseList(ta().value, decOf(), listOpts());
    if (F.P.needDec.length) loadDecs(F.P.needDec);
    paintAll();
    clearTimeout(reparseT);
    reparseT = setTimeout(() => { checkCodes(); dryRun(); }, 700);
  }
  function paintAll() {
    paintGutter(); paintIssues(); paintTable(); paintDots(); paintStarts(); update();
  }
  async function loadDecs(tokens) {
    const todo = tokens.filter((t) => !F.decs.has(t)).slice(0, 12);
    if (!todo.length) return;
    await Promise.all(todo.map((t) => arcQuoteMeta(t).then((m) => F.decs.set(t, m.decimals)).catch(() => F.decs.set(t, 18))));
    reparse();
  }
  // which recipients are contracts (a multisig is fine, an exchange or a pool isn't)
  let codeSeq = 0;
  async function checkCodes() {
    const P = F.P, my = ++codeSeq;
    if (!P) return;
    const need = [...new Set(P.rows.map((r) => lc(r.addr)))].filter((a) => !F.code.has(a)).slice(0, 5000);
    for (let i = 0; i < need.length; i += 100) {
      const part = need.slice(i, i + 100);
      const codes = await Promise.all(part.map((a) => lr().send("eth_getCode", [a, "latest"]).catch(() => null)));
      part.forEach((a, k) => { if (codes[k] != null) F.code.set(a, codes[k] !== "0x"); });
      if (my !== codeSeq) return;
    }
    if (need.length) { paintGutter(); paintIssues(); paintTable(); }
  }
  function paintStarts() {
    const empty = !ta().value.trim();
    $("ams-starts").hidden = !empty || F.mode === "nft";
  }

  // ---------- dry run: what the token does with these transfers ----------
  // A sample of the list (the first rows, the biggest amounts, a few at random)
  // is "sent" from your own address in eth_call — with ScanProbe's code placed
  // there (the Token Scanner's dry-run contract) to also measure what arrives.
  // Catches max-wallet / max-transaction limits, blocklists and transfer taxes
  // before anything is signed. Nodes that refuse the state override get a
  // plain transfer check instead (no tax reading).
  let checkSeq = 0;
  async function dryRun() {
    const P = F.P, my = ++checkSeq;
    F.checks = null;
    if (!P || !F.info || F.info.kind || !state.account || P.errors.length || P.valueErr || !P.rows.length || (P.byToken && P.byToken.size > 1)) { paintChecks(); return; }
    const rows = P.rows.filter((r) => r.amount != null);
    const pick = new Map();
    rows.slice(0, 10).forEach((r) => pick.set(r.line, r));
    [...rows].sort((a, b) => (b.amount > a.amount ? 1 : -1)).slice(0, 15).forEach((r) => pick.set(r.line, r));
    for (let k = 0; k < 15 && rows.length > 25; k++) { const r = rows[Math.floor(Math.random() * rows.length)]; pick.set(r.line, r); }
    const sample = [...pick.values()];
    F.checks = { running: true, checked: 0, failed: [], tax: null };
    paintChecks();
    const token = F.info.address, from = state.account;
    const K = window.ArcScanCore;
    let mode = K && K.PROBE_CODE ? "probe" : "basic", taxes = [];
    const failed = [];
    for (let i = 0; i < sample.length; i += 10) {
      const part = sample.slice(i, i + 10);
      const res = await Promise.all(part.map(async (r) => {
        if (F.bal != null && r.amount > F.bal) return { ok: true, skip: true };
        if (mode === "probe") {
          const data = "0xdd8e5ec9" + ethers.zeroPadValue(token, 32).slice(2) + ethers.zeroPadValue(r.addr, 32).slice(2) + ethers.toBeHex(r.amount, 32).slice(2);
          try {
            const out = await lr().send("eth_call", [{ from, to: from, data, gas: "0x1c9c380" }, "latest", { [from]: { code: K.PROBE_CODE } }]);
            const [ok, sent, received, reason] = ethers.AbiCoder.defaultAbiCoder().decode(["bool", "uint256", "uint256", "bytes"], out);
            if (!ok) return { ok: false, reason: revertText(reason) };
            return { ok: true, tax: sent > 0n ? Number(((sent - received) * 10000n) / sent) / 100 : 0 };
          } catch (e) {
            if (/override|unsupported|invalid.*param|not supported|too many arguments|expected 2|unknown field/i.test(String((e && e.message) || e))) mode = "basic";
            else return { ok: true, skip: true };
          }
        }
        try {
          const out = await lr().send("eth_call", [{ from, to: token, data: new ethers.Interface(TOK_ABI).encodeFunctionData("transfer", [r.addr, r.amount]) }, "latest"]);
          if (out && out !== "0x" && BigInt(out) === 0n) return { ok: false, reason: "the token returned false" };
          return { ok: true };
        } catch (e) { return { ok: false, reason: revertText(e) }; }
      }));
      if (my !== checkSeq) return;
      res.forEach((x, k) => { if (!x.ok) failed.push({ line: part[k].line, reason: x.reason }); else if (x.tax != null) taxes.push(x.tax); });
      F.checks = { running: i + 10 < sample.length, checked: Math.min(sample.length, i + 10), failed, tax: taxes.length ? Math.max(...taxes) : null, mode, of: rows.length };
      paintChecks();
    }
    paintIssues(); update();
  }
  function revertText(e) {
    if (typeof e === "string" && e.startsWith("0x")) {
      try { if (e.startsWith("0x08c379a0")) return ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.slice(10))[0].slice(0, 120); } catch { /* raw */ }
      return e.length > 2 ? tr("reverted") : "";
    }
    if (e && typeof e.reason === "string" && e.reason) return e.reason.slice(0, 120);
    const m = String((e && (e.shortMessage || (e.info && e.info.error && e.info.error.message) || e.message)) || e || "");
    const r = /reverted(?: with reason string)?:? ?['"]?([^'"]+)['"]?/i.exec(m);
    return (r ? r[1] : m).slice(0, 120);
  }
  function paintChecks() {
    const box = $("ams-checks"), c = F.checks;
    if (!c) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const cls = c.failed.length ? "bad" : c.tax > 0.05 ? "warn" : c.running ? "run" : "ok";
    const line = c.running ? tr(`Dry run: checking ${c.checked} transfers…`)
      : c.failed.length ? tr(`Dry run: ${plural(c.failed.length, "transfer fails", "transfers fail")} — see the list.`)
      : c.tax > 0.05 ? tr(`Dry run: this token takes ${c.tax}% on transfers — wallets receive about ${(100 - c.tax).toFixed(2)}%.`)
      : c.mode === "probe" ? tr(`Dry run: ${c.checked} sample transfers go through in full.`) : tr(`Dry run: ${c.checked} sample transfers go through.`);
    box.className = "ams-checks " + cls;
    box.innerHTML = `<span class="ams-check-ico" aria-hidden="true"></span><span>${esc(line)}</span>`;
  }

  // ---------- 3. review ----------
  async function gasPrice() {
    if (F.gasPrice && Date.now() - F.gasPrice.at < 60000) return F.gasPrice;
    try {
      const [gp, blk] = await Promise.all([lr().send("eth_gasPrice", []), lr().send("eth_getBlockByNumber", ["latest", false])]);
      const limit = blk && blk.gasLimit ? BigInt(blk.gasLimit) : 30000000n;
      // batches use at most half a block
      F.chunk = Math.max(20, Math.min(MAX_CHUNK, Number((limit / 2n) / 32000n)));
      F.gasPrice = { at: Date.now(), v: BigInt(gp), limit };
    } catch { F.gasPrice = null; }
    return F.gasPrice;
  }
  const chunkFor = () => (F.mode === "nft" ? Math.min(NFT_CHUNK, F.chunk) : F.chunk);
  let gasSeq = 0;
  async function paintGas(n, k) {
    const el = $("ams-s-gas"), my = ++gasSeq;
    if (!n) { el.textContent = "—"; return; }
    const g = await gasPrice();
    if (my !== gasSeq) return;
    if (!g) { el.textContent = "—"; return; }
    const gas = F.mode === "drop" ? 250000n : GAS_PER * BigInt(n) + GAS_BASE * BigInt(k) + 50000n;
    F.fee = gas * g.v;
    const usd = Number(ethers.formatUnits(F.fee, (CONFIG.NATIVE_CURRENCY && CONFIG.NATIVE_CURRENCY.decimals) || 18));
    el.textContent = usd < 0.01 ? "< 0.01 USDC" : `≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
    warnings();
  }
  function warnings() {
    const box = $("ams-warn"), P = F.P;
    const out = [];
    if (F.info && !F.info.kind && P && P.total != null && P.rows.length && F.bal != null && P.total > F.bal) out.push(tr(`That's more than your balance — you're ${fmt(P.total - F.bal, F.info.decimals)} ${symOf()} short.`));
    else if (F.info && lc(F.info.address) === USDC && P && P.total != null && F.bal != null && F.fee != null && P.total + F.fee / 10n ** 12n > F.bal) out.push(tr("Leave a little USDC for gas — on Arc the network fee is paid in USDC too."));
    if (F.mode === "drop" && F.info && P && P.rows.length) out.push(tr("Tokens that take a fee on transfer can't be used for a claim drop."));
    box.hidden = !out.length;
    box.innerHTML = out.map((t) => `<p>${esc(t)}</p>`).join("");
  }
  function sumText() {
    const P = F.P;
    if (!F.info || !P) return "—";
    if (F.mode === "nft") return `${plural(P.rows.reduce((s, r) => s + Number(r.amount || 0n), 0), "NFT", "NFTs")}`;
    if (P.byToken && P.byToken.size) return [...P.byToken.entries()].slice(0, 3).map(([t, v]) => `${fmt(v, F.decs.get(t) ?? decOf())} ${t === lc(F.info.address) ? symOf() : short(t)}`).join(" + ") + (P.byToken.size > 3 ? " …" : "");
    return P.total > 0n ? `${fmt(P.total, F.info.decimals)} ${symOf()}` : "—";
  }
  function update() {
    const P = F.P, go = $("ams-go");
    const rows = P ? P.rows : [];
    const fails = (F.checks && F.checks.failed.length) || 0;
    const ok = !!(F.info && P && rows.length && !P.errors.length && !P.valueErr && !P.needDec.length && rows.length <= rowCap() && rows.every((r) => r.amount != null));
    const k = rows.length ? (F.mode === "drop" ? 1 : Math.ceil(rows.length / chunkFor())) : 0;
    $("ams-s-n").textContent = rows.length ? rows.length.toLocaleString("en-US") : "—";
    $("ams-s-total").textContent = sumText();
    $("ams-s-bal").textContent = F.info && F.bal != null ? `${balText()} ${symOf()}` : "—";
    $("ams-s-tx").textContent = !k ? "—" : F.mode === "drop" ? tr("1 deposit + 1 approval") : tr(k === 1 ? "1 send + 1 approval" : `${k} batches + 1 approval`);
    $("ams-s-usd").textContent = F.price && P && P.total ? money(Number(ethers.formatUnits(P.total, F.info.decimals)) * F.price) : "—";
    paintGas(ok ? rows.length : 0, k);
    warnings();
    paintFlow(ok);
    paintSticky(ok);
    if (F.busy) return;
    const set = (t, on) => { goText(tr(t)); go.disabled = !on; };
    if (!F.info) return set(F.mode === "nft" ? "Pick a collection" : "Pick a token", false);
    if (!P || !rows.length) return set("Add recipients", false);
    if (P.valueErr) return set(F.am === "same" ? "Enter the amount per wallet" : "Enter the total", false);
    if (P.errors.length) return set(`Fix ${plural(P.errors.length, "line", "lines")} first`, false);
    if (P.needDec.length) return set("Reading tokens…", false);
    if (rows.length > rowCap()) return set("Too many wallets", false);
    if (!(F.mode === "drop" ? DROPC() : F.mode === "nft" || (P.byToken && P.byToken.size) ? V2() : SENDER())) return set("Opens soon", false);
    if (!state.account) return set("Connect wallet", true);
    if (fails) return set(`${plural(fails, "transfer would fail", "transfers would fail")}`, false);
    if (F.info.kind !== 1155 && P.total != null && F.bal != null && P.total > F.bal) return set(`Not enough ${symOf()}`, false);
    set(F.mode === "drop" ? `Deposit for ${plural(rows.length, "wallet", "wallets")}` : `Send to ${plural(rows.length, "wallet", "wallets")}`, true);
  }
  const goText = (t) => { $("ams-go").querySelector(".ams-go-txt").textContent = t; };
  const goFill = (p) => { $("ams-go").style.setProperty("--p", Math.max(0, Math.min(100, p)) + "%"); $("ams-go").classList.toggle("filling", p > 0 && p < 100); };
  function paintFlow(ok) {
    const lis = $("ams-flow").querySelectorAll("li");
    const s1 = !!F.info, s2 = s1 && ok;
    lis[0].className = s1 ? "done" : "on";
    lis[1].className = s2 ? "done" : s1 ? "on" : "";
    lis[2].className = s2 ? "on" : "";
    $("ams-flow").style.setProperty("--s", s2 ? 1 : s1 ? 0.5 : 0);
  }
  // phones: a bar with the total and a button to the review card, while it's off screen
  let reviewSeen = true;
  function paintSticky(ok) {
    const bar = $("ams-sticky");
    const show = !!(F.P && F.P.rows.length && !reviewSeen && window.innerWidth <= 900 && panel.classList.contains("active"));
    bar.hidden = !show;
    if (!show) return;
    $("ams-sticky-t").textContent = sumText();
    $("ams-sticky-s").textContent = tr(plural(F.P.rows.length, "wallet", "wallets")) + (ok ? "" : " · " + tr("needs fixing"));
  }

  // ---------- undo / toast ----------
  function pushUndo() {
    F.undo.push(ta().value);
    if (F.undo.length > 20) F.undo.shift();
    $("ams-undo").hidden = false;
  }
  function setList(text, note) {
    pushUndo();
    ta().value = text;
    sweep();
    reparse();
    if (note) toast(note);
  }
  let toastT = 0;
  function toast(t) {
    const el = $("ams-toast");
    el.textContent = t; el.hidden = false;
    el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  // a scan line runs down the list after a paste, then good lines flash
  function sweep() {
    if (reduce) return;
    const ed = panel.querySelector(".ams-editor");
    ed.classList.remove("sweeping"); void ed.offsetWidth; ed.classList.add("sweeping");
    setTimeout(() => ed.classList.remove("sweeping"), 1200);
  }

  // ---------- sending ----------
  function steps(labels, done, active, failed) {
    const ol = $("ams-steps");
    if (!labels) { ol.innerHTML = ""; ol.classList.remove("show"); return; }
    ol.classList.add("show");
    ol.innerHTML = labels.map(([id, label]) => `<li class="${done.includes(id) ? "ok" : failed === id ? "bad" : active === id ? "on" : ""}"><span class="ams-tick" aria-hidden="true"></span>${esc(label)}</li>`).join("");
  }
  const say = (cls, html) => { $("ams-status").className = "ams-status " + (cls || ""); $("ams-status").innerHTML = html || ""; };
  function saveJob(job) { try { if (job) localStorage.setItem(JOB, JSON.stringify(job)); else localStorage.removeItem(JOB); } catch { /* private mode */ } }
  function loadJob() { try { const j = JSON.parse(localStorage.getItem(JOB) || "null"); return j && j.v === 2 ? j : null; } catch { return null; } }
  function errText(err) {
    const m = typeof apcErrText === "function" ? apcErrText(err) : String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    return tr(m.length > 200 ? m.slice(0, 200) + "…" : m || "Something went wrong.");
  }
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  async function start() {
    if (F.busy) return;
    if (!state.account) { if (typeof connectWallet === "function") await connectWallet(); update(); return; }
    const P = F.P;
    if (!F.info || !P || !P.rows.length || P.errors.length) return;
    const job = {
      v: 2, id: Date.now().toString(36), at: Date.now(), account: lc(state.account), mode: F.mode, kind: F.info.kind || null,
      token: F.info.address, sym: symOf(), dec: decOf(), mixed: !!(P.byToken && P.byToken.size),
      rows: P.rows.map((r) => [r.addr, r.amount.toString(), r.token || (r.id != null ? String(r.id) : ""), r.line]),
      total: P.total != null ? P.total.toString() : null, sent: 0, txs: [], endsIn: Number($("ams-drop-end").value || 0),
    };
    if (F.mode === "drop") return runDrop(job);
    await run(job);
  }
  // Allowance for `need` of `token` to `spender`, with the zero-first dance
  // some tokens (USDT-style) insist on.
  async function ensureAllowance(token, spender, need, label) {
    const tok = new ethers.Contract(token, TOK_ABI, state.signer);
    const have = await tok.allowance(state.account, spender);
    if (have >= need) return false;
    say("wait", esc(tr(label || "Approve the total in your wallet…")));
    let direct = true;
    if (have > 0n) { try { await tok.approve.staticCall(spender, need); } catch { direct = false; } }
    if (!direct) {
      say("wait", esc(tr("This token needs its old approval cleared first — confirm in your wallet…")));
      await (await tok.approve(spender, 0n)).wait();
    }
    const tx = await tok.approve(spender, need);
    say("wait", `${esc(tr("Approving…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
    await tx.wait();
    return true;
  }
  // EIP-2612: a signature instead of an approval transaction, when the token
  // supports it and we can reproduce its signing domain exactly.
  async function permitDomain(token) {
    try {
      const c = new ethers.Contract(token, PERMIT_ABI, lr());
      const [ds] = await Promise.all([c.DOMAIN_SEPARATOR(), c.nonces(state.account)]);
      const chainId = BigInt(CONFIG.CHAIN_ID_DECIMAL);
      const cands = [];
      try { const d = await c.eip712Domain(); cands.push({ name: d.name, version: d.version, chainId: d.chainId, verifyingContract: d.verifyingContract }); } catch { /* not EIP-5267 */ }
      const name = await c.name().catch(() => null);
      if (name != null) {
        let ver = null;
        try { ver = await c.version(); } catch { ver = null; }
        for (const v of [ver, "1", "2"].filter((x) => x != null)) cands.push({ name, version: v, chainId, verifyingContract: token });
      }
      return cands.find((d) => ethers.TypedDataEncoder.hashDomain(d) === ds) || null;
    } catch { return null; }
  }
  async function signPermit(token, spender, value) {
    const domain = await permitDomain(token);
    if (!domain) return null;
    const nonce = await new ethers.Contract(token, PERMIT_ABI, lr()).nonces(state.account);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
    say("wait", esc(tr("Sign the permit in your wallet — no approval transaction needed…")));
    const sig = ethers.Signature.from(await state.signer.signTypedData(domain, types, { owner: state.account, spender, value, nonce, deadline }));
    return { value, deadline, v: sig.v, r: sig.r, s: sig.s };
  }
  // Which row of a failing batch is the problem: halve the batch with dry runs.
  async function findFailing(call, part) {
    let reason = "";
    try { await call(part); return null; } catch (e) { reason = revertText(e); if (part.length === 1) return { k: 0, reason }; }
    // transfers can fail only in combination (two rows to one capped wallet),
    // so test growing prefixes: the first `ok` rows pass, the first `bad` don't
    let ok = 0, bad = part.length;
    while (bad - ok > 1) {
      const mid = (ok + bad) >> 1;
      try { await call(part.slice(0, mid)); ok = mid; } catch (e) { bad = mid; reason = revertText(e) || reason; }
    }
    return { k: bad - 1, reason };
  }
  async function run(job) {
    const nft = job.mode === "nft", multi = job.mixed;
    const addr = nft || multi ? V2() : SENDER();
    if (!addr) return;
    F.busy = true;
    $("ams-go").disabled = true;
    panel.classList.add("ams-sending");
    say("wait", esc(tr("Getting ready…")));
    const rows = job.rows.map(([a, v, x, line]) => ({ addr: a, amount: BigInt(v), token: multi ? x || job.token : null, id: nft ? BigInt(x) : null, line }));
    const size = () => job.chunk || chunkFor();
    const labels = () => {
      const k = job.sent >= rows.length ? job.txs.length : job.txs.length + Math.ceil((rows.length - job.sent) / size());
      return [["approve", tr(nft ? "Allow" : job.permit ? "Permit" : "Approve")]].concat(Array.from({ length: k }, (_, i) => [String(i), k === 1 ? tr("Send") : tr(`Batch ${i + 1}`)]));
    };
    const done = () => (job.approved ? ["approve"] : []).concat(job.txs.map((_, i) => String(i)));
    let active = "approve";
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      if (lc(state.account) !== job.account) throw new Error("Switch back to the wallet that started this send.");
      await gasPrice();
      const ms = new ethers.Contract(addr, ABI, state.signer);
      const left = rows.slice(job.sent);
      steps(labels(), done(), active);
      // 1) balances and approvals for whatever is still to go
      let permit = null;
      if (nft) {
        const c = new ethers.Contract(job.token, NFT_ABI, state.signer);
        if (job.kind === 721) {
          const owners = await Promise.all(left.slice(0, 400).map((r) => c.ownerOf(r.id).catch(() => null)));
          const bad = left.slice(0, 400).find((r, i) => lc(owners[i]) !== lc(state.account));
          if (bad) throw new Error(tr(`You don't own token ID ${bad.id} (line ${bad.line}).`));
        }
        if (!(await c.isApprovedForAll(state.account, addr))) {
          say("wait", esc(tr("Allow the Multisender to move this collection — confirm in your wallet…")));
          await (await c.setApprovalForAll(addr, true)).wait();
        }
      } else if (multi) {
        const need = new Map();
        left.forEach((r) => need.set(lc(r.token), (need.get(lc(r.token)) || 0n) + r.amount));
        for (const [t, v] of need) {
          const bal = await new ethers.Contract(t, TOK_ABI, lr()).balanceOf(state.account);
          if (bal < v) throw new Error(tr(`Not enough of ${short(t)} — this needs ${fmt(v, F.decs.get(t) ?? 18)}.`));
          await ensureAllowance(t, addr, v, `Approve ${short(t)} in your wallet…`);
        }
      } else {
        const need = left.reduce((s, r) => s + r.amount, 0n);
        const bal = await new ethers.Contract(job.token, TOK_ABI, lr()).balanceOf(state.account);
        if (bal < need) throw new Error(tr(`Not enough ${job.sym} — this needs ${fmt(need, job.dec)}, you have ${fmt(bal, job.dec)}.`));
        const have = await new ethers.Contract(job.token, TOK_ABI, lr()).allowance(state.account, addr);
        if (have < need && V2() && lc(addr) === lc(V2())) { try { permit = await signPermit(job.token, addr, need); } catch (e) { if (rejected(e)) throw e; permit = null; } }
        if (permit) { job.permit = true; steps(labels(), done(), active); }
        else await ensureAllowance(job.token, addr, need);
      }
      job.approved = true; saveJob(job);
      // 2) the batches
      while (job.sent < rows.length) {
        const part = rows.slice(job.sent, job.sent + size());
        const i = job.txs.length;
        active = String(i); steps(labels(), done(), active);
        paintDots(job.sent, job.sent + part.length);
        const k = Math.ceil((rows.length - job.sent) / size()) + i;
        const same = !nft && !multi && part.every((r) => r.amount === part[0].amount);
        // how: "static" (dry run), "estimate" (gas) or "send"
        const call = (p, how) => {
          const to = p.map((r) => r.addr);
          const f = (name, ...args) => (how === "static" ? ms[name].staticCall(...args) : how === "estimate" ? ms[name].estimateGas(...args) : ms[name](...args));
          if (nft) return job.kind === 721 ? f("sendERC721", job.token, to, p.map((r) => r.id)) : f("sendERC1155", job.token, to, p.map((r) => r.id), p.map((r) => r.amount));
          if (multi) return f("sendMulti", p.map((r) => r.token), to, p.map((r) => r.amount));
          if (permit && !job.permitUsed) return f("sendWithPermit", job.token, to, p.map((r) => r.amount), permit.value, permit.deadline, permit.v, permit.r, permit.s);
          return same && p.every((r) => r.amount === p[0].amount) ? f("sendSame", job.token, to, p[0].amount) : f("send", job.token, to, p.map((r) => r.amount));
        };
        say("wait", esc(tr(k === 1 ? "Confirm the send in your wallet…" : `Confirm batch ${i + 1} of ${k} in your wallet…`)));
        // a dry run first: a bad batch fails here, before it costs gas — and we find the wallet
        try { await call(part, "static"); }
        catch (e) {
          const permitCall = permit && !job.permitUsed;
          if (permitCall) { permit = null; job.permit = false; await ensureAllowance(job.token, addr, rows.slice(job.sent).reduce((s, r) => s + r.amount, 0n)); continue; }
          const bad = await findFailing((p) => call(p, "static"), part);
          if (bad) { job.failLine = part[bad.k].line; job.failReason = bad.reason; saveJob(job); throw Object.assign(new Error("row"), { row: part[bad.k], reason: bad.reason }); }
          throw e;
        }
        // too heavy for half a block: halve the batch and go again
        if (part.length > 10) {
          let gas = null;
          try { gas = await call(part, "estimate"); } catch (e) { if (/gas/i.test(String((e && (e.shortMessage || e.message)) || ""))) gas = -1n; }
          const cap = F.gasPrice ? F.gasPrice.limit / 2n : 15000000n;
          if (gas === -1n || (gas != null && gas > cap)) { job.chunk = Math.max(10, Math.floor(part.length / 2)); saveJob(job); continue; }
        }
        const tx = await call(part, "send");
        if (permit) job.permitUsed = true;
        say("wait", `${esc(tr(k === 1 ? "Sending…" : `Sending batch ${i + 1} of ${k}…`))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
        const rc = await tx.wait();
        if (rc && rc.status === 0) throw new Error("The batch transaction failed.");
        job.sent += part.length; job.txs.push(tx.hash); saveJob(job);
        goFill((job.sent / rows.length) * 100);
        goText(tr(`${job.sent.toLocaleString("en-US")} / ${rows.length.toLocaleString("en-US")} wallets`));
        paintDots(job.sent, 0);
        if (typeof window.arcHaptic === "function") window.arcHaptic("tap");
      }
      steps(labels(), done(), null);
      finish(job);
    } catch (err) {
      console.error("multisend", err);
      steps(labels(), done(), null, active);
      const sent = Math.min(job.sent, rows.length);
      if (err && err.row) {
        say("bad", `<b>${esc(tr(`Line ${err.row.line}`))}</b> ${esc(tr("would fail:"))} <span data-no-i18n>${esc(err.reason || tr("the token refused this transfer"))}</span>
          <span>${esc(tr(`${plural(sent, "wallet", "wallets")} already got theirs.`))}</span>
          <span><button type="button" class="ams-mini" data-skipfail>${esc(tr("Skip that wallet and continue"))}</button></span>`);
      } else say("bad", `${esc(rejected(err) ? tr("You cancelled in your wallet.") : errText(err))}${sent ? ` <span>${esc(tr(`${plural(sent, "wallet", "wallets")} already got theirs — nothing is sent twice.`))}</span>` : ""}`);
      paintResume();
    } finally {
      F.busy = false;
      panel.classList.remove("ams-sending");
      goFill(0);
      await readBalance();
      update();
      bumpStats(true);
    }
  }
  // claim drop: approve + one deposit, then the list goes to the server so claimers get proofs
  async function runDrop(job) {
    const addr = DROPC();
    if (!addr) return;
    F.busy = true;
    $("ams-go").disabled = true;
    panel.classList.add("ams-sending");
    say("wait", esc(tr("Getting ready…")));
    const labels = [["approve", tr("Approve")], ["deposit", tr("Deposit")], ["publish", tr("Publish list")]];
    const done = [];
    let active = "approve";
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      const rows = job.rows.map(([a, v]) => [a, BigInt(v)]);
      const total = rows.reduce((s, [, v]) => s + v, 0n);
      const tree = buildTree(rows);
      steps(labels, done, active);
      if (job.dropId == null) {
        const bal = await new ethers.Contract(job.token, TOK_ABI, lr()).balanceOf(state.account);
        if (bal < total) throw new Error(tr(`Not enough ${job.sym} — this needs ${fmt(total, job.dec)}, you have ${fmt(bal, job.dec)}.`));
        await ensureAllowance(job.token, addr, total);
        done.push("approve"); active = "deposit"; steps(labels, done, active);
        const d = new ethers.Contract(addr, DROP_ABI, state.signer);
        const endsAt = job.endsIn ? BigInt(Math.floor(Date.now() / 1000) + job.endsIn * 86400 + 600) : 0n;
        say("wait", esc(tr("Confirm the deposit in your wallet…")));
        await d.create.staticCall(job.token, tree.root, total, rows.length, endsAt);
        const tx = await d.create(job.token, tree.root, total, rows.length, endsAt);
        say("wait", `${esc(tr("Depositing…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
        const rc = await tx.wait();
        const ev = rc.logs.map((l) => { try { return d.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "DropCreated");
        if (!ev) throw new Error("The deposit went through but its drop number wasn't found — open ArcScan to check.");
        job.dropId = Number(ev.args.id); job.txs = [tx.hash]; saveJob(job);
      } else done.push("approve");
      done.push("deposit"); active = "publish"; steps(labels, done, active);
      say("wait", esc(tr("Publishing the claim list…")));
      let ok = false, last = "";
      for (let t = 0; t < 4 && !ok; t++) {
        const r = await fetchJson("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dropsave", id: job.dropId, rows: rows.map(([a, v]) => [a, v.toString()]) }) }, 30000);
        ok = !!(r.j && r.j.ok); last = (r.j && r.j.error) || "";
        if (!ok) await sleep(2000 * (t + 1));
      }
      if (!ok) throw new Error(tr("The deposit is on Arc, but the claim list couldn't be published yet") + (last ? ` (${last})` : "") + ". " + tr("Press Resume to try again."));
      done.push("publish"); steps(labels, done, null);
      finish(job);
    } catch (err) {
      console.error("drop", err);
      steps(labels, done, null, active);
      say("bad", esc(rejected(err) ? tr("You cancelled in your wallet.") : errText(err)));
      paintResume();
    } finally {
      F.busy = false;
      panel.classList.remove("ams-sending");
      await readBalance();
      update();
    }
  }
  function finish(job) {
    saveJob(null);
    const hist = loadHist();
    hist.unshift({ id: job.id, at: Date.now(), mode: job.mode, kind: job.kind, token: job.token, sym: job.sym, dec: job.dec, n: job.rows.length, total: job.total, txs: job.txs, drop: job.dropId, rows: job.rows.length <= 2000 ? job.rows.map((r) => r.slice(0, 3)) : null });
    try { localStorage.setItem(HIST, JSON.stringify(hist.slice(0, 15))); } catch { /* private mode */ }
    renderHist();
    paintResume();
    const n = job.rows.length;
    const what = job.mode === "nft" ? plural(n, "NFT", "NFTs") : job.total ? `${fmt(BigInt(job.total), job.dec)} ${job.sym}` : tr("Tokens");
    const shareUrl = job.mode === "drop" ? `${location.origin}/claim/${job.dropId}` : `${location.origin}/drop/${job.txs.join(",")}`;
    const tweet = job.mode === "drop"
      ? `Airdrop: ${what} for ${n.toLocaleString("en-US")} wallets on @ARCIRCLEonArc — claim yours:`
      : `Just airdropped ${what} to ${n.toLocaleString("en-US")} wallets on Arc with the @ARCIRCLEonArc Multisender 💚`;
    const head = job.mode === "drop" ? tr(`Drop #${job.dropId} is live — ${what} for ${plural(n, "wallet", "wallets")}.`) : tr(`Sent ${what} to ${plural(n, "wallet", "wallets")}.`);
    say("ok", `<div class="ams-done"><span class="ams-done-ico" aria-hidden="true"></span><div><b><span class="ams-count" data-n="${n}">0</span> <span>${esc(head)}</span></b>
      <span>${job.txs.map((h, i) => `<a href="${explorer("tx", h)}" target="_blank" rel="noopener">${esc(job.txs.length === 1 ? "tx" : tr(`batch ${i + 1}`))} ↗</a>`).join(" ")}</span>
      <span>${job.mode === "drop" ? `<a class="ams-mini" href="#multisend?claim=${job.dropId}">${esc(tr("Open the claim page"))}</a>` : `<a class="ams-mini" href="#multisend?receipt=${job.txs.join(",")}">${esc(tr("View receipt"))}</a>`}
        <button type="button" class="ams-mini" data-copy-link="${esc(shareUrl)}">${esc(tr(job.mode === "drop" ? "Copy claim link" : "Copy receipt link"))}</button>
        <a class="ams-mini" href="https://x.com/intent/post?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a>
        ${job.rows.length <= 2000 && job.mode !== "drop" ? `<button type="button" class="ams-mini" data-receipt="${esc(job.id)}">CSV</button>` : ""}
        <button type="button" class="ams-mini" data-new>${esc(tr("New send"))}</button></span></div></div>`);
    const c = $("ams-status").querySelector(".ams-count");
    if (c) { if (typeof window.arcCountUp === "function" && !reduce) window.arcCountUp(c, n, (x) => Math.round(x).toLocaleString("en-US")); c.remove(); }
    burst();
    if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 80 });
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
  }
  function burst() {
    const em = panel.querySelector(".ams-emblem");
    if (em && !reduce) { em.classList.remove("fire"); void em.offsetWidth; em.classList.add("fire"); }
    const d = $("ams-dots");
    if (d && !reduce) { d.classList.remove("fire"); void d.offsetWidth; d.classList.add("fire"); }
    const st = $("ams-status");
    if (st && !reduce) { st.classList.remove("flip"); void st.offsetWidth; st.classList.add("flip"); }
  }
  function paintResume() {
    const box = $("ams-resume"), job = loadJob();
    if (!job || !(job.sent || job.approved || job.dropId != null)) { box.hidden = true; box.innerHTML = ""; return; }
    const n = job.rows.length;
    box.hidden = false;
    const what = job.mode === "drop" ? tr(`Drop #${job.dropId} is deposited — its claim list isn't published yet.`) : tr(`${job.sym} to ${plural(n, "wallet", "wallets")} — ${job.sent.toLocaleString("en-US")} of ${n.toLocaleString("en-US")} sent.`);
    box.innerHTML = `<div><b>${esc(tr("You have an unfinished send"))}</b><span>${esc(what)}</span></div>
      <button type="button" class="ams-btn" data-resume>${esc(tr("Resume"))}</button><button type="button" class="ams-mini" data-discard>${esc(tr("Discard"))}</button>`;
  }

  // ---------- history (this browser + sends found on Arc) ----------
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST) || "[]") || []; } catch { return []; } }
  function ago(t) {
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  }
  let chainHist = [];
  function renderHist() {
    const box = $("ams-hist"), local = loadHist();
    const seen = new Set(local.flatMap((x) => x.txs || []));
    const extra = chainHist.filter((x) => !(x.txs || [x.tx]).some((t) => seen.has(t))).map((x) => ({ id: x.tx, at: x.ts * 1000, mode: x.kind === "nft" ? "nft" : "token", sym: x.kind === "nft" ? x.sym : "$" + x.sym, dec: x.dec, n: x.n, total: x.total, txs: x.txs || [x.tx], chain: true }));
    const h = local.concat(extra).sort((a, b) => b.at - a.at).slice(0, 15);
    if (!h.length) { box.innerHTML = `<p class="ams-empty">${esc(tr("Nothing sent yet. Your sends show up here with their transactions and a receipt."))}</p>`; return; }
    box.innerHTML = `<ul class="ams-hlist">${h.map((x) => {
      const amt = x.mode === "nft" ? plural(x.n, "NFT", "NFTs") : x.total ? `${fmt(BigInt(x.total), x.dec)} ${esc(x.sym)}` : esc(x.sym);
      const link = x.mode === "drop" ? `#multisend?claim=${x.drop}` : `#multisend?receipt=${(x.txs || []).join(",")}`;
      return `<li><div><b data-no-i18n>${amt}</b><small>${esc(tr(x.mode === "drop" ? `claim drop · ${plural(x.n, "wallet", "wallets")}` : `to ${plural(x.n, "wallet", "wallets")}`))} · <span>${esc(tr(ago(x.at)))}</span></small></div>
        <span><a href="${esc(link)}">${esc(tr(x.mode === "drop" ? "Claim page" : "Receipt"))}</a>${x.rows ? ` <button type="button" class="ams-mini" data-receipt="${esc(x.id)}">CSV</button>` : ""}</span></li>`;
    }).join("")}</ul>`;
  }
  async function loadChainHist() {
    if (!state.account || !SENDER()) return;
    const r = await fetchJson(`/api/social?dropsby=${state.account}`);
    if (r.ok && r.j && Array.isArray(r.j.items)) { chainHist = r.j.items; renderHist(); }
  }
  function receiptCsv(id) {
    const job = loadHist().find((x) => x.id === id);
    if (!job || !job.rows) return;
    const nft = job.mode === "nft";
    const size = job.txs.length ? Math.ceil(job.rows.length / job.txs.length) : MAX_CHUNK;
    const lines = [nft ? "address,token_id,copies,transaction" : "address,amount,transaction"].concat(job.rows.map(([a, v, x], i) => (nft ? `${a},${x},${v},${job.txs[Math.floor(i / size)] || ""}` : `${a},${plain(BigInt(v), job.dec)},${job.txs[Math.floor(i / size)] || ""}`)));
    download(`multisend-${String(job.sym).replace(/[^A-Za-z0-9]/g, "")}-${new Date(job.at).toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copyText(t, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch {
      try { const x = document.createElement("textarea"); x.value = t; x.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(x); x.select(); ok = document.execCommand("copy"); x.remove(); } catch { ok = false; }
    }
    if (btn) { const old = btn.textContent; btn.textContent = tr(ok ? "Copied" : "Copy failed"); setTimeout(() => { btn.textContent = old; }, 1500); }
    return ok;
  }

  // ---------- stats + recent airdrops ----------
  let statsAt = 0;
  async function bumpStats(force) {
    const el = $("ams-stats"), addrs = [V1(), V2()].filter(Boolean);
    if (!el || !addrs.length || (!force && Date.now() - statsAt < 60000)) return;
    statsAt = Date.now();
    try {
      let b = 0, t = 0;
      for (const a of addrs) {
        const c = new ethers.Contract(a, ABI, lr());
        const [x, y] = await Promise.all([withRetry(() => c.batches()), withRetry(() => c.transfers())]);
        b += Number(x); t += Number(y);
      }
      if (!(t > 0)) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = `<span class="ams-stat"><b data-v="t">0</b><small>${esc(tr("transfers sent"))}</small></span><span class="ams-stat"><b data-v="b">0</b><small>${esc(tr(b === 1 ? "batch" : "batches"))}</small></span>`;
      const cu = (sel, v) => { const e = el.querySelector(sel); if (typeof window.arcCountUp === "function" && !reduce) window.arcCountUp(e, v, (x) => Math.round(x).toLocaleString("en-US")); else e.textContent = v.toLocaleString("en-US"); };
      cu('[data-v="t"]', t); cu('[data-v="b"]', b);
    } catch { el.hidden = true; }
  }
  let feedData = null, feedTab = "recent";
  async function loadFeed() {
    if (!SENDER()) return;
    const r = await fetchJson("/api/social?drops=recent");
    if (!r.ok || !r.j || !Array.isArray(r.j.recent)) return;
    feedData = r.j;
    paintFeed();
  }
  function paintFeed() {
    const box = $("ams-feed");
    const items = feedData ? feedData[feedTab] || [] : [];
    box.hidden = !feedData || !(feedData.recent || []).length;
    if (box.hidden) return;
    box.querySelectorAll("[data-feed]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.feed === feedTab)));
    $("ams-feed-list").innerHTML = items.map((x, i) => {
      const amt = x.kind === "nft" ? plural(Number(x.total || x.n), "NFT", "NFTs") + " · " + x.sym : x.total ? `${fmt(BigInt(x.total), x.dec)} $${x.sym}` : "";
      return `<li style="--i:${i}"><a href="#multisend?receipt=${esc(x.tx)}"><b data-no-i18n>${esc(amt)}</b><span>${esc(tr(`to ${plural(x.n, "wallet", "wallets")}`))}</span><small data-no-i18n>${esc(short(x.sender))} · ${esc(tr(ago(x.ts * 1000)))}</small></a></li>`;
    }).join("");
  }

  // ---------- "did I get an airdrop?" ----------
  async function lookup(wallet) {
    const out = $("ams-look-out");
    wallet = String(wallet || "").trim();
    if (!isAddr(wallet)) { out.innerHTML = `<p class="ams-err">${esc(tr("Paste a wallet address (0x…)."))}</p>`; return; }
    out.innerHTML = `<div class="ams-load"><i></i><span>${esc(tr("Looking on Arc…"))}</span></div>`;
    const r = await fetchJson(`/api/social?received=${wallet}`, null, 20000);
    if (!r.ok || !r.j) { out.innerHTML = `<p class="ams-err">${esc(tr("Couldn't look this up right now — try again in a moment."))}</p>`; return; }
    const got = r.j.got || [], claims = r.j.claims || [];
    if (!got.length && !claims.length) { out.innerHTML = `<p class="ams-empty">${esc(tr("No Multisender airdrops for this wallet yet."))}</p>`; return; }
    out.innerHTML = `<ul class="ams-hlist">${claims.map((c) => `<li class="claim"><div><b data-no-i18n>${fmt(BigInt(c.amount), c.dec)} $${esc(c.sym)}</b><small>${esc(tr(`claim drop #${c.drop}`))}</small></div><a class="ams-btn sm" href="#multisend?claim=${c.drop}">${esc(tr("Claim"))}</a></li>`).join("")}
      ${got.map((g) => `<li><div><b data-no-i18n>${g.kind === "nft" ? `#${esc(g.id)} ${esc(g.sym)}` : `${fmt(BigInt(g.amount), g.dec)} $${esc(g.sym)}`}</b><small data-no-i18n>${esc(tr("from"))} ${esc(short(g.from))} · ${esc(tr(ago((g.ts || 0) * 1000)))}</small></div><a href="#multisend?receipt=${esc(g.tx)}">${esc(tr("Receipt"))}</a></li>`).join("")}</ul>`;
  }

  // ---------- receipt / claim views (#multisend?receipt=… / ?claim=…) ----------
  function closeView() {
    const v = $("ams-view");
    v.hidden = true; v.innerHTML = "";
    if (history.replaceState && /[?&](receipt|claim)=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#multisend");
  }
  async function showReceipt(txs) {
    const v = $("ams-view");
    v.hidden = false;
    v.innerHTML = `<div class="ams-card ams-rcpt"><div class="ams-load"><i></i><span>${esc(tr("Reading the receipt from Arc…"))}</span></div></div>`;
    v.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const r = await fetchJson(`/api/social?dropreceipt=${txs}`, null, 20000);
    if (!r.ok || !r.j) { v.innerHTML = `<div class="ams-card ams-rcpt"><button type="button" class="ams-x" data-view-close aria-label="${esc(tr("Close"))}">×</button><p class="ams-err">${esc(tr("That isn't a Multisender transaction, or Arc didn't answer."))}</p></div>`; return; }
    const d = r.j, nft = d.kind === "nft";
    const amt = nft ? plural(Number(d.total), "NFT", "NFTs") : d.kind === "multi" ? tr("Several tokens") : `${fmt(BigInt(d.total), d.decimals)} $${d.symbol}`;
    const url = `${location.origin}/drop/${d.txs.join(",")}`;
    v.innerHTML = `<div class="ams-card ams-rcpt">
      <button type="button" class="ams-x" data-view-close aria-label="${esc(tr("Close"))}">×</button>
      <span class="ams-kicker">${esc(tr("Airdrop receipt · verified on Arc"))}</span>
      <h2 data-no-i18n>${esc(amt)}</h2>
      <p class="ams-rcpt-sub">${esc(tr(`to ${plural(d.wallets, "wallet", "wallets")}`))} · <span data-no-i18n>${esc(tr("from"))} <a href="${explorer("address", d.sender)}" target="_blank" rel="noopener">${esc(short(d.sender))}</a> · ${d.ts ? esc(new Date(d.ts * 1000).toLocaleString()) : ""}</span></p>
      <div class="ams-dots ams-rcpt-dots" aria-hidden="true">${Array.from({ length: Math.min(d.wallets, 300) }, (_, i) => `<i class="ok" style="--d:${(i % 60) * 14}ms"></i>`).join("")}</div>
      <div class="ams-rcpt-acts">${d.txs.map((h, i) => `<a class="ams-mini" href="${explorer("tx", h)}" target="_blank" rel="noopener">${esc(d.txs.length === 1 ? "tx" : tr(`batch ${i + 1}`))} ↗</a>`).join("")}
        <button type="button" class="ams-mini" data-copy-link="${esc(url)}">${esc(tr("Copy receipt link"))}</button>
        <a class="ams-mini" href="https://x.com/intent/post?text=${encodeURIComponent(`Airdrop: ${amt} to ${d.wallets} wallets on Arc — verified on-chain`)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a></div>
      <input type="search" class="ams-rcpt-q" placeholder="${esc(tr("Find your wallet"))}" autocomplete="off" spellcheck="false">
      <ol class="ams-rows ams-rcpt-rows">${d.rows.slice(0, 600).map(([a, val, x]) => `<li data-a="${esc(a)}"><a class="ams-addr" href="${explorer("address", a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(a))}</a><b data-no-i18n>${nft ? `#${esc(x)}${val !== "1" ? " × " + esc(val) : ""}` : d.kind === "multi" ? esc(val) + " · " + esc(short(x)) : fmt(BigInt(val), d.decimals)}</b></li>`).join("")}</ol>
      ${state.account ? `<p class="ams-rcpt-me">${d.rows.some(([a]) => lc(a) === lc(state.account)) ? esc(tr("Your wallet is on this airdrop.")) : ""}</p>` : ""}</div>`;
    const q = v.querySelector(".ams-rcpt-q");
    q.addEventListener("input", () => { const s = lc(q.value.trim()); v.querySelectorAll(".ams-rcpt-rows li").forEach((li) => { li.hidden = !!s && !li.dataset.a.includes(s); }); });
  }
  async function showClaim(id) {
    const v = $("ams-view");
    v.hidden = false;
    const addr = DROPC();
    if (!addr) { v.innerHTML = `<div class="ams-card ams-rcpt"><button type="button" class="ams-x" data-view-close aria-label="${esc(tr("Close"))}">×</button><p class="ams-err">${esc(tr("Claim drops aren't live yet."))}</p></div>`; return; }
    v.innerHTML = `<div class="ams-card ams-rcpt"><div class="ams-load"><i></i><span>${esc(tr("Reading the drop…"))}</span></div></div>`;
    v.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const c = new ethers.Contract(addr, DROP_ABI, lr());
    let d;
    try { d = await withRetry(() => c.getDrop(id)); } catch { v.innerHTML = `<div class="ams-card ams-rcpt"><button type="button" class="ams-x" data-view-close aria-label="${esc(tr("Close"))}">×</button><p class="ams-err">${esc(tr(`There's no drop #${id}.`))}</p></div>`; return; }
    const meta = await arcQuoteMeta(d.token).catch(() => ({ symbol: "TOKEN", decimals: 18 }));
    const ended = d.reclaimed || (Number(d.endsAt) && Date.now() / 1000 >= Number(d.endsAt));
    const pct = d.total > 0n ? Number((d.claimed * 1000n) / d.total) / 10 : 0;
    let mine = null;
    if (state.account) {
      const r = await fetchJson(`/api/social?dropproof=${id}&wallet=${state.account}`);
      mine = r.ok && r.j ? r.j : null;
      if (mine && mine.rows && mine.rows.length) {
        const flags = await Promise.all(mine.rows.map((x) => c.isClaimed(id, x.index).catch(() => false)));
        mine.rows.forEach((x, i) => { x.claimed = flags[i]; });
      }
    }
    const isCreator = state.account && lc(state.account) === lc(d.creator);
    const rowsHtml = !state.account ? `<button type="button" class="ams-btn" data-lkr-connect>${esc(tr("Connect a wallet to claim"))}</button>`
      : !mine || !mine.known ? `<p class="ams-empty">${esc(tr("This drop's list isn't published yet — check back soon."))}</p>`
      : !mine.rows.length ? `<p class="ams-empty">${esc(tr("This wallet isn't on the list."))}</p>`
      : mine.rows.map((x) => `<div class="ams-claim-row"><b data-no-i18n>${fmt(BigInt(x.amount), meta.decimals)} $${esc(meta.symbol)}</b>${x.claimed ? `<span class="ams-claimed">${esc(tr("Claimed"))}</span>` : ended ? `<span class="ams-claimed off">${esc(tr("Drop ended"))}</span>` : `<button type="button" class="ams-btn" data-claim="${x.index}" data-amt="${esc(x.amount)}">${esc(tr("Claim"))}</button>`}</div>`).join("");
    v.innerHTML = `<div class="ams-card ams-rcpt ams-claimcard" data-drop="${id}">
      <button type="button" class="ams-x" data-view-close aria-label="${esc(tr("Close"))}">×</button>
      <span class="ams-kicker">${esc(tr(`Claim drop #${id}`))}</span>
      <h2 data-no-i18n>${fmt(d.total, meta.decimals)} $${esc(meta.symbol)}</h2>
      <p class="ams-rcpt-sub">${esc(tr(`for ${plural(Number(d.recipients), "wallet", "wallets")}`))} · <span data-no-i18n>${esc(tr("from"))} <a href="${explorer("address", d.creator)}" target="_blank" rel="noopener">${esc(short(d.creator))}</a></span> · ${esc(tr(Number(d.endsAt) ? (ended ? "ended" : `open until ${new Date(Number(d.endsAt) * 1000).toLocaleDateString()}`) : "no end date"))}</p>
      <div class="ams-claimbar" style="--p:${pct}%"><i></i><span>${esc(tr(`${Number(d.claims).toLocaleString("en-US")} claimed · ${pct}% of the tokens`))}</span></div>
      <div class="ams-claim-rows">${rowsHtml}</div>
      ${isCreator && Number(d.endsAt) && ended && !d.reclaimed ? `<button type="button" class="ams-mini" data-reclaim="${id}">${esc(tr("Take back what's unclaimed"))}</button>` : ""}
      <div class="ams-rcpt-acts"><button type="button" class="ams-mini" data-copy-link="${esc(`${location.origin}/claim/${id}`)}">${esc(tr("Copy claim link"))}</button><a class="ams-mini" href="${explorer("address", addr)}" target="_blank" rel="noopener">ArcDrop ↗</a></div>
      <div class="ams-status" id="ams-claim-status" aria-live="polite"></div></div>`;
  }
  async function claimRow(btn) {
    const card = btn.closest("[data-drop]"), id = Number(card.dataset.drop), index = Number(btn.dataset.claim);
    const st = $("ams-claim-status"), put = (c, h) => { st.className = "ams-status " + c; st.innerHTML = h; };
    btn.disabled = true;
    try {
      await ensureArcForWrite();
      const r = await fetchJson(`/api/social?dropproof=${id}&wallet=${state.account}`);
      const row = r.j && r.j.rows && r.j.rows.find((x) => x.index === index);
      if (!row) throw new Error("Couldn't get your proof — try again.");
      const c = new ethers.Contract(DROPC(), DROP_ABI, state.signer);
      put("wait", esc(tr("Confirm the claim in your wallet…")));
      await c.claim.staticCall(id, index, state.account, row.amount, row.proof);
      const tx = await c.claim(id, index, state.account, row.amount, row.proof);
      put("wait", `${esc(tr("Claiming…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
      await tx.wait();
      put("ok", esc(tr("Claimed — it's in your wallet.")));
      if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 60 });
      setTimeout(() => showClaim(id), 1200);
    } catch (err) { btn.disabled = false; put("bad", esc(rejected(err) ? tr("You cancelled in your wallet.") : errText(err))); }
  }
  async function reclaim(id, btn) {
    btn.disabled = true;
    try {
      await ensureArcForWrite();
      const c = new ethers.Contract(DROPC(), DROP_ABI, state.signer);
      await (await c.reclaim(id)).wait();
      showClaim(id);
    } catch (err) { btn.disabled = false; $("ams-claim-status").innerHTML = esc(errText(err)); }
  }
  function fromHash() {
    const m = /^#multisend\?(.+)$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    if (q.get("receipt")) showReceipt(q.get("receipt").split(",").filter(isTx).slice(0, 25).join(","));
    else if (q.get("claim") && /^\d+$/.test(q.get("claim"))) showClaim(Number(q.get("claim")));
    else if (isAddr(q.get("token")) && (!F.info || lc(F.info.address) !== lc(q.get("token")))) { $("ams-token").value = q.get("token"); pickToken(q.get("token")); }
  }

  // ---------- the "airdrop to holders / contributors" sheet ----------
  const S = { src: "holders", token: "", data: null, loading: false, min: "", top: "", noContracts: true, noMe: true, dist: "each", value: "", tiers: [["", ""], ["", ""], ["", ""]] };
  function openSheet(src) {
    S.src = src; S.data = null;
    S.token = src === "holders" ? S.token || (F.info && !F.info.kind ? F.info.address : "") : "";
    $("ams-sheet-h").textContent = tr(src === "holders" ? "Airdrop to holders" : "CirclePad contributors");
    $("ams-sheet").hidden = false;
    document.documentElement.classList.add("ams-lock");
    requestAnimationFrame(() => $("ams-sheet").classList.add("in"));
    paintSheet();
    if (src === "circle") loadCircle();
  }
  function closeSheet() {
    $("ams-sheet").classList.remove("in");
    $("ams-sheet").hidden = true;
    document.documentElement.classList.remove("ams-lock");
  }
  async function loadHolders() {
    if (!isAddr(S.token)) return;
    S.loading = true; S.data = null; S.progress = tr("Reading the token's transfers on Arc…"); paintSheet();
    let last = null;
    for (let t = 0; t < 6; t++) {
      const r = await fetchJson(`/api/social?holdersnap=${S.token}`, null, 30000);
      if (!r.ok || !r.j) { last = null; break; }
      last = r.j;
      if (last.complete || !last.more) break;
      S.progress = tr(`Still reading — ${plural(last.holderCount || 0, "holder", "holders")} so far…`); paintSheet();
      await sleep(800);
    }
    S.loading = false;
    if (!last) { S.err = tr("Couldn't read the holders right now — try again in a moment."); paintSheet(); return; }
    const meta = await arcQuoteMeta(S.token).catch(() => ({ symbol: "TOKEN", decimals: last.decimals || 18 }));
    S.data = { sym: "$" + meta.symbol, dec: last.decimals, complete: last.complete, lite: last.lite, count: last.holderCount, rows: last.holders.map(([a, v, c]) => ({ a: lc(a), w: BigInt(v), c: !!c })) };
    S.err = null; paintSheet();
  }
  async function loadCircle() {
    S.loading = true; S.progress = tr("Reading the CirclePad round…"); paintSheet();
    const r = await fetchJson("/api/social?circle=lb", null, 25000);
    S.loading = false;
    const rows = r.ok && r.j && Array.isArray(r.j.rows) ? r.j.rows : null;
    if (!rows) { S.err = tr("Couldn't read the CirclePad round right now."); paintSheet(); return; }
    S.data = { sym: "USDC", dec: 6, complete: true, count: rows.length, rows: rows.map((x) => ({ a: lc(x.address), w: BigInt(x.amount), c: false })) };
    S.err = null; paintSheet();
  }
  function sheetRows() {
    if (!S.data) return [];
    const sys = SYSTEM(), me = lc(state.account);
    let rows = S.data.rows.filter((r) => !sys.has(r.a) && r.a !== lc(S.token) && !(S.noContracts && r.c) && !(S.noMe && me && r.a === me));
    if (S.min) { try { const m = ethers.parseUnits(cleanNum(S.min), S.data.dec); rows = rows.filter((r) => r.w >= m); } catch { /* ignore */ } }
    if (/^\d+$/.test(S.top) && Number(S.top) > 0) rows = rows.slice(0, Number(S.top));
    return rows;
  }
  function sheetAmounts(rows) {
    const dec = decOf();
    if (!F.info || F.info.kind) return null;
    if (S.dist === "tiers") {
      const tiers = S.tiers.map(([m, v]) => { try { return m !== "" && v !== "" ? [ethers.parseUnits(cleanNum(m), S.data.dec), ethers.parseUnits(cleanNum(v), dec)] : null; } catch { return null; } }).filter(Boolean).sort((a, b) => (b[0] > a[0] ? 1 : -1));
      if (!tiers.length) return null;
      return rows.map((r) => { const t = tiers.find(([m]) => r.w >= m); return t ? t[1] : 0n; });
    }
    let v;
    try { v = ethers.parseUnits(cleanNum(S.value), dec); } catch { return null; }
    if (!(v > 0n) || !rows.length) return null;
    if (S.dist === "each") return rows.map(() => v);
    if (S.dist === "even") { const x = rows.map(() => ({})); splitEven(x, v); return x.map((y) => y.amount); }
    const W = rows.reduce((s, r) => s + r.w, 0n);
    const x = rows.map((r) => ({ weight: r.w }));
    splitWeighted(x, v, W);
    return x.map((y) => y.amount);
  }
  function paintSheet() {
    const body = $("ams-sheet-body");
    const src = S.src, d = S.data;
    const rows = sheetRows(), amts = d ? sheetAmounts(rows) : null;
    const kept = amts ? rows.map((r, i) => [r, amts[i]]).filter(([, a]) => a > 0n) : [];
    const total = kept.reduce((s, [, a]) => s + a, 0n);
    const dec = decOf();
    const focus = document.activeElement && document.activeElement.id;
    body.innerHTML = `
      ${src === "holders" ? `<div class="ams-srow"><label for="ams-s-token">${esc(tr("Holders of"))}</label><div class="ams-sin"><input id="ams-s-token" type="text" spellcheck="false" placeholder="${esc(tr("Token contract address (0x…)"))}" value="${esc(S.token)}"><button type="button" class="ams-btn sm" data-sheet-load>${esc(tr("Load"))}</button></div>
        <div class="ams-chips">${[[USDC, "USDC"], ...(ARCIRCLE ? [[ARCIRCLE, "$ARCIRCLE"]] : []), ...(F.info && !F.info.kind && lc(F.info.address) !== USDC && lc(F.info.address) !== ARCIRCLE ? [[F.info.address, symOf()]] : [])].map(([a, s]) => `<button type="button" class="ams-chip${lc(S.token) === lc(a) ? " on" : ""}" data-sheet-token="${esc(a)}" data-no-i18n>${esc(s)}</button>`).join("")}</div></div>` : ""}
      ${S.loading ? `<div class="ams-load"><i></i><span>${esc(S.progress || "")}</span></div>` : ""}
      ${S.err ? `<p class="ams-err">${esc(S.err)}</p>` : ""}
      ${d ? `<p class="ams-sheet-meta">${esc(tr(`${plural(d.count, src === "holders" ? "holder" : "contributor", src === "holders" ? "holders" : "contributors")} found`))}${d.lite ? " · " + esc(tr("a very widely held token — only its largest holders are listed")) : !d.complete ? " · " + esc(tr("still reading older history — the list may grow")) : ""}</p>
        <div class="ams-sgrid">
          <label>${esc(tr(src === "holders" ? "Minimum holding" : "Minimum contribution"))}<input id="ams-s-min" type="text" inputmode="decimal" placeholder="0" value="${esc(S.min)}"></label>
          <label>${esc(tr("Only the top"))}<input id="ams-s-top" type="text" inputmode="numeric" placeholder="${esc(tr("all"))}" value="${esc(S.top)}"></label>
        </div>
        <label class="ams-scheck"><input type="checkbox" id="ams-s-noc"${S.noContracts ? " checked" : ""}> ${esc(tr("Leave out contracts (pools, lockers, exchanges)"))}</label>
        <label class="ams-scheck"><input type="checkbox" id="ams-s-nome"${S.noMe ? " checked" : ""}> ${esc(tr("Leave out my own wallet"))}</label>
        ${!F.info || F.info.kind ? `<p class="ams-warn">${esc(tr("Pick the token you're sending first (step 1)."))}</p>` : `
        <div class="ams-amodes ams-sdist" role="radiogroup">${[["each", "Same amount each"], ["even", "Split a total evenly"], ["prop", "Split by holding"], ["tiers", "Tiers"]].map(([k, l]) => `<button type="button" role="radio" data-sdist="${k}" aria-checked="${S.dist === k}">${esc(tr(l))}</button>`).join("")}</div>
        ${S.dist === "tiers" ? `<div class="ams-tiers">${S.tiers.map(([m, v], i) => `<div><span>${esc(tr("Holding at least"))}</span><input data-tier="${i}" data-k="0" type="text" inputmode="decimal" value="${esc(m)}" placeholder="${esc(d.sym)}"><span>${esc(tr("gets"))}</span><input data-tier="${i}" data-k="1" type="text" inputmode="decimal" value="${esc(v)}" placeholder="${esc(symOf())}"></div>`).join("")}</div>`
          : `<label class="ams-sval">${esc(tr(S.dist === "each" ? "Amount per wallet" : "Total to send"))}<span><input id="ams-s-val" type="text" inputmode="decimal" value="${esc(S.value)}" placeholder="0"><b data-no-i18n>${esc(symOf())}</b></span></label>`}
        <div class="ams-sprev"><b>${esc(tr(plural(kept.length, "wallet", "wallets")))}</b><span data-no-i18n>${kept.length ? `${fmt(total, dec)} ${esc(symOf())}` : "—"}</span></div>
        <ol class="ams-rows ams-srows">${kept.slice(0, 8).map(([r, a]) => `<li><span class="ams-addr" data-no-i18n>${esc(short(r.a))}</span><small data-no-i18n>${fmt(r.w, d.dec)} ${esc(d.sym)}</small><b data-no-i18n>${fmt(a, dec)}</b></li>`).join("")}</ol>
        <button type="button" class="ams-go ams-suse" data-sheet-use${kept.length ? "" : " disabled"}><span class="ams-go-txt">${esc(tr(`Use these ${plural(kept.length, "wallet", "wallets")}`))}</span></button>`}` : ""}`;
    if (focus) { const el = $(focus); if (el) { el.focus(); if (el.setSelectionRange && el.value != null) try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* number input */ } } }
    S.kept = kept;
  }
  function useSheet() {
    const kept = S.kept || [];
    if (!kept.length) return;
    F.am = "line"; renderAm();
    setList(kept.map(([r, a]) => `${ethers.getAddress(r.a)}, ${plain(a, decOf())}`).join("\n"), tr(`Loaded ${plural(kept.length, "wallet", "wallets")}.`));
    closeSheet();
    $("ams-step-list").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  // ---------- saved lists ----------
  function loadLists() { try { return JSON.parse(localStorage.getItem(LISTS) || "[]") || []; } catch { return []; } }
  function listsMenu() {
    let m = $("ams-lists");
    if (m) { m.remove(); return; }
    m = document.createElement("div");
    m.id = "ams-lists"; m.className = "ams-menu"; m.setAttribute("role", "menu");
    const lists = loadLists(), cur = ta().value.trim();
    m.innerHTML = `${lists.length ? `<ul>${lists.map((l, i) => `<li><button type="button" role="menuitem" data-load-list="${i}"><b>${esc(l.name)}</b><small>${esc(tr(plural(l.n, "wallet", "wallets")))} · ${esc(tr(ago(l.at)))}</small></button><button type="button" class="ams-del" data-del-list="${i}" aria-label="${esc(tr("Delete"))}">×</button></li>`).join("")}</ul>` : `<p class="ams-empty">${esc(tr("No saved lists yet."))}</p>`}
      ${cur ? `<form class="ams-savelist" data-save-list><input type="text" maxlength="40" placeholder="${esc(tr("Name this list"))}" aria-label="${esc(tr("Name this list"))}"><button type="submit" class="ams-mini">${esc(tr("Save"))}</button></form>` : ""}`;
    $("ams-lists-btn").after(m);
  }

  // ================= wiring =================
  function init() {
    const ct = $("ams-contract");
    if (SENDER() && ct) { ct.href = explorer("address", SENDER()); ct.hidden = false; }
    $("ams-preview").hidden = !!SENDER();
    renderModes(); renderAm();
    let tT;
    $("ams-token").addEventListener("input", (e) => {
      clearTimeout(tT);
      const v = e.target.value.trim();
      tT = setTimeout(() => { if (!v) pickToken(null); else if (ethers.isAddress(v)) pickToken(v); }, 250);
    });
    let lT;
    ta().addEventListener("input", () => { paintGutter(); paintStarts(); clearTimeout(lT); lT = setTimeout(reparse, 180); });
    ta().addEventListener("paste", () => setTimeout(sweep, 0));
    ta().addEventListener("scroll", () => { $("ams-gutter").scrollTop = ta().scrollTop; });
    $("ams-same").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\d.,]/g, ""); clearTimeout(lT); lT = setTimeout(reparse, 150); });
    $("ams-mixed").addEventListener("change", reparse);
    $("ams-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 2e6) { toast(tr("That file is too big — keep it under 2 MB.")); return; }
      const r = new FileReader();
      r.onload = () => { setList(String(r.result || "").replace(/^﻿/, ""), tr(`Loaded ${f.name.slice(0, 40)}.`)); e.target.value = ""; };
      r.readAsText(f);
    });
    ta().addEventListener("dragover", (e) => { e.preventDefault(); ta().classList.add("drag"); });
    ta().addEventListener("dragleave", () => ta().classList.remove("drag"));
    ta().addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      ta().classList.remove("drag");
      if (!f) return;
      e.preventDefault();
      f.text().then((t) => setList(t.replace(/^﻿/, ""), tr(`Loaded ${f.name.slice(0, 40)}.`)));
    });
    $("ams-addrow").addEventListener("submit", (e) => {
      e.preventDefault();
      const a = $("ams-add-addr").value.trim(), v = $("ams-add-amt").value.trim();
      if (!isAddr(a)) { toast(tr("That isn't a wallet address.")); $("ams-add-addr").focus(); return; }
      const line = F.am === "same" || F.am === "split" ? a : `${a}, ${v}`;
      const cur = ta().value.replace(/\s+$/, "");
      pushUndo();
      ta().value = cur ? cur + "\n" + line : line;
      $("ams-add-addr").value = ""; $("ams-add-amt").value = "";
      $("ams-add-addr").focus();
      reparse();
    });
    $("ams-undo").addEventListener("click", () => { const v = F.undo.pop(); if (v != null) { ta().value = v; reparse(); toast(tr("Undone.")); } $("ams-undo").hidden = !F.undo.length; });
    $("ams-lists-btn").addEventListener("click", (e) => { e.stopPropagation(); listsMenu(); });
    $("ams-go").addEventListener("click", start);
    $("ams-change").addEventListener("click", () => { collapseToken(false); $("ams-token").focus(); $("ams-token").select(); });
    $("ams-lookform").addEventListener("submit", (e) => { e.preventDefault(); lookup($("ams-look").value); });
    $("ams-sticky-go").addEventListener("click", () => $("ams-review").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => { reviewSeen = es.some((x) => x.isIntersecting); paintSticky(!!(F.P && !F.P.errors.length)); }).observe($("ams-review"));
    // the sheet
    const sheet = $("ams-sheet");
    sheet.addEventListener("click", (e) => {
      const t = e.target;
      if (t === sheet || t.closest("[data-close]")) { closeSheet(); return; }
      const tk = t.closest("[data-sheet-token]");
      if (tk) { S.token = tk.dataset.sheetToken; loadHolders(); return; }
      if (t.closest("[data-sheet-load]")) { S.token = $("ams-s-token").value.trim(); if (isAddr(S.token)) loadHolders(); else { S.err = tr("Paste a token contract address (0x…)."); paintSheet(); } return; }
      const ds = t.closest("[data-sdist]");
      if (ds) { S.dist = ds.dataset.sdist; paintSheet(); return; }
      if (t.closest("[data-sheet-use]")) useSheet();
    });
    sheet.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "ams-s-token") { S.token = t.value.trim(); return; }
      if (t.id === "ams-s-min") S.min = t.value; else if (t.id === "ams-s-top") S.top = t.value.replace(/\D/g, ""); else if (t.id === "ams-s-val") S.value = t.value;
      else if (t.dataset.tier != null) S.tiers[Number(t.dataset.tier)][Number(t.dataset.k)] = t.value;
      else return;
      clearTimeout(sheet.__t); sheet.__t = setTimeout(paintSheet, 250);
    });
    sheet.addEventListener("change", (e) => { if (e.target.id === "ams-s-noc") { S.noContracts = e.target.checked; paintSheet(); } if (e.target.id === "ams-s-nome") { S.noMe = e.target.checked; paintSheet(); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
    document.addEventListener("click", (e) => { const m = $("ams-lists"); if (m && !m.contains(e.target) && e.target !== $("ams-lists-btn")) m.remove(); });
    panel.addEventListener("submit", (e) => {
      const f = e.target.closest("[data-save-list]");
      if (!f) return;
      e.preventDefault();
      const name = f.querySelector("input").value.trim() || tr("My list");
      const lists = loadLists();
      const text = ta().value;
      lists.unshift({ name: name.slice(0, 40), at: Date.now(), n: text.split("\n").filter((l) => l.trim()).length, am: F.am, text: text.slice(0, 400000) });
      try { localStorage.setItem(LISTS, JSON.stringify(lists.slice(0, 20))); toast(tr("List saved in this browser.")); } catch { toast(tr("Couldn't save — this browser's storage is full.")); }
      const m = $("ams-lists"); if (m) m.remove();
    });
    panel.addEventListener("input", (e) => {
      if (e.target.id === "ams-q") { F.q = e.target.value; clearTimeout(e.target.__t); e.target.__t = setTimeout(() => { paintTable(); const q = $("ams-q"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 200); }
    });
    panel.addEventListener("change", (e) => { if (e.target.id === "ams-sort") { F.sort = e.target.value; paintTable(); } if (e.target.id === "ams-drop-end") update(); });
    panel.addEventListener("click", (e) => {
      const t = e.target;
      if (!t.closest || t.closest("#ams-sheet")) return;
      const md = t.closest("[data-mode]");
      if (md) { setMode(md.dataset.mode); return; }
      const amb = t.closest("[data-am]");
      if (amb) { if (F.busy) return; F.am = amb.dataset.am; renderAm(); reparse(); if (F.am !== "line") $("ams-same").focus(); return; }
      const chip = t.closest("#ams-quick [data-token]");
      if (chip) { $("ams-token").value = chip.dataset.token; pickToken(chip.dataset.token); return; }
      const op = t.closest("[data-open]");
      if (op) { openSheet(op.dataset.open); return; }
      const st = t.closest("[data-start]");
      if (st) { if (st.dataset.start === "csv") $("ams-file").click(); else ta().focus(); return; }
      const go = t.closest("#ams-flow [data-go]");
      if (go) { $(go.dataset.go).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
      const ln = t.closest("[data-line]");
      if (ln) {
        const n = Number(ln.dataset.line), lines = ta().value.split("\n");
        const startAt = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
        ta().focus(); ta().setSelectionRange(startAt, startAt + (lines[n - 1] || "").length);
        const lh = parseFloat(getComputedStyle(ta()).lineHeight) || 20;
        ta().scrollTop = Math.max(0, (n - 3) * lh);
        return;
      }
      const fix = t.closest("[data-fix]");
      if (fix && F.info) {
        const kind = fix.dataset.fix, lines = ta().value.split("\n");
        if (kind === "merge") { const before = F.P.rows.length; setList(mergeDuplicates(ta().value, decOf(), listOpts()), ""); toast(tr(`Merged ${plural(before - F.P.rows.length, "duplicate", "duplicates")}.`)); return; }
        const drop = new Set(kind === "drop" ? F.P.errors.map((x) => x.line)
          : kind === "fails" ? (F.checks ? F.checks.failed.map((x) => x.line) : [])
          : kind === "system" ? F.P.rows.filter((r) => r.sys || (F.info && lc(r.addr) === lc(F.info.address))).map((r) => r.line)
          : F.P.rows.filter((r) => !r.sys && F.code.get(lc(r.addr))).map((r) => r.line));
        setList(lines.filter((_, i) => !drop.has(i + 1)).join("\n"), tr(`Removed ${plural(drop.size, "line", "lines")}.`));
        return;
      }
      const del = t.closest("[data-del]");
      if (del) {
        const n = Number(del.dataset.del), li = del.closest("li");
        const doIt = () => setList(ta().value.split("\n").filter((_, i) => i + 1 !== n).join("\n"), "");
        if (li && !reduce) { li.classList.add("gone"); setTimeout(doIt, 220); } else doIt();
        return;
      }
      const ca = t.closest("[data-copy-addr]");
      if (ca) { copyText(ca.dataset.copyAddr).then((ok) => { if (ok) toast(tr("Address copied.")); }); return; }
      const cl = t.closest("[data-copy-link]");
      if (cl) { copyText(cl.dataset.copyLink, cl); return; }
      const ll = t.closest("[data-load-list]");
      if (ll) { const l = loadLists()[Number(ll.dataset.loadList)]; if (l) { F.am = l.am || "line"; renderAm(); setList(l.text, tr(`Loaded "${l.name}".`)); } const m = $("ams-lists"); if (m) m.remove(); return; }
      const dl = t.closest("[data-del-list]");
      if (dl) { const lists = loadLists(); lists.splice(Number(dl.dataset.delList), 1); try { localStorage.setItem(LISTS, JSON.stringify(lists)); } catch { /* ignore */ } $("ams-lists").remove(); listsMenu(); return; }
      if (t.closest("[data-resume]")) { const j = loadJob(); if (j) (j.mode === "drop" ? runDrop(j) : run(j)); return; }
      if (t.closest("[data-discard]")) { saveJob(null); paintResume(); return; }
      if (t.closest("[data-skipfail]")) {
        const j = loadJob();
        if (j && j.failLine != null) {
          j.rows = j.rows.filter((r) => r[3] !== j.failLine);
          const lines = ta().value.split("\n");
          if (lines[j.failLine - 1] != null) { pushUndo(); lines[j.failLine - 1] = ""; ta().value = lines.join("\n"); }
          j.failLine = null; saveJob(j); run(j);
        }
        return;
      }
      const rc = t.closest("[data-receipt]");
      if (rc) { receiptCsv(rc.dataset.receipt); return; }
      if (t.closest("[data-new]")) { pushUndo(); ta().value = ""; say("", ""); steps(null); reparse(); $("ams-step-list").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
      if (t.closest("[data-view-close]")) { closeView(); return; }
      const cb = t.closest("[data-claim]");
      if (cb) { claimRow(cb); return; }
      const rb = t.closest("[data-reclaim]");
      if (rb) { reclaim(Number(rb.dataset.reclaim), rb); return; }
      if (t.closest("[data-lkr-connect]")) { if (typeof connectWallet === "function") connectWallet(); return; }
      const fb = t.closest("[data-feed]");
      if (fb) { feedTab = fb.dataset.feed; paintFeed(); }
    });
    renderChips();
    renderHist();
    paintResume();
    paintGutter();
    paintStarts();
    paintDots();
    update();
  }
  let booted = false;
  function onShow() {
    if (!booted) { booted = true; init(); }
    renderChips();
    bumpStats();
    loadFeed();
    loadChainHist();
    if (state.account && !$("ams-look").value) $("ams-look").value = state.account;
    if (F.info) readBalance().then(update);
    fromHash();
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "multisend") onShow(); });
  window.addEventListener("hashchange", () => { if (booted && /^#multisend\?/.test(location.hash)) fromHash(); });
  // after i18n.js (last in the bundle) has set the language
  if (panel.classList.contains("active")) setTimeout(onShow, 0);
  let seen = state.account;
  setInterval(() => {
    if (booted && state.account !== seen) {
      seen = state.account; renderChips(); readBalance().then(update); loadChainHist(); dryRun();
      if (state.account && !$("ams-look").value) $("ams-look").value = state.account;
    }
  }, 1500);
  window.arcMultisend = { parseList, mergeDuplicates, buildTree, splitEven, CHUNK: MAX_CHUNK, state: F };
})();
