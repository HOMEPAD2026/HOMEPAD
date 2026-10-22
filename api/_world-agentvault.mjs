// api/_world-agentvault.mjs — AGENT DIMENSION AD3: your agent trades for you, from your own vault on Arc
// (contracts/contracts/AgentDimension.sol). The player opens the vault with their own wallet (one per wallet), funds it
// with USDC and a little $ARCIRCLE for the fee, allows the tokens their agent may trade, and sets the rules here:
//   dca        buy {usd} of {token} every {everyH} hours
//   buyBelow   buy {usd} of {token} once when its price is at or under {price}
//   takeProfit sell {pct}% of the vault's {token} once when its price is at or over {price}
//   stopLoss   sell {pct}% of the vault's {token} once when its price is at or under {price}
// Every trade is at most 100 USDC (the contract's MAX_PER_TX, and the vault's own maxPerTx under it), with 2% slippage
// at most; the fee is the factory's tradeFee in $ARCIRCLE, paid by the vault. The executor (tick, from a cron) signs
// with the agent's operator key (env AGENT_DIM_KEY) — the only thing that key can do is trade inside vaults; money
// only ever leaves a vault to its owner. Without the key it runs dry: it decides and records "ready", sends nothing.
//   GET  ?world=agent-vault&wallet=0x…                      → { factory, vault, rules, log, on, live }
//   POST { action: "world-agent-vault-link", …signature }    → reads factory.vaultOf(wallet) on Arc and keeps it
//   POST { action: "world-agent-rules", …signature, rules, on } → saves the rules (≤ 6) and the in-game on/off
//   GET  ?world=agent-vault-tick&key=CRON_SECRET             → runs the rules (≤ 1 trade per vault per run)
// Firestore: worldAgentVault/<wallet> { vault, rules: [{ id, kind, token, usd?, everyH?, price?, pct?, done?, lastAt? }], on, log }
//            worldStats/agentVaults { list: { <wallet>: <vault> } }
export const VAULT = {
  MAX_USD: 100, MIN_USD: 1, RULES: 6, LOG: 30, SLIP: 2, PER_RUN: 12,
  KINDS: ["dca", "buyBelow", "takeProfit", "stopLoss"],
  factory: () => String((globalThis.process && process.env && process.env.AGENT_DIM_FACTORY) || "").trim().toLowerCase(),
  key: () => String((globalThis.process && process.env && process.env.AGENT_DIM_KEY) || "").trim(),
};
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ""));
const lc = (a) => String(a || "").toLowerCase();
const u = (n) => BigInt(n).toString(16).padStart(64, "0");
const pad = (a) => lc(a).replace(/^0x/, "").padStart(64, "0");
const W = (h, i) => BigInt("0x" + (String(h || "0x").replace(/^0x/, "").slice(i * 64, i * 64 + 64) || "0"));
const A = (h, i) => "0x" + String(h || "0x").replace(/^0x/, "").slice(i * 64 + 24, i * 64 + 64);

/// what one rule wants now: { buy: true, usd } · { buy: false, amount } (token units) · null. Pure (tested alone).
/// s: { price (USDC per whole token), dec, hold (token units in the vault), usdc (USDC units), maxUsd, spendable (USD), now }
export function decideRule(r, s) {
  if (!r || r.done || !(s.price > 0)) return null;
  const cap = Math.min(VAULT.MAX_USD, s.maxUsd, s.spendable);
  if (cap < VAULT.MIN_USD) return null;
  if (r.kind === "dca" || r.kind === "buyBelow") {
    if (r.kind === "dca" && r.lastAt && s.now - r.lastAt < r.everyH * 3600e3) return null;
    if (r.kind === "buyBelow" && s.price > r.price) return null;
    const usd = Math.min(r.usd, cap, Number(s.usdc) / 1e6);
    return usd >= VAULT.MIN_USD ? { buy: true, usd: Math.floor(usd * 100) / 100 } : null;
  }
  if (r.kind === "takeProfit" && s.price < r.price) return null;
  if (r.kind === "stopLoss" && s.price > r.price) return null;
  if (r.kind !== "takeProfit" && r.kind !== "stopLoss") return null;
  let amount = (s.hold * BigInt(Math.round(r.pct))) / 100n;
  // the USDC side ≤ the cap (2% headroom for the price moving under the quote)
  const most = BigInt(Math.floor(((cap * 0.98) / s.price) * 1e6)) * 10n ** BigInt(s.dec) / 1000000n;
  if (amount > most) amount = most;
  return amount > 0n ? { buy: false, amount } : null;
}

