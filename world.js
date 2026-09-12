// world.js — the World map: one coin per capital.
//
// A capital is claimed by launching on HOMEPAD's Paired factory with the
// quote fixed to $HOMEPAD, and name / ticker / logo fixed by the map:
//   name     = country name        ("South Korea")
//   ticker   = capital name        ("SEOUL", or ISO3 when it can't be a symbol)
//   imageUrl = world/logos/<ISO2>.svg (this site's canonical outline)
//
// Source of truth is the chain, not a database. For each capital, every
// matching launch is read from the factory and resolved in launch order:
//   - the first matching launch holds the capital;
//   - a later launch takes it over (a "reset") only if the new creator had
//     sent WORLD_RESET_FEE_HOMEPAD $HOMEPAD to the $HOME treasury sometime
//     after the current holder's own launch — verifiable on-chain, no time
//     window required.
// The market-cap condition (< WORLD_RESET_MCAP_USD) is what the app
// enforces before it will let someone start a reset; it isn't provable
// from past chain state alone, so an airtight version needs a registry
// contract (planned). Firebase, when configured, records claims/resets
// with a mcap snapshot for that future step.

/// Shared with the homepage's $HOME/$HOMEPAD pills — world.html doesn't
/// load home-stats.js (it also drives the price chart/carousel, unrelated
/// here), so this is a local copy rather than pulling that whole file in.
function copyCA(address, btnId) {
  navigator.clipboard.writeText(address);
  const btn = document.getElementById(btnId);
  const original = btn.textContent;
  btn.textContent = "copied!";
  setTimeout(() => (btn.textContent = original), 1500);
}

const WORLD_LOGO_BASE = "https://homepad.fun/world/logos/";
const worldLogoUrl = (c) => `${WORLD_LOGO_BASE}${c.iso2}.svg`;
const worldDescription = (c) => `HOMETOWN · ${c.name} (${c.iso2}) · capital: ${c.capital}. One coin per capital on the HOMEPAD World map, paired with $HOMEPAD.`;
const RESET_FEE = () => ethers.parseUnits(String(CONFIG.WORLD_RESET_FEE_HOMEPAD || "2000000"), 18);
const RESET_MCAP = () => Number(CONFIG.WORLD_RESET_MCAP_USD || 50000);
const GRACE = () => Number(CONFIG.WORLD_RESET_GRACE_SEC || 300); // short sniping-protection window, not a real deadline
const quoteCfg = () => CONFIG.HOMEPAD_QUOTE;

const W = {
  countries: WORLD_COUNTRIES,
  byIso: new Map(WORLD_COUNTRIES.map((c) => [c.iso2, c])),
  byNum: new Map(WORLD_COUNTRIES.map((c) => [c.ccn3, c])),
  claims: new Map(),   // iso2 -> { entry, history: [entries], resets: n }
  filter: "all",
  query: "",
  map: null,
  tsCache: new Map(),
};

