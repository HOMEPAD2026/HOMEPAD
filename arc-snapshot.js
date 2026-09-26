/* global ethers, CONFIG, state, readProvider, withRetry, blockAtOrAfter, arcQuoteMeta */
// arc-snapshot.js — Holder Snapshot, an ARCIRCLE PAD utility (arcpad.html#snapshot).
// Every holder of an Arc token at one block — the engine is snap-core.js
// (generated from api/_snap-core.mjs), the same code the server runs, so a
// list built here and one built for /snap/<id> have the same fingerprint.
//
//   Build      the server walks the token's Transfer log back from its
//              balance sheet (/api/social?snaprun=…, a few calls for a long
//              walk); if it can't be reached this page walks it itself.
//   Counts     locked tokens (ArcLock) for their owners, Uniswap v4 LP
//              positions for their owners, "held throughout" a period
//   Filters    minimum / maximum, top N, contracts, sold since, wallets to
//              leave out, and/or another token's holders or CirclePad
//   Tabs       Holders · Distribution (Lorenz curve, Gini, tiers) ·
//              Airdrop (calculator → Multisender / claim drop / Merkle root) ·
//              Compare (two moments) · Publish (/snap/<id>, schedule, verify)
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-snapshot");
  if (!panel || typeof CONFIG === "undefined") return;
  const C = window.ArcSnapCore;
  if (!C) return;

  const PAGE = 50, HIST = "arcircle.snapshot.hist.v2", MAX_DAYS = 30;
  const ARCIRCLE = String(CONFIG.ARCIRCLE_TOKEN || "").toLowerCase();
  const USDC = String(CONFIG.USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase();
  const TOK_ABI = ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"];
  const HOLDP = [0, 86400, 259200, 604800, 2592000];

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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const kk = (h) => ethers.keccak256(h);
  const cs = (a) => ethers.getAddress(a);
  const loc = () => { const l = window.arcI18n && window.arcI18n.get(); return l === "ko" ? "ko-KR" : l === "zh" ? "zh-CN" : "en-US"; };
  function fmt(raw, dec) {
    const n = Number(C.units(raw, dec));
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : n < 1000 ? 4 : 2 });
  }
  const pctTxt = (p) => (p === 0 ? "0%" : p < 0.0001 ? "<0.0001%" : p < 0.01 ? p.toFixed(4) + "%" : p < 1 ? p.toFixed(3) + "%" : p.toFixed(2) + "%");
  const usd = (n) => (n == null || !isFinite(n) ? "—" : "$" + (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 4 : 2 })));
  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString(loc(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const utc = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "");
  const span = (s) => (s >= 86400 ? `${Math.round(s / 86400)} ${Math.round(s / 86400) === 1 ? "day" : "days"}` : s >= 3600 ? `${Math.round(s / 3600)}h` : `${Math.max(1, Math.round(s / 60))} min`);
  async function fetchJson(url, ms = 30000, opt) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...(opt || {}), signal: ctl.signal }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const retry = (fn) => (typeof withRetry === "function" ? withRetry(fn) : fn());

  // ---------------- state ----------------
  const F = {
    tok: null, info: null, res: null, list: [], why: {}, amounts: null,
    mode: "now", at: "", hold: 0, locks: true, lp: false, pastBlock: null,
    f: { min: "", max: "", top: "", noC: true, since: "any", skip: "" },
    also: { mode: "", kind: "token", token: "", min: "", set: null, label: "" },
    q: "", shown: PAGE, sort: "v", tier: null, tab: "holders",
    calc: { token: "", meta: null, total: "", method: "prop", cap: "", min: "", tiers: [["", ""], ["", ""], ["", ""]] },
    cmp: { ago: 24, at: "", res: null, diff: null, busy: false, run: 0 },
    pub: { title: "", sign: false, busy: false, last: null, schedAt: "" },
    view: null, busy: false, run: 0,
  };

  // ---------------- the chain from here (fallback when the server can't build it) ----------------
  const bio = {
    keccak: kk,
    async logs(f) {
      for (let i = 0; ; i++) {
        try { return await lr().send("eth_getLogs", [f]); } catch (err) {
          const t = String(err && (err.shortMessage || err.message) || err);
          if (i >= 8 || !/rate|429|-32005|too many|timeout|failed|network/i.test(t)) throw err;
          await sleep(Math.min(8000, 500 * 2 ** i));
        }
      }
    },
    calls: (calls, tag = "latest") => Promise.all(calls.map((c) => lr().send("eth_call", [{ to: c.to, data: c.data }, tag]).then((r) => (r && r !== "0x" ? r : null)).catch(() => null))),
  };
  async function blockBefore(ts, cap) {
    const at = (n) => retry(() => lr().getBlock(n)).then((b) => Number(b.timestamp));
    let lo = await blockAtOrAfter(new Date(ts * 1000).toISOString(), "snapshot");
    let hi = Math.min(cap, lo + 4096);
    if (await at(lo) >= ts) { while (lo > 0 && await at(lo) >= ts) lo = Math.max(0, lo - 4096); }
    if (await at(hi) < ts) return hi;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (await at(mid) < ts) lo = mid; else hi = mid; }
    return lo;
  }
  async function baseSheet(token, alive, onProgress) {
    let last = null;
    for (let i = 0; i < 10; i++) {
      const r = await fetchJson(`/api/social?holdersnap=${token}&limit=8000`);
      if (!alive()) return null;
      if (r.status === 429) { await sleep(5000); continue; }
      if (!r.ok || !r.j || !Array.isArray(r.j.holders)) break;
      last = r.j;
      if (!last.more) break;
      if (onProgress) onProgress({ stage: "history", holders: last.holderCount });
    }
    return last;
  }
  async function runLocal(p, alive, onProgress) {
    const base = await baseSheet(p.token, alive, onProgress);
    if (!alive()) return null;
    if (!base) throw new Error(tr("Couldn't read the holders right now — try again in a moment."));
    if ((p.block || p.at || p.hold) && (!base.complete || base.lite || !base.block)) throw new Error(tr("This token has too many holders to rebuild an earlier moment — only \"Now\" works for it."));
    let hi = base.block;
    if (!hi) { const b = await retry(() => lr().getBlock("latest")); hi = b.number; }
    let B = hi;
    if (p.block) B = Math.min(hi, p.block);
    else if (p.at) B = Math.min(hi, await blockBefore(p.at, hi));
    const bB = await retry(() => lr().getBlock(B));
    const tsB = Number(bB.timestamp);
    const H = p.hold ? Math.min(B, await blockBefore(tsB - p.hold, B)) : B;
    const job = C.newJob({ token: p.token, hi, B, H, locks: p.locks });
    await C.stepJob(bio, job, { wave: 1, until: () => !alive(), onProgress: (f) => onProgress && onProgress({ stage: "rewind", progress: f, hi, target: H }) });
    if (!alive()) return null;
    let locked = null, lockCount = 0;
    if (p.locks) { try { const L = await C.readLocks(bio, p.token); lockCount = L.filter((l) => !l.withdrawn).length; locked = C.lockedByOwner(L); } catch { locked = null; } }
    let lpRes = null;
    if (p.lp) {
      const key = `arcircle.snapshot.lp.${p.token}`;
      let idx = { next: 1, ids: [] };
      try { idx = JSON.parse(localStorage.getItem(key) || "null") || idx; } catch { /* fresh */ }
      if (onProgress) onProgress({ stage: "positions" });
      const sc = await C.scanPositions(bio, p.token, idx.next, { max: 20000, until: () => !alive() });
      if (!sc.unsupported) {
        idx = { next: sc.next, ids: idx.ids.concat(sc.ids) };
        try { localStorage.setItem(key, JSON.stringify(idx)); } catch { /* fine */ }
        lpRes = await C.lpAt(bio, idx.ids, "0x" + B.toString(16));
      }
    }
    const baseMap = new Map(base.holders.map(([a, v]) => [lc(a), BigInt(v)]));
    const { rows, supply } = C.finishRows(job, baseMap, { supplyNow: base.supply, locked, lp: lpRes && lpRes.byOwner });
    const contracts = new Set(base.holders.filter((h) => h[2]).map((h) => lc(h[0])));
    const checked = new Set(base.holders.slice(0, base.checkedContracts || 0).map((h) => lc(h[0])));
    const need = rows.slice(0, 3000).map((x) => x.a).filter((a) => !checked.has(a)).slice(0, 1500);
    for (let i = 0; i < need.length && alive(); i += 50) {
      const part = need.slice(i, i + 50);
      const codes = await Promise.all(part.map((a) => lr().getCode(a).catch(() => "0x")));
      part.forEach((a, k) => { if (codes[k] && codes[k] !== "0x") contracts.add(a); });
    }
    return {
      token: p.token, decimals: base.decimals, supply, supplyNow: BigInt(base.supply), block: B, ts: tsB, hold: p.hold || 0, holdBlock: H, holdTs: H === B ? tsB : Number((await retry(() => lr().getBlock(H))).timestamp),
      holdClipped: !!(p.hold && base.firstMint && base.firstMint.ts && tsB - p.hold < base.firstMint.ts), launchTs: base.firstMint ? base.firstMint.ts : null,
      hi, locks: p.locks, lp: p.lp, lockCount, lpCount: lpRes ? lpRes.positions.length : 0, lpApprox: !!(lpRes && lpRes.approx), odd: rows.some((x) => x.odd),
      contracts, deployer: base.deployer || null, holderCount: base.holderCount, hist: base.hist || [], rows, local: true,
    };
  }
  function fromServer(j) {
    return { ...j, supply: BigInt(j.supply), supplyNow: BigInt(j.supplyNow), contracts: new Set(j.contracts || []), rows: C.unpackRows(j.rows) };
  }
  async function build(p, alive, onProgress) {
    const qs = new URLSearchParams({ snaprun: p.token, hold: String(p.hold || 0), locks: p.locks ? "1" : "0", lp: p.lp ? "1" : "0" });
    if (p.block) qs.set("b", String(p.block)); else if (p.at) qs.set("at", String(p.at));
    let fails = 0;
    for (let i = 0; i < 400; i++) {
      const r = await fetchJson(`/api/social?${qs}`, 30000);
      if (!alive()) return null;
      if (r.ok && r.j && r.j.done) return fromServer(r.j);
      if (r.ok && r.j) { if (onProgress) onProgress(r.j); await sleep(350); continue; }
      if (r.status === 429) { await sleep(3000); continue; }
      if ([400, 409, 422].includes(r.status) && r.j && r.j.error) throw new Error(tr(r.j.error.charAt(0).toUpperCase() + r.j.error.slice(1) + "."));
      if (++fails >= 2) break;
      await sleep(800);
    }
    return runLocal(p, alive, onProgress);
  }

  // ---------------- the token ----------------
  async function readToken(addr) {
    const c = new ethers.Contract(addr, TOK_ABI, lr());
    const [name, symbol, decimals, supply] = await Promise.all([
      retry(() => c.name()).catch(() => ""), retry(() => c.symbol()).catch(() => ""),
      retry(() => c.decimals()).catch(() => null), retry(() => c.totalSupply()).catch(() => null),
    ]);
    if (supply == null || decimals == null) return null;
    return { address: cs(addr), name: String(name || "").slice(0, 60), symbol: String(symbol || "").slice(0, 20), decimals: Number(decimals), supply: BigInt(supply) };
  }
  const symOf = () => (F.tok && F.tok.symbol ? "$" + F.tok.symbol : tr("tokens"));
  const launches = () => (typeof ARC !== "undefined" && ARC.launches) || [];
  function logoOf(a) {
    a = lc(a);
    if (a === ARCIRCLE) return "images/arcircle-mark-sm.png";
    const l = launches().find((x) => lc(x.token) === a);
    return l && (/^https?:\/\//i.test(l.imageUrl || "") || /^data:image\//i.test(l.imageUrl || "")) ? l.imageUrl : "";
  }
  async function readInfo(addr) {
    // price (Dexscreener) and the holder-count history — both optional
    const out = { price: null, hist: [], count: null };
    const [px, hs] = await Promise.all([
      fetchJson(`https://api.dexscreener.com/tokens/v1/arc/${addr}`, 7000),
      fetchJson(`/api/social?holdersnap=${addr}&limit=1`, 20000),
    ]);
    if (px.ok && Array.isArray(px.j) && px.j.length) {
      const best = px.j.slice().sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
      const p = Number(best && best.priceUsd);
      if (p > 0) out.price = p;
    }
    if (hs.ok && hs.j) { out.hist = hs.j.hist || []; out.count = hs.j.holderCount || null; out.lite = !!hs.j.lite; out.complete = !!hs.j.complete; }
    return out;
  }

  async function pick(addr, opts) {
    addr = String(addr || "").trim();
    if (!isAddr(addr)) { status("bad", tr("That isn't a token contract address.")); return; }
    const run = ++F.run;
    if (!(opts && opts.keep)) { F.res = null; F.list = []; F.cmp.res = null; F.cmp.diff = null; }
    F.tok = null; F.info = null;
    $("asn-addr").value = addr;
    paintToken(); paintResult();
    status("wait", tr("Reading the token…"));
    const tok = await readToken(addr).catch(() => null);
    if (run !== F.run) return;
    if (!tok) { status("bad", tr("Couldn't read that as an ERC-20 token on Arc.")); return; }
    F.tok = tok;
    if (!F.calc.token) F.calc.meta = null;
    paintToken(true); writeFilters();
    status("", "");
    readInfo(tok.address).then((info) => { if (F.tok && lc(F.tok.address) === lc(tok.address)) { F.info = info; paintToken(); paintSpark(); paintWhen(); if (F.res) paintResult(false); } });
    if (opts && opts.go) await take(run, opts.block);
  }

  // ---------------- taking the snapshot ----------------
  function params(block) {
    const p = { token: lc(F.tok.address), hold: F.hold, locks: F.locks, lp: F.lp };
    if (block) p.block = block;
    else if (F.mode === "past") {
      if (F.pastBlock) p.block = F.pastBlock;
      else {
        const tMs = new Date(F.at).getTime();
        if (!F.at || !isFinite(tMs)) throw new Error(tr("Pick a date and time first."));
        if (tMs > Date.now() - 60000) throw new Error(tr("Pick a moment in the past — or use \"Now\"."));
        if (tMs < Date.now() - 365 * 86400e3) throw new Error(tr("Snapshots go back up to a year."));
        p.at = Math.floor(tMs / 1000);
      }
    }
    return p;
  }
  let prog = null;
  function onProgress(j) {
    if (!j) return;
    if (j.stage === "history") status("wait", tr(`Reading the history — ${plural(j.holders || 0, "holder", "holders")} so far…`), 0.05);
    else if (j.stage === "positions") status("wait", tr("Valuing LP positions…"), 0.95);
    else if (j.stage === "rewind") {
      const f = Math.max(0, Math.min(1, j.progress || 0));
      prog = { f, logs: j.logs || 0 };
      status("rewind", tr(`Rewinding the transfers — ${Math.round(f * 100)}%`), f);
    } else status("wait", tr("Building the snapshot…"), j.progress || 0.1);
  }
  async function take(run, atBlock) {
    if (!F.tok) return;
    run = run || ++F.run;
    let p;
    try { p = params(atBlock); } catch (err) { status("bad", err.message); return; }
    F.busy = true; paintBusy(); shutter("close");
    status("wait", tr("Building the snapshot…"), 0.02);
    try {
      const res = await build(p, () => run === F.run, onProgress);
      if (!res || run !== F.run) return;
      F.res = res; F.pastBlock = res.block < res.hi ? res.block : null;
      if (F.expect && F.expectFor !== `${lc(F.tok.address)}:${res.block}`) F.expect = null;
      if (res.block < res.hi) { F.mode = "past"; F.at = localInput(res.ts * 1000); $("asn-at").value = F.at; paintWhen(); }
      F.shown = PAGE; F.tier = null; F.cmp.res = null; F.cmp.diff = null;
      remember();
      apply(true);
      status("", "");
      shutter("open");
      afterTake();
    } catch (err) {
      if (run === F.run) { status("bad", String(err && err.message || err).slice(0, 220)); shutter("open"); }
    } finally {
      if (run === F.run) { F.busy = false; paintBusy(); }
    }
  }

  // ---------------- filters ----------------
  const skipSet = () => new Set((F.f.skip.match(/0x[0-9a-fA-F]{40}/g) || []).map(lc));
  function filterOpts(res) {
    const dec = res.decimals;
    const min = C.parseUnits(F.f.min, dec), max = C.parseUnits(F.f.max, dec);
    F.bad = { min: min === undefined, max: max === undefined };
    return {
      min: min || null, max: max || null, top: Math.max(0, parseInt(F.f.top, 10) || 0), noC: F.f.noC, contracts: res.contracts,
      since: res.block < res.hi ? F.f.since : "any", skip: skipSet(), hold: res.hold > 0,
      also: F.also.mode && F.also.set ? { mode: F.also.mode, set: F.also.set } : null,
    };
  }
  function apply(fresh) {
    if (!F.res) { paintResult(); return; }
    const out = C.applyFilters(F.res.rows, filterOpts(F.res));
    F.list = out.list; F.why = out.why;
    if (F.cmp.res) diff();
    paintResult(fresh);
  }
  function normFilters() {
    const r = F.res;
    return C.normFilters({ min: F.f.min, max: F.f.max, top: F.f.top, noC: F.f.noC, since: r && r.block < r.hi ? F.f.since : "any", hold: r ? r.hold : F.hold, locks: r ? r.locks : F.locks, lp: r ? r.lp : F.lp, skip: [...skipSet()] });
  }
  const csvMeta = () => ({ decimals: F.res.decimals, supply: F.res.supply, hold: F.res.hold > 0, keccak: kk });
  const csv = () => C.toCsv(F.list, csvMeta());
  const fingerprint = () => C.fingerprint(csv(), kk);

  // ---------------- outputs ----------------
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const fileBase = () => `snapshot-${(F.tok.symbol || "token").replace(/[^\w-]/g, "")}-${F.res.block}`;
  function jsonOut() {
    const r = F.res, dec = r.decimals;
    return JSON.stringify({
      token: F.tok.address, symbol: F.tok.symbol, block: r.block, timestamp: r.ts, held_throughout_seconds: r.hold, locks_counted: r.locks, lp_counted: r.lp,
      filters: normFilters(), fingerprint: fingerprint(), count: F.list.length,
      holders: F.list.map((x, i) => ({ rank: i + 1, address: cs(x.a), balance: C.units(x.v, dec), balance_raw: x.v.toString(), ...(r.hold ? { held_throughout: C.units(x.min, dec) } : {}), balance_now: C.units(x.now, dec), ...(x.locked ? { locked: C.units(x.locked, dec) } : {}), ...(x.lp ? { lp: C.units(x.lp, dec) } : {}) })),
    }, null, 2);
  }
  function shareUrl() {
    const q = new URLSearchParams({ t: F.tok.address });
    if (F.res && F.res.block < F.res.hi) q.set("b", String(F.res.block));
    const f = normFilters();
    if (f.min) q.set("min", f.min);
    if (f.max) q.set("max", f.max);
    if (f.top) q.set("top", String(f.top));
    if (!f.noC) q.set("nc", "0");
    if (f.since !== "any") q.set("since", f.since);
    if (f.hold) q.set("hold", String(f.hold));
    if (!f.locks) q.set("locks", "0");
    if (f.lp) q.set("lp", "1");
    return `${location.origin}/arc#snapshot?${q.toString()}`;
  }
  async function copy(text, btn, done) {
    try { await navigator.clipboard.writeText(text); toast(done || tr("Copied")); if (btn) { btn.classList.add("ok"); setTimeout(() => btn.classList.remove("ok"), 1400); } }
    catch { toast(tr("Copy failed")); }
  }
  function toMultisend(text, am, note, opts) {
    if (!window.arcMultisend || typeof window.arcMultisend.load !== "function") return;
    fly(opts && opts.from);
    setTimeout(() => {
      if (typeof window.arcpadShowTab === "function") window.arcpadShowTab("multisend"); else location.hash = "#multisend";
      setTimeout(() => window.arcMultisend.load(text, am, note, opts), 60);
    }, reduce ? 0 : 380);
  }

  // ---------------- airdrop calculator ----------------
  function calcMeta() {
    const t = lc(F.calc.token);
    if (!t || (F.tok && t === lc(F.tok.address))) return F.tok ? { address: F.tok.address, symbol: F.tok.symbol, decimals: F.tok.decimals } : null;
    return F.calc.meta && lc(F.calc.meta.address) === t ? F.calc.meta : null;
  }
  async function setCalcToken(addr) {
    F.calc.token = addr || ""; F.calc.meta = null;
    if (addr && (!F.tok || lc(addr) !== lc(F.tok.address))) {
      try { const m = await arcQuoteMeta(addr); F.calc.meta = { address: cs(addr), symbol: m.symbol, decimals: Number(m.decimals) }; } catch { F.calc.meta = null; toast(tr("Couldn't read that token.")); }
    }
    paintAirdrop(true);
  }
  function amounts() {
    const m = calcMeta();
    if (!m || !F.res) return null;
    const P = (v, d) => { const x = C.parseUnits(v, d); return x === undefined ? undefined : x; };
    const total = P(F.calc.total, m.decimals), cap = P(F.calc.cap, m.decimals), min = P(F.calc.min, m.decimals);
    F.calc.bad = { total: total === undefined, cap: cap === undefined, min: min === undefined };
    const tiers = F.calc.tiers.map(([t, a]) => [C.parseUnits(t, F.res.decimals), C.parseUnits(a, m.decimals)]).filter(([t, a]) => t != null && t !== undefined && a);
    if (F.calc.method !== "tiers" && !(total > 0n)) return null;
    if (F.calc.method === "tiers" && !tiers.length) return null;
    return C.calcAmounts(F.list, { total: total || 0n, method: F.calc.method, cap: cap || null, min: min || null, tiers, hold: F.res.hold > 0 });
  }

  // ---------------- compare ----------------
  async function compare() {
    if (!F.res || F.cmp.busy) return;
    const run = ++F.cmp.run;
    F.cmp.busy = true; F.cmp.res = null; F.cmp.diff = null; paintCompare();
    try {
      const p = { token: lc(F.tok.address), hold: F.res.hold, locks: F.res.locks, lp: F.res.lp };
      if (F.cmp.ago === "now") { /* the latest block */ }
      else if (F.cmp.ago === "custom") { const t = new Date(F.cmp.at).getTime(); if (!isFinite(t)) throw new Error(tr("Pick a date and time first.")); p.at = Math.floor(t / 1000); }
      else p.at = F.res.ts - Number(F.cmp.ago) * 3600;
      const res = await build(p, () => run === F.cmp.run, (j) => { F.cmp.prog = j && j.progress; paintCompare(); });
      if (run !== F.cmp.run || !res) return;
      F.cmp.res = res;
      diff();
    } catch (err) { F.cmp.err = String(err && err.message || err).slice(0, 200); }
    finally { if (run === F.cmp.run) { F.cmp.busy = false; paintCompare(); } }
  }
  function diff() {
    const o = C.applyFilters(F.cmp.res.rows, filterOpts(F.cmp.res));
    const earlier = F.cmp.res.block <= F.res.block;
    F.cmp.diff = earlier ? C.diffLists(o.list, F.list, F.res.hold > 0) : C.diffLists(F.list, o.list, F.res.hold > 0);
    F.cmp.earlier = earlier;
  }

  // ---------------- publish / schedule / verify ----------------
  async function publish(btn) {
    if (!F.res || F.pub.busy) return;
    if (F.also.mode) { toast(tr("A combined list can't be published — turn \"Combine\" off first.")); return; }
    F.pub.busy = true; paintPublish();
    try {
      const f = normFilters(), title = String(F.pub.title || "").trim().slice(0, 80);
      const body = { action: "snappublish", token: lc(F.tok.address), block: F.res.block, filters: f, title };
      if (F.pub.sign) {
        if (!state.account || !state.signer) throw new Error(tr("Connect a wallet to sign."));
        body.by = lc(state.account);
        body.sig = await state.signer.signMessage(C.sigText("publish", { token: body.token, block: body.block, f, title }));
      }
      let r = null;
      for (let i = 0; i < 60; i++) {
        r = await fetchJson("/api/social", 60000, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (!r.ok || !r.j || !r.j.pending) break;
        await sleep(500);
      }
      if (!r || !r.ok || !r.j || !r.j.id) throw new Error((r && r.j && r.j.error) || tr("Couldn't publish right now — try again in a moment."));
      if (r.j.id !== fingerprint().slice(2, 14)) console.warn("snapshot: the server's list differs from this one", r.j.id);
      F.pub.last = { id: r.j.id, url: `${location.origin}/snap/${r.j.id}`, fp: r.j.fp, count: r.j.count, match: r.j.fp === fingerprint() };
      toast(tr("Published"));
      burst(btn);
    } catch (err) { toast(String(err && (err.shortMessage || err.message) || err).slice(0, 160)); }
    finally { F.pub.busy = false; paintPublish(); }
  }
  async function schedule(btn) {
    if (!F.tok || F.pub.busy) return;
    const tMs = new Date(F.pub.schedAt).getTime();
    if (!isFinite(tMs) || tMs < Date.now() + 90e3) { toast(tr("Pick a time at least a couple of minutes from now.")); return; }
    F.pub.busy = true; paintPublish();
    try {
      const f = C.normFilters({ ...normFilters(), hold: F.hold, locks: F.locks, lp: F.lp, since: "any" });
      const title = String(F.pub.title || "").trim().slice(0, 80), at = Math.floor(tMs / 1000);
      const body = { action: "snapschedule", token: lc(F.tok.address), at, filters: f, title };
      if (F.pub.sign) {
        if (!state.account || !state.signer) throw new Error(tr("Connect a wallet to sign."));
        body.by = lc(state.account);
        body.sig = await state.signer.signMessage(C.sigText("schedule", { token: body.token, at, f, title }));
      }
      const r = await fetchJson("/api/social", 30000, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok || !r.j || !r.j.id) throw new Error((r.j && r.j.error) || tr("Couldn't schedule it right now — try again in a moment."));
      F.pub.sched = { id: r.j.id, url: `${location.origin}/snap/${r.j.id}`, at };
      toast(tr("Scheduled"));
      burst(btn);
    } catch (err) { toast(String(err && (err.shortMessage || err.message) || err).slice(0, 160)); }
    finally { F.pub.busy = false; paintPublish(); }
  }
  async function verifyFile(file) {
    const text = await file.text();
    const got = C.fingerprint(text.replace(/\r\n/g, "\n"), kk);
    const want = ($("asn-vfp") && $("asn-vfp").value.trim()) || (F.res && F.list.length ? fingerprint() : "");
    F.pub.verify = { name: file.name.slice(0, 60), got, want, ok: !!want && lc(got) === lc(want) };
    paintPublish();
  }

  // ---------------- a published / scheduled snapshot (#snapshot?id=) ----------------
  let viewT = 0;
  async function openView(id, wallet) {
    clearTimeout(viewT);
    const r = await fetchJson(`/api/social?snapview=${id}${wallet ? `&wallet=${wallet}` : ""}`, 30000);
    if (!r.ok || !r.j) { F.view = { id, err: (r.j && r.j.error) || tr("Couldn't open that snapshot.") }; paintView(); return; }
    const d = r.j;
    if (d.sig && d.by) {
      try {
        const text = d.status === "done" && d.block != null && !d.at ? C.sigText("publish", { token: d.token, block: d.block, f: d.f, title: d.title }) : C.sigText("schedule", { token: d.token, at: d.at, f: d.f, title: d.title });
        d.verified = lc(ethers.verifyMessage(text, d.sig)) === lc(d.by);
      } catch { d.verified = false; }
    }
    F.view = { id, d, wallet: wallet || (F.view && F.view.wallet) || "" };
    paintView();
    if (d.status !== "done") viewT = setTimeout(() => openView(id), Date.now() / 1000 < (d.at || 0) ? 15000 : 4000);
  }

  // ---------------- recent snapshots ----------------
  function hist() { try { const h = JSON.parse(localStorage.getItem(HIST) || "[]"); return Array.isArray(h) ? h : []; } catch { return []; } }
  function remember() {
    const r = F.res;
    const item = { t: F.tok.address, s: F.tok.symbol, b: r.block < r.hi ? r.block : null, ts: r.ts, n: r.rows.length, at: Date.now() };
    const h = hist().filter((x) => !(lc(x.t) === lc(item.t) && x.b === item.b));
    h.unshift(item);
    try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, 8))); } catch { /* private mode */ }
    paintChips();
  }

  // ---------------- motion ----------------
  function shutter(k) {
    const em = panel.querySelector(".asn-emblem");
    if (!em || reduce) return;
    if (k === "close") { em.classList.remove("open", "flash"); void em.offsetWidth; em.classList.add("closing"); }
    else { em.classList.remove("closing"); em.classList.add("open", "flash"); setTimeout(() => em.classList.remove("open", "flash"), 1000); }
  }
  function scramble(el, text) {
    if (!el) return;
    if (reduce) { el.textContent = text; return; }
    const hex = "0123456789abcdef", t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 650), n = Math.floor(text.length * k);
      el.textContent = text.slice(0, n) + [...text.slice(n)].map((c) => (c === "…" || c === "x" ? c : hex[(Math.random() * 16) | 0])).join("");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function countUp(el, to) {
    if (!el || reduce || to < 10) return;
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = num(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function fly(from) {
    if (reduce || !from) return;
    const r = from.getBoundingClientRect();
    const dot = document.createElement("div");
    dot.className = "asn-fly";
    dot.textContent = num(F.list.length);
    dot.style.left = r.left + r.width / 2 + "px"; dot.style.top = r.top + r.height / 2 + "px";
    document.body.appendChild(dot);
    const nav = document.querySelector('.bp-nav-item[data-tab="multisend"]');
    const t = nav && nav.offsetParent ? nav.getBoundingClientRect() : { left: 40, top: 40, width: 0, height: 0 };
    requestAnimationFrame(() => { dot.style.transform = `translate(${t.left + t.width / 2 - (r.left + r.width / 2)}px, ${t.top + t.height / 2 - (r.top + r.height / 2)}px) scale(.4)`; dot.style.opacity = "0"; });
    setTimeout(() => dot.remove(), 700);
  }
  function burst(btn) {
    if (reduce || !btn) return;
    btn.classList.remove("asn-burst"); void btn.offsetWidth; btn.classList.add("asn-burst");
  }

  // ---------------- painting ----------------
  let toastT = 0;
  function toast(t) {
    const el = $("asn-toast");
    el.textContent = t; el.hidden = false;
    el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2800);
  }
  function status(k, text, frac) {
    const el = $("asn-status");
    el.className = "asn-status" + (k ? " " + k : "");
    el.hidden = !text;
    if (!text) { el.innerHTML = ""; return; }
    el.innerHTML = `${k === "rewind" ? '<i class="asn-clock" aria-hidden="true"></i>' : ""}<span>${esc(text)}</span>${frac != null ? `<i class="asn-prog"><b style="transform:scaleX(${Math.max(0.02, Math.min(1, frac))})"></b></i>` : ""}${(k === "wait" || k === "rewind") && frac != null ? `<button type="button" class="ams-mini" data-cancel>${esc(tr("Cancel"))}</button>` : ""}`;
  }
  function paintBusy() {
    $("asn-go").disabled = F.busy;
    panel.classList.toggle("asn-busy", F.busy);
    const g = $("asn-go").querySelector("span");
    if (g) g.textContent = tr(F.res && F.mode === "now" && !F.busy ? "Take it again" : "Take snapshot");
  }
  function paintChips() {
    const chips = [];
    if (ARCIRCLE) chips.push(`<button type="button" class="ams-chip" data-t="${esc(CONFIG.ARCIRCLE_TOKEN)}" data-no-i18n>$ARCIRCLE</button>`);
    launches().slice().sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0)).slice(0, 3)
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
    const info = F.info || {}, logo = logoOf(t.address);
    el.innerHTML = `${logo ? `<img class="asn-tok-img" src="${esc(logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'asn-tok-ico',textContent:${JSON.stringify((t.symbol || "?").slice(0, 1))}}))">` : `<span class="asn-tok-ico" aria-hidden="true">${esc((t.symbol || "?").slice(0, 1))}</span>`}
      <div class="asn-tok-txt"><b data-no-i18n>${esc(t.name || t.symbol || short(t.address))} <small>$${esc(t.symbol)}</small></b>
      <span>${esc(tr("Supply"))} ${esc(fmt(t.supply, t.decimals))}${info.count ? ` · ${esc(tr(plural(info.count, "holder", "holders")))}` : ""}${info.price ? ` · <span data-no-i18n>${esc(usd(info.price))}</span>` : ""} · <a href="${explorer("token", t.address)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(t.address))} ↗</a></span></div>
      <a class="asn-badge" href="/arc#scanner?t=${esc(t.address)}" title="${esc(tr("Token Scanner"))}"><img src="/api/social?badge=${esc(t.address)}" alt="" loading="lazy" onerror="this.parentNode.remove()"></a>`;
    if (pop && !reduce) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
  }
  function paintSpark() {
    const svg = $("asn-spark");
    const h = ((F.info && F.info.hist) || []).filter((x) => x && x.d);
    if (h.length < 2) { svg.innerHTML = ""; return; }
    const t0 = Date.now() - MAX_DAYS * 86400e3;
    const pts = h.map((x) => [(Date.parse(x.d + "T12:00:00Z") - t0) / (MAX_DAYS * 86400e3), x.n]).filter(([x]) => x >= -0.05 && x <= 1.05);
    if (pts.length < 2) { svg.innerHTML = ""; return; }
    const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])), rng = Math.max(1, hi - lo);
    const d = pts.map(([x, n], i) => `${i ? "L" : "M"}${(Math.max(0, Math.min(1, x)) * 300).toFixed(1)} ${(36 - ((n - lo) / rng) * 30).toFixed(1)}`).join("");
    svg.innerHTML = `<path class="asn-spark-a" d="${d} L300 40 L0 40Z"/><path class="asn-spark-l" d="${d}"/>`;
  }
  function paintWhen() {
    panel.querySelectorAll("[data-when]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.when === F.mode)));
    panel.querySelectorAll("[data-holdp]").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.holdp) === F.hold)));
    $("asn-past").hidden = F.mode !== "past";
    $("asn-since-row").hidden = !(F.res && F.res.block < F.res.hi);
    const lite = F.info && (F.info.lite || F.info.complete === false);
    $("asn-lite").hidden = !((F.mode === "past" || F.hold) && F.info && F.info.lite);
    void lite;
    const tMs = new Date(F.at).getTime();
    $("asn-utc").textContent = F.mode === "past" && isFinite(tMs) ? utc(Math.floor(tMs / 1000)) : "";
    if (isFinite(tMs)) $("asn-range").value = String(Math.max(0, Math.min(720, 720 - Math.round((Date.now() - tMs) / 3600e3))));
  }
  function tiers(list, supply, hold) {
    const T = [
      { k: "whale", n: 0, v: 0n, label: "Whales", sub: "1%+ of supply", lo: 1 },
      { k: "large", n: 0, v: 0n, label: "Large", sub: "0.1–1%", lo: 0.1 },
      { k: "mid", n: 0, v: 0n, label: "Mid", sub: "0.01–0.1%", lo: 0.01 },
      { k: "small", n: 0, v: 0n, label: "Small", sub: "under 0.01%", lo: 0 },
    ];
    for (const x of list) { const t = tierOf(hold ? x.min : x.v, supply, T); t.n++; t.v += hold ? x.min : x.v; }
    return T;
  }
  function tierOf(v, supply, T) { const p = C.pctOf(v, supply); return (T || [{ k: "whale", lo: 1 }, { k: "large", lo: 0.1 }, { k: "mid", lo: 0.01 }, { k: "small", lo: 0 }]).find((t) => p >= t.lo); }
  const TABS = [["holders", "Holders"], ["dist", "Distribution"], ["airdrop", "Airdrop"], ["compare", "Compare"], ["publish", "Publish"]];
  function paintResult(fresh) {
    const out = $("asn-out");
    const r = F.res;
    $("asn-empty").hidden = !!r;
    out.hidden = !r;
    $("asn-bad-min").hidden = !(F.bad && F.bad.min);
    $("asn-bad-max").hidden = !(F.bad && F.bad.max);
    paintWhen(); paintBusy(); paintSetupSum();
    if (!r) { $("asn-sticky").hidden = true; return; }
    if (!out.querySelector(".asn-tabs")) {
      out.innerHTML = `<div id="asn-sum"></div>
        <div class="asn-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab-go="${k}" aria-selected="${k === F.tab}">${esc(tr(l))}</button>`).join("")}<i class="asn-tabs-ink" aria-hidden="true"></i></div>
        <div class="asn-pane" data-pane="holders"></div><div class="asn-pane" data-pane="dist" hidden></div><div class="asn-pane" data-pane="airdrop" hidden></div><div class="asn-pane" data-pane="compare" hidden></div><div class="asn-pane" data-pane="publish" hidden></div>`;
    }
    paintSummary(fresh);
    paintTabs();
    paintHolders(fresh);
    if (F.tab === "dist") paintDist(fresh);
    if (F.tab === "airdrop") paintAirdrop();
    if (F.tab === "compare") paintCompare();
    if (F.tab === "publish") paintPublish();
    if (fresh && !reduce) { out.classList.remove("in"); void out.offsetWidth; out.classList.add("in"); }
    sticky();
  }
  function paintTabs() {
    const box = $("asn-out").querySelector(".asn-tabs");
    box.querySelectorAll("[data-tab-go]").forEach((b) => { b.setAttribute("aria-selected", String(b.dataset.tabGo === F.tab)); b.textContent = tr(TABS.find((x) => x[0] === b.dataset.tabGo)[1]); });
    $("asn-out").querySelectorAll(".asn-pane").forEach((p) => { p.hidden = p.dataset.pane !== F.tab; });
    const on = box.querySelector('[aria-selected="true"]'), ink = box.querySelector(".asn-tabs-ink");
    if (on && ink) { ink.style.width = on.offsetWidth + "px"; ink.style.transform = `translateX(${on.offsetLeft}px)`; }
  }
  function paintSummary(fresh) {
    const r = F.res, dec = r.decimals, list = F.list, supply = r.supply, hold = r.hold > 0;
    const val = (x) => (hold ? x.min : x.v);
    const held = list.reduce((s, x) => s + val(x), 0n);
    const top10 = list.slice(0, 10).reduce((s, x) => s + val(x), 0n);
    const me = state && state.account ? lc(state.account) : "";
    const myIdx = me ? list.findIndex((x) => x.a === me) : -1;
    const myRow = me ? r.rows.find((x) => x.a === me) : null;
    const w = F.why || {};
    const left = [
      w.contract ? tr(plural(w.contract, "contract", "contracts")) : "", w.burn ? tr(plural(w.burn, "burn address", "burn addresses")) : "",
      w.small ? tr(`${num(w.small)} under the minimum`) : "", w.big ? tr(`${num(w.big)} over the maximum`) : "",
      w.sold ? tr(`${num(w.sold)} sold since`) : "", w.skip ? tr(`${num(w.skip)} left out by you`) : "",
      w.hold ? tr(`${num(w.hold)} didn't hold the whole time`) : "", w.other ? tr(`${num(w.other)} not on the other list`) : "",
    ].filter(Boolean);
    const px = F.info && F.info.price;
    const fp = list.length ? fingerprint() : "";
    const extras = [
      r.locks && r.lockCount ? tr(plural(r.lockCount, "lock counted for its owner", "locks counted for their owners")) : "",
      r.lp ? tr(plural(r.lpCount, "LP position counted", "LP positions counted")) + (r.lpApprox ? " · " + tr("valued at today's price") : "") : "",
      hold ? tr(`held throughout ${span(r.hold)} (since ${when(r.holdTs)})`) : "",
    ].filter(Boolean);
    const past = r.block < r.hi;
    $("asn-sum").innerHTML = `
      <div class="asn-head">
        <div class="asn-shot"><span class="asn-kick">${esc(tr(past ? "Snapshot" : "Snapshot · now"))}</span>
          <b>${esc(when(r.ts))}</b>
          <span><span data-no-i18n>${esc(utc(r.ts))}</span> · ${esc(tr("Block"))} <a href="${explorer("block", r.block)}" target="_blank" rel="noopener" data-no-i18n>#${num(r.block)} ↗</a>${!past ? ` <button type="button" class="asn-refresh" data-act="refresh" title="${esc(tr("Refresh"))}" aria-label="${esc(tr("Refresh"))}">↻</button>` : ""}</span></div>
        <div class="asn-fp" title="${esc(tr("keccak256 of the CSV below — post it with an announcement so anyone can check the list wasn't changed"))}">
          <span>${esc(tr("Fingerprint"))}</span><code data-no-i18n id="asn-fpc">${esc(fp ? fp.slice(0, 18) + "…" : "—")}</code>
          <button type="button" class="ams-mini" data-act="fp">${esc(tr("Copy"))}</button></div>
      </div>
      ${extras.length ? `<p class="asn-extras">${extras.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      <div class="asn-stats">
        <div><b class="asn-count">${num(list.length)}</b><small>${esc(tr("Holders"))}</small></div>
        <div><b>${esc(pctTxt(C.pctOf(held, supply)))}</b><small>${esc(tr("of the supply"))}</small></div>
        <div><b>${esc(pctTxt(C.pctOf(top10, held || 1n)))}</b><small>${esc(tr("held by the top 10"))}</small></div>
        <div><b>${esc(px ? usd(Number(C.units(held, dec)) * px) : fmt(held, dec))}</b><small data-no-i18n>${esc(px ? tr("worth") : symOf())}</small></div>
      </div>
      ${F.base_note ? "" : ""}
      ${r.holdClipped ? `<p class="asn-left warn">${esc(tr(`This token is younger than the holding period (it launched ${when(r.launchTs)}) — only wallets that held from the very start can pass.`))}</p>` : ""}
      ${r.odd ? `<p class="asn-left warn">${esc(tr("This token's balances don't follow its transfers exactly (a rebasing or taxed token) — check the list against the explorer."))}</p>` : ""}
      ${F.info && F.info.lite && !past ? `<p class="asn-left warn">${esc(tr("A very widely held token — only its largest holders are listed."))}</p>` : ""}
      ${left.length ? `<p class="asn-left">${esc(tr("Left out:"))} ${left.map(esc).join(" · ")}</p>` : ""}
      ${F.also.mode && F.also.set ? `<p class="asn-left">${esc(tr(F.also.mode === "and" ? "Only wallets also on:" : "Plus everyone on:"))} <b>${esc(F.also.label)}</b></p>` : ""}
      ${me ? `<p class="asn-me${myIdx >= 0 ? " in" : ""}">${myIdx >= 0 ? esc(tr(`Your wallet is #${myIdx + 1} in this snapshot`)) + ` · <b data-no-i18n>${esc(fmt(val(list[myIdx]), dec))} ${esc(symOf())}</b> <button type="button" class="ams-mini" data-act="jump">${esc(tr("Show me"))}</button>` : myRow ? esc(tr("Your wallet held this token but is filtered out.")) : esc(tr("Your wallet isn't in this snapshot."))}</p>` : ""}`;
    if (fresh) { countUp(panel.querySelector(".asn-count"), list.length); if (fp) scramble($("asn-fpc"), fp.slice(0, 18) + "…"); }
    const ex = $("asn-expect");
    if (ex) ex.remove();
    if (F.expect && fp) {
      const p = document.createElement("p");
      p.id = "asn-expect"; p.className = "asn-verify " + (F.expect === fp ? "ok" : "bad");
      p.innerHTML = `<b>${esc(tr(F.expect === fp ? "Same fingerprint as the published list." : "This differs from the published list."))}</b>`;
      $("asn-sum").querySelector(".asn-head").after(p);
    }
  }
  function sorted() {
    const r = F.res, hold = r.hold > 0;
    let rows = F.list.map((x, i) => ({ ...x, i }));
    const q = lc(F.q.trim());
    if (q) rows = rows.filter((x) => x.a.includes(q));
    if (F.tier) rows = rows.filter((x) => tierOf(hold ? x.min : x.v, r.supply).k === F.tier);
    const by = { v: (x) => (hold ? x.min : x.v), now: (x) => x.now, chg: (x) => x.now - x.v, locked: (x) => x.locked, lp: (x) => x.lp };
    if (F.sort !== "v" && by[F.sort]) rows.sort((x, y) => { const a = by[F.sort](x), b = by[F.sort](y); return b > a ? 1 : b < a ? -1 : x.i - y.i; });
    return rows;
  }
  function paintHolders(fresh) {
    const pane = $("asn-out").querySelector('[data-pane="holders"]');
    const r = F.res, dec = r.decimals, hold = r.hold > 0, past = r.block < r.hi;
    const me = state && state.account ? lc(state.account) : "";
    const px = F.info && F.info.price;
    const anyLock = F.list.some((x) => x.locked > 0n), anyLp = F.list.some((x) => x.lp > 0n);
    const rows = sorted(), vis = rows.slice(0, F.shown);
    const labelOf = (a) => {
      const S = window.ArcScanCore && window.ArcScanCore.labelOf ? window.ArcScanCore.labelOf(a) : null;
      if (S) return S.name;
      if (r.deployer && a === lc(r.deployer)) return "Deployer";
      return "";
    };
    const change = (x) => {
      if (!past) return "";
      if (x.now === 0n) return `<span class="asn-tag sold">${esc(tr("Sold all"))}</span>`;
      if (x.now > x.v) return `<span class="asn-tag up">${esc(tr("Added"))}</span>`;
      if (x.now < x.v) return `<span class="asn-tag down">${esc(tr("Sold some"))}</span>`;
      return `<span class="asn-tag same">${esc(tr("Held"))}</span>`;
    };
    const th = (k, l, cls) => `<th class="${cls || ""}${F.sort === k ? " on" : ""}"${k ? ` data-sort="${k}"` : ""}>${esc(tr(l))}${k ? ' <i aria-hidden="true">↓</i>' : ""}</th>`;
    const T = tiers([], r.supply, hold);
    pane.innerHTML = `
      <div class="asn-acts">
        <button type="button" class="ams-btn sm asn-primary" data-act="ms-same">${esc(tr("Airdrop: same amount each"))}</button>
        <button type="button" class="ams-btn sm asn-primary" data-act="ms-weight">${esc(tr("Airdrop: by holding"))}</button>
        <button type="button" class="ams-mini" data-act="csv">${esc(tr("Download CSV"))}</button>
        <button type="button" class="ams-mini" data-act="json">JSON</button>
        <button type="button" class="ams-mini" data-act="addrs">${esc(tr("Copy addresses"))}</button>
        <button type="button" class="ams-mini" data-act="link">${esc(tr("Copy link"))}</button>
      </div>
      <div class="asn-find"><input id="asn-q" class="asn-q" type="text" spellcheck="false" value="${esc(F.q)}" placeholder="${esc(tr("Find a wallet (0x…)"))}" aria-label="${esc(tr("Find a wallet"))}">
        ${F.tier ? `<button type="button" class="asn-tierchip t-${F.tier}" data-tier-off>${esc(tr(T.find((t) => t.k === F.tier).label))} ×</button>` : ""}</div>
      <div class="asn-table"><table><thead><tr><th>#</th>${th("", "Wallet")}${th("v", hold ? "Held throughout" : "Balance", "n")}<th class="n">%</th>${px ? `<th class="n">USD</th>` : ""}${past ? th("now", "Now", "n") : ""}${anyLock ? th("locked", "Locked", "n") : ""}${anyLp ? th("lp", "LP", "n") : ""}</tr></thead>
      <tbody>${vis.map((x, k) => { const v = hold ? x.min : x.v, lab = labelOf(x.a); return `<tr class="${x.a === me ? "me" : ""}${fresh && k < 30 && !reduce ? " cas" : ""}" style="--r:${k}" data-tier="${tierOf(v, r.supply).k}" data-a="${x.a}">
        <td class="rk" data-l="#">${x.i + 1}</td>
        <td class="wal"><a href="${explorer("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(cs(x.a)))}</a>${x.c || r.contracts.has(x.a) ? ` <span class="asn-tag c">${esc(tr("Contract"))}</span>` : ""}${lab ? ` <span class="asn-tag lab">${esc(tr(lab))}</span>` : ""}${x.a === me ? ` <span class="asn-tag me">${esc(tr("You"))}</span>` : ""}${x.added ? ` <span class="asn-tag same">${esc(tr("Other list"))}</span>` : ""}</td>
        <td class="n" data-l="${esc(tr(hold ? "Held throughout" : "Balance"))}"><span data-no-i18n>${esc(fmt(v, dec))}</span>${hold && x.v !== x.min ? `<small data-no-i18n> / ${esc(fmt(x.v, dec))}</small>` : ""}</td>
        <td class="n" data-l="%" data-no-i18n>${esc(pctTxt(C.pctOf(v, r.supply)))}</td>
        ${px ? `<td class="n" data-l="USD" data-no-i18n>${esc(usd(Number(C.units(v, dec)) * px))}</td>` : ""}
        ${past ? `<td class="n" data-l="${esc(tr("Now"))}"><span data-no-i18n>${esc(fmt(x.now, dec))}</span> ${change(x)}</td>` : ""}
        ${anyLock ? `<td class="n" data-l="${esc(tr("Locked"))}" data-no-i18n>${x.locked ? esc(fmt(x.locked, dec)) : "—"}</td>` : ""}
        ${anyLp ? `<td class="n" data-l="LP" data-no-i18n>${x.lp ? esc(fmt(x.lp, dec)) : "—"}</td>` : ""}</tr>`; }).join("")}</tbody></table>
      ${!rows.length ? `<p class="asn-none">${esc(tr(F.q || F.tier ? "No wallet matches that search." : "No wallets left after these filters."))}</p>` : ""}
      ${rows.length > vis.length ? `<button type="button" class="ams-mini asn-more" data-act="more">${esc(tr(`Show more (${num(rows.length - vis.length)} left)`))}</button>` : ""}</div>`;
  }
  function paintDist(fresh) {
    const pane = $("asn-out").querySelector('[data-pane="dist"]');
    const r = F.res, hold = r.hold > 0, list = F.list;
    const val = (x) => (hold ? x.min : x.v);
    const total = list.reduce((s, x) => s + val(x), 0n) || 1n;
    const { pts, gini } = C.lorenz(list, hold);
    const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * 200).toFixed(1)} ${(200 - y * 200).toFixed(1)}`).join("");
    const gk = gini < 0.5 ? "Spread out" : gini < 0.75 ? "Concentrated" : gini < 0.9 ? "Very concentrated" : "Held by a few";
    const share = (a, b) => C.pctOf(list.slice(a, b).reduce((s, x) => s + val(x), 0n), total);
    const seg = [["Top 1", share(0, 1), "#ff8bd8"], ["2–10", share(1, 10), "#b58bff"], ["11–100", share(10, 100), "#7c9cff"], ["The rest", share(100, list.length), "#35d8d0"]];
    let acc = 0;
    const R = 54, CIRC = 2 * Math.PI * R;
    const arcs = seg.map(([, p, c]) => { const len = (p / 100) * CIRC, o = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${c}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(CIRC - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)"/>`; acc += len; return o; }).join("");
    const T = tiers(list, r.supply, hold);
    pane.innerHTML = `
      <div class="asn-dist">
        <figure class="asn-lorenz${fresh && !reduce ? " draw" : ""}">
          <svg viewBox="-24 -8 236 236" role="img" aria-label="${esc(tr("Lorenz curve"))}">
            <path class="grid" d="M0 0V200H200"/><path class="eq" d="M0 200L200 0"/>
            <path class="area" d="${path} L200 200Z"/><path class="line" d="${path}" pathLength="1"/>
            <text x="100" y="222" text-anchor="middle">${esc(tr("share of wallets →"))}</text>
            <text x="-12" y="100" text-anchor="middle" transform="rotate(-90 -12 100)">${esc(tr("share of tokens →"))}</text></svg>
          <figcaption><b data-no-i18n>${gini.toFixed(2)}</b><span>${esc(tr("Gini"))} · ${esc(tr(gk))}</span><small>${esc(tr("0 = everyone holds the same, 1 = one wallet holds everything"))}</small></figcaption>
        </figure>
        <figure class="asn-donut">
          <svg viewBox="0 0 140 140" role="img" aria-label="${esc(tr("Share held by the top wallets"))}"><circle r="${R}" cx="70" cy="70" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="18"/>${arcs}
            <text x="70" y="66" text-anchor="middle" class="big" data-no-i18n>${esc(pctTxt(seg[0][1] + seg[1][1]))}</text><text x="70" y="84" text-anchor="middle" class="sm">${esc(tr("top 10"))}</text></svg>
          <ul>${seg.map(([l, p, c]) => `<li><i style="background:${c}"></i><span>${esc(tr(l))}</span><b data-no-i18n>${esc(pctTxt(p))}</b></li>`).join("")}</ul>
        </figure>
      </div>
      <div class="asn-tiers"><div class="asn-tierbar${fresh && !reduce ? " grow" : ""}">${T.map((t) => `<i class="t-${t.k}" style="flex-grow:${Math.max(0, C.pctOf(t.v, total))}"></i>`).join("")}</div>
        <ul>${T.map((t) => `<li class="t-${t.k}"><button type="button" data-tier="${t.k}" title="${esc(tr("Show these wallets"))}"><i></i><b>${esc(tr(t.label))}</b><span>${esc(tr(t.sub))}</span><em data-no-i18n>${esc(num(t.n))}</em><small data-no-i18n>${esc(pctTxt(C.pctOf(t.v, total)))}</small></button></li>`).join("")}</ul></div>`;
  }
  function paintAirdrop(keepFocus) {
    const pane = $("asn-out").querySelector('[data-pane="airdrop"]');
    if (!pane || !F.res) return;
    const had = keepFocus && document.activeElement && pane.contains(document.activeElement) ? document.activeElement.id : "";
    const m = calcMeta(), am = amounts(), c = F.calc;
    F.amounts = am;
    const dec = m ? m.decimals : 18, sym = m ? "$" + m.symbol : "";
    const got = am ? am.map((v, i) => [F.list[i], v]).filter(([, v]) => v > 0n) : [];
    const sum = got.reduce((s, [, v]) => s + v, 0n);
    const vs = got.map(([, v]) => v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const med = vs.length ? vs[Math.floor(vs.length / 2)] : 0n;
    const drop = /^0x[0-9a-fA-F]{40}$/.test(CONFIG.DROP_ADDRESS || "");
    const methods = [["prop", "By holding", "More tokens held, more received"], ["sqrt", "Square root", "Softens the whales' share"], ["equal", "Equal", "Everyone gets the same"], ["tiers", "Tiers", "A fixed amount per holding band"]];
    pane.innerHTML = `
      <div class="asn-calc">
        <div class="asn-calc-row"><span class="asn-lbl">${esc(tr("Send"))}</span>
          <div class="ams-chips">${[["", F.tok ? "$" + F.tok.symbol : "?"], [USDC, "USDC"], ...(ARCIRCLE && (!F.tok || lc(F.tok.address) !== ARCIRCLE) ? [[CONFIG.ARCIRCLE_TOKEN, "$ARCIRCLE"]] : [])].map(([a, l]) => `<button type="button" class="ams-chip${lc(c.token) === lc(a) || (!a && !c.token) ? " on" : ""}" data-calc-tok="${esc(a)}" data-no-i18n>${esc(l)}</button>`).join("")}
            <input id="asn-c-tok" class="asn-c-tok" type="text" spellcheck="false" placeholder="${esc(tr("or a token address"))}" value="${esc(c.token && ![USDC, ARCIRCLE].includes(lc(c.token)) ? c.token : "")}"></div></div>
        <div class="asn-seg asn-methods" role="radiogroup" aria-label="${esc(tr("How to split"))}">${methods.map(([k, l, s]) => `<button type="button" role="radio" data-method="${k}" aria-checked="${c.method === k}"><b>${esc(tr(l))}</b><span>${esc(tr(s))}</span></button>`).join("")}</div>
        ${c.method === "tiers" ? `<div class="asn-tiered">${c.tiers.map(([t, a], i) => `<div class="asn-tierrow"><span>${esc(tr("Holding at least"))}</span><input type="text" inputmode="decimal" data-tier-t="${i}" value="${esc(t)}" placeholder="0"><em data-no-i18n>${esc(symOf())}</em><span>→</span><input type="text" inputmode="decimal" data-tier-a="${i}" value="${esc(a)}" placeholder="0"><em data-no-i18n>${esc(sym)}</em></div>`).join("")}
          <button type="button" class="ams-mini" data-act="tier-add">${esc(tr("Add a tier"))}</button></div>`
        : `<div class="asn-filters asn-calc-in">
          <label>${esc(tr("Total to send"))}<span class="asn-in"><input id="asn-c-total" type="text" inputmode="decimal" value="${esc(c.total)}" placeholder="0"><em data-no-i18n>${esc(sym)}</em></span>${c.bad && c.bad.total ? `<small class="asn-bad">${esc(tr("Not a number"))}</small>` : ""}</label>
          <label>${esc(tr("At most per wallet"))}<span class="asn-in"><input id="asn-c-cap" type="text" inputmode="decimal" value="${esc(c.cap)}" placeholder="${esc(tr("No limit"))}"><em data-no-i18n>${esc(sym)}</em></span></label>
          <label>${esc(tr("At least per wallet"))}<span class="asn-in"><input id="asn-c-min" type="text" inputmode="decimal" value="${esc(c.min)}" placeholder="0"><em data-no-i18n>${esc(sym)}</em></span></label></div>`}
        ${c.method !== "tiers" && c.min ? `<p class="asn-note">${esc(tr("Wallets whose share would be under the minimum get nothing; their share goes to the others."))}</p>` : ""}
      </div>
      ${am ? `<div class="asn-stats asn-calc-stats">
          <div><b>${num(got.length)}</b><small>${esc(tr("Wallets paid"))}</small></div>
          <div><b data-no-i18n>${esc(fmt(sum, dec))}</b><small data-no-i18n>${esc(sym)}</small></div>
          <div><b data-no-i18n>${esc(vs.length ? fmt(vs[vs.length - 1], dec) : "—")}</b><small>${esc(tr("Largest"))}</small></div>
          <div><b data-no-i18n>${esc(vs.length ? fmt(med, dec) : "—")}</b><small>${esc(tr("Median"))}</small></div></div>
        <div class="asn-bars" aria-hidden="true">${got.slice(0, 40).map(([, v]) => `<i style="height:${Math.max(3, Number((v * 100n) / (vs[vs.length - 1] || 1n)))}%"></i>`).join("")}</div>
        <div class="asn-table asn-calc-table"><table><thead><tr><th>#</th><th>${esc(tr("Wallet"))}</th><th class="n">${esc(tr("Holding"))}</th><th class="n">${esc(tr("Gets"))}</th></tr></thead><tbody>
          ${got.slice(0, 12).map(([x, v], i) => `<tr><td class="rk">${i + 1}</td><td class="wal"><a href="${explorer("address", x.a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(cs(x.a)))}</a></td><td class="n" data-no-i18n>${esc(fmt(F.res.hold ? x.min : x.v, F.res.decimals))}</td><td class="n" data-no-i18n><b>${esc(fmt(v, dec))}</b></td></tr>`).join("")}</tbody></table></div>
        <div class="asn-acts">
          <button type="button" class="ams-btn sm asn-primary" data-act="calc-send">${esc(tr(`Send with the Multisender (${num(got.length)})`))}</button>
          ${drop ? `<button type="button" class="ams-btn sm" data-act="calc-drop">${esc(tr("Make it a claim drop"))}</button>` : ""}
          <button type="button" class="ams-mini" data-act="calc-csv">${esc(tr("CSV with amounts"))}</button>
          <button type="button" class="ams-mini" data-act="calc-root">${esc(tr("Copy Merkle root"))}</button>
          <button type="button" class="ams-mini" data-act="calc-claims">${esc(tr("Claims JSON"))}</button>
        </div>`
      : `<p class="asn-none">${esc(tr(c.method === "tiers" ? "Add at least one tier to see who gets what." : "Enter a total to see who gets what."))}</p>`}`;
    if (had && $(had)) { const el = $(had); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not text */ } }
  }
  function paintCompare() {
    const pane = $("asn-out") && $("asn-out").querySelector('[data-pane="compare"]');
    if (!pane || !F.res) return;
    const c = F.cmp, d = c.diff, dec = F.res.decimals;
    const opts = [["24", "24h before"], ["168", "7 days before"], ["now", "Now"], ["custom", "Pick a time"]].filter(([k]) => !(k === "now" && F.res.block >= F.res.hi));
    const list = (arr, cls, k) => arr.length ? `<ul class="asn-dlist ${cls}">${arr.slice(0, 20).map(([a, b, v]) => `<li><a href="${explorer("address", a)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(cs(a)))}</a><span data-no-i18n>${k === "j" ? "+" + esc(fmt(v, dec)) : k === "l" ? "−" + esc(fmt(b, dec)) : esc(fmt(b, dec)) + " → " + esc(fmt(v, dec))}</span></li>`).join("")}${arr.length > 20 ? `<li class="more">${esc(tr(`and ${num(arr.length - 20)} more`))}</li>` : ""}</ul>` : `<p class="asn-none sm">—</p>`;
    pane.innerHTML = `
      <p class="asn-note">${esc(tr("Build the same list at another moment and see who joined, who left and who changed — same token, same filters."))}</p>
      <div class="asn-seg sm asn-cmp-seg" role="radiogroup">${opts.map(([k, l]) => `<button type="button" role="radio" data-cmp="${k}" aria-checked="${String(c.ago) === k}">${esc(tr(l))}</button>`).join("")}</div>
      ${c.ago === "custom" ? `<input id="asn-cmp-at" type="datetime-local" class="asn-cmp-at" value="${esc(c.at)}" aria-label="${esc(tr("Date and time"))}">` : ""}
      <button type="button" class="ams-btn sm asn-primary asn-cmp-go" data-act="cmp-go"${c.busy ? " disabled" : ""}>${esc(tr(c.busy ? "Building…" : "Compare"))}</button>
      ${c.busy ? `<i class="asn-prog"><b style="transform:scaleX(${Math.max(0.03, c.prog || 0.05)})"></b></i>` : ""}
      ${c.err && !c.busy && !d ? `<p class="asn-left warn">${esc(c.err)}</p>` : ""}
      ${d ? `<p class="asn-cmp-h">${esc(tr(c.earlier ? `From ${when(c.res.ts)} to ${when(F.res.ts)}` : `From ${when(F.res.ts)} to ${when(c.res.ts)}`))}</p>
        <div class="asn-stats asn-cmp-stats">
          <div class="j"><b>+${num(d.joined.length)}</b><small>${esc(tr("Joined"))}</small></div>
          <div class="l"><b>−${num(d.left.length)}</b><small>${esc(tr("Left"))}</small></div>
          <div class="u"><b>${num(d.up.length)}</b><small>${esc(tr("Went up"))}</small></div>
          <div class="d"><b>${num(d.down.length)}</b><small>${esc(tr("Went down"))}</small></div></div>
        <div class="asn-dcols"><div><h4>${esc(tr("Joined"))}</h4>${list(d.joined, "j", "j")}</div><div><h4>${esc(tr("Left"))}</h4>${list(d.left, "l", "l")}</div>
          <div><h4>${esc(tr("Went up"))}</h4>${list(d.up, "u", "u")}</div><div><h4>${esc(tr("Went down"))}</h4>${list(d.down, "d", "d")}</div></div>
        <button type="button" class="ams-mini" data-act="cmp-csv">${esc(tr("Download the changes (CSV)"))}</button>` : ""}`;
  }
  function paintPublish() {
    const pane = $("asn-out") && $("asn-out").querySelector('[data-pane="publish"]');
    if (!pane || !F.res) return;
    const p = F.pub, last = p.last, sc = p.sched, v = p.verify;
    const x = (u, t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`;
    pane.innerHTML = `
      <div class="asn-pubform">
        <label class="asn-full">${esc(tr("Title (optional)"))}<input id="asn-p-title" type="text" maxlength="80" value="${esc(p.title)}" placeholder="${esc(tr("e.g. Season 1 holder airdrop"))}"></label>
        <label class="asn-check"><input type="checkbox" id="asn-p-sign"${p.sign ? " checked" : ""}> <span>${esc(tr("Sign it with my wallet"))} <small>${esc(tr("(shows who published it — free, no transaction)"))}</small></span></label>
      </div>
      <div class="asn-pubcards">
        <div class="asn-pubcard">
          <h4>${esc(tr("Publish this list"))}</h4>
          <p>${esc(tr("A permanent page with this exact list, its fingerprint and an \"Am I in it?\" check — a link to post with your announcement."))}</p>
          ${F.also.mode ? `<p class="asn-left warn">${esc(tr("A combined list can't be published — turn \"Combine\" off first."))}</p>` : ""}
          <button type="button" class="ams-btn sm asn-primary" data-act="publish"${p.busy || F.also.mode ? " disabled" : ""}>${esc(tr(p.busy ? "Publishing…" : "Publish"))}</button>
          ${last ? `<div class="asn-publink"><a href="${esc(last.url)}" target="_blank" rel="noopener" data-no-i18n>${esc(last.url.replace(/^https?:\/\//, ""))}</a>
            <button type="button" class="ams-mini" data-copy="${esc(last.url)}">${esc(tr("Copy link"))}</button>
            <a class="ams-mini" href="${esc(x(last.url, `${F.pub.title || "Holder snapshot"} — ${last.count} wallets, fingerprint ${last.fp.slice(0, 12)}…`))}" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a>
            ${last.match ? `<span class="asn-tag up">${esc(tr("Same fingerprint as here"))}</span>` : `<span class="asn-tag down">${esc(tr("The server's list differs — check the filters"))}</span>`}</div>` : ""}
        </div>
        <div class="asn-pubcard">
          <h4>${esc(tr("Schedule a snapshot"))}</h4>
          <p>${esc(tr("Announce the moment first; the list is built from the chain at that moment, with the settings on the left. Nobody — including you — can change it afterwards."))}</p>
          <input id="asn-p-at" type="datetime-local" value="${esc(p.schedAt)}" aria-label="${esc(tr("Date and time"))}">
          <button type="button" class="ams-btn sm" data-act="schedule"${p.busy ? " disabled" : ""}>${esc(tr("Schedule"))}</button>
          ${sc ? `<div class="asn-publink"><a href="${esc(sc.url)}" target="_blank" rel="noopener" data-no-i18n>${esc(sc.url.replace(/^https?:\/\//, ""))}</a>
            <button type="button" class="ams-mini" data-copy="${esc(sc.url)}">${esc(tr("Copy link"))}</button>
            <a class="ams-mini" href="${esc(x(sc.url, `${F.pub.title || "Holder snapshot"} — scheduled for ${utc(sc.at)}`))}" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a></div>` : ""}
        </div>
        <div class="asn-pubcard">
          <h4>${esc(tr("Check a CSV"))}</h4>
          <p>${esc(tr("Drop a snapshot CSV to see whether it matches a fingerprint — this list's, or one you paste."))}</p>
          <input id="asn-vfp" type="text" spellcheck="false" placeholder="${esc(tr("Fingerprint (0x…) — empty = this list"))}">
          <label class="asn-drop" id="asn-drop"><input type="file" id="asn-vfile" accept=".csv,text/csv" hidden><span>${esc(tr("Drop a CSV here, or tap to choose"))}</span></label>
          ${v ? `<p class="asn-verify ${v.ok ? "ok" : "bad"}"><b>${esc(tr(v.ok ? "It matches." : v.want ? "It doesn't match." : "No fingerprint to compare with."))}</b> <span data-no-i18n>${esc(v.name)} · ${esc(v.got.slice(0, 18))}…</span></p>` : ""}
        </div>
      </div>`;
  }
  function paintView() {
    const box = $("asn-pub");
    const v = F.view;
    box.hidden = !v;
    if (!v) return;
    if (v.err) { box.innerHTML = `<div class="asn-pubview"><b>${esc(v.err)}</b> <button type="button" class="ams-mini" data-act="view-close">×</button></div>`; return; }
    const d = v.d, done = d.status === "done";
    const nowS = Date.now() / 1000, left = Math.max(0, (d.at || 0) - nowS);
    const cd = (s) => { const dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); return `${dd ? dd + "d " : ""}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };
    const dec = d.decimals || 18;
    const f = d.f || {};
    const rules = [f.min ? tr(`at least ${f.min}`) : "", f.top ? tr(`top ${f.top}`) : "", f.noC ? tr("no contracts") : "", f.hold ? tr(`held throughout ${span(f.hold)}`) : "", f.locks ? tr("locked tokens count") : "", f.lp ? tr("LP counts") : "", f.skip && f.skip.length ? tr(plural(f.skip.length, "wallet left out", "wallets left out")) : ""].filter(Boolean);
    box.innerHTML = `<div class="asn-pubview${done ? " done" : ""}">
      <button type="button" class="asn-x" data-act="view-close" aria-label="${esc(tr("Close"))}">×</button>
      <span class="asn-kick">${esc(tr(done ? "Published snapshot" : d.status === "building" ? "Building now" : "Scheduled snapshot"))}</span>
      <h2>${d.title ? esc(d.title) : esc(tr("Holder snapshot"))} <small data-no-i18n>$${esc(d.symbol || "?")}</small></h2>
      ${d.by ? `<p class="asn-signed ${d.verified ? "ok" : "bad"}">${esc(tr(d.verified ? "Signed by" : "Signature doesn't check out:"))} <a href="${explorer("address", d.by)}" target="_blank" rel="noopener" data-no-i18n>${esc(short(cs(d.by)))}</a></p>` : ""}
      ${rules.length ? `<p class="asn-rules">${rules.map((x) => `<span>${esc(x)}</span>`).join("")}</p>` : ""}
      ${done ? `<div class="asn-stats">
          <div><b>${num(d.count)}</b><small>${esc(tr("Holders"))}</small></div>
          <div><b data-no-i18n>#${num(d.block)}</b><small>${esc(tr("Block"))}</small></div>
          <div><b>${esc(when(d.ts))}</b><small data-no-i18n>${esc(utc(d.ts))}</small></div>
          <div><b data-no-i18n>${esc(fmt(BigInt(d.total || 0), dec))}</b><small data-no-i18n>$${esc(d.symbol || "")}</small></div></div>
        <p class="asn-fpline">${esc(tr("Fingerprint"))} <code data-no-i18n>${esc(d.fp)}</code> <button type="button" class="ams-mini" data-copy="${esc(d.fp)}">${esc(tr("Copy"))}</button></p>
        <form class="asn-amin" id="asn-amin" autocomplete="off"><input id="asn-amin-w" type="text" spellcheck="false" value="${esc(v.wallet || (state && state.account) || "")}" placeholder="${esc(tr("Your wallet (0x…)"))}" aria-label="${esc(tr("Your wallet"))}"><button type="submit" class="ams-btn sm asn-primary">${esc(tr("Am I in it?"))}</button></form>
        ${d.me ? `<p class="asn-verdict ${d.me.rank ? "in" : "out"}">${d.me.rank ? esc(tr(`Yes — #${d.me.rank} on the list`)) + ` · <b data-no-i18n>${esc(fmt(BigInt(f.hold ? d.me.min : d.me.v), dec))} $${esc(d.symbol || "")}</b>` : esc(tr("That wallet isn't on this list."))}</p>` : ""}
        <div class="asn-acts"><a class="ams-mini" href="/api/social?snapcsv=${esc(d.id)}" download>${esc(tr("Download CSV"))}</a><button type="button" class="ams-mini" data-act="view-open">${esc(tr("Open in the tool"))}</button><button type="button" class="ams-mini" data-copy="${esc(location.origin + "/snap/" + d.id)}">${esc(tr("Copy link"))}</button></div>`
      : `<div class="asn-count-down"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle class="p" id="asn-ring" cx="60" cy="60" r="52" pathLength="100" style="stroke-dasharray:${Math.max(2, Math.round((d.status === "building" ? d.progress || 0.05 : elapsed(d)) * 100))} 100"/></svg>
          <div><b data-no-i18n id="asn-cd">${d.status === "building" ? Math.round((d.progress || 0) * 100) + "%" : esc(cd(left))}</b><span>${esc(when(d.at))}</span><small data-no-i18n>${esc(utc(d.at))}</small></div></div>
        <p class="asn-note">${esc(tr(d.status === "building" ? "The moment has passed — the list is being built from the chain." : "The list will be built from the chain at this moment. Come back after it to see whether your wallet made it."))}</p>`}
    </div>`;
    if (!done && d.status !== "building") tick();
  }
  const elapsed = (d) => { const a = (d.created || Date.now()) / 1000, b = d.at || a + 1; return Math.max(0, Math.min(1, (Date.now() / 1000 - a) / Math.max(1, b - a))); };
  let tickT = 0;
  function tick() {
    clearTimeout(tickT);
    const el = $("asn-cd");
    if (!el || !F.view || !F.view.d || F.view.d.status === "done") return;
    const s = Math.max(0, (F.view.d.at || 0) - Date.now() / 1000);
    const dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
    el.textContent = `${dd ? dd + "d " : ""}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    const ring = $("asn-ring");
    if (ring) ring.style.strokeDasharray = `${Math.max(2, Math.round(elapsed(F.view.d) * 100))} 100`;
    if (s <= 0) { openView(F.view.id); return; }
    tickT = setTimeout(tick, 1000);
  }
  function paintSetupSum() {
    const btn = $("asn-setup-sum");
    const on = !!(F.res && F.tok && panel.classList.contains("asn-collapsed"));
    btn.hidden = !on;
    if (!on) return;
    const bits = [symOf(), F.res.block < F.res.hi ? when(F.res.ts) : tr("Now"), F.res.hold ? tr(`held ${span(F.res.hold)}`) : "", F.f.min ? `≥ ${F.f.min}` : "", F.f.top ? tr(`top ${F.f.top}`) : ""].filter(Boolean);
    btn.innerHTML = `<span>${bits.map(esc).join(" · ")}</span><b>${esc(tr("Edit"))}</b>`;
  }
  function afterTake() {
    if (window.innerWidth <= 900) {
      panel.classList.add("asn-collapsed"); paintSetupSum();
      const el = $("asn-result");
      if (el) setTimeout(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 60);
    }
  }
  let io = null;
  function sticky() {
    const bar = $("asn-sticky");
    if (!F.res || window.innerWidth > 900) { bar.hidden = true; return; }
    $("asn-sticky-t").textContent = tr(plural(F.list.length, "wallet", "wallets"));
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => { const e = es[0]; bar.hidden = !F.res || e.isIntersecting || !panel.classList.contains("active"); }, { threshold: 0 });
      const target = $("asn-sum");
      if (target) io.observe(target);
    }
  }

  // ---------------- wiring ----------------
  function readFilters() {
    F.f.min = $("asn-min").value; F.f.max = $("asn-max").value; F.f.top = $("asn-top").value;
    F.f.noC = $("asn-noc").checked; F.f.skip = $("asn-skip").value;
    F.locks = $("asn-locks").checked; F.lp = $("asn-lp").checked;
  }
  function writeFilters() {
    $("asn-min").value = F.f.min; $("asn-max").value = F.f.max; $("asn-top").value = F.f.top;
    $("asn-noc").checked = F.f.noC; $("asn-skip").value = F.f.skip;
    $("asn-locks").checked = F.locks; $("asn-lp").checked = F.lp;
    panel.querySelectorAll("[data-since]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.since === F.f.since)));
    panel.querySelectorAll("[data-also]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.also === F.also.mode)));
    const sym = F.tok ? symOf() : "";
    panel.querySelectorAll(".asn-setup .asn-unit").forEach((u) => { u.textContent = sym; });
  }
  function localInput(ms) {
    const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function labels() {
    $("asn-addr").setAttribute("placeholder", tr("Paste a token contract address (0x…)"));
    $("asn-skip").setAttribute("placeholder", tr("0x… one per line — team, exchanges, anyone else"));
    $("asn-skip").setAttribute("aria-label", tr("Wallets to leave out"));
    $("asn-also-token").setAttribute("placeholder", tr("Token contract address (0x…)"));
  }
  async function loadAlso() {
    const kind = $("asn-also-kind").value, note = $("asn-also-note");
    note.textContent = tr("Loading…");
    try {
      if (kind === "circle") {
        const r = await fetchJson("/api/social?circle=lb", 25000);
        const rows = r.ok && r.j && Array.isArray(r.j.rows) ? r.j.rows : null;
        if (!rows) throw new Error(tr("Couldn't read the CirclePad round right now."));
        F.also.set = new Set(rows.map((x) => lc(x.address))); F.also.label = tr("CirclePad contributors");
      } else {
        const t = $("asn-also-token").value.trim();
        if (!isAddr(t)) throw new Error(tr("That isn't a token contract address."));
        const r = await fetchJson(`/api/social?holdersnap=${t}&limit=8000`);
        if (!r.ok || !r.j || !Array.isArray(r.j.holders)) throw new Error(tr("Couldn't read the holders right now — try again in a moment."));
        const min = C.parseUnits($("asn-also-min").value, r.j.decimals || 18) || 0n;
        F.also.set = new Set(r.j.holders.filter(([, v]) => BigInt(v) >= min && BigInt(v) > 0n).map(([a]) => lc(a)));
        let sym = "";
        try { sym = (await arcQuoteMeta(t)).symbol; } catch { /* unnamed */ }
        F.also.label = tr(`holders of ${sym ? "$" + sym : short(t)}`);
      }
      note.textContent = tr(plural(F.also.set.size, "wallet on that list", "wallets on that list"));
      if (!F.also.mode) { F.also.mode = "and"; writeFilters(); }
      apply(false);
    } catch (err) { note.textContent = String(err.message || err); }
  }
  let booted = false;
  function init() {
    const at = $("asn-at");
    at.max = localInput(Date.now());
    labels();
    $("asn-form").addEventListener("submit", (e) => { e.preventDefault(); pick($("asn-addr").value); });
    $("asn-addr").addEventListener("paste", () => setTimeout(() => { const v = $("asn-addr").value.trim(); if (isAddr(v)) pick(v); }, 0));
    $("asn-go").addEventListener("click", () => { if (F.tok) { F.run++; take(F.run); } else pick($("asn-addr").value, { go: true }); });
    at.addEventListener("change", () => { F.at = at.value; F.pastBlock = null; paintWhen(); });
    $("asn-range").addEventListener("input", (e) => { const h = 720 - Number(e.target.value); F.at = localInput(Date.now() - h * 3600e3); at.value = F.at; F.pastBlock = null; if (F.mode !== "past") { F.mode = "past"; } paintWhen(); });
    $("asn-setup-sum").addEventListener("click", () => { panel.classList.remove("asn-collapsed"); paintSetupSum(); $("asn-setup").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); });
    let ft = 0;
    panel.addEventListener("input", (e) => {
      const id = e.target.id;
      if (id === "asn-q") { F.q = e.target.value; F.shown = PAGE; paintHolders(false); const n = $("asn-q"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } return; }
      if (/^asn-(min|max|top|skip)$/.test(id)) { readFilters(); clearTimeout(ft); ft = setTimeout(() => apply(false), 220); return; }
      if (id === "asn-c-total" || id === "asn-c-cap" || id === "asn-c-min") { F.calc[id.slice(6)] = e.target.value; clearTimeout(ft); ft = setTimeout(() => paintAirdrop(true), 250); return; }
      if (e.target.dataset.tierT != null) { F.calc.tiers[Number(e.target.dataset.tierT)][0] = e.target.value; clearTimeout(ft); ft = setTimeout(() => paintAirdrop(true), 300); return; }
      if (e.target.dataset.tierA != null) { F.calc.tiers[Number(e.target.dataset.tierA)][1] = e.target.value; clearTimeout(ft); ft = setTimeout(() => paintAirdrop(true), 300); return; }
      if (id === "asn-c-tok") { const v = e.target.value.trim(); if (isAddr(v)) setCalcToken(v); return; }
      if (id === "asn-p-title") { F.pub.title = e.target.value; return; }
      if (id === "asn-p-at") { F.pub.schedAt = e.target.value; return; }
      if (id === "asn-cmp-at") { F.cmp.at = e.target.value; return; }
    });
    panel.addEventListener("change", (e) => {
      const id = e.target.id;
      if (id === "asn-noc") { readFilters(); apply(false); }
      else if (id === "asn-locks" || id === "asn-lp") { readFilters(); if (F.res) toast(tr("Take the snapshot again to apply this.")); }
      else if (id === "asn-p-sign") F.pub.sign = e.target.checked;
      else if (id === "asn-vfile" && e.target.files && e.target.files[0]) verifyFile(e.target.files[0]);
      else if (id === "asn-p-at") F.pub.schedAt = e.target.value;
      else if (id === "asn-cmp-at") F.cmp.at = e.target.value;
    });
    panel.addEventListener("dragover", (e) => { const d = e.target.closest && e.target.closest("#asn-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
    panel.addEventListener("dragleave", (e) => { const d = e.target.closest && e.target.closest("#asn-drop"); if (d) d.classList.remove("over"); });
    panel.addEventListener("drop", (e) => { const d = e.target.closest && e.target.closest("#asn-drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) verifyFile(f); });
    panel.addEventListener("submit", (e) => {
      if (e.target.id === "asn-amin") { e.preventDefault(); const w = $("asn-amin-w").value.trim() || (state && state.account) || ""; if (isAddr(w) && F.view) { F.view.wallet = w; openView(F.view.id, lc(w)); } else { const i = $("asn-amin-w"); i.focus(); i.classList.remove("shake"); void i.offsetWidth; i.classList.add("shake"); } }
    });
    panel.addEventListener("mouseover", (e) => {
      const t = e.target.closest && e.target.closest("[data-tier]");
      panel.classList.toggle("asn-tierhover", !!(t && t.tagName === "BUTTON"));
      if (t && t.tagName === "BUTTON") panel.dataset.tierh = t.dataset.tier;
    });
    panel.addEventListener("click", onClick);
    writeFilters(); paintWhen(); paintBusy();
    window.addEventListener("resize", () => { if (F.res) { sticky(); paintTabs(); } });
  }
  function onClick(e) {
    const t = e.target.closest("button, [data-t], a[data-copy]");
    if (!t || !panel.contains(t)) return;
    if (t.dataset.copy) { e.preventDefault(); copy(t.dataset.copy, t); return; }
    if (t.dataset.t) { F.mode = t.dataset.b ? "past" : "now"; F.pastBlock = t.dataset.b ? Number(t.dataset.b) : null; paintWhen(); pick(t.dataset.t, { go: true, block: F.pastBlock }); return; }
    if (t.dataset.when) {
      F.mode = t.dataset.when; F.pastBlock = null;
      if (F.mode === "past" && !F.at) { F.at = localInput(Date.now() - 86400e3); $("asn-at").value = F.at; }
      paintWhen();
      return;
    }
    if (t.dataset.holdp != null) { F.hold = Number(t.dataset.holdp); paintWhen(); if (F.res) toast(tr("Take the snapshot again to apply this.")); return; }
    if (t.dataset.ago) { F.at = localInput(Date.now() - Number(t.dataset.ago) * 3600e3); $("asn-at").value = F.at; F.pastBlock = null; F.mode = "past"; paintWhen(); return; }
    if (t.dataset.since) { F.f.since = t.dataset.since; writeFilters(); apply(false); return; }
    if (t.dataset.also != null) { F.also.mode = t.dataset.also; writeFilters(); if (F.also.mode && !F.also.set) loadAlso(); else apply(false); return; }
    if (t.dataset.tabGo) { F.tab = t.dataset.tabGo; paintTabs(); if (F.tab === "dist") paintDist(true); else if (F.tab === "airdrop") paintAirdrop(); else if (F.tab === "compare") paintCompare(); else if (F.tab === "publish") paintPublish(); return; }
    if (t.dataset.goTab) { F.tab = t.dataset.goTab; paintTabs(); paintAirdrop(); $("asn-result").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
    if (t.dataset.sort) { F.sort = F.sort === t.dataset.sort ? "v" : t.dataset.sort; paintHolders(false); return; }
    if (t.dataset.tier && t.tagName === "BUTTON") { F.tier = t.dataset.tier; F.tab = "holders"; F.shown = PAGE; paintTabs(); paintHolders(true); return; }
    if (t.hasAttribute("data-tier-off")) { F.tier = null; paintHolders(false); return; }
    if (t.dataset.method) { F.calc.method = t.dataset.method; paintAirdrop(); return; }
    if (t.dataset.calcTok != null) { setCalcToken(t.dataset.calcTok); return; }
    if (t.dataset.cmp) { F.cmp.ago = t.dataset.cmp; if (t.dataset.cmp === "custom" && !F.cmp.at) F.cmp.at = localInput((F.res ? F.res.ts * 1000 : Date.now()) - 3 * 86400e3); paintCompare(); return; }
    if (t.hasAttribute("data-cancel")) { F.run++; F.busy = false; paintBusy(); status("", ""); shutter("open"); return; }
    const a = t.dataset.act;
    if (!a) return;
    const dec = F.res ? F.res.decimals : 18;
    if (a === "more") { F.shown += PAGE * 2; paintHolders(false); }
    else if (a === "refresh") { F.run++; take(F.run); }
    else if (a === "csv") { if (!F.res) return; download(`${fileBase()}.csv`, csv(), "text/csv"); toast(tr("CSV downloaded")); }
    else if (a === "json") download(`${fileBase()}.json`, jsonOut(), "application/json");
    else if (a === "addrs") copy(F.list.map((x) => cs(x.a)).join("\n"), t, tr(`${plural(F.list.length, "address", "addresses")} copied`));
    else if (a === "link") copy(shareUrl(), t, tr("Link copied — it rebuilds this exact snapshot"));
    else if (a === "fp") copy(fingerprint(), t, tr("Fingerprint copied"));
    else if (a === "jump") {
      const me = lc(state.account), i = F.list.findIndex((x) => x.a === me);
      if (i < 0) return;
      F.tab = "holders"; F.q = ""; F.tier = null; F.sort = "v"; if (F.shown <= i) F.shown = i + 10; paintTabs(); paintHolders(false);
      const row = panel.querySelector(`tr[data-a="${me}"]`);
      if (row) { row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); row.classList.remove("pulse"); void row.offsetWidth; row.classList.add("pulse"); }
    }
    else if (a === "ms-same") toMultisend(F.list.map((x) => cs(x.a)).join("\n"), "same", tr(`${plural(F.list.length, "wallet", "wallets")} from the ${symOf()} snapshot — now pick the token to send.`), { from: t });
    else if (a === "ms-weight") {
      const hold = F.res.hold > 0;
      const rows = F.list.map((x) => [x.a, Number(C.units(hold ? x.min : x.v, dec)).toFixed(6).replace(/\.?0+$/, "")]).filter(([, w]) => w && w !== "0");
      toMultisend(rows.map(([a2, w]) => `${cs(a2)}, ${w}`).join("\n"), "weight", tr(`${plural(rows.length, "wallet", "wallets")} from the ${symOf()} snapshot — now pick the token to send.`), { from: t });
    }
    else if (a === "calc-send" || a === "calc-drop") {
      const m = calcMeta(), am = F.amounts;
      if (!m || !am) return;
      const lines = F.list.map((x, i) => [x.a, am[i]]).filter(([, v]) => v > 0n).map(([a2, v]) => `${cs(a2)}, ${C.units(v, m.decimals)}`);
      toMultisend(lines.join("\n"), "line", tr(`${plural(lines.length, "wallet", "wallets")} from the ${symOf()} snapshot, amounts included.`), { from: t, token: m.address, mode: a === "calc-drop" ? "drop" : "token" });
    }
    else if (a === "calc-csv") { const m = calcMeta(); if (!m || !F.amounts) return; download(`${fileBase()}-airdrop.csv`, C.toCsv(F.list, { ...csvMeta(), amounts: F.amounts, amountDecimals: m.decimals }), "text/csv"); }
    else if (a === "calc-root" || a === "calc-claims") {
      const m = calcMeta(), am = F.amounts;
      if (!m || !am) return;
      const entries = F.list.map((x, i) => [x.a, am[i]]).filter(([, v]) => v > 0n).map(([a2, v], i) => [i, a2, v]);
      const root = C.merkleRoot(entries, kk);
      if (a === "calc-root") copy(root, t, tr("Merkle root copied"));
      else download(`${fileBase()}-claims.json`, JSON.stringify({ token: m.address, merkleRoot: root, leafEncoding: "keccak256(keccak256(abi.encode(uint256 index, address account, uint256 amount)))", total: entries.reduce((s, e) => s + e[2], 0n).toString(), claims: entries.map(([i, a2, v]) => ({ index: i, account: cs(a2), amount: v.toString() })) }, null, 2), "application/json");
    }
    else if (a === "tier-add") { if (F.calc.tiers.length < 8) F.calc.tiers.push(["", ""]); paintAirdrop(); }
    else if (a === "cmp-go") compare();
    else if (a === "cmp-csv") {
      const d = F.cmp.diff; if (!d) return;
      const rows = [["change", "address", "before", "after"]];
      for (const [k, arr] of [["joined", d.joined], ["left", d.left], ["up", d.up], ["down", d.down]]) for (const [a2, b, v] of arr) rows.push([k, cs(a2), C.units(b, dec), C.units(v, dec)]);
      download(`${fileBase()}-changes.csv`, rows.map((r) => r.join(",")).join("\n") + "\n", "text/csv");
    }
    else if (a === "publish") publish(t);
    else if (a === "schedule") schedule(t);
    else if (a === "skip-toggle" || a === "also-toggle") {
      const box = $(a === "skip-toggle" ? "asn-skipbox" : "asn-also"); box.hidden = !box.hidden; t.setAttribute("aria-expanded", String(!box.hidden));
      if (!box.hidden && a === "skip-toggle") $("asn-skip").focus();
    }
    else if (a === "also-load") loadAlso();
    else if (a === "view-close") { F.view = null; clearTimeout(viewT); paintView(); if (history.replaceState) history.replaceState(null, "", location.pathname + location.search + "#snapshot"); }
    else if (a === "view-open") {
      const d = F.view && F.view.d; if (!d) return;
      const f = d.f || {};
      F.f = { min: f.min || "", max: f.max || "", top: f.top ? String(f.top) : "", noC: f.noC !== false, since: f.since || "any", skip: (f.skip || []).join("\n") };
      F.hold = f.hold || 0; F.locks = f.locks !== false; F.lp = !!f.lp; F.mode = "past"; F.pastBlock = d.block; F.expect = d.fp; F.expectFor = `${lc(d.token)}:${d.block}`;
      F.also = { mode: "", kind: "token", token: "", min: "", set: null, label: "" };
      writeFilters(); paintWhen();
      pick(d.token, { go: true, block: d.block });
    }
  }
  function fromHash() {
    const m = /^#snapshot\?(.+)$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    if (/^[0-9a-f]{12}$/.test(q.get("id") || "")) { openView(q.get("id"), state && state.account ? lc(state.account) : ""); return; }
    const t = q.get("t") || q.get("token");
    if (!isAddr(t)) return;
    F.f.min = q.get("min") || ""; F.f.max = q.get("max") || ""; F.f.top = q.get("top") || "";
    F.f.noC = q.get("nc") !== "0"; F.f.since = ["some", "all"].includes(q.get("since") || q.get("hold")) ? (q.get("since") || q.get("hold")) : "any";
    F.hold = HOLDP.includes(Number(q.get("hold"))) ? Number(q.get("hold")) : 0;
    F.locks = q.get("locks") !== "0"; F.lp = q.get("lp") === "1";
    writeFilters();
    const b = Number(q.get("b")) || 0;
    if (F.tok && lc(F.tok.address) === lc(t) && F.res && (b ? F.res.block === b : F.res.block >= F.res.hi)) { apply(false); return; }
    F.mode = b ? "past" : "now"; F.pastBlock = b || null; paintWhen();
    pick(t, { go: true, block: b || null });
  }
  function onShow() {
    if (!booted) { booted = true; init(); }
    paintChips();
    fromHash();
    if (!F.tok && !reduce && !/[?&](id|t|token)=/.test(location.hash)) setTimeout(() => { if (panel.classList.contains("active")) $("asn-addr").focus({ preventScroll: true }); }, 250);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "snapshot") onShow(); else $("asn-sticky").hidden = true; });
  document.addEventListener("arc:lang", () => { if (!booted) return; labels(); paintChips(); paintToken(); if (F.res) { $("asn-out").innerHTML = ""; paintResult(false); } paintView(); });
  window.addEventListener("hashchange", () => { if (booted && /^#snapshot\?/.test(location.hash)) fromHash(); });
  if (panel.classList.contains("active")) setTimeout(onShow, 0);
  let seen = state && state.account;
  setInterval(() => { if (booted && state && state.account !== seen) { seen = state.account; if (F.res) paintResult(false); if (F.view && F.view.d) paintView(); } }, 1500);
  window.arcSnapshot = {
    pick, state: F, csv: () => (F.res ? csv() : ""), fingerprint: () => (F.res ? fingerprint() : ""), core: C,
    take: () => { F.run++; return take(F.run); },
  };
})();