/// a rule as the player sent it, checked: null if it isn't one
export function cleanRule(x, i) {
  if (!x || !VAULT.KINDS.includes(x.kind) || !isAddr(lc(x.token))) return null;
  const r = { id: String(x.id || "r" + i).replace(/[^a-z0-9_-]/gi, "").slice(0, 12) || "r" + i, kind: x.kind, token: lc(x.token) };
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v));
  if (x.kind === "dca" || x.kind === "buyBelow") { const usd = num(x.usd); if (!(usd >= VAULT.MIN_USD && usd <= VAULT.MAX_USD)) return null; r.usd = Math.round(usd * 100) / 100; }
  if (x.kind === "dca") { const h = num(x.everyH); if (!(h >= 1 && h <= 168)) return null; r.everyH = Math.round(h); }
  if (x.kind !== "dca") { const p = num(x.price); if (!(p > 0 && p < 1e9)) return null; r.price = p; }
  if (x.kind === "takeProfit" || x.kind === "stopLoss") { const p = num(x.pct); if (!(p >= 1 && p <= 100)) return null; r.pct = Math.round(p); }
  return r;
}

/// deps: { getDocs, setDoc, json, now, signer(b), io? } — io: { calls([{to,data}]) → [hex|null], reverts([{to,data}]) → [hex|null], send({to,data,key}) → { ok, hash, err }, addressOfKey(k) }
export function makeAgentVault(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  let io = deps.io || null, keccak = null;
  async function chain() {
    if (io && keccak) return io;
    const [arc, x] = await Promise.all([import("./_arc.mjs"), import("./_x402.mjs")]);
    keccak = arc.keccakHex;
    if (!io) io = {
      calls: (c) => arc.ethCalls(c, { timeoutMs: 8000 }),
      reverts: async (calls) => { const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: c.to, data: c.data }, "latest"] }));
        let res; try { res = await arc.rpc(body, { timeoutMs: 8000 }); } catch { return calls.map(() => null); }
        const by = new Map((Array.isArray(res) ? res : [res]).map((r) => [r && r.id, r]));
        return calls.map((_, i) => { const r = by.get(i); if (!r || !r.error) return null; const d = typeof r.error.data === "string" ? r.error.data : r.error.data && (r.error.data.data || r.error.data.result); if (typeof d === "string") return d; const m = String(r.error.message || "").match(/0x[0-9a-fA-F]{8,}/); return m ? m[0] : null; }); },
      send: (t) => x.sendTx(t), addressOfKey: x.addressOfKey,
    };
    return io;
  }
  const hexOf = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
  const sel = (sig) => (deps.sel ? deps.sel(sig) : keccak(hexOf(sig)).slice(0, 10));

  async function load(w) { return (await one(`worldAgentVault/${w}`)) || { vault: "", rules: [], on: true, log: [] }; }
  async function view(w) {
    if (deps.shut && deps.shut(w)) return json(200, { ok: true, closed: true, factory: null, vault: "", rules: [], on: false, log: [], live: false, max: VAULT.MAX_USD, chain: null });
    const d = await load(w), f = VAULT.factory();
    let chainState = null; // the vault's money and limits, read from Arc (null when it can't be read right now)
    if (d.vault && isAddr(f)) { try { await chain(); const r = await io.calls([...["usdcBalance()", "feeBalance()", "maxPerTx()", "dailyCap()", "spendableToday()", "paused()", "agentOn()", "trades()", "totalVolume()"].map((x) => ({ to: d.vault, data: sel(x) })), { to: f, data: sel("tradeFee()") }]);
      if (r && r.every(Boolean)) chainState = { usdc: Number(W(r[0], 0)) / 1e6, fee: Number(W(r[1], 0) / 10n ** 14n) / 1e4, maxPerTx: Number(W(r[2], 0)) / 1e6, dailyCap: Number(W(r[3], 0)) / 1e6, spendable: Number(W(r[4], 0)) / 1e6, paused: W(r[5], 0) === 1n, agentOn: W(r[6], 0) === 1n, trades: Number(W(r[7], 0)), volume: Number(W(r[8], 0)) / 1e6, tradeFee: Number(W(r[9], 0) / 10n ** 14n) / 1e4 }; } catch { /* shown as unknown */ } }
    return json(200, { ok: true, factory: isAddr(f) ? f : null, vault: d.vault || "", rules: d.rules || [], on: d.on !== false, log: (d.log || []).slice(-VAULT.LOG).reverse(), live: !!VAULT.key(), max: VAULT.MAX_USD, chain: chainState });
  }
  async function link(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, f = VAULT.factory();
    if (!isAddr(f)) return json(503, { error: "AGENT DIMENSION's vaults aren't open yet" });
    await chain(); const [h] = await io.calls([{ to: f, data: sel("vaultOf(address)") + pad(w) }]);
    const v = h ? lc(A(h, 0)) : ""; if (!isAddr(v) || /^0x0{40}$/.test(v)) return json(404, { error: "no vault for this wallet yet — open one first" });
    const d = await load(w); d.vault = v; await setDoc(`worldAgentVault/${w}`, d);
    const L = (await one("worldStats/agentVaults")) || {}; await setDoc("worldStats/agentVaults", { list: { ...(L.list || {}), [w]: v } });
    return json(200, { ok: true, vault: v });
  }
  async function rules(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const list = (Array.isArray(b.rules) ? b.rules : []).slice(0, VAULT.RULES + 1);
    if (list.length > VAULT.RULES) return json(400, { error: `at most ${VAULT.RULES} rules` });
    const clean = list.map((x, i) => cleanRule(x, i)); if (clean.some((x) => !x)) return json(400, { error: `each rule needs a token and numbers in range (at most ${VAULT.MAX_USD} USDC a trade)` });
    const d = await load(w), old = Object.fromEntries((d.rules || []).map((r) => [r.id, r]));
    // a rule that didn't change keeps its progress (when it last bought, whether it already fired)
    d.rules = clean.map((r) => { const o = old[r.id]; return o && JSON.stringify({ ...o, done: 0, lastAt: 0 }) === JSON.stringify({ ...r, done: 0, lastAt: 0 }) ? { ...r, ...(o.done ? { done: o.done } : {}), ...(o.lastAt ? { lastAt: o.lastAt } : {}) } : r; });
    if (typeof b.on === "boolean") d.on = b.on;
    await setDoc(`worldAgentVault/${w}`, d);
    return json(200, { ok: true, rules: d.rules, on: d.on !== false });
  }

  // ---------------- the executor ----------------
  async function state(v, tokens) {
    const F = ["owner()", "paused()", "agentOn()", "maxPerTx()", "spendableToday()", "nextTradeAt()", "usdcBalance()", "feeBalance()", "factory()"];
    const calls = [...F.map((f) => ({ to: v, data: sel(f) })), ...tokens.flatMap((t) => [{ to: v, data: sel("allowed(address)") + pad(t) }, { to: t, data: sel("balanceOf(address)") + pad(v) }, { to: t, data: sel("decimals()") }])];
    const r = await io.calls(calls); if (!r || r.some((x, i) => i < F.length && !x)) return null;
    const o = { owner: lc(A(r[0], 0)), paused: W(r[1], 0) === 1n, agentOn: W(r[2], 0) === 1n, maxUsd: Number(W(r[3], 0)) / 1e6, spendable: Number(W(r[4], 0)) / 1e6, next: Number(W(r[5], 0)) * 1000, usdc: W(r[6], 0), fee: W(r[7], 0), tok: {} };
    tokens.forEach((t, i) => { const k = F.length + i * 3; o.tok[t] = { allowed: W(r[k], 0) === 1n, hold: W(r[k + 1], 0), dec: r[k + 2] ? Number(W(r[k + 2], 0)) : 18 }; });
    return o;
  }
  async function quote(v, t, buy, amt) {
    const [d] = await io.reverts([{ to: v, data: sel("quote(address,bool,uint256)") + pad(t) + u(buy ? 1 : 0) + u(amt) }]);
    const q = sel("QuoteResult(uint256)"); return d && lc(d).startsWith(lc(q)) ? W("0x" + d.slice(q.length), 0) : null;
  }
  const say = (d, e) => { d.log = [...(d.log || []), { at: now(), ...e }].slice(-VAULT.LOG); };
  async function work(w, v, d, key) {
    const live = (d.rules || []).filter((r) => !r.done); if (!live.length || d.on === false) return { w, skip: d.on === false ? "off in the game" : "no rules" };
    const tokens = [...new Set(live.map((r) => r.token))];
    const s = await state(v, tokens); if (!s) return { w, skip: "couldn't read the vault" };
    if (s.owner !== w) return { w, skip: "the vault's owner changed" };
    if (s.paused) return { w, skip: "paused by its owner" };
    if (!s.agentOn) return { w, skip: "the agent is off on the vault" };
    if (s.next && now() < s.next) return { w, skip: "cooling down" };
    for (const r of live) {
      const T = s.tok[r.token]; if (!T || !T.allowed) continue;
      const probe = await quote(v, r.token, true, 1000000n); if (!probe || probe === 0n) continue; // what 1 USDC buys
      const price = 1 / (Number(probe) / 10 ** T.dec);
      const want = decideRule(r, { price, dec: T.dec, hold: T.hold, usdc: s.usdc, maxUsd: s.maxUsd, spendable: s.spendable, now: now() });
      if (!want) continue;
      const amt = want.buy ? BigInt(Math.round(want.usd * 1e6)) : want.amount;
      const out = await quote(v, r.token, want.buy, amt); if (!out || out === 0n) continue;
      const minOut = (out * BigInt(100 - VAULT.SLIP)) / 100n;
      const what = { rule: r.id, kind: r.kind, token: r.token, buy: want.buy, in: amt.toString(), out: out.toString(), price };
      if (!key) { say(d, { ...what, dry: true, why: "ready — the agent's key isn't set on this server" }); return { w, dry: true, ...what }; }
      const tx = await io.send({ to: v, data: sel("trade(address,bool,uint256,uint256)") + pad(r.token) + u(want.buy ? 1 : 0) + u(amt) + u(minOut), key }).catch((e) => ({ ok: false, err: String(e.message || e) }));
      if (tx && tx.ok) { if (r.kind === "dca") r.lastAt = now(); else r.done = now(); say(d, { ...what, tx: tx.hash }); return { w, ...what, tx: tx.hash }; }
      say(d, { ...what, err: String((tx && tx.err) || "reverted").slice(0, 120) }); return { w, err: true };
    }
    return { w, skip: "nothing to do" };
  }
  async function tick(b = {}) {
    const secret = String((globalThis.process && process.env && process.env.CRON_SECRET) || "").trim();
    if (!secret || b.key !== secret) return json(401, { error: "unauthorized" });
    await chain(); const key = VAULT.key() || null, L = ((await one("worldStats/agentVaults")) || {}).list || {};
    const out = [];
    for (const [w, v] of Object.entries(L).slice(0, VAULT.PER_RUN)) {
      const d = await load(w); if (!d.vault || d.vault !== v) continue;
      const before = JSON.stringify(d), r = await work(w, v, d, key).catch((e) => ({ w, err: String(e.message || e).slice(0, 100) }));
      if (JSON.stringify(d) !== before) await setDoc(`worldAgentVault/${w}`, d);
      out.push(r);
    }
    return json(200, { ok: true, live: !!key, runs: out });
  }

  return {
    view, tick,
    async handle(b) {
      if ((b.action === "world-agent-vault-link" || b.action === "world-agent-rules") && deps.shut) { const s = signer(b); if (s.err) return s.err; if (deps.shut(s.wallet)) return json(403, { error: "AGENT DIMENSION is under construction", closed: true }); }
      if (b.action === "world-agent-vault-link") return link(b);
      if (b.action === "world-agent-rules") return rules(b);
      return null;
    },
  };
}
