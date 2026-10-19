// api/_world-refer.mjs — invite a friend: when the friend you brought reaches level 5, you both get a reward.
//
//   Your invite code: made once (world-refer-code), it goes on your invite link (/play?ref=<code>). A friend who opens it
//   and signs in is tied to you (world-refer-bind), once, and only while their account is new (level 3 or lower). When
//   they reach level 5 (the save that gets them there pays it: api/_world.mjs save → due), you both get 1,000 ARCL and a
//   dinosaur egg (its grade rolled as any wild egg's: DINO SOULMATE, api/_world-dino.mjs gift).
//   Against wallets made only to collect it: the friend has to play to level 5 (the server paces XP), the inviter must
//   be level 5 themselves, a friend can't invite back the one who invited them, and an inviter is paid for at most
//   REFER.day friends a day and REFER.cap in all (past that, the friend still gets theirs).
//   (The amounts are defaults the owner may change.)
//
//   GET  ?world=refer&wallet=0x…          → { code, by, kids: [{ name, lv, paid }], paid, reward, minLv, cap }
//   POST world-refer-code  { …sig }       → { ok, code }
//   POST world-refer-bind  { …sig, code } → { ok, by, name }
//   POST world-refer-claim { …sig }       → { ok, paid: [{ w, arcl, egg }] } (a save normally pays it; this is the retry)
//
// Firestore: worldRef/<w> { code, by, byAt, kids: [{ w, at, paid }], paidN } · worldRefCode/<code> { w } ·
//            worldRefBy/<w> (tied, once) · worldRefPaid/<friend> (paid, once) · worldRefDay/<inviter>_<day> { n }
export const REFER = { minLv: 5, inviterLv: 5, bindMaxLv: 3, arcl: 1000, cap: 30, day: 5 };
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
/// a wallet's code (salt: the next try, if another wallet already has it)
export const codeFor = (w, salt = 0) => (H(w + ":" + salt).toString(36) + H(salt + ":" + w).toString(36)).replace(/[^0-9a-z]/g, "").slice(0, 8).padEnd(8, "0");
const dayOf = (t) => Math.floor((t + 9 * 3600e3) / 864e5); // (Seoul's day)

