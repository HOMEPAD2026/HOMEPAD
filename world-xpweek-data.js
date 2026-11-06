// world-xpweek-data.js — the 3× EXP WEEK (the owner, 2026-11-06: "일주일간 이벤트로 레벨 경험치 … 한판하면 레벨 1에서 8정도"):
// for 7 days every EXP a player earns is at least ×XPW.K. Shared by the game (world-play.js gain(), the entry popup) and the
// server (api/_world.mjs save: the XP allowance's boostK), so the two always agree.
// Why 3×: a new player's typical first SURVIVORS run (about 2:30, ~210 knock-outs) is 150 + 210 × 2 = 570 EXP → Lv 4;
// ×3 = 1,710 EXP → Lv 8 (Lv 8 needs 1,421, Lv 9 1,780). Ten minutes in town (~40 knock-outs × 12 + the tutorial + the
// daily reward ≈ 715) → ×3 ≈ Lv 9. "At least": the other boosts are multiplied as before and the result is raised to K
// when it's lower — so the weekend's 2× doesn't stack on top (3×), and a new member's Starter Festival 5× stays 5×.
// The window on ONE line (UTC):
export const XPW_START = "2026-11-06T01:00:00Z", XPW_END = "2026-11-13T01:00:00Z";
export const XPW = { START: Date.parse(XPW_START), END: Date.parse(XPW_END), K: 3 };
export const xpwOn = (t = Date.now()) => t >= XPW.START && t < XPW.END;
/// the EXP multiplier during the week: the other boosts' product k, raised to at least XPW.K
export const xpwK = (t, k = 1) => (xpwOn(t) ? Math.max(Number(k) || 1, XPW.K) : Number(k) || 1);