// ---------- helpers ----------
async function blockTs(blockNumber) {
  if (W.tsCache.has(blockNumber)) return W.tsCache.get(blockNumber);
  const b = await readProvider().getBlock(blockNumber);
  const ts = Number(b.timestamp);
  W.tsCache.set(blockNumber, ts);
  return ts;
}
const nowSec = () => Math.floor(Date.now() / 1000);
function claimAge(entry) { return nowSec() - Number(entry.launchedAt); }
function isInGrace(entry) { return claimAge(entry) < GRACE(); } // just claimed — can't be reset yet regardless of mcap
// Resettable requires BOTH: past the short grace window, AND currently
// under the mcap threshold. "Protected" is everything else (either still
// fresh, or genuinely above the threshold) — a claim always shows as one
// or the other, never neither.
function isResettable(entry) { return !isInGrace(entry) && (entry.marketCapUsd == null || entry.marketCapUsd < RESET_MCAP()); }
function isProtected(entry) { return !isResettable(entry); }
function fmtDur(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}m ${s}s` : `${s}s`; }

// ---------- Claims (chain-derived, with reset resolution) ----------
async function loadWorldClaims() {
  const entries = await fetchAllLaunches({ skipHistory: true, skipHomeCard: true });
  const q = quoteCfg();
  const norm = (s) => String(s || "").trim();
  const isWorldLaunch = (e) => {
    if (e.type === "paired") return q && (e.quoteToken || "").toLowerCase() === q.address.toLowerCase();
    return e.type === "hybrid"; // earlier ETH-paired claims still count
  };
  // group matching launches per capital, oldest first
  const groups = new Map();
  for (const e of entries.filter(isWorldLaunch).sort((a, b) => a.launchedAt - b.launchedAt)) {
    const c = W.countries.find((x) => x.name === norm(e.name) && x.ticker === norm(e.symbol));
    if (!c || norm(e.imageUrl) !== worldLogoUrl(c)) continue;
    if (!groups.has(c.iso2)) groups.set(c.iso2, []);
    groups.get(c.iso2).push(e);
  }
  const claims = new Map();
  for (const [iso2, list] of groups) {
    let holder = list[0];
    const history = [holder];
    for (const cand of list.slice(1)) {
      // Takes over iff the reset fee was paid after the holder's own grace
      // window closed and before this candidate's own launch.
      if (await resetFeePaid(cand.creator, Number(holder.launchedAt) + GRACE(), Number(cand.launchedAt))) {
        holder = cand; history.push(cand);
      }
    }
    claims.set(iso2, { entry: holder, history, resets: history.length - 1 });
  }
  W.claims = claims;
  return claims;
}

/// Did `who` send >= RESET_FEE $HOMEPAD to the $HOME treasury with a block
/// timestamp in [fromTs, toTs]? Token-contract Transfer logs, bounded.
async function resetFeePaid(who, fromTs, toTs) {
  try {
    const q = quoteCfg(); if (!q || !who) return false;
    const t = tokenRead(q.address);
    const fromBlock = await firstHomepadBlock();
    const evs = await t.queryFilter(t.filters.Transfer(who, CONFIG.HOME_TREASURY_ADDRESS), fromBlock, "latest");
    for (const ev of evs) {
      if (ev.args.value < RESET_FEE()) continue;
      const ts = await blockTs(ev.blockNumber);
      if (ts >= fromTs && ts <= toTs) return true;
    }
  } catch (err) { console.warn("resetFeePaid check failed", err); }
  return false;
}

// ---------- World Passport ----------
// A stamp for a capital = holding >= PASSPORT_STAMP_PCT% of that coin's
// fixed 1B supply, at the moment you check. Once earned it's recorded to
// Firestore and stays yours even if you later sell — same "permanent
// once earned" idea as a real passport stamp. The live balance check
// itself needs no Firestore (works on any deployment); only the
// permanent record and the public leaderboard need firebase-config.js
// filled in.
//
// Trust boundary, stated plainly: the frontend checks the real on-chain
// balance honestly before writing a stamp, but Firestore's own rules
// can't independently re-verify a balance (no RPC access from a security
// rule) — so today this is enforced by this code being honest, not by
// something unbreakable. That's fine while stamps are just a badge; it
// needs closing (a server-side check, or a small registry contract)
// before any real fee-eligibility or bonus reward pays out against it.
const TOTAL_SUPPLY_WEI = 1_000_000_000n * 10n ** 18n;

async function loadMyStamps(address) {
  const db = await ensureFirebase();
  if (!db || !address) return new Set();
  try {
    const snap = await db.collection("passportStamps").where("address", "==", address.toLowerCase()).get();
    return new Set(snap.docs.map((d) => d.data().iso2));
  } catch (err) { console.warn("loadMyStamps failed", err); return new Set(); }
}

async function checkMyPassport() {
  const statusEl = document.getElementById("passport-status");
  if (!state.account) {
    statusEl.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
    await connectWallet();
    if (!state.account) { statusEl.innerHTML = `<div class="status error">Connect a wallet to check your passport.</div>`; return; }
  }
  statusEl.innerHTML = `<div class="status pending">Checking your balance against every claimed capital…</div>`;
  try {
    const claimed = [...W.claims.entries()];
    const balances = await Promise.all(claimed.map(([, cl]) => withRetry(() => tokenRead(cl.entry.token).balanceOf(state.account)).catch(() => 0n)));
    const qualifies = [];
    claimed.forEach(([iso2], i) => {
      const pct = Number((balances[i] * 10000n) / TOTAL_SUPPLY_WEI) / 100;
      if (pct >= (CONFIG.PASSPORT_STAMP_PCT || 1)) qualifies.push({ iso2, pct });
    });
    const existing = await loadMyStamps(state.account);
    const fresh = qualifies.filter((q) => !existing.has(q.iso2));
    const db = await ensureFirebase();
    if (db && fresh.length) {
      await Promise.all(fresh.map((q) => db.collection("passportStamps").doc(`${state.account.toLowerCase()}_${q.iso2}`).set({
        address: state.account.toLowerCase(), iso2: q.iso2, pct: q.pct, earnedAt: Date.now(),
      }).catch((err) => console.warn("stamp write failed for", q.iso2, err))));
    } else if (!db && fresh.length) {
      statusEl.innerHTML = `<div class="status error">Found ${fresh.length} new stamp${fresh.length === 1 ? "" : "s"}, but nowhere to save them yet — firebase-config.js is empty on this deployment.</div>`;
    }
    const all = new Set([...existing, ...qualifies.map((q) => q.iso2)]);
    renderPassport(all);
    if (!statusEl.innerHTML.includes("nowhere to save")) {
      statusEl.innerHTML = all.size
        ? `<div class="status success">${all.size} stamp${all.size === 1 ? "" : "s"} — ${fresh.length ? `${fresh.length} new` : "up to date"}.</div>`
        : `<div class="status">No stamps yet — hold ${CONFIG.PASSPORT_STAMP_PCT}%+ of a claimed capital's coin and check again.</div>`;
    }
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 200)}</div>`;
  }
}

/// Read-only refresh (no Firestore writes) — used on wallet connect/
/// disconnect so the grid reflects already-earned stamps without
/// re-running the full check-and-record flow on every account change.
async function refreshPassportDisplay() {
  const grid = document.getElementById("passport-grid");
  if (!grid) return; // not on this page
  if (!state.account) { renderPassport(new Set()); document.getElementById("passport-status").innerHTML = ""; return; }
  renderPassport(await loadMyStamps(state.account));
}

function renderPassport(stampSet) {
  const grid = document.getElementById("passport-grid");
  const claimedCountries = [...W.claims.keys()].map((iso2) => W.byIso.get(iso2));
  if (!claimedCountries.length) { grid.innerHTML = `<div class="empty-state">No capitals claimed yet — nothing to stamp.</div>`; return; }
  grid.innerHTML = claimedCountries.map((c) => `
    <div class="passport-stamp ${stampSet.has(c.iso2) ? "is-earned" : ""}">
      <span class="passport-stamp-flag">${c.flag}</span>
      <span class="passport-stamp-name">${c.name}</span>
      <span class="passport-stamp-mark">${stampSet.has(c.iso2) ? "STAMPED" : "—"}</span>
    </div>`).join("");
  const count = stampSet.size;
  const bonusEl = document.getElementById("passport-bonus");
  const need = CONFIG.PASSPORT_BONUS_STAMP_COUNT || 5;
  bonusEl.textContent = count >= need
    ? `${count} stamps — eligible for the bonus-reward event once it opens.`
    : `${count} of ${need} stamps toward the bonus-reward event (event details coming — see the announcement).`;
}

// ---------- Passport leaderboard ----------
async function loadPassportLeaderboard() {
  const db = await ensureFirebase();
  if (!db) return [];
  try {
    const snap = await db.collection("passportStamps").get();
    const byAddr = new Map();
    snap.forEach((doc) => {
      const d = doc.data();
      if (!byAddr.has(d.address)) byAddr.set(d.address, []);
      byAddr.get(d.address).push(d.iso2);
    });
    return [...byAddr.entries()].map(([address, isos]) => ({ address, isos })).sort((a, b) => b.isos.length - a.isos.length);
  } catch (err) { console.warn("loadPassportLeaderboard failed", err); return []; }
}

async function openLeaderboard() {
  const modal = document.getElementById("leaderboard-modal");
  const list = document.getElementById("leaderboard-list");
  modal.style.display = "flex";
  list.innerHTML = `<div class="empty-state">Loading…</div>`;
  if (!window.FIREBASE_CONFIG) { list.innerHTML = `<div class="empty-state">The leaderboard needs firebase-config.js filled in on this deployment — the passport check itself still works.</div>`; return; }
  const rows = await loadPassportLeaderboard();
  if (!rows.length) { list.innerHTML = `<div class="empty-state">No stamps recorded yet — be the first.</div>`; return; }
  list.innerHTML = rows.map((r, i) => `
    <div class="leaderboard-row ${r.isos.length >= (CONFIG.PASSPORT_BONUS_STAMP_COUNT || 5) ? "is-bonus" : ""}">
      <span class="leaderboard-rank">#${i + 1}</span>
      <span class="leaderboard-addr">${short(r.address)}</span>
      <span class="leaderboard-flags">${r.isos.map((iso2) => W.byIso.get(iso2)?.flag || "").join(" ")}</span>
      <span class="leaderboard-count">${r.isos.length}</span>
    </div>`).join("");
}

// ---------- $NHOOD burns (read live from both deployments, not typed in) ----------
async function loadNhoodBurns() {
  const rows = [];
  for (const addr of CONFIG.NHOOD_TOKEN_ADDRESSES || []) {
    try {
      const t = tokenRead(addr);
      const fromBlock = await firstHomepadBlock();
      const evs = await withRetry(() => t.queryFilter(t.filters.Transfer(null, BURN_ADDRESS), fromBlock, "latest"));
      for (const ev of evs) rows.push({ amount: ev.args.value, txHash: ev.transactionHash, blockNumber: ev.blockNumber });
    } catch (err) { console.warn("nhood burn feed failed for", addr, err); }
  }
  const blocks = [...new Set(rows.map((r) => r.blockNumber))];
  const times = await Promise.all(blocks.map((bn) => blockTs(bn)));
  const timeByBlock = new Map(blocks.map((bn, i) => [bn, times[i]]));
  for (const r of rows) r.ts = timeByBlock.get(r.blockNumber);
  rows.sort((a, b) => a.ts - b.ts); // oldest first — "1st burn / 2nd burn / …" reads naturally
  const total = rows.reduce((s, r) => s + r.amount, 0n);
  W.nhoodBurns = { total, rows };
  return W.nhoodBurns;
}

function renderNhoodBurns() {
  const section = document.getElementById("w-nhood-burns");
  const b = W.nhoodBurns;
  if (!b || !b.rows.length) { section.style.display = "none"; return; }
  section.style.display = "";
  document.getElementById("nhood-burn-total").textContent = fmtCompact(Number(ethers.formatUnits(b.total, 18))) + " $NHOOD";
  document.getElementById("w-nhood-burn-count").textContent = `${b.rows.length} burn${b.rows.length === 1 ? "" : "s"}`;
  const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  document.getElementById("nhood-burn-list").innerHTML = b.rows.map((r, i) => `
    <div class="nhood-burn-row">
      <span class="nhood-burn-ord">${ordinal(i + 1)} burn</span>
      <span class="nhood-burn-amt">${fmtCompact(Number(ethers.formatUnits(r.amount, 18)))} $NHOOD</span>
      <a class="btn-mini" href="${CONFIG.BLOCK_EXPLORER}/tx/${r.txHash}" target="_blank" rel="noopener">tx</a>
    </div>`).join("");
}

// ---------- Recent activity feed (real Launched events, both factories) ----------
async function loadWorldFeed() {
  const norm = (s) => String(s || "").trim();
  const raw = [];
  if (hybridFactoryConfigured()) {
    try {
      const f = hybridFactoryRead();
      const fromBlock = await firstHomepadBlock();
      const evs = await withRetry(() => f.queryFilter(f.filters.Launched(), fromBlock, "latest"));
      for (const ev of evs) raw.push({ ev, name: ev.args.name, symbol: ev.args.symbol, imageUrl: ev.args.imageUrl, token: ev.args.token, creator: ev.args.creator });
    } catch (err) { console.warn("hybrid Launched feed failed", err); }
  }
  const q = quoteCfg();
  if (pairedFactoryConfigured() && q && q.address) {
    try {
      const f = pairedFactoryRead();
      const fromBlock = await firstHomepadBlock();
      const evs = await withRetry(() => f.queryFilter(f.filters.Launched(null, null, q.address), fromBlock, "latest"));
      for (const ev of evs) raw.push({ ev, name: ev.args.name, symbol: ev.args.symbol, imageUrl: ev.args.imageUrl, token: ev.args.token, creator: ev.args.creator });
    } catch (err) { console.warn("paired Launched feed failed", err); }
  }

  const matched = raw
    .map((r) => {
      const c = W.countries.find((x) => x.name === norm(r.name) && x.ticker === norm(r.symbol));
      if (!c || norm(r.imageUrl) !== worldLogoUrl(c)) return null;
      const cl = W.claims.get(c.iso2);
      const isClaim = !!(cl && cl.history[0] && cl.history[0].token.toLowerCase() === r.token.toLowerCase());
      return { c, creator: r.creator, token: r.token, txHash: r.ev.transactionHash, blockNumber: r.ev.blockNumber, kind: isClaim ? "claim" : "reset" };
    })
    .filter(Boolean);

  const blocks = [...new Set(matched.map((m) => m.blockNumber))];
  const times = await Promise.all(blocks.map((bn) => blockTs(bn)));
  const timeByBlock = new Map(blocks.map((bn, i) => [bn, times[i]]));
  for (const m of matched) m.ts = timeByBlock.get(m.blockNumber);

  matched.sort((a, b) => b.ts - a.ts);
  W.feed = matched.slice(0, 25);
  return W.feed;
}

function renderWorldFeed() {
  const list = document.getElementById("w-feed");
  const feed = W.feed || [];
  document.getElementById("w-feed-count").textContent = feed.length ? `latest ${feed.length}` : "";
  list.innerHTML = feed.map((f) => `
    <button class="world-row world-feed-row ${f.kind === "reset" ? "is-reset-event" : ""}" data-iso="${f.c.iso2}">
      <img class="world-row-logo" src="world/logos/${f.c.iso2}.svg" alt="" loading="lazy">
      <span class="world-row-main">
        <span class="world-row-name">${f.c.flag} ${nameWithMotto(f.c)} <span class="world-feed-badge ${f.kind}">${f.kind === "claim" ? "🏡 claimed" : "↻ reset"}</span></span>
        <span class="world-row-cap">$${f.c.ticker} · by <span class="mono-inline">${short(f.creator)}</span></span>
      </span>
      <span class="world-row-right">
        <span class="world-row-sub">${timeAgo(f.ts)}</span>
        <a class="btn-mini" href="${CONFIG.BLOCK_EXPLORER}/tx/${f.txHash}" target="_blank" rel="noopener" onclick="event.stopPropagation()">tx ↗</a>
      </span>
    </button>`).join("") || `<div class="empty-state">No launches yet — the first claim shows up here.</div>`;
  list.querySelectorAll(".world-feed-row").forEach((b) => b.addEventListener("click", () => openClaim(W.byIso.get(b.dataset.iso))));
}

// ---------- My Capitals (wallet-gated) ----------
function renderMyCapitals() {
  const section = document.getElementById("w-mine-section");
  if (!section) return; // not on this page
  if (!state.account) { section.style.display = "none"; return; }
  const mine = [...W.claims.entries()].filter(([, cl]) => cl.entry.creator && cl.entry.creator.toLowerCase() === state.account.toLowerCase());
  section.style.display = "";
  document.getElementById("w-mine-count").textContent = mine.length ? `${mine.length} held` : "none yet";
  const list = document.getElementById("w-mine-list");
  if (!mine.length) {
    list.innerHTML = `<div class="empty-state">You don't hold any capitals yet. Pick an open one on the map above.</div>`;
    return;
  }
  list.innerHTML = mine.map(([iso2, cl]) => {
    const c = W.byIso.get(iso2), e = cl.entry;
    const status = isResettable(e) ? `<span class="world-row-sub world-row-reset">↻ at risk — under ${fmtUsd(RESET_MCAP())}</span>` : isInGrace(e) ? `<span class="world-row-sub">🌱 ${fmtDur(GRACE() - claimAge(e))} left in grace</span>` : `<span class="world-row-sub">🔒 protected</span>`;
    return `<button class="world-row is-claimed" data-iso="${iso2}">
      <img class="world-row-logo" src="world/logos/${iso2}.svg" alt="" loading="lazy">
      <span class="world-row-main"><span class="world-row-name">${c.flag} ${nameWithMotto(c)}</span><span class="world-row-cap">$${c.ticker} · ${c.capital}</span></span>
      <span class="world-row-right"><span class="world-row-mcap">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</span>${status}</span>
    </button>`;
  }).join("");
  list.querySelectorAll(".world-row").forEach((b) => b.addEventListener("click", () => openClaim(W.byIso.get(b.dataset.iso))));
}

