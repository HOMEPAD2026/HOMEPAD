/* global ethers, CONFIG, state, readProvider, withRetry, connectWallet, ensureArcForWrite, govLogoUrl */
// arc-relay.js — Relay Launch, an ARCIRCLE PAD utility (arcpad.html#relay).
// Every CirclePad round ends as a coin on Argus, and the coin is relayed:
//
//   1. Round     the round's result, read from the chain: raised, contributors,
//                and the name / ticker / logo / roadmap / date the vote picked
//   2. Launch    the full Argus Portal #7 launch form, filled from the vote —
//                identity, taxes, where the tax goes, the price range, the
//                dev buy — with every check the Portal would make, the hook
//                address mined in the browser, a simulation, then approve +
//                launch from the round's recipient wallet (CONFIG.RELAY.OPERATOR)
//   3. Relay     the dev-buy tokens split between the round's contributors
//                (by what they put in) and every wallet holding at least
//                CONFIG.RELAY.MIN_ARCIRCLE $ARCIRCLE at a snapshot block (by
//                balance, ArcLock-locked tokens counted for their owners);
//                one list, a CSV, straight into the Multisender
//
// Holding $ARCIRCLE is the relay ticket: every round's coin goes to the
// holders at that round's snapshot — N+1, N+2, N+3 and on.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-relay");
  if (!panel || typeof CONFIG === "undefined" || !CONFIG.ARGUS || !CONFIG.RELAY) return;

  // ---------------- basics ----------------
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  const lr = () => readProvider();
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const EXPL = (kind, x) => `${CONFIG.BLOCK_EXPLORER || "https://explorer.arc.io"}/${kind}/${x}`;
  const AG = CONFIG.ARGUS, RL = CONFIG.RELAY;
  const USDC = CONFIG.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
  const ARC_TOKEN = CONFIG.ARCIRCLE_TOKEN || "";
  const OPERATOR = RL.OPERATOR;
  const SUPPLY = 1_000_000_000n * 10n ** 18n;
  const nf = (n, d = 2) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
  const units = (raw, dec, d = 2) => nf(Number(ethers.formatUnits(raw, dec)), d);
  const plain = (raw, dec) => ethers.formatUnits(raw, dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const bpsOf = (s) => { const x = Number(String(s).trim()); return isFinite(x) ? Math.round(x * 100) : NaN; };
  async function fetchJson(url, ms = 20000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal, cache: "no-store" }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }

  // ---------------- ABIs ----------------
  // Argus Portal #7: from the published bundle (argus-v4.json v3), events, errors and the calls used here
  const PORTAL_ABI = [{"type":"function","name":"LAUNCH_STRUCT_WORDS","inputs":[],"outputs":[{"name":"","type":"uint8"}],"stateMutability":"view"},{"type":"function","name":"devBuyMaxBps","inputs":[],"outputs":[{"name":"","type":"uint16"}],"stateMutability":"view"},{"type":"function","name":"hookCreate2Salt","inputs":[{"name":"creator","type":"address"},{"name":"hookSalt","type":"bytes32"}],"outputs":[{"name":"","type":"bytes32"}],"stateMutability":"pure"},{"type":"function","name":"hookInitCodeHash","inputs":[{"name":"splitter_","type":"address"},{"name":"buyTaxBps","type":"uint16"},{"name":"sellTaxBps","type":"uint16"},{"name":"quote","type":"address"}],"outputs":[{"name":"","type":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"launch","inputs":[{"name":"p","type":"tuple","components":[{"name":"name","type":"string"},{"name":"symbol","type":"string"},{"name":"totalSupply","type":"uint256"},{"name":"startFdvUsdc6","type":"uint256"},{"name":"bondFdvUsdc6","type":"uint256"},{"name":"buyTaxBps","type":"uint16"},{"name":"sellTaxBps","type":"uint16"},{"name":"creatorBps","type":"uint16"},{"name":"burnBps","type":"uint16"},{"name":"dividendBps","type":"uint16"},{"name":"liquidityBps","type":"uint16"},{"name":"devBuyQuote","type":"uint256"},{"name":"quoteAsset","type":"address"},{"name":"expectConvert","type":"uint8"}]},{"name":"meta","type":"tuple","components":[{"name":"imageURI","type":"string"},{"name":"website","type":"string"},{"name":"twitter","type":"string"},{"name":"telegram","type":"string"},{"name":"description","type":"string"}]},{"name":"salt","type":"bytes32"},{"name":"hookSalt","type":"bytes32"}],"outputs":[{"name":"","type":"address"}],"stateMutability":"nonpayable"},{"type":"function","name":"launches","inputs":[{"name":"token","type":"address"}],"outputs":[{"name":"","type":"address"},{"name":"","type":"int24"},{"name":"","type":"bool"},{"name":"","type":"address"},{"name":"","type":"address"},{"name":"","type":"address"},{"name":"","type":"uint16"},{"name":"","type":"uint16"},{"name":"","type":"uint256"},{"name":"","type":"int24"},{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"lockerImpl","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"predictHook","inputs":[{"name":"creator","type":"address"},{"name":"salt","type":"bytes32"},{"name":"hookSalt","type":"bytes32"},{"name":"buyTaxBps","type":"uint16"},{"name":"sellTaxBps","type":"uint16"},{"name":"quote","type":"address"}],"outputs":[{"name":"","type":"address"},{"name":"","type":"uint160"},{"name":"","type":"bool"}],"stateMutability":"view"},{"type":"function","name":"predictSplitter","inputs":[{"name":"creator","type":"address"},{"name":"salt","type":"bytes32"}],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"predictToken","inputs":[{"name":"creator","type":"address"},{"name":"salt","type":"bytes32"},{"name":"hook","type":"address"},{"name":"quote","type":"address"}],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"quoteApproved","inputs":[{"name":"quote","type":"address"}],"outputs":[{"name":"","type":"bool"}],"stateMutability":"view"},{"type":"function","name":"registry","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"splitterImpl","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"tokenImpl","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},{"type":"function","name":"treasuryBps","inputs":[],"outputs":[{"name":"","type":"uint16"}],"stateMutability":"view"},{"type":"event","name":"DevBuy","inputs":[{"name":"token","type":"address","indexed":true},{"name":"creator","type":"address","indexed":true},{"name":"quoteIn","type":"uint256","indexed":false},{"name":"tokensOut","type":"uint256","indexed":false}],"anonymous":false},{"type":"event","name":"TokenCreated","inputs":[{"name":"token","type":"address","indexed":true},{"name":"creator","type":"address","indexed":true},{"name":"name","type":"string","indexed":false},{"name":"symbol","type":"string","indexed":false},{"name":"poolId","type":"bytes32","indexed":false},{"name":"imageURI","type":"string","indexed":false},{"name":"website","type":"string","indexed":false},{"name":"twitter","type":"string","indexed":false},{"name":"telegram","type":"string","indexed":false}],"anonymous":false},{"type":"error","name":"DefaultQuoteNotRevocable","inputs":[]},{"type":"error","name":"DelayAboveCeiling","inputs":[]},{"type":"error","name":"DelayNotRaised","inputs":[]},{"type":"error","name":"DevBuyExceedsCap","inputs":[]},{"type":"error","name":"DividendWithoutRewardTracker","inputs":[]},{"type":"error","name":"ExpectConvertOutOfRange","inputs":[]},{"type":"error","name":"FailedDeployment","inputs":[]},{"type":"error","name":"HookCodeMustBeSubmitted","inputs":[]},{"type":"error","name":"HookDeployFailed","inputs":[]},{"type":"error","name":"HookHasNoCode","inputs":[{"name":"hook","type":"address"}]},{"type":"error","name":"HookSaltInvalid","inputs":[{"name":"produced","type":"address"},{"name":"mask","type":"uint160"}]},{"type":"error","name":"HookStoreDeployFailed","inputs":[]},{"type":"error","name":"HookStoreMalformed","inputs":[]},{"type":"error","name":"HookStoreUnreadable","inputs":[]},{"type":"error","name":"InsufficientBalance","inputs":[{"name":"balance","type":"uint256"},{"name":"needed","type":"uint256"}]},{"type":"error","name":"InvalidAllocation","inputs":[]},{"type":"error","name":"InvalidConfig","inputs":[]},{"type":"error","name":"LaunchGriefed","inputs":[]},{"type":"error","name":"LiquidityOverflow","inputs":[]},{"type":"error","name":"NotAdmin","inputs":[]},{"type":"error","name":"NotQueued","inputs":[]},{"type":"error","name":"NotSingleSided","inputs":[]},{"type":"error","name":"PayoutAssetChanged","inputs":[{"name":"payoutAsset","type":"address"}]},{"type":"error","name":"PointerUnchanged","inputs":[]},{"type":"error","name":"PoolMispriced","inputs":[]},{"type":"error","name":"PositionLiquidityMismatch","inputs":[]},{"type":"error","name":"PositionNotDelivered","inputs":[]},{"type":"error","name":"PositionPoolMismatch","inputs":[]},{"type":"error","name":"PositionRangeMismatch","inputs":[]},{"type":"error","name":"PriceOutOfRange","inputs":[]},{"type":"error","name":"QuoteAlreadyApproved","inputs":[]},{"type":"error","name":"QuoteConsumed","inputs":[]},{"type":"error","name":"QuoteNotApproved","inputs":[]},{"type":"error","name":"QuoteNotConvertible","inputs":[]},{"type":"error","name":"QuoteShape","inputs":[]},{"type":"error","name":"ReentrancyGuardReentrantCall","inputs":[]},{"type":"error","name":"RewardTrackerWithoutDividend","inputs":[]},{"type":"error","name":"SafeERC20FailedOperation","inputs":[{"name":"token","type":"address"}]},{"type":"error","name":"SeedFailed","inputs":[]},{"type":"error","name":"SplitterRegistryMismatch","inputs":[]},{"type":"error","name":"SupplyNotAnchored","inputs":[]},{"type":"error","name":"SupplyTooLarge","inputs":[]},{"type":"error","name":"TaxTooHigh","inputs":[]},{"type":"error","name":"TickRangeInvalid","inputs":[]},{"type":"error","name":"TimelockNotElapsed","inputs":[{"name":"eta","type":"uint64"}]},{"type":"error","name":"UnexpectedCallback","inputs":[]},{"type":"error","name":"ZeroAddress","inputs":[]},{"type":"error","name":"ZeroTaxNotAllowed","inputs":[]}];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)", "function symbol() view returns (string)", "function name() view returns (string)"];
  const ESCROW_ABI = ["function totalRaised() view returns (uint256)", "function deadline() view returns (uint256)", "function isOpen() view returns (bool)", "function started() view returns (bool)", "function recipient() view returns (address)"];
  const BALLOT_ABI = ["function optionsSet(uint8) view returns (bool)", "function options(uint8) view returns (string[])"];
  const BURN_ABI = ["function tallies(uint8) view returns (uint256[])", "function totalBurned() view returns (uint256)", "function totalVotes() view returns (uint256)"];
  const PI = new ethers.Interface(PORTAL_ABI);
  const portalR = () => new ethers.Contract(AG.PORTAL, PORTAL_ABI, lr());
  const CATS = ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date"];
  const ERRTXT = {
    ZeroTaxNotAllowed: "Buy and sell tax can't both be 0%.", TaxTooHigh: "A tax is above 10%.", InvalidAllocation: "The four allocation shares must add up to exactly 100%.",
    QuoteNotApproved: "Argus doesn't accept this pairing asset.", DevBuyExceedsCap: "The dev buy is larger than Argus allows.", PriceOutOfRange: "The start or bonding FDV is outside the range Argus accepts.",
    TickRangeInvalid: "The start and bonding FDV give an invalid price range — make the bonding FDV higher than the start.", HookSaltInvalid: "The hook address doesn't carry the right flags — mine it again.",
    DividendWithoutRewardTracker: "Dividends need a reward tracker this Portal isn't set up with — set dividends to 0%.", PayoutAssetChanged: "The payout asset changed on Argus — reload the page.",
    SupplyTooLarge: "The total supply is too large.", SupplyNotAnchored: "The total supply doesn't fit Argus's price math.", LaunchGriefed: "Someone used this salt first — generate new salts and try again.",
    InsufficientBalance: "Not enough USDC for the dev buy.", SafeERC20FailedOperation: "The USDC for the dev buy couldn't be pulled — approve the Portal first.",
  };
  function why(err) {
    if (err && (err.code === "ACTION_REJECTED" || err.code === 4001)) return tr("You rejected the request in your wallet.");
    const data = err && (err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data));
    if (typeof data === "string" && data.length >= 10) {
      try { const e = PI.parseError(data); if (e) return tr(ERRTXT[e.name] || e.name); } catch { /* not ours */ }
    }
    const m = String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    const hit = Object.keys(ERRTXT).find((k) => m.includes(k));
    return hit ? tr(ERRTXT[hit]) : m.slice(0, 220);
  }

  // ---------------- state ----------------
  const R = {
    n: RL.ROUNDS.length ? RL.ROUNDS[RL.ROUNDS.length - 1].n : 1,
    round: null,       // what the chain says about the selected round
    lb: null,          // contributors (net, at the close)
    checks: {},        // launch pre-flight results
    mined: null,       // { key, salt, hookSalt, hook, token, splitter }
    launched: null,    // { token, tx, tokensOut, quoteIn, block }
    snap: null,        // $ARCIRCLE holders at a block
    plan: null,        // the relay list
    busy: false,
  };
  const roundCfg = () => RL.ROUNDS.find((r) => r.n === R.n) || RL.ROUNDS[0];
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const isOperator = () => me() === lc(OPERATOR);
  const LS = (k) => `arcircle.relay.${k}.${R.n}`;
  const save = (k, v) => { try { localStorage.setItem(LS(k), JSON.stringify(v)); } catch { /* private window */ } };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(LS(k)) || "null"); } catch { return null; } };

  // ---------------- the page ----------------
  function shell() {
    panel.insertAdjacentHTML("beforeend", `
      <div class="arl-chain" id="arl-chain" aria-label="${T("The relay")}"></div>
      <div class="arl-top">
        <div class="ams-card arl-me" id="arl-me"></div>
        <div class="ams-card arl-how">
          <div class="ams-card-head"><h2>${T("How the relay works")}</h2></div>
          <ol class="arl-how-list">
            <li><b>${T("A CirclePad round closes")}</b><span>${T("Its recipient wallet receives the raise; the vote has picked the coin.")}</span></li>
            <li><b>${T("The coin launches on Argus")}</b><span>${T("From that wallet, with a dev buy in the same transaction — no sniping window.")}</span></li>
            <li><b>${T("The first buy is relayed")}</b><span>${T("To the round's contributors, by what they put in, and to every wallet holding $ARCIRCLE at the snapshot.")}</span></li>
            <li><b>${T("Then the next round")}</b><span>${T("Keep holding $ARCIRCLE and you receive every relay — N+1, N+2, N+3 and on.")}</span></li>
          </ol>
        </div>
      </div>
      <div class="arl-op" id="arl-op"></div>
      <ol class="ams-flow arl-flow" aria-label="${T("Steps")}">
        <li data-go="arl-s1"><i>1</i><span>${T("The round")}</span></li>
        <li data-go="arl-s2"><i>2</i><span>${T("Launch on Argus")}</span></li>
        <li data-go="arl-s3"><i>3</i><span>${T("Relay")}</span></li>
      </ol>
      <div class="ams-card arl-step" id="arl-s1"></div>
      <div class="ams-card arl-step" id="arl-s2"></div>
      <div class="ams-card arl-step" id="arl-s3"></div>
      <p class="ams-foot">${T("Launches go through Argus Portal #7")} <a href="${EXPL("address", AG.PORTAL)}" target="_blank" rel="noopener" data-no-i18n>${short(AG.PORTAL)} ↗</a> · ${T("tokens are relayed with the Multisender")} · ${T("nothing here holds your funds.")}</p>`);
    panel.querySelector(".arl-flow").addEventListener("click", (e) => {
      const li = e.target.closest("[data-go]");
      if (li) { const el = $(li.dataset.go); if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    });
  }

  // ================= the relay chain + "my relay" =================
  function paintChain() {
    const el = $("arl-chain");
    const nodes = RL.ROUNDS.map((r) => {
      const live = r.launch && isAddr(r.launch.token);
      const cur = r.n === R.n;
      return `<button type="button" class="arl-node${live ? " done" : ""}${cur ? " on" : ""}" data-n="${r.n}">
        <span class="arl-ring"><b data-no-i18n>N${r.n}</b></span>
        <span class="arl-node-t"><b>${T(r.label)}</b><small>${live ? `<span data-no-i18n>${esc(r.launch.symbol ? "$" + r.launch.symbol : short(r.launch.token))}</span> · <span>${T("relayed")}</span>` : T(cur && R.round && R.round.open ? "Raising now" : "Relay pending")}</small></span></button>`;
    });
    nodes.push(`<div class="arl-node next" aria-hidden="true"><span class="arl-ring"><b data-no-i18n>N${(RL.ROUNDS[RL.ROUNDS.length - 1] || { n: 0 }).n + 1}</b></span><span class="arl-node-t"><b>${T("The next round")}</b><small>${T("Holders receive it too")}</small></span></div>`);
    el.innerHTML = `<div class="arl-chain-track">${nodes.join('<i class="arl-link" aria-hidden="true"></i>')}</div>`;
  }
  let meFor = null;
  async function paintMe(addr) {
    const box = $("arl-me");
    addr = addr || me();
    const head = `<div class="ams-card-head"><h2>${T("My relay")}</h2></div>
      <form class="arl-me-form" id="arl-me-form" autocomplete="off"><input id="arl-me-addr" type="text" spellcheck="false" placeholder="${T("Wallet address (0x…)")}" value="${esc(addr || "")}" aria-label="${T("Wallet address")}"><button type="submit" class="ams-mini">${T("Check")}</button></form>`;
    if (!isAddr(addr)) { box.innerHTML = head + `<p class="arl-muted">${T("Connect or paste a wallet to see whether it's in the next relay.")}</p>`; return; }
    meFor = lc(addr);
    box.innerHTML = head + `<p class="arl-muted">${T("Checking…")}</p>`;
    try {
      const min = BigInt(RL.MIN_ARCIRCLE) * 10n ** 18n;
      const bal = isAddr(ARC_TOKEN) ? await retry(() => new ethers.Contract(ARC_TOKEN, ERC20, lr()).balanceOf(addr)) : 0n;
      const lb = await loadLb().catch(() => null);
      const mine = lb ? lb.find((x) => lc(x.address) === lc(addr)) : null;
      const got = [];
      for (const r of RL.ROUNDS) {
        if (!r.launch || !isAddr(r.launch.token)) continue;
        const b = await retry(() => new ethers.Contract(r.launch.token, ERC20, lr()).balanceOf(addr)).catch(() => null);
        got.push({ r, b });
      }
      if (meFor !== lc(addr)) return;
      const ok = bal >= min;
      box.innerHTML = head + `<div class="arl-me-grid">
          <div class="arl-me-t ${ok ? "ok" : ""}"><small>$ARCIRCLE</small><b data-no-i18n>${units(bal, 18, 0)}</b><span>${ok ? T("In the next relay") : `<span data-no-i18n>${units(min - bal, 18, 0)}</span> <span>${T("more $ARCIRCLE to join the next relay")}</span>`}</span></div>
          <div class="arl-me-t ${mine ? "ok" : ""}"><small>${T(roundCfg().label)}</small><b data-no-i18n>${mine ? units(BigInt(mine.amount), 18, 2) + " USDC" : "—"}</b><span>${T(mine ? "Contributor — in this round's relay" : "Not a contributor")}</span></div>
        </div>
        ${got.length ? `<ul class="arl-got">${got.map((g) => `<li><b data-no-i18n>N${g.r.n}</b><span data-no-i18n>${esc(g.r.launch.symbol ? "$" + g.r.launch.symbol : short(g.r.launch.token))}</span><em data-no-i18n>${g.b == null ? "—" : units(g.b, 18, 2)}</em></li>`).join("")}</ul>` : ""}
        <p class="arl-muted">${T("The relay counts balances at a snapshot block taken when each round's coin launches. Tokens locked in ArcLock count for their owner.")}</p>`;
    } catch (e) { if (meFor === lc(addr)) box.innerHTML = head + `<p class="arl-muted">${T("Couldn't read this wallet right now — try again in a moment.")}</p>`; }
  }
  panel.addEventListener("submit", (e) => {
    if (e.target.id === "arl-me-form") { e.preventDefault(); paintMe($("arl-me-addr").value.trim()); }
  });
  panel.addEventListener("click", (e) => {
    const n = e.target.closest(".arl-node[data-n]");
    if (n) { R.n = Number(n.dataset.n); R.round = null; R.mined = null; R.launched = load("launch"); R.plan = null; paintChain(); loadRound(); }
  });

  // ================= who can do what =================
  function paintOp() {
    const el = $("arl-op");
    const who = me();
    let cls = "", html;
    if (!who) html = `<b>${T("Anyone can follow the relay here.")}</b><span>${T("Launching and relaying are done by the round's recipient wallet")} <span data-no-i18n>${short(OPERATOR)}</span>.</span><button type="button" class="ams-mini" data-arl-connect>${T("Connect wallet")}</button>`;
    else if (isOperator()) { cls = "ok"; html = `<b>${T("Recipient wallet connected")}</b><span>${T("You can launch this round's coin on Argus and relay it.")}</span>`; }
    else { cls = "warn"; html = `<b>${T("View only")}</b><span>${T("Launching and relaying need the round's recipient wallet")} <span data-no-i18n>${short(OPERATOR)}</span>. ${T("You're connected as")} <span data-no-i18n>${short(who)}</span>.</span>`; }
    el.className = "arl-op " + cls;
    el.innerHTML = html;
    panel.classList.toggle("arl-can", isOperator());
  }
  panel.addEventListener("click", async (e) => {
    if (e.target.closest("[data-arl-connect]") && typeof connectWallet === "function") { try { await connectWallet(); } catch { /* cancelled */ } tick(true); }
  });

  // ================= 1. the round =================
  async function loadLb() {
    if (R.lb && Date.now() - R.lb.at < 60e3) return R.lb.rows;
    const r = await fetchJson("/api/social?circle=lb", 25000);
    if (!r.ok || !r.j || !Array.isArray(r.j.rows)) throw new Error("leaderboard");
    R.lb = { at: Date.now(), rows: r.j.rows.filter((x) => BigInt(x.amount || 0) > 0n) };
    return R.lb.rows;
  }
  function lead(tallies, opts) {
    let bi = -1, bw = 0n;
    tallies.forEach((w, i) => { if (BigInt(w) > bw) { bw = BigInt(w); bi = i; } });
    return bi < 0 ? null : { i: bi, text: opts[bi], votes: bw };
  }
  async function loadRound() {
    const rc = roundCfg();
    const s1 = $("arl-s1");
    s1.innerHTML = head(1, "The round") + `<p class="arl-muted">${T("Reading the round from the chain…")}</p>`;
    try {
      const esc_ = new ethers.Contract(rc.escrow, ESCROW_ABI, lr());
      const ballot = new ethers.Contract(rc.ballot, BALLOT_ABI, lr());
      const bv = new ethers.Contract(rc.burnvote, BURN_ABI, lr());
      const [raised, deadline, open, recipient, burned, votes] = await Promise.all([
        retry(() => esc_.totalRaised()), retry(() => esc_.deadline()), retry(() => esc_.isOpen()), retry(() => esc_.recipient()),
        retry(() => bv.totalBurned()).catch(() => 0n), retry(() => bv.totalVotes()).catch(() => 0n),
      ]);
      const cats = await Promise.all([0, 1, 2, 3, 4].map(async (c) => {
        const set = await retry(() => ballot.optionsSet(c)).catch(() => false);
        if (!set) return { c, opts: [], tallies: [], win: null };
        const [opts, tallies] = await Promise.all([retry(() => ballot.options(c)), retry(() => bv.tallies(c)).catch(() => [])]);
        const o = [...opts].map(String), t = [...tallies].map((x) => BigInt(x));
        return { c, opts: o, tallies: t, win: lead(t, o) };
      }));
      const lb = await loadLb().catch(() => null);
      R.round = { raised: BigInt(raised), deadline: Number(deadline), open: !!open, recipient: String(recipient), burned: BigInt(burned), votes: BigInt(votes), cats, contributors: lb ? lb.length : null };
    } catch (e) {
      s1.innerHTML = head(1, "The round") + `<p class="arl-muted">${T("Couldn't read the round right now — try again in a moment.")}</p><button type="button" class="ams-mini" data-arl-reload>${T("Try again")}</button>`;
      return;
    }
    paintRound();
    prefill();
    paintChain();
  }
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-arl-reload]")) loadRound(); });
  const head = (n, title, extra = "") => `<div class="ams-card-head"><span class="ams-num">${n}</span><h2>${T(title)}</h2>${extra}</div>`;
  const winText = (c) => { const cat = R.round && R.round.cats[c]; return cat && cat.win ? cat.win.text : ""; };
  const logoUrl = (t) => (typeof govLogoUrl === "function" ? govLogoUrl(t) : /^https:\/\//.test(t) ? t : "");
  const votedDate = () => { const t = winText(4); const d = t ? new Date(t) : null; return d && !isNaN(d) ? d : null; };
  function paintRound() {
    const r = R.round, rc = roundCfg(), now = Date.now() / 1000;
    const closed = !r.open && r.deadline && now >= r.deadline;
    const share = (r.raised * 80n) / 100n;
    const recOk = lc(r.recipient) === lc(OPERATOR);
    const d = votedDate();
    const face = (c) => {
      const t = winText(c);
      if (!t) return `<em>${T("No votes yet")}</em>`;
      if (c === 2) return logoUrl(t) ? `<img src="${esc(logoUrl(t))}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('em'),{textContent:'—'}))">` : `<em>${T("a logo")}</em>`;
      if (c === 1) return `<b data-no-i18n>$${esc(String(t).replace(/^\$/, ""))}</b>`;
      if (c === 4) return d ? `<b data-no-i18n>${esc(d.toISOString().slice(0, 16).replace("T", " "))} UTC</b>` : `<b data-no-i18n>${esc(t)}</b>`;
      return `<b data-no-i18n>${esc(String(t).split("\n")[0])}</b>`;
    };
    $("arl-s1").innerHTML = head(1, "The round", `<span class="arl-badge ${closed ? "done" : "live"}">${T(closed ? "Closed" : r.open ? "Raising now" : "Not closed yet")}</span>`) + `
      <div class="arl-round">
        <div class="arl-stats">
          <div><small>${T("Raised")}</small><b data-no-i18n>${units(r.raised, 18, 2)}</b><span>USDC</span></div>
          <div><small>${T("To the recipient (80%)")}</small><b data-no-i18n>${units(share, 18, 2)}</b><span>USDC</span></div>
          <div><small>${T("Contributors")}</small><b data-no-i18n>${r.contributors == null ? "—" : nf(r.contributors, 0)}</b><span>${T("in this round's relay")}</span></div>
          <div><small>${T("Burned by votes")}</small><b data-no-i18n>${units(r.burned, 18, 0)}</b><span>$ARCIRCLE</span></div>
        </div>
        <div class="arl-picked"><small class="arl-k">${T("The coin the vote picked")}</small>
          <div class="arl-picked-grid">${[0, 1, 2, 3, 4].map((c) => `<div class="arl-pk"><span class="arl-pk-k">${window.cpCatIcon ? window.cpCatIcon(c) : ""}${T(CATS[c])}</span><span class="arl-pk-v">${face(c)}</span></div>`).join("")}</div>
          ${closed ? "" : `<p class="arl-note">${T("Voting is still open, so this can change until the round closes. The launch form below follows the current leaders.")}</p>`}
        </div>
        <ul class="arl-facts">
          <li class="${recOk ? "ok" : "bad"}">${T("Recipient wallet")} <a href="${EXPL("address", r.recipient)}" target="_blank" rel="noopener" data-no-i18n>${short(r.recipient)} ↗</a>${recOk ? "" : ` — <span>${T("not the relay wallet in the config")}</span>`}</li>
          <li>${T("Closes")} <b data-no-i18n>${r.deadline ? new Date(r.deadline * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}</b></li>
          <li>${T("Voted launch time")} <b data-no-i18n>${d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"}</b>${d && d.getTime() > Date.now() ? ` <span class="arl-clock" data-arl-to="${Math.floor(d.getTime() / 1000)}" data-no-i18n></span>` : ""}</li>
          <li><a href="/circle/round/${rc.n}" target="_blank" rel="noopener">${T("Round report")} ↗</a></li>
        </ul>
      </div>`;
  }

  // ================= 2. the Argus launch form =================
  const F = {
    name: "", symbol: "", image: "", description: "", website: "", twitter: "", telegram: "",
    buyTax: "3", sellTax: "5", creator: "20", burn: "30", dividend: "30", liquidity: "20",
    startFdv: "", bondFdv: "", devBuy: "", supply: "1000000000",
  };
  const PRESETS_TAX = [["Like $ARCIRCLE", "3", "5"], ["Light", "1", "2"], ["Balanced", "3", "3"], ["Heavy", "8", "10"]];
  const PRESETS_ALLOC = [
    ["Holders first", { creator: "10", burn: "20", dividend: "50", liquidity: "20" }],
    ["Deflationary", { creator: "10", burn: "60", dividend: "10", liquidity: "20" }],
    ["Balanced", { creator: "20", burn: "30", dividend: "30", liquidity: "20" }],
    ["Builder", { creator: "50", burn: "15", dividend: "25", liquidity: "10" }],
  ];
  let prefilled = false;
  function prefill() {
    const saved = load("form");
    if (saved && !prefilled) { Object.assign(F, saved); prefilled = true; }
    if (!prefilled) {
      const name = winText(0), tick = String(winText(1) || "").replace(/^\$/, ""), logo = logoUrl(winText(2)), road = String(winText(3) || "").split("\n")[0];
      if (name) F.name = name.slice(0, 32);
      if (tick) F.symbol = tick.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
      if (logo) F.image = logo;
      F.description = (`${name || "This coin"} — chosen by the circle in ${roundCfg().label} on ARCIRCLE PAD. Its name, ticker, logo, roadmap and launch date were voted by $ARCIRCLE holders, every vote burning 1,000 $ARCIRCLE.${road ? " " + road : ""}`).slice(0, 280);
      F.website = `https://www.arcircle.app/circle/round/${roundCfg().n}`;
      F.twitter = "https://x.com/ARCIRCLEonArc";
      F.telegram = "https://t.me/ARCIRCLEonarc";
      prefilled = !!name;
    }
    paintForm();
    if (!F.startFdv) matchArcircle(true);
  }
  // price range from $ARCIRCLE's own Argus launch record (tickStart / tickBond)
  async function matchArcircle(quiet) {
    if (!isAddr(ARC_TOKEN)) return;
    const portals = [AG.PORTAL].concat(AG.OLDER_PORTALS || []);
    for (const p of portals) {
      try {
        const rec = await retry(() => new ethers.Contract(p, PORTAL_ABI, lr()).launches(ARC_TOKEN));
        if (!rec || /^0x0{40}$/i.test(rec[0])) continue;
        const tickStart = Number(rec[1]), token0 = !!rec[2], tickBond = Number(rec[9]);
        const px = (tick) => (token0 ? Math.pow(1.0001, tick) : Math.pow(1.0001, -tick)) * 1e12; // USDC per token
        const f = (tick) => Math.round(px(tick) * 1e9);
        const a = f(tickStart), b = f(tickBond);
        if (a > 0 && b > a) { F.startFdv = String(a); F.bondFdv = String(b); paintForm(); if (!quiet) toast("Price range set to $ARCIRCLE's launch."); return; }
      } catch { /* next portal */ }
    }
    if (!quiet) toast("Couldn't read $ARCIRCLE's launch settings — enter the range yourself.");
  }

  const fld = (id, label, val, attrs = "", hint = "") => `<label class="arl-f"><span>${T(label)}</span><input id="arl-${id}" data-f="${id}" value="${esc(val)}" ${attrs}>${hint ? `<small>${hint}</small>` : ""}</label>`;
  function paintForm() {
    const s2 = $("arl-s2");
    const open = s2.querySelector("details[open]") ? [...s2.querySelectorAll("details[open]")].map((d) => d.dataset.k) : null;
    s2.innerHTML = head(2, "Launch on Argus", `<span class="arl-badge">${T("Portal #7")}</span>`) + `
      <div class="arl-form">
        <section class="arl-sec"><h3>${T("Identity")}</h3>
          <div class="arl-idrow">
            <div class="arl-logo" id="arl-logo">${F.image ? `<img src="${esc(F.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((F.symbol || "?").slice(0, 1))}</em>`}</div>
            <div class="arl-idf">
              ${fld("name", "Name", F.name, 'maxlength="32" autocomplete="off" spellcheck="false"', T("2–32 characters"))}
              ${fld("symbol", "Ticker", F.symbol, 'maxlength="10" autocomplete="off" spellcheck="false"', T("2–10 letters or numbers"))}
            </div>
          </div>
          ${fld("image", "Image URL", F.image, 'autocomplete="off" spellcheck="false" placeholder="https://…"', T("The voted logo, hosted on arcircle.app. Argus shows this image on the token page."))}
          <label class="arl-f"><span>${T("Description")}</span><textarea id="arl-description" data-f="description" rows="3" maxlength="280">${esc(F.description)}</textarea><small><span data-arl-count>${F.description.length}</span>/280</small></label>
          <div class="arl-3">${fld("website", "Website", F.website, 'autocomplete="off" spellcheck="false"')}${fld("twitter", "X", F.twitter, 'autocomplete="off" spellcheck="false"')}${fld("telegram", "Telegram", F.telegram, 'autocomplete="off" spellcheck="false"')}</div>
        </section>
        <section class="arl-sec"><h3>${T("Tax")}<small>${T("Fixed forever at launch")}</small></h3>
          <div class="ams-chips arl-chips">${PRESETS_TAX.map(([k, b, s]) => `<button type="button" class="${F.buyTax === b && F.sellTax === s ? "on" : ""}" data-tax="${b},${s}">${T(k)} <small data-no-i18n>${b}/${s}%</small></button>`).join("")}</div>
          <div class="arl-2">${fld("buyTax", "Buy tax %", F.buyTax, 'inputmode="decimal"', T("0–10%"))}${fld("sellTax", "Sell tax %", F.sellTax, 'inputmode="decimal"', T("0–10%, not both 0"))}</div>
          <h4>${T("Where the tax goes")}<small>${T("After Argus's 10%")}</small></h4>
          <div class="ams-chips arl-chips">${PRESETS_ALLOC.map(([k, v]) => `<button type="button" class="${F.creator === v.creator && F.burn === v.burn && F.dividend === v.dividend && F.liquidity === v.liquidity ? "on" : ""}" data-alloc='${JSON.stringify(v)}'>${T(k)}</button>`).join("")}</div>
          <div class="arl-4">${fld("creator", "Creator %", F.creator, 'inputmode="decimal"', T("To the recipient wallet"))}${fld("burn", "Buyback & burn %", F.burn, 'inputmode="decimal"')}${fld("dividend", "USDC dividends %", F.dividend, 'inputmode="decimal"', T("To holders"))}${fld("liquidity", "Liquidity %", F.liquidity, 'inputmode="decimal"')}</div>
          <div class="arl-allocbar" id="arl-allocbar"></div>
          <div class="arl-sim" id="arl-sim"></div>
        </section>
        <section class="arl-sec"><h3>${T("Price range")}<button type="button" class="ams-mini" data-arl-match>${T("Use $ARCIRCLE's launch")}</button></h3>
          <div class="arl-2">${fld("startFdv", "Start FDV (USDC)", F.startFdv, 'inputmode="decimal"', T("The opening price × supply"))}${fld("bondFdv", "Bonding FDV (USDC)", F.bondFdv, 'inputmode="decimal"', T("The milestone Argus marks as bonded"))}</div>
          <details class="arl-adv" data-k="adv"${open && open.includes("adv") ? " open" : ""}><summary>${T("Advanced")}</summary>${fld("supply", "Total supply", F.supply, 'inputmode="numeric"', T("Argus launches use 1,000,000,000. Change only if you know why."))}</details>
        </section>
        <section class="arl-sec"><h3>${T("Dev buy")}<small>${T("In the launch transaction, before anyone else can buy")}</small></h3>
          <div class="arl-devrow">${fld("devBuy", "USDC", F.devBuy, 'inputmode="decimal" placeholder="0"')}<div class="ams-chips arl-chips" id="arl-devchips"></div></div>
          <div class="arl-devprev" id="arl-devprev"></div>
        </section>
      </div>
      <div class="arl-launch">
        <div class="arl-review" id="arl-review"></div>
        <ul class="arl-checks" id="arl-checks"></ul>
        <label class="arl-confirm"><input type="checkbox" id="arl-sure"> <span>${T("I've checked everything. A launch can't be undone or changed.")}</span></label>
        <div class="arl-acts">
          <button type="button" class="ams-mini" id="arl-check">${T("Run checks")}</button>
          <button type="button" class="ams-mini" id="arl-approve" hidden>${T("Approve USDC")}</button>
          <button type="button" class="ams-go arl-go" id="arl-go" disabled><span class="ams-go-fill" aria-hidden="true"></span><span class="ams-go-txt">${T("Launch on Argus")}</span></button>
        </div>
        <div class="arl-status" id="arl-status" aria-live="polite"></div>
        <div class="arl-done" id="arl-done"></div>
      </div>`;
    paintDerived();
    paintChecks();
    paintLaunched();
  }

  // live parts of the form
  function devChips() {
    const r = R.round, el = $("arl-devchips");
    if (!el) return;
    const chips = [];
    if (R.bal != null) chips.push([`${T("Balance")} ${units(R.bal, 6, 2)}`, plain(R.bal, 6)]);
    if (r) chips.push([`${T("Recipient share")} ${units((r.raised * 80n) / 100n, 18, 2)}`, plain((r.raised * 80n) / 100n / 10n ** 12n, 6)]);
    const F0 = Number(F.startFdv);
    if (F0 > 0) chips.push([`${T("Max that fills")} ${nf(F0, 0)}`, String(Math.floor(F0))]);
    el.innerHTML = chips.map(([l, v]) => `<button type="button" data-dev="${esc(v)}">${l}</button>`).join("");
  }
  function paintDerived() {
    const cnt = panel.querySelector("[data-arl-count]");
    if (cnt) cnt.textContent = String(F.description.length);
    const alloc = ["creator", "burn", "dividend", "liquidity"].map((k) => Number(F[k]) || 0);
    const sum = alloc.reduce((a, b) => a + b, 0);
    const bar = $("arl-allocbar");
    if (bar) bar.innerHTML = `<div class="arl-ab">${["creator", "burn", "dividend", "liquidity"].map((k, i) => `<i class="k-${k}" style="width:${Math.max(0, alloc[i])}%"></i>`).join("")}</div><span class="${Math.abs(sum - 100) < 1e-9 ? "ok" : "bad"}"><span data-no-i18n>${nf(sum, 2)}%</span> ${T(Math.abs(sum - 100) < 1e-9 ? "— adds up" : "— must add up to 100%")}</span>`;
    // what 10,000 USDC of volume would pay
    const sim = $("arl-sim");
    const bt = Number(F.buyTax) || 0, st = Number(F.sellTax) || 0;
    if (sim) {
      const tax = 5000 * bt / 100 + 5000 * st / 100, lp = 10000 * 0.01, pot = tax + lp, argus = pot * 0.1, rest = pot - argus;
      const part = (k) => nf(rest * (Number(F[k]) || 0) / 100, 2);
      sim.innerHTML = `<small class="arl-k">${T("For every 10,000 USDC traded (half buys, half sells)")}</small>
        <div class="arl-sim-row"><span><b data-no-i18n>${nf(pot, 2)}</b> ${T("USDC collected")}</span><span><b data-no-i18n>${nf(argus, 2)}</b> ${T("to Argus")}</span><span><b data-no-i18n>${part("creator")}</b> ${T("creator")}</span><span><b data-no-i18n>${part("burn")}</b> ${T("buyback & burn")}</span><span><b data-no-i18n>${part("dividend")}</b> ${T("holder dividends")}</span><span><b data-no-i18n>${part("liquidity")}</b> ${T("liquidity")}</span></div>
        <small class="arl-muted">${T("Includes the 1% pool fee, which is split the same way. An estimate, not a promise.")}</small>`;
    }
    // dev buy preview: the whole supply sits in one position above the opening price; a buy of q against
    // a start FDV of S·p0 gets about S·q / (FDV + q), and Argus refunds whatever would push past 4× the opening price
    const prev = $("arl-devprev");
    const q = Number(F.devBuy) || 0, F0 = Number(F.startFdv) || 0, S = Number(F.supply) || 1e9;
    if (prev) {
      if (!(q > 0) || !(F0 > 0)) prev.innerHTML = `<p class="arl-muted">${T("Enter a start FDV and an amount to see what the dev buy gets.")}</p>`;
      else {
        const use = Math.min(q, F0), tokens = S * use / (F0 + use), pct = (tokens / S) * 100, refund = q - use;
        const net = tokens * (1 - (Number(F.buyTax) || 0) / 100) * 0.99;
        prev.innerHTML = `<div class="arl-dp"><div><small>${T("About")}</small><b data-no-i18n>${nf(tokens, 0)}</b><span><span data-no-i18n>${nf(pct, 2)}%</span> ${T("of the supply")}</span></div>
          <div><small>${T("After the buy tax and pool fee, about")}</small><b data-no-i18n>${nf(net, 0)}</b><span>${T("to relay")}</span></div>
          <div><small>${T("Price after the buy")}</small><b data-no-i18n>${nf(Math.pow(1 + use / F0, 2), 2)}×</b><span>${T("the opening price")}</span></div></div>
          ${refund > 0 ? `<p class="arl-note">${T("Argus caps the opening buy at 4× the opening price; about")} <b data-no-i18n>${nf(refund, 2)} USDC</b> ${T("would come back in the same transaction.")}</p>` : ""}
          <p class="arl-muted">${T("Estimates from the pool's shape. The real amount is read from the launch transaction.")}</p>`;
      }
    }
    devChips();
    paintReview();
  }
  function paintReview() {
    const el = $("arl-review");
    if (!el) return;
    el.innerHTML = `<dl class="ams-sum">
      <div><dt>${T("Coin")}</dt><dd data-no-i18n>${esc(F.name || "—")} ${F.symbol ? "$" + esc(F.symbol) : ""}</dd></div>
      <div><dt>${T("Tax")}</dt><dd data-no-i18n>${esc(F.buyTax || 0)}% / ${esc(F.sellTax || 0)}%</dd></div>
      <div><dt>${T("Split")}</dt><dd data-no-i18n>${["creator", "burn", "dividend", "liquidity"].map((k) => esc(F[k] || 0)).join(" · ")}</dd></div>
      <div><dt>${T("Start → bonding FDV")}</dt><dd data-no-i18n>${F.startFdv ? nf(F.startFdv, 0) : "—"} → ${F.bondFdv ? nf(F.bondFdv, 0) : "—"}</dd></div>
      <div><dt>${T("Dev buy")}</dt><dd data-no-i18n>${F.devBuy ? nf(F.devBuy, 2) + " USDC" : "0"}</dd></div>
      <div><dt>${T("Creator")}</dt><dd data-no-i18n>${short(OPERATOR)}</dd></div></dl>`;
  }
  panel.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.f;
    if (!k) return;
    F[k] = e.target.value;
    if (k === "symbol") { const v = F.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10); if (v !== F.symbol) { F.symbol = v; e.target.value = v; } }
    if (k === "image") { const l = $("arl-logo"); if (l) l.innerHTML = /^https:\/\//.test(F.image) ? `<img src="${esc(F.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((F.symbol || "?").slice(0, 1))}</em>`; }
    save("form", F);
    R.mined = null; R.checks = {};
    paintDerived(); paintChecks();
  });
  panel.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tax]"), a = e.target.closest("[data-alloc]"), d = e.target.closest("[data-dev]");
    if (t) { [F.buyTax, F.sellTax] = t.dataset.tax.split(","); }
    else if (a) Object.assign(F, JSON.parse(a.dataset.alloc));
    else if (d) F.devBuy = d.dataset.dev;
    else if (e.target.closest("[data-arl-match]")) { matchArcircle(false); return; }
    else return;
    save("form", F); R.mined = null; R.checks = {};
    paintForm();
  });

  // ---------------- building the call ----------------
  function validate() {
    const errs = [];
    const name = F.name.trim(), sym = F.symbol.trim();
    if (name.length < 2 || name.length > 32) errs.push("Name: 2–32 characters.");
    if (!/^[A-Z0-9]{2,10}$/.test(sym)) errs.push("Ticker: 2–10 letters or numbers.");
    if (F.description.length > 280) errs.push("Description: 280 characters at most.");
    if (F.image && !/^https:\/\//.test(F.image)) errs.push("Image URL must start with https://.");
    ["website", "twitter", "telegram"].forEach((k) => { if (F[k] && !/^https?:\/\//.test(F[k])) errs.push(`${k}: a full link (https://…).`); });
    const bt = bpsOf(F.buyTax), st = bpsOf(F.sellTax);
    if (!(bt >= 0 && bt <= 1000) || !(st >= 0 && st <= 1000)) errs.push("Taxes: 0–10% each.");
    if (bt === 0 && st === 0) errs.push("Buy and sell tax can't both be 0%.");
    const al = ["creator", "burn", "dividend", "liquidity"].map((k) => bpsOf(F[k]));
    if (al.some((x) => !(x >= 0 && x <= 10000)) || al.reduce((a, b) => a + b, 0) !== 10000) errs.push("The four allocation shares must add up to exactly 100%.");
    const s = Number(F.startFdv), b = Number(F.bondFdv);
    if (!(s > 0)) errs.push("Enter a start FDV.");
    if (!(b > s)) errs.push("The bonding FDV must be higher than the start FDV.");
    if (!/^\d+$/.test(String(F.supply).trim()) || BigInt(String(F.supply).trim() || "0") <= 0n) errs.push("Total supply: a whole number.");
    if (F.devBuy && !(Number(F.devBuy) >= 0)) errs.push("Dev buy: a USDC amount.");
    return errs.map(tr);
  }
  function params() {
    const usdc6 = (x) => ethers.parseUnits(String(Number(x || 0).toFixed(6)), 6);
    return {
      p: {
        name: F.name.trim(), symbol: F.symbol.trim(), totalSupply: BigInt(String(F.supply).trim()) * 10n ** 18n,
        startFdvUsdc6: usdc6(F.startFdv), bondFdvUsdc6: usdc6(F.bondFdv),
        buyTaxBps: bpsOf(F.buyTax), sellTaxBps: bpsOf(F.sellTax),
        creatorBps: bpsOf(F.creator), burnBps: bpsOf(F.burn), dividendBps: bpsOf(F.dividend), liquidityBps: bpsOf(F.liquidity),
        devBuyQuote: F.devBuy ? usdc6(F.devBuy) : 0n, quoteAsset: USDC, expectConvert: 1,
      },
      meta: { imageURI: F.image.trim(), website: F.website.trim(), twitter: F.twitter.trim(), telegram: F.telegram.trim(), description: F.description.trim() },
    };
  }
  const mineKey = () => [F.buyTax, F.sellTax, lc(OPERATOR)].join("|");

  // ---------------- the hook address ----------------
  // The Portal deploys each launch's hook with CREATE2; Uniswap v4 reads the hook's permissions from the
  // low 14 bits of its address, so the salt has to be searched for until those bits equal HOOK_FLAGS.
  // We learn the Portal's salt formula and deployer from one predictHook() call, search locally,
  // and confirm the winner with predictHook() again. If the formula can't be learned, we search
  // through predictHook() itself (slower).
  async function mine(onProgress) {
    const P = portalR(), creator = OPERATOR, q = USDC;
    const bt = bpsOf(F.buyTax), st = bpsOf(F.sellTax);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const splitter = await retry(() => P.predictSplitter(creator, salt));
    const initHash = await retry(() => P.hookInitCodeHash(splitter, bt, st, q));
    const probe = ethers.hexlify(ethers.randomBytes(32));
    const [pAddr] = await retry(() => P.predictHook(creator, salt, probe, bt, st, q));
    const s2 = await retry(() => P.hookCreate2Salt(creator, probe));
    // the four ways a Portal could hash (creator, hookSalt) into the CREATE2 salt: [preimage length, creator at, hookSalt at]
    const cb = ethers.getBytes(creator);
    const SHAPES = [[64, 12, 32], [52, 0, 20], [64, 44, 0], [52, 32, 0]];
    const pre = (shape, hs) => { const u = new Uint8Array(shape[0]); u.set(cb, shape[1]); u.set(hs, shape[2]); return u; };
    const probeB = ethers.getBytes(probe);
    const shape = SHAPES.find((sh) => lc(ethers.keccak256(pre(sh, probeB))) === lc(s2));
    const dep = [AG.PORTAL, AG.REGISTRY].find((d) => lc(ethers.getCreate2Address(d, s2, initHash)) === lc(pAddr));
    const WANT = Number(AG.HOOK_FLAGS) & 0x3fff;
    let found = null, tries = 0;
    if (shape && dep) {
      // local search: ~20–40k hashes on average, about a second
      const u = pre(shape, ethers.randomBytes(32)), off = shape[2] + 28;
      const c2 = new Uint8Array(85); c2[0] = 0xff; c2.set(ethers.getBytes(dep), 1); c2.set(ethers.getBytes(initHash), 53);
      for (let i = 0; i < 3_000_000 && !found; i++) {
        u[off] = (i >>> 24) & 255; u[off + 1] = (i >>> 16) & 255; u[off + 2] = (i >>> 8) & 255; u[off + 3] = i & 255;
        c2.set(ethers.getBytes(ethers.keccak256(u)), 21);
        const h = ethers.keccak256(c2);
        tries++;
        if ((parseInt(h.slice(-4), 16) & 0x3fff) === WANT) {
          const hs = ethers.hexlify(u.slice(shape[2], shape[2] + 32));
          const [addr, , ok] = await retry(() => P.predictHook(creator, salt, hs, bt, st, q));
          if (ok && lc(addr) === "0x" + h.slice(-40)) found = { hookSalt: hs, hook: addr };
        }
        if (i % 4000 === 0) { if (onProgress) onProgress(tries, "local"); await sleep(0); }
      }
    } else {
      // the Portal's formula didn't match any shape we know: ask the Portal itself, 60 salts at a time
      const base = ethers.randomBytes(32);
      const saltAt = (i) => { base[28] = (i >>> 24) & 255; base[29] = (i >>> 16) & 255; base[30] = (i >>> 8) & 255; base[31] = i & 255; return ethers.hexlify(base); };
      for (let round = 0; round < 1200 && !found; round++) {
        const hs = Array.from({ length: 60 }, (_, k) => saltAt(round * 60 + k));
        const rs = await Promise.all(hs.map((h) => P.predictHook(creator, salt, h, bt, st, q).catch(() => null)));
        tries += hs.length;
        rs.forEach((r, k) => { if (!found && r && r[2]) found = { hookSalt: hs[k], hook: r[0] }; });
        if (onProgress) onProgress(tries, "chain");
      }
    }
    if (!found) throw new Error(tr("Couldn't find a hook address — try again."));
    const token = await retry(() => P.predictToken(creator, salt, found.hook, q)).catch(() => null);
    return { key: mineKey(), salt, hookSalt: found.hookSalt, hook: found.hook, token, splitter, tries };
  }

  // ---------------- checks ----------------
  function checkRow(k, ok, text) { R.checks[k] = { ok, text }; }
  function paintChecks() {
    const el = $("arl-checks");
    if (!el) return;
    const order = ["wallet", "portal", "inputs", "usdc", "allowance", "hook", "sim"];
    const labels = { wallet: "Recipient wallet", portal: "Argus Portal #7 unchanged", inputs: "Form", usdc: "USDC for the dev buy", allowance: "Portal may pull the dev buy", hook: "Hook address", sim: "Simulated launch" };
    el.innerHTML = order.map((k) => {
      const c = R.checks[k];
      const st = !c ? "" : c.ok === true ? "ok" : c.ok === false ? "bad" : "wait";
      return `<li class="${st}"><i aria-hidden="true"></i><b>${T(labels[k])}</b><span>${c ? c.text : T("Not checked yet")}</span></li>`;
    }).join("");
    const all = order.every((k) => R.checks[k] && R.checks[k].ok === true);
    const go = $("arl-go"), sure = $("arl-sure");
    if (go) go.disabled = !(all && sure && sure.checked && isOperator() && !R.busy && !R.launched);
    const ap = $("arl-approve");
    if (ap) ap.hidden = !(R.checks.allowance && R.checks.allowance.ok === false && isOperator());
  }
  panel.addEventListener("change", (e) => { if (e.target.id === "arl-sure") paintChecks(); });
  function status(kind, html) { const el = $("arl-status"); if (el) { el.className = "arl-status " + (kind || ""); el.innerHTML = html || ""; } }

  async function runChecks() {
    if (R.busy) return;
    R.busy = true; R.checks = {};
    const btn = $("arl-check"); if (btn) btn.disabled = true;
    try {
      // 1. who
      if (!me()) checkRow("wallet", false, T("Connect the recipient wallet."));
      else if (!isOperator()) checkRow("wallet", false, `${T("Connected as")} <span data-no-i18n>${short(me())}</span> — ${T("switch to")} <span data-no-i18n>${short(OPERATOR)}</span>.`);
      else checkRow("wallet", true, `<span data-no-i18n>${short(OPERATOR)}</span>`);
      paintChecks();
      // 2. Argus hasn't swapped its implementations since the bundle we pinned
      const P = portalR();
      let reg, sp, lk, tk, qa;
      try { [reg, sp, lk, tk, qa] = await Promise.all([retry(() => P.registry()), retry(() => P.splitterImpl()), retry(() => P.lockerImpl()), retry(() => P.tokenImpl()), retry(() => P.quoteApproved(USDC))]); }
      catch { checkRow("portal", false, T("Couldn't read the Argus Portal — check the network and try again.")); paintChecks(); return; }
      const same = lc(reg) === lc(AG.REGISTRY) && lc(sp) === lc(AG.SPLITTER_IMPL) && lc(lk) === lc(AG.LOCKER_IMPL) && lc(tk) === lc(AG.TOKEN_IMPL);
      checkRow("portal", same && qa, same ? (qa ? T("Implementations match the published bundle; USDC is an approved pair.") : T("USDC isn't an approved pair on this Portal.")) : T("Argus changed an implementation since the bundle this page was built on. Stop and check before launching."));
      paintChecks();
      // 3. the form
      const errs = validate();
      checkRow("inputs", !errs.length, errs.length ? esc(errs.join(" ")) : T("Everything is in range."));
      paintChecks();
      if (errs.length) return;
      // 4. USDC balance + allowance (the 6-decimal ERC-20 view of native USDC)
      const { p, meta } = params();
      const usdc = new ethers.Contract(USDC, ERC20, lr());
      const [bal, alw] = await Promise.all([retry(() => usdc.balanceOf(OPERATOR)), retry(() => usdc.allowance(OPERATOR, AG.PORTAL))]);
      R.bal = BigInt(bal);
      const need = p.devBuyQuote;
      checkRow("usdc", R.bal >= need, `${T("Balance")} <b data-no-i18n>${units(R.bal, 6, 2)}</b> · ${T("dev buy")} <b data-no-i18n>${units(need, 6, 2)}</b> USDC${R.bal >= need ? "" : ` — ${T("not enough; keep some for gas too")}`}`);
      checkRow("allowance", need === 0n || BigInt(alw) >= need, need === 0n ? T("No dev buy — nothing to approve.") : BigInt(alw) >= need ? T("Approved.") : T("Approve the Portal for the dev buy first."));
      paintChecks(); devChips();
      // 5. the hook address
      if (!R.mined || R.mined.key !== mineKey()) {
        checkRow("hook", null, T("Searching…"));
        paintChecks();
        R.mined = await mine((n, how) => { checkRow("hook", null, `${T("Searching…")} <span data-no-i18n>${nf(n, 0)}</span> ${T(how === "local" ? "tried" : "tried on chain")}`); paintChecks(); });
      }
      checkRow("hook", true, `<span data-no-i18n>${short(R.mined.hook)}</span> · ${T("the coin will be")} <span data-no-i18n>${R.mined.token ? short(R.mined.token) : "—"}</span>`);
      paintChecks();
      // 6. simulate the exact call from the recipient wallet
      if (R.checks.allowance.ok && R.checks.usdc.ok) {
        try {
          const out = await new ethers.Contract(AG.PORTAL, PORTAL_ABI, lr()).launch.staticCall(p, meta, R.mined.salt, R.mined.hookSalt, { from: OPERATOR });
          checkRow("sim", true, `${T("Passes. Token")} <span data-no-i18n>${short(out)}</span>`);
        } catch (e) { checkRow("sim", false, esc(why(e))); }
      } else checkRow("sim", null, T("Runs once USDC and the approval are in place."));
      paintChecks();
    } catch (e) {
      status("bad", esc(why(e)));
    } finally {
      R.busy = false; if (btn) btn.disabled = false; paintChecks();
    }
  }
  panel.addEventListener("click", (e) => {
    if (e.target.closest("#arl-check")) runChecks();
    else if (e.target.closest("#arl-approve")) approve();
    else if (e.target.closest("#arl-go")) launch();
  });

  async function approve() {
    if (R.busy || !isOperator()) return;
    R.busy = true; paintChecks();
    try {
      await ensureArcForWrite();
      const { p } = params();
      status("wait", T("Approve the dev buy in your wallet…"));
      const tx = await new ethers.Contract(USDC, ERC20, state.signer).approve(AG.PORTAL, p.devBuyQuote);
      status("wait", `${T("Approving…")} <a href="${EXPL("tx", tx.hash)}" target="_blank" rel="noopener" data-no-i18n>${short(tx.hash)} ↗</a>`);
      await tx.wait();
      status("ok", T("Approved. Running the checks again…"));
    } catch (e) { status("bad", esc(why(e))); }
    finally { R.busy = false; }
    runChecks();
  }

  async function launch() {
    if (R.busy || !isOperator() || R.launched) return;
    const sure = $("arl-sure");
    if (!sure || !sure.checked) return;
    R.busy = true; paintChecks();
    try {
      await ensureArcForWrite();
      if (lc(state.account) !== lc(OPERATOR)) throw new Error(tr("Switch to the recipient wallet."));
      const { p, meta } = params();
      status("wait", T("Confirm the launch in your wallet…"));
      const c = new ethers.Contract(AG.PORTAL, PORTAL_ABI, state.signer);
      const tx = await c.launch(p, meta, R.mined.salt, R.mined.hookSalt);
      status("wait", `${T("Launching…")} <a href="${EXPL("tx", tx.hash)}" target="_blank" rel="noopener" data-no-i18n>${short(tx.hash)} ↗</a>`);
      const rc = await tx.wait();
      let token = null, tokensOut = 0n, quoteIn = 0n;
      for (const l of rc.logs) {
        if (lc(l.address) !== lc(AG.PORTAL)) continue;
        try {
          const ev = PI.parseLog(l);
          if (ev && ev.name === "TokenCreated") token = ev.args.token;
          if (ev && ev.name === "DevBuy") { tokensOut = BigInt(ev.args.tokensOut); quoteIn = BigInt(ev.args.quoteIn); }
        } catch { /* another event */ }
      }
      if (!token) throw new Error(tr("Launched, but the token address wasn't in the receipt — check the transaction on the explorer."));
      R.launched = { token, tx: tx.hash, tokensOut: tokensOut.toString(), quoteIn: quoteIn.toString(), block: rc.blockNumber, symbol: F.symbol, at: Date.now() };
      save("launch", R.launched);
      status("ok", T("Launched."));
      if (!reduce && typeof window.arcConfetti === "function") window.arcConfetti({ count: 120 });
      paintLaunched();
      paintRelay();
    } catch (e) { status("bad", esc(why(e))); }
    finally { R.busy = false; paintChecks(); }
  }
  function paintLaunched() {
    const el = $("arl-done");
    if (!el) return;
    const L = R.launched;
    if (!L) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="arl-born"><span class="arl-ring big"><b data-no-i18n>N${R.n}</b></span><div>
      <b><span>${T("Live on Argus")}</span> <span data-no-i18n>${esc(L.symbol ? "$" + L.symbol : "")}</span></b>
      <span><span>${T("Dev buy")}</span> <b data-no-i18n>${units(BigInt(L.quoteIn || 0), 6, 2)} USDC</b> → <b data-no-i18n>${units(BigInt(L.tokensOut || 0), 18, 0)}</b> <span>${T("tokens")}</span></span>
      <span class="arl-links"><a href="https://argus.world/token/${esc(L.token)}" target="_blank" rel="noopener">Argus ↗</a><a href="${EXPL("token", L.token)}" target="_blank" rel="noopener">${T("Explorer")} ↗</a><a href="${EXPL("tx", L.tx)}" target="_blank" rel="noopener">${T("Transaction")} ↗</a><a href="/arc#scanner" data-arl-scan="${esc(L.token)}">${T("Scan it")}</a></span></div></div>`;
  }
  panel.addEventListener("click", (e) => {
    const s = e.target.closest("[data-arl-scan]");
    if (s) { e.preventDefault(); location.hash = `#scanner?addr=${s.dataset.arlScan}`; }
  });

  // ================= 3. the relay =================
  const D = { token: "", dec: 18, sym: "", total: "", part: "50", hold: "50", keep: "0", block: "" };
  function paintRelay() {
    const s3 = $("arl-s3");
    if (R.launched && !D.token) { D.token = R.launched.token; D.total = plain(BigInt(R.launched.tokensOut || 0), 18); D.sym = R.launched.symbol || ""; }
    const sum = (Number(D.part) || 0) + (Number(D.hold) || 0) + (Number(D.keep) || 0);
    s3.innerHTML = head(3, "Relay", `<span class="arl-badge">${T("Snapshot + Multisender")}</span>`) + `
      <div class="arl-relay">
        <div class="arl-2">
          <label class="arl-f"><span>${T("Relay token")}</span><input id="arl-dtoken" data-d="token" value="${esc(D.token)}" placeholder="0x…" spellcheck="false" autocomplete="off"><small>${D.sym ? `<span data-no-i18n>$${esc(D.sym)}</span> · ` : ""}${T("Filled in after the launch; paste it to relay a coin launched earlier.")}</small></label>
          <label class="arl-f"><span>${T("Amount to relay")}</span><input id="arl-dtotal" data-d="total" value="${esc(D.total)}" inputmode="decimal" placeholder="0"><small>${R.tokBal != null ? `${T("Recipient wallet holds")} <b data-no-i18n>${units(R.tokBal, D.dec, 2)}</b> · <button type="button" class="arl-link-btn" data-dall>${T("Use all")}</button>` : T("Tokens from the dev buy")}</small></label>
        </div>
        <h3>${T("Split")}<small>${T("Set for this round")}</small></h3>
        <div class="arl-3">
          <label class="arl-f"><span>${T("Round contributors %")}</span><input data-d="part" value="${esc(D.part)}" inputmode="decimal"><small>${T("By what each put in")}</small></label>
          <label class="arl-f"><span>${T("$ARCIRCLE holders %")}</span><input data-d="hold" value="${esc(D.hold)}" inputmode="decimal"><small><span>${T("At least")}</span> <span data-no-i18n>${nf(RL.MIN_ARCIRCLE, 0)}</span> $ARCIRCLE, <span>${T("by balance")}</span></small></label>
          <label class="arl-f"><span>${T("Kept %")}</span><input data-d="keep" value="${esc(D.keep)}" inputmode="decimal"><small>${T("Stays in the recipient wallet")}</small></label>
        </div>
        <p class="${Math.abs(sum - 100) < 1e-9 ? "arl-ok" : "arl-bad"}"><span data-no-i18n>${nf(sum, 2)}%</span> ${T(Math.abs(sum - 100) < 1e-9 ? "— adds up" : "— must add up to 100%")}</p>
        <div class="arl-2">
          <label class="arl-f"><span>${T("Snapshot block")}</span><input data-d="block" value="${esc(D.block)}" inputmode="numeric" placeholder="${T("Latest")}"><small>${R.launched ? `${T("Launch block")} <button type="button" class="arl-link-btn" data-dblock="${R.launched.block}" data-no-i18n>${R.launched.block}</button>` : T("Empty = the latest block")}</small></label>
          <div class="arl-f arl-srcs"><span>${T("Lists")}</span>
            <button type="button" class="ams-mini" id="arl-build">${T("Build the relay list")}</button>
            <small>${T("Contributors from the round; holders from a Holder Snapshot of $ARCIRCLE (contracts, pools and burn addresses left out; ArcLock locks counted for their owners).")}</small></div>
        </div>
        <div class="arl-plan" id="arl-plan"></div>
      </div>`;
    paintPlan();
  }
  panel.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.d;
    if (!k) return;
    D[k] = e.target.value.trim();
    if (k === "token") { R.tokBal = null; tokenInfo(); }
    R.plan = null;
    if (["part", "hold", "keep"].includes(k)) { const p = e.target.closest(".arl-relay").querySelector(".arl-ok, .arl-bad"); const sum = ["part", "hold", "keep"].reduce((a, x) => a + (Number(D[x]) || 0), 0); if (p) { p.className = Math.abs(sum - 100) < 1e-9 ? "arl-ok" : "arl-bad"; p.innerHTML = `<span data-no-i18n>${nf(sum, 2)}%</span> ${T(Math.abs(sum - 100) < 1e-9 ? "— adds up" : "— must add up to 100%")}`; } }
    paintPlan();
  });
  panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-dall]") && R.tokBal != null) { D.total = plain(R.tokBal, D.dec); paintRelay(); }
    const b = e.target.closest("[data-dblock]"); if (b) { D.block = b.dataset.dblock; paintRelay(); }
    if (e.target.closest("#arl-build")) buildPlan();
    if (e.target.closest("#arl-send")) sendPlan();
    if (e.target.closest("#arl-csv")) csvPlan();
    if (e.target.closest("#arl-rec")) recordPlan();
  });
  async function tokenInfo() {
    if (!isAddr(D.token)) return;
    try {
      const c = new ethers.Contract(D.token, ERC20, lr());
      const [dec, sym, bal] = await Promise.all([retry(() => c.decimals()), retry(() => c.symbol()).catch(() => ""), retry(() => c.balanceOf(OPERATOR))]);
      D.dec = Number(dec); D.sym = String(sym || ""); R.tokBal = BigInt(bal);
      if (!D.total) D.total = plain(R.tokBal, D.dec);
      paintRelay();
    } catch { /* not a token (yet) */ }
  }

  // the $ARCIRCLE holders at a block, through the Holder Snapshot server (same engine as the Snapshot tab)
  async function snapshot(block, onProgress) {
    const C = window.ArcSnapCore;
    const qs = new URLSearchParams({ snaprun: ARC_TOKEN, hold: "0", locks: "1", lp: "0" });
    if (block) qs.set("b", String(block));
    for (let i = 0; i < 400; i++) {
      const r = await fetchJson(`/api/social?${qs}`, 30000);
      if (r.ok && r.j && r.j.done) {
        const rows = C ? C.unpackRows(r.j.rows) : [];
        return { rows, contracts: new Set((r.j.contracts || []).map(lc)), block: r.j.block, ts: r.j.ts, decimals: r.j.decimals || 18 };
      }
      if (r.ok && r.j) { if (onProgress) onProgress(r.j); await sleep(400); continue; }
      if (r.status === 429) { await sleep(3000); continue; }
      if (r.j && r.j.error) throw new Error(String(r.j.error));
      await sleep(900);
    }
    throw new Error(tr("The snapshot is taking too long — try again, or build it in the Snapshot tab."));
  }
  async function buildPlan() {
    const out = $("arl-plan");
    const bps = ["part", "hold", "keep"].map((k) => bpsOf(D[k]));
    if (!isAddr(D.token)) { out.innerHTML = `<p class="arl-bad">${T("Paste the relay token first.")}</p>`; return; }
    if (bps.some((x) => !(x >= 0)) || bps.reduce((a, b) => a + b, 0) !== 10000) { out.innerHTML = `<p class="arl-bad">${T("The split must add up to 100%.")}</p>`; return; }
    let total;
    try { total = ethers.parseUnits(String(D.total || "0"), D.dec); } catch { total = 0n; }
    if (total <= 0n) { out.innerHTML = `<p class="arl-bad">${T("Enter the amount to relay.")}</p>`; return; }
    out.innerHTML = `<p class="arl-muted">${T("Reading the round's contributors…")}</p>`;
    try {
      const skip = new Set([lc(OPERATOR), lc(roundCfg().escrow), lc(AG.PORTAL)]);
      const contrib = (await loadLb()).map((x) => ({ a: lc(x.address), w: BigInt(x.amount) })).filter((x) => x.w > 0n && !skip.has(x.a));
      out.innerHTML = `<p class="arl-muted">${T("Taking the $ARCIRCLE snapshot…")}</p>`;
      const snap = await snapshot(D.block ? Number(D.block) : 0, (j) => { const el = $("arl-plan"); if (el) el.innerHTML = `<p class="arl-muted">${T("Taking the $ARCIRCLE snapshot…")} ${j.progress != null ? `<span data-no-i18n>${Math.round(j.progress * 100)}%</span>` : ""}</p>`; });
      const C = window.ArcSnapCore;
      const min = BigInt(RL.MIN_ARCIRCLE) * 10n ** 18n;
      const { list } = C.applyFilters(snap.rows, { min, noC: true, contracts: snap.contracts, skip });
      const holders = list.map((x) => ({ a: lc(x.a), w: BigInt(x.v) })).filter((x) => x.w >= min);
      const split = (pool, rows) => { const sw = rows.reduce((s, x) => s + x.w, 0n); return sw === 0n ? [] : rows.map((x) => ({ a: x.a, v: (pool * x.w) / sw, w: x.w })); };
      const partPool = (total * BigInt(bps[0])) / 10000n, holdPool = (total * BigInt(bps[1])) / 10000n;
      const P1 = split(partPool, contrib), P2 = split(holdPool, holders);
      const byA = new Map();
      P1.forEach((x) => byA.set(x.a, { a: x.a, part: x.v, hold: 0n }));
      P2.forEach((x) => { const o = byA.get(x.a) || { a: x.a, part: 0n, hold: 0n }; o.hold += x.v; byA.set(x.a, o); });
      const rows = [...byA.values()].map((o) => ({ ...o, v: o.part + o.hold })).filter((o) => o.v > 0n).sort((x, y) => (y.v > x.v ? 1 : y.v < x.v ? -1 : 0));
      const sent = rows.reduce((s, x) => s + x.v, 0n);
      R.plan = { token: D.token, dec: D.dec, sym: D.sym, total: total.toString(), sent: sent.toString(), kept: (total - sent).toString(), bps, rows, nPart: P1.length, nHold: P2.length, both: rows.filter((x) => x.part > 0n && x.hold > 0n).length, block: snap.block, ts: snap.ts, n: R.n };
      paintPlan();
    } catch (e) { out.innerHTML = `<p class="arl-bad">${esc(e && e.message ? e.message : tr("Couldn't build the list — try again."))}</p>`; }
  }
  function paintPlan() {
    const out = $("arl-plan");
    if (!out) return;
    const P = R.plan;
    if (!P) { if (!out.innerHTML.includes("arl-muted") && !out.innerHTML.includes("arl-bad")) out.innerHTML = ""; return; }
    const u = (v) => units(v, P.dec, 2);
    out.innerHTML = `<div class="arl-plan-sum">
        <div><small>${T("Wallets")}</small><b data-no-i18n>${nf(P.rows.length, 0)}</b><span><span data-no-i18n>${nf(P.nPart, 0)}</span> ${T("contributors")} · <span data-no-i18n>${nf(P.nHold, 0)}</span> ${T("holders")} · <span data-no-i18n>${nf(P.both, 0)}</span> ${T("both")}</span></div>
        <div><small>${T("To send")}</small><b data-no-i18n>${u(BigInt(P.sent))}</b><span data-no-i18n>${P.sym ? "$" + esc(P.sym) : ""}</span></div>
        <div><small>${T("Stays with the recipient")}</small><b data-no-i18n>${u(BigInt(P.kept))}</b><span>${T("kept share + rounding")}</span></div>
        <div><small>${T("Snapshot")}</small><b data-no-i18n>#${nf(P.block, 0)}</b><span data-no-i18n>${P.ts ? new Date(P.ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : ""}</span></div>
      </div>
      <div class="arl-table" role="table">
        <div class="arl-tr arl-th" role="row"><span>${T("Wallet")}</span><span>${T("Contributor")}</span><span>${T("Holder")}</span><span>${T("Total")}</span></div>
        ${P.rows.slice(0, 50).map((x) => `<div class="arl-tr" role="row"><span data-no-i18n><a href="${EXPL("address", x.a)}" target="_blank" rel="noopener">${short(x.a)}</a></span><span data-no-i18n>${x.part > 0n ? u(x.part) : "—"}</span><span data-no-i18n>${x.hold > 0n ? u(x.hold) : "—"}</span><b data-no-i18n>${u(x.v)}</b></div>`).join("")}
        ${P.rows.length > 50 ? `<div class="arl-tr arl-more"><span>${T("and")} <span data-no-i18n>${nf(P.rows.length - 50, 0)}</span> ${T("more in the CSV")}</span></div>` : ""}
      </div>
      <div class="arl-acts">
        <button type="button" class="ams-go arl-go" id="arl-send"${isOperator() ? "" : " disabled"}><span class="ams-go-fill" aria-hidden="true"></span><span class="ams-go-txt">${T("Open in the Multisender")}</span></button>
        <button type="button" class="ams-mini" id="arl-csv">${T("Download CSV")}</button>
        <button type="button" class="ams-mini" id="arl-rec">${T("Download relay record")}</button>
      </div>
      <p class="arl-muted">${T("The Multisender opens with this token and list; it checks every row, approves once and sends in batches from the recipient wallet.")}</p>`;
  }
  const planLines = () => R.plan.rows.map((x) => `${ethers.getAddress(x.a)},${plain(x.v, R.plan.dec)}`);
  function sendPlan() {
    if (!R.plan || !window.arcMultisend || typeof window.arcMultisend.load !== "function") { toast("The Multisender isn't available on this page."); return; }
    const note = `${roundCfg().label} relay — ${R.plan.nPart} contributors, ${R.plan.nHold} $ARCIRCLE holders (snapshot #${R.plan.block})`;
    if (typeof window.arcpadShowTab === "function") window.arcpadShowTab("multisend"); else location.hash = "#multisend";
    setTimeout(() => window.arcMultisend.load(planLines().join("\n"), "line", note, { token: R.plan.token }), 80);
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvPlan() { if (R.plan) download(`relay-N${R.n}-${R.plan.sym || "token"}.csv`, "address,amount\n" + planLines().join("\n") + "\n", "text/csv"); }
  async function recordPlan() {
    if (!R.plan) return;
    const csv = planLines().join("\n");
    let hash = "";
    try { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csv)); hash = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); } catch { /* old browser */ }
    const rec = { n: R.n, round: roundCfg().label, token: R.plan.token, symbol: R.plan.sym, launch: R.launched || null, snapshotBlock: R.plan.block, split: { contributorsBps: R.plan.bps[0], holdersBps: R.plan.bps[1], keptBps: R.plan.bps[2] },
      minArcircle: RL.MIN_ARCIRCLE, wallets: R.plan.rows.length, contributors: R.plan.nPart, holders: R.plan.nHold, total: R.plan.total, sent: R.plan.sent, listSha256: hash, builtAt: new Date().toISOString() };
    download(`relay-N${R.n}-record.json`, JSON.stringify(rec, null, 2), "application/json");
  }

  // ================= wiring =================
  let lastWho = null, booted = false;
  function tick(force) {
    const who = me();
    if (!force && who === lastWho) return;
    lastWho = who;
    paintOp(); paintChecks(); paintPlan();
    if (!meFor || force) paintMe(who);
  }
  function boot() {
    if (booted) return;
    booted = true;
    shell();
    R.launched = load("launch");
    paintChain(); paintOp(); paintMe(me()); paintForm(); paintRelay();
    loadRound();
    if (R.launched) tokenInfo();
    setInterval(() => {
      if (!panel.classList.contains("active")) return;
      tick(false);
      panel.querySelectorAll("[data-arl-to]").forEach((el) => {
        const s = Math.max(0, Number(el.dataset.arlTo) - Math.floor(Date.now() / 1000));
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        el.textContent = `${d ? d + "d " : ""}${h}h ${m}m`;
      });
    }, 1500);
  }
  // build the page the first time the tab opens (or straight away on /arc#relay)
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "relay") boot(); });
  if (panel.classList.contains("active") || /^#relay\b/.test(location.hash)) boot();
  document.addEventListener("arc:lang", () => { if (booted) { paintChain(); paintOp(); paintForm(); paintRelay(); if (R.round) paintRound(); paintMe(me()); } });
})();
