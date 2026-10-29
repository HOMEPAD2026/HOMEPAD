// world-words-load.js — the game's words (world-words.js) one language at a time. tools/build-world.mjs writes
// gen/words-<lang>.js from world-words.js; the game loads only the player's language (2026-10-29: the three together
// were a 1 MB chunk every player — English ones too — fetched and parsed before the loading screen moved).
// Edit world-words.js, never gen/.
export const WORDS = { ko: {}, zh: {}, tr: {} };
const done = new Set();
export async function loadWords(lang) {
  if (!WORDS[lang] || done.has(lang)) return WORDS[lang] || null;
  done.add(lang);
  try {
    const m = lang === "ko" ? await import("./gen/words-ko.js") : lang === "zh" ? await import("./gen/words-zh.js") : await import("./gen/words-tr.js");
    Object.assign(WORDS[lang], m.default);
  } catch (e) { console.warn("words", lang, e); /* the site dictionary and English stand in */ }
  return WORDS[lang];
}
