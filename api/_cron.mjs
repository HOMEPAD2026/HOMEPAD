// Cron helpers for the keeper endpoints called by cron-job.org (api/desk.mjs, api/arcia-tg.mjs).
// cron-job.org marks a job failed when the answer is too big ("output too large") or slower than its
// request timeout (about 30 s), and turns jobs off after a run of failures. So every keeper:
//   · finishes inside a budget that fits that timeout (24 s by default; CRON_BUDGET_MS or &budget=<seconds>
//     raises or lowers it, 5–55 s — raise it only for a scheduler that waits longer)
//   · answers with a short summary (counts, not lists); &full=1 gives the whole result for debugging.

const clampS = (s) => Math.min(55, Math.max(5, s));

/// the total time one cron call may take, in ms
export function cronBudget(q = {}) {
  const b = Number(q.budget);
  if (Number.isFinite(b) && b > 0) return clampS(b) * 1000;
  const e = Number(process.env.CRON_BUDGET_MS);
  if (Number.isFinite(e) && e > 0) return clampS(e / 1000) * 1000;
  return 24000;
}

/// a keeper's own budget: what's left of the call, never more than it asked for
export const within = (total, want) => Math.max(3000, Math.min(want, total));

const scalar = (x) => x == null || typeof x !== "object";
const cut = (x) => (typeof x === "string" && x.length > 140 ? x.slice(0, 137) + "…" : x);

function brief(o, d) {
  if (scalar(o)) return cut(o);
  if (Array.isArray(o)) {
    if (d < 2 && o.every(scalar)) return o.length > 3 ? [...o.slice(0, 3).map(cut), `+${o.length - 3}`] : o.map(cut);
    return o.length;
  }
  if (d >= 2) { const e = Object.entries(o); return e.length <= 6 && e.every(([, v]) => scalar(v)) ? Object.fromEntries(e.map(([k, v]) => [k, cut(v)])) : "{…}"; }
  const r = {}, ks = Object.keys(o);
  for (const k of ks.slice(0, 24)) r[k] = brief(o[k], d + 1);
  if (ks.length > 24) r["…"] = ks.length - 24;
  return r;
}

/// a short summary of a keeper's result: scalars kept, lists counted, two levels deep, under ~3 KB
export function compact(o) {
  let b = brief(o, 0);
  if (JSON.stringify(b).length > 3000 && b && typeof b === "object") b = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, scalar(v) ? v : Array.isArray(v) ? v.length : "{…}"]));
  return b;
}

/// the answer a cron call gets: the summary (or the full result with &full=1) plus how long it took
export function cronOut(q, out, t0) {
  const body = q && q.full ? out : compact(out);
  return body && typeof body === "object" && !Array.isArray(body) ? { ...body, ms: Date.now() - t0 } : { result: body, ms: Date.now() - t0 };
}