// ---------- Stats ----------
function renderWorldStats() {
  const $ = (id) => document.getElementById(id);
  const claimed = [...W.claims.entries()].map(([iso, c]) => [iso, c.entry]);
  $("w-claimed").textContent = String(claimed.length);
  $("w-claimed-sub").textContent = `of ${W.countries.length} capitals · ${(claimed.length / W.countries.length * 100).toFixed(1)}% settled`;
  const econ = claimed.reduce((s, [, e]) => s + (e.marketCapUsd || 0), 0);
  $("w-economy").textContent = claimed.length ? fmtUsd(econ) : "$0";
  const top = claimed.slice().sort((a, b) => (b[1].marketCapUsd || 0) - (a[1].marketCapUsd || 0))[0];
  if (top) { $("w-top").textContent = `${W.byIso.get(top[0]).flag} ${W.byIso.get(top[0]).capital}`; $("w-top-sub").textContent = `${fmtUsd(top[1].marketCapUsd || 0)} · ${W.byIso.get(top[0]).name}`; }
  else { $("w-top").textContent = "—"; $("w-top-sub").textContent = "nobody yet — the first claim tops every list"; }
  const newest = claimed.slice().sort((a, b) => b[1].launchedAt - a[1].launchedAt)[0];
  if (newest) { $("w-newest").textContent = `${W.byIso.get(newest[0]).flag} ${W.byIso.get(newest[0]).capital}`; $("w-newest-sub").textContent = timeAgo(newest[1].launchedAt); }
  else { $("w-newest").textContent = "—"; $("w-newest-sub").textContent = "be the first"; }
}

