// world-pumpking-data.js — the Halloween Pumpkin Kings' rules on the game's side: a copy of api/_world-halloween.mjs PK
// and its US Eastern clock (tests/world/pumpking.test.mjs checks they agree), plus what only the game needs: where each
// king lives in town and the names the game shows.
export const PK = {
  TZ: "America/New_York",
  FROM: "2026-10-22", TO: "2026-11-05", // US Eastern dates, both included: the kings are in town; a night starts on FROM … the day before TO (14 nights)
  NIGHT: [20, 5], // the rampage: 20:00 to 05:00 US Eastern
  KINGS: [ // hp: everyone's; arcl and the item go to the top hitter, the 2nd and 3rd get RANK's share and PLUS_DOWN fewer +
    { id: "k15", lv: 15, hp: 45000, arcl: 3000, item: { r: 2, p: 5 } },
    { id: "k35", lv: 35, hp: 105000, arcl: 6000, item: { r: 3, p: 3 } },
    { id: "k55", lv: 55, hp: 165000, arcl: 10000, item: { r: 3, p: 5 } },
    { id: "k75", lv: 75, hp: 225000, arcl: 18000, item: { r: 4, p: 3 } },
    { id: "k95", lv: 95, hp: 285000, arcl: 30000, item: { r: 4, p: 5, u: "jack" } },
  ],
  RANK: [1, 0.6, 0.4], PLUS_DOWN: [0, 1, 2],
  GAP: 5, CAP_K: 60, LV_BELOW: 10, MIN_SHARE: 0.02, // one report per 5 s, ≤ 60 × level each; your level ≥ the king's − 10; a top-3 place needs ≥ 2% of its HP
};
// ---- US Eastern time (Intl knows the clock changes; 1 Nov 2026 falls inside the event) ----
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: PK.TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function etParts(t) { const p = {}; for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value; return { day: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute }; }
const dayAdd = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
/// the moment a US Eastern wall-clock hour happens on a day (two passes: the offset at that moment, not now)
export function etAt(day, h) { let t = Date.parse(day + "T00:00:00Z") + h * 3600e3; for (let i = 0; i < 2; i++) { const p = etParts(t), off = Date.parse(`${p.day}T${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}:00Z`) - t; t = Date.parse(day + "T00:00:00Z") + h * 3600e3 - off; } return t; }
/// the kings are in town (day or night)
export const dayOn = (t) => { const d = etParts(t).day; return d >= PK.FROM && d <= PK.TO; };
/// which night it is: id = the US Eastern date it began on; on while 20:00–05:00 of an event night; next: when the next one begins
export function nightOf(t) {
  const p = etParts(t), id = p.h >= PK.NIGHT[0] ? p.day : p.h < PK.NIGHT[1] ? dayAdd(p.day, -1) : "", on = !!id && id >= PK.FROM && id < PK.TO;
  let nd = p.h >= PK.NIGHT[0] ? dayAdd(p.day, 1) : p.day; if (nd < PK.FROM) nd = PK.FROM;
  const next = nd < PK.TO ? etAt(nd, PK.NIGHT[0]) : 0;
  return { on, id: on ? id : "", at: on ? etAt(dayAdd(id, 1), PK.NIGHT[1]) : 0, next };
}
// the five homes (round the plaza, out along the paths: the lower the level, the nearer the plaza) and their names
export const HOMES = { k15: [0, 40], k35: [44, 26], k55: [46, -30], k75: [-26, -50], k95: [-52, 34] };
export const KING_NAME = "Pumpkin King", JACK_NAME = "Inferno Jack";
