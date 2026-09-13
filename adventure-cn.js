// adventure-cn.js — 中文版，与 adventure.js 逻辑完全相同，仅界面文案翻译为中文。
// 直接读写 Pons V2 在 Robinhood Chain 上的合约（见 pons-abi.js 与 config.js
// 中的地址与来源说明）。这是一个第三方、目前尚未经过审计、目前仅限白名单
// 的协议 —— 这里的一切都不是 HOMEPAD 自己的合约。每一次写入操作都会实时
// 检查链上状态（canLaunch、previewLaunchEconomics），而不是假设昨天的结
// 果今天依然成立。
//
// 维护说明：这是 adventure.js 的中文翻译版本，逻辑保持一致；对 adventure.js
// 的任何逻辑修复都应同步到这个文件。

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

// ---------- 探索（只读，对所有访客开放） ----------
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
        // getTokenInfo() 是代币自己的链上元数据，由其发行者本人在发行时设置——
        // 这与 name/symbol 属于同一类数据，并非借用 Pons 自身站点或界面的内容。
        withRetry(() => t.getTokenInfo()).catch(() => null),
        advBlockTs(ev.blockNumber).catch(() => 0),
      ]);
      const isNativeQuote = pairToken === ethers.ZeroAddress;
      const progress = graduationThreshold > 0n ? Number((realRaised * 10000n) / graduationThreshold) / 100 : 0;
      const price = reserves[1] > 0n ? Number(reserves[0]) / Number(reserves[1]) : 0;
      // 完全稀释市值（美元）——目前仅对以原生 ETH 计价的发行项目计算，因为
      // 自定义配对代币自身的美元价格未在此查询。
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
  const l = ADV.launches;
  document.getElementById("adv-count").textContent = String(l.length);
  document.getElementById("adv-live").textContent = String(l.filter((x) => !x.graduated).length);
  document.getElementById("adv-graduated").textContent = String(l.filter((x) => x.graduated).length);
}