/// deps: { getDocs, setDoc, commit, json, now, signer(b), level(w), nameOf(w), award(w, kind, n), dinoGift(w, id, rar) }
export function makeRefer(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const doc = async (w) => (await one(`worldRef/${w}`)) || {};
  async function code(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, d = await doc(w);
    if (d.code) return json(200, { ok: true, code: d.code });
    for (let salt = 0; salt < 6; salt++) {
      const c = codeFor(w, salt), have = await one(`worldRefCode/${c}`);
      if (have && have.w !== w) continue;
      if (!have && !(await commit([{ create: `worldRefCode/${c}`, data: { w, at: now() } }])).ok) continue;
      await setDoc(`worldRef/${w}`, { ...(await doc(w)), code: c }); return json(200, { ok: true, code: c });
    }
    return json(503, { error: "couldn't make a code — try again" });
  }
  async function bind(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, c = String(b.code || "").toLowerCase();
    if (!/^[0-9a-z]{8}$/.test(c)) return json(400, { error: "that isn't an invite code" });
    const rec = await one(`worldRefCode/${c}`); if (!rec || !rec.w) return json(404, { error: "no such invite" });
    const by = rec.w; if (by === w) return json(400, { error: "that's your own invite" });
    const me = await doc(w); if (me.by) return json(409, { error: "you already joined an invite", by: me.by });
    const [lv, byLv, them] = await Promise.all([deps.level(w).catch(() => 1), deps.level(by).catch(() => 1), doc(by)]);
    if ((lv || 1) > REFER.bindMaxLv) return json(403, { error: `invites are for new players (level ${REFER.bindMaxLv} or lower)` });
    if ((byLv || 1) < REFER.inviterLv) return json(403, { error: `your friend needs to reach level ${REFER.inviterLv} first` });
    if (them.by === w) return json(400, { error: "you invited them" });
    if (!(await commit([{ create: `worldRefBy/${w}`, data: { by, at: now() } }])).ok) return json(409, { error: "you already joined an invite" });
    await setDoc(`worldRef/${w}`, { ...(await doc(w)), by, byAt: now() });
    const t2 = await doc(by), kids = Array.isArray(t2.kids) ? t2.kids : [];
    if (!kids.some((k) => k.w === w)) await setDoc(`worldRef/${by}`, { ...t2, kids: [...kids, { w, at: now(), paid: false }].slice(-200) });
    return json(200, { ok: true, by, name: await deps.nameOf(by).catch(() => "") });
  }
  /// a friend at level 5: both paid, once (the save that gets them there calls this; null when there's nothing to pay)
  async function due(w) {
    const me = await doc(w); if (!me.by || me.paidAt) return null;
    if (((await deps.level(w).catch(() => 1)) || 1) < REFER.minLv) return null;
    if (!(await commit([{ create: `worldRefPaid/${w}`, data: { by: me.by, at: now() } }])).ok) return null;
    const t = now(), by = me.by, them = await doc(by), dk = `worldRefDay/${by}_${dayOf(t)}`, today = ((await one(dk)) || {}).n || 0;
    const inviterPaid = (them.paidN || 0) < REFER.cap && today < REFER.day;
    await setDoc(`worldRef/${w}`, { ...(await doc(w)), paidAt: t });
    const arcl = await deps.award(w, "refer", REFER.arcl).catch(() => 0), egg = await deps.dinoGift(w, "ref_" + w.slice(2, 12) + "_f", null).catch(() => false);
    if (inviterPaid) {
      await commit([{ inc: dk, fields: { n: 1 } }]).catch(() => {});
      await deps.award(by, "refer", REFER.arcl).catch(() => 0); await deps.dinoGift(by, "ref_" + w.slice(2, 12) + "_i", null).catch(() => false);
    }
    const t2 = await doc(by), kids = (Array.isArray(t2.kids) ? t2.kids : []).map((k) => (k.w === w ? { ...k, paid: true, paidAt: t, skip: !inviterPaid } : k));
    await setDoc(`worldRef/${by}`, { ...t2, kids, paidN: (t2.paidN || 0) + (inviterPaid ? 1 : 0) });
    return { arcl, egg: !!egg, inviter: inviterPaid };
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, me = await doc(w), paid = [];
    const mine = await due(w).catch(() => null); if (mine) paid.push({ w, ...mine });
    // the inviter's side: a friend who reached level 5 on a save that didn't get to pay (a retry)
    for (const k of (Array.isArray(me.kids) ? me.kids : []).filter((x) => !x.paid).slice(0, 10)) { const r = await due(k.w).catch(() => null); if (r) paid.push({ w: k.w, ...r }); }
    return json(200, { ok: true, paid });
  }
  return {
    due,
    async read(v, url) {
      if (v !== "refer") return null;
      const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase();
      const base = { reward: { arcl: REFER.arcl, egg: true }, minLv: REFER.minLv, inviterLv: REFER.inviterLv, cap: REFER.cap, day: REFER.day };
      if (!/^0x[0-9a-f]{40}$/.test(w)) return json(200, base, "public, max-age=60");
      const d = await doc(w), kids = (Array.isArray(d.kids) ? d.kids : []).slice(-30).reverse();
      const info = await Promise.all(kids.map(async (k) => ({ name: (await deps.nameOf(k.w).catch(() => "")) || k.w.slice(0, 6) + "…", lv: (await deps.level(k.w).catch(() => 1)) || 1, paid: !!k.paid, at: k.at })));
      return json(200, { ...base, code: d.code || "", by: d.by ? { name: (await deps.nameOf(d.by).catch(() => "")) || d.by.slice(0, 6) + "…" } : null, paidMe: !!d.paidAt, lv: (await deps.level(w).catch(() => 1)) || 1, kids: info, paid: d.paidN || 0, n: (Array.isArray(d.kids) ? d.kids : []).length }, "no-store");
    },
    async handle(b) {
      if (b.action === "world-refer-code") return code(b);
      if (b.action === "world-refer-bind") return bind(b);
      if (b.action === "world-refer-claim") return claim(b);
      return null;
    },
  };
}
