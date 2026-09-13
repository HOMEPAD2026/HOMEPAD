// adventure-cn.js — the "Pons · 橋" page. Same integration and logic as
// adventure.js — talks directly to Pons V2's own contracts on Robinhood
// Chain (see pons-abi.js and config.js for addresses/provenance). This is
// a third-party, currently-unaudited, currently whitelist-gated protocol
// — nothing here is HOMEPAD's own contract. Every write path checks live
// on-chain state (canLaunch, previewLaunchEconomics) rather than assuming
// yesterday's answer still holds.
//
// This page additionally features a single spotlight token ($橋) not
// shown on the plain adventure.html — see the spotlight section below.

const ADV = { launches: [], sort: "newest", period: "all", tsCache: new Map() };

function ponsFactoryRead() {
  return new ethers.Contract(CONFIG.PONS_V2_FACTORY_ADDRESS, PONS_FACTORY_ABI, readProvider());
}
function ponsFactoryWrite() {
  return new ethers.Contract(CONFIG.PONS_V2_FACTORY_ADDRESS, PONS_FACTORY_ABI, state.signer);
}
function ponsCurveRead(address) {
  return new ethers.Contract(address, PONS_CURVE_ABI, readProvider());
}
function ponsTokenRead(address) {
  return new ethers.Contract(address, PONS_TOKEN_ABI, readProvider());
}

async function advBlockTs(blockNumber) {
  if (ADV.tsCache.has(blockNumber)) return ADV.tsCache.get(blockNumber);
  const b = await readProvider().getBlock(blockNumber);
  const ts = Number(b.timestamp);
  ADV.tsCache.set(blockNumber, ts);
  return ts;
}

// ---------- Explore (read-only, works for every visitor) ----------
async function loadPonsLaunches() {
  const f = ponsFactoryRead();
  const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
  const events = await withRetry(() => f.queryFilter(f.filters.TokenLaunched(), fromBlock, "latest"));
  const ethUsd = await getEthUsdPrice().catch(() => null);

  const launches = await Promise.all(events.map(async (ev) => {
    const { token, curve, deployer, pairToken, graduationThreshold } = ev.args;
    try {
      const t = ponsTokenRead(token);
      const c = ponsCurveRead(curve);
      const [name, symbol, reserves, realRaised, sellable, graduated, totalSupply, info, ts] = await Promise.all([
        withRetry(() => t.name()).catch(() => "?"),
        withRetry(() => t.symbol()).catch(() => "?"),
        withRetry(() => c.getReserves()).catch(() => [0n, 0n]),
        withRetry(() => c.realQuoteReserve()).catch(() => 0n),
        withRetry(() => c.sellableTokens()).catch(() => 0n),
        withRetry(() => c.graduated()).catch(() => false),
        withRetry(() => t.totalSupply()).catch(() => 0n),
        // getTokenInfo() is the token's OWN on-chain metadata, set by its
        // own deployer at launch — same category of data as name/symbol,
        // not something borrowed from Pons' own site or UI.
        withRetry(() => t.getTokenInfo()).catch(() => null),
        advBlockTs(ev.blockNumber).catch(() => 0),
      ]);
      const isNativeQuote = pairToken === ethers.ZeroAddress;
      const progress = graduationThreshold > 0n ? Number((realRaised * 10000n) / graduationThreshold) / 100 : 0;
      const price = reserves[1] > 0n ? Number(reserves[0]) / Number(reserves[1]) : 0;
      // Fully-diluted mcap in USD — only computable for native-ETH pairs
      // here, since a custom pair token's own USD price isn't looked up.
      const mcapUsd = isNativeQuote && ethUsd != null && totalSupply > 0n
        ? price * Number(ethers.formatUnits(totalSupply, 18)) * ethUsd
        : null;
      return {
        token, curve, deployer, pairToken, isNativeQuote, name, symbol,
        graduated, sellable, progress: Math.min(100, progress), price, mcapUsd,
        logo: info ? info.tokenLogo : "", blockNumber: ev.blockNumber, txHash: ev.transactionHash,
        launchedAt: ts,
      };
    } catch (err) {
      console.warn("pons launch read failed for", token, err);
      return null;
    }
  }));

  ADV.launches = launches.filter(Boolean).sort((a, b) => b.blockNumber - a.blockNumber);
  return ADV.launches;
}

