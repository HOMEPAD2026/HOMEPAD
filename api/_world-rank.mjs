// api/_world-rank.mjs — ARCIRCLE World's weekly goals and popular villages: bounties (defeat N monsters), party quests
// (a server party of friends, a shared kill target), the village rankings and their weekly / monthly prizes.
//
//   GET  ?world=bounty&wallet=0x…?        { week, kills, bounties, party, invites, wins, next }  everything for the Adventure log
//   GET  ?world=party&wallet=0x…          { party, invites }  the small one the game asks every few minutes (1–2 reads)
//   GET  ?world=village-top&p=week|month|all   { p, key, top: [{ wallet, name, likes, level, score, n }], last }  top 20, public, 30 s
//   POST { action: "world-bounty-claim", …signature, id }                      a bounty's ARCL, once a week
//   POST { action: "world-party-create" | "-leave" | "-claim", …signature }
//   POST { action: "world-party-invite" | "-kick", …signature, to }            the leader; invites go to mutual friends only
//   POST { action: "world-party-accept" | "-decline", …signature, id }        an invite waiting for you
//   POST { action: "world-vwin-claim", …signature, p, key }                    a top-3 village's prize for a finished week / month
//
// Kills are the ones the server counted itself: every hunt claim adds 1 to k in worldHuntWeek/<week>_<wallet> (api/_world-shop.mjs
// huntPoint), inside the daily limits that bound those claims. A bounty is a kill count this week (Seoul Monday to Sunday).
// A party is one document (the leader and up to three accepted friends); its quest adds up each member's kills since they
// joined this week (their count at joining is kept as a baseline). Idle two hours with no new kills and it ends.
// Likes count for the rankings only from wallets whose saved level is RANK_MIN_LV or more (api/_world.mjs like → weekLike
// in _world-social.mjs, which keeps the week / month / all-time top-20 documents); every like is still recorded.
// Prizes: no scheduler, so the first request after a week or month ends freezes its top three into
// worldStats/villageWin_<key> (created once); the winners claim once, paid with credit() (the daily cap applies; the day's
// room is checked and the claim isn't spent when there's none) — a prize above the cap would use award() instead.
// Firestore: worldParty/<id> { lead, wk, at, last, m: [{ w, n, b }] } · worldPartyOf/<wallet> { id, inv: [{ id, from, fn, at }] }
//            worldRankClaim/<wallet> { <kind>_<period>: 1 } (what's been claimed) · worldRankOnce/<period>_<wallet>_<kind> (the claim's marker)
//            worldStats/villageWin_<key> { p, key, at, winners: [{ wallet, name, likes, prize }] }
import { DAILY_CAP } from "./_world-shop.mjs";
import { pairKey } from "./_world-chat.mjs";
import { monthOf, topKey, VTOP, nextWeekAt } from "./_world-social.mjs";
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const fk = (s) => String(s).replace(/[^0-9A-Za-z]/g, "");

// every number in one place
export const BOUNTIES = [{ id: "b100", kills: 100, arcl: 40 }, { id: "b300", kills: 300, arcl: 100 }, { id: "b600", kills: 600, arcl: 200 }];
export const PARTY = { max: 4, kills: 500, arcl: 150, min: 20, idleMs: 2 * 3600e3, inviteMs: 3600e3, inviteMax: 5 }; // min: the kills a member must have added to share the reward
export const RANK_MIN_LV = 3;
export const VILLAGE_PRIZE = { week: [500, 300, 150], month: [2000, 1000, 500] }; // ARCL for 1st, 2nd and 3rd
export const PERIODS = ["week", "month"];

