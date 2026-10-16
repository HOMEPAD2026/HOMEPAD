// api/_world-jump.mjs — Coin Jump (world-jumprace.js), the Game Village's climbing game.
//
//   POST { action: "world-jump-start", …signature }                    → { runId, startedAt }
//        one active run a wallet: a new start replaces the last (its end is then refused)
//   POST { action: "world-jump-end", …signature, runId, crowned, ms }  → { credited, already }
//        reaching the crown pays REWARD ARCL (kind "jump") once a day (the Seoul date), through the shop's credit
//        (inside its daily cap). Checked on the server's clock: at least MIN_S since the start (the fastest real
//        climb of 23 pads is well over that) and the game's own time no longer than the server's.
//
// Firestore: worldJumpRun/<wallet> · worldJumpEnd/<runId> (once) · worldJumpDay/<wallet>_<day> (the day's reward, once)
// All of it is progress, so each fresh start (epoch) begins empty: none of these is in _world-phase.mjs's KEEP.
const REWARD = 3000, MIN_S = 20, RUN_TTL = 30 * 60e3;
const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
export const JUMP = { REWARD, MIN_S };

/// deps: { getDocs, setDoc, commit, json, now, signer(b), credit(wallet, kind, n) → credited, randomId? }
export function makeJump(deps) {
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];

  async function start(b) {
    const s = signer(b); if (s.err) return s.err;
    const runId = rid(), startedAt = now();
    await setDoc(`worldJumpRun/${s.wallet}`, { runId, startedAt });
    return json(200, { runId, startedAt });
  }

  async function end(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, t = now(), msIn = Number(b.ms);
    const run = await one(`worldJumpRun/${w}`);
    if (!run || run.runId !== String(b.runId || "") || t - run.startedAt > RUN_TTL) return json(409, { error: "that run isn't active" });
    if (!Number.isFinite(msIn) || msIn < 0) return json(400, { error: "bad numbers" });
    const ms = t - run.startedAt; // the server's clock, not the game's
    if (msIn > ms + 5000) return json(400, { error: "the run is longer than it has been going" });
    if (b.crowned === true && ms < MIN_S * 1000) return json(400, { error: "too fast" });
    // the end counts once (a repeated request is refused, a lost reply can't be paid twice)
    if (!(await commit([{ create: `worldJumpEnd/${run.runId}`, data: { at: t, wallet: w, crowned: b.crowned === true } }])).ok) return json(409, { error: "that run has ended" });
    if (b.crowned !== true) return json(200, { ok: true, credited: 0, already: false });
    // the day's reward: a create-only marker, so two ends at once can't both be paid
    const day = seoulDay(t);
    if (!(await commit([{ create: `worldJumpDay/${w}_${day}`, data: { at: t, runId: run.runId } }])).ok) return json(200, { ok: true, credited: 0, already: true });
    const credited = deps.credit ? await deps.credit(w, "jump", REWARD) : 0;
    return json(200, { ok: true, credited, already: false, capped: credited < REWARD });
  }

  return {
    async handle(b) {
      if (b.action === "world-jump-start") return start(b);
      if (b.action === "world-jump-end") return end(b);
      return null;
    },
  };
}
