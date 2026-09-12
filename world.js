// world.js — the World map: one coin per capital, claimed by launching on
// HOMEPAD's Hybrid factory with name/ticker/logo fixed by the map.
//
// Source of truth is the chain, not a database: a capital is "claimed" iff a
// Hybrid launch exists whose name === country name, symbol === capital ticker,
// and imageUrl === that country's canonical logo URL. First such launch (by
// launch time) wins. Firebase, when configured (firebase-config.js), only
// records claims as they happen for future features (wallet login, votes) —
// the map never trusts it over the factory.

const WORLD_LOGO_BASE = "https://homepad.fun/world/logos/";
const worldLogoUrl = (c) => `${WORLD_LOGO_BASE}${c.iso2}.svg`;
const worldDescription = (c) => `HOMETOWN · ${c.name} (${c.iso2}) · capital: ${c.capital}. One coin per capital on the HOMEPAD World map.`;

const W = {
  countries: WORLD_COUNTRIES,
  byIso: new Map(WORLD_COUNTRIES.map((c) => [c.iso2, c])),
  byNum: new Map(WORLD_COUNTRIES.map((c) => [c.ccn3, c])),
  claims: new Map(),   // iso2 -> launch entry
  filter: "all",
  query: "",
  map: null,
};

// ---------- Claims (chain-derived) ----------
async function loadWorldClaims() {
  const entries = await fetchAllLaunches({ skipHistory: true, skipHomeCard: true });
  const claims = new Map();
  const norm = (s) => String(s || "").trim();
  const sorted = entries.filter((e) => e.type === "hybrid").sort((a, b) => a.launchedAt - b.launchedAt);
  for (const e of sorted) {
    const c = W.countries.find((x) => x.name === norm(e.name) && x.ticker === norm(e.symbol));
    if (!c) continue;
    if (norm(e.imageUrl) !== worldLogoUrl(c)) continue; // right name/ticker but not the map's logo — not a claim
    if (!claims.has(c.iso2)) claims.set(c.iso2, e);
  }
  W.claims = claims;
  return claims;
}

// ---------- Stats ----------
function renderWorldStats() {
  const $ = (id) => document.getElementById(id);
  const claimed = [...W.claims.entries()];
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

  const width = 1000, height = 520;
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "world-svg");
  const g = svg.append("g");
  const proj = d3.geoNaturalEarth1().fitSize([width, height], { type: "Sphere" });
  const path = d3.geoPath(proj);

  g.append("path").datum({ type: "Sphere" }).attr("class", "w-sphere").attr("d", path);
  g.append("g").selectAll("path").data(land.features).join("path")
    .attr("class", (f) => {
      const c = W.byNum.get(String(f.id).padStart(3, "0"));
      return "w-land" + (c ? (W.claims.has(c.iso2) ? " is-claimed" : " is-open") : " is-none");
    })
    .attr("d", path)
    .on("click", (ev, f) => { const c = W.byNum.get(String(f.id).padStart(3, "0")); if (c) openClaim(c); });
  g.append("path").datum(borders).attr("class", "w-borders").attr("d", path);

  // capitals
  const caps = g.append("g").selectAll("g").data(W.countries).join("g")
    .attr("class", (c) => "w-cap" + (W.claims.has(c.iso2) ? " is-claimed" : ""))
    .attr("transform", (c) => { const [x, y] = proj(c.lnglat); return `translate(${x},${y})`; })
    .on("click", (ev, c) => { ev.stopPropagation(); openClaim(c); });
  caps.append("circle").attr("r", (c) => W.claims.has(c.iso2) ? 4.2 : 2.4);
  caps.append("title").text((c) => `${c.capital} · ${c.name}`);
  caps.filter((c) => W.claims.has(c.iso2)).append("text").attr("class", "w-cap-label").attr("y", -7)
    .text((c) => { const e = W.claims.get(c.iso2); return `${c.capital}${e.marketCapUsd != null ? " · " + fmtUsd(e.marketCapUsd) : ""}`; });

  const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", (ev) => {
    g.attr("transform", ev.transform);
    g.selectAll(".w-cap circle").attr("r", (c) => (W.claims.has(c.iso2) ? 4.2 : 2.4) / Math.sqrt(ev.transform.k));
    g.selectAll(".w-cap-label").style("font-size", `${10 / Math.sqrt(ev.transform.k)}px`);
  });
  svg.call(zoom);
  W.map = { svg, g, proj, zoom };
}