// ---------- Map ----------
const TOPO_CACHE_KEY = "homepad.world.topo.v1"; // bump the suffix if the source URL/version ever changes

async function fetchWorldTopo() {
  try {
    const cached = localStorage.getItem(TOPO_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch { /* corrupt cache or storage blocked — just refetch below */ }
  const topo = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")).json();
  try { localStorage.setItem(TOPO_CACHE_KEY, JSON.stringify(topo)); } catch { /* quota or private mode — fine, just won't cache */ }
  return topo;
}

async function renderWorldMap() {
  const host = document.getElementById("world-map");
  let topo;
  try {
    topo = await fetchWorldTopo();
  } catch (err) {
    host.innerHTML = `<div class="empty-state">Couldn't load the map data. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
    return;
  }
  const land = topojson.feature(topo, topo.objects.countries);
  const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);

  const width = 1000, height = 540;
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "world-svg");
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "w-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", 2.2).attr("result", "b");
  const m = glow.append("feMerge"); m.append("feMergeNode").attr("in", "b"); m.append("feMergeNode").attr("in", "SourceGraphic");
  // "Claimed and past the reset window" fill — the exact lime from the
  // brand mark supplied for this (#CCFF00), not the site's general green,
  // so a secured claim reads as a distinct, deliberate accent on the map.
  const grad = defs.append("linearGradient").attr("id", "w-claimed-fill").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
  grad.append("stop").attr("offset", "0%").attr("stop-color", "#ccff00").attr("stop-opacity", .82);
  grad.append("stop").attr("offset", "100%").attr("stop-color", "#8fb300").attr("stop-opacity", .82);
  const gemGrad = defs.append("radialGradient").attr("id", "w-gem-fill").attr("cx", "35%").attr("cy", "30%").attr("r", "75%");
  gemGrad.append("stop").attr("offset", "0%").attr("stop-color", "#f2ffb0");
  gemGrad.append("stop").attr("offset", "45%").attr("stop-color", "#ccff00");
  gemGrad.append("stop").attr("offset", "100%").attr("stop-color", "#7a9900");
  const ocean = defs.append("radialGradient").attr("id", "w-ocean").attr("cx", "50%").attr("cy", "45%").attr("r", "70%");
  ocean.append("stop").attr("offset", "0%").attr("stop-color", "#0b1712");
  ocean.append("stop").attr("offset", "100%").attr("stop-color", "#05090a");

  const g = svg.append("g");
  const proj = d3.geoNaturalEarth1().fitSize([width, height], { type: "Sphere" });
  const path = d3.geoPath(proj);

  g.append("path").datum({ type: "Sphere" }).attr("class", "w-sphere").attr("d", path).attr("fill", "url(#w-ocean)");
  g.append("path").datum(d3.geoGraticule10()).attr("class", "w-graticule").attr("d", path);
  g.append("g").selectAll("path").data(land.features).join("path")
    .attr("class", (f) => landClass(f))
    .attr("d", path)
    .on("click", (ev, f) => { const c = W.byNum.get(String(f.id).padStart(3, "0")); if (c) openClaim(c); });
  g.append("path").datum(borders).attr("class", "w-borders").attr("d", path);

  // Country names: labeled at their centroid, only for unclaimed countries
  // (claimed ones already have a name+mcap chip on their capital, so a
  // second label would just duplicate it). Bigger countries earn a label
  // at a lower zoom; small ones only once zoomed in enough to have room —
  // area-tiered minZoom is what keeps this from turning into label soup
  // at the default view instead of a flat always-on/always-off toggle.
  const countryLabels = land.features
    .map((f) => {
      const c = W.byNum.get(String(f.id).padStart(3, "0"));
      if (!c) return null;
      const area = Math.abs(path.area(f));
      if (area < 3) return null; // slivers too small to ever sensibly label
      const centroid = path.centroid(f);
      if (!Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1])) return null;
      const minZoom = area > 600 ? 1 : area > 150 ? 1.8 : area > 40 ? 2.8 : 4.2;
      return { c, centroid, minZoom };
    })
    .filter(Boolean);
  const labelG = g.append("g").attr("class", "w-country-labels");
  const labels = labelG.selectAll("text").data(countryLabels).join("text")
    .attr("class", "w-country-label")
    .attr("x", (d) => d.centroid[0]).attr("y", (d) => d.centroid[1])
    .text((d) => d.c.name);
  W.countryLabelData = countryLabels;

  // capitals: open = small ring; claimed = glowing pin + label chip
  const caps = g.append("g").attr("class", "w-caps").selectAll("g").data(W.countries).join("g")
    .attr("class", (c) => capClass(c))
    .attr("transform", (c) => { const [x, y] = proj(c.lnglat); return `translate(${x},${y})`; })
    .on("click", (ev, c) => { ev.stopPropagation(); openClaim(c); });
  caps.append("ellipse").attr("class", "w-shadow").attr("rx", 3.2).attr("ry", 1.1).attr("cy", 3.6);
  caps.append("circle").attr("class", "w-halo").attr("r", 9);
  // Open capital: a plain, understated ring — available, nothing claimed.
  caps.append("circle").attr("class", "w-ring").attr("r", 3.4);
  // Claimed capital: a small faceted gem on a short pin, standing above the
  // shadow — the "premium" marker asked for, in place of a flat dot.
  const gem = caps.append("g").attr("class", "w-gem");
  gem.append("line").attr("class", "w-pin").attr("x1", 0).attr("y1", -1).attr("x2", 0).attr("y2", 3.4);
  gem.append("path").attr("class", "w-gem-body").attr("d", "M0,-6.2 L4.4,-1.4 L0,3.2 L-4.4,-1.4 Z");
  gem.append("path").attr("class", "w-gem-facet").attr("d", "M0,-6.2 L4.4,-1.4 L0,-1.4 Z");
  gem.append("path").attr("class", "w-gem-shine").attr("d", "M-2.6,-3.4 L-0.6,-4.9 L-1.6,-2.2 Z");
  caps.append("title").text((c) => `${c.capital} · ${c.name}`);
  const chip = caps.append("g").attr("class", "w-chip").attr("transform", "translate(0,-16)");
  chip.append("rect").attr("rx", 6).attr("ry", 6).attr("height", 16).attr("y", -12);
  chip.append("text").attr("class", "w-chip-text").attr("y", 0).attr("text-anchor", "middle");
  sizeChips(g);


  const zoom = d3.zoom().scaleExtent([1, 9]).on("zoom", (ev) => {
    g.attr("transform", ev.transform);
    const k = ev.transform.k;
    g.selectAll(".w-ring").attr("r", 3.4 / Math.sqrt(k));
    g.selectAll(".w-halo").attr("r", 9 / Math.sqrt(k));
    g.selectAll(".w-gem,.w-shadow").attr("transform", `scale(${1 / Math.sqrt(k)})`);
    g.selectAll(".w-chip").attr("transform", `translate(0,${-16 / Math.sqrt(k)}) scale(${1 / Math.sqrt(k)})`);
    g.selectAll(".w-borders").attr("stroke-width", .6 / k);
    // Country names: font shrinks with zoom (so they don't balloon at high
    // k) but never below a floor, and each only turns on past its own
    // area-based threshold — set once at load, checked here every zoom tick.
    g.selectAll(".w-country-label")
      .style("display", (d) => (k >= d.minZoom ? "" : "none"))
      .attr("font-size", () => Math.max(7, 12 / Math.sqrt(k)));
  });
  svg.call(zoom);

  // Open somewhere with real cities to claim, at a scale where a capital is
  // more than a speck — the whole globe at once made every marker tiny.
  // Zoom/pan are already implemented, so this is just a starting transform.
  const usdc = W.byIso.get("US");
  if (usdc) {
    const [px, py] = proj(usdc.lnglat);
    const k = 3.2;
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - px * k, height / 2 - py * k).scale(k));
  }

  W.map = { svg, g, proj, zoom };
}
function landClass(f) {
  const c = W.byNum.get(String(f.id).padStart(3, "0"));
  if (!c) return "w-land is-none";
  const cl = W.claims.get(c.iso2);
  if (!cl) return "w-land is-open";
  // Only two claimed states now (no time window): protected (strong lime
  // fill) or resettable (a red tint, matching the marker's warning color).
  return "w-land is-claimed " + (isProtected(cl.entry) ? "is-strong" : "is-resettable");
}
function capClass(c) {
  const cl = W.claims.get(c.iso2);
  return "w-cap" + (cl ? " is-claimed" + (isResettable(cl.entry) ? " is-resettable" : "") : "");
}
function chipText(c) {
  const cl = W.claims.get(c.iso2); if (!cl) return "";
  const e = cl.entry;
  const motto = mottoFor(c.iso2);
  return `${c.flag} ${c.capital}${motto ? " 『" + motto + "』" : ""}${e.marketCapUsd != null ? " · " + fmtUsd(e.marketCapUsd) : ""}`;
}
function sizeChips(g) {
  g.selectAll(".w-cap").each(function (c) {
    const sel = d3.select(this);
    const txt = chipText(c);
    sel.select(".w-chip-text").text(txt);
    const w = txt ? Math.min(140, txt.length * 5.6 + 14) : 0;
    sel.select(".w-chip rect").attr("width", w).attr("x", -w / 2);
  });
}

// ---------- List ----------
function renderWorldList() {
  const list = document.getElementById("w-list");
  const q = W.query.toLowerCase();
  const rows = W.countries.filter((c) => {
    const claimed = W.claims.has(c.iso2);
    if (W.filter === "claimed" && !claimed) return false;
    if (W.filter === "open" && claimed) return false;
    if (W.filter === "resettable" && !(claimed && isResettable(W.claims.get(c.iso2).entry))) return false;
    if (q && !(`${c.name} ${c.nameKo} ${c.capital} ${c.iso2} ${c.iso3}`.toLowerCase().includes(q))) return false;
    return true;
  });
  rows.sort((a, b) => {
    const ea = W.claims.get(a.iso2)?.entry, eb = W.claims.get(b.iso2)?.entry;
    if (ea && !eb) return -1; if (!ea && eb) return 1;
    if (ea && eb) return (eb.marketCapUsd || 0) - (ea.marketCapUsd || 0);
    return a.name.localeCompare(b.name);
  });
  document.getElementById("w-list-count").textContent = `${rows.length} shown`;
  list.innerHTML = rows.map((c) => {
    const cl = W.claims.get(c.iso2); const e = cl && cl.entry;
    let right;
    if (!e) right = `<span class="world-row-open">open</span>`;
    else if (isProtected(e)) right = isInGrace(e)
      ? `<span class="world-row-mcap">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</span><span class="world-row-sub">🌱 just claimed · ${fmtDur(GRACE() - claimAge(e))}</span>`
      : `<span class="world-row-mcap">${fmtUsd(e.marketCapUsd)}</span><span class="world-row-sub">🔒 protected · ${timeAgo(e.launchedAt)}</span>`;
    else right = `<span class="world-row-mcap">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</span><span class="world-row-sub world-row-reset">↻ resettable</span>`;
    return `<button class="world-row ${e ? "is-claimed" : ""} ${e && isResettable(e) ? "is-resettable" : ""}" data-iso="${c.iso2}">
      <img class="world-row-logo" src="world/logos/${c.iso2}.svg" alt="" loading="lazy">
      <span class="world-row-main"><span class="world-row-name">${c.flag} ${nameWithMotto(c)}</span><span class="world-row-cap">$${c.ticker} · ${c.capital}${cl && cl.resets ? ` · reset ×${cl.resets}` : ""}</span></span>
      <span class="world-row-right">${right}</span>
    </button>`;
  }).join("") || `<div class="empty-state">Nothing matches.</div>`;
  list.querySelectorAll(".world-row").forEach((b) => b.addEventListener("click", () => openClaim(W.byIso.get(b.dataset.iso))));
}

// ---------- Claim modal ----------
/// Smoothly pans/zooms the map to center on a country's capital — used by
/// search (unique match, or Enter) so the search bar doubles as "go to".
function flyToCountry(c) {
  if (!W.map || !c) return;
  const { svg, proj, zoom } = W.map;
  const [px, py] = proj(c.lnglat);
  const width = 1000, height = 540;
  const k = 3.5;
  svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate(width / 2 - px * k, height / 2 - py * k).scale(k));
}

function openClaim(c) {
  const modal = document.getElementById("claim-modal");
  const $ = (id) => document.getElementById(id);
  $("claim-logo").src = `world/logos/${c.iso2}.svg`;
  $("claim-flag").textContent = c.flag;
  $("claim-title").textContent = c.capital;
  $("claim-sub").innerHTML = `${nameWithMotto(c)}${c.nameKo ? " · " + c.nameKo : ""} · ${c.region}`;
  $("claim-status").innerHTML = "";
  const cl = W.claims.get(c.iso2);
  const q = quoteCfg();
  const live = typeof pairedFactoryConfigured === "function" && pairedFactoryConfigured() && q && q.address;

  if (cl) {
    const e = cl.entry;
    const prot = isProtected(e), reset = isResettable(e);
    const stateLabel = reset ? `↻ Resettable — under ${fmtUsd(RESET_MCAP())} right now`
      : isInGrace(e) ? `🌱 Just claimed — resettable in ${fmtDur(GRACE() - claimAge(e))} if still under ${fmtUsd(RESET_MCAP())}`
      : `🔒 Protected — at or above ${fmtUsd(RESET_MCAP())}`;
    $("claim-body").innerHTML = `
      <div class="claim-grid">
        <div class="stat-card"><div class="stat-label">Market cap</div><div class="stat-value">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</div><div class="stat-sub">${stateLabel}</div></div>
        <div class="stat-card"><div class="stat-label">Claimed</div><div class="stat-value" style="font-size:.95rem">${timeAgo(e.launchedAt)}</div><div class="stat-sub">by <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/address/${e.creator}" target="_blank">${short(e.creator)}</a>${cl.resets ? ` · reset ×${cl.resets}` : ""}</div></div>
      </div>
      <div class="claim-actions">
        <a class="btn btn-primary" href="explore.html#/token/${e.token}">Trade $${c.ticker} →</a>
        <a class="btn" href="${CONFIG.BLOCK_EXPLORER}/token/${e.token}" target="_blank" rel="noopener">explorer ↗</a>
      </div>
      ${reset && live ? `
      <div class="claim-reset">
        <div class="claim-reset-head">Reset this capital</div>
        <p class="hint">${c.capital}'s current coin is under ${fmtUsd(RESET_MCAP())} market cap right now. Pay <b>${Number(CONFIG.WORLD_RESET_FEE_HOMEPAD).toLocaleString()} $${q.symbol}</b> (to the $HOME treasury) and ${c.capital} launches again — with you as the creator. The old coin keeps trading; the map moves to the new one.</p>
        <label class="claim-devbuy">Dev buy ($${q.symbol}) <span class="optional">optional</span><input id="claim-devbuy" type="number" min="0" step="1" placeholder="0"></label>
        <div class="claim-actions"><button class="btn btn-primary" id="claim-go">Pay ${Number(CONFIG.WORLD_RESET_FEE_HOMEPAD).toLocaleString()} $${q.symbol} & reset ${c.capital}</button></div>
      </div>` : ""}
      ${state.account && e.creator && e.creator.toLowerCase() === state.account.toLowerCase() ? `
      <div class="claim-motto">
        <div class="claim-motto-head">🔥 Inscribe a motto</div>
        <p class="hint">Burn ${Number(CONFIG.NHOOD_MOTTO_BURN_AMOUNT).toLocaleString()} $NHOOD (either deployment) to set the short line shown next to ${c.capital}'s flag${mottoFor(c.iso2) ? ` — currently 『${escapeHtml(mottoFor(c.iso2))}』` : ""}. Doesn't touch the coin's name or ticker.</p>
        <input id="motto-text" maxlength="40" placeholder="e.g. Home of $HOME" value="${escapeHtml(mottoFor(c.iso2) || "")}">
        <div class="claim-motto-row">
          <select id="motto-token">
            <option value="${CONFIG.NHOOD_TOKEN_ADDRESSES[0]}">$NHOOD (Pons)</option>
            <option value="${CONFIG.NHOOD_TOKEN_ADDRESSES[1]}">$NHOOD (Pairex)</option>
          </select>
          <button class="btn btn-primary" id="motto-go">Burn & inscribe</button>
        </div>
        <div id="motto-status"></div>
      </div>` : ""}`;
    if (reset && live) $("claim-go").addEventListener("click", () => submitClaim(c, { reset: true }));
    const mottoBtn = $("motto-go");
    if (mottoBtn) mottoBtn.addEventListener("click", () => submitMotto(c, $("motto-text").value));
  } else {
    $("claim-body").innerHTML = `
      <div class="claim-terms">
        <div class="claim-term"><span class="dt">Name</span><span class="dd">${c.name}</span></div>
        <div class="claim-term"><span class="dt">Ticker</span><span class="dd">$${c.ticker}</span></div>
        <div class="claim-term"><span class="dt">Logo</span><span class="dd">the outline above — fixed</span></div>
        <div class="claim-term"><span class="dt">Paired with</span><span class="dd">$${q ? q.symbol : "HOMEPAD"} · real v4 pool from block one</span></div>
        <div class="claim-term"><span class="dt">Rent</span><span class="dd">1% per trade → 70% to you, 30% to $HOME</span></div>
        <div class="claim-term"><span class="dt">Keep it</span><span class="dd">stay at or above ${fmtUsd(RESET_MCAP())} market cap — below that, anyone can reset it for ${Number(CONFIG.WORLD_RESET_FEE_HOMEPAD).toLocaleString()} $${q ? q.symbol : "HOMEPAD"}, any time</span></div>
      </div>
      <label class="claim-devbuy">Dev buy ($${q ? q.symbol : "HOMEPAD"}) <span class="optional">optional</span>
        <input id="claim-devbuy" type="number" min="0" step="1" placeholder="0">
      </label>
      <div class="claim-actions">
        <button class="btn btn-primary" id="claim-go" ${live ? "" : "disabled"}>${live ? `Claim ${c.capital}` : "Launchpad offline"}</button>
      </div>
      <p class="hint">Name, ticker and logo can't be edited — that's what makes the claim provable. Signed by your wallet; you're the creator on-chain. No $${q ? q.symbol : "HOMEPAD"} is needed to launch (only for the optional dev buy).</p>`;
    $("claim-go").addEventListener("click", () => submitClaim(c, { reset: false }));
  }
  modal.style.display = "flex";
}
function closeClaim() { document.getElementById("claim-modal").style.display = "none"; }

async function submitClaim(c, opts) {
  const reset = !!(opts && opts.reset);
  const status = document.getElementById("claim-status");
  const btn = document.getElementById("claim-go");
  const q = quoteCfg();
  try {
    if (!state.signer && !state.account) {
      status.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
      await connectWallet();
      if (!state.account) { status.innerHTML = `<div class="status error">Connect a wallet to claim.</div>`; return; }
    }
    btn.disabled = true;
    // Re-check on chain right before sending: someone may have claimed /
    // reset it while this modal was open.
    await loadWorldClaims();
    const cl = W.claims.get(c.iso2);
    if (!reset && cl) { status.innerHTML = `<div class="status error">${c.capital} was just claimed by someone else.</div>`; btn.disabled = false; renderAll(); return; }
    if (reset && !(cl && isResettable(cl.entry))) { status.innerHTML = `<div class="status error">${c.capital} is protected now (at or above ${fmtUsd(RESET_MCAP())}) — it can't be reset.</div>`; btn.disabled = false; renderAll(); return; }

    const devStr = (document.getElementById("claim-devbuy").value || "").trim();
    const devBuy = devStr && Number(devStr) > 0 ? ethers.parseUnits(devStr, q.decimals) : 0n;
    const tok = tokenRead(q.address);

    if (reset) {
      const bal = await tok.balanceOf(state.account);
      if (bal < RESET_FEE() + devBuy) { status.innerHTML = `<div class="status error">You need ${Number(CONFIG.WORLD_RESET_FEE_HOMEPAD).toLocaleString()} $${q.symbol} for the reset fee${devBuy > 0n ? " plus the dev buy" : ""}. You have ${fmtCompact(Number(ethers.formatUnits(bal, q.decimals)))}.</div>`; btn.disabled = false; return; }
      status.innerHTML = `<div class="status pending">1/2 — Confirm the ${Number(CONFIG.WORLD_RESET_FEE_HOMEPAD).toLocaleString()} $${q.symbol} reset fee in your wallet…</div>`;
      const feeTx = await sendTokenTransfer(q.address, CONFIG.HOME_TREASURY_ADDRESS, RESET_FEE());
      status.innerHTML = `<div class="status pending">Fee sent · <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${feeTx.hash}" target="_blank">tx ↗</a> — waiting…</div>`;
      await feeTx.wait();
    }

    if (devBuy > 0n) {
      const allowance = await tok.allowance(state.account, CONFIG.PAIRED_FACTORY_ADDRESS);
      if (allowance < devBuy) {
        status.innerHTML = `<div class="status pending">Approve $${q.symbol} for the dev buy…</div>`;
        const a = await tokenWrite(q.address).approve(CONFIG.PAIRED_FACTORY_ADDRESS, devBuy);
        await a.wait();
      }
    }

    // Starting price: match Hybrid's current starting valuation in $HOMEPAD.
    let virtualStr = q.defaultVirtualQuote;
    try { virtualStr = await computeQuoteEquivalentStartPrice(q); } catch (err) { console.warn("using static start price", err && err.message); }
    const initialVirtualQuote = ethers.parseUnits(String(virtualStr), q.decimals);
    const meta = { imageUrl: worldLogoUrl(c), description: worldDescription(c), twitter: "", telegram: "", discord: "", website: "" };
    const functionName = devBuy > 0n ? "launchAndBuy" : "launch";
    const args = devBuy > 0n
      ? [c.name, c.ticker, q.address, initialVirtualQuote, 0, meta, devBuy]
      : [c.name, c.ticker, q.address, initialVirtualQuote, 0, meta];

    status.innerHTML = `<div class="status pending">${reset ? "2/2 — " : ""}Confirm the claim in your wallet…</div>`;
    let tx = typeof tryWagmiWrite === "function"
      ? await tryWagmiWrite({ address: CONFIG.PAIRED_FACTORY_ADDRESS, abi: PAIRED_FACTORY_ABI, functionName, args, value: 0n })
      : null;
    if (!tx) {
      if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
      const overrides = await getTxOverrides(6_000_000n);
      tx = await pairedFactoryWrite()[functionName](...args, overrides);
    }
    status.innerHTML = `<div class="status pending">Claiming ${c.capital}… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    await loadWorldClaims();
    const e = W.claims.get(c.iso2)?.entry;
    recordClaimInFirebase(c, e, receipt, reset).catch(() => {});
    const shareText = reset
      ? `🏡 I just took ${c.capital} on HOMEPAD's World map.\n\n$${c.ticker} — one coin per capital, verified on-chain.`
      : `🏡 I just claimed ${c.capital} on HOMEPAD's World map.\n\n$${c.ticker} — one coin per capital, verified on-chain.`;
    const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent("https://homepad.fun/world")}`;
    status.innerHTML = `<div class="status success">🏡 ${c.capital} is yours.</div>
      <div class="claim-actions" style="margin-top:10px">
        <a class="btn btn-primary" href="explore.html#/token/${e ? e.token : ""}">Open $${c.ticker} →</a>
        <a class="btn" href="${shareUrl}" target="_blank" rel="noopener">Share on X</a>
      </div>`;
    renderAll();
    loadWorldFeed().then(renderWorldFeed).catch((err) => console.error("feed refresh failed", err));
  } catch (err) {
    console.error(err);
    btn && (btn.disabled = false);
    status.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 220)}</div>`;
  }
}

/// ERC-20 transfer through the same write path launches use.
async function sendTokenTransfer(token, to, amount) {
  let tx = typeof tryWagmiWrite === "function"
    ? await tryWagmiWrite({ address: token, abi: ERC20_ABI, functionName: "transfer", args: [to, amount], value: 0n })
    : null;
  if (!tx) {
    if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
    tx = await tokenWrite(token).transfer(to, amount);
  }
  return tx;
}

// ---------- Firebase (optional) ----------
async function ensureFirebase() {
  if (!window.FIREBASE_CONFIG) return null;
  if (!window.firebase) {
    await Promise.all([
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
    ].map((src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); })));
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  return firebase.firestore();
}

