// api/_world-kartevent.mjs — the ARCIRCLE KART GRAND OPENING EVENT (2026-10-31, the owner's rules; every number in
// world-kart-event-data.js KEV, shared with the game). Fed by api/_world-kart.mjs: each end the server accepted calls onEnd.
//
//   EVENT 01  a Race / Daily end accepted inside the window → worldKevRace/<wallet> { n, at: [times] }; at KEV.RACES.need the
//             wallet joins worldStats/kevQual.
//   EVENT 02  a Time Attack end on KEV.TA.track inside the window → the event board worldStats/kevTa { top } (one line a wallet,
//             its best; the faster time first, a tie → the earlier); the run's ghost kept for the top KEV.TA.ghosts
//             (worldKevGhost/<wallet>) so the team can check it.
//   EVENT 03  POST world-kev-clip { url } (signed, inside the window; one a wallet, editable) → worldKevClip/<wallet>, the post
//             held once across wallets (worldKevClipUrl/<status id>), listed in worldStats/kevClips.
// Only the tally lives here (the owner, 2026-10-31): the GMs pay the prizes by hand after the event from what
// ?world=kart-event-gm lists — nothing here pays, awards or reads a transfer.
//
//   GET  ?world=kart-event&wallet=0x…?   { start, end, now, phase, races: { n, need }, ta: { t, rank }, clip, counts }
//   GET  ?world=kart-event-ta&wallet=…?  { top: [{ w, name, t, racer }] (KEV.TA.board), me: { rank, t } }
//   GET  ?world=kart-event-gm&wallet=&issued=&signature=   GM only (a signed session): { races: [{ w, name, n, last }],
//        ta: [{ rank, w, name, t, laps, at, ghost }] (the top 10; ghost = its worldKevGhost id or ""), clips: [{ w, name, url, at }] }
// Nothing here is in _world-phase.mjs's KEEP: it's the event's own progress.
import { KEV, kevPhase, clipOf, taOrder } from "../world-kart-event-data.js";
import { GHOST_RE, KART } from "./_world-kart.mjs";