function renderAdvStats() {
  const countEl = document.getElementById("adv-count");
  if (!countEl) return; // Pons V2 explore section isn't on this page anymore
  const l = ADV.launches;
  countEl.textContent = String(l.length);
  document.getElementById("adv-live").textContent = String(l.filter((x) => !x.graduated).length);
  document.getElementById("adv-graduated").textContent = String(l.filter((x) => x.graduated).length);
}

function renderPonsExplore() {
  const list = document.getElementById("adv-explore-list");
  if (!list) return; // Pons V2 explore section isn't on this page anymore
  const now = Math.floor(Date.now() / 1000);
  const periodSec = ADV.period === "24h" ? 86400 : ADV.period === "7d" ? 604800 : null;
  let rows = ADV.launches.filter((l) => !periodSec || now - l.launchedAt <= periodSec);
  rows = rows.slice().sort((a, b) => ADV.sort === "mcap" ? (b.mcapUsd || -1) - (a.mcapUsd || -1) : b.blockNumber - a.blockNumber);

  document.getElementById("adv-explore-count").textContent = rows.length ? `${rows.length} tracked` : "";
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">No Pons V2 launches found for this filter.</div>`;
    return;
  }
  list.innerHTML = rows.map((l) => `
    <a class="adv-launch-row ${l.graduated ? "is-graduated" : ""}" href="https://www.ponsfamily.com/launchpad/${l.token}" target="_blank" rel="noopener">
      ${l.logo ? `<img class="adv-launch-logo" src="${l.logo}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="adv-launch-logo adv-launch-logo-blank"></span>`}
      <span class="adv-launch-main">
        <span class="adv-launch-name">${l.name} <span class="adv-launch-symbol">$${l.symbol}</span></span>
        <span class="adv-launch-sub">${l.mcapUsd != null ? fmtUsd(l.mcapUsd) + " MC · " : ""}${l.isNativeQuote ? "ETH" : short(l.pairToken)} paired · by ${short(l.deployer)}</span>
      </span>
      <span class="adv-launch-right">
        ${l.graduated
          ? `<span class="adv-launch-badge is-grad">graduated</span>`
          : `<span class="adv-launch-progress"><span class="adv-launch-progress-bar" style="width:${l.progress}%"></span></span><span class="adv-launch-pct">${l.progress.toFixed(1)}% to graduation</span>`}
      </span>
    </a>`).join("");
}

// ---------- Launch (gated on a live canLaunch() check) ----------
async function refreshAdvLaunchGate() {
  const gate = document.getElementById("adv-launch-gate");
  const form = document.getElementById("adv-launch-form");
  if (!gate) return; // not on this page
  if (!state.account) {
    gate.style.display = ""; gate.innerHTML = `<div class="empty-state">Connect your wallet to check eligibility.</div>`;
    form.style.display = "none";
    return;
  }
  gate.style.display = ""; gate.innerHTML = `<div class="empty-state">Checking eligibility…</div>`;
  form.style.display = "none";
  try {
    const eligible = await withRetry(() => ponsFactoryRead().canLaunch(state.account));
    if (!eligible) {
      gate.innerHTML = `<div class="adv-gate-closed">
        <div class="adv-gate-closed-head">Launching is invite-only right now</div>
        <p class="hint">Pons V2 hasn't opened public launches yet — your wallet (${short(state.account)}) isn't on the current whitelist. This is checked live against the contract, so it updates the moment that changes.</p>
        <a class="btn" href="${CONFIG.PONS_V2_DOCS_URL}" target="_blank" rel="noopener">Read the Pons V2 docs ↗</a>
      </div>`;
      return;
    }
    gate.style.display = "none";
    form.style.display = "";
    await loadLaunchConfigs();
  } catch (err) {
    console.error(err);
    gate.innerHTML = `<div class="status error">Couldn't check eligibility: ${String(err && err.message || err).slice(0, 160)}</div>`;
  }
}

