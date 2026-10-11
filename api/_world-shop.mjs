// api/_world-shop.mjs — ARCIRCLE World's economy: ARCL (the in-game points), the shop, and $ARCIRCLE payments.
//
// ARCL is earned only for things the server can check (a daily check-in, beating a scammer stage, holding $ARCIRCLE,
// launching a coin, an island that grew, likes other wallets gave, stamps left for others), at most DAILY_CAP a day.
// It's spent on cosmetics. It can't be bought, and it can't be exchanged yet: EXCHANGE.open stays false until the rate
// and rules are set (then one switch here, plus a claim contract that gets audited first).
//
// $ARCIRCLE payments: the player's own wallet sends $ARCIRCLE to ArcircleFeeBurn (a plain ERC-20 transfer they sign).
// The server checks the receipt (a Transfer of at least the quoted amount, from that wallet, to FeeBurn, not used
// before) and grants the item. FeeBurn's flush — run hourly by api/_orders.mjs — burns 50% (burnBps 5000) and sends
// the rest to the ARCIRCLE PAD treasury; neither can change. Prices are in USD, quoted in $ARCIRCLE for 10 minutes.
//
//   GET  ?world=shop[&wallet=]   catalog, prices, what the wallet owns, the plaza, FeeBurn, the exchange settings
//   GET  ?world=arcl&wallet=      the wallet's ARCL: balance, today, streak, what's been earned, history
//   GET  ?world=arcl-top          this week's top earners
//   GET  ?world=plaza             the featured island and the coin on the plaza billboard right now
//   POST world-arcl-claim { …signature, kind, answer?, coin? }    earn (each kind checked here)
//   POST world-arcl-spend { …signature, item, target? }          buy with ARCL
//   POST world-pay-quote  { …signature, item, target? }          a $ARCIRCLE price, good for 10 minutes
//   POST world-pay-confirm { …signature, quote, tx }             the receipt → the item
//   POST world-arcl-notify { …signature, on }                     tell me when the exchange opens
// Firestore: worldArcl/<w> · worldArclOnce/<w>_<kind> · worldArclDay/<w>_<day> · worldArclWeek/<week>_<w> · worldOwn/<w>
//            worldPayQuote/<id> · worldPayTx/<hash> · worldStats/plaza · worldStats/arclWeek_<week> · worldArclNotify/<w>
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
export const FEE_BURN = "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034"; // ArcircleFeeBurn on Arc: burnBps 5000, treasury 0xa066…02F8
export const DAILY_CAP = 300;
export const QUOTE_MS = 10 * 60e3;
// the exchange: nothing is decided yet — the page shows these as "not set"
export const EXCHANGE = { open: false, rate: null, minClaim: null, startsAt: null, budget: null };

// what ARCL is earned for (each checked in claim())
export const EARN = [
  { kind: "daily", n: 20, label: "Daily check-in", more: "+5 a day of streak, up to +30" },
  ...["phisher", "airdrop", "honeypot", "doppel", "golem", "dragon"].map((id, i) => ({ kind: "stage:" + id, n: 30, label: `Beat scammer stage ${i + 1}` })),
  { kind: "hold", n: 50, label: "Hold $ARCIRCLE" },
  { kind: "launch", n: 100, label: "Launch a coin on ArcPad" },
  { kind: "isle20", n: 20, label: "Island: 20 bricks" }, { kind: "isle100", n: 40, label: "Island: 100 bricks" }, { kind: "isle300", n: 80, label: "Island: 300 bricks" },
  { kind: "res1", n: 30, label: "Island: first resident" }, { kind: "res5", n: 60, label: "Island: 5 residents" },
  { kind: "liked1", n: 10, label: "A like from another player" }, { kind: "liked10", n: 40, label: "10 likes" }, { kind: "liked50", n: 120, label: "50 likes" },
  { kind: "stamp", n: 5, label: "Leave a stamp on someone's island", more: "up to 3 a day" },
];
const EARN_BY = Object.fromEntries(EARN.map((e) => [e.kind, e]));
// the scammer stages: the answer that beats each (the game's FIGHTS)
const STAGE_WIN = { phisher: 1, airdrop: 1, honeypot: 1, doppel: 1, golem: 1, dragon: 1 };

