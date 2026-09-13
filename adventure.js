// adventure.js — 모험. Talks directly to Pons V2's own contracts on
// Robinhood Chain (see pons-abi.js and config.js for addresses/provenance).
// This is a third-party, currently-unaudited, currently whitelist-gated
// protocol — nothing here is HOMEPAD's own contract. Every write path
// checks live on-chain state (canLaunch, previewLaunchEconomics) rather
// than assuming yesterday's answer still holds.

const ADV = { launches: [] };

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

// ---------- Explore (read-only, works for every visitor) ----------
async function loadPonsLaunches() {
  const f = ponsFactoryRead();
  const fromBlock = await blockAtOrAfter(CONFIG.PONS_V2_LIVE_SINCE, "pons");
  const events = await withRetry(() => f.queryFilter(f.filters.TokenLaunched(), fromBlock, "latest"));

  const launches = await Promise.all(events.map(async (ev) => {
    const { token, curve, deployer, pairToken, graduationThreshold } = ev.args;
    try {
      const t = ponsTokenRead(token);
      const c = ponsCurveRead(curve);
      const [name, symbol, reserves, realRaised, sellable, graduated] = await Promise.all([
        withRetry(() => t.name()).catch(() => "?"),
        withRetry(() => t.symbol()).catch(() => "?"),
        withRetry(() => c.getReserves()).catch(() => [0n, 0n]),
        withRetry(() => c.realQuoteReserve()).catch(() => 0n),
        withRetry(() => c.sellableTokens()).catch(() => 0n),
        withRetry(() => c.graduated()).catch(() => false),
      ]);
      const isNativeQuote = pairToken === ethers.ZeroAddress;
      const progress = graduationThreshold > 0n ? Number((realRaised * 10000n) / graduationThreshold) / 100 : 0;
      const price = reserves[1] > 0n ? Number(reserves[0]) / Number(reserves[1]) : 0;
      return {
        token, curve, deployer, pairToken, isNativeQuote, name, symbol,
        graduated, sellable, progress: Math.min(100, progress), price,
        blockNumber: ev.blockNumber, txHash: ev.transactionHash,
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
  const l = ADV.launches;
  document.getElementById("adv-count").textContent = String(l.length);
  document.getElementById("adv-live").textContent = String(l.filter((x) => !x.graduated).length);
  document.getElementById("adv-graduated").textContent = String(l.filter((x) => x.graduated).length);
}

function renderPonsExplore() {
  const list = document.getElementById("adv-explore-list");
  document.getElementById("adv-explore-count").textContent = ADV.launches.length ? `${ADV.launches.length} tracked` : "";
  if (!ADV.launches.length) {
    list.innerHTML = `<div class="empty-state">No Pons V2 launches found yet in the tracked window.</div>`;
    return;
  }
  list.innerHTML = ADV.launches.map((l) => `
    <a class="adv-launch-row ${l.graduated ? "is-graduated" : ""}" href="https://www.ponsfamily.com/launchpad/${l.token}" target="_blank" rel="noopener">
      <span class="adv-launch-main">
        <span class="adv-launch-name">${l.name} <span class="adv-launch-symbol">$${l.symbol}</span></span>
        <span class="adv-launch-sub">${l.isNativeQuote ? "ETH" : short(l.pairToken)} paired · by ${short(l.deployer)}</span>
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
      socials: { twitter: "", telegram: "", discord: "", website: "https://homepad.fun/adventure", farcaster: "" },
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
  document.getElementById("adv-launch-form").addEventListener("submit", submitPonsLaunch);
  try {
    await loadPonsLaunches();
  } catch (err) {
    console.error("loadPonsLaunches failed", err);
    document.getElementById("adv-explore-list").innerHTML = `<div class="empty-state">Couldn't load Pons V2 launches. <span class="err-detail">${String(err && err.message || err)}</span></div>`;
  }
  renderAdvStats();
  renderPonsExplore();
  refreshAdvLaunchGate();
})();