/// deps: { getDocs, setDoc, commit, json, now, signer, isoWeek, credit(w, kind, n), award(w, kind, n), dayCap?() }
export function makeRank(deps) {
  const { getDocs, setDoc, commit, json, signer, isoWeek } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const wkNow = () => isoWeek(now());
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  const claimKey = (kind, period) => `${kind}_${fk(period)}`;
  // the period just ended (back = 1) or the one before it (2): a week's or a month's key
  const periodKey = (p, back) => (p === "week" ? isoWeek(now() - 7 * 864e5 * back) : (() => { const d = new Date(now() + 9 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)).toISOString().slice(0, 7); })());
  const huntKey = (wk, w) => `worldHuntWeek/${wk}_${w}`;
  const kOf = (d, wk, w) => Math.max(0, Math.floor(Number((d[huntKey(wk, w)] || {}).k) || 0));

  // ---- paying out: once per marker, inside the day's cap; with no room today the marker is taken back ----
  async function pay(w, kind, ck, claimed, amount) {
    const marker = `worldRankOnce/${w}_${ck}`;
    if (claimed[ck] || !(await commit([{ create: marker, data: { at: now() } }, { inc: `worldRankClaim/${w}`, fields: { [ck]: 1 } }])).ok) return { err: json(409, { error: "already claimed" }) };
    const cap = deps.dayCap ? deps.dayCap() : DAILY_CAP, big = amount > cap;
    const got = big ? await deps.award(w, kind, amount) : await deps.credit(w, kind, amount);
    if (got <= 0) { await commit([{ del: marker }, { inc: `worldRankClaim/${w}`, fields: { [ck]: -1 } }]).catch(() => {}); return { err: json(429, { error: "today's ARCL limit is reached — claim it tomorrow" }) }; }
    return { got, award: big };
  }

  // ---- bounties ----
  const bountyView = (kills, claimed, wk) => BOUNTIES.map((b) => ({ id: b.id, kills: b.kills, arcl: b.arcl, done: kills >= b.kills, claimed: !!claimed[claimKey(b.id, wk)] }));
  async function bountyClaim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, def = BOUNTIES.find((x) => x.id === String(b.id || "")); if (!def) return json(400, { error: "which bounty?" });
    const wk = wkNow(), d = await getDocs([huntKey(wk, w), `worldRankClaim/${w}`]);
    if (kOf(d, wk, w) < def.kills) return json(400, { error: `defeat ${def.kills} monsters this week first` });
    const r = await pay(w, "bounty", claimKey(def.id, wk), d[`worldRankClaim/${w}`] || {}, def.arcl);
    if (r.err) return r.err;
    return json(200, { ok: true, credited: r.got, ...(await board(w)) });
  }

  // ---- parties ----
  const memberOf = (P, w) => (P && Array.isArray(P.m) ? P.m.find((x) => x.w === w) : null);
  const alive = (P) => !!P && !P.closed && Array.isArray(P.m) && P.m.length > 0 && now() - (P.at || 0) <= PARTY.idleMs;
  async function boxOf(w, doc) { const o = (doc !== undefined ? doc : await one(`worldPartyOf/${w}`)) || {}; return { id: String(o.id || ""), inv: (Array.isArray(o.inv) ? o.inv : []).filter((i) => now() - i.at < PARTY.inviteMs) }; }
  const saveBox = (w, box) => setDoc(`worldPartyOf/${w}`, { id: box.id || "", inv: box.inv.slice(-PARTY.inviteMax) });
  /// a party's progress this week from its members' own counts; a party that hasn't moved in two hours has ended.
  /// Written back (the last total, the time) only when something moved, at most every 30 s.
  async function progress(P, extra = [], have = {}) {
    const wk = wkNow(), ws = P.m.map((x) => x.w), need = [...new Set([...ws, ...extra])].map((w) => huntKey(wk, w)).filter((k) => !(k in have)), d = { ...have, ...(need.length ? await getDocs(need) : {}) };
    const abs = ws.reduce((a, w) => a + kOf(d, wk, w), 0), moved = abs !== (P.last || 0);
    const mem = P.m.map((x) => ({ w: x.w, n: x.n || "", k: Math.max(0, kOf(d, wk, x.w) - (P.wk === wk ? x.b || 0 : 0)), lead: x.w === P.lead }));
    if (!moved && now() - (P.at || 0) > PARTY.idleMs) { P = { ...P, closed: 1 }; await setDoc(`worldParty/${P.id}`, P).catch(() => {}); return { P, mem: [], total: 0, abs, d, wk, ended: true }; }
    if (moved && now() - (P.at || 0) > 30e3) { P = { ...P, at: now(), last: abs }; await setDoc(`worldParty/${P.id}`, P).catch(() => {}); }
    return { P, mem, total: mem.reduce((a, m) => a + m.k, 0), abs, d, wk };
  }
  // a party's document as it stands in a new week: everyone's baseline starts at zero (their counts start over on Monday)
  const rolled = (P, wk) => (P.wk === wk ? P : { ...P, wk, m: P.m.map((x) => ({ ...x, b: 0 })), last: 0 });
  const partyOut = (P, mem, total, me, claimed, wk) => ({ id: P.id, lead: P.lead, max: PARTY.max, goal: PARTY.kills, arcl: PARTY.arcl, min: PARTY.min, members: mem, total, done: total >= PARTY.kills, mine: (mem.find((m) => m.w === me) || {}).k || 0, claimed: !!claimed[claimKey("party", wk)], endsAt: (P.at || 0) + PARTY.idleMs });
  async function liveParty(w) {
    const box = await boxOf(w), P0 = box.id ? await one(`worldParty/${box.id}`) : null;
    if (!P0 || !memberOf(P0, w) || P0.closed) return { box, P: null };
    const pr = await progress(rolled(P0, wkNow())); // a party that moved or rolled into a new week is saved by progress / the next change
    return pr.ended ? { box, P: null } : { box, P: pr.P, pr };
  }
  async function create(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, { box, P } = await liveParty(w); if (P) return json(409, { error: "you are in a party already" });
    const wk = wkNow(), d = await getDocs([huntKey(wk, w), `worldSave/${w}`]), k = kOf(d, wk, w), id = rid();
    await setDoc(`worldParty/${id}`, { id, lead: w, wk, at: now(), last: k, m: [{ w, n: String((d[`worldSave/${w}`] || {}).name || "").slice(0, 16), b: k }] });
    await saveBox(w, { ...box, id });
    return json(200, { ok: true, ...(await board(w)) });
  }
  async function invite(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, to = lc(b.to); if (!isAddr(to) || to === w) return json(400, { error: "who do you want to invite?" });
    const { P } = await liveParty(w); if (!P) return json(400, { error: "start a party first" });
    if (P.lead !== w) return json(403, { error: "only the leader invites" });
    if (P.m.length >= PARTY.max) return json(409, { error: "a party is you and three friends" });
    if (memberOf(P, to)) return json(409, { error: "they are in your party" });
    const d = await getDocs([`worldFriend/${pairKey(w, to)}`, `worldSave/${w}`]);
    if (((d[`worldFriend/${pairKey(w, to)}`] || {}).st) !== "ok") return json(403, { error: "you can only invite friends" });
    const box = await boxOf(to);
    if (box.id && box.id !== P.id) { const Q = await one(`worldParty/${box.id}`); if (alive(Q) && memberOf(Q, to)) return json(409, { error: "they are in another party" }); }
    await saveBox(to, { ...box, inv: [...box.inv.filter((i) => i.id !== P.id), { id: P.id, from: w, fn: String((d[`worldSave/${w}`] || {}).name || "").slice(0, 16), at: now() }] });
    return json(200, { ok: true, ...(await board(w)) });
  }
  async function accept(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, id = String(b.id || ""), box = await boxOf(w);
    if (!box.inv.some((i) => i.id === id)) return json(404, { error: "that invitation is gone" });
    const mine = await liveParty(w); if (mine.P && mine.P.id !== id) return json(409, { error: "leave your party first" });
    const P0 = await one(`worldParty/${id}`);
    if (!alive(P0) || P0.closed) { await saveBox(w, { ...box, inv: box.inv.filter((i) => i.id !== id) }); return json(410, { error: "that party has ended" }); }
    if (memberOf(P0, w)) return json(200, { ok: true, ...(await board(w)) });
    if (P0.m.length >= PARTY.max) return json(409, { error: "that party is full" });
    const wk = wkNow(), pr = await progress(rolled(P0, wk), [w]);
    if (pr.ended) return json(410, { error: "that party has ended" });
    const P = pr.P, k = kOf(pr.d, wk, w), sv = await one(`worldSave/${w}`);
    await setDoc(`worldParty/${id}`, { ...P, at: now(), last: pr.abs + k, m: [...P.m, { w, n: String((sv || {}).name || "").slice(0, 16), b: k }] });
    await saveBox(w, { id, inv: box.inv.filter((i) => i.id !== id) });
    return json(200, { ok: true, ...(await board(w)) });
  }
  async function decline(b) {
    const s = signer(b); if (s.err) return s.err;
    const box = await boxOf(s.wallet), id = String(b.id || "");
    if (box.inv.some((i) => i.id === id)) await saveBox(s.wallet, { ...box, inv: box.inv.filter((i) => i.id !== id) });
    return json(200, { ok: true, ...(await board(s.wallet)) });
  }
  // out of a party: the member list changes and the leader passes on; the last one out closes it
  async function drop(P, w) {
    const m = P.m.filter((x) => x.w !== w), left = m.length ? { ...P, m, lead: P.lead === w ? m[0].w : P.lead, at: now() } : { ...P, m, closed: 1 };
    await setDoc(`worldParty/${P.id}`, left);
  }
  async function leave(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, box = await boxOf(w), P = box.id ? await one(`worldParty/${box.id}`) : null;
    if (P && memberOf(P, w) && !P.closed) await drop(P, w);
    await saveBox(w, { ...box, id: "" });
    return json(200, { ok: true, ...(await board(w)) });
  }
  async function kick(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, to = lc(b.to), { P } = await liveParty(w);
    if (!P || P.lead !== w) return json(403, { error: "only the leader can remove someone" });
    if (to === w || !memberOf(P, to)) return json(400, { error: "they are not in your party" });
    await drop(P, to);
    const box = await boxOf(to); if (box.id === P.id) await saveBox(to, { ...box, id: "" });
    return json(200, { ok: true, ...(await board(w)) });
  }
  async function partyClaim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, { P, pr } = await liveParty(w); if (!P) return json(400, { error: "you are not in a party" });
    const wk = wkNow(), me = pr.mem.find((m) => m.w === w);
    if (pr.total < PARTY.kills) return json(400, { error: `the party needs ${PARTY.kills} knock-outs this week` });
    if (!me || me.k < PARTY.min) return json(400, { error: `add at least ${PARTY.min} knock-outs yourself to share the reward` });
    const r = await pay(w, "party", claimKey("party", wk), (await one(`worldRankClaim/${w}`)) || {}, PARTY.arcl);
    if (r.err) return r.err;
    return json(200, { ok: true, credited: r.got, ...(await board(w)) });
  }

  // ---- village prizes: a finished week's or month's top three, frozen the first time anyone asks ----
  async function frozen(p, key, pre) {
    const wk = `worldStats/villageWin_${key}`, cur = pre !== undefined ? pre : await one(wk); if (cur) return cur;
    const top = ((await one(topKey(p, key))) || {}).top || [];
    const win = { p, key, at: now(), winners: top.slice(0, 3).map((x, i) => ({ wallet: x.wallet, name: x.name || "", likes: x.likes || 0, prize: VILLAGE_PRIZE[p][i] })) };
    if ((await commit([{ create: wk, data: win }])).ok) return win;
    return (await one(wk)) || win; // someone else froze it first
  }
  // the winners of the period that just ended, with this wallet's own place and claim
  const winKeys = () => PERIODS.map((p) => `worldStats/villageWin_${periodKey(p, 1)}`);
  async function wins(w, claimed, have) {
    const out = [], docs = have || (await getDocs(winKeys()));
    for (const p of PERIODS) {
      const key = periodKey(p, 1), win = await frozen(p, key, docs[`worldStats/villageWin_${key}`]), i = w ? win.winners.findIndex((x) => x.wallet === w) : -1;
      out.push({ p, key, winners: win.winners.map(({ name, likes, prize }) => ({ name, likes, prize })), ...(i >= 0 ? { rank: i + 1, prize: win.winners[i].prize, claimed: !!claimed[claimKey("vw", key)] } : {}) });
    }
    return out;
  }
  async function vwinClaim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, p = String(b.p || ""), key = String(b.key || "");
    if (!PERIODS.includes(p) || ![1, 2].some((n) => periodKey(p, n) === key)) return json(400, { error: "that prize has expired" }); // this period and the one before it
    const win = await frozen(p, key), i = win.winners.findIndex((x) => x.wallet === w);
    if (i < 0) return json(403, { error: "you weren't in the top three" });
    const r = await pay(w, "vwin", claimKey("vw", key), (await one(`worldRankClaim/${w}`)) || {}, win.winners[i].prize);
    if (r.err) return r.err;
    return json(200, { ok: true, credited: r.got, award: !!r.award, ...(await board(w)) });
  }
  // the list for one period (this week, this month, all time) and, with it, last period's winners
  async function villageTop(p) {
    p = PERIODS.includes(p) ? p : "all";
    const key = p === "week" ? wkNow() : p === "month" ? monthOf(now()) : "all", top = ((await one(topKey(p, key))) || {}).top || [];
    const last = p === "all" ? null : await frozen(p, periodKey(p, 1));
    return json(200, { p, key, top: top.slice(0, VTOP).map(({ wallet, name, likes, level, score, n }) => ({ wallet, name: name || "", likes: likes || 0, level: level || 1, score: score || 0, n: n || 0 })), min: RANK_MIN_LV,
      ...(last ? { last: { key: last.key, winners: last.winners.map(({ name, likes, prize }) => ({ name, likes, prize })) } } : {}), prizes: p === "all" ? null : VILLAGE_PRIZE[p] }, "public, max-age=30");
  }

  // ---- one view of everything a wallet has going ----
  async function board(w) {
    const wk = wkNow(), d = await getDocs([huntKey(wk, w), `worldRankClaim/${w}`, `worldPartyOf/${w}`, ...winKeys()]), box = await boxOf(w, d[`worldPartyOf/${w}`]), claimed = d[`worldRankClaim/${w}`] || {}, kills = kOf(d, wk, w);
    let party = null;
    const P0 = box.id ? await one(`worldParty/${box.id}`) : null;
    if (P0 && memberOf(P0, w) && !P0.closed) { const pr = await progress(rolled(P0, wk), [w], d); if (!pr.ended) party = partyOut(pr.P, pr.mem, pr.total, w, claimed, wk); }
    return { week: wk, kills, bounties: bountyView(kills, claimed, wk), party, invites: box.inv.map(({ id, from, fn }) => ({ id, from, fn })), wins: await wins(w, claimed, d), next: nextWeekAt(now()) };
  }
  // the small read the game repeats: who is in your party (for the XP bonus) and the invitations waiting
  async function mini(w) {
    const box = await boxOf(w), P = box.id ? await one(`worldParty/${box.id}`) : null, mine = P && memberOf(P, w) && !P.closed && now() - (P.at || 0) <= PARTY.idleMs + 6e4;
    return { party: mine ? { id: P.id, lead: P.lead, max: PARTY.max, members: P.m.map((x) => ({ w: x.w, n: x.n || "" })) } : null, invites: box.inv.map(({ id, from, fn }) => ({ id, from, fn })) };
  }

  return {
    async read(view, url) {
      const w = lc(url.searchParams.get("wallet"));
      if (view === "village-top") return villageTop(url.searchParams.get("p"));
      if (view === "party") return isAddr(w) ? json(200, await mini(w), "no-store") : json(400, { error: "wallet must be an address" });
      if (view === "bounty") {
        if (isAddr(w)) return json(200, await board(w), "no-store");
        return json(200, { week: wkNow(), bounties: BOUNTIES.map((x) => ({ ...x })), party: { goal: PARTY.kills, arcl: PARTY.arcl, max: PARTY.max }, wins: await wins("", {}) }, "public, max-age=30");
      }
      return null;
    },
    async handle(b) {
      if (b.action === "world-bounty-claim") return bountyClaim(b);
      if (b.action === "world-party-create") return create(b);
      if (b.action === "world-party-invite") return invite(b);
      if (b.action === "world-party-accept") return accept(b);
      if (b.action === "world-party-decline") return decline(b);
      if (b.action === "world-party-leave") return leave(b);
      if (b.action === "world-party-kick") return kick(b);
      if (b.action === "world-party-claim") return partyClaim(b);
      if (b.action === "world-vwin-claim") return vwinClaim(b);
      return null;
    },
  };
}