async function recordClaimInFirebase(c, e, receipt, reset) {
  const db = await ensureFirebase();
  if (!db || !e) return;
  const doc = {
    iso2: c.iso2, name: c.name, capital: c.capital, ticker: c.ticker,
    token: e.token, creator: e.creator, txHash: receipt.hash, launchedAt: e.launchedAt,
    reset: !!reset, recordedAt: Date.now(),
  };
  await db.collection("claims").doc(c.iso2).set(doc, { merge: false }).catch(() => db.collection("claims").doc(`${c.iso2}-${Date.now()}`).set(doc));
}

// ---------- $NHOOD mottos ----------
// A short inscription next to a capital's flag, unlocked by burning NHOOD.
// The burn is real and checked on-chain at submit time; the motto TEXT is
// read straight from Firestore after that (not re-verified per read — the
// same trust boundary the reset mcap check already has, see README).
W.mottos = new Map(); // iso2 -> { text, owner }

async function loadMottos() {
  const db = await ensureFirebase();
  if (!db) { W.mottos = new Map(); return; }
  try {
    const snap = await db.collection("mottos").get();
    const m = new Map();
    snap.forEach((doc) => { const d = doc.data(); if (d && d.text) m.set(doc.id, d); });
    W.mottos = m;
  } catch (err) { console.warn("loadMottos failed", err); }
}