// the shop. usd: price in $ARCIRCLE (quoted at the time); arcl: price in ARCL (null = $ARCIRCLE only)
export const CATALOG = [
  // island styles: the island's look — ground, cliffs, waterfalls, trees around the edge, the sea and the sky
  { id: "style-grass", cat: "island", name: "Grass Island", line: "A cozy island full of greenery.", usd: 5, arcl: 1500 },
  { id: "style-tropical", cat: "island", name: "Tropical Island", line: "Palm trees and crystal sea.", usd: 8, arcl: 2000 },
  { id: "style-stone", cat: "island", name: "Stone Island", line: "A grand island of ancient ruins.", usd: 10, arcl: 2500 },
  { id: "style-snow", cat: "island", name: "Snow Island", line: "A peaceful winter island.", usd: 12, arcl: 3000 },
  { id: "style-sakura", cat: "island", name: "Sakura Island", line: "Cherry blossoms in the sky.", usd: 12, arcl: 3000 },
  { id: "style-desert", cat: "island", name: "Desert Island", line: "A warm island under the sun.", usd: 20, arcl: 5000 },
  { id: "style-ocean", cat: "island", name: "Ocean Island", line: "Surrounded by the endless sea.", usd: 20, arcl: 5000 },
  { id: "style-aurora", cat: "island", name: "Aurora Island", line: "Green and purple lights in the sky.", usd: 40, arcl: 10000 },
  { id: "style-celestial", cat: "island", name: "Celestial Island", line: "A heavenly island above the clouds.", usd: 40, arcl: 10000 },
  { id: "style-volcano", cat: "island", name: "Volcano Island", line: "A powerful island of fire.", usd: 80, arcl: 20000 },
  { id: "isle48", cat: "island", name: "Island expansion 48×48", line: "More room: a 48×48 island.", usd: 3, arcl: 1500 },
  { id: "isle64", cat: "island", name: "Island expansion 64×64", line: "The biggest island: 64×64 and taller builds.", usd: 8, arcl: null, needs: "isle48" },
  // material bricks: each unlocks one brick in the builder
  { id: "brick-grass", cat: "bricks", name: "Grass Brick", line: "A natural base for your island.", usd: 0.5, arcl: 100 },
  { id: "brick-stone", cat: "bricks", name: "Stone Brick", line: "Strong and timeless.", usd: 1, arcl: 200 },
  { id: "brick-wood", cat: "bricks", name: "Wood Brick", line: "Warm and cozy.", usd: 1, arcl: 300 },
  { id: "brick-metal", cat: "bricks", name: "Metal Brick", line: "Modern and reliable.", usd: 2, arcl: 500 },
  { id: "brick-glass", cat: "bricks", name: "Glass Brick", line: "Let the light in.", usd: 3, arcl: 800 },
  { id: "brick-neon", cat: "bricks", name: "Neon Brick", line: "Light up your island.", usd: 4, arcl: 1000 },
  { id: "brick-crystal", cat: "bricks", name: "Crystal Brick", line: "A touch of magic.", usd: 8, arcl: 2000 },
  { id: "brick-gold", cat: "bricks", name: "Gold Brick", line: "Pure value.", usd: 20, arcl: 5000 },
  { id: "brick-cyber", cat: "bricks", name: "Cyber Brick", line: "Technology for tomorrow.", usd: 40, arcl: 10000 },
  { id: "brick-arcadia", cat: "bricks", name: "Arcadia Brick", line: "The ultimate decoration.", usd: 80, arcl: 20000 },
  // brick packs: a few themed pieces each
  { id: "pack-neon", cat: "bricks", name: "Neon City pack", line: "Glowing panels, neon signs, holo screens and a light pillar.", usd: 3, arcl: 800 },
  { id: "pack-ocean", cat: "bricks", name: "Ocean pack", line: "Sand, coral, a palm, a lighthouse.", usd: 3, arcl: 800 },
  { id: "pack-space", cat: "bricks", name: "Space Station pack", line: "Hull plates, portholes, an antenna and a satellite dish.", usd: 3, arcl: 800 },
  // style: how you look in the world
  { id: "plate-gold", cat: "style", name: "Gold name tag", line: "Your name in gold over your head.", usd: 1, arcl: 200 },
  { id: "plate-pink", cat: "style", name: "Pink name tag", line: "Your name in pink.", usd: 1, arcl: 200 },
  { id: "plate-green", cat: "style", name: "Green name tag", line: "Your name in ARCIRCLE green.", usd: 1, arcl: 200 },
  { id: "plate-purple", cat: "style", name: "Purple name tag", line: "Your name in purple.", usd: 1, arcl: 200 },
  { id: "plate-flame", cat: "style", name: "Flame name tag", line: "Your name in fiery orange.", usd: 2, arcl: 400 },
  { id: "trail-cyan", cat: "style", name: "Cyan board trail", line: "A cyan light trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-gold", cat: "style", name: "Gold board trail", line: "A gold trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-pink", cat: "style", name: "Pink board trail", line: "A pink trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-rainbow", cat: "style", name: "Rainbow board trail", line: "Every colour, cycling behind your hoverboard.", usd: 4, arcl: 1000 },
  { id: "rename", cat: "style", name: "Name change", line: "Change your name once more (the first change is free).", usd: 0.5, arcl: 100, use: true },
  // plaza: be seen in the hub
  { id: "feature-isle", cat: "plaza", name: "Island of the day", line: "Your island on the plaza screen for 24 hours, with a Visit button.", usd: 5, arcl: null, use: true, hours: 24 },
  { id: "billboard", cat: "plaza", name: "Plaza billboard", line: "An ArcPad coin on the plaza billboard for 6 hours.", usd: 3, arcl: null, use: true, hours: 6, target: "coin" },
  { id: "lot13", cat: "plaza", name: "Premium coin lot", line: "Your coin's Coin City lot grows to 13×13, with a rooftop spotlight. For the coin's creator.", usd: 10, arcl: null, target: "mycoin" },
];
const ITEM = Object.fromEntries(CATALOG.map((x) => [x.id, x]));