const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
const isAddr = (a) => /^0x[0-9a-f]{40}$/.test(String(a || ""));
/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), nameOf(w) }
export function makeKartEvent(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now(), one = async (p) => (await getDocs([p]))[p];
  const nameOf = async (w) => { try { return String((await deps.nameOf(w)) || "").slice(0, 16); } catch { return ""; } };
  const inWindow = (startedAt, t) => startedAt >= KEV.START && t <= KEV.END;
  const pushList = async (key, w) => { const d = (await one(key)) || { list: [] }; if (!d.list.includes(w)) { d.list.push(w); await setDoc(key, d); } };

  /// an end the kart server accepted: { mode, track, startedAt, t, time, laps, racer, ghost } → the event's progress (or null)
  async function onEnd(w, r) {
    if (!inWindow(r.startedAt, r.t)) return null;
    if (KEV.RACES.modes.includes(r.mode)) {
      const k = `worldKevRace/${w}`, d = (await one(k)) || { n: 0, at: [] };
      d.n += 1; d.at = [...(d.at || []), r.t].slice(-40); d.last = r.t; if (!d.first) d.first = r.t; if (!d.name) d.name = await nameOf(w);
      await setDoc(k, d); if (d.n === KEV.RACES.need) await pushList("worldStats/kevQual", w);
      return { races: Math.min(d.n, KEV.RACES.need), need: KEV.RACES.need, n: d.n };
    }
    if (r.mode !== KEV.TA.mode || r.track !== KEV.TA.track) return null;
    const key = "worldStats/kevTa", cur = (await one(key)) || { top: [] }; let top = cur.top || [];
    const was = top.find((x) => x.id === w), better = !was || r.time < was.t;
    if (better) {
      const name = await nameOf(w);
      top = [{ id: w, w: short(w), name, t: r.time, at: r.t, racer: r.racer || "", laps: r.laps }, ...top.filter((x) => x.id !== w)].sort(taOrder).slice(0, KEV.TA.board);
      await setDoc(key, { top });
    }
    const i = top.findIndex((x) => x.id === w), rank = i < 0 ? null : i + 1;
    const g = typeof r.ghost === "string" ? r.ghost : "";
    if (better && rank && rank <= KEV.TA.ghosts && g && g.length <= KART.MAX_GHOST && GHOST_RE.test(g)) await setDoc(`worldKevGhost/${w}`, { t: r.time, g, racer: r.racer || "", laps: r.laps, at: r.t }).catch(() => {});
    return { ta: { t: (top[i] || {}).t || r.time, rank, better } };
  }

  const pubTop = (top) => (top || []).map(({ w, name, t, racer }) => ({ w, name: name || "", t, racer: racer || "" }));

  async function clip(b) {
    const s = signer(b); if (s.err) return s.err; const w = s.wallet, t = now();
    if (kevPhase(t) !== "on") return json(400, { error: kevPhase(t) === "soon" ? "the event hasn't started" : "the event is over" });
    const c = clipOf(b.url); if (!c) return json(400, { error: "an X post's address: https://x.com/<name>/status/<number>" });
    const k = `worldKevClip/${w}`, was = await one(k);
    if (!was || was.id !== c.id) {
      if (!(await commit([{ create: `worldKevClipUrl/${c.id}`, data: { w, at: t } }])).ok) { const o = await one(`worldKevClipUrl/${c.id}`); if (!o || o.w !== w) return json(409, { error: "that post was already sent in by another player" }); }
      if (was && was.id) await commit([{ del: `worldKevClipUrl/${was.id}` }]).catch(() => {});
    }
    const d = { url: c.url, user: c.user, id: c.id, at: t, first: (was && was.first) || t, name: (was && was.name) || (await nameOf(w)) };
    await setDoc(k, d); await pushList("worldStats/kevClips", w);
    return json(200, { ok: true, clip: { url: d.url, user: d.user, at: d.at } });
  }

  // ---- the team's list (read only: the GMs pay by hand after the event) ----
  async function gmList(url) {
    const q = (k) => String((url && url.searchParams && url.searchParams.get(k)) || ""), s = signer({ wallet: q("wallet"), issued: q("issued"), signature: q("signature") });
    if (s.err) return s.err; if (!(deps.isGM && deps.isGM(s.wallet))) return json(403, { error: "GM only" });
    const races = [], ta = [], clips = [];
    for (const x of ((await one("worldStats/kevQual")) || {}).list || []) { const d = (await one(`worldKevRace/${x}`)) || {}; races.push({ w: x, name: d.name || (await nameOf(x)), n: d.n || 0, last: d.last || 0 }); }
    const top = (((await one("worldStats/kevTa")) || {}).top || []).slice(0, KEV.TA.ghosts);
    for (let i = 0; i < top.length; i++) { const x = top[i], g = await one(`worldKevGhost/${x.id}`); ta.push({ rank: i + 1, w: x.id, name: x.name, t: x.t, laps: x.laps || [], at: x.at, ghost: g && g.g && Math.abs(g.t - x.t) < 0.0015 ? `worldKevGhost/${x.id}` : "" }); }
    for (const x of ((await one("worldStats/kevClips")) || {}).list || []) { const c = await one(`worldKevClip/${x}`); if (c) clips.push({ w: x, name: c.name || "", url: c.url, at: c.at }); }
    return json(200, { ok: true, phase: kevPhase(now()), start: KEV.START, end: KEV.END, races, ta, clips }, "no-store");
  }

  return {
    onEnd,
    /// KG: would this guest end count toward EVENT 01 once claimed (the window and the mode)
    counts: (e) => inWindow(e.startedAt, e.t) && KEV.RACES.modes.includes(e.mode),
    async read(v, url) {
      const q = (k) => String((url && url.searchParams && url.searchParams.get(k)) || "");
      const w = q("wallet").toLowerCase(), me = isAddr(w) ? w : "", t = now();
      if (v === "kart-event-ta") {
        const top = ((await one("worldStats/kevTa")) || {}).top || [], i = me ? top.findIndex((x) => x.id === me) : -1;
        return json(200, { top: pubTop(top), me: i < 0 ? null : { rank: i + 1, t: top[i].t } }, me ? "no-store" : "public, max-age=20");
      }
      if (v === "kart-event-gm") return gmList(url);
      if (v !== "kart-event") return null;
      const [qual, clips, ta] = await Promise.all([one("worldStats/kevQual"), one("worldStats/kevClips"), one("worldStats/kevTa")]);
      const out = { start: KEV.START, end: KEV.END, now: t, phase: kevPhase(t), counts: { qualified: ((qual || {}).list || []).length, clips: ((clips || {}).list || []).length, ta: ((ta || {}).top || []).length } };
      if (me) {
        const [r, c] = await Promise.all([one(`worldKevRace/${me}`), one(`worldKevClip/${me}`)]), top = (ta && ta.top) || [], i = top.findIndex((x) => x.id === me);
        out.races = { n: (r && r.n) || 0, need: KEV.RACES.need };
        out.ta = i < 0 ? null : { t: top[i].t, rank: i + 1 };
        out.clip = c ? { url: c.url, user: c.user, at: c.at } : null;
      }
      return json(200, out, me ? "no-store" : "public, max-age=20");
    },
    async handle(b) {
      if (b.action === "world-kev-clip") return clip(b);
      return null;
    },
  };
}