async function loadLaunchConfigs() {
  const select = document.getElementById("adv-config");
  select.innerHTML = `<option>Loading…</option>`;
  try {
    const f = ponsFactoryRead();
    const count = Number(await withRetry(() => f.launchConfigCount()));
    const configs = await Promise.all(Array.from({ length: count }, (_, id) => withRetry(() => f.getLaunchConfig(id)).then((c) => ({ id, ...c }))));
    const open = configs.filter((c) => c.enabled);
    if (!open.length) { select.innerHTML = `<option value="">No open configs</option>`; return; }
    select.innerHTML = open.map((c) => `<option value="${c.id}">#${c.id} — supply ${fmtCompact(Number(ethers.formatUnits(c.supply, 18)))}, graduates at ${ethers.formatEther(c.graduationThreshold)} ETH</option>`).join("");
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">Couldn't load configs</option>`;
  }
}

async function submitPonsLaunch(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById("adv-launch-status");
  const btn = document.getElementById("adv-launch-submit");
  const name = document.getElementById("adv-name").value.trim();
  const symbol = document.getElementById("adv-symbol").value.trim();
  const logo = document.getElementById("adv-logo").value.trim();
  const description = document.getElementById("adv-description").value.trim();
  const launchConfigId = BigInt(document.getElementById("adv-config").value || "0");
  const creatorTaxBps = Number(document.getElementById("adv-tax").value || "0");
  const buybackEnabled = document.getElementById("adv-buyback").checked;
  if (!name || !symbol) { statusEl.innerHTML = `<div class="status error">Name and symbol are required.</div>`; return; }

  btn.disabled = true;
  try {
    const f = ponsFactoryRead();
    const pairToken = ethers.ZeroAddress; // native ETH only, see form note
    statusEl.innerHTML = `<div class="status pending">Pinning current launch terms…</div>`;
    const [expectedEconomics, launchFee, maxTax] = await Promise.all([
      withRetry(() => f.previewLaunchEconomics(launchConfigId, pairToken)),
      withRetry(() => f.launchFee()),
      withRetry(() => f.maxCreatorTaxBps()),
    ]);
    if (creatorTaxBps > Number(maxTax)) {
      statusEl.innerHTML = `<div class="status error">Creator tax exceeds Pons' cap (${maxTax} bps max).</div>`;
      btn.disabled = false; return;
    }
    const params = {
      name, symbol, logo, description,
      socials: { twitter: "", telegram: "", discord: "", website: "https://homepad.fun/adventure-cn", farcaster: "" },
      creatorFeeRecipient: ethers.ZeroAddress, // defaults to the caller
      creatorTaxBps, buybackEnabled, expectedEconomics,
      salt: ethers.hexlify(ethers.randomBytes(32)),
    };
    statusEl.innerHTML = `<div class="status pending">Confirm the launch in your wallet…</div>`;
    const fnSig = "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)";
    let tx = typeof tryWagmiWrite === "function"
      ? await tryWagmiWrite({ address: CONFIG.PONS_V2_FACTORY_ADDRESS, abi: PONS_FACTORY_ABI, functionName: fnSig, args: [params, launchConfigId, pairToken], value: launchFee })
      : null;
    if (!tx) {
      if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
      tx = await ponsFactoryWrite()[fnSig](params, launchConfigId, pairToken, { value: launchFee });
    }
    statusEl.innerHTML = `<div class="status pending">Launching… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">tx ↗</a></div>`;
    const receipt = await tx.wait();
    statusEl.innerHTML = `<div class="status success">Launched. <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">tx ↗</a></div>`;
    document.getElementById("adv-launch-form").reset();
    loadPonsLaunches().then(() => { renderAdvStats(); renderPonsExplore(); });
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<div class="status error">${String(err && (err.shortMessage || err.message) || err).slice(0, 220)}</div>`;
  } finally {
    btn.disabled = false;
  }
}

(async () => {
  // Pons V2's generic Explore/Launch sections were removed from this page
  // (it's now just the $橋 spotlight + game + story) — only the spotlight
  // token needs loading here. adventure.js still owns the full
  // Explore/Launch flow for anyone who wants it.
  loadSpotlightToken();
})();

// ---------- Featured spotlight token (manually set in config, not
// derived from any factory event — see ADV_CN_FEATURED_TOKEN) ----------
let spotDex = null;

async function loadSpotlightToken() {
  const t = CONFIG.ADV_CN_FEATURED_TOKEN;
  if (!t) return;
  document.getElementById("spot-ca").textContent = t.address;
  document.getElementById("spot-buy-link").href = `https://pairex.market/c/${t.address.toLowerCase()}`;
  document.getElementById("adv-spotlight-card-chart").addEventListener("click", openSpotlightModal);
  try {
    const stats = await fetchDexscreenerStats([t.address]);
    spotDex = stats.get(t.address.toLowerCase()) || null;
    document.getElementById("spot-mcap").textContent = spotDex && spotDex.marketCapUsd != null ? fmtUsd(spotDex.marketCapUsd) : "No data";
    const changeEl = document.getElementById("spot-change");
    if (spotDex && spotDex.change24h != null) {
      const up = spotDex.change24h >= 0;
      changeEl.textContent = `${up ? "+" : ""}${spotDex.change24h.toFixed(2)}%`;
      changeEl.style.color = up ? "var(--green)" : "var(--red)";
    } else {
      changeEl.textContent = "No data";
    }
  } catch (err) {
    console.warn("spotlight token stats failed", err);
    document.getElementById("spot-mcap").textContent = "No data";
    document.getElementById("spot-change").textContent = "No data";
  }
  loadSpotlightBurn(t.address).catch((err) => {
    console.warn("spotlight burn read failed", err);
    document.getElementById("spot-burn").textContent = "No data";
  });
}

/// Live burn read for the spotlight token — Transfer events into the
/// standard dead address, summed against totalSupply. Not hardcoded: the
/// creator's own post claims an ongoing buy-and-burn commitment
/// ("everything can be verified onchain"), so this reads the real number
/// instead of a snapshot someone typed in, and it stays accurate as more
/// burns happen.
async function loadSpotlightBurn(address) {
  const el = document.getElementById("spot-burn");
  const tok = tokenRead(address);
  const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
  const [totalSupply, burnEvents] = await Promise.all([
    withRetry(() => tok.totalSupply()),
    withRetry(() => tok.queryFilter(tok.filters.Transfer(null, BURN_ADDRESS), fromBlock, "latest")),
  ]);
  const burned = burnEvents.reduce((sum, ev) => sum + ev.args.value, 0n);
  const pct = totalSupply > 0n ? Number((burned * 1000000n) / totalSupply) / 10000 : 0;
  el.textContent = `${fmtCompact(Number(ethers.formatUnits(burned, 18)))} (${pct.toFixed(4)}%)`;
}

function openSpotlightModal() {
  const t = CONFIG.ADV_CN_FEATURED_TOKEN;
  const modal = document.getElementById("spot-modal");
  document.getElementById("spot-modal-ca-link").href = `${CONFIG.BLOCK_EXPLORER}/token/${t.address}`;
  document.getElementById("spot-modal-price").textContent = spotDex && spotDex.priceUsd != null ? `$${spotDex.priceUsd.toPrecision(6)}` : "No data";
  document.getElementById("spot-modal-mcap").textContent = spotDex && spotDex.marketCapUsd != null ? fmtUsd(spotDex.marketCapUsd) : "No data";
  const changeEl = document.getElementById("spot-modal-change");
  if (spotDex && spotDex.change24h != null) {
    const up = spotDex.change24h >= 0;
    changeEl.textContent = `${up ? "+" : ""}${spotDex.change24h.toFixed(2)}%`;
    changeEl.style.color = up ? "var(--green)" : "var(--red)";
  } else {
    changeEl.textContent = "No data";
  }
  document.getElementById("spot-modal-liq").textContent = spotDex && spotDex.liquidityUsd != null ? fmtUsd(spotDex.liquidityUsd) : "No data";

  const chartHost = document.getElementById("spot-modal-chart");
  const dexUrl = `https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${spotDex && spotDex.pairAddress ? spotDex.pairAddress : t.address}`;
  chartHost.innerHTML = spotDex
    ? `<iframe src="${dexUrl}?embed=1&theme=dark&trades=0&info=0" title="Dexscreener chart" loading="lazy"></iframe>`
    : `<div class="empty-state">No pair indexed on Dexscreener yet for this token — chart unavailable.</div>`;
  modal.style.display = "flex";
}
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("spot-modal-close");
  const modal = document.getElementById("spot-modal");
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  if (modal) modal.addEventListener("click", (e) => { if (e.target.id === "spot-modal") modal.style.display = "none"; });
});
