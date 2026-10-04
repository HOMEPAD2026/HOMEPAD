// api/_arcpad-v6.mjs — ArcPad v6 on the server (routed by api/social.mjs):
//   comments      a coin's comment thread (signed by the wallet; holders and the creator are marked; the creator can
//                 pin one). Coins: ArcPad launches and Argus coins listed through ArcPad.
//   referrals     a trade or launch made through ArcPad from a ?ref= link: the browser sends the transaction, the server
//                 checks it on Arc (it went to the ArcPad router or factory and succeeded) and credits the referrer once
//                 per transaction. The first referrer of a wallet stays its referrer.
//   launch plans  "launching on Saturday 21:00 UTC" pages: a signed plan (name, ticker, logo, time, platform) with a
//                 countdown on Home until it's live.
// Storage: Firestore through the helpers api/social.mjs hands in (getDocs / setDoc / commit).
import { isAddr, launchRecord, tokenBalance, rpcCall } from "./_arc.mjs";

const lc = (a) => String(a || "").toLowerCase();
export const ROUTER = "0xfca8fd788d44bb335b1451257366e06d67114785";
export const FACTORY = "0x0ebd6df354056ff469f17f8fd14dc0d2c87bd65e";
const USDC = "0x3600000000000000000000000000000000000000";
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, n);

// ---- the texts a wallet signs (the browser builds the same: arcpad-v6.js) ----
export const commentMessage = (coin, issued, text, hash) => `ARCIRCLE PAD — comment\nCoin: ${lc(coin)}\nIssued: ${issued}\nText: ${hash(text)}`;
export const pinMessage = (coin, id, issued) => `ARCIRCLE PAD — pin a comment\nCoin: ${lc(coin)}\nComment: ${id || "none"}\nIssued: ${issued}`;
export const planMessage = (p, issued) => `ARCIRCLE PAD — scheduled launch\nCreator: ${lc(p.creator)}\nSymbol: ${p.symbol}\nAt: ${new Date(p.at * 1000).toISOString()}\nIssued: ${issued}`;
export const unplanMessage = (id, creator, issued) => `ARCIRCLE PAD — cancel a scheduled launch\nCreator: ${lc(creator)}\nPlan: ${id}\nIssued: ${issued}`;

