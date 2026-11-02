// world-buyarc.js — MK1 (2026-11-02, the owner: "use Arc's market infrastructure"): buy $ARCIRCLE with USDC inside the game.
// When a $ARCIRCLE payment (KART car, Asset Store, agent, RAID QUEENS ticket, shop) finds the wallet short, this sheet offers to
// swap the difference from USDC on Arc through ARCIRCLE Swap (contracts/ArcircleSwap.sol, CONFIG.SWAP_ADDRESS) on the
// $ARCIRCLE pool ArcircleFeeBurn names (poolKey()), then the payment goes on. Arc's gas is USDC and finality is sub-second,
// so buy → pay is one flow. No ethers: the calls are encoded here (pure helpers below, tested in tests/world/buyarc.test.mjs).
// ctx: { T, esc, toast, addr, rpcs, tx(to, data), explorer, bridge?(), swapPage, Snd? }
export const SEL = { quote: "0x3c33b33d", swap: "0x67469b5e", quoteResult: "0xc9c62030", slippage: "0x2746152a", allowance: "0xdd62ed3e", approve: "0x095ea7b3", balanceOf: "0x70a08231", poolKey: "0x182148ef" };
export const BUY = { SLIP_BPS: 100, PAD_BPS: 250, KEEP_USDC: 100000n, DEADLINE_S: 600, MAX_TRIES: 4 }; // (1 % slippage; buy 2.5 % over what's short; 0.1 USDC kept for gas)
const word = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const u256 = (v) => word(BigInt(v).toString(16));
const i256 = (v) => { let b = BigInt(v); if (b < 0n) b = (1n << 256n) + b; return word(b.toString(16)); };
/// a PoolKey's five static words
export const keyWords = (k) => word(k.currency0) + word(k.currency1) + u256(k.fee) + i256(k.tickSpacing) + word(k.hooks);
const pathWords = (path) => u256(path.length) + path.map(keyWords).join("");
/// quote(PoolKey[] path, address tokenIn, uint256 amountIn, address payer)
export function encQuote(path, tokenIn, amountIn, payer) { return SEL.quote + u256(4 * 32) + word(tokenIn) + u256(amountIn) + word(payer) + pathWords(path); }
/// swap(PoolKey[] path, address tokenIn, uint256 amountIn, uint256 minOut, address to, uint256 deadline)
export function encSwap(path, tokenIn, amountIn, minOut, to, deadline) { return SEL.swap + u256(6 * 32) + word(tokenIn) + u256(amountIn) + u256(minOut) + word(to) + u256(deadline) + pathWords(path); }
export const encApprove = (spender, amount) => SEL.approve + word(spender) + u256(amount);
export const encAllowance = (owner, spender) => SEL.allowance + word(owner) + word(spender);
export const encBalance = (who) => SEL.balanceOf + word(who);
/// poolKey() → { currency0, currency1, fee, tickSpacing, hooks }
export function decKey(hex) {
  const h = String(hex || "").replace(/^0x/, ""); if (h.length < 320) return null;
  const w = (i) => h.slice(i * 64, i * 64 + 64), ad = (i) => "0x" + w(i).slice(24);
  let ts = BigInt("0x" + w(3)); if (ts >= 1n << 255n) ts -= 1n << 256n;
  return { currency0: ad(0), currency1: ad(1), fee: Number(BigInt("0x" + w(2))), tickSpacing: Number(ts), hooks: ad(4) };
}
/// the revert data of quote() → { out, fee, feeAt } (QuoteResult), else null
export function decQuote(hex) {
  const h = String(hex || "").toLowerCase(); if (!h.startsWith(SEL.quoteResult) || h.length < 10 + 192) return null;
  const b = h.slice(10), n = (i) => BigInt("0x" + b.slice(i * 64, i * 64 + 64));
  return { out: n(0), fee: n(1), feeAt: Number(n(2)) };
}
/// how much USDC to put in so the swap brings at least `short` $ARCIRCLE, from a probe quote (probeIn USDC → probeOut $ARCIRCLE)
export function usdcFor(short, probeIn, probeOut, padBps = BUY.PAD_BPS) {
  short = BigInt(short); probeIn = BigInt(probeIn); probeOut = BigInt(probeOut); if (short <= 0n) return 0n; if (probeOut <= 0n) return null;
  const raw = (short * probeIn + probeOut - 1n) / probeOut, padded = (raw * BigInt(10000 + padBps) + 9999n) / 10000n;
  return ((padded + 9999n) / 10000n) * 10000n; // (up to the next 0.01 USDC)
}
export const minOutOf = (out, slipBps = BUY.SLIP_BPS) => (BigInt(out) * BigInt(10000 - slipBps)) / 10000n;
/// the path for USDC → $ARCIRCLE: the fee-burn pool when it pairs the two, else null (the site's swap page routes the rest)
export function pathFor(key, usdc, arc) {
  if (!key) return null; const a = [key.currency0, key.currency1].map((x) => String(x).toLowerCase()).sort(), b = [usdc, arc].map((x) => String(x).toLowerCase()).sort();
  return a[0] === b[0] && a[1] === b[1] ? [key] : null;
}
const fmtArc = (wei) => Math.round(Number(BigInt(wei) / 10n ** 14n) / 1e4).toLocaleString("en-US");
const fmtUsd = (u6) => (Number(BigInt(u6)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function createBuyArc(ctx) {
  const { T, esc } = ctx, CFG = () => (typeof CONFIG !== "undefined" ? CONFIG : window.CONFIG) || {};
  const USDC = () => String(CFG().USDC_ADDRESS || "0x3600000000000000000000000000000000000000").toLowerCase();
  const ARC = () => String(CFG().ARCIRCLE_TOKEN || "").toLowerCase(), SWAP = () => String(CFG().SWAP_ADDRESS || "").toLowerCase(), FEEBURN = () => String(CFG().ARCIRCLE_FEEBURN || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(String(a || "").toLowerCase());
  let keyP = null, el = null;
  /// JSON-RPC through the game's endpoints; with `revert` the error's data comes back instead of a throw
  async function rpc(method, params, revert) {
    let last = null;
    for (const url of ctx.rpcs()) {
      try { const j = await (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
        if (j && j.error) { const d = j.error.data && (typeof j.error.data === "string" ? j.error.data : j.error.data.data); if (revert && d) return { revert: d }; last = new Error(j.error.message || "rpc error"); continue; }
        if (j && "result" in j) return j.result;
      } catch (e) { last = e; }
    }
    throw last || new Error("no Arc endpoint answered");
  }
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bal = async (tok, who) => BigInt((await call(tok, encBalance(who))) || "0x0");
  const arcKey = () => (keyP ||= call(FEEBURN(), SEL.poolKey).then(decKey).catch(() => { keyP = null; return null; }));
  async function quote(path, amountIn, payer) {
    const r = await rpc("eth_call", [{ from: payer, to: SWAP(), data: encQuote(path, USDC(), amountIn, payer) }, "latest"], true);
    return r && r.revert ? decQuote(r.revert) : null;
  }
  async function receipt(tx) { for (let i = 0; i < 60; i++) { const r = await rpc("eth_getTransactionReceipt", [tx]).catch(() => null); if (r && r.status) return r.status === "0x1"; await new Promise((ok) => setTimeout(ok, i < 5 ? 700 : 2000)); } return false; }
  /// the sheet; resolves true once the wallet holds `need` $ARCIRCLE (bought here or already), false when the player leaves
  function open(need, label) {
    need = BigInt(need);
    return new Promise((resolve) => {
      close(); el = document.createElement("div"); el.className = "wba"; el.setAttribute("role", "dialog");
      let st = { have: null, usdc: null, path: null, inUsdc: null, out: null, busy: "", err: "" }, done = false;
      const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
      const paint = () => {
        const short = st.have == null ? null : need > st.have ? need - st.have : 0n, enough = st.usdc != null && st.inUsdc != null && st.usdc >= st.inUsdc + BUY.KEEP_USDC;
        el.innerHTML = `<div class="wba-card"><button type="button" class="wba-x" data-x aria-label="${esc(T("Close"))}">✕</button>
          <div class="wba-hd"><img src="/images/ui/exchange/coin-arc.webp" alt=""><div><b>${esc(T("Buy $ARCIRCLE with USDC"))}</b><small>${esc(T("On Arc · USDC gas · settles in about a second"))}</small></div></div>
          ${label ? `<p class="wba-for">${esc(T("For {x}", { x: label }))}</p>` : ""}
          <div class="wba-rows">
            <div><span>${esc(T("Needed"))}</span><b>${esc(fmtArc(need))} $ARCIRCLE</b></div>
            <div><span>${esc(T("In your wallet"))}</span><b>${st.have == null ? "…" : esc(fmtArc(st.have)) + " $ARCIRCLE"}</b></div>
            <div class="wba-short"><span>${esc(T("Short by"))}</span><b>${short == null ? "…" : esc(fmtArc(short)) + " $ARCIRCLE"}</b></div>
            <div class="wba-pay"><span>${esc(T("You pay about"))}</span><b>${st.inUsdc == null ? "…" : esc(fmtUsd(st.inUsdc)) + " USDC"}</b></div>
            <div><span>${esc(T("USDC in your wallet"))}</span><b>${st.usdc == null ? "…" : esc(fmtUsd(st.usdc)) + " USDC"}</b></div>
          </div>
          <p class="wba-note">${esc(T("Swapped on ARCIRCLE Swap (Uniswap v4 on Arc), 1% slippage at most. The swap fee goes to the fee burn."))}</p>
          ${st.err ? `<p class="wba-err" role="alert">${esc(st.err)}</p>` : ""}
          <div class="wba-acts">${short === 0n ? `<button type="button" class="wba-go" data-ok>${esc(T("Continue"))}</button>`
            : !st.path && st.have != null ? `<a class="wba-go" href="${esc(ctx.swapPage || "/arcpad#swap")}" target="_blank" rel="noopener">${esc(T("Open ARCIRCLE Swap"))}</a>`
            : st.usdc != null && st.inUsdc != null && !enough ? `${ctx.bridge ? `<button type="button" class="wba-go" data-br>${esc(T("Bring USDC to Arc"))}</button>` : ""}<small class="wba-need">${esc(T("Not enough USDC on Arc for this swap."))}</small>`
            : `<button type="button" class="wba-go" data-buy ${st.busy || st.inUsdc == null ? "disabled" : ""}>${esc(st.busy || T("Buy {n} $ARCIRCLE", { n: short == null ? "…" : fmtArc(short) }))}</button>`}</div></div>`;
      };
      el.addEventListener("click", async (e) => {
        if (e.target === el || e.target.closest("[data-x]")) { if (!st.busy) finish(false); return; }
        if (e.target.closest("[data-ok]")) { finish(true); return; }
        if (e.target.closest("[data-br]")) { finish(false); try { ctx.bridge(); } catch { /* the bridge window */ } return; }
        if (e.target.closest("[data-buy]") && !st.busy) await buy();
      });
      async function load() {
        const me = String(ctx.addr() || "").toLowerCase();
        if (!isAddr(me) || !isAddr(SWAP()) || !isAddr(ARC())) { st.err = T("Connect your wallet first."); paint(); return; }
        try {
          const [have, usdc, key] = await Promise.all([bal(ARC(), me), bal(USDC(), me), arcKey()]); st.have = have; st.usdc = usdc; st.path = pathFor(key, USDC(), ARC());
          if (have >= need || !st.path) { paint(); return; }
          const short = need - have, probe = 1000000n, pq = await quote(st.path, probe, me); // (1 USDC: the rate)
          if (!pq || pq.out <= 0n) { st.err = T("Couldn't get a price. Try again in a moment."); paint(); return; }
          let amt = usdcFor(short, probe, pq.out), q = null;
          for (let i = 0; i < BUY.MAX_TRIES; i++) { q = await quote(st.path, amt, me); if (q && q.out >= short) break; amt = (amt * 1025n) / 1000n; } // (a big buy moves the price: step up until it covers it)
          if (!q || q.out < short) { st.err = T("Couldn't get a price. Try again in a moment."); paint(); return; }
          st.inUsdc = amt; st.out = q.out; paint();
        } catch (e) { console.warn("buyarc", e); st.err = T("Couldn't read your wallet on Arc. Try again."); paint(); }
      }
      async function buy() {
        const me = String(ctx.addr() || "").toLowerCase(); st.err = "";
        try {
          const allow = BigInt((await call(USDC(), encAllowance(me, SWAP()))) || "0x0");
          if (allow < st.inUsdc) { st.busy = T("Approve USDC in your wallet…"); paint(); const a = await ctx.tx(USDC(), encApprove(SWAP(), st.inUsdc)); st.busy = T("Waiting for Arc…"); paint(); if (!(await receipt(a))) throw new Error(T("The approval didn't go through.")); }
          const q = await quote(st.path, st.inUsdc, me); if (!q) throw new Error(T("Couldn't get a price. Try again in a moment."));
          st.busy = T("Confirm the swap in your wallet…"); paint();
          const tx = await ctx.tx(SWAP(), encSwap(st.path, USDC(), st.inUsdc, minOutOf(q.out), me, Math.floor(Date.now() / 1000) + BUY.DEADLINE_S));
          st.busy = T("Swapping on Arc…"); paint();
          if (!(await receipt(tx))) throw new Error(T("The swap didn't go through — the price moved. Try again."));
          st.have = await bal(ARC(), me).catch(() => st.have + q.out); st.busy = ""; if (ctx.Snd && ctx.Snd.coin) try { ctx.Snd.coin(); } catch { /* sound off */ }
          ctx.toast(T("Bought {n} $ARCIRCLE", { n: fmtArc(q.out) })); try { ctx.onBought && ctx.onBought(tx); } catch { /* the purse */ }
          if (st.have >= need) { finish(true); return; } paint(); load();
        } catch (e) { st.busy = ""; st.err = e && e.code === 4001 ? T("Cancelled in the wallet.") : (e && e.message) || T("The swap didn't go through."); paint(); }
      }
      paint(); document.body.appendChild(el); load();
    });
  }
  function close() { if (el) { el.remove(); el = null; } }
  return { open, close, quoteArc: async (usdc6) => { const k = pathFor(await arcKey(), USDC(), ARC()); const me = String(ctx.addr() || "0x0000000000000000000000000000000000000001"); return k ? quote(k, BigInt(usdc6), me) : null; } };
}