function renderPonsExplore() {
  const list = document.getElementById("adv-explore-list");
  const now = Math.floor(Date.now() / 1000);
  const periodSec = ADV.period === "24h" ? 86400 : ADV.period === "7d" ? 604800 : null;
  let rows = ADV.launches.filter((l) => !periodSec || now - l.launchedAt <= periodSec);
  rows = rows.slice().sort((a, b) => ADV.sort === "mcap" ? (b.mcapUsd || -1) - (a.mcapUsd || -1) : b.blockNumber - a.blockNumber);

  document.getElementById("adv-explore-count").textContent = rows.length ? `已追踪 ${rows.length} 个` : "";
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">该筛选条件下暂未发现 Pons V2 发行项目。</div>`;
    return;
  }
  list.innerHTML = rows.map((l) => `
    <a class="adv-launch-row ${l.graduated ? "is-graduated" : ""}" href="https://www.ponsfamily.com/launchpad/${l.token}" target="_blank" rel="noopener">
      ${l.logo ? `<img class="adv-launch-logo" src="${l.logo}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span class="adv-launch-logo adv-launch-logo-blank"></span>`}
      <span class="adv-launch-main">
        <span class="adv-launch-name">${l.name} <span class="adv-launch-symbol">$${l.symbol}</span></span>
        <span class="adv-launch-sub">${l.mcapUsd != null ? fmtUsd(l.mcapUsd) + " 市值 · " : ""}${l.isNativeQuote ? "ETH" : short(l.pairToken)} 计价 · 发行者 ${short(l.deployer)}</span>
      </span>
      <span class="adv-launch-right">
        ${l.graduated
          ? `<span class="adv-launch-badge is-grad">已毕业</span>`
          : `<span class="adv-launch-progress"><span class="adv-launch-progress-bar" style="width:${l.progress}%"></span></span><span class="adv-launch-pct">距毕业还需 ${l.progress.toFixed(1)}%</span>`}
      </span>
    </a>`).join("");
}

// ---------- 发行（需通过实时 canLaunch() 检测） ----------
async function refreshAdvLaunchGate() {
  const gate = document.getElementById("adv-launch-gate");
  const form = document.getElementById("adv-launch-form");
  if (!gate) return; // 不在此页面上
  if (!state.account) {
    gate.style.display = ""; gate.innerHTML = `<div class="empty-state">请连接钱包以检查发行资格。</div>`;
    form.style.display = "none";
    return;
  }
  gate.style.display = ""; gate.innerHTML = `<div class="empty-state">正在检查资格…</div>`;
  form.style.display = "none";
  try {
    const eligible = await withRetry(() => ponsFactoryRead().canLaunch(state.account));
    if (!eligible) {
      gate.innerHTML = `<div class="adv-gate-closed">
        <div class="adv-gate-closed-head">发行功能目前仅限受邀用户</div>
        <p class="hint">Pons V2 尚未开放公开发行 —— 你的钱包（${short(state.account)}）目前不在白名单中。此检测是实时对照合约进行的，一旦资格发生变化会立即更新。</p>
        <a class="btn" href="${CONFIG.PONS_V2_DOCS_URL}" target="_blank" rel="noopener">阅读 Pons V2 官方文档 ↗</a>
      </div>`;
      return;
    }
    gate.style.display = "none";
    form.style.display = "";
    await loadLaunchConfigs();
  } catch (err) {
    console.error(err);
    gate.innerHTML = `<div class="status error">无法检查资格：${String(err && err.message || err).slice(0, 160)}</div>`;
  }
}

async function loadLaunchConfigs() {
  const select = document.getElementById("adv-config");
  select.innerHTML = `<option>加载中…</option>`;
  try {
    const f = ponsFactoryRead();
    const count = Number(await withRetry(() => f.launchConfigCount()));
    const configs = await Promise.all(Array.from({ length: count }, (_, id) => withRetry(() => f.getLaunchConfig(id)).then((c) => ({ id, ...c }))));
    const open = configs.filter((c) => c.enabled);
    if (!open.length) { select.innerHTML = `<option value="">暂无可用的发行配置</option>`; return; }
    select.innerHTML = open.map((c) => `<option value="${c.id}">#${c.id} — 供应量 ${fmtCompact(Number(ethers.formatUnits(c.supply, 18)))}，毕业门槛 ${ethers.formatEther(c.graduationThreshold)} ETH</option>`).join("");
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">无法加载发行配置</option>`;
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
  if (!name || !symbol) { statusEl.innerHTML = `<div class="status error">名称和代号为必填项。</div>`; return; }

  btn.disabled = true;
  try {
    const f = ponsFactoryRead();
    const pairToken = ethers.ZeroAddress; // 目前仅支持 ETH 计价，见表单说明
    statusEl.innerHTML = `<div class="status pending">正在锁定当前发行条款…</div>`;
    const [expectedEconomics, launchFee, maxTax] = await Promise.all([
      withRetry(() => f.previewLaunchEconomics(launchConfigId, pairToken)),
      withRetry(() => f.launchFee()),
      withRetry(() => f.maxCreatorTaxBps()),
    ]);
    if (creatorTaxBps > Number(maxTax)) {
      statusEl.innerHTML = `<div class="status error">创作者税率超过 Pons 上限（最高 ${maxTax} bps）。</div>`;
      btn.disabled = false; return;
    }
    const params = {
      name, symbol, logo, description,
      socials: { twitter: "", telegram: "", discord: "", website: "https://homepad.fun/adventure-cn", farcaster: "" },
      creatorFeeRecipient: ethers.ZeroAddress, // 默认设为调用者本人
      creatorTaxBps, buybackEnabled, expectedEconomics,
      salt: ethers.hexlify(ethers.randomBytes(32)),
    };
    statusEl.innerHTML = `<div class="status pending">请在钱包中确认发行交易…</div>`;
    const fnSig = "launchToken((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address)";
    let tx = typeof tryWagmiWrite === "function"
      ? await tryWagmiWrite({ address: CONFIG.PONS_V2_FACTORY_ADDRESS, abi: PONS_FACTORY_ABI, functionName: fnSig, args: [params, launchConfigId, pairToken], value: launchFee })
      : null;
    if (!tx) {
      if (typeof ensureAppKitChain === "function") await ensureAppKitChain();
      tx = await ponsFactoryWrite()[fnSig](params, launchConfigId, pairToken, { value: launchFee });
    }
    statusEl.innerHTML = `<div class="status pending">发行中… <a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank">交易 ↗</a></div>`;
    const receipt = await tx.wait();
    statusEl.innerHTML = `<div class="status success">发行成功。<a class="mono-link" href="${CONFIG.BLOCK_EXPLORER}/tx/${receipt.hash}" target="_blank">交易 ↗</a></div>`;
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
  document.getElementById("adv-sort-group").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip"); if (!chip) return;
    document.querySelectorAll("#adv-sort-group .filter-chip").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active"); ADV.sort = chip.dataset.sort; renderPonsExplore();
  });
  document.getElementById("adv-period-group").addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip"); if (!chip) return;
    document.querySelectorAll("#adv-period-group .filter-chip").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active"); ADV.period = chip.dataset.period; renderPonsExplore();
  });
  try {
    await loadPonsLaunches();
  } catch (err) {
    console.error("loadPonsLaunches failed", err);
    document.getElementById("adv-explore-list").innerHTML = `<div class="empty-state">无法加载 Pons V2 发行项目。<span class="err-detail">${String(err && err.message || err)}</span></div>`;
  }
  renderAdvStats();
  renderPonsExplore();
  refreshAdvLaunchGate();
  loadSpotlightToken();
})();

