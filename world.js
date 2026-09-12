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
async function renderWorldMap() {
  const host = document.getElementById("world-map");
  let topo;
  try {
    topo = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")).json();
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
  return `${c.flag} ${c.capital}${e.marketCapUsd != null ? " · " + fmtUsd(e.marketCapUsd) : ""}`;
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
      <span class="world-row-main"><span class="world-row-name">${c.flag} ${c.name}</span><span class="world-row-cap">$${c.ticker} · ${c.capital}${cl && cl.resets ? ` · reset ×${cl.resets}` : ""}</span></span>
      <span class="world-row-right">${right}</span>
    </button>`;
  }).join("") || `<div class="empty-state">Nothing matches.</div>`;
  list.querySelectorAll(".world-row").forEach((b) => b.addEventListener("click", () => openClaim(W.byIso.get(b.dataset.iso))));
}

// ---------- Claim modal ----------
function openClaim(c) {
  const modal = document.getElementById("claim-modal");
  const $ = (id) => document.getElementById(id);
  $("claim-logo").src = `world/logos/${c.iso2}.svg`;
  $("claim-flag").textContent = c.flag;
  $("claim-title").textContent = c.capital;
  $("claim-sub").textContent = `${c.name}${c.nameKo ? " · " + c.nameKo : ""} · ${c.region}`;
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
      </div>` : ""}`;
    if (reset && live) $("claim-go").addEventListener("click", () => submitClaim(c, { reset: true }));
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
    status.innerHTML = `<div class="status success">🏡 ${c.capital} is yours. <a href="explore.html#/token/${e ? e.token : ""}">Open $${c.ticker} →</a></div>`;
    renderAll();
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

// ---------- Firebase (optional, write-only record) ----------
async function recordClaimInFirebase(c, e, receipt, reset) {
  if (!window.FIREBASE_CONFIG || !e) return;
  if (!window.firebase) {
    await Promise.all([
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
    ].map((src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); })));
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  const doc = {
    iso2: c.iso2, name: c.name, capital: c.capital, ticker: c.ticker,
    token: e.token, creator: e.creator, txHash: receipt.hash, launchedAt: e.launchedAt,
    reset: !!reset, recordedAt: Date.now(),
  };
  const db = firebase.firestore();
  await db.collection("claims").doc(c.iso2).set(doc, { merge: false }).catch(() => db.collection("claims").doc(`${c.iso2}-${Date.now()}`).set(doc));
}

// ---------- Boot ----------
function renderAll() {
  renderWorldStats();
  renderWorldList();
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
  document.getElementById("claim-close").addEventListener("click", closeClaim);
  document.getElementById("claim-modal").addEventListener("click", (e) => { if (e.target.id === "claim-modal") closeClaim(); });
  document.getElementById("w-search").addEventListener("input", (e) => { W.query = e.target.value; renderWorldList(); });
  document.getElementById("w-filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip"); if (!chip) return;
    document.querySelectorAll("#w-filters .filter-chip").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active"); W.filter = chip.dataset.f; renderWorldList();
  });
  renderWorldList();
  try { await loadWorldClaims(); } catch (err) { console.error("claims failed", err); }
  await renderWorldMap();
  renderAll();
  // keep the "left to reach" countdowns honest without refetching
  setInterval(renderWorldList, 30000);
})();
