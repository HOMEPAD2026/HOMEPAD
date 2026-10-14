// sfx.test.mjs — the sound effects (world-sfx.js) without a browser: every sound is safe to call before there is an
// AudioContext, footsteps only while running, the settings' defaults. Run: node tests/world/sfx.test.mjs
import { createSfx, stepOk, stepsDefault, RUN, MAXV } from "../../world-sfx.js";
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

const S = { sound: true }, Snd = createSfx({ S, saveSet: () => {} });
const calls = { step: [12], land: [14], swing: [true, 3], impact: [1], hitFx: ["ice", true], kill: ["boss"], drop: [4], chest: [3], cast: ["fire"], charge: [0.5] };
let threw = null;
for (const k of Object.keys(Snd)) { if (typeof Snd[k] !== "function" || ["settings", "render", "set", "init", "unlock", "scene"].includes(k)) continue; try { Snd[k](...(calls[k] || [])); } catch (e) { threw = k + ": " + e.message; } }
check(!threw, "every sound is a no-op before the first tap" + (threw ? " (" + threw + ")" : ""));
for (const k of ["pick", "win", "coin", "chest", "place", "pop", "paint", "bad", "board", "enter", "level", "jump", "land", "step", "dash", "swing", "impact", "cast", "hurt", "siren", "roar", "warn", "charge", "charged", "heart", "thunder", "rocket", "fire", "whale", "shutter"])
  check(typeof Snd[k] === "function", `the old ${k}() is still there`);
for (const k of ["tap", "tab", "open", "close", "equip", "buy", "salvage", "quest", "drop", "hitFx", "kill"]) check(typeof Snd[k] === "function", `${k}() exists`);
check(stepOk(12.5, true) && !stepOk(6.5, true) && !stepOk(12.5, false) && !stepOk(undefined, true), "footsteps only while running, and only when on");
check(RUN > 6.5 && RUN < 12.5, "the running line sits between walking and running speed");
check(stepsDefault(false) === true && stepsDefault(true) === false, "footsteps on with a mouse, off on a phone by default");
check(Snd.state().sfx === 70 && Snd.state().ctx === "none" && MAXV === 12, "70% effects volume, no context until a gesture, 12 voices at most");
console.log(`\n${ok} passed, ${bad} failed`); if (bad) process.exit(1);
