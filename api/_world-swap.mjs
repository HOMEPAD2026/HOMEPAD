// api/_world-swap.mjs — the Exchange: $ARCL (the game's balance) ⇄ $ARCIRCLE (the token on Arc), by request for now.
// A player asks to swap an amount; the team compares both markets and settles each request by hand (a GM wallet:
// isGM). Later the rate and the settling become automatic; the requests and their record stay the same.
//
//   ARCL → $ARCIRCLE: the ARCL is held from the player's balance when they ask (so it can't be spent twice); the GM
//                     sends $ARCIRCLE on Arc and marks it done (with the amount and the tx), or turns it down and the
//                     ARCL goes back.
//   $ARCIRCLE → ARCL: the player sends $ARCIRCLE to the exchange desk on Arc first and gives the tx; the server
//                     checks the transfer (from them, to the desk, at least the amount) and that the tx isn't used
//                     twice; the GM then credits the ARCL (or turns it down and returns the tokens on Arc by hand).
//
//   GET  ?world=swap&wallet=0x…                           → { ok, desk, limits, arcl, arcircle, mine: [requests], gm }
//   POST { action: "world-swap-ask", …signature, dir, amount, tx? }   → { request }
//   POST { action: "world-swap-cancel", …signature, id }             → (a pending ARCL → $ARCIRCLE: the ARCL back)
//   POST { action: "world-swap-admin", …signature (GM), op: list | done | reject, id?, give?, gmTx?, note? }
//
// Firestore: worldSwap/<id> · worldSwapMine/<wallet> { ids } · worldSwapQ/<yyyy-mm> { ids } · worldSwapTx/<tx>
import { ARCIRCLE } from "./_world-shop.mjs";
export const SWAP = {
  // where $ARCIRCLE for ARCL is sent (the team's exchange desk wallet on Arc)
  DESK: "0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1",
  MIN: { arcl: 1000, arc: 1000 }, MAX: { arcl: 50_000_000, arc: 100_000_000 },
  KEEP: 30, // a player's own list: the latest 30
};
const DIRS = { arcl2arc: { from: "arcl", to: "arc" }, arc2arcl: { from: "arc", to: "arcl" } };
const lc = (a) => String(a || "").toLowerCase();
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), tokenBalance?, receipt?, randomId? }
export function makeSwap(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps, now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const rid = () => (deps.randomId ? deps.randomId() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/[^0-9a-z]/gi, "").slice(0, 24);
  const month = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 7);
  const arclOf = async (w) => { const b = (await one(`worldArclBal/${w}`)) || {}; return { bal: Math.floor(b.bal || 0), held: Math.floor(b.held || 0) }; };
  const arcOf = async (w) => { try { return deps.tokenBalance ? Number(BigInt(await deps.tokenBalance(ARCIRCLE, w)) / 10n ** 18n) : null; } catch { return null; } };
  const pub = (r) => ({ id: r.id, dir: r.dir, amount: r.amount, status: r.status, at: r.at, doneAt: r.doneAt || 0, give: r.give || 0, gmTx: r.gmTx || "", tx: r.tx || "", note: r.note || "", reason: r.reason || "" });
  async function listOf(ids) { const d = ids.length ? await getDocs(ids.map((i) => `worldSwap/${i}`)) : {}; return ids.map((i) => d[`worldSwap/${i}`]).filter(Boolean); }
  // a list doc kept by read-modify-write: re-read after writing so two at once can't drop each other's entry
  async function push(path, id, keep = 0) {
    for (let k = 0; k < 4; k++) { const d = (await one(path)) || {}, ids = Array.isArray(d.ids) ? d.ids : []; if (ids.includes(id)) return;
      const next = [id, ...ids]; await setDoc(path, { ids: keep ? next.slice(0, keep) : next }); const chk = (await one(path)) || {}; if ((chk.ids || []).includes(id)) return; }
  }

  async function view(w) {
    const [arcl, arc, mine] = await Promise.all([arclOf(w), arcOf(w), one(`worldSwapMine/${w}`)]);
    const reqs = await listOf(((mine && mine.ids) || []).slice(0, SWAP.KEEP));
    return json(200, { ok: true, desk: SWAP.DESK, token: ARCIRCLE, limits: { min: SWAP.MIN, max: SWAP.MAX }, arcl, arcircle: arc, mine: reqs.map(pub), gm: !!(deps.isGM && deps.isGM(w)) });
  }
  async function ask(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, dir = String(b.dir || ""), D = DIRS[dir]; if (!D) return json(400, { error: "which way?" });
    const amount = Math.floor(Number(b.amount)); if (!Number.isFinite(amount) || amount < SWAP.MIN[D.from]) return json(400, { error: `the least is ${SWAP.MIN[D.from].toLocaleString("en-US")}` });
    if (amount > SWAP.MAX[D.from]) return json(400, { error: `the most at once is ${SWAP.MAX[D.from].toLocaleString("en-US")}` });
    // one open request at a time
    const mine = (await one(`worldSwapMine/${w}`)) || {}, open = (await listOf((mine.ids || []).slice(0, 5))).find((r) => r.status === "pending");
    if (open) return json(409, { error: "you have a request waiting already", id: open.id });
    const id = rid(), t = now(), rec = { id, w, dir, amount, status: "pending", at: t };
    if (dir === "arcl2arc") {
      const a = await arclOf(w); if (a.bal < amount) return json(400, { error: "not enough ARCL" });
      // held in the same write as a lock (two at once can't both spend the same balance)
      if (!(await commit([{ create: `worldSwapLock/${w}_${Math.floor(t / 3000)}`, data: { at: t } }, { inc: `worldArclBal/${w}`, fields: { bal: -amount, held: amount } }])).ok) return json(429, { error: "one moment" });
    } else {
      const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "paste the transaction hash of your transfer to the exchange desk" });
      const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
      if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" });
      if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
      const paid = (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(SWAP.DESK)).reduce((x, l) => x + BigInt(l.data), 0n);
      if (paid < BigInt(amount) * 10n ** 18n) return json(400, { error: "that transfer to the exchange desk is less than the amount" });
      if (!(await commit([{ create: `worldSwapTx/${tx}`, data: { w, id, at: t } }])).ok) return json(409, { error: "this transaction was already used" });
      rec.tx = tx;
    }
    await setDoc(`worldSwap/${id}`, rec);
    await push(`worldSwapMine/${w}`, id, SWAP.KEEP); await push(`worldSwapQ/${month(t)}`, id);
    return json(200, { ok: true, request: pub(rec) });
  }
  async function cancel(b) {
    const s = signer(b); if (s.err) return s.err;
    const r = await one(`worldSwap/${String(b.id || "").replace(/[^0-9a-z]/gi, "")}`);
    if (!r || r.w !== s.wallet) return json(404, { error: "no such request" });
    if (r.status !== "pending") return json(409, { error: "it's not waiting any more" });
    if (r.dir !== "arcl2arc") return json(400, { error: "a $ARCIRCLE transfer can't be taken back here: the team will return it" });
    if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: "cancel" } }])).ok) return json(409, { error: "it's being settled" });
    await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }]);
    const next = { ...r, status: "cancelled", doneAt: now() }; await setDoc(`worldSwap/${r.id}`, next);
    return json(200, { ok: true, request: pub(next) });
  }
  // the team's side: the queue, settle one, turn one down
  async function admin(b) {
    const s = signer(b); if (s.err) return s.err; if (!(deps.isGM && deps.isGM(s.wallet))) return json(403, { error: "for the team" });
    const op = String(b.op || "");
    if (op === "list") {
      const t = now(), ks = [month(t), month(t - 32 * 864e5)], d = await getDocs(ks.map((k) => `worldSwapQ/${k}`));
      const ids = [...new Set(ks.flatMap((k) => (d[`worldSwapQ/${k}`] || {}).ids || []))].slice(0, 200), list = await listOf(ids);
      return json(200, { ok: true, list: list.map((r) => ({ ...pub(r), w: r.w })) });
    }
    const r = await one(`worldSwap/${String(b.id || "").replace(/[^0-9a-z]/gi, "")}`); if (!r) return json(404, { error: "no such request" });
    if (r.status !== "pending") return json(409, { error: "already " + r.status });
    if (!(await commit([{ create: `worldSwapEnd/${r.id}`, data: { at: now(), by: s.wallet } }])).ok) return json(409, { error: "it's being settled" });
    const note = String(b.note || "").slice(0, 200);
    if (op === "done") {
      const give = Math.floor(Number(b.give)); if (!(give > 0)) { await commit([{ del: `worldSwapEnd/${r.id}` }]).catch(() => {}); return json(400, { error: "how much was given?" }); }
      if (r.dir === "arcl2arc") { const gmTx = lc(b.gmTx); if (gmTx && !/^0x[0-9a-f]{64}$/.test(gmTx)) { await commit([{ del: `worldSwapEnd/${r.id}` }]).catch(() => {}); return json(400, { error: "that isn't a transaction hash" }); }
        await commit([{ inc: `worldArclBal/${r.w}`, fields: { held: -r.amount, spent: r.amount } }]); r.gmTx = gmTx; }
      else await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: give, earned: give } }]);
      const next = { ...r, status: "done", give, note, doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
      return json(200, { ok: true, request: { ...pub(next), w: r.w } });
    }
    if (op === "reject") {
      if (r.dir === "arcl2arc") await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }]);
      const next = { ...r, status: "rejected", reason: note || "turned down", doneAt: now(), by: s.wallet }; await setDoc(`worldSwap/${r.id}`, next);
      return json(200, { ok: true, request: { ...pub(next), w: r.w } });
    }
    await commit([{ del: `worldSwapEnd/${r.id}` }]).catch(() => {}); return json(400, { error: "list, done or reject" });
  }
  return {
    view,
    async handle(b) {
      if (b.action === "world-swap-ask") return ask(b);
      if (b.action === "world-swap-cancel") return cancel(b);
      if (b.action === "world-swap-admin") return admin(b);
      return null;
    },
  };
}