export function make({ getDocs, setDoc, commit, recoverSigner, issuedOk, json, limited, keccakText, argusCoin }) {
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const hashText = (t) => keccakText(t);

  // ---------------- comments ----------------
  async function coinOk(coin) {
    const rec = await launchRecord(coin).catch(() => null);
    if (rec) return { creator: lc(rec.creator), platform: "arcpad" };
    const a = argusCoin ? await argusCoin(coin).catch(() => null) : null;
    return a ? { creator: lc(a.creator), platform: "argus" } : null;
  }
  async function comments(coin) {
    coin = lc(coin);
    if (!isAddr(coin)) return json(400, { error: "coin must be an address" });
    const d = (await getDocs([`comments/${coin}`]))[`comments/${coin}`] || { items: [], pinned: null };
    return json(200, { items: (d.items || []).slice(-200).reverse(), pinned: d.pinned || null, n: d.n || (d.items || []).length }, "public, max-age=5, s-maxage=8");
  }
  async function comment(b, ip) {
    const coin = lc(b.coin), wallet = lc(b.wallet), text = clean(b.text, 280);
    if (!isAddr(coin) || !isAddr(wallet)) return json(400, { error: "coin and wallet must be addresses" });
    if (text.length < 1) return json(400, { error: "write something first" });
    if (limited(`cmt:${ip}`, 8, 60e3) || limited(`cmtw:${wallet}`, 1, 15e3)) return json(429, { error: "one comment every 15 seconds" });
    if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
    let signer;
    try { signer = recoverSigner(commentMessage(coin, b.issued, text, hashText), b.signature); } catch { return json(400, { error: "invalid signature" }); }
    if (signer !== wallet) return json(403, { error: "signature doesn't match the wallet" });
    const c = await coinOk(coin);
    if (!c) return json(404, { error: "not a coin listed on ArcPad" });
    const holder = (await tokenBalance(coin, wallet).catch(() => 0n)) > 0n;
    const key = `comments/${coin}`;
    const d = (await getDocs([key]))[key] || { items: [], pinned: null, n: 0 };
    const id = keccakText(`${coin}:${wallet}:${b.issued}:${text}`).slice(2, 12);
    if ((d.items || []).some((x) => x.id === id)) return json(200, { ok: true, id, already: true });
    const reply = /^[0-9a-f]{10}$/.test(String(b.reply || "")) && (d.items || []).some((x) => x.id === b.reply) ? b.reply : null;
    const item = { id, w: wallet, t: text, at: Date.now(), h: holder ? 1 : 0, c: wallet === c.creator ? 1 : 0, ...(reply ? { r: reply } : {}) };
    d.items = [...(d.items || []), item].slice(-300);
    d.n = (d.n || 0) + 1;
    await setDoc(key, d);
    return json(200, { ok: true, item });
  }
  async function pin(b) {
    const coin = lc(b.coin), wallet = lc(b.wallet), id = b.id ? String(b.id) : null;
    if (!isAddr(coin) || !isAddr(wallet)) return json(400, { error: "coin and wallet must be addresses" });
    if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
    let signer;
    try { signer = recoverSigner(pinMessage(coin, id, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
    const c = await coinOk(coin);
    if (!c || signer !== wallet || wallet !== c.creator) return json(403, { error: "only the coin's creator can pin" });
    const key = `comments/${coin}`;
    const d = (await getDocs([key]))[key] || { items: [], pinned: null };
    if (id && !(d.items || []).some((x) => x.id === id)) return json(404, { error: "no such comment" });
    d.pinned = id;
    await setDoc(key, d);
    return json(200, { ok: true, pinned: id });
  }

  // ---------------- referrals ----------------
  async function refNote(b, ip) {
    const tx = lc(b.tx), ref = lc(b.ref);
    if (!/^0x[0-9a-f]{64}$/.test(tx) || !isAddr(ref)) return json(400, { error: "tx and ref are needed" });
    if (limited(`ref:${ip}`, 30, 60e3)) return json(429, { error: "slow down" });
    const have = (await getDocs([`arcRefs/t_${tx}`]))[`arcRefs/t_${tx}`];
    if (have) return json(200, { ok: true, already: true });
    const [t, rc] = await Promise.all([rpcCall("eth_getTransactionByHash", [tx]).catch(() => null), rpcCall("eth_getTransactionReceipt", [tx]).catch(() => null)]);
    if (!t || !rc) return json(404, { error: "transaction not found yet — try again in a moment" });
    const to = lc(t.to), from = lc(t.from);
    if (rc.status !== "0x1" || (to !== ROUTER && to !== FACTORY)) return json(400, { error: "not an ArcPad trade or launch" });
    if (from === ref) return json(400, { error: "self-referrals don't count" });
    // the wallet's first referrer stays its referrer
    const wKey = `arcRefs/w_${from}`;
    const bound = (await getDocs([wKey]))[wKey];
    const owner = bound ? bound.ref : ref;
    // what it moved in USDC: the wallet's USDC transfers in that transaction (a buy pays it, a sell receives it)
    let usd = 0;
    const kind = to === FACTORY ? "launch" : "trade";
    for (const l of rc.logs || []) {
      if (lc(l.address) !== USDC || lc(l.topics && l.topics[0]) !== TRANSFER || !l.topics[2]) continue;
      const fr = "0x" + String(l.topics[1]).slice(26), tt = "0x" + String(l.topics[2]).slice(26);
      if (fr === from || tt === from) usd += Number(BigInt(l.data || "0x0")) / 1e6;
    }
    if (usd > 1e7) usd = 0; // not a number to trust
    const writes = [{ create: `arcRefs/t_${tx}`, data: { ref: owner, from, kind, usd, at: Date.now() } }];
    if (!bound) writes.push({ create: wKey, data: { ref: owner, at: Date.now(), tx } });
    writes.push({ inc: `arcRefs/r_${owner}`, fields: { trades: kind === "trade" ? 1 : 0, launches: kind === "launch" ? 1 : 0, usd: Math.round(usd * 100) / 100, wallets: bound ? 0 : 1 } });
    const r = await commit(writes);
    if (r && r.conflict) return json(200, { ok: true, already: true });
    // the referrer's recent list (for the Portfolio card)
    const lKey = `arcRefs/l_${owner}`;
    const L = (await getDocs([lKey]))[lKey] || { items: [] };
    L.items = [{ w: from, kind, usd, at: Date.now() }, ...(L.items || [])].slice(0, 30);
    await setDoc(lKey, L);
    return json(200, { ok: true, ref: owner, usd, kind });
  }
  async function refStats(wallet) {
    wallet = lc(wallet);
    if (!isAddr(wallet)) return json(400, { error: "wallet must be an address" });
    const d = await getDocs([`arcRefs/r_${wallet}`, `arcRefs/l_${wallet}`]);
    const s = d[`arcRefs/r_${wallet}`] || {}, L = d[`arcRefs/l_${wallet}`] || {};
    return json(200, { wallets: s.wallets || 0, trades: s.trades || 0, launches: s.launches || 0, usd: Math.round((s.usd || 0) * 100) / 100,
      recent: (L.items || []).slice(0, 12).map((x) => ({ w: x.w.slice(0, 6) + "…" + x.w.slice(-4), kind: x.kind, usd: x.usd, at: x.at })) }, "public, max-age=15, s-maxage=20");
  }

  // ---------------- launch plans ----------------
  const PLANS = "arcPlans/list";
  async function plans() {
    const d = (await getDocs([PLANS]))[PLANS] || { items: [] };
    const now = Date.now() / 1000;
    return json(200, { items: (d.items || []).filter((x) => x.at > now - 6 * 3600).sort((a, b) => a.at - b.at).slice(0, 30) }, "public, max-age=15, s-maxage=20");
  }
  async function plan(b, ip) {
    if (limited(`plan:${ip}`, 6, 60e3)) return json(429, { error: "slow down" });
    const creator = lc(b.creator);
    if (!isAddr(creator)) return json(400, { error: "creator must be an address" });
    if (!issuedOk(b.issued, 10 * 60e3)) return json(400, { error: "signature expired — sign again" });
    const d = (await getDocs([PLANS]))[PLANS] || { items: [] };
    if (b.remove) {
      const id = String(b.remove);
      let signer; try { signer = recoverSigner(unplanMessage(id, creator, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
      const it = (d.items || []).find((x) => x.id === id);
      if (!it || signer !== creator || it.creator !== creator) return json(403, { error: "only its creator can cancel it" });
      d.items = d.items.filter((x) => x.id !== id);
      await setDoc(PLANS, d);
      return json(200, { ok: true, removed: id });
    }
    const p = {
      creator, name: clean(b.name, 40), symbol: clean(b.symbol, 10).toUpperCase().replace(/[^A-Z0-9$]/g, ""), description: clean(b.description, 280),
      image: /^https:\/\/[^\s"'<>]{6,300}$/i.test(String(b.image || "")) ? String(b.image) : "",
      platform: ["arcpad", "argus", "pons", "pump"].includes(b.platform) ? b.platform : "arcpad", at: Math.floor(Number(b.at) || 0),
      x: /^https:\/\/(x|twitter)\.com\/[^\s"'<>]{1,80}$/i.test(String(b.x || "")) ? String(b.x) : "",
    };
    const now = Math.floor(Date.now() / 1000);
    if (!p.name || !p.symbol) return json(400, { error: "a name and a ticker are needed" });
    if (!(p.at > now + 300) || p.at > now + 30 * 86400) return json(400, { error: "pick a time between 5 minutes and 30 days from now" });
    let signer; try { signer = recoverSigner(planMessage(p, b.issued), b.signature); } catch { return json(400, { error: "invalid signature" }); }
    if (signer !== creator) return json(403, { error: "signature doesn't match the wallet" });
    const mine = (d.items || []).filter((x) => x.creator === creator && x.at > now);
    if (mine.length >= 3) return json(409, { error: "you already have 3 upcoming launches scheduled" });
    p.id = keccakText(`${creator}:${p.symbol}:${p.at}`).slice(2, 12);
    p.created = Date.now();
    d.items = [...(d.items || []).filter((x) => x.id !== p.id && x.at > now - 86400), p].slice(-200);
    await setDoc(PLANS, d);
    return json(200, { ok: true, plan: p });
  }

  return { comments, comment, pin, refNote, refStats, plans, plan };
}
