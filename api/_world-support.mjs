// api/_world-support.mjs — the ARCIRCLE help desk: ARCIA answers first (api/arcia.mjs with support: true); what she
// can't solve becomes a report — a bug, an improvement or an idea — on a public board everyone can read.
//
//   POST /api/social { action: "world-support-new", …signature, kind, title, body, shot?, chat?, where?, lang? }
//        kind: bug | improve | idea. shot: an image as a data: URL (webp/png/jpeg, ≤ 450 KB). 5 a day per wallet.
//   POST { action: "world-support-vote", …signature, id }                 "me too", one per wallet
//   POST { action: "world-support-review", …signature, id, status, reply }  the team only (SUPPORT_ADMINS, or the
//        owner of ArcircleFeeBurn): accepted / done → the reward is paid once; declined / dupe → no reward
//   GET  ?world=support-list[&kind=&status=&mine=0x…]   newest first (the public board)
//   GET  ?world=support-item&id=…                        one report (public fields)
//   GET  ?world=support-shot&id=…                        its screenshot (the image itself)
//   GET  ?world=support-admin&wallet=0x…                 { admin } — shows the review buttons
//
// Rewards are ARCL (in-game points, the shop's ledger) and are paid only when the team accepts a report, so posting
// alone earns nothing: bug 50, improvement 30, idea 20, doubled when it comes with a screenshot. Reports are public:
// text that looks like a private key or a recovery phrase is refused before it's stored.
export const REWARD = { bug: 50, improve: 30, idea: 20 };
export const SHOT_BONUS = 2; // × with a screenshot
const KINDS = Object.keys(REWARD);
const STATUS = ["open", "accepted", "done", "declined", "dupe"];
const PAID = new Set(["accepted", "done"]);
const DAY_MAX = 5, SHOT_MAX = 450 * 1024, LIST_MAX = 400;
const lc = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(lc(s));
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const line = (s, n) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const text = (s, n) => String(s || "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
// a 64-hex secret or a 12/24-word phrase of lowercase words: never stored on a public board
export function looksSecret(s) {
  const t = String(s || "");
  if (/(^|[^0-9a-fA-F])(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)/.test(t)) return true;
  return /(?:\b[a-z]{3,8}\b[\s,]+){11,23}\b[a-z]{3,8}\b/.test(t.replace(/\n/g, " ")) && /(seed|phrase|mnemonic|recovery|시드|복구|助记)/i.test(t);
}

/// deps: { getDocs, setDoc, commit, json, now, signer, grant(w, kind, n), admins() → Set, randomId? }
export function makeSupport(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];
  const index = async () => ((await one("supportIndex/main")) || { list: [] }).list || [];
  const pub = (t) => t && { id: t.id, kind: t.kind, title: t.title, body: t.body, w: short(t.wallet), at: t.at, status: t.status, reply: t.reply || "", replyAt: t.replyAt || 0, reward: t.reward || 0, shot: !!t.shot, votes: t.votes || 0, where: t.where || "", lang: t.lang || "" };
  const row = (t) => ({ id: t.id, kind: t.kind, title: t.title, w: short(t.wallet), wid: t.wallet, at: t.at, status: t.status, reward: t.reward || 0, shot: !!t.shot, votes: t.votes || 0, reply: !!t.reply });
  async function putRow(t) {
    const list = await index();
    const next = [row(t), ...list.filter((x) => x.id !== t.id)].sort((a, b) => b.at - a.at).slice(0, LIST_MAX);
    await setDoc("supportIndex/main", { list: next });
  }
  async function isAdmin(w) { try { return (await deps.admins()).has(lc(w)); } catch { return false; } }

  async function create(b) {
    const s = signer(b); if (s.err) return s.err;
    const kind = KINDS.includes(b.kind) ? b.kind : null; if (!kind) return json(400, { error: "pick bug, improvement or idea" });
    const title = line(b.title, 80), body = text(b.body, 1500), chat = text(b.chat, 600);
    if (title.length < 4) return json(400, { error: "add a short title" });
    if (body.length < 10) return json(400, { error: "tell us a little more (10 characters or more)" });
    if (looksSecret(title + "\n" + body + "\n" + chat)) return json(400, { error: "that looks like a private key or a recovery phrase — remove it. Never share those with anyone, us included." });
    let shot = "";
    if (b.shot) {
      const m = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.shot));
      if (!m) return json(400, { error: "the screenshot must be a WebP, PNG or JPEG image" });
      if (m[2].length * 0.75 > SHOT_MAX) return json(400, { error: "the screenshot is too big (450 KB at most)" });
      shot = String(b.shot);
    }
    const day = seoulDay(now()), dk = `supportDay/${s.wallet}_${day}`;
    if ((((await one(dk)) || {}).n || 0) >= DAY_MAX) return json(429, { error: `${DAY_MAX} reports a day at most — thank you, more tomorrow` });
    const id = rid();
    const t = { id, kind, title, body, chat, wallet: s.wallet, at: now(), status: "open", reply: "", reward: 0, shot: !!shot, votes: 0, where: line(b.where, 40), lang: line(b.lang, 5) };
    const r = await commit([{ create: `supportTicket/${id}`, data: t }]); if (!r.ok) return json(409, { error: "try again" });
    if (shot) await setDoc(`supportShot/${id}`, { data: shot });
    await commit([{ inc: dk, fields: { n: 1 } }]);
    await putRow(t);
    return json(200, { ok: true, ticket: pub(t), reward: REWARD[kind] * (shot ? SHOT_BONUS : 1) });
  }

  async function vote(b) {
    const s = signer(b); if (s.err) return s.err;
    const id = line(b.id, 20), t = await one(`supportTicket/${id}`); if (!t) return json(404, { error: "no such report" });
    if (t.wallet === s.wallet) return json(400, { error: "that's your own report" });
    const r = await commit([{ create: `supportVote/${id}_${s.wallet}`, data: { at: now() } }]); if (!r.ok) return json(409, { error: "you already said so" });
    const nt = { ...t, votes: (t.votes || 0) + 1 }; await setDoc(`supportTicket/${id}`, nt); await putRow(nt);
    return json(200, { ok: true, votes: nt.votes });
  }

  async function review(b) {
    const s = signer(b); if (s.err) return s.err;
    if (!(await isAdmin(s.wallet))) return json(403, { error: "only the ARCIRCLE team can review reports" });
    const id = line(b.id, 20), t = await one(`supportTicket/${id}`); if (!t) return json(404, { error: "no such report" });
    const status = STATUS.includes(b.status) ? b.status : t.status;
    const nt = { ...t, status, reply: text(b.reply, 800) || t.reply || "", replyAt: now() };
    let paid = 0;
    if (PAID.has(status) && !t.reward) {
      const first = await commit([{ create: `supportPaid/${id}`, data: { at: now(), by: s.wallet } }]);
      if (first.ok) { paid = await deps.grant(t.wallet, `support:${t.kind}`, REWARD[t.kind] * (t.shot ? SHOT_BONUS : 1)); nt.reward = paid; }
    }
    await setDoc(`supportTicket/${id}`, nt); await putRow(nt);
    return json(200, { ok: true, ticket: pub(nt), paid });
  }

  return {
    async read(view, url) {
      if (view === "support-list") {
        const kind = url.searchParams.get("kind"), st = url.searchParams.get("status"), mine = lc(url.searchParams.get("mine"));
        let list = await index();
        if (KINDS.includes(kind)) list = list.filter((x) => x.kind === kind);
        if (STATUS.includes(st)) list = list.filter((x) => x.status === st);
        if (isAddr(mine)) list = list.filter((x) => x.wid === mine);
        const counts = Object.fromEntries(STATUS.map((k) => [k, 0])); (await index()).forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
        return json(200, { list: list.slice(0, 100).map(({ wid, ...x }) => x), counts, reward: REWARD, shotBonus: SHOT_BONUS }, isAddr(mine) ? "no-store" : "public, max-age=10");
      }
      if (view === "support-item") { const t = await one(`supportTicket/${line(url.searchParams.get("id"), 20)}`); return t ? json(200, { ticket: pub(t) }, "public, max-age=10") : json(404, { error: "no such report" }); }
      if (view === "support-shot") {
        const d = await one(`supportShot/${line(url.searchParams.get("id"), 20)}`), m = d && /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(d.data || "");
        if (!m) return json(404, { error: "no screenshot" });
        return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { status: 200, headers: { "content-type": m[1], "cache-control": "public, max-age=86400, immutable", "x-content-type-options": "nosniff" } });
      }
      if (view === "support-admin") return json(200, { admin: isAddr(url.searchParams.get("wallet")) && (await isAdmin(url.searchParams.get("wallet"))) }, "no-store");
      return null;
    },
    async handle(b) {
      if (b.action === "world-support-new") return create(b);
      if (b.action === "world-support-vote") return vote(b);
      if (b.action === "world-support-review") return review(b);
      return null;
    },
  };
}