function mottoFor(iso2) { const m = W.mottos.get(iso2); return m ? m.text : null; }

// Motto text is arbitrary user input stored in Firestore and interpolated
// into innerHTML in several places (list rows, the claim modal, the
// motto input's own value attribute) — escaped everywhere it lands, since
// none of that trusts Firestore content as safe markup.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/// Country name + motto, e.g. South Korea『Home of $HOME』 — used
/// everywhere a country name is shown, so setting one shows up map-wide.
function nameWithMotto(c) {
  const m = mottoFor(c.iso2);
  return m ? `${c.name}<span class="motto-tag">『${escapeHtml(m)}』</span>` : c.name;
}

/// Verifies a >= NHOOD_MOTTO_BURN_AMOUNT burn (Transfer to the dead
/// address) from `who`, on either $NHOOD deployment, with a block
/// timestamp at/after `sinceTs`. Same pattern as the World reset fee.
async function nhoodBurnPaid(who, sinceTs) {
  const need = ethers.parseUnits(String(CONFIG.NHOOD_MOTTO_BURN_AMOUNT || "10000"), 18);
  for (const addr of CONFIG.NHOOD_TOKEN_ADDRESSES || []) {
    try {
      const t = tokenRead(addr);
      const fromBlock = await firstHomepadBlock();
      const evs = await withRetry(() => t.queryFilter(t.filters.Transfer(who, BURN_ADDRESS), fromBlock, "latest"));
      for (const ev of evs) {
        if (ev.args.value < need) continue;
        const ts = await blockTs(ev.blockNumber);
        if (ts >= sinceTs) return { ok: true, txHash: ev.transactionHash, tokenAddress: addr };
      }
    } catch (err) { console.warn("nhood burn check failed for", addr, err); }
  }
  return { ok: false };
}

