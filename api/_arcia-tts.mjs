// api/_arcia-tts.mjs — ARCIA's own voice for the chat's Voice button, the same young woman's voice on every device
// (the browser's built-in voices differ per phone and are often a man's). POST /api/arcia { action: "tts", text, lang }
// → audio/mpeg. The page falls back to the browser's voice when this is off or fails.
//
// Vercel environment variables (whichever key is set; ElevenLabs first):
//   ELEVENLABS_API_KEY    + ELEVENLABS_VOICE_ID (the voice to use, from elevenlabs.io → Voices; a default premade voice
//                         is used until it's set) · ELEVENLABS_MODEL (default eleven_flash_v2_5: fast, cheap, Korean/Chinese)
//   OPENAI_API_KEY        + OPENAI_TTS_VOICE (default "nova") · OPENAI_TTS_MODEL (default gpt-4o-mini-tts, which also
//                         takes a speaking style)
//   ARCIA_TTS=0           switches it off; ARCIA_TTS_DAY_CAP (default 3000) caps clips per day across all visitors
// Both bill per character, so a clip is at most 400 characters, an IP gets 40 clips an hour, and the same line is
// served from memory for 10 minutes.
const env = (k) => String(process.env[k] || "").trim();
export function ttsProvider() {
  if (env("ARCIA_TTS") === "0") return null;
  if (env("ELEVENLABS_API_KEY")) return "elevenlabs";
  if (env("OPENAI_API_KEY")) return "openai";
  return null;
}
const STYLE = "Speak as ARCIA, a bright, cheerful young woman who is a K-pop style virtual idol: warm, playful and sweet, light and lively, smiling as she talks, natural pace. Never robotic.";
const cache = new Map();
export function cleanForSpeech(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+|\b\S+\.(app|com|me|world)\/\S*/g, "")
    .replace(/0x[0-9a-fA-F]{40,64}/g, "")
    .replace(/[♡♥✨☀✦]|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "")
    .replace(/~+/g, "!").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 400);
}

/// → { audio: ArrayBuffer, type } or throws
export async function speak(text, lang, fetchImpl = fetch) {
  const p = ttsProvider();
  if (!p) throw Object.assign(new Error("voice is off"), { status: 503 });
  const t = cleanForSpeech(text);
  if (!t) throw Object.assign(new Error("nothing to say"), { status: 400 });
  const key = `${p}|${lang}|${t}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.v;
  let r;
  if (p === "elevenlabs") {
    const voice = env("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM";
    r = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "xi-api-key": env("ELEVENLABS_API_KEY"), "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: t, model_id: env("ELEVENLABS_MODEL") || "eleven_flash_v2_5", ...(["ko", "zh", "en"].includes(lang) && /flash|turbo/.test(env("ELEVENLABS_MODEL") || "eleven_flash_v2_5") ? { language_code: lang } : {}),
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } }),
    });
  } else {
    r = await fetchImpl("https://api.openai.com/v1/audio/speech", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${env("OPENAI_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({ model: env("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts", voice: env("OPENAI_TTS_VOICE") || "nova", input: t, response_format: "mp3",
        ...(/gpt-4o/.test(env("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts") ? { instructions: STYLE } : {}) }),
    });
  }
  if (!r.ok) {
    const why = (await r.text().catch(() => "")).slice(0, 200);
    throw Object.assign(new Error(`${p} ${r.status}: ${why}`), { status: 502 });
  }
  const v = { audio: await r.arrayBuffer(), type: "audio/mpeg" };
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), v });
  return v;
}