const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
function isoWeek(t) {
  const d = new Date(t + 9 * 3600e3); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`;
}
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);

/// deps: { getDocs, setDoc, commit, json, now, signer(b) → { wallet } | { err }, launchRecord?, tokenBalance?, arcPrice?, receipt?, randomId? }
export function makeShop(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];

  async function own(w) { return (await one(`worldOwn/${w}`)) || { items: [], renames: 0, lots: [] }; }
  async function ledger(w) { return (await one(`worldArcl/${w}`)) || { bal: 0, earned: 0, spent: 0, streak: 0, lastDay: "", got: [], log: [] }; }
  async function note(w, t, k, n) {
    // the ledger's history (the balance itself moves with atomic increments)
    const L = await ledger(w);
    const log = [...(L.log || []), { t, k, n, at: now() }].slice(-40);
    const got = t === "earn" && !k.startsWith("daily") && k !== "stamp" && !(L.got || []).includes(k) ? [...(L.got || []), k] : L.got || [];
    await setDoc(`worldArcl/${w}`, { ...L, log, got, bal: undefined, earned: undefined, spent: undefined });
  }
  async function balance(w) {
    const d = await getDocs([`worldArclBal/${w}`, `worldArcl/${w}`]);
    const b = d[`worldArclBal/${w}`] || {}, L = d[`worldArcl/${w}`] || {};
    return { bal: b.bal || 0, earned: b.earned || 0, spent: b.spent || 0, streak: L.streak || 0, lastDay: L.lastDay || "", got: L.got || [], log: (L.log || []).slice(-30).reverse() };
  }
  // credit n ARCL for kind, inside today's cap; returns the amount credited
  async function credit(w, kind, n) {
    const day = seoulDay(now()), dk = `worldArclDay/${w}_${day}`;
    const today = ((await one(dk)) || {}).n || 0;
    const amt = Math.max(0, Math.min(n, DAILY_CAP - today));
    if (amt <= 0) return 0;
    const wk = isoWeek(now());
    await commit([{ inc: dk, fields: { n: amt } }, { inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }, { inc: `worldArclWeek/${wk}_${w}`, fields: { n: amt } }]);
    await note(w, "earn", kind, amt).catch(() => {});
    try {
      const mine = ((await one(`worldArclWeek/${wk}_${w}`)) || {}).n || amt, key = `worldStats/arclWeek_${wk}`, cur = (await one(key)) || { top: [] };
      const top = [{ w: short(w), id: w, n: mine }, ...(cur.top || []).filter((x) => x.id !== w)].sort((a, b) => b.n - a.n).slice(0, 20);
      await setDoc(key, { top });
    } catch { /* the credit stands */ }
    return amt;
  }
  // a reward the team approved (the support desk): outside the daily cap, logged like any other ARCL
  async function rewardArcl(w, kind, n) {
    const amt = Math.max(0, Math.floor(Number(n) || 0)); if (!amt) return 0;
    const wk = isoWeek(now());
    await commit([{ inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }, { inc: `worldArclWeek/${wk}_${w}`, fields: { n: amt } }]);
    await note(w, "earn", kind, amt).catch(() => {});
    return amt;
  }
  const onceOk = async (w, kind) => (await commit([{ create: `worldArclOnce/${w}_${kind}`, data: { at: now() } }])).ok;

  async function claim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, kind = String(b.kind || ""), e = EARN_BY[kind];
    if (!e) return json(400, { error: "unknown kind" });
    if (kind === "stamp") return json(400, { error: "stamps are credited when you leave one" });
    let n = e.n;
    if (kind === "daily") {
      const day = seoulDay(now()), y = seoulDay(now() - 864e5);
      if (!(await commit([{ create: `worldArclDaily/${w}_${day}`, data: { at: now() } }])).ok) return json(409, { error: "already checked in today" });
      const L = await ledger(w), streak = L.lastDay === y ? (L.streak || 0) + 1 : 1;
      await setDoc(`worldArcl/${w}`, { ...L, streak, lastDay: day, bal: undefined, earned: undefined, spent: undefined });
      n = 20 + Math.min(30, 5 * (streak - 1));
      const got = await credit(w, kind, n);
      return json(200, { ok: true, kind, credited: got, streak, ...(await balance(w)) });
    }
    if (kind.startsWith("stage:")) {
      const id = kind.slice(6);
      if (Number(b.answer) !== STAGE_WIN[id]) return json(400, { error: "that isn't how this scammer is beaten" });
    } else if (kind === "hold") {
      const bal = deps.tokenBalance ? await deps.tokenBalance(ARCIRCLE, w).catch(() => 0n) : 0n;
      if (!(BigInt(bal || 0) > 0n)) return json(400, { error: "no $ARCIRCLE in this wallet yet" });
    } else if (kind === "launch") {
      const coin = lc(b.coin); if (!isAddr(coin)) return json(400, { error: "which coin?" });
      const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
      if (!rec || lc(rec.creator) !== w) return json(400, { error: "this wallet didn't launch that coin" });
    } else if (/^(isle|res)\d+$/.test(kind)) {
      const isl = await one(`worldIsland/${w}`); const need = Number(kind.replace(/\D/g, ""));
      const have = kind.startsWith("isle") ? (isl && isl.n) || 0 : (isl && isl.res) || 0;
      if (have < need) return json(400, { error: "your saved island isn't there yet" });
    } else if (kind.startsWith("liked")) {
      const likes = ((await one(`worldIslandLikes/${w}`)) || {}).n || 0;
      if (likes < Number(kind.slice(5))) return json(400, { error: "not enough likes yet" });
    }
    if (!(await onceOk(w, kind))) return json(409, { error: "already collected" });
    const got = await credit(w, kind, n);
    return json(200, { ok: true, kind, credited: got, capped: got < n, ...(await balance(w)) });
  }
  // a stamp left on someone else's island (api/_world.mjs calls this after the stamp is saved)
  async function stampCredit(w) {
    const day = seoulDay(now());
    if (!(await commit([{ inc: `worldArclStampDay/${w}_${day}`, fields: { n: 1 } }])).ok) return 0;
    const c = ((await one(`worldArclStampDay/${w}_${day}`)) || {}).n || 0;
    return c <= 3 ? credit(w, "stamp", EARN_BY.stamp.n) : 0;
  }

  // ---- what an item does once it's paid for ----
  async function checkBuy(w, it, target) {
    if (!it) return "unknown item";
    const o = await own(w);
    if (!it.use && o.items.includes(it.id)) return "you already have this";
    if (it.needs && !o.items.includes(it.needs)) return "get the 48×48 expansion first";
    if (it.id === "rename" && !(deps.hasName ? await deps.hasName(w) : true)) return "your first name is free: set it in the character maker";
    if (it.target === "coin" || it.target === "mycoin") {
      const coin = lc(target); if (!isAddr(coin)) return "pick a coin";
      const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
      if (!rec) return "not an ArcPad coin";
      if (it.target === "mycoin" && lc(rec.creator) !== w) return "only the coin's creator can buy this";
      if (it.id === "lot13" && (o.lots || []).includes(coin)) return "this lot is already premium";
    }
    return null;
  }
  async function grant(w, it, target, via) {
    const o = await own(w), at = now();
    if (it.id === "rename") o.renames = (o.renames || 0) + 1;
    else if (it.id === "lot13") o.lots = [...new Set([...(o.lots || []), lc(target)])];
    else if (it.id === "feature-isle" || it.id === "billboard") {
      const P = (await one("worldStats/plaza")) || { isle: [], coin: [] }, k = it.id === "billboard" ? "coin" : "isle";
      const list = (P[k] || []).filter((x) => x.until > at);
      const start = Math.max(at, ...list.map((x) => x.until));
      let entry;
      if (k === "isle") { const isl = await one(`worldIsland/${w}`); entry = { wallet: w, name: (isl && isl.name) || short(w) }; }
      else { const rec = deps.launchRecord ? await deps.launchRecord(lc(target)) : null; entry = { token: lc(target), symbol: (rec && (rec.symbol || rec.sym)) || "", by: w }; }
      list.push({ ...entry, start, until: start + it.hours * 3600e3 });
      await setDoc("worldStats/plaza", { ...P, [k]: list.slice(-30) });
    } else o.items = [...new Set([...(o.items || []), it.id])];
    o.buys = [...(o.buys || []), { id: it.id, via, at }].slice(-40);
    await setDoc(`worldOwn/${w}`, o);
    return o;
  }
  async function spend(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, it = ITEM[b.item];
    if (!it || it.arcl == null) return json(400, { error: "this item isn't sold for ARCL" });
    const why = await checkBuy(w, it, b.target); if (why) return json(400, { error: why });
    const { bal } = await balance(w);
    if (bal < it.arcl) return json(400, { error: "not enough ARCL" });
    // one ARCL purchase at a time per wallet (so two at once can't both spend the same balance)
    if (!(await commit([{ create: `worldArclSpend/${w}_${Math.floor(now() / 3000)}`, data: { at: now() } }])).ok) return json(429, { error: "one moment" });
    await commit([{ inc: `worldArclBal/${w}`, fields: { bal: -it.arcl, spent: it.arcl } }]);
    await note(w, "spend", it.id, -it.arcl).catch(() => {});
    const o = await grant(w, it, b.target, "arcl");
    return json(200, { ok: true, item: it.id, own: o, ...(await balance(w)) });
  }

  // ---- $ARCIRCLE: quote, then the player's own transfer to FeeBurn, then the receipt ----
  async function quote(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, it = ITEM[b.item];
    if (!it) return json(400, { error: "unknown item" });
    const why = await checkBuy(w, it, b.target); if (why) return json(400, { error: why });
    const price = deps.arcPrice ? Number(await deps.arcPrice().catch(() => 0)) : 0;
    if (!(price > 0)) return json(503, { error: "can't price $ARCIRCLE right now; try again in a minute" });
    const tokens = it.usd / price, wei = BigInt(Math.ceil(tokens * 1e6)) * 10n ** 12n;
    const id = rid(), exp = now() + QUOTE_MS;
    await setDoc(`worldPayQuote/${id}`, { wallet: w, item: it.id, target: lc(b.target || ""), usd: it.usd, amount: wei.toString(), price, exp });
    return json(200, { ok: true, quote: id, item: it.id, usd: it.usd, amount: wei.toString(), tokens: Number(wei / 10n ** 12n) / 1e6, to: FEE_BURN, token: ARCIRCLE, exp });
  }
  async function confirm(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, tx = lc(b.tx);
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
    const q = await one(`worldPayQuote/${String(b.quote || "").replace(/[^0-9a-f]/g, "")}`);
    if (!q || q.wallet !== w) return json(400, { error: "unknown quote" });
    if (q.used) return json(409, { error: "this quote was already used" });
    if (now() > q.exp + 30 * 60e3) return json(400, { error: "the quote expired; get a new price" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const paid = (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(FEE_BURN)).reduce((a, l) => a + BigInt(l.data), 0n);
    if (paid < BigInt(q.amount)) return json(400, { error: "the transfer is less than the quote" });
    if (!(await commit([{ create: `worldPayTx/${tx}`, data: { wallet: w, item: q.item, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    await setDoc(`worldPayQuote/${b.quote}`, { ...q, used: tx });
    const it = ITEM[q.item];
    const o = await grant(w, it, q.target, "arcircle");
    await commit([{ inc: "worldStats/shop", fields: { paid: 1 } }]).catch(() => {});
    return json(200, { ok: true, item: it.id, own: o, burned: (paid / 2n).toString(), treasury: (paid - paid / 2n).toString() });
  }
  async function plaza() {
    const P = (await one("worldStats/plaza")) || {}, t = now();
    const cur = (k) => (P[k] || []).find((x) => x.start <= t && x.until > t) || null;
    return { isle: cur("isle"), coin: cur("coin") };
  }

  return {
    stampCredit, own, plaza, rewardArcl,
    owns: async (w, id) => ((await own(w)).items || []).includes(id),
    lotPremium: async (w, coin) => ((await own(w)).lots || []).includes(lc(coin)),
    renames: async (w) => (await own(w)).renames || 0,
    async read(view, url) {
      const w = lc(url.searchParams.get("wallet"));
      if (view === "shop") return json(200, { items: CATALOG, own: isAddr(w) ? await own(w) : null, plaza: await plaza(), feeBurn: FEE_BURN, token: ARCIRCLE, burnPct: 50, exchange: EXCHANGE }, isAddr(w) ? "no-store" : "public, max-age=30");
      if (view === "arcl") return isAddr(w) ? json(200, { ...(await balance(w)), cap: DAILY_CAP, today: ((await one(`worldArclDay/${w}_${seoulDay(now())}`)) || {}).n || 0, earn: EARN, exchange: EXCHANGE, notify: !!(await one(`worldArclNotify/${w}`)) }) : json(400, { error: "wallet must be an address" });
      if (view === "arcl-top") return json(200, { week: isoWeek(now()), top: (((await one(`worldStats/arclWeek_${isoWeek(now())}`)) || {}).top || []).map(({ w: s, n }) => ({ w: s, n })) }, "public, max-age=30");
      if (view === "plaza") return json(200, await plaza(), "public, max-age=30");
      return null;
    },
    async handle(b) {
      if (b.action === "world-arcl-claim") return claim(b);
      if (b.action === "world-arcl-spend") return spend(b);
      if (b.action === "world-pay-quote") return quote(b);
      if (b.action === "world-pay-confirm") return confirm(b);
      if (b.action === "world-arcl-notify") { const s = signer(b); if (s.err) return s.err; await setDoc(`worldArclNotify/${s.wallet}`, { on: !!b.on, at: now() }); return json(200, { ok: true, notify: !!b.on }); }
      return null;
    },
  };
}
