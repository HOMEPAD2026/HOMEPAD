// world-studio-modes.js — SM1 (2026-10-28, the owner: "진행하자" — the Studio's next step, multiplayer first): what a live room
// plays. A room (api/_world-studio.mjs RACE) holds 2–8 on one published Sky Runner / Infinity Dash / Obby World game; its host
// picks the mode in the lobby:
//   race     first to the goal (as before)
//   team     two teams by seat (1st, 3rd, 5th … Red; 2nd, 4th … Blue): a finish scores PTS by its place, the rest a share
//            of 5 for how far they got; the higher team total wins
//   survive  one heart each — whoever stays in longest wins (reaching the goal counts as surviving to the end)
//   coop     everyone on one side: the room clears when everyone still in reaches the goal; the coins are pooled
// Shared by the Studio (the lobby, the HUD board, the result card) and its test. No rewards hang on it (play only).
export const MODES = ["race", "team", "survive", "coop"];
export const MODE = {
  race: { icon: "🏁", name: "Race", line: "First to the goal wins" },
  team: { icon: "⚔️", name: "Teams", line: "Red against Blue — every finish scores for your team" },
  survive: { icon: "💀", name: "Survival", line: "One heart each — the last one standing wins" },
  coop: { icon: "🤝", name: "Co-op", line: "Everyone together — clear it as one team" },
};
export const PTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const TEAM = [{ name: "Red", col: "#ff4d6d" }, { name: "Blue", col: "#4da3ff" }];
export const modeOf = (m) => (MODES.includes(m) ? m : "race");
export const teamOf = (seat) => seat % 2;

/// the room's standing: players (in seat order, each { w, fin, out, outAt, coins, … }) and prog(p) → 0…1 how far they got.
/// → { mode, order (best first, each with seat / team / place / pts), teams [{ pts, fin, n }] (team mode), winner (a team
///   0 / 1, -1 for a draw; a wallet in the others; "" while it's open), alive, done, cleared (coop), coins (coop), time }
export function standing(mode, players, prog = (p) => p.pr || 0) {
  mode = modeOf(mode);
  const L = (players || []).map((p, seat) => ({ ...p, seat, team: teamOf(seat), g: Math.max(0, Math.min(1, Number(prog(p)) || 0)) }));
  const done = L.length > 0 && L.every((p) => p.fin || p.out), alive = L.filter((p) => !p.fin && !p.out).length;
  const cmp = (a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1
    : mode === "survive" ? (a.out !== b.out ? (a.out ? 1 : -1) : a.out ? (b.outAt || 0) - (a.outAt || 0) : b.g - a.g)
    : a.out !== b.out ? (a.out ? 1 : -1) : b.g - a.g);
  const order = L.slice().sort(cmp);
  let fi = 0; for (const p of order) p.pts = p.fin ? PTS[Math.min(PTS.length - 1, fi++)] : Math.round(p.g * 5);
  order.forEach((p, i) => { p.place = i + 1; });
  const out = { mode, order, alive, done, winner: "", teams: null, cleared: false, coins: 0, time: 0 };
  if (mode === "team") {
    out.teams = [0, 1].map((t) => { const m = order.filter((p) => p.team === t); return { pts: m.reduce((s, p) => s + p.pts, 0), fin: m.filter((p) => p.fin).length, n: m.length }; });
    // (a tie on points goes to the team that got further — every run's share of the course, added up; a draw only when that ties too)
    out.teams.forEach((tm, t) => { tm.far = order.filter((p) => p.team === t).reduce((s, p) => s + (p.fin ? 1 : p.g), 0); });
    const [A, B] = out.teams, d = A.pts - B.pts || (Math.abs(A.far - B.far) < 0.01 ? 0 : A.far - B.far);
    if (done) out.winner = d === 0 ? -1 : d > 0 ? 0 : 1;
  } else if (mode === "coop") {
    out.coins = L.reduce((s, p) => s + (p.coins || 0), 0);
    const fins = L.filter((p) => p.fin), stay = L.filter((p) => !p.out || p.fin);
    out.cleared = done && fins.length > 0 && fins.length === stay.length; out.time = out.cleared ? Math.max(...fins.map((p) => p.fin)) : 0;
    if (done) out.winner = out.cleared ? "all" : "";
  } else if (mode === "survive") {
    if (done || alive <= 1) { const top = order[0]; out.winner = top && (top.fin || !top.out || done) ? top.w : ""; }
  } else if (done && order[0] && order[0].fin) out.winner = order[0].w;
  return out;
}
