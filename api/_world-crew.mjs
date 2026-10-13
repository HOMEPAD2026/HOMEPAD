// api/_world-crew.mjs — crews in ARCIRCLE World: a name, a short tag shown before each member's name, up to 20
// members who join with the crew's invite code, and the week's hunting points added up for the crew.
//
//   POST /api/social { action: "world-crew-create", …signature, name, tag }   you found one (you're its captain)
//   POST { action: "world-crew-join", …signature, code }                      join with a code a member shares
//   POST { action: "world-crew-leave", …signature }                           leave (a captain hands the crew to the
//        longest member first; the last one out closes it)
//   POST { action: "world-crew-kick", …signature, wallet }                    the captain only
//   POST { action: "world-crew-code", …signature }                            the captain makes a new code
//   GET  ?world=crew&wallet=0x…     the crew of that wallet: name, tag, captain, members (name, level, this week's
//                                   hunting points), the week's total; the code only for its members
//   GET  ?world=crew-top            this week's crews by hunting points (the top 20)
//
// Founding and joining are free. Names and tags are checked for length and characters; tags are unique.
const lc = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(lc(s));
export const CREW_MAX = 20;
export const cleanCrewName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
export const cleanTag = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

export function makeCrew(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const code = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => A[b % A.length]).join(""); };
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : "w");
  async function crewOf(w) { const m = await one(`worldCrewOf/${w}`); return m && m.id ? await one(`worldCrew/${m.id}`) : null; }
  async function view(c, me) {
    if (!c) return null;
    const ws = c.members || [], d = await getDocs([...ws.map((w) => `worldSave/${w}`), ...ws.map((w) => `worldHuntWeek/${week()}_${w}`)]);
    const lv = deps.levelOfSave || (() => 1);
    const members = ws.map((w) => { const s = d[`worldSave/${w}`] || {}, h = d[`worldHuntWeek/${week()}_${w}`] || {}; return { w: w.slice(0, 6) + "…" + w.slice(-4), wallet: w, name: s.name || "", lv: lv(s), pts: h.n || 0, cap: w === c.owner }; }).sort((a, b) => b.pts - a.pts);
    const mine = me && ws.includes(me);
    return { id: c.id, name: c.name, tag: c.tag, owner: c.owner, members, total: members.reduce((a, m) => a + m.pts, 0), max: CREW_MAX, ...(mine ? { code: c.code } : {}), at: c.at };
  }
  async function putTop(c) {
    // this week's table: the crew's total, refreshed whenever one of its pages is read or changed
    const v = await view(c, null); if (!v) return;
    const k = `worldStats/crewWeek_${week()}`, T = (await one(k)) || { top: [] };
    const top = [{ id: c.id, name: c.name, tag: c.tag, n: v.total, m: v.members.length }, ...(T.top || []).filter((x) => x.id !== c.id)].sort((a, b) => b.n - a.n).slice(0, 20);
    await setDoc(k, { top });
  }
  async function create(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, name = cleanCrewName(b.name), tag = cleanTag(b.tag);
    if (name.length < 3) return json(400, { error: "a crew name needs 3 to 20 characters" });
    if (tag.length < 2) return json(400, { error: "a tag needs 2 to 4 letters or numbers" });
    if (await crewOf(w)) return json(409, { error: "you're already in a crew" });
    if (!(await commit([{ create: `worldCrewTag/${tag}`, data: { at: now() } }])).ok) return json(409, { error: `the tag ${tag} is taken` });
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");
    const c = { id, name, tag, owner: w, members: [w], code: code(), at: now() };
    await setDoc(`worldCrew/${id}`, c); await setDoc(`worldCrewCode/${c.code}`, { id }); await setDoc(`worldCrewOf/${w}`, { id });
    return json(200, { ok: true, crew: await view(c, w) });
  }
  async function join(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, cd = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (await crewOf(w)) return json(409, { error: "you're already in a crew" });
    const ref = cd.length === 6 ? await one(`worldCrewCode/${cd}`) : null, c = ref && (await one(`worldCrew/${ref.id}`));
    if (!c || c.code !== cd) return json(404, { error: "no crew has that code" });
    if ((c.members || []).length >= CREW_MAX) return json(409, { error: `that crew is full (${CREW_MAX})` });
    c.members = [...new Set([...(c.members || []), w])];
    await setDoc(`worldCrew/${c.id}`, c); await setDoc(`worldCrewOf/${w}`, { id: c.id });
    await putTop(c).catch(() => {});
    return json(200, { ok: true, crew: await view(c, w) });
  }
  async function leaveOf(c, w) {
    c.members = (c.members || []).filter((x) => x !== w);
    await setDoc(`worldCrewOf/${w}`, { id: "" });
    if (!c.members.length) { await setDoc(`worldCrew/${c.id}`, { ...c, closed: now() }); await setDoc(`worldCrewTag/${c.tag}`, { at: now(), free: true }).catch(() => {}); return; }
    if (c.owner === w) c.owner = c.members[0];
    await setDoc(`worldCrew/${c.id}`, c);
  }
  async function leave(b) {
    const s = signer(b); if (s.err) return s.err;
    const c = await crewOf(s.wallet); if (!c) return json(400, { error: "you're not in a crew" });
    await leaveOf(c, s.wallet); return json(200, { ok: true });
  }
  async function kick(b) {
    const s = signer(b); if (s.err) return s.err;
    const c = await crewOf(s.wallet), who = lc(b.wallet); if (!c) return json(400, { error: "you're not in a crew" });
    if (c.owner !== s.wallet) return json(403, { error: "only the captain can do that" });
    if (!isAddr(who) || who === s.wallet || !(c.members || []).includes(who)) return json(400, { error: "not a member" });
    await leaveOf(c, who); return json(200, { ok: true, crew: await view(c, s.wallet) });
  }
  async function newCode(b) {
    const s = signer(b); if (s.err) return s.err;
    const c = await crewOf(s.wallet); if (!c) return json(400, { error: "you're not in a crew" });
    if (c.owner !== s.wallet) return json(403, { error: "only the captain can do that" });
    c.code = code(); await setDoc(`worldCrew/${c.id}`, c); await setDoc(`worldCrewCode/${c.code}`, { id: c.id });
    return json(200, { ok: true, crew: await view(c, s.wallet) });
  }
  return {
    crewOf,
    async read(v, url) {
      if (v === "crew") { const w = lc(url.searchParams.get("wallet")); if (!isAddr(w)) return json(400, { error: "wallet" }); const c = await crewOf(w); if (c) putTop(c).catch(() => {}); return json(200, { crew: await view(c, null) }, "no-store"); }
      if (v === "crew-top") return json(200, { week: week(), top: (((await one(`worldStats/crewWeek_${week()}`)) || {}).top || []) }, "public, max-age=30");
      return null;
    },
    async handle(b) {
      if (b.action === "world-crew-create") return create(b);
      if (b.action === "world-crew-join") return join(b);
      if (b.action === "world-crew-leave") return leave(b);
      if (b.action === "world-crew-kick") return kick(b);
      if (b.action === "world-crew-code") return newCode(b);
      if (b.action === "world-crew-me") { const s = signer(b); if (s.err) return s.err; const c = await crewOf(s.wallet); return json(200, { crew: await view(c, s.wallet) }); }
      return null;
    },
  };
}
