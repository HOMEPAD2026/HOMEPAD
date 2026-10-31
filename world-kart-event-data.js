// world-kart-event-data.js — the ARCIRCLE KART GRAND OPENING EVENT (2026-10-31, the owner's rules: 3 days · 3 events), shared
// by the game (world-kart-event.js, world-play.js's popup, world-kart.js) and the server (api/_world-kartevent.mjs). One place
// for every number: the window, the race challenge, the Time Attack championship's prizes, the clip contest's USDC pool.
//
//   EVENT 01 · KART RACE CHALLENGE      10 races (Race or Daily, accepted by the server) in the window → 50,000 ARCL
//   EVENT 02 · TIME ATTACK CHAMPIONSHIP Magma Run ('volcano') in Time Attack, the best total time in the window; ties → the
//                                        earlier time; the top 10 win 3M · 2M · 1M · 500k ×2 · 200k ×5 ARCL
//   EVENT 03 · KART CLIP CONTEST        a 15–60 s gameplay video on X tagging @ARCIRCLEonArc, its post's URL submitted in the
//                                        game (one a wallet, editable until the end); 1st–3rd win 30 / 20 / 10 USDC
// The game and the server only keep the tally; the GMs pay every prize by hand after the event (?world=kart-event-gm).
//
// THE WINDOW — set START to the deploy time and END to START + 72 h (both UTC, both here, nowhere else):
export const EVENT_START = "2026-10-31T13:40:00Z", EVENT_END = "2026-11-03T13:40:00Z";

export const KEV = {
  START: Date.parse(EVENT_START), END: Date.parse(EVENT_END),
  RACES: { need: 10, arcl: 50000, modes: ["race", "daily"] },
  TA: { track: "volcano", mode: "ta", board: 50, ghosts: 10, pay: [3000000, 2000000, 1000000, 500000, 500000, 200000, 200000, 200000, 200000, 200000] },
  CLIP: { usd: [30, 20, 10], tag: "@ARCIRCLEonArc", secs: [15, 60] },
  LINK: "https://www.arcircle.app/game",
};
/// "soon" before START, "on" inside the window, "over" after END
export const kevPhase = (t) => (t < KEV.START ? "soon" : t < KEV.END ? "on" : "over");
export const kevOn = (t) => kevPhase(t) === "on";
/// the ARCL for a final Time Attack place (1-based), 0 past the 10th
export const taPrize = (rank) => KEV.TA.pay[rank - 1] || 0;
export const TA_TOTAL = KEV.TA.pay.reduce((a, x) => a + x, 0);
/// an X post's address → { url (normalized to https://x.com/<user>/status/<id>), user, id } or null
const CLIP_RE = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})(?:[/?#][^\s]*)?$/;
export function clipOf(s) {
  const m = CLIP_RE.exec(String(s || "").trim()); if (!m || m[1].toLowerCase() === "i") return null;
  return { url: `https://x.com/${m[1]}/status/${m[2]}`, user: m[1], id: m[2] };
}
/// the board's order: the faster time first, a tie → whoever set it first
export const taOrder = (a, b) => a.t - b.t || a.at - b.at;
/// the window shown in five time zones (the owner, 2026-10-31: the US, Korea, China and Turkey), always through Intl with the
/// zone's name — never a fixed offset: US daylight time ends on Sun 1 Nov 2026, inside the event, so ET / PT move an hour
export const KEV_TZ = [{ id: "et", tz: "America/New_York", l: "ET" }, { id: "pt", tz: "America/Los_Angeles", l: "PT" }, { id: "kst", tz: "Asia/Seoul", l: "KST" }, { id: "cst", tz: "Asia/Shanghai", l: "CST" }, { id: "trt", tz: "Europe/Istanbul", l: "TRT" }];
const TZ_LOC = { en: "en-US", ko: "ko-KR", zh: "zh-CN", tr: "tr-TR" }, TZ_OWN = { en: ["et", "pt"], ko: ["kst"], zh: ["cst"], tr: ["trt"] }, TZ_LBL = { zh: { cst: "北京时间" }, tr: { trt: "TSİ" } };
/// one moment's wall clock in a zone, in the reader's language ("Nov 1, 9:00 PM")
export const kevWhen = (t, tz, lang = "en") => new Intl.DateTimeFormat(TZ_LOC[lang] || "en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
/// START → END for a reader: main = their own zone(s) first (en: ET + PT, ko: KST, zh: 北京时间, tr: TSİ), rest = the others on one line
export function kevTimes(lang = "en", s = KEV.START, e = KEV.END) {
  const own = TZ_OWN[lang] || TZ_OWN.en, lab = (z) => (TZ_LBL[lang] || {})[z.id] || z.l;
  return { main: KEV_TZ.filter((z) => own.includes(z.id)).map((z) => `${kevWhen(s, z.tz, lang)} ${lab(z)} → ${kevWhen(e, z.tz, lang)} ${lab(z)}`),
    rest: KEV_TZ.filter((z) => !own.includes(z.id)).map((z) => `${lab(z)} ${kevWhen(s, z.tz, lang)} → ${kevWhen(e, z.tz, lang)}`).join(" · ") };
}
