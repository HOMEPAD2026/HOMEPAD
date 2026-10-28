// api/_world-market.mjs — the Creator Market and the Creator Exchange (b-ec2/3, the hybrid economy):
//
//   Market     a creator lists a blueprint (a My Island build as an ARCBP1 code, world-island.js) for ARCL; a buyer pays,
//              owns it for good and builds it on their island. Not your own; once each.
//   Split      the price: 80 % to the creator, 20 % to the platform (MARKET.CUT). The creator's 80 % waits 14 days
//              (MARKET.HOLD: refunds and disputes) and then lands in their balance: the share the buyer paid with
//              PURCHASED ARCL (bought through the Exchange) as cavail — settleable — and the rest as cplay — spendable in
//              the game, not settled (the owner's rule: CLAUDE.md "standing decisions"; api/_world-ledger.mjs buckets).
//   Exchange   a creator asks to settle cavail (at least MARKET.MIN): it's held at once; a GM looks at it, sets the
//              $ARCIRCLE amount, sends it from the GM's own wallet on Arc and gives the tx; the server reads the receipt
//              (a Transfer of $ARCIRCLE to the creator, at least that amount, not used before) and closes it. The
//              server never holds a key. Turned down: the ARCL goes back to cavail.
//   Admin      GM only: the overview (counters), a wallet's ledger, the settlement queue, listings (hide/show), a refund
//              of a sale still on hold; every admin action in worldEconAudit.
//
//   GET  ?world=market[&q=new|top]            → { items: [{ id, title, price, creator, name, sold, bricks, at }] }
//   GET  ?world=market-me&wallet=0x…          → { owned: [{ id, title, code }], listings, earnings, buckets, settles }
//   GET  ?world=arcl-tx&wallet=0x…            → { list: [{ t, k, n, at, b, ref }] }   (the full ledger, newest first)
//   POST world-market-list   { …sig, title, code, price }            → { item }
//   POST world-market-unlist { …sig, id }                            → { ok }
//   POST world-market-buy    { …sig, id, expectedPrice }             → { owned, code, bal }
//   POST world-settle-ask    { …sig, amount }                        → { request }
//   POST world-econ-admin    { …sig (GM), op, … }                    → overview | wallet (who) | settles | quote | paid | reject | hide | show | refund
//
// Firestore: worldMktItem/<id> · worldStats/mktIndex { ids } · worldMktOwn/<buyer>_<id> · worldMktInv/<w> { ids } ·
// worldMktSale/<id>_<buyer> · worldMktCreator/<w> { items, pending: [saleKey], soldN, gross, elig, play } ·
// worldSettle/<id> · worldStats/settleIndex { ids } · worldSettleTx/<tx> · worldEconAudit/<id> · worldArclBal/platform
import { ARCIRCLE } from "./_world-shop.mjs";
export const MARKET = { CUT: 0.8, REMIX_ORIG: 0.25, HOLD: 14 * 864e5, MIN: 30000, PRICE: [100, 1_000_000], MAX_LISTINGS: 20, CODE_MAX: 120_000, TITLE_MAX: 40, INDEX_MAX: 500 };
const lc = (a) => String(a || "").toLowerCase();
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CODE_RE = /^ARCBP1\.[A-Za-z0-9+/=]+$/;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), ledger, note(w, t, k, n, o), receipt?(tx), randomId?, nameOf?(w) }
export function makeMarket(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps, now = () => deps.now(), L = deps.ledger;
  const one = async (p) => (await getDocs([p]))[p];
  const rid = () => (deps.randomId ? deps.randomId() : Math.random().toString(16).slice(2) + Date.now().toString(16)).replace(/[^0-9a-z]/gi, "").slice(0, 16);
  const short = (w) => (w ? w.slice(0, 6) + "…" + w.slice(-4) : "");
  const gm = (w) => !!(deps.isGM && deps.isGM(w));
  const idOk = (id) => /^[0-9a-z]{6,24}$/.test(String(id || ""));
  // a list doc kept by read-modify-write, checked after writing (two at once can't drop each other's entry)
  async function push(path, id, keep = 0) { for (let k = 0; k < 4; k++) { const d = (await one(path)) || {}, ids = Array.isArray(d.ids) ? d.ids : []; if (ids.includes(id)) return; const next = [id, ...ids]; await setDoc(path, { ...d, ids: keep ? next.slice(0, keep) : next }); if (((await one(path)) || {}).ids?.includes(id)) return; } }
  async function pull(path, id) { const d = (await one(path)) || {}; if (!(d.ids || []).includes(id)) return; await setDoc(path, { ...d, ids: d.ids.filter((x) => x !== id) }); }
  async function audit(actor, action, ref, before, after) { await setDoc(`worldEconAudit/${now().toString(36)}${rid()}`, { actor, action, ref: String(ref || "").slice(0, 80), before: before ?? null, after: after ?? null, at: now() }).catch(() => {}); }
  const pubItem = (x) => ({ id: x.id, title: x.title, price: x.price, creator: short(x.creator), name: x.name || "", sold: x.sold || 0, bricks: x.bricks || 0, at: x.at, status: x.status });

  // ---------------- the market ----------------
  async function list(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const title = String(b.title || "").replace(/[<>]/g, "").trim().slice(0, MARKET.TITLE_MAX), code = String(b.code || "").trim(), price = Math.floor(Number(b.price));
    if (title.length < 2) return json(400, { error: "give it a name" });
    if (!CODE_RE.test(code) || code.length > MARKET.CODE_MAX) return json(400, { error: "that isn't a blueprint code (ARCBP1.…)" });
    if (!(price >= MARKET.PRICE[0] && price <= MARKET.PRICE[1])) return json(400, { error: `a price from ${MARKET.PRICE[0].toLocaleString("en-US")} to ${MARKET.PRICE[1].toLocaleString("en-US")} ARCL` });
    const C = (await one(`worldMktCreator/${w}`)) || {}; if ((C.items || []).length >= MARKET.MAX_LISTINGS) return json(400, { error: `at most ${MARKET.MAX_LISTINGS} listings` });
    const id = rid(), name = deps.nameOf ? await deps.nameOf(w).catch(() => "") : "", bricks = Math.round(((code.length - 7) * 3) / 4 / 5);
    const item = { id, creator: w, name, title, code, price, bricks, sold: 0, at: now(), status: "live" };
    await setDoc(`worldMktItem/${id}`, item); await setDoc(`worldMktCreator/${w}`, { ...C, items: [id, ...(C.items || [])] }); await push("worldStats/mktIndex", id, MARKET.INDEX_MAX);
    return json(200, { ok: true, item: pubItem(item) });
  }
  async function unlist(b) {
    const s = signer(b); if (s.err) return s.err; const it = idOk(b.id) ? await one(`worldMktItem/${b.id}`) : null;
    if (!it || (it.creator !== s.wallet && !gm(s.wallet))) return json(404, { error: "no such listing" });
    await setDoc(`worldMktItem/${it.id}`, { ...it, status: "off" }); await pull("worldStats/mktIndex", it.id);
    if (it.creator !== s.wallet) await audit(s.wallet, "unlist", it.id, "live", "off");
    return json(200, { ok: true });
  }
  async function browse(url) {
    const q = url && url.searchParams ? url.searchParams.get("q") : "", ids = (((await one("worldStats/mktIndex")) || {}).ids || []).slice(0, 200);
    const d = ids.length ? await getDocs(ids.map((i) => `worldMktItem/${i}`)) : {}; let items = ids.map((i) => d[`worldMktItem/${i}`]).filter((x) => x && x.status === "live").map(pubItem);
    if (q === "top") items.sort((a, b) => b.sold - a.sold || b.at - a.at);
    return json(200, { ok: true, items, cut: MARKET.CUT, hold: MARKET.HOLD }, "public, max-age=15");
  }
  async function buy(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet;
    const it = idOk(b.id) ? await one(`worldMktItem/${b.id}`) : null; if (!it || it.status !== "live") return json(404, { error: "that blueprint isn't for sale" });
    if (it.creator === w) return json(400, { error: "it's yours already" });
    if (Math.floor(Number(b.expectedPrice)) !== it.price) return json(409, { error: "the price changed", price: it.price });
    if (await one(`worldMktOwn/${w}_${it.id}`)) return json(409, { error: "you own it already" });
    const v = await L.buckets(w); if (v.bal < it.price) return json(400, { error: "not enough ARCL" });
    // PURCHASED first (that's what pays a creator something settleable); the split decided now, written with the payment
    const parts = L.split(v, it.price, ["purchased", "play", "cplay", "cavail"]), paidPurchased = (parts.purchased || 0) + (parts.cavail || 0);
    const elig = Math.floor(paidPurchased * MARKET.CUT), play = Math.floor(it.price * MARKET.CUT) - elig, platform = it.price - elig - play, t = now(), sk = `${it.id}_${w}`;
    const sale = { id: sk, item: it.id, title: it.title, buyer: w, creator: it.creator, price: it.price, parts, elig, play, platform, at: t, matureAt: t + MARKET.HOLD, status: "pending" };
    const r = await commit([{ create: `worldMktOwn/${w}_${it.id}`, data: { at: t, price: it.price } }, { create: `worldArclSpend/${w}_${Math.floor(t / 1500)}`, data: { at: t } },
      { inc: `worldArclBal/${w}`, fields: { bal: -it.price, spent: it.price } }, ...L.bucketOps(w, parts, -1),
      { inc: "worldArclBal/platform", fields: { bal: platform, earned: platform } }, { inc: `worldMktItem/${it.id}`, fields: { sold: 1 } },
      { set: `worldMktSale/${sk}`, data: sale }, { inc: "worldStats/econ", fields: { sales: it.price, platform } }]);
    if (!r.ok) return json(409, { error: "one moment — or you own it already" });
    const C = (await one(`worldMktCreator/${it.creator}`)) || {}; await setDoc(`worldMktCreator/${it.creator}`, { ...C, pending: [...(C.pending || []), sk], soldN: (C.soldN || 0) + 1, gross: (C.gross || 0) + it.price });
    await push(`worldMktInv/${w}`, it.id);
    if (deps.note) await deps.note(w, "spend", "market:" + it.id, -it.price, { parts, ref: it.creator }).catch(() => {});
    if (L) await L.record("platform", "fee", "market-cut", platform, { ref: sk }).catch(() => {});
    return json(200, { ok: true, owned: it.id, code: it.code, title: it.title, bal: v.bal - it.price });
  }
  /// OBBY / studio assets (2026-10-28, the owner): the same payment for the Studio's prefabs, premium templates and assets —
  /// the buyer pays it all at once (PURCHASED first), 80 % goes to the creator(s) on the same 14-day hold and buckets, 20 %
  /// to the platform. A remix's creator share is split with its original maker (REMIX_ORIG of it, the original's own
  /// pending sale). own: the marker that the buyer owns it (created once). → { ok } | { error }
  async function paySale(w, it, own) {
    if (!(it.price > 0)) return { error: "free" }; if (it.creator === w) return { error: "it's yours already" };
    const v = await L.buckets(w); if (v.bal < it.price) return { error: "not enough ARCL", bal: v.bal };
    const parts = L.split(v, it.price, ["purchased", "play", "cplay", "cavail"]), paidPurchased = (parts.purchased || 0) + (parts.cavail || 0);
    const elig = Math.floor(paidPurchased * MARKET.CUT), play = Math.floor(it.price * MARKET.CUT) - elig, platform = it.price - elig - play, t = now(), sk = `${it.id}_${w}`;
    const orig = it.orig && it.orig !== it.creator ? it.orig : "", oE = orig ? Math.floor(elig * MARKET.REMIX_ORIG) : 0, oP = orig ? Math.floor(play * MARKET.REMIX_ORIG) : 0;
    const sale = { id: sk, item: it.id, title: it.title, buyer: w, creator: it.creator, price: it.price, parts, elig: elig - oE, play: play - oP, platform, at: t, matureAt: t + MARKET.HOLD, status: "pending", kind: it.kind || "studio" };
    const r = await commit([{ create: own, data: { at: t, price: it.price } }, { create: `worldArclSpend/${w}_${Math.floor(t / 1500)}`, data: { at: t } },
      { inc: `worldArclBal/${w}`, fields: { bal: -it.price, spent: it.price } }, ...L.bucketOps(w, parts, -1),
      { inc: "worldArclBal/platform", fields: { bal: platform, earned: platform } }, { set: `worldMktSale/${sk}`, data: sale },
      ...(orig ? [{ set: `worldMktSale/${sk}_o`, data: { ...sale, id: sk + "_o", creator: orig, elig: oE, play: oP, platform: 0, remixOf: it.creator } }] : []), { inc: "worldStats/econ", fields: { sales: it.price, platform } }]);
    if (!r.ok) return { error: "one moment — or you own it already" };
    for (const [c, key] of [[it.creator, sk], ...(orig ? [[orig, sk + "_o"]] : [])]) { const C = (await one(`worldMktCreator/${c}`)) || {}; await setDoc(`worldMktCreator/${c}`, { ...C, pending: [...(C.pending || []), key], soldN: (C.soldN || 0) + 1, gross: (C.gross || 0) + it.price }); }
    if (deps.note) await deps.note(w, "spend", (it.kind || "studio") + ":" + it.id, -it.price, { parts, ref: it.creator }).catch(() => {});
    if (L) await L.record("platform", "fee", "studio-cut", platform, { ref: sk }).catch(() => {});
    return { ok: true, bal: v.bal - it.price };
  }
  /// a platform charge (AI credits over the free quota): the ARCL goes to the platform, in the ledger. → { ok } | { error }
  async function charge(w, n, ref) {
    n = Math.floor(Number(n)); if (!(n > 0)) return { error: "nothing to pay" }; const v = await L.buckets(w); if (v.bal < n) return { error: "not enough ARCL", bal: v.bal };
    const parts = L.split(v, n, ["play", "purchased", "cplay", "cavail"]), t = now();
    const r = await commit([{ create: `worldArclSpend/${w}_${Math.floor(t / 1500)}`, data: { at: t } }, { inc: `worldArclBal/${w}`, fields: { bal: -n, spent: n } }, ...L.bucketOps(w, parts, -1), { inc: "worldArclBal/platform", fields: { bal: n, earned: n } }]);
    if (!r.ok) return { error: "one moment — try again" };
    if (deps.note) await deps.note(w, "spend", String(ref || "credit").slice(0, 40), -n, { parts }).catch(() => {});
    if (L) await L.record("platform", "fee", "ai-credit", n, { ref: w }).catch(() => {});
    return { ok: true, bal: v.bal - n };
  }
  // a creator's sales past their hold: into the balance (cavail and cplay), each once (a create marker)
  async function mature(w) {
    const C = (await one(`worldMktCreator/${w}`)) || {}, keys = C.pending || []; if (!keys.length) return C;
    const d = await getDocs(keys.map((k) => `worldMktSale/${k}`)), t = now(), left = [];
    for (const k of keys) { const x = d[`worldMktSale/${k}`]; if (!x || x.status !== "pending") continue; if (x.matureAt > t) { left.push(k); continue; }
      const n = x.elig + x.play; if (!(await commit([{ create: `worldMktPaid/${k}`, data: { at: t } }, { inc: `worldArclBal/${w}`, fields: { bal: n, earned: n } }, ...L.intoOps(w, "cavail", x.elig), ...L.intoOps(w, "cplay", x.play)])).ok) continue;
      await setDoc(`worldMktSale/${k}`, { ...x, status: "paid", paidAt: t });
      if (deps.note) await deps.note(w, "earn", "market-sale", n, { parts: { cavail: x.elig, cplay: x.play }, ref: k }).catch(() => {});
      C.elig = (C.elig || 0) + x.elig; C.play = (C.play || 0) + x.play; }
    C.pending = left; await setDoc(`worldMktCreator/${w}`, C); return C;
  }
  async function me(w) {
    const C = await mature(w), inv = ((await one(`worldMktInv/${w}`)) || {}).ids || [], items = C.items || [];
    const d = await getDocs([...inv.map((i) => `worldMktItem/${i}`), ...items.map((i) => `worldMktItem/${i}`), ...(C.pending || []).map((k) => `worldMktSale/${k}`)]);
    const owned = inv.map((i) => d[`worldMktItem/${i}`]).filter(Boolean).map((x) => ({ id: x.id, title: x.title, code: x.code, name: x.name || "" }));
    const listings = items.map((i) => d[`worldMktItem/${i}`]).filter(Boolean).map(pubItem);
    const pend = (C.pending || []).map((k) => d[`worldMktSale/${k}`]).filter(Boolean), sum = (f) => pend.reduce((a, x) => a + (x[f] || 0), 0);
    const S = ((await one(`worldSettleMine/${w}`)) || {}).ids || [], sd = S.length ? await getDocs(S.slice(0, 20).map((i) => `worldSettle/${i}`)) : {};
    return json(200, { ok: true, owned, listings, earnings: { pendingElig: sum("elig"), pendingPlay: sum("play"), nextAt: pend.length ? Math.min(...pend.map((x) => x.matureAt)) : 0, soldN: C.soldN || 0, gross: C.gross || 0, elig: C.elig || 0, play: C.play || 0 },
      buckets: await L.buckets(w), settles: S.slice(0, 20).map((i) => sd[`worldSettle/${i}`]).filter(Boolean).map(pubSettle), min: MARKET.MIN, cut: MARKET.CUT, hold: MARKET.HOLD }, "no-store");
  }

  // ---------------- the Creator Exchange ----------------
  const pubSettle = (r) => ({ id: r.id, amount: r.amount, status: r.status, at: r.at, quote: r.quote || null, tx: r.tx || "", reason: r.reason || "", doneAt: r.doneAt || 0 });
  async function settleAsk(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet; await mature(w);
    const amount = Math.floor(Number(b.amount)); if (!(amount >= MARKET.MIN)) return json(400, { error: `the least is ${MARKET.MIN.toLocaleString("en-US")} ARCL` });
    const v = await L.buckets(w); if (amount > v.cavail) return json(400, { error: "that's more than your settleable creator earnings", cavail: v.cavail });
    const mine = ((await one(`worldSettleMine/${w}`)) || {}).ids || [], open = mine.length ? (await one(`worldSettle/${mine[0]}`)) : null;
    if (open && ["requested", "approved"].includes(open.status)) return json(409, { error: "you have a settlement waiting already" });
    const id = rid(), t = now();
    if (!(await commit([{ create: `worldSettleLock/${w}_${Math.floor(t / 3000)}`, data: { at: t } }, { inc: `worldArclBal/${w}`, fields: { bal: -amount, held: amount } }, { inc: `worldArclBkt/${w}`, fields: { cavail: -amount } }])).ok) return json(429, { error: "one moment" });
    const rec = { id, w, amount, status: "requested", at: t }; await setDoc(`worldSettle/${id}`, rec);
    await push(`worldSettleMine/${w}`, id, 50); await push("worldStats/settleIndex", id, 1000);
    if (L) await L.record(w, "hold", "creator-settle", -amount, { b: { cavail: amount }, ref: id }).catch(() => {});
    return json(200, { ok: true, request: pubSettle(rec) });
  }

  // ---------------- the team's side ----------------
  async function admin(b) {
    const s = signer(b); if (s.err) return s.err; const actor = s.wallet; if (!gm(actor)) return json(403, { error: "for the team" });
    const op = String(b.op || "");
    if (op === "overview") {
      const st = await L.stats(14), plat = (await one("worldArclBal/platform")) || {}, idx = ((await one("worldStats/settleIndex")) || {}).ids || [], sd = idx.length ? await getDocs(idx.slice(0, 200).map((i) => `worldSettle/${i}`)) : {};
      const S = idx.slice(0, 200).map((i) => sd[`worldSettle/${i}`]).filter(Boolean), q = (k) => S.filter((x) => x.status === k).reduce((a, x) => a + x.amount, 0);
      const mk = ((await one("worldStats/mktIndex")) || {}).ids || [];
      return json(200, { ok: true, all: st.all, days: st.days, platform: plat.bal || 0, listings: mk.length, settle: { requested: q("requested"), approved: q("approved"), completed: q("completed"), n: S.length } });
    }
    if (op === "wallet") { const w = lc(b.who); // (not b.wallet: that is the signer)
      if (!/^0x[0-9a-f]{40}$/.test(w) && w !== "platform") return json(400, { error: "which wallet?" }); return json(200, { ok: true, w, buckets: await L.buckets(w), list: await L.history(w, 300) }); }
    if (op === "settles") { const idx = ((await one("worldStats/settleIndex")) || {}).ids || [], d = idx.length ? await getDocs(idx.slice(0, 200).map((i) => `worldSettle/${i}`)) : {}; return json(200, { ok: true, list: idx.slice(0, 200).map((i) => d[`worldSettle/${i}`]).filter(Boolean).map((r) => ({ ...pubSettle(r), w: r.w })) }); }
    if (op === "audit") { const list = deps.queryDocs ? await deps.queryDocs("worldEconAudit", "actor", lc(b.actor || actor), 300).catch(() => []) : []; return json(200, { ok: true, list: list.sort((a, c) => c.at - a.at) }); }
    if (op === "hide" || op === "show") { const it = idOk(b.id) ? await one(`worldMktItem/${b.id}`) : null; if (!it) return json(404, { error: "no such listing" }); const st = op === "hide" ? "hidden" : "live"; await setDoc(`worldMktItem/${it.id}`, { ...it, status: st }); if (st === "live") await push("worldStats/mktIndex", it.id, MARKET.INDEX_MAX); else await pull("worldStats/mktIndex", it.id); await audit(actor, op, it.id, it.status, st); return json(200, { ok: true }); }
    if (op === "refund") { // a sale still on hold: the buyer's ARCL back into the buckets it came from, the blueprint taken back, the creator's share cancelled
      const k = String(b.sale || ""), x = await one(`worldMktSale/${k}`); if (!x) return json(404, { error: "no such sale" }); if (x.status !== "pending") return json(409, { error: "only a sale still on hold can be refunded" });
      if (!(await commit([{ create: `worldMktPaid/${k}`, data: { at: now(), refund: true } }, { inc: `worldArclBal/${x.buyer}`, fields: { bal: x.price } }, ...L.bucketOps(x.buyer, x.parts || {}, +1), { inc: "worldArclBal/platform", fields: { bal: -x.platform } }, { del: `worldMktOwn/${x.buyer}_${x.item}` }])).ok) return json(409, { error: "it's being paid out" });
      await setDoc(`worldMktSale/${k}`, { ...x, status: "refunded", refundAt: now(), by: actor }); await pull(`worldMktInv/${x.buyer}`, x.item);
      const C = (await one(`worldMktCreator/${x.creator}`)) || {}; await setDoc(`worldMktCreator/${x.creator}`, { ...C, pending: (C.pending || []).filter((p) => p !== k) });
      if (L) await L.record(x.buyer, "earn", "market-refund", x.price, { b: x.parts, ref: k }).catch(() => {});
      await audit(actor, "refund", k, "pending", "refunded"); return json(200, { ok: true });
    }
    // a settlement: quote (the $ARCIRCLE amount, fixed now), paid (the GM's tx on Arc, read back), reject
    const r = idOk(b.id) ? await one(`worldSettle/${b.id}`) : null; if (!r) return json(404, { error: "no such settlement" });
    if (op === "quote") { if (r.status !== "requested") return json(409, { error: "already " + r.status }); const arc = Math.floor(Number(b.arc)); if (!(arc > 0)) return json(400, { error: "how much $ARCIRCLE?" });
      const next = { ...r, status: "approved", quote: { arc, src: String(b.src || "").slice(0, 80), at: now(), by: actor } }; await setDoc(`worldSettle/${r.id}`, next); await audit(actor, "quote", r.id, r.status, next.quote); return json(200, { ok: true, request: pubSettle(next) }); }
    if (op === "paid") {
      if (r.status !== "approved") return json(409, { error: "quote it first" }); const tx = lc(b.tx); if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
      if (!deps.receipt) return json(503, { error: "the chain can't be read right now" }); const rc = await deps.receipt(tx).catch(() => null);
      if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet — try again in a moment" }); if (rc.status !== "0x1") return json(400, { error: "that transaction failed" });
      const sent = (rc.logs || []).filter((l) => lc(l.address) === lc(ARCIRCLE) && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[2]) === pad32(r.w)).reduce((x, l) => x + BigInt(l.data), 0n);
      if (sent < BigInt(r.quote.arc) * 10n ** 18n) return json(400, { error: "that transfer to the creator is less than the quote" });
      if (!(await commit([{ create: `worldSettleTx/${tx}`, data: { id: r.id, at: now() } }, { inc: `worldArclBal/${r.w}`, fields: { held: -r.amount, spent: r.amount } }, { inc: "worldStats/econ", fields: { settled: r.amount, settledArc: r.quote.arc } }])).ok) return json(409, { error: "this transaction was already used" });
      const next = { ...r, status: "completed", tx, from: lc(rc.from || ""), doneAt: now(), by: actor }; await setDoc(`worldSettle/${r.id}`, next);
      if (L) await L.record(r.w, "settle", "creator-settle", -r.amount, { ref: r.id + " " + tx }).catch(() => {});
      await audit(actor, "paid", r.id, "approved", { tx, arc: r.quote.arc }); return json(200, { ok: true, request: pubSettle(next) });
    }
    if (op === "reject") { if (!["requested", "approved"].includes(r.status)) return json(409, { error: "already " + r.status });
      await commit([{ inc: `worldArclBal/${r.w}`, fields: { bal: r.amount, held: -r.amount } }, { inc: `worldArclBkt/${r.w}`, fields: { cavail: r.amount } }]);
      const next = { ...r, status: "rejected", reason: String(b.note || "turned down").slice(0, 200), doneAt: now(), by: actor }; await setDoc(`worldSettle/${r.id}`, next);
      if (L) await L.record(r.w, "unhold", "creator-settle", r.amount, { b: { cavail: r.amount }, ref: r.id }).catch(() => {});
      await audit(actor, "reject", r.id, r.status, next.reason); return json(200, { ok: true, request: pubSettle(next) }); }
    return json(400, { error: "overview, wallet, settles, audit, hide, show, refund, quote, paid or reject" });
  }

  return {
    paySale, charge,
    async read(v, url) {
      const w = lc(url && url.searchParams ? url.searchParams.get("wallet") : "");
      if (v === "market") return browse(url);
      if (v === "market-me") { if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet must be an address" }); return me(w); }
      if (v === "arcl-tx") { if (!/^0x[0-9a-f]{40}$/.test(w)) return json(400, { error: "wallet must be an address" }); return json(200, { ok: true, list: await L.history(w, 300), buckets: await L.buckets(w) }, "no-store"); }
      return null;
    },
    async handle(b) {
      if (b.action === "world-market-list") return list(b);
      if (b.action === "world-market-unlist") return unlist(b);
      if (b.action === "world-market-buy") return buy(b);
      if (b.action === "world-settle-ask") return settleAsk(b);
      if (b.action === "world-econ-admin") return admin(b);
      return null;
    },
  };
}
