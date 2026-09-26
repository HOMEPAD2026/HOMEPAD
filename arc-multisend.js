/* global ethers, CONFIG, ARC, state, readProvider, withRetry, connectWallet, ensureArcForWrite, arcQuoteMeta, apcErrText */
// arc-multisend.js — Multisender, an ARCIRCLE PAD utility (arcpad.html#multisend).
// Send one ERC-20 to many wallets through ArcMultiSend
// (contracts/contracts/ArcMultiSend.sol): tokens go straight from the
// sender's wallet to each recipient, the sender approves the exact total
// once, and the list goes out in batches of up to 200 — each batch is
// all-or-nothing on-chain.
//   1. Token     paste an address or pick USDC / $ARCIRCLE / your coins
//   2. List      "address, amount" per line (paste, CSV upload, or the same
//                amount for everyone) — checked as you type: bad lines,
//                checksum typos, duplicates (merge in one tap)
//   3. Send      approve → batch 1 … k, with progress; an unfinished send is
//                remembered in this browser and can be resumed
// Until CONFIG.MULTISEND_ADDRESS is set the page runs as a preview.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-multisend");
  if (!panel || typeof CONFIG === "undefined") return;
  const CONTRACT = () => (/^0x[0-9a-fA-F]{40}$/.test(CONFIG.MULTISEND_ADDRESS || "") ? CONFIG.MULTISEND_ADDRESS : "");
  const ABI = [
    "function send(address token, address[] to, uint256[] amounts) returns (uint256)",
    "function sendSame(address token, address[] to, uint256 amount) returns (uint256)",
    "function batches() view returns (uint256)", "function transfers() view returns (uint256)",
  ];
  const TOK_ABI = [
    "function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ];
  const CHUNK = 200, MAX_ROWS = 5000;
  const GAS_PER = 30000n, GAS_BASE = 60000n; // new holders cost ≈ 28k each (contracts/test/arc-multisend.test.js)
  const JOB = "arcircle.multisend.job.v1", HIST = "arcircle.multisend.hist.v1";
  const ARCIRCLE = String(CONFIG.ARCIRCLE_TOKEN || "").toLowerCase();
  const USDC = String(CONFIG.USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase();

  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  function fmt(raw, dec) {
    const n = Number(ethers.formatUnits(raw, dec));
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 1000 ? 4 : 2 });
  }
  // exact, for receipts and inputs
  const plain = (raw, dec) => ethers.formatUnits(raw, dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");

  // ================= parsing =================
  // One recipient per line: an address, then an amount, separated by a
  // comma, tab, semicolon, "=" or spaces (what spreadsheets and CSVs paste).
  // "1,000.5" is read as a thousands-separated number. Lines starting with #
  // and a header row are skipped.
  function parseAmount(str, dec) {
    let v = String(str || "").trim().replace(/\s+/g, "");
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(v) && !/^\.\d+$/.test(v)) return { err: v ? "isn't a number" : "has no amount" };
    const frac = (v.split(".")[1] || "");
    if (frac.length > dec) return { err: `has more than ${dec} decimals` };
    try { const a = ethers.parseUnits(v.startsWith(".") ? "0" + v : v, dec); return a > 0n ? { v: a } : { err: "is zero" }; } catch { return { err: "isn't a number" }; }
  }
  function parseList(text, dec, same) {
    const rows = [], errors = [];
    const sameAmt = same != null ? parseAmount(same, dec) : null;
    const lines = String(text || "").split(/\r?\n/);
    const ms = lc(CONTRACT());
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
      if (ms && lc(addr) === ms) { errors.push({ line: n, why: "is the Multisender contract itself" }); return; }
      let amount;
      if (same != null) {
        if (!sameAmt || sameAmt.err) return rows.push({ line: n, addr, amount: null });
        amount = sameAmt.v;
      } else {
        const rest = line.slice(m.index + m[0].length).replace(/^[\s,;=:|]+/, "").replace(/[\s,;|]+$/, "");
        const a = parseAmount(rest, dec);
        if (a.err) { errors.push({ line: n, why: a.err }); return; }
        amount = a.v;
      }
      rows.push({ line: n, addr, amount });
    });
    const seen = new Map();
    rows.forEach((r) => { const k = lc(r.addr); seen.set(k, (seen.get(k) || []).concat(r.line)); });
    const dups = [...seen.entries()].filter(([, l]) => l.length > 1);
    const total = rows.reduce((s, r) => s + (r.amount || 0n), 0n);
    return { rows, errors, dups, total, sameErr: sameAmt && sameAmt.err ? sameAmt.err : null };
  }
  function mergeDuplicates(text, dec, same) {
    const P = parseList(text, dec, same);
    const agg = new Map();
    P.rows.forEach((r) => { const k = lc(r.addr); const x = agg.get(k); if (x) x.amount += r.amount || 0n; else agg.set(k, { addr: r.addr, amount: r.amount || 0n }); });
    return [...agg.values()].map((x) => (same != null ? x.addr : `${x.addr}, ${plain(x.amount, dec)}`)).join("\n");
  }
  function chunks(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
    return out;
  }

  // ================= state =================
  const F = { info: null, bal: null, P: null, busy: false, gasPrice: null };
  const lr = () => readProvider();

  // ---------- 1. token ----------
  function launchOf(addr) { return ((typeof ARC !== "undefined" && ARC.launches) || []).find((l) => lc(l.token) === lc(addr)) || null; }
  function renderChips() {
    const box = $("ams-quick");
    const chips = [{ a: USDC, s: "USDC" }].concat(ARCIRCLE ? [{ a: ARCIRCLE, s: "$ARCIRCLE" }] : []);
    if (state.account) ((typeof ARC !== "undefined" && ARC.launches) || []).filter((l) => lc(l.creator) === lc(state.account)).slice(0, 6).forEach((l) => chips.push({ a: l.token, s: "$" + l.symbol, mine: true }));
    const html = chips.map((c) => `<button type="button" class="ams-chip${c.mine ? " mine" : ""}${F.info && lc(F.info.address) === lc(c.a) ? " on" : ""}" data-token="${esc(c.a)}" data-no-i18n>${esc(c.s)}</button>`).join("");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  function avatar(info) {
    const l = launchOf(info.address);
    const logo = l && typeof l.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(l.imageUrl) ? l.imageUrl
      : lc(info.address) === ARCIRCLE ? "images/arcircle-mark-sm.png" : "";
    if (logo) return `<img class="ams-logo" src="${esc(logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ams-logo ph',textContent:'${esc(String(info.symbol).slice(0, 1))}'}))">`;
    const bg = typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(info.address) : "";
    return `<span class="ams-logo ph" style="${bg}">${esc(String(info.symbol).replace(/^\$/, "").slice(0, 1).toUpperCase())}</span>`;
  }
  let pickSeq = 0;
  async function pickToken(addr) {
    const my = ++pickSeq, card = $("ams-tokcard");
    F.info = null; F.bal = null;
    renderChips();
    if (!addr) { card.hidden = true; card.innerHTML = ""; update(); return; }
    card.hidden = false;
    card.innerHTML = `<div class="ams-load"><i></i><span>${esc(tr("Reading the token…"))}</span></div>`;
    try {
      const info = await arcQuoteMeta(addr);
      if (my !== pickSeq) return;
      F.info = info;
      renderChips();
      if ($("ams-token").value.trim().toLowerCase() !== lc(info.address)) $("ams-token").value = info.address;
      await readBalance();
      if (my !== pickSeq) return;
      const sym = lc(info.address) === USDC ? "USDC" : "$" + info.symbol;
      card.innerHTML = `${avatar(info)}<div class="ams-tok-txt"><b data-no-i18n>${esc(sym)}</b><small data-no-i18n>${esc(info.name)} · ${short(info.address)} · ${info.decimals} ${esc(tr("decimals"))}</small></div>
        <div class="ams-tok-bal"><small>${esc(tr("Your balance"))}</small><b data-no-i18n id="ams-tok-bal">${F.bal == null ? "—" : fmt(F.bal, info.decimals)}</b></div>
        <a class="ams-scanlink" href="#scanner?t=${esc(info.address)}">${esc(tr("Scan"))} →</a>`;
      card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
      $("ams-same-sym").textContent = sym;
    } catch (err) {
      if (my !== pickSeq) return;
      card.innerHTML = `<p class="ams-err">${esc(tr((err && err.message) || "Couldn't read that token."))}</p>`;
    }
    update();
  }
  async function readBalance() {
    if (!F.info || !state.account) { F.bal = null; return; }
    F.bal = await withRetry(() => new ethers.Contract(F.info.address, TOK_ABI, lr()).balanceOf(state.account)).catch(() => null);
    const el = $("ams-tok-bal");
    if (el) el.textContent = F.bal == null ? "—" : fmt(F.bal, F.info.decimals);
  }
  const symOf = () => (F.info ? (lc(F.info.address) === USDC ? "USDC" : "$" + F.info.symbol) : "");

  // ---------- 2. list ----------
  const sameOn = () => $("ams-same-on").checked;
  function paintGutter() {
    const ta = $("ams-list"), g = $("ams-gutter");
    const n = Math.max(1, ta.value.split("\n").length);
    const bad = new Set(((F.P && F.P.errors) || []).map((e) => e.line));
    const dup = new Set(((F.P && F.P.dups) || []).flatMap(([, l]) => l));
    let html = "";
    for (let i = 1; i <= n; i++) html += `<span${bad.has(i) ? ' class="bad"' : dup.has(i) ? ' class="dup"' : ""}>${i}</span>\n`;
    g.innerHTML = html;
    g.scrollTop = ta.scrollTop;
  }
  function paintIssues() {
    const box = $("ams-issues"), P = F.P;
    if (!P || (!P.errors.length && !P.dups.length && !P.sameErr && !(P.rows.length > MAX_ROWS))) { box.hidden = true; box.innerHTML = ""; return; }
    const items = [];
    if (P.sameErr) items.push(`<li class="bad">${esc(tr(`The amount per wallet ${P.sameErr}.`))}</li>`);
    P.errors.slice(0, 6).forEach((e) => items.push(`<li class="bad"><button type="button" class="ams-line" data-line="${e.line}">${esc(tr(`Line ${e.line}`))}</button> ${esc(tr(e.why))}</li>`));
    if (P.errors.length > 6) items.push(`<li class="bad">${esc(tr(`…and ${P.errors.length - 6} more lines with problems`))}</li>`);
    P.dups.slice(0, 3).forEach(([a, l]) => items.push(`<li class="dup"><span data-no-i18n>${esc(short(ethers.getAddress(a)))}</span> ${esc(tr(`appears ${l.length} times (lines ${l.join(", ")})`))}</li>`));
    if (P.dups.length > 3) items.push(`<li class="dup">${esc(tr(`…and ${P.dups.length - 3} more repeated wallets`))}</li>`);
    if (P.rows.length > MAX_ROWS) items.push(`<li class="bad">${esc(tr(`That's more than ${MAX_ROWS.toLocaleString("en-US")} wallets — split the list into smaller sends.`))}</li>`);
    const acts = [];
    if (P.errors.length) acts.push(`<button type="button" class="ams-mini" data-fix="drop">${esc(tr("Remove bad lines"))}</button>`);
    if (P.dups.length) acts.push(`<button type="button" class="ams-mini" data-fix="merge">${esc(tr(sameOn() ? "Keep one of each" : "Merge duplicates"))}</button>`);
    box.hidden = false;
    box.innerHTML = `<ul>${items.join("")}</ul>${acts.length ? `<div class="ams-fix">${acts.join("")}</div>` : ""}`;
  }
  function paintTable() {
    const box = $("ams-table"), P = F.P;
    if (!P || !P.rows.length || !F.info) { box.hidden = true; box.innerHTML = ""; return; }
    const dec = F.info.decimals, rows = P.rows.filter((r) => r.amount != null);
    if (!rows.length) { box.hidden = true; return; }
    const max = rows.reduce((m, r) => (r.amount > m ? r.amount : m), 0n);
    const min = rows.reduce((m, r) => (r.amount < m ? r.amount : m), rows[0].amount);
    const avg = P.total / BigInt(rows.length);
    const show = rows.slice(0, 40);
    box.hidden = false;
    box.innerHTML = `<div class="ams-table-head"><span>${esc(tr("Preview"))}</span><small data-no-i18n>${esc(tr("min"))} ${fmt(min, dec)} · ${esc(tr("avg"))} ${fmt(avg, dec)} · ${esc(tr("max"))} ${fmt(max, dec)}</small></div>
      <ol class="ams-rows">${show.map((r, i) => {
        const w = max > 0n ? Math.max(2, Number((r.amount * 1000n) / max) / 10) : 0;
        return `<li style="--w:${w}%;--i:${Math.min(i, 20)}"><span class="ams-ln">${r.line}</span><a href="${explorer("address", r.addr)}" target="_blank" rel="noopener" title="${esc(r.addr)}" data-no-i18n>${esc(short(r.addr))}</a><b data-no-i18n>${fmt(r.amount, dec)}</b><i aria-hidden="true"></i></li>`;
      }).join("")}</ol>${rows.length > show.length ? `<p class="ams-more">${esc(tr(`+ ${(rows.length - show.length).toLocaleString("en-US")} more`))}</p>` : ""}`;
  }
  function paintDots(done, running) {
    const box = $("ams-dots"), P = F.P;
    const n = P ? P.rows.length : 0;
    if (!n || n > MAX_ROWS) { box.innerHTML = ""; box.hidden = true; return; }
    box.hidden = false;
    const cells = Math.min(n, 400), per = n / cells;
    const doneRows = done || 0, runTo = running || 0;
    let html = "";
    for (let i = 0; i < cells; i++) {
      const at = Math.floor(i * per);
      const cls = at < doneRows ? "ok" : at < runTo ? "run" : "";
      html += `<i class="${cls}" style="--d:${(i % 50) * 12}ms"></i>`;
    }
    if (box.__n !== cells) { box.innerHTML = html; box.__n = cells; }
    else box.querySelectorAll("i").forEach((el, i) => { const at = Math.floor(i * per); el.className = at < doneRows ? "ok" : at < runTo ? "run" : ""; });
    box.dataset.label = tr(plural(n, "wallet", "wallets"));
  }
  function reparse() {
    if (!F.info) { F.P = null; paintGutter(); paintIssues(); paintTable(); paintDots(); update(); return; }
    F.P = parseList($("ams-list").value, F.info.decimals, sameOn() ? $("ams-same").value : null);
    paintGutter(); paintIssues(); paintTable(); paintDots(); update();
  }

  // ---------- 3. review ----------
  async function gasPrice() {
    if (F.gasPrice && Date.now() - F.gasPrice.at < 60000) return F.gasPrice.v;
    try { const v = BigInt(await lr().send("eth_gasPrice", [])); F.gasPrice = { at: Date.now(), v }; return v; } catch { return null; }
  }
  let gasSeq = 0;
  async function paintGas(n, k) {
    const el = $("ams-s-gas"), my = ++gasSeq;
    if (!n) { el.textContent = "—"; return; }
    const gp = await gasPrice();
    if (my !== gasSeq) return;
    if (gp == null) { el.textContent = "—"; return; }
    const gas = GAS_PER * BigInt(n) + GAS_BASE * BigInt(k) + 50000n; // + the approval
    const fee = gas * gp; // Arc's gas token is USDC (18 decimals natively)
    F.fee = fee;
    const usd = Number(ethers.formatUnits(fee, (CONFIG.NATIVE_CURRENCY && CONFIG.NATIVE_CURRENCY.decimals) || 18));
    el.textContent = usd < 0.01 ? "< 0.01 USDC" : `≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
    warnings();
  }
  function warnings() {
    const box = $("ams-warn"), P = F.P;
    const out = [];
    if (F.info && P && P.rows.length && F.bal != null && P.total > F.bal) out.push(tr(`That's more than your balance — you're ${fmt(P.total - F.bal, F.info.decimals)} ${symOf()} short.`));
    else if (F.info && lc(F.info.address) === USDC && P && F.bal != null && F.fee != null) {
      // USDC is also the gas: sending nearly all of it leaves nothing for fees
      const feeUsdc = F.fee / 10n ** 12n;
      if (P.total + feeUsdc > F.bal) out.push(tr("Leave a little USDC for gas — on Arc the network fee is paid in USDC too."));
    }
    if (F.info && P && P.rows.some((r) => lc(r.addr) === lc(F.info.address))) out.push(tr("The token's own contract is on the list — tokens sent there are usually lost."));
    box.hidden = !out.length;
    box.innerHTML = out.map((t) => `<p>${esc(t)}</p>`).join("");
  }
  function update() {
    const P = F.P, go = $("ams-go");
    const rows = P ? P.rows : [], ok = !!(F.info && P && rows.length && !P.errors.length && !P.sameErr && rows.length <= MAX_ROWS && rows.every((r) => r.amount != null));
    const k = rows.length ? Math.ceil(rows.length / CHUNK) : 0;
    $("ams-s-n").textContent = rows.length ? rows.length.toLocaleString("en-US") : "—";
    $("ams-s-total").textContent = F.info && P && P.total > 0n ? `${fmt(P.total, F.info.decimals)} ${symOf()}` : "—";
    $("ams-s-bal").textContent = F.info && F.bal != null ? `${fmt(F.bal, F.info.decimals)} ${symOf()}` : "—";
    $("ams-s-tx").textContent = k ? tr(k === 1 ? "1 send + 1 approval" : `${k} batches + 1 approval`) : "—";
    paintGas(ok ? rows.length : 0, k);
    warnings();
    if (F.busy) return;
    const set = (t, on) => { go.textContent = tr(t); go.disabled = !on; };
    if (!F.info) return set("Pick a token", false);
    if (!P || !rows.length) return set("Add recipients", false);
    if (P.sameErr) return set("Enter the amount per wallet", false);
    if (P.errors.length) return set(`Fix ${plural(P.errors.length, "line", "lines")} first`, false);
    if (rows.length > MAX_ROWS) return set("Too many wallets", false);
    if (!CONTRACT()) return set("Opens soon", false);
    if (!state.account) return set("Connect wallet", true);
    if (F.bal != null && P.total > F.bal) return set(`Not enough ${symOf()}`, false);
    set(`Send to ${plural(rows.length, "wallet", "wallets")}`, true);
  }

  // ---------- sending ----------
  function steps(k, done, active, failed) {
    const ol = $("ams-steps");
    if (k == null) { ol.innerHTML = ""; ol.classList.remove("show"); return; }
    const items = [["approve", tr("Approve")]].concat(Array.from({ length: k }, (_, i) => [String(i), k === 1 ? tr("Send") : tr(`Batch ${i + 1}`)]));
    ol.classList.add("show");
    ol.innerHTML = items.map(([id, label]) => `<li class="${done.includes(id) ? "ok" : failed === id ? "bad" : active === id ? "on" : ""}"><span class="ams-tick" aria-hidden="true"></span>${esc(label)}</li>`).join("");
  }
  const say = (cls, html) => { $("ams-status").className = "ams-status " + (cls || ""); $("ams-status").innerHTML = html || ""; };
  function saveJob(job) { try { if (job) localStorage.setItem(JOB, JSON.stringify(job)); else localStorage.removeItem(JOB); } catch { /* private mode */ } }
  function loadJob() { try { const j = JSON.parse(localStorage.getItem(JOB) || "null"); return j && j.v === 1 ? j : null; } catch { return null; } }
  function errText(err) {
    const m = typeof apcErrText === "function" ? apcErrText(err) : String((err && (err.shortMessage || err.reason || err.message)) || err || "");
    return tr(m.length > 200 ? m.slice(0, 200) + "…" : m || "Something went wrong.");
  }
  async function start() {
    if (F.busy) return;
    if (!state.account) { if (typeof connectWallet === "function") await connectWallet(); update(); return; }
    const P = F.P;
    if (!F.info || !P || !P.rows.length || P.errors.length) return;
    const job = {
      v: 1, id: Date.now().toString(36), at: Date.now(), account: lc(state.account), token: F.info.address, sym: symOf(), dec: F.info.decimals,
      rows: P.rows.map((r) => [r.addr, r.amount.toString()]), total: P.total.toString(), done: 0, txs: [],
    };
    await run(job);
  }
  async function run(job) {
    const addr = CONTRACT();
    if (!addr) return;
    F.busy = true;
    const go = $("ams-go");
    go.disabled = true;
    panel.classList.add("ams-sending");
    const rows = job.rows.map(([a, v]) => ({ addr: a, amount: BigInt(v) }));
    const parts = chunks(rows), k = parts.length, done = [];
    for (let i = 0; i < job.done; i++) done.push(String(i));
    if (job.approved || job.done) done.unshift("approve");
    let active = null;
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      if (lc(state.account) !== job.account) throw new Error("Switch back to the wallet that started this send.");
      const tok = new ethers.Contract(job.token, TOK_ABI, state.signer);
      const ms = new ethers.Contract(addr, ABI, state.signer);
      const left = rows.slice(job.done * CHUNK).reduce((s, r) => s + r.amount, 0n);
      const bal = await tok.balanceOf(state.account);
      if (bal < left) throw new Error(tr(`Not enough ${job.sym} — this needs ${fmt(left, job.dec)}, you have ${fmt(bal, job.dec)}.`));
      // 1) one approval for whatever is still to go
      active = "approve"; steps(k, done, active);
      const allow = await tok.allowance(state.account, addr);
      if (allow < left) {
        say("wait", esc(tr("Approve the total in your wallet…")));
        const tx = await tok.approve(addr, left);
        say("wait", `${esc(tr("Approving…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
        await tx.wait();
      }
      job.approved = true; saveJob(job);
      if (!done.includes("approve")) done.push("approve");
      // 2) the batches
      for (let i = job.done; i < k; i++) {
        active = String(i); steps(k, done, active);
        paintDots(i * CHUNK, Math.min(rows.length, (i + 1) * CHUNK));
        const part = parts[i], same = part.every((r) => r.amount === part[0].amount);
        const to = part.map((r) => r.addr);
        say("wait", esc(tr(k === 1 ? "Confirm the send in your wallet…" : `Confirm batch ${i + 1} of ${k} in your wallet…`)));
        // a dry run first: a bad batch fails here, before it costs gas
        if (same) await ms.sendSame.staticCall(job.token, to, part[0].amount);
        else await ms.send.staticCall(job.token, to, part.map((r) => r.amount));
        const tx = same ? await ms.sendSame(job.token, to, part[0].amount) : await ms.send(job.token, to, part.map((r) => r.amount));
        say("wait", `${esc(tr(k === 1 ? "Sending…" : `Sending batch ${i + 1} of ${k}…`))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
        const rc = await tx.wait();
        if (rc && rc.status === 0) throw new Error("The batch transaction failed.");
        job.done = i + 1; job.txs.push(tx.hash); saveJob(job);
        done.push(String(i));
        paintDots((i + 1) * CHUNK, 0);
      }
      steps(k, done, null);
      finish(job);
    } catch (err) {
      console.error("multisend", err);
      steps(k, done, null, active);
      const sent = job.done * CHUNK > rows.length ? rows.length : job.done * CHUNK;
      say("bad", `${esc(errText(err))}${job.done ? ` <span>${esc(tr(`${plural(sent, "wallet", "wallets")} already got theirs — nothing is sent twice.`))}</span>` : ""}`);
      paintResume();
    } finally {
      F.busy = false;
      panel.classList.remove("ams-sending");
      await readBalance();
      update();
      bumpStats(true);
    }
  }
  function finish(job) {
    saveJob(null);
    const hist = loadHist();
    hist.unshift({ id: job.id, at: Date.now(), token: job.token, sym: job.sym, dec: job.dec, n: job.rows.length, total: job.total, txs: job.txs, rows: job.rows.length <= 2000 ? job.rows : null });
    try { localStorage.setItem(HIST, JSON.stringify(hist.slice(0, 10))); } catch { /* private mode */ }
    renderHist();
    paintResume();
    const total = `${fmt(BigInt(job.total), job.dec)} ${job.sym}`;
    say("ok", `<div class="ams-done"><span class="ams-done-ico" aria-hidden="true"></span><div><b>${esc(tr(`Sent ${total} to ${plural(job.rows.length, "wallet", "wallets")}.`))}</b>
      <span>${job.txs.map((h, i) => `<a href="${explorer("tx", h)}" target="_blank" rel="noopener">${esc(job.txs.length === 1 ? "tx" : tr(`batch ${i + 1}`))} ↗</a>`).join(" ")}</span>
      <span><button type="button" class="ams-mini" data-receipt="${esc(job.id)}">${esc(tr("Download receipt (CSV)"))}</button> <button type="button" class="ams-mini" data-new>${esc(tr("New send"))}</button></span></div></div>`);
    burst();
    if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
  }
  // every recipient dot flashes, then the emblem fans out
  function burst() {
    const em = panel.querySelector(".ams-emblem");
    if (em && !reduce) { em.classList.remove("fire"); void em.offsetWidth; em.classList.add("fire"); }
    const d = $("ams-dots");
    if (d && !reduce) { d.classList.remove("fire"); void d.offsetWidth; d.classList.add("fire"); }
  }

  // ---------- unfinished send ----------
  function paintResume() {
    const box = $("ams-resume"), job = loadJob();
    if (!job || !job.done && !job.approved) { box.hidden = true; box.innerHTML = ""; return; }
    const k = Math.ceil(job.rows.length / CHUNK);
    box.hidden = false;
    box.innerHTML = `<div><b>${esc(tr("You have an unfinished send"))}</b><span>${esc(tr(`${job.sym} to ${plural(job.rows.length, "wallet", "wallets")} — ${job.done} of ${k} ${k === 1 ? "batch" : "batches"} sent.`))}</span></div>
      <button type="button" class="ams-btn" data-resume>${esc(tr("Resume"))}</button><button type="button" class="ams-mini" data-discard>${esc(tr("Discard"))}</button>`;
  }

  // ---------- history ----------
  function loadHist() { try { return JSON.parse(localStorage.getItem(HIST) || "[]") || []; } catch { return []; } }
  function ago(t) {
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  }
  function renderHist() {
    const box = $("ams-hist"), h = loadHist();
    if (!h.length) { box.innerHTML = `<p class="ams-empty">${esc(tr("Nothing sent yet. Your sends show up here with their transactions and a receipt."))}</p>`; return; }
    box.innerHTML = `<ul class="ams-hlist">${h.map((x) => `<li><div><b data-no-i18n>${fmt(BigInt(x.total), x.dec)} ${esc(x.sym)}</b><small>${esc(tr(`to ${plural(x.n, "wallet", "wallets")}`))} · <span data-no-i18n>${esc(tr(ago(x.at)))}</span></small></div>
      <span>${x.txs.slice(0, 3).map((t) => `<a href="${explorer("tx", t)}" target="_blank" rel="noopener">tx ↗</a>`).join(" ")}${x.rows ? ` <button type="button" class="ams-mini" data-receipt="${esc(x.id)}">CSV</button>` : ""}</span></li>`).join("")}</ul>`;
  }
  function receipt(id) {
    const job = loadHist().find((x) => x.id === id);
    if (!job || !job.rows) return;
    const lines = ["address,amount,transaction"].concat(job.rows.map(([a, v], i) => `${a},${plain(BigInt(v), job.dec)},${job.txs[Math.floor(i / CHUNK)] || ""}`));
    download(`multisend-${job.sym.replace(/[^A-Za-z0-9]/g, "")}-${new Date(job.at).toISOString().slice(0, 10)}.csv`, lines.join("\n"));
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- stats ----------
  let statsAt = 0;
  async function bumpStats(force) {
    const el = $("ams-stats"), addr = CONTRACT();
    if (!el || !addr || (!force && Date.now() - statsAt < 60000)) return;
    statsAt = Date.now();
    try {
      const c = new ethers.Contract(addr, ABI, lr());
      const [b, t] = await Promise.all([withRetry(() => c.batches()), withRetry(() => c.transfers())]);
      if (!(Number(t) > 0)) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = `<span class="ams-stat"><b data-v="t">0</b><small>${esc(tr("transfers sent"))}</small></span><span class="ams-stat"><b data-v="b">0</b><small>${esc(tr(Number(b) === 1 ? "batch" : "batches"))}</small></span>`;
      const cu = (sel, v) => { const e = el.querySelector(sel); if (typeof window.arcCountUp === "function" && !reduce) window.arcCountUp(e, v, (x) => Math.round(x).toLocaleString("en-US")); else e.textContent = v.toLocaleString("en-US"); };
      cu('[data-v="t"]', Number(t)); cu('[data-v="b"]', Number(b));
    } catch { el.hidden = true; }
  }

  // ================= wiring =================
  const EXAMPLE = ["0x1111111111111111111111111111111111111111, 100", "0x2222222222222222222222222222222222222222, 250.5", "0x3333333333333333333333333333333333333333, 1,000"].join("\n");
  function init() {
    const ct = $("ams-contract");
    if (CONTRACT() && ct) { ct.href = explorer("address", CONTRACT()); ct.hidden = false; }
    $("ams-preview").hidden = !!CONTRACT();
    let tT;
    $("ams-token").addEventListener("input", (e) => {
      clearTimeout(tT);
      const v = e.target.value.trim();
      tT = setTimeout(() => { if (!v) pickToken(null); else if (ethers.isAddress(v)) pickToken(v); }, 250);
    });
    let lT;
    const ta = $("ams-list");
    ta.addEventListener("input", () => { paintGutter(); clearTimeout(lT); lT = setTimeout(reparse, 180); });
    ta.addEventListener("scroll", () => { $("ams-gutter").scrollTop = ta.scrollTop; });
    const ph = () => { const same = $("ams-same-on").checked; ta.placeholder = same ? `0x1234…abcd\n0x5678…ef01\n${tr("One wallet address per line")}` : `0x1234…abcd, 100\n0x5678…ef01, 250.5\n${tr("One wallet per line — address, then amount")}`; };
    ph();
    ta.setAttribute("aria-label", tr("Recipients, one per line: address, amount"));
    $("ams-same-on").addEventListener("change", (e) => { $("ams-same-row").hidden = !e.target.checked; ph(); reparse(); if (e.target.checked) $("ams-same").focus(); });
    $("ams-same").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\d.,]/g, ""); clearTimeout(lT); lT = setTimeout(reparse, 150); });
    $("ams-example").addEventListener("click", () => { ta.value = sameOn() ? EXAMPLE.replace(/, [\d.,]+/g, "") : EXAMPLE; reparse(); });
    $("ams-template").addEventListener("click", () => download("multisend-template.csv", "address,amount\n0x1111111111111111111111111111111111111111,100\n0x2222222222222222222222222222222222222222,250.5\n"));
    $("ams-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 2e6) { say("bad", esc(tr("That file is too big — keep it under 2 MB."))); return; }
      const r = new FileReader();
      r.onload = () => { ta.value = String(r.result || "").replace(/^﻿/, ""); reparse(); e.target.value = ""; };
      r.readAsText(f);
    });
    // dropping a file on the list
    ta.addEventListener("dragover", (e) => { e.preventDefault(); ta.classList.add("drag"); });
    ta.addEventListener("dragleave", () => ta.classList.remove("drag"));
    ta.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      ta.classList.remove("drag");
      if (!f) return;
      e.preventDefault();
      f.text().then((t) => { ta.value = t.replace(/^﻿/, ""); reparse(); });
    });
    $("ams-go").addEventListener("click", start);
    panel.addEventListener("click", (e) => {
      const t = e.target;
      if (!t.closest) return;
      const chip = t.closest("[data-token]");
      if (chip) { $("ams-token").value = chip.dataset.token; pickToken(chip.dataset.token); return; }
      const ln = t.closest("[data-line]");
      if (ln) {
        const n = Number(ln.dataset.line), lines = ta.value.split("\n");
        const startAt = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
        ta.focus(); ta.setSelectionRange(startAt, startAt + (lines[n - 1] || "").length);
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        ta.scrollTop = Math.max(0, (n - 3) * lh);
        return;
      }
      const fix = t.closest("[data-fix]");
      if (fix && F.info) {
        if (fix.dataset.fix === "drop") {
          const bad = new Set(F.P.errors.map((x) => x.line));
          ta.value = ta.value.split("\n").filter((_, i) => !bad.has(i + 1)).join("\n");
        } else ta.value = mergeDuplicates(ta.value, F.info.decimals, sameOn() ? $("ams-same").value : null);
        reparse(); return;
      }
      if (t.closest("[data-resume]")) { const j = loadJob(); if (j) run(j); return; }
      if (t.closest("[data-discard]")) { saveJob(null); paintResume(); return; }
      const rc = t.closest("[data-receipt]");
      if (rc) { receipt(rc.dataset.receipt); return; }
      if (t.closest("[data-new]")) { ta.value = ""; say("", ""); steps(null); reparse(); $("ams-step-list").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    });
    renderChips();
    renderHist();
    paintResume();
    paintGutter();
    update();
  }
  let booted = false;
  function onShow() {
    if (!booted) { booted = true; init(); }
    renderChips();
    bumpStats();
    if (F.info) readBalance().then(update);
    const m = /[?&]token=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m && (!F.info || lc(F.info.address) !== lc(m[1]))) { $("ams-token").value = m[1]; pickToken(m[1]); }
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "multisend") onShow(); });
  // after i18n.js (last in the bundle) has set the language
  if (panel.classList.contains("active")) setTimeout(onShow, 0);
  let seen = state.account;
  setInterval(() => { if (booted && state.account !== seen) { seen = state.account; renderChips(); readBalance().then(update); } }, 1500);
  window.arcMultisend = { parseList, mergeDuplicates, chunks, CHUNK };
})();