// ---------- List ----------
function renderWorldList() {
  const list = document.getElementById("w-list");
  const q = W.query.toLowerCase();
  const rows = W.countries.filter((c) => {
    const claimed = W.claims.has(c.iso2);
    if (W.filter === "claimed" && !claimed) return false;
    if (W.filter === "open" && claimed) return false;
    if (q && !(`${c.name} ${c.nameKo} ${c.capital} ${c.iso2} ${c.iso3}`.toLowerCase().includes(q))) return false;
    return true;
  });
  // claimed first (by mcap), then open alphabetically
  rows.sort((a, b) => {
    const ea = W.claims.get(a.iso2), eb = W.claims.get(b.iso2);
    if (ea && !eb) return -1; if (!ea && eb) return 1;
    if (ea && eb) return (eb.marketCapUsd || 0) - (ea.marketCapUsd || 0);
    return a.name.localeCompare(b.name);
  });
  document.getElementById("w-list-count").textContent = `${rows.length} shown`;
  list.innerHTML = rows.map((c) => {
    const e = W.claims.get(c.iso2);
    return `<button class="world-row ${e ? "is-claimed" : ""}" data-iso="${c.iso2}">
      <img class="world-row-logo" src="world/logos/${c.iso2}.svg" alt="" loading="lazy">
      <span class="world-row-main"><span class="world-row-name">${c.flag} ${c.name}</span><span class="world-row-cap">$${c.ticker} · ${c.capital}</span></span>
      <span class="world-row-right">${e
        ? `<span class="world-row-mcap">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</span><span class="world-row-sub">claimed ${timeAgo(e.launchedAt)}</span>`
        : `<span class="world-row-open">open</span>`}</span>
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
  const e = W.claims.get(c.iso2);
  if (e) {
    $("claim-body").innerHTML = `
      <div class="claim-grid">
        <div class="stat-card"><div class="stat-label">Market cap</div><div class="stat-value">${e.marketCapUsd != null ? fmtUsd(e.marketCapUsd) : "—"}</div></div>
        <div class="stat-card"><div class="stat-label">Claimed</div><div class="stat-value" style="font-size:.95rem">${timeAgo(e.launchedAt)}</div><div class="stat-sub">by <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/address/${e.creator}" target="_blank">${short(e.creator)}</a></div></div>
      </div>
      <div class="claim-actions">
        <a class="btn btn-primary" href="explore.html#/token/${e.token}">Trade $${c.ticker} →</a>
        <a class="btn" href="${CONFIG.BLOCK_EXPLORER}/token/${e.token}" target="_blank" rel="noopener">explorer ↗</a>
      </div>`;
  } else {
    const live = typeof hybridFactoryConfigured === "function" && hybridFactoryConfigured();
    $("claim-body").innerHTML = `
      <div class="claim-terms">
        <div class="claim-term"><span class="dt">Name</span><span class="dd">${c.name}</span></div>
        <div class="claim-term"><span class="dt">Ticker</span><span class="dd">$${c.ticker}</span></div>
        <div class="claim-term"><span class="dt">Logo</span><span class="dd">the outline above — fixed</span></div>
        <div class="claim-term"><span class="dt">Mode</span><span class="dd">Hybrid · real v4 pool from block one · no ETH needed</span></div>
        <div class="claim-term"><span class="dt">Rent</span><span class="dd">1% per trade → 70% to you, 30% to $HOME</span></div>
      </div>
      <label class="claim-devbuy">Dev buy (ETH) <span class="optional">optional</span>
        <input id="claim-devbuy" type="number" min="0" step="0.001" placeholder="0.0">
      </label>
      <div class="claim-actions">
        <button class="btn btn-primary" id="claim-go" ${live ? "" : "disabled"}>${live ? `Claim ${c.capital}` : "Launchpad offline"}</button>
      </div>
      <p class="hint">Name, ticker and logo can't be edited — that's what makes the claim provable. One claim per capital, first launch wins. Signed by your wallet; you're the creator on-chain.</p>`;
    $("claim-go").addEventListener("click", () => submitClaim(c));
  }
  modal.style.display = "flex";
}
function closeClaim() { document.getElementById("claim-modal").style.display = "none"; }

async function submitClaim(c) {
  const status = document.getElementById("claim-status");
  const btn = document.getElementById("claim-go");
  try {
    if (!state.signer) {
      status.innerHTML = `<div class="status pending">Connect a wallet first…</div>`;
      await connectWallet();
      if (!state.signer) { status.innerHTML = `<div class="status error">Connect a wallet to claim.</div>`; return; }
    }
    // Re-check on chain right before sending: someone may have claimed it
    // while this modal was open.
    await loadWorldClaims();
    if (W.claims.has(c.iso2)) { status.innerHTML = `<div class="status error">${c.capital} was just claimed by someone else.</div>`; renderAll(); return; }

    btn.disabled = true;
    const devStr = (document.getElementById("claim-devbuy").value || "").trim();
    const devBuyEth = devStr && Number(devStr) > 0 ? ethers.parseEther(devStr) : 0n;
    const meta = { imageUrl: worldLogoUrl(c), description: worldDescription(c), twitter: "", telegram: "", discord: "", website: "" };
    const overrides = await getTxOverrides(6_000_000n);
    status.innerHTML = `<div class="status pending">Confirm the claim in your wallet…</div>`;
    const tx = devBuyEth > 0n
      ? await hybridFactoryWrite().launchAndBuy(c.name, c.ticker, 0, meta, { ...overrides, value: devBuyEth })
      : await hybridFactoryWrite().launch(c.name, c.ticker, 0, meta, overrides);
    status.innerHTML = `<div class="status pending">Claiming ${c.capital}… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    await loadWorldClaims();
    const e = W.claims.get(c.iso2);
    recordClaimInFirebase(c, e, receipt).catch(() => {});
    status.innerHTML = `<div class="status success">🏡 ${c.capital} is yours. <a href="explore.html#/token/${e ? e.token : ""}">Open $${c.ticker} →</a></div>`;
    renderAll();
  } catch (err) {
    console.error(err);
    btn && (btn.disabled = false);
    status.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 200)}</div>`;
  }
}

// ---------- Firebase (optional, write-only record) ----------
async function recordClaimInFirebase(c, e, receipt) {
  if (!window.FIREBASE_CONFIG || !e) return;
  if (!window.firebase) {
    await Promise.all([
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
    ].map((src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); })));
  }
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  await firebase.firestore().collection("claims").doc(c.iso2).set({
    iso2: c.iso2, name: c.name, capital: c.capital, ticker: c.ticker,
    token: e.token, creator: e.creator, txHash: receipt.hash, launchedAt: e.launchedAt,
    recordedAt: Date.now(),
  }, { merge: false });
}

// ---------- Boot ----------
function renderAll() {
  renderWorldStats();
  renderWorldList();
  // repaint map classes/labels without refetching topojson
  if (W.map) {
    W.map.g.selectAll(".w-land").attr("class", function () {
      const f = d3.select(this).datum(); const c = W.byNum.get(String(f.id).padStart(3, "0"));
      return "w-land" + (c ? (W.claims.has(c.iso2) ? " is-claimed" : " is-open") : " is-none");
    });
    W.map.g.selectAll(".w-cap").attr("class", (c) => "w-cap" + (W.claims.has(c.iso2) ? " is-claimed" : "")).select("circle").attr("r", (c) => W.claims.has(c.iso2) ? 4.2 : 2.4);
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
  renderWorldList(); // instant, before the chain answers
  try { await loadWorldClaims(); } catch (err) { console.error("claims failed", err); }
  await renderWorldMap();
  renderAll();
})();