async function submitMotto(c, text) {
  const statusEl = document.getElementById("motto-status");
  text = text.trim().slice(0, 40);
  if (!text) { statusEl.innerHTML = `<div class="status error">Type something first.</div>`; return; }
  if (!window.FIREBASE_CONFIG) { statusEl.innerHTML = `<div class="status error">Mottos aren't set up yet on this deployment (firebase-config.js is empty) — the burn works, but there's nowhere to save the text.</div>`; return; }
  const tokenAddr = document.getElementById("motto-token").value;
  try {
    statusEl.innerHTML = `<div class="status pending">Confirm the ${Number(CONFIG.NHOOD_MOTTO_BURN_AMOUNT).toLocaleString()} $NHOOD burn in your wallet…</div>`;
    const since = nowSec();
    const burnTx = await sendTokenTransfer(tokenAddr, BURN_ADDRESS, ethers.parseUnits(String(CONFIG.NHOOD_MOTTO_BURN_AMOUNT || "10000"), 18));
    statusEl.innerHTML = `<div class="status pending">Burning… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${burnTx.hash}" target="_blank">tx ↗</a></div>`;
    await burnTx.wait();
    const db = await ensureFirebase();
    await db.collection("mottos").doc(c.iso2).set({
      text, owner: state.account, txHash: burnTx.hash, tokenAddress: tokenAddr, iso2: c.iso2, setAt: Date.now(),
    });
    W.mottos.set(c.iso2, { text, owner: state.account });
    statusEl.innerHTML = `<div class="status success">🏡 Inscribed. <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${burnTx.hash}" target="_blank">tx ↗</a></div>`;
    renderAll();
    openClaim(c); // refresh the modal so the new motto shows immediately
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 200)}</div>`;
  }
}

// ---------- Boot ----------
function renderAll() {
  renderWorldStats();
  renderWorldList();
  renderMyCapitals();
  if (W.map) {
    W.map.g.selectAll(".w-land").attr("class", function () { return landClass(d3.select(this).datum()); });
    W.map.g.selectAll(".w-cap").attr("class", (c) => capClass(c));
    sizeChips(W.map.g);
    // Claimed countries carry their own name+mcap chip on the capital —
    // hide the plain centroid label so a claim doesn't show its name twice.
    W.map.g.selectAll(".w-country-label").style("visibility", (d) => (W.claims.has(d.c.iso2) ? "hidden" : ""));
  }
}

(async () => {
  document.getElementById("nhood-buy-link").href = CONFIG.NHOOD_PAIREX_BUY_URL;
  document.getElementById("passport-check-btn").addEventListener("click", checkMyPassport);
  document.getElementById("leaderboard-btn").addEventListener("click", openLeaderboard);
  document.getElementById("leaderboard-close").addEventListener("click", () => { document.getElementById("leaderboard-modal").style.display = "none"; });
  document.getElementById("leaderboard-modal").addEventListener("click", (e) => { if (e.target.id === "leaderboard-modal") e.currentTarget.style.display = "none"; });
  document.getElementById("claim-close").addEventListener("click", closeClaim);
  document.getElementById("claim-modal").addEventListener("click", (e) => { if (e.target.id === "claim-modal") closeClaim(); });

  // Tutorial modal
  const helpModal = document.getElementById("help-modal");
  const openHelp = () => { helpModal.style.display = "flex"; };
  const closeHelp = () => { helpModal.style.display = "none"; };
  document.getElementById("world-help-btn").addEventListener("click", openHelp);
  document.getElementById("help-close").addEventListener("click", closeHelp);
  helpModal.addEventListener("click", (e) => { if (e.target.id === "help-modal") closeHelp(); });
  document.getElementById("help-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip"); if (!chip) return;
    document.querySelectorAll("#help-tabs .filter-chip").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active");
    document.getElementById("help-summary").style.display = chip.dataset.tab === "summary" ? "" : "none";
    document.getElementById("help-full").style.display = chip.dataset.tab === "full" ? "" : "none";
    document.querySelector(".help-card").scrollTop = 0;
  });
  const searchInput = document.getElementById("w-search");
  searchInput.addEventListener("input", (e) => {
    W.query = e.target.value;
    renderWorldList();
    // A search that narrows to exactly one country flies the map there —
    // typing "France" should feel like using the map, not just the list.
    const q = W.query.trim().toLowerCase();
    if (q.length < 2) return;
    const matches = W.countries.filter((c) => `${c.name} ${c.nameKo} ${c.capital} ${c.iso2} ${c.iso3}`.toLowerCase().includes(q));
    if (matches.length === 1) flyToCountry(matches[0]);
  });
  searchInput.addEventListener("keydown", (e) => {
    // Enter jumps to the top match even with several results still showing.
    if (e.key !== "Enter") return;
    const q = W.query.trim().toLowerCase();
    if (!q) return;
    const rows = document.querySelectorAll("#w-list .world-row");
    if (rows.length) flyToCountry(W.byIso.get(rows[0].dataset.iso));
  });
  document.getElementById("w-filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip"); if (!chip) return;
    document.querySelectorAll("#w-filters .filter-chip").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active"); W.filter = chip.dataset.f; renderWorldList();
  });
  renderWorldList();
  const dataLoad = (async () => { try { await Promise.all([loadWorldClaims(), loadMottos()]); } catch (err) { console.error("claims/mottos failed", err); } })();
  // Map geometry (an external ~150KB fetch, cached after the first visit)
  // and the claims/mottos RPC calls have no dependency on each other until
  // the coloring pass right after — run them at the same time instead of
  // one after the other, which is most of what "Drawing the map…" sat
  // through before.
  await Promise.all([renderWorldMap(), dataLoad]);
  renderAll();
  loadWorldFeed().then(renderWorldFeed).catch((err) => console.error("feed failed", err)); // needs W.claims, not the map — doesn't need to block anything further
  loadNhoodBurns().then(renderNhoodBurns).catch((err) => console.error("nhood burns failed", err));
  refreshPassportDisplay().catch((err) => console.error("passport display failed", err));
  // keep the "left to reach" countdowns and My Capitals status honest without refetching
  setInterval(() => { renderWorldList(); renderMyCapitals(); }, 30000);
})();
