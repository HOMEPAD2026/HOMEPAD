/* global ethers, CONFIG, state, readProvider, withRetry, blockAtOrAfter, queryFilterChunked */
// arc-snapshot.js — Holder Snapshot, an ARCIRCLE PAD utility (arcpad.html#snapshot).
// Every holder of an Arc token at one block, with filters, a CSV and a
// fingerprint, straight into the Multisender.
//
//   Now        the server's balance sheet (/api/social?holdersnap=), built from
//              the token's own Transfer log, at the block it was read to.
//   The past   that sheet walked backwards: every Transfer after the chosen
//              block is undone (read here, straight from Arc), which gives
//              the exact balances at that block — and who has sold since.
//   Filters    minimum / maximum holding, top N, no contracts (pools, lockers),
//              "still holds", wallets to leave out. Burn addresses never count.
//   Out        CSV, the address list, a share link that rebuilds the same
//              snapshot, a keccak fingerprint of the CSV for announcements,
//              and "airdrop to these wallets" (same amount / by holding).
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-snapshot");
  if (!panel || typeof CONFIG === "undefined") return;

  const MAX_DAYS = 30, PAGE = 50, HIST = "arcircle.snapshot.hist.v1", ROWS = 8000;
  const ZERO = "0x0000000000000000000000000000000000000000", DEAD = "0x000000000000000000000000000000000000dead";
  const BURN = new Set([ZERO, DEAD]);
  const ARCIRCLE = String(CONFIG.ARCIRCLE_TOKEN || "").toLowerCase();
  const TOK_ABI = [
    "function name() view returns (string)", "function symbol() view returns (string)",
    "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ];

  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const lr = () => readProvider();
  const num = (n) => Number(n).toLocaleString("en-US");
  const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
  function fmt(raw, dec) {
    const n = Number(ethers.formatUnits(raw, dec));
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 1000 ? 4 : 2 });
  }
  const plain = (raw, dec) => ethers.formatUnits(raw, dec).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const pctOf = (v, of) => (of > 0n ? Number((v * 1000000n) / of) / 10000 : 0);
  const pctTxt = (p) => (p === 0 ? "0%" : p < 0.0001 ? "<0.0001%" : p < 0.01 ? p.toFixed(4) + "%" : p < 1 ? p.toFixed(3) + "%" : p.toFixed(2) + "%");
  const loc = () => { const l = window.arcI18n && window.arcI18n.get(); return l === "ko" ? "ko-KR" : l === "zh" ? "zh-CN" : "en-US"; };
  function when(ts) {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    return d.toLocaleString(loc(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  async function fetchJson(url, ms = 30000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());

  // ---------------- state ----------------
  const F = {
    tok: null,      // { address, name, symbol, decimals, supply }
    base: null,     // the server sheet: { block, ts, lite, complete, count, bal: Map, flagged: Set, checked: Set }
    mode: "now",    // now | past
    at: "",         // datetime-local value for "past"
    res: null,      // { block, ts, supply, past, rows: [{ a, v, now, c }] }
    list: [],       // res.rows after the filters
    shown: PAGE, q: "",
    f: { min: "", max: "", top: "", noC: true, hold: "any", skip: "" },
    busy: false, run: 0,
  };

  // ---------------- the token ----------------
  async function readToken(addr) {
    const c = new ethers.Contract(addr, TOK_ABI, lr());
    const [name, symbol, decimals, supply] = await Promise.all([
      retry(() => c.name()).catch(() => ""), retry(() => c.symbol()).catch(() => ""),
      retry(() => c.decimals()).catch(() => null), retry(() => c.totalSupply()).catch(() => null),
    ]);
    if (supply == null || decimals == null) return null;
    return { address: ethers.getAddress(addr), name: String(name || "").slice(0, 60), symbol: String(symbol || "").slice(0, 20), decimals: Number(decimals), supply: BigInt(supply) };
  }
  const symOf = () => (F.tok && F.tok.symbol ? "$" + F.tok.symbol : tr("tokens"));

  async function pick(addr, opts) {
    addr = String(addr || "").trim();
    if (!isAddr(addr)) { status("bad", tr("That isn't a token contract address.")); return; }
    const run = ++F.run;
    F.tok = null; F.base = null; F.res = null; F.list = [];
    $("asn-addr").value = addr;
    paintToken(); paintResult();
    status("wait", tr("Reading the token…"));
    const tok = await readToken(addr).catch(() => null);
    if (run !== F.run) return;
    if (!tok) { status("bad", tr("Couldn't read that as an ERC-20 token on Arc.")); return; }
    F.tok = tok;
    paintToken(true);
    await loadBase(run);
    if (run !== F.run || !F.base) return;
    if (opts && opts.block && F.base.block && opts.block < F.base.block) { F.mode = "past"; F.pastBlock = opts.block; paintWhen(); }
    await take(run, opts && opts.block);
  }

  // The server's sheet; long histories are read over a few calls.
  async function loadBase(run) {
    let last = null;
    for (let i = 0; i < 10; i++) {
      const r = await fetchJson(`/api/social?holdersnap=${F.tok.address}&limit=${ROWS}`);
      if (run !== F.run) return;
      if (r.status === 429) { status("wait", tr("Busy — trying again in a moment…")); await new Promise((x) => setTimeout(x, 6000)); continue; }
      if (!r.ok || !r.j || !Array.isArray(r.j.holders)) break;
      last = r.j;
      if (!last.more) break;
      status("wait", tr(`Reading the history — ${plural(last.holderCount || 0, "holder", "holders")} so far…`));
    }
    if (!last) { status("bad", tr("Couldn't read the holders right now — try again in a moment.")); return; }
    const bal = new Map(), flagged = new Set(), checked = new Set();
    last.holders.forEach(([a, v, c], i) => { a = lc(a); bal.set(a, BigInt(v)); if (c) flagged.add(a); if (i < (last.checkedContracts || 0)) checked.add(a); });
    F.base = { block: last.block || null, ts: last.ts || null, lite: !!last.lite, complete: !!last.complete, count: last.holderCount || bal.size, bal, flagged, checked, decimals: last.decimals };
    if (!F.base.block) {
      // a very widely held token: only its largest holders, as of now
      const b = await retry(() => lr().getBlock("latest")).catch(() => null);
      F.base.block = b ? b.number : null; F.base.ts = b ? Number(b.timestamp) : F.base.ts;
    }
    status("", "");
  }

  // ---------------- taking the snapshot ----------------
  let cancelled = 0;
  async function take(run, atBlock) {
    if (!F.tok || !F.base) return;
    run = run || F.run;
    const base = F.base, tok = F.tok;
    F.busy = true; paintBusy();
    try {
      if (F.mode === "now") {
        const rows = [...base.bal.entries()].map(([a, v]) => ({ a, v, now: v }));
        F.res = { block: base.block, ts: base.ts, supply: tok.supply, past: false, rows };
      } else {
        if (base.lite || !base.complete) throw new Error(tr("This token has too many holders to rebuild an earlier moment — only \"Now\" works for it."));
        let B = atBlock || F.pastBlock || null;
        if (!B) {
          if (!F.at) throw new Error(tr("Pick a date and time first."));
          const tMs = new Date(F.at).getTime();
          if (!isFinite(tMs)) throw new Error(tr("Pick a date and time first."));
          if (tMs > Date.now() - 60000) throw new Error(tr("Pick a moment in the past — or use \"Now\"."));
          if (tMs < Date.now() - MAX_DAYS * 86400e3) throw new Error(tr(`Snapshots go back up to ${MAX_DAYS} days.`));
          status("wait", tr("Finding the block…"));
          B = await blockBefore(Math.floor(tMs / 1000), base.block);
        }
        if (run !== F.run) return;
        if (B >= base.block) B = base.block;
        const res = await rewind(B, run);
        if (!res) return;
        F.res = res;
      }
      F.pastBlock = null;
      if (run !== F.run) return;
      if (F.res.past && F.res.ts) { F.at = localInput(F.res.ts * 1000); $("asn-at").value = F.at; }
      await flagContracts(run);
      if (run !== F.run) return;
      F.shown = PAGE;
      remember();
      apply(true);
      status("", "");
    } catch (err) {
      if (run === F.run && err && err.message !== "cancelled") status("bad", String(err.message || err).slice(0, 200));
    } finally {
      if (run === F.run) { F.busy = false; paintBusy(); }
    }
  }

  // The last block before `ts`. blockAtOrAfter (arc-shared.js) lands within
  // ~2,000 blocks; a short binary search makes it exact.
  async function blockBefore(ts, cap) {
    const at = (n) => retry(() => lr().getBlock(n)).then((b) => Number(b.timestamp));
    let lo = await blockAtOrAfter(new Date(ts * 1000).toISOString(), "snapshot");
    let hi = Math.min(cap, lo + 4096);
    if (await at(lo) >= ts) { while (lo > 0 && await at(lo) >= ts) lo = Math.max(0, lo - 4096); }
    if (await at(hi) < ts) return hi;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (await at(mid) < ts) lo = mid; else hi = mid; }
    return lo;
  }

  // Undo every Transfer after block B, back from the sheet's block.
  async function rewind(B, run) {
    const base = F.base, tok = F.tok;
    const to = base.block;
    const past = new Map(base.bal);
    let mintedAfter = 0n, burnedAfter = 0n;
    const blk = await retry(() => lr().getBlock(B)).catch(() => null);
    const c = new ethers.Contract(tok.address, TOK_ABI, lr());
    const total = Math.max(1, Math.ceil((to - B) / 9000));
    const token = ++cancelled;
    if (to > B) {
      status("wait", tr("Reading transfers since then…"), 0);
      await queryFilterChunked(c, "Transfer", B + 1, to, {
        onChunk: (events, range, done) => {
          if (token !== cancelled || run !== F.run) throw new Error("cancelled");
          for (const e of events) {
            const fr = lc(e.args[0]), t = lc(e.args[1]), v = BigInt(e.args[2]);
            if (fr === ZERO) mintedAfter += v; else past.set(fr, (past.get(fr) || 0n) + v);
            if (t === ZERO) burnedAfter += v; else past.set(t, (past.get(t) || 0n) - v);
          }
          status("wait", tr(`Reading transfers since then — ${Math.round((done / total) * 100)}%`), done / total);
        },
      });
    }
    if (token !== cancelled || run !== F.run) return null;
    const rows = [];
    let odd = 0;
    past.forEach((v, a) => { if (v < 0n) odd++; if (v > 0n) rows.push({ a, v, now: base.bal.get(a) || 0n }); });
    return { block: B, ts: blk ? Number(blk.timestamp) : null, supply: tok.supply - mintedAfter + burnedAfter, past: true, rows, odd };
  }

  // Contracts among the biggest wallets: the server checked its top 1,000 as of now.
  async function flagContracts(run) {
    const r = F.res, base = F.base;
    r.rows.sort((x, y) => (y.v > x.v ? 1 : y.v < x.v ? -1 : 0));
    const need = r.rows.slice(0, 1000).filter((x) => !base.checked.has(x.a)).map((x) => x.a).slice(0, 400);
    for (let i = 0; i < need.length; i += 50) {
      const part = need.slice(i, i + 50);
      const codes = await Promise.all(part.map((a) => lr().getCode(a).catch(() => "0x")));
      if (run !== F.run) return;
      part.forEach((a, k) => { base.checked.add(a); if (codes[k] && codes[k] !== "0x") base.flagged.add(a); });
    }
    r.rows.forEach((x) => { x.c = base.flagged.has(x.a); });
  }

  // ---------------- filters ----------------
  function amount(str) {
    const v = String(str || "").trim().replace(/,/g, "");
    if (!v) return null;
    if (!/^\d*\.?\d+$/.test(v)) return undefined;
    try { return ethers.parseUnits(v.startsWith(".") ? "0" + v : v, F.tok.decimals); } catch { return undefined; }
  }
  function skipSet() {
    return new Set((F.f.skip.match(/0x[0-9a-fA-F]{40}/g) || []).map(lc));
  }
  function apply(fresh) {
    const r = F.res;
    if (!r) { paintResult(); return; }
    const min = amount(F.f.min), max = amount(F.f.max), top = Math.max(0, parseInt(F.f.top, 10) || 0), skip = skipSet();
    const why = { burn: 0, contract: 0, small: 0, big: 0, sold: 0, skip: 0 };
    let list = [];
    for (const x of r.rows) {
      if (BURN.has(x.a)) { why.burn++; continue; }
      if (skip.has(x.a)) { why.skip++; continue; }
      if (F.f.noC && x.c) { why.contract++; continue; }
      if (min && x.v < min) { why.small++; continue; }
      if (max && x.v > max) { why.big++; continue; }
      if (r.past && F.f.hold === "some" && x.now === 0n) { why.sold++; continue; }
      if (r.past && F.f.hold === "all" && x.now < x.v) { why.sold++; continue; }
      list.push(x);
    }
    if (top && list.length > top) list = list.slice(0, top);
    F.list = list; F.why = why;
    F.bad = { min: min === undefined, max: max === undefined };
    paintResult(fresh);
  }

  // ---------------- outputs ----------------
  function csv() {
    const r = F.res, dec = F.tok.decimals;
    const head = r.past ? "rank,address,balance,percent_of_supply,balance_now" : "rank,address,balance,percent_of_supply";
    const lines = F.list.map((x, i) => {
      const base = `${i + 1},${ethers.getAddress(x.a)},${plain(x.v, dec)},${pctOf(x.v, r.supply)}`;
      return r.past ? `${base},${plain(x.now, dec)}` : base;
    });
    return `${head}\n${lines.join("\n")}\n`;
  }
  const fingerprint = () => ethers.keccak256(ethers.toUtf8Bytes(csv()));
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function shareUrl() {
    const q = new URLSearchParams({ t: F.tok.address });
    if (F.res && F.res.past) q.set("b", String(F.res.block));
    if (F.f.min) q.set("min", F.f.min);
    if (F.f.max) q.set("max", F.f.max);
    if (F.f.top) q.set("top", F.f.top);
    if (!F.f.noC) q.set("nc", "0");
    if (F.f.hold !== "any") q.set("hold", F.f.hold);
    return `${location.origin}/arc#snapshot?${q.toString()}`;
  }
  async function copy(text, btn, done) {
    try { await navigator.clipboard.writeText(text); toast(done || tr("Copied")); if (btn) { btn.classList.add("ok"); setTimeout(() => btn.classList.remove("ok"), 1400); } }
    catch { toast(tr("Copy failed")); }
  }
  function toMultisend(how) {
    if (!F.list.length || !window.arcMultisend || typeof window.arcMultisend.load !== "function") return;
    const dec = F.tok.decimals;
    let text, am, skipped = 0;
    if (how === "same") { text = F.list.map((x) => ethers.getAddress(x.a)).join("\n"); am = "same"; }
    else {
      const rows = [];
      for (const x of F.list) {
        const w = Number(ethers.formatUnits(x.v, dec)).toFixed(6).replace(/\.?0+$/, "");
        if (!w || w === "0") { skipped++; continue; }
        rows.push(`${ethers.getAddress(x.a)}, ${w}`);
      }
      text = rows.join("\n"); am = "weight";
    }
    const n = F.list.length - skipped;
    if (typeof window.arcpadShowTab === "function") window.arcpadShowTab("multisend");
    else location.hash = "#multisend";
    setTimeout(() => window.arcMultisend.load(text, am, tr(`${plural(n, "wallet", "wallets")} from the ${symOf()} snapshot — now pick the token to send.`)), 60);
  }

  // ---------------- recent snapshots ----------------
  function hist() { try { const h = JSON.parse(localStorage.getItem(HIST) || "[]"); return Array.isArray(h) ? h : []; } catch { return []; } }
  function remember() {
    const r = F.res;
    const item = { t: F.tok.address, s: F.tok.symbol, b: r.past ? r.block : null, ts: r.ts, n: r.rows.length, at: Date.now() };
    const h = hist().filter((x) => !(lc(x.t) === lc(item.t) && x.b === item.b));
    h.unshift(item);
    try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, 8))); } catch { /* private mode */ }
    paintChips();
  }

  // ---------------- painting ----------------
  let toastT = 0;
  function toast(t) {
    const el = $("asn-toast");
    el.textContent = t; el.hidden = false;
    el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function status(k, text, frac) {
    const el = $("asn-status");
    el.className = "asn-status" + (k ? " " + k : "");
    el.hidden = !text;
    el.innerHTML = text ? `<span>${esc(text)}</span>${frac != null ? `<i class="asn-prog"><b style="transform:scaleX(${Math.max(0.02, Math.min(1, frac))})"></b></i>` : ""}${k === "wait" && F.mode === "past" && frac != null ? `<button type="button" class="ams-mini" data-cancel>${esc(tr("Cancel"))}</button>` : ""}` : "";
  }
  function paintBusy() {
    $("asn-go").disabled = F.busy || !F.base;
    panel.classList.toggle("asn-busy", F.busy);
  }
  function paintChips() {
    const chips = [];
    if (ARCIRCLE) chips.push(`<button type="button" class="ams-chip" data-t="${esc(CONFIG.ARCIRCLE_TOKEN)}" data-no-i18n>$ARCIRCLE</button>`);
    const launches = (typeof ARC !== "undefined" && ARC.launches) || [];
    launches.slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0)).slice(0, 3)
      .forEach((l) => { if (lc(l.token) !== ARCIRCLE) chips.push(`<button type="button" class="ams-chip" data-t="${esc(l.token)}" data-no-i18n>$${esc(l.symbol)}</button>`); });
    const h = hist().slice(0, 4);
    const recent = h.length ? `<span class="asn-chips-l">${esc(tr("Recent"))}</span>` + h.map((x) => `<button type="button" class="ams-chip mine" data-t="${esc(x.t)}"${x.b ? ` data-b="${x.b}"` : ""} title="${esc(x.b ? `#${x.b}` : tr("Now"))}"><span data-no-i18n>$${esc(x.s || "?")}</span>${x.b ? ` · ${esc(new Date((x.ts || 0) * 1000).toLocaleDateString(loc(), { month: "short", day: "numeric" }))}` : ""}</button>`).join("") : "";
    const html = (chips.length ? `<span class="asn-chips-l">${esc(tr("Try"))}</span>${chips.join("")}` : "") + recent;
    const box = $("asn-chips");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  function paintToken(pop) {
    const el = $("asn-tok");
    const t = F.tok;
    el.hidden = !t;
    if (!t) return;
    const base = F.base;
    el.innerHTML = `<span class="asn-tok-ico" aria-hidden="true">${esc((t.symbol || "?").slice(0, 1))}</span>
      <div class="asn-tok-txt"><b data-no-i18n>${esc(t.name || t.symbol || short(t.address))} <small>$${esc(t.symbol)}</small></b>
      <span>${esc(tr("Supply"))} ${esc(fmt(t.supply, t.decimals))} · <a href="${explorer("token", t.address)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(t.address))} ↗</a>${base ? ` · ${esc(tr(plural(base.count, "holder", "holders")))}` : ""}</span></div>`;
    if (pop && !reduce) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  }
  function paintWhen() {
    panel.querySelectorAll("[data-when]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.when === F.mode)));
    $("asn-past").hidden = F.mode !== "past";
    $("asn-hold-row").hidden = F.mode !== "past";
    const lite = F.base && (F.base.lite || !F.base.complete);
    $("asn-lite").hidden = !(F.mode === "past" && lite);
  }
  function tiers(list, supply) {
    const T = [
      { k: "whale", n: 0, v: 0n, label: "Whales", sub: "1%+ of supply" },
      { k: "large", n: 0, v: 0n, label: "Large", sub: "0.1–1%" },
      { k: "mid", n: 0, v: 0n, label: "Mid", sub: "0.01–0.1%" },
      { k: "small", n: 0, v: 0n, label: "Small", sub: "under 0.01%" },
    ];
    for (const x of list) {
      const p = pctOf(x.v, supply);
      const t = p >= 1 ? T[0] : p >= 0.1 ? T[1] : p >= 0.01 ? T[2] : T[3];
      t.n++; t.v += x.v;
    }
    return T;
  }
  function paintResult(fresh) {
    const out = $("asn-out");
    const r = F.res;
    $("asn-empty").hidden = !!r;
    out.hidden = !r;
    $("asn-bad-min").hidden = !(F.bad && F.bad.min);
    $("asn-bad-max").hidden = !(F.bad && F.bad.max);
    if (!r) { $("asn-acts").hidden = true; return; }
    const dec = F.tok.decimals, list = F.list, supply = r.supply;
    const held = list.reduce((s, x) => s + x.v, 0n);
    const top10 = list.slice(0, 10).reduce((s, x) => s + x.v, 0n);
    const me = state && state.account ? lc(state.account) : "";
    const myIdx = me ? list.findIndex((x) => x.a === me) : -1;
    const myRow = me ? r.rows.find((x) => x.a === me) : null;
    const w = F.why || {};
    const out1 = [
      w.contract ? tr(plural(w.contract, "contract", "contracts")) : "",
      w.burn ? tr(plural(w.burn, "burn address", "burn addresses")) : "",
      w.small ? tr(`${num(w.small)} under the minimum`) : "", w.big ? tr(`${num(w.big)} over the maximum`) : "",
      w.sold ? tr(`${num(w.sold)} sold since`) : "", w.skip ? tr(`${num(w.skip)} left out by you`) : "",
    ].filter(Boolean);
    const T = tiers(list, supply);
    const tierBar = T.map((t) => `<i class="t-${t.k}" style="flex-grow:${Math.max(0, pctOf(t.v, held || 1n))}" title="${esc(tr(t.label))}"></i>`).join("");
    $("asn-sum").innerHTML = `
      <div class="asn-head">
        <div class="asn-shot"><span class="asn-kick">${esc(tr(r.past ? "Snapshot" : "Snapshot · now"))}</span>
          <b>${esc(when(r.ts))}</b>
          <span>${esc(tr("Block"))} <a href="${explorer("block", r.block)}" target="_blank" rel="noopener" data-no-i18n>#${num(r.block)} ↗</a></span></div>
        <div class="asn-fp" title="${esc(tr("keccak256 of the CSV below — post it with an announcement so anyone can check the list wasn't changed"))}">
          <span>${esc(tr("Fingerprint"))}</span><code data-no-i18n>${esc(list.length ? fingerprint().slice(0, 18) + "…" : "—")}</code>
          <button type="button" class="ams-mini" data-act="fp">${esc(tr("Copy"))}</button></div>
      </div>
      <div class="asn-stats">
        <div><b class="asn-count" data-to="${list.length}">${num(list.length)}</b><small>${esc(tr("Holders"))}</small></div>
        <div><b>${esc(pctTxt(pctOf(held, supply)))}</b><small>${esc(tr("of the supply"))}</small></div>
        <div><b>${esc(pctTxt(pctOf(top10, held || 1n)))}</b><small>${esc(tr("held by the top 10"))}</small></div>
        <div><b>${esc(fmt(held, dec))}</b><small data-no-i18n>${esc(symOf())}</small></div>
      </div>
      ${F.base.lite && !r.past ? `<p class="asn-left warn">${esc(tr("A very widely held token — only its largest holders are listed."))}</p>` : !F.base.complete ? `<p class="asn-left warn">${esc(tr("Its older history is still being read — the list may be missing some wallets. Try again in a minute."))}</p>` : ""}
      ${out1.length ? `<p class="asn-left">${esc(tr("Left out:"))} ${out1.map(esc).join(" · ")}</p>` : ""}
      ${r.odd ? `<p class="asn-left warn">${esc(tr("This token's balances don't follow its transfers exactly (a rebasing or taxed token) — check the list against the explorer."))}</p>` : ""}
      ${me ? `<p class="asn-me${myIdx >= 0 ? " in" : ""}">${myIdx >= 0 ? esc(tr(`Your wallet is #${myIdx + 1} in this snapshot`)) + ` · <b data-no-i18n>${esc(fmt(list[myIdx].v, dec))} ${esc(symOf())}</b>` : myRow ? esc(tr("Your wallet held this token but is filtered out.")) : esc(tr("Your wallet isn't in this snapshot."))}</p>` : ""}
      ${list.length ? `<div class="asn-tiers"><div class="asn-tierbar${fresh && !reduce ? " grow" : ""}">${tierBar}</div>
        <ul>${T.map((t) => `<li class="t-${t.k}"><i></i><b>${esc(tr(t.label))}</b><span>${esc(tr(t.sub))}</span><em>${esc(num(t.n))}</em><small>${esc(pctTxt(pctOf(t.v, held || 1n)))}</small></li>`).join("")}</ul></div>` : ""}`;
    paintTable();
    $("asn-acts").hidden = !list.length;
    if (fresh && !reduce) {
      out.classList.remove("in"); void out.offsetWidth; out.classList.add("in");
      countUp();
      const em = panel.querySelector(".asn-emblem");
      if (em) { em.classList.remove("flash"); void em.offsetWidth; em.classList.add("flash"); }
    }
  }
  function countUp() {
    const el = panel.querySelector(".asn-count");
    if (!el) return;
    const to = Number(el.dataset.to) || 0;
    if (to < 10) return;
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = num(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function paintTable() {
    const r = F.res, dec = F.tok.decimals;
    const me = state && state.account ? lc(state.account) : "";
    const q = lc(F.q.trim());
    const rows = F.list.map((x, i) => ({ ...x, i })).filter((x) => !q || x.a.includes(q));
    const vis = rows.slice(0, F.shown);
    const change = (x) => {
      if (!r.past) return "";
      if (x.now === 0n) return `<span class="asn-tag sold">${esc(tr("Sold all"))}</span>`;
      if (x.now > x.v) return `<span class="asn-tag up">${esc(tr("Added"))}</span>`;
      if (x.now < x.v) return `<span class="asn-tag down">${esc(tr("Sold some"))}</span>`;
      return `<span class="asn-tag same">${esc(tr("Held"))}</span>`;
    };
    $("asn-table").innerHTML = `
      <table><thead><tr><th>#</th><th>${esc(tr("Wallet"))}</th><th class="n">${esc(tr("Balance"))}</th><th class="n">%</th>${r.past ? `<th class="n">${esc(tr("Now"))}</th>` : ""}</tr></thead>
      <tbody>${vis.map((x) => `<tr class="${x.a === me ? "me" : ""}"><td class="rk">${x.i + 1}</td>
        <td><a href="${explorer("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(ethers.getAddress(x.a)))}</a>${x.c ? ` <span class="asn-tag c">${esc(tr("Contract"))}</span>` : ""}${x.a === me ? ` <span class="asn-tag me">${esc(tr("You"))}</span>` : ""}</td>
        <td class="n" data-no-i18n>${esc(fmt(x.v, dec))}</td><td class="n" data-no-i18n>${esc(pctTxt(pctOf(x.v, r.supply)))}</td>
        ${r.past ? `<td class="n"><span data-no-i18n>${esc(fmt(x.now, dec))}</span> ${change(x)}</td>` : ""}</tr>`).join("")}</tbody></table>
      ${!rows.length ? `<p class="asn-none">${esc(tr(q ? "No wallet matches that search." : "No wallets left after these filters."))}</p>` : ""}
      ${rows.length > vis.length ? `<button type="button" class="ams-mini asn-more" data-act="more">${esc(tr(`Show more (${num(rows.length - vis.length)} left)`))}</button>` : ""}`;
  }

  // ---------------- wiring ----------------
  function readFilters() {
    F.f.min = $("asn-min").value; F.f.max = $("asn-max").value; F.f.top = $("asn-top").value;
    F.f.noC = $("asn-noc").checked; F.f.skip = $("asn-skip").value;
  }
  function writeFilters() {
    $("asn-min").value = F.f.min; $("asn-max").value = F.f.max; $("asn-top").value = F.f.top;
    $("asn-noc").checked = F.f.noC; $("asn-skip").value = F.f.skip;
    panel.querySelectorAll("[data-hold]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.hold === F.f.hold)));
    const sym = F.tok ? symOf() : "";
    panel.querySelectorAll(".asn-unit").forEach((u) => { u.textContent = sym; });
  }
  function localInput(ms) {
    const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function labels() {
    $("asn-addr").setAttribute("placeholder", tr("Paste a token contract address (0x…)"));
    $("asn-skip").setAttribute("placeholder", tr("0x… one per line — team, exchanges, anyone else"));
    $("asn-skip").setAttribute("aria-label", tr("Wallets to leave out"));
  }
  let booted = false;
  function init() {
    const at = $("asn-at");
    at.max = localInput(Date.now()); at.min = localInput(Date.now() - MAX_DAYS * 86400e3);
    labels();
    $("asn-form").addEventListener("submit", (e) => { e.preventDefault(); pick($("asn-addr").value); });
    $("asn-addr").addEventListener("paste", () => setTimeout(() => { const v = $("asn-addr").value.trim(); if (isAddr(v)) pick(v); }, 0));
    $("asn-go").addEventListener("click", () => { if (F.tok && F.base) { F.run++; take(F.run); } else pick($("asn-addr").value); });
    at.addEventListener("change", () => { F.at = at.value; });
    let ft = 0;
    panel.addEventListener("input", (e) => {
      if (e.target.id === "asn-q") { F.q = e.target.value; F.shown = PAGE; if (F.res) paintTable(); return; }
      if (/^asn-(min|max|top|skip)$/.test(e.target.id)) { readFilters(); clearTimeout(ft); ft = setTimeout(() => apply(false), 200); }
    });
    panel.addEventListener("change", (e) => { if (e.target.id === "asn-noc") { readFilters(); apply(false); } });
    panel.addEventListener("click", (e) => {
      const t = e.target.closest("button, [data-t]");
      if (!t || !panel.contains(t)) return;
      if (t.dataset.t) { pick(t.dataset.t, t.dataset.b ? { block: Number(t.dataset.b) } : null); return; }
      if (t.dataset.when) {
        F.mode = t.dataset.when; paintWhen();
        if (F.mode === "past" && !F.at) { F.at = localInput(Date.now() - 86400e3); at.value = F.at; }
        if (F.mode === "now" && F.base && F.res && F.res.past) { F.run++; take(F.run); }
        return;
      }
      if (t.dataset.ago) { F.at = localInput(Date.now() - Number(t.dataset.ago) * 3600e3); at.value = F.at; return; }
      if (t.dataset.hold) { F.f.hold = t.dataset.hold; writeFilters(); apply(false); return; }
      if (t.hasAttribute("data-cancel")) { cancelled++; F.run++; F.busy = false; paintBusy(); status("", ""); return; }
      const a = t.dataset.act;
      if (!a) return;
      if (a === "more") { F.shown += PAGE * 2; paintTable(); }
      else if (a === "csv") { download(`snapshot-${(F.tok.symbol || "token").replace(/[^\w-]/g, "")}-${F.res.block}.csv`, csv(), "text/csv"); toast(tr("CSV downloaded")); }
      else if (a === "addrs") copy(F.list.map((x) => ethers.getAddress(x.a)).join("\n"), t, tr(`${plural(F.list.length, "address", "addresses")} copied`));
      else if (a === "link") copy(shareUrl(), t, tr("Link copied — it rebuilds this exact snapshot"));
      else if (a === "fp") copy(fingerprint(), t, tr("Fingerprint copied"));
      else if (a === "ms-same") toMultisend("same");
      else if (a === "ms-weight") toMultisend("weight");
      else if (a === "skip-toggle") { const box = $("asn-skipbox"); box.hidden = !box.hidden; t.setAttribute("aria-expanded", String(!box.hidden)); if (!box.hidden) $("asn-skip").focus(); }
    });
    writeFilters(); paintWhen(); paintBusy();
  }
  function fromHash() {
    const m = /^#snapshot\?(.+)$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    const t = q.get("t") || q.get("token");
    if (!isAddr(t)) return;
    F.f.min = q.get("min") || ""; F.f.max = q.get("max") || ""; F.f.top = q.get("top") || "";
    F.f.noC = q.get("nc") !== "0"; F.f.hold = ["some", "all"].includes(q.get("hold")) ? q.get("hold") : "any";
    writeFilters();
    const b = Number(q.get("b")) || 0;
    if (F.tok && lc(F.tok.address) === lc(t) && F.res && (b ? F.res.block === b : !F.res.past)) return;
    F.mode = b ? "past" : "now"; paintWhen();
    pick(t, b ? { block: b } : null);
  }
  function onShow() {
    if (!booted) { booted = true; init(); }
    paintChips();
    fromHash();
    if (!F.tok && !reduce) setTimeout(() => { if (panel.classList.contains("active")) $("asn-addr").focus({ preventScroll: true }); }, 250);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "snapshot") onShow(); });
  // strings built here were translated when they were drawn: draw them again
  document.addEventListener("arc:lang", () => { if (!booted) return; labels(); paintChips(); paintToken(); if (F.res) paintResult(false); });
  window.addEventListener("hashchange", () => { if (booted && /^#snapshot\?/.test(location.hash)) fromHash(); });
  if (panel.classList.contains("active")) setTimeout(onShow, 0);
  let seen = state && state.account;
  setInterval(() => { if (booted && state && state.account !== seen) { seen = state.account; if (F.res) paintResult(false); } }, 1500);
  window.arcSnapshot = { pick, state: F, csv: () => (F.res ? csv() : ""), fingerprint: () => (F.res ? fingerprint() : "") };
})();