// ---------- Featured spotlight token (manually set in config, not
// derived from any factory event — see ADV_CN_FEATURED_TOKEN) ----------
let spotDex = null;

async function loadSpotlightToken() {
  const t = CONFIG.ADV_CN_FEATURED_TOKEN;
  if (!t) return;
  document.getElementById("spot-ca").textContent = t.address;
  document.getElementById("adv-spotlight-card").addEventListener("click", openSpotlightModal);
  try {
    const stats = await fetchDexscreenerStats([t.address]);
    spotDex = stats.get(t.address.toLowerCase()) || null;
    document.getElementById("spot-mcap").textContent = spotDex && spotDex.marketCapUsd != null ? fmtUsd(spotDex.marketCapUsd) : "暂无数据";
    const changeEl = document.getElementById("spot-change");
    if (spotDex && spotDex.change24h != null) {
      const up = spotDex.change24h >= 0;
      changeEl.textContent = `${up ? "+" : ""}${spotDex.change24h.toFixed(2)}%`;
      changeEl.style.color = up ? "var(--green)" : "var(--red)";
    } else {
      changeEl.textContent = "暂无数据";
    }
  } catch (err) {
    console.warn("spotlight token stats failed", err);
    document.getElementById("spot-mcap").textContent = "暂无数据";
    document.getElementById("spot-change").textContent = "暂无数据";
  }
}

function openSpotlightModal() {
  const t = CONFIG.ADV_CN_FEATURED_TOKEN;
  const modal = document.getElementById("spot-modal");
  document.getElementById("spot-modal-ca-link").href = `${CONFIG.BLOCK_EXPLORER}/token/${t.address}`;
  document.getElementById("spot-modal-price").textContent = spotDex && spotDex.priceUsd != null ? `$${spotDex.priceUsd.toPrecision(6)}` : "暂无数据";
  document.getElementById("spot-modal-mcap").textContent = spotDex && spotDex.marketCapUsd != null ? fmtUsd(spotDex.marketCapUsd) : "暂无数据（市值，以 MC 计）";
  const changeEl = document.getElementById("spot-modal-change");
  if (spotDex && spotDex.change24h != null) {
    const up = spotDex.change24h >= 0;
    changeEl.textContent = `${up ? "+" : ""}${spotDex.change24h.toFixed(2)}%`;
    changeEl.style.color = up ? "var(--green)" : "var(--red)";
  } else {
    changeEl.textContent = "暂无数据";
  }
  document.getElementById("spot-modal-liq").textContent = spotDex && spotDex.liquidityUsd != null ? fmtUsd(spotDex.liquidityUsd) : "暂无数据";

  const chartHost = document.getElementById("spot-modal-chart");
  const dexUrl = `https://dexscreener.com/${CONFIG.DEXSCREENER_CHAIN_SLUG}/${spotDex && spotDex.pairAddress ? spotDex.pairAddress : t.address}`;
  chartHost.innerHTML = spotDex
    ? `<iframe src="${dexUrl}?embed=1&theme=dark&trades=0&info=0" title="Dexscreener chart" loading="lazy"></iframe>`
    : `<div class="empty-state">Dexscreener 上暂未找到该代币的交易对，无法显示图表。</div>`;
  modal.style.display = "flex";
}
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("spot-modal-close");
  const modal = document.getElementById("spot-modal");
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  if (modal) modal.addEventListener("click", (e) => { if (e.target.id === "spot-modal") modal.style.display = "none"; });
});
