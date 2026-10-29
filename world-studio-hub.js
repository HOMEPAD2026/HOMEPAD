// world-studio-hub.js — the Creator Hub: /studio's own front page and menus (2026-10-28, the owner, with Roblox's Creator
// Hub on PC and phone as the reference: "우리 웹 스튜디오도 메인 페이지와 저런 메뉴, 기능들을 구현… 게임 연동… 디자인 그래픽
// 퀄리티 최대한"). studio-app.html → world-studio-web.js (app mode) → makeHub(). The hub is a page of its own over the
// Studio's canvas: a landing page (Home) with a top nav, and the working pages (Creations, Analytics, Learn, Store,
// Community, Updates, Rewards) with a side bar + a second column on a computer, a drawer (icon rail + sub column) on a
// phone. The Studio window itself (world-studio.js) is the workspace: Create / Edit / Play / a race open it (ws.*), and
// its × comes back here. Everything is read from the server's public reads (studio-arcade, -mine, -week, -day, -season,
// -races, -feed, -handle) — nothing here is a number we made up; what isn't live yet says so.
import { TEMPLATES, THEMES } from "./world-studio-gen.js";
import { makeHubX, XTITLE, XSUBS } from "./world-studio-hubx.js";
import { ask } from "./world-ask.js";
import { makeHubFx } from "./world-studio-hubfx.js";

const ICONS = { // (24px line icons, the Studio Pro set's weight)
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  book: '<path d="M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5z"/><path d="M12 6v13.5"/>',
  bag: '<path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  mega: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.8-2.7 2s1.1 1.7 2.8 2.1c1.7.4 2.8 1 2.8 2.2s-1.2 2-2.8 2c-1.2 0-2.3-.5-2.9-1.4M12 6.5v11"/>',
  chart: '<path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/>',
  dots: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  fold: '<path d="M4 7h10M4 12h7M4 17h10"/><path d="M20 9l-3 3 3 3"/>',
  pane: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M9.5 5v14"/><path d="M15.5 10l-2 2 2 2"/>',
  paneo: '<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="M9.5 5v14"/><path d="M13.5 10l2 2-2 2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  down: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 6l6 6-6 6"/>', arrowd: '<path d="M12 5v14M6 13l6 6 6-6"/>', arrowu: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M9.5 17h5"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>', star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.3 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
  remix: '<path d="M4 7h11l-3-3M20 17H9l3 3"/><path d="M15 7a4 4 0 0 1 4 4M9 17a4 4 0 0 1-4-4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a1 1 0 0 1 1 1v1.5M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.5" r="1.2" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  rocket: '<path d="M12 3c3.5 2.2 5 5.6 5 9.5l-2 3H9l-2-3C7 8.6 8.5 5.2 12 3z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 15.5L7 20l3-1.5M15 15.5l2 4.5-3-1.5"/>',
  city: '<path d="M3 21h18M5 21V9l5-3v15M10 21V4l6 3v14M16 21v-9l3 1.5V21"/>',
  board: '<path d="M4 5h11v8H8l-4 3z"/><path d="M15 9h5v8l-3-2.4H10V13"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>', moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>', user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
};
const ic = (n, c = "") => `<svg class="sgh-ic${c ? " " + c : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.dots}</svg>`;

// the pages: [id, icon, label, group]; each one's sub column [id, label]
const NAV = [["home", "home", "Home", 0], ["creations", "folder", "Creations", 0], ["learn", "book", "Learn", 0], ["store", "bag", "Store", 0], ["community", "chat", "Community", 0], ["forum", "board", "Forum", 0], ["updates", "mega", "Updates", 0], ["analytics", "chart", "Analytics", 1], ["rewards", "coin", "Rewards", 1]];
const SUBS = {
  creations: [["games", "My games"], ["shared", "Shared with me"], ["device", "On this device"]],
  learn: [["start", "Get started"], ["guides", "Guides"], ["templates", "Templates"], ["world", "In ARCIRCLE WORLD"]],
  store: [["all", "Home"], ["templates", "Templates"], ["themes", "Themes"], ["prefabs", "Prefabs"], ["pieces", "Pieces"], ["remix", "Remixable games"]],
  community: [["arcade", "Creator Arcade"], ["contest", "Weekly contest"], ["sponsor", "Sponsor contests"], ["daily", "Daily challenge"], ["season", "Creator season"], ["races", "Live races"], ["feed", "Following"]],
  analytics: [["overview", "Overview"], ["games", "By game"], ["revenue", "Revenue"], ["report", "Weekly report"], ["ab", "A/B test"]], ...XSUBS,
  rewards: [["overview", "Overview"], ["contest", "Contest prizes"]],
};
const TITLE = { home: "Home", creations: "Creations", learn: "Learn", store: "Store", community: "Community", updates: "Updates", analytics: "Analytics", rewards: "Rewards", ...XTITLE };
const ART = { learn: "learn", store: "store", community: "community", rewards: "rewards", analytics: "analytics", updates: "updates", create: "create" }; // (images/studio/hub/<k>-<w>.webp, Meshy's)
const TCAT = { runner: "Run", dash: "Run", rush: "Run", race: "Rhythm & race", arena: "Survive", survival: "Survive", defense: "Survive", jump: "Jump", climb: "Jump", dungeon: "Jump", escape: "Jump", boss: "Jump", mining: "Jump", puzzle: "Puzzle", rhythm: "Rhythm & race" };
const TDESC = {
  runner: "Three lanes, walls, gaps and lasers — reach the finish.", dash: "No finish line: it speeds up until you fall.", arena: "Dodge drones and laser sweeps from above.",
  puzzle: "Turn the rings until every link is free.", climb: "Bounce up ledges, springs and moving platforms.", defense: "Build towers on pads and hold the waves.",
  rush: "Grab as many coins as you can before time runs out.", jump: "A side-on platformer: blocks, keys, foes, a boss and events.", dungeon: "Keys, doors and switches in a maze of rooms.",
  escape: "A platformer against the clock.", boss: "One big fight with a dragon boss.", mining: "Dig through blocks for ores before time is up.",
  survival: "The Survivors engine: waves, a boss, your rules.", rhythm: "Four lanes of notes on the beat — Perfect or Good.", race: "Hover through rings in order, lap after lap.",
};
// the Studio's releases (newest first) — the same items /game's news carries
const UPDATES = [
  { d: "2026-10-28", tag: "New", img: "/images/gw/news/obby-world.webp", t: "Obby World — the 3D template", b: "Build in a 3D editor (move, turn, size), with smart pieces that just work — doors and buttons, elevators, teleporters, a shop, a boss — logic rules or a short script, one-tap pro looks, a UI kit and cinematics. Tell the Director a game in one sentence; play every course as your own hero." },
  { d: "2026-10-28", tag: "New", img: "/images/gw/news/creator-hub-2.webp", t: "Creator Hub 2", b: "Creator profiles, a forum, one place for your notifications, a full page for every game with an A/B difficulty test and patch notes, a weekly report card to share, Jump World pieces from other creators, sponsor contests, teams of up to 4 and a light mode." },
  { d: "2026-10-28", tag: "New", img: "/images/studio/hub/create-768.webp", t: "The Creator Hub", b: "ARCIRCLE Studio on the web has a front page and menus of its own: your creations, analytics, guides, a store of templates and themes, the community and rewards — on a computer and on a phone." },
  { d: "2026-10-28", tag: "Studio", img: "/images/gw/news/studio-next.webp", t: "Play on, tune with AI, clip it", b: "After a run the next game starts by itself, the test players' report says what ends most runs (with a fix button), auto-tune aims at the clear rate you want, and a 6-second clip of your game is one tap away." },
  { d: "2026-10-28", tag: "Studio", img: "/images/gw/news/studio-pro.webp", t: "Studio Pro", b: "A calmer, sharper Studio: graphite surfaces, thin lines, one accent colour and line icons, the buttons in the window's own bar, and a share sheet with X, Telegram, Discord and an embed code." },
  { d: "2026-10-27", tag: "Community", img: "/images/gw/news/studio-community.webp", t: "Live races, challenges and follows", b: "Race 2–4 players live on a published Sky Runner or Infinity Dash game, send a challenge that carries your run as a ghost, and follow creators to see their new games first." },
  { d: "2026-10-27", tag: "Web", img: "/images/gw/news/studio.webp", t: "ARCIRCLE Studio on its own page", b: "/studio opens the Studio in any browser without the town — the same games, the same arcade and the same sign-in as ARCIRCLE WORLD." },
  { d: "2026-10-27", tag: "Studio", img: "/images/gw/news/build-together.webp", t: "Build together", b: "Share a 6-letter code and build one game with a friend: whoever holds the pen saves, and the owner publishes." },
  { d: "2026-10-26", tag: "World", img: "/images/gw/key-cc-416.webp", t: "Creator City", b: "The Studio's building on the plaza is a portal to Creator City: the Hall of Fame, the Academy, game portals and the arcade, with a tutorial quest for your first game." },
];
// the guides (Learn): a few short steps each
const GUIDES = [
  { id: "first", art: "/images/studio/tpl/runner-768.webp", t: "Your first game in 5 minutes", m: "5 min", steps: ["Open Create and pick a template — Sky Runner is the easiest start.", "Tune it: speed, length, walls, gaps and coins. The 3D preview changes as you go.", "Press Test and play it yourself. A clear rate and stars show how hard it is.", "Give it a title and press Publish — it's in the Creator Arcade at once.", "Share its link: people play it in their browser or in ARCIRCLE WORLD."] },
  { id: "build", art: "/images/studio/tpl/jump-768.webp", t: "Build it yourself", m: "6 min", steps: ["In step 2 choose \"Build it yourself\" to place every piece by hand.", "Pick a piece from the toolbar and tap the level to place it; tap again to remove it.", "Select, copy and paste whole parts; undo and redo are always there.", "A red ✕ marks what the server would drop — fix it before you publish.", "Test from here plays from the spot you're looking at."] },
  { id: "events", art: "/images/studio/tpl/dungeon-768.webp", t: "Events in Jump World", m: "4 min", steps: ["Open the ⚡ Events panel in the Jump World builder.", "Pick a WHEN (a switch, a key, a timer, a counter) and a THEN (open a door, show or hide blocks, flip).", "Join two WHENs with AND for a puzzle.", "Every N seconds makes moving traps and blinking floors.", "Test it — events run exactly as players will see them."] },
  { id: "tune", art: "/images/studio/tpl/arena-768.webp", t: "Tune with AI", m: "3 min", steps: ["After a test the test players' report says what ends most runs.", "A fix button changes just that — or set the clear rate you want and press Auto-tune.", "Ask the design chat in your own words: \"make the end harder\", \"more coins\".", "Undo the last change any time."] },
  { id: "share", art: "/images/studio/tpl/rush-768.webp", t: "Publish, share and embed", m: "3 min", steps: ["Pick a creator ID: your games get their own page at arcircle.app/game/@ID.", "Share opens a sheet: copy the link, post to X or Telegram, or copy the embed code for your site.", "A 6-second clip of your game can be saved and posted.", "Each game's page shows its plays, likes, best runs and comments."] },
  { id: "race", art: "/images/studio/tpl/race-768.webp", t: "Live races and challenges", m: "3 min", steps: ["Open a published Sky Runner or Infinity Dash game and start a race: you get a 5-letter code.", "2–4 players join with the code; the host starts it and everyone runs at once.", "A challenge link carries your run as a ghost for 7 days.", "The race hour picks one game each hour for a quick race."] },
  { id: "together", art: "/images/studio/tpl/climb-768.webp", t: "Build together", m: "2 min", steps: ["In My games press 👥 on a game to get a 6-letter code for a day.", "Your friend joins with the code. Whoever holds the pen saves.", "The pen frees after 10 idle minutes or when it's passed. Only the owner publishes."] },
  { id: "contest", art: "/images/studio/tpl/boss-768.webp", t: "Contest, daily challenge and season", m: "2 min", steps: ["Each week has a contest template: publish a game made with it to enter.", "Others' plays and likes (×5) rank the games; the week's top places can win a USDC prize when one is set.", "The daily challenge gives a template and a theme each Seoul day.", "The creator season ranks creators by all their games each month."] },
];

export function makeHub(o) {
  const { T, esc, toast } = o, num = o.num || ((n) => String(n || 0)), ver = o.ver || "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = {}; let page = "home", sub = "", collapsed = false, drawer = false, cpage = null, peek = false; // (peek: the menu drawer over the workspace — /studio?tab=make's ≡, 2026-10-29)
  try { collapsed = localStorage.getItem("arc.hub.fold") === "1"; } catch { /* fine */ }
  const root = document.createElement("div"); root.className = "sgh"; root.id = "sgh"; document.body.appendChild(root); document.body.classList.remove("sgh-ws");
  const art = (tpl, w = 768) => `/images/studio/tpl/${TEMPLATES[tpl] ? tpl : "runner"}-${w}.webp${ver}`;
  const hubArt = (k, w = 1344) => `/images/studio/hub/${ART[k] || k}-${w}.webp${ver}`;
  const cover = (g) => (g.th ? `/api/social?world=studio-thumb&id=${encodeURIComponent(g.id)}&v=${g.th}` : art(g.tpl, 400));
  const tname = (tpl) => T((TEMPLATES[tpl] || TEMPLATES.runner).name);
  const thname = (th) => T((THEMES[th] || THEMES.neon).name);
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 3600 ? T("{n} min ago", { n: Math.max(1, Math.round(s / 60)) }) : s < 86400 ? T("{n} h ago", { n: Math.round(s / 3600) }) : T("{n} d ago", { n: Math.round(s / 86400) }); };
  const left = (t) => { const s = Math.max(0, t - Date.now()), d = Math.floor(s / 86400e3), h = Math.floor((s % 86400e3) / 3600e3); return d ? T("{d}d {h}h left", { d, h }) : T("{h}h left", { h }); };
  const wallet = () => { const s = o.sess(); return s ? s.wallet : ""; };
  const P = () => { try { return JSON.parse(localStorage.getItem("arc.world") || "{}") || {}; } catch { return {}; } };
  const locals = () => { try { const a = JSON.parse(localStorage.getItem("arc.studio.local") || "[]"); return Array.isArray(a) ? a.filter((d) => d && d.id && d.spec) : []; } catch { return []; } };
  const LV = (p, l, g) => { const xp = Math.max(0, p) + Math.max(0, l) * 5 + Math.max(0, g) * 20, lv = Math.min(99, 1 + Math.floor(Math.sqrt(xp / 10))), at = (n) => (n - 1) * (n - 1) * 10; return { lv, xp, from: at(lv), next: lv >= 99 ? xp : at(lv + 1) }; }; // (= api/_world-studio.mjs creatorLevel)

  // ---------------- data (the server's public reads, kept for a minute) ----------------
  const got = {};
  async function get(k, url, ttl = 60e3) {
    if (got[k] && Date.now() - got[k].at < ttl) return got[k].p;
    const p = fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null); got[k] = { at: Date.now(), p }; const v = await p; if (!v) delete got[k]; return v;
  }
  const arcade = async () => ((await get("arcade", "/api/social?world=studio-arcade")) || {}).games || [];
  const mine = async () => { const w = wallet(); if (!w) return null; return (await get("mine:" + w, "/api/social?world=studio-mine&wallet=" + w, 20e3)) || { games: [], shared: [], fans: 0 }; };
  const handle = async () => { const w = wallet(); if (!w) return ""; return ((await get("h:" + w, "/api/social?world=studio-handle&wallet=" + w, 300e3)) || {}).h || ""; };
  const week = () => get("week", "/api/social?world=studio-week"), day = () => get("day", "/api/social?world=studio-day"), season = () => get("season", "/api/social?world=studio-season"), races = () => get("races", "/api/social?world=studio-races", 15e3);
  const feed = async () => { const w = wallet(); return w ? get("feed:" + w, "/api/social?world=studio-feed&wallet=" + w) : null; };
  const fresh = () => { for (const k of Object.keys(got)) if (/^(mine|feed|arcade|inbox|gm:)/.test(k)) delete got[k]; }; // (back from the workspace: what you made shows)

  // ---------------- the shell ----------------
  const route = () => { const q = new URLSearchParams(location.search); const p = q.get("p"); page = TITLE[p] ? p : "home"; sub = q.get("s") || ""; D.q = { h: q.get("h") || "", id: q.get("id") || "", t: q.get("t") || "" }; if (SUBS[page] && !SUBS[page].some(([k]) => k === sub)) sub = SUBS[page][0][0]; };
  function go(p, s, push = true, x = {}) {
    page = TITLE[p] ? p : "home"; sub = s || (SUBS[page] ? SUBS[page][0][0] : ""); drawer = false; closePops(); D.q = { h: x.h || "", id: x.id || "", t: x.t || "" }; if (page === "game" && x.id !== (D.lastG || "")) { D.gtab = "about"; D.lastG = x.id; }
    { const u = new URL(location.href); for (const k of ["p", "s", "tab", "sg", "race", "ch", "vs", "by", "h", "id", "t"]) u.searchParams.delete(k); if (page !== "home") u.searchParams.set("p", page); if (sub && SUBS[page] && sub !== SUBS[page][0][0]) u.searchParams.set("s", sub); for (const k of ["h", "id", "t"]) if (D.q[k]) u.searchParams.set(k, D.q[k]); history[push ? "pushState" : "replaceState"]({ hub: 1 }, "", u.pathname + u.search); }
    paint(); const sc = root.querySelector(".sgh-scroll"); if (sc) sc.scrollTop = 0;
  }
  const me = () => { const s = o.sess(), p = P(); return s ? { w: s.wallet, name: p.name || "", short: s.wallet.slice(0, 6) + "…" + s.wallet.slice(-4) } : null; };
  const avatar = (cls = "") => { const m = me(), h = m ? parseInt(m.w.slice(2, 8), 16) % 360 : 190; return `<i class="sgh-av ${cls}${m ? " on" : ""}" style="--h:${h}"><img src="/images/studio/hub/avatar-160.webp${ver}" alt="" width="40" height="40" loading="lazy"></i>`; };
  function userRow() { const m = me();
    return `<button type="button" class="sgh-user" data-user>${avatar()}<span><b>${esc(m ? (D.h ? "@" + D.h : m.name || m.short) : T("Connect wallet"))}</b><small>${esc(m ? (D.h ? m.short : T("Signed in")) : T("Guest"))}</small></span>${ic("down", "sm")}</button>`; }
  /// the side menu — the same one in the page and in the drawer (2026-10-29, the owner: one menu everywhere; the drawer's icon rail is gone)
  function side(pg = page, dw = false) {
    return `<aside class="sgh-side${dw ? " sgh-dside" : ""}"><a class="sgh-brand" href="/studio" data-go="home"><i class="sgh-mark"><img src="/images/brand/mark-sm-v2.webp" alt="" width="26" height="18"></i><span><b>ARCIRCLE</b><em>${esc(T("Creator Hub"))}</em></span></a>${dw ? `<button type="button" class="sgh-ib sgh-dwx" data-dwclose aria-label="${esc(T("Close"))}">${ic("close")}</button>` : ""}
      ${userRow()}
      <nav class="sgh-nav">${NAV.map(([id, i, l, g], k) => `${k && NAV[k - 1][3] !== g ? "<hr>" : ""}<a href="?p=${id}" data-go="${id}"${dw ? ` data-peek="${id}"` : ""} class="${pg === id ? "on" : ""}" title="${esc(T(l))}">${ic(i)}<span>${esc(T(l))}</span></a>`).join("")}
      <hr><a href="#" data-tools title="${esc(T("All tools"))}">${ic("dots")}<span>${esc(T("All tools"))}</span></a><a href="/play" data-world title="ARCIRCLE WORLD">${ic("globe")}<span>ARCIRCLE WORLD</span></a></nav>
      <a class="sgh-mk" href="#" data-make>${ic("plus")}<span>${esc(T("Create a game"))}</span></a></aside>`;
  }
  function subCol() { const L = SUBS[page]; if (!L) return "";
    return `<aside class="sgh-sub"><h3>${esc(T(TITLE[page]))}</h3>${L.map(([k, l]) => `<a href="?p=${page}&s=${k}" data-go="${page}" data-s="${k}" class="${sub === k ? "on" : ""}">${esc(T(l))}</a>`).join("")}</aside>`; }
  /// the language picker in the top bar (2026-10-29, the owner: not only in the footer)
  const LANGS = [["en", "EN", "English"], ["ko", "KO", "한국어"], ["zh", "ZH", "中文"], ["tr", "TR", "Türkçe"]];
  const langPick = () => { const cur = LANGS.find((x) => x[0] === o.lang) || LANGS[0];
    return `<div class="sgh-tlang"><button type="button" data-langbtn aria-haspopup="listbox" aria-label="Language">${ic("globe")}<b>${cur[1]}</b>${ic("down", "sm")}</button><div class="sgh-lmenu" role="listbox" hidden>${LANGS.map(([v, k, n]) => `<button type="button" role="option" data-setlang="${v}" class="${v === cur[0] ? "on" : ""}"><b>${n}</b><small>${k}</small>${v === cur[0] ? ic("check", "sm") : ""}</button>`).join("")}</div></div>`; }; // (our own menu: a native list can't wear the Hub's look)
  function topBar() {
    const n = bellN();
    return `<header class="sgh-top"><button type="button" class="sgh-ib sgh-hb" data-burger aria-label="${esc(T("Menu"))}">${ic(collapsed || !matchMedia("(min-width: 1024px)").matches ? "menu" : "fold")}</button><h1>${esc(T(TITLE[page]))}</h1><span class="sgh-sp"></span>
      <button type="button" class="sgh-ib" data-search aria-label="${esc(T("Search"))}">${ic("search")}</button>
      ${langPick()}${FX.themeBtn()}<button type="button" class="sgh-ib" data-bell aria-label="${esc(T("Notifications"))}">${ic("bell")}${n ? `<em class="sgh-dot">${n > 9 ? "9+" : n}</em>` : ""}</button>
      <a class="sgh-world" href="/play">${ic("globe")}<span>${esc(T("Play ARCIRCLE WORLD"))}</span></a>
      <button type="button" class="sgh-me" data-user aria-label="${esc(T("Account"))}">${avatar("lg")}</button></header>`;
  }
  function landTop() {
    return `<header class="sgh-ltop"><button type="button" class="sgh-ib sgh-lb2" data-burger aria-label="${esc(T("Menu"))}">${ic("menu")}</button><a class="sgh-brand" href="/studio" data-go="home"><i class="sgh-mark"><img src="/images/brand/mark-sm-v2.webp" alt="" width="26" height="18"></i><span><b>ARCIRCLE</b><em>${esc(T("Creator Hub"))}</em></span></a>
      <nav class="sgh-lnav"><a href="?p=creations" data-go="creations">${esc(T("Dashboard"))}</a><a href="?p=learn" data-go="learn">${esc(T("Learn"))}</a><a href="?p=community" data-go="community">${esc(T("Explore"))}</a><a href="?p=store" data-go="store">${esc(T("Store"))}</a><a href="?p=updates" data-go="updates">${esc(T("Updates"))}</a></nav>
      <span class="sgh-sp"></span><nav class="sgh-lsc"><a href="/game">${ic("play")}<span>${esc(T("Game World"))}</span></a><a href="/">${ic("globe")}<span>${esc(T("ARCIRCLE Platform"))}</span></a></nav>${langPick()}<button type="button" class="sgh-ib" data-search aria-label="${esc(T("Search"))}">${ic("search")}</button>${FX.themeBtn()}<button type="button" class="sgh-ib" data-bell aria-label="${esc(T("Notifications"))}">${ic("bell")}${bellN() ? `<em class="sgh-dot">${bellN()}</em>` : ""}</button>
      <button type="button" class="sgh-me" data-user aria-label="${esc(T("Account"))}">${avatar("lg")}</button><button type="button" class="sgh-ib sgh-lburger" data-burger aria-label="${esc(T("Menu"))}">${ic("menu")}</button></header>`;
  }
  function drawerHtml() { if (!drawer) return ""; const pg = cpage || page, L = SUBS[pg];
    return `<div class="sgh-dw" data-dwx><div class="sgh-dwin full${L ? "" : " solo"}" role="dialog" aria-label="${esc(T("Menu"))}">${side(pg, true)}${L ? `<aside class="sgh-sub sgh-dsub"><h3>${esc(T(TITLE[pg]))}</h3>${L.map(([k, l]) => `<a href="?p=${pg}${k ? "&s=" + k : ""}" data-go="${pg}" data-s="${k}" class="${pg === page && sub === k ? "on" : ""}">${esc(T(l))}</a>`).join("")}</aside>` : ""}</div></div>`; } // (a page with sub-pages shows them beside the menu, as on a computer; Home shows the menu alone)

  function unpeek() { peek = false; drawer = false; cpage = null; root.hidden = true; root.classList.remove("peek"); }
  function paint() {
    const land = page === "home";
    root.className = `sgh${land ? " land" : ""}${collapsed && !land && !drawer ? " fold" : ""}${SUBS[page] ? " has-sub" : ""}${peek ? " peek" : ""}`;
    root.innerHTML = land
      ? `${landTop()}<div class="sgh-scroll"><main class="sgh-page pg-home">${pageHtml()}</main>${foot()}</div>${drawerHtml()}`
      : `${side()}<button type="button" class="sgh-edge" data-burger aria-label="${esc(T(collapsed ? "Show the menu" : "Hide the menu"))}" title="${esc(T(collapsed ? "Show the menu" : "Hide the menu"))}">${ic(collapsed ? "paneo" : "pane")}</button>${subCol()}<div class="sgh-main">${topBar()}<div class="sgh-scroll"><main class="sgh-page pg-${page}">${pageHtml()}</main>${foot()}</div></div>${drawerHtml()}`;
    document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = T(e.dataset.t); });
    document.title = (page === "home" ? "ARCIRCLE Creator Hub — " + T("make a game in your browser") : T(TITLE[page]) + " · ARCIRCLE Creator Hub");
    after();
  }
  const foot = () => `<footer class="sgh-foot"><div><b>ARCIRCLE</b> ${esc(T("Creator Hub"))}<small>${esc(T("Games are made from templates — no code. Plays, likes and best runs are counted; no ARCL is paid for games yet."))}</small></div>
    <nav><a href="/game">${esc(T("Game World"))}</a><a href="/play">ARCIRCLE WORLD</a><a href="/coins">${esc(T("Coins"))}</a><a href="/game/@arcircle">@arcircle</a>
    <select class="sgh-lang" aria-label="Language">${[["en", "EN"], ["ko", "한국어"], ["zh", "中文"], ["tr", "TR"]].map(([v, l]) => `<option value="${v}"${o.lang === v ? " selected" : ""}>${l}</option>`).join("")}</select></nav></footer>`;

  // ---------------- the pages ----------------
  const skel = (n, cls = "") => `<div class="sgh-grid ${cls}">${Array.from({ length: n }, () => `<div class="sgh-sk"><i></i><b></b><small></small></div>`).join("")}</div>`;
  const head = (k, h, p, cta = "") => `<section class="sgh-ban" style="--art:url('${hubArt(k)}')"><div><h2>${esc(T(h))}</h2><p>${esc(T(p))}</p>${cta}</div></section>`;
  const sec = (title, inner, more = "") => `<section class="sgh-sec rv"><div class="sgh-sech"><h2>${esc(T(title))}</h2>${more}</div>${inner}</section>`;
  const moreLink = (p, s, l = "See all") => `<a href="?p=${p}${s ? "&s=" + s : ""}" data-go="${p}" data-s="${s || ""}" class="sgh-more">${esc(T(l))}${ic("right", "sm")}</a>`;
  function gameCard(g, opt = {}) {
    D.cards = D.cards || {}; if (g.id && !D.cards[g.id]) D.cards[g.id] = g; const st = g.pub === false ? "draft" : g.hidden ? "hidden" : "pub";
    return `<article class="sgh-gc${opt.row ? " row" : ""}" data-gsheet="${esc(g.id)}" tabindex="0"><span class="sgh-gart"><img src="${esc(cover(g))}" alt="" loading="lazy" width="400" height="229" onerror="this.src='${art(g.tpl, 400)}'">${g.now ? `<em class="sgh-now"><b class="sgx-pulse"></b>${g.now} ${esc(T("playing"))}</em>` : ""}${FX.badges(g, opt)}${g.off ? `<em class="sgh-off">${esc(T("Official"))}</em>` : g.pick ? `<em class="sgh-pick">${ic("star", "sm")} ${esc(T("Editor's pick"))}</em>` : ""}${opt.own ? `<em class="sgh-st ${st}">${esc(T(st === "pub" ? "Published" : st === "draft" ? "Draft" : "Hidden"))}</em>` : ""}<i class="sgh-gplay">${ic("play")}</i></span>
      <b>${esc(g.title || T("Untitled"))}</b><small>${esc(tname(g.tpl))}${g.byName && !opt.own ? " · " + esc(g.byName) : ""}</small>${FX.difRow(g)}<span class="sgh-gm"><i>${ic("play", "xs")} ${num(g.plays)}</i><i>${ic("heart", "xs")} ${num(g.likes)}</i>${opt.own && g.at ? `<i>${esc(ago(g.at))}</i>` : ""}</span></article>`;
  }
  function tplCard(id, opt = {}) { const t = TEMPLATES[id];
    return `<article class="sgh-tc${t.open ? "" : " soon"}" ${t.open ? `data-use="${id}"` : ""} tabindex="0"><span class="sgh-gart"><img src="${art(id, 400)}" alt="" loading="lazy" width="400" height="229">${opt.free ? `<em class="sgh-free">${esc(T("Free"))}</em>` : ""}</span><b>${esc(T(t.name))}</b><small>${esc(T(TCAT[id] || "Run"))}</small>${opt.desc ? `<p>${esc(T(TDESC[id] || ""))}</p>` : ""}${t.open ? "" : `<em class="sgh-soon">${esc(T("Coming soon"))}</em>`}</article>`; }

  function pageHtml() {
    if (X.has(page, sub)) return X.html(page, sub);
    if (page === "home") return homeHtml();
    if (page === "creations") return `<div data-fill="creations">${skel(6)}</div>`;
    if (page === "analytics") return `${head("analytics", "Analytics", "How your games do: plays, likes, clear rates and where runs end.")}<div data-fill="analytics">${skel(4, "kpi")}</div>`;
    if (page === "learn") return learnHtml();
    if (page === "store") return storeHtml();
    if (page === "community") return `${head("community", "The creator community", "Play what others made, race them live, enter the weekly contest and follow the creators you like.", `<button type="button" class="sgh-btn pri" data-ws="arcade">${ic("play")} ${esc(T("Open the Creator Arcade"))}</button>`)}<div data-fill="community">${skel(4)}</div>`;
    if (page === "updates") return `${head("updates", "What's new in ARCIRCLE Studio", "Every release, newest first.")}<div class="sgh-upd">${UPDATES.map((u, i) => `<article class="sgh-ucard rv" style="--d:${i * 60}ms"><img src="${u.img}${ver}" alt="" loading="lazy" width="320" height="180"><div><span class="sgh-utag">${esc(T(u.tag))}</span><time>${esc(u.d)}</time><h3>${esc(T(u.t))}</h3><p>${esc(T(u.b))}</p></div></article>`).join("")}</div>`;
    if (page === "rewards") return `${head("rewards", "Creator rewards", "What a game of yours can win today, and what's still to come.")}<div data-fill="rewards">${skel(3, "kpi")}</div>`;
    return "";
  }

  function homeHtml() {
    const tiles = Object.keys(TEMPLATES), rows = [0, 1, 2, 3].map((r) => [...tiles.slice(r * 4), ...tiles.slice(0, r * 4)].concat(tiles).slice(0, 10));
    return `<section class="sgh-hero">
      <div class="sgh-mosaic" aria-hidden="true">${rows.map((row, r) => `<div class="sgh-mrow${r % 2 ? " rev" : ""}" style="--sp:${70 + r * 12}s">${[...row, ...row].map((id) => `<span style="background-image:url(${art(id, 400)})"></span>`).join("")}</div>`).join("")}</div>
      <div class="sgh-hin">
        <a class="sgh-new" href="?p=updates" data-go="updates"><em>${esc(T("New"))}</em><span><b>${esc(T("The Creator Hub is here"))}</b><small>${esc(T("Your games, analytics, guides, a store of templates and the community — on any screen."))}</small></span><i class="sgh-btn sm">${esc(T("Learn more"))}</i></a>
        <h1 class="sgh-h1">${T("Make anything you imagine —|right now!").split("|").map((w, i) => `<span style="--d:${120 + i * 140}ms">${esc(w)}</span>`).join(" ")}</h1>
        <p class="sgh-lead">${esc(T("Everything you need to make a game is ready: 15 templates, a builder for each, AI help and players in ARCIRCLE WORLD."))}<br>${esc(T("Join a busy community of creators!"))}</p>
        <div class="sgh-cta"><button type="button" class="sgh-btn big pri" data-make>${esc(T("Start creating"))}</button><button type="button" class="sgh-btn big" data-go="community">${ic("play")} ${esc(T("Explore games"))}</button></div>
        <div class="sgh-live" data-fill="live"><span><b>—</b><small>${esc(T("Games"))}</small></span><span><b>—</b><small>${esc(T("Plays"))}</small></span><span><b>—</b><small>${esc(T("Creators"))}</small></span><span><b>—</b><small>${esc(T("Playing now"))}</small></span></div>
      </div></section>
      ${sec("Start from a template", `<div class="sgh-hs">${tiles.filter((id) => TEMPLATES[id].open).map((id) => tplCard(id)).join("")}</div>`, moreLink("store", "templates"))}
      ${sec("Trending in the Creator Arcade", `<div data-fill="trend">${skel(5, "hs")}</div>`, moreLink("community", "arcade"))}
      <section class="sgh-sec rv"><div class="sgh-sech"><h2>${esc(T("How it works"))}</h2></div><ol class="sgh-steps">${[["grid", "Pick a template", "Runner, platformer, tower defense, rhythm, racing — 15 to start from."], ["edit", "Tune it or build it", "Sliders for the quick way, a builder for every piece when you take care."], ["rocket", "Test and publish", "Play it yourself, let AI test players report, then publish to the arcade and the web."]].map(([i, t, p], k) => `<li style="--d:${k * 90}ms"><i>${ic(i)}</i><em>${k + 1}</em><b>${esc(T(t))}</b><p>${esc(T(p))}</p></li>`).join("")}</ol></section>
      <section class="sgh-sec rv sgh-wl"><div class="sgh-wlart" style="--art:url('/images/gw/key-cc.webp${ver}')"></div><div class="sgh-wltx"><span class="sgh-kick">${ic("city", "sm")} ${esc(T("Linked with the game"))}</span><h2>${esc(T("Your game lives in ARCIRCLE WORLD"))}</h2>
        <ul>${["Published games are in the Creator Arcade in town and in Creator City's game portals.", "The arcade cabinets on the plaza show the most played, the newest and the editor's pick.", "Players race your game live, send challenges and follow you.", "Your own web page: arcircle.app/game/@you — playable in any browser."].map((x) => `<li>${ic("check", "sm")}${esc(T(x))}</li>`).join("")}</ul>
        <div class="sgh-cta"><a class="sgh-btn pri" href="/play">${ic("globe")} ${esc(T("Play ARCIRCLE WORLD"))}</a><a class="sgh-btn" href="/game/@arcircle">${ic("ext")} ${esc(T("Official games' page"))}</a></div></div></section>
      <div data-fill="homecards" class="sgh-two">${skel(2)}</div>`;
  }

  function learnHtml() {
    const S = sub || "start";
    const guides = `<div class="sgh-grid g3">${GUIDES.map((g, i) => `<article class="sgh-lc rv" data-guide="${g.id}" tabindex="0" style="--d:${(i % 3) * 60}ms"><span class="sgh-gart"><img src="${g.art}${ver}" alt="" loading="lazy" width="400" height="229"><em class="sgh-dur">${ic("clock", "xs")} ${esc(g.m)}</em></span><b>${esc(T(g.t))}</b><small>${esc(T("{n} steps", { n: g.steps.length }))}</small></article>`).join("")}</div>`;
    const tpls = `<div class="sgh-grid g3">${Object.keys(TEMPLATES).map((id) => tplCard(id, { desc: 1 })).join("")}</div>`;
    const world = `<div class="sgh-two"><article class="sgh-card rv"><img class="sgh-cimg" src="/images/cc/b-academy.webp${ver}" alt="" width="120" height="120"><h3>${esc(T("The Academy in Creator City"))}</h3><p>${esc(T("In ARCIRCLE WORLD, step through the Studio's portal on the plaza: the Academy walks you through your first game in 7 steps, with XP and the Rookie Creator title."))}</p><a class="sgh-btn pri" href="/play">${ic("globe")} ${esc(T("Go to Creator City"))}</a></article>
      <article class="sgh-card rv"><img class="sgh-cimg" src="/images/cc/b-arcade.webp${ver}" alt="" width="120" height="120"><h3>${esc(T("The full guide"))}</h3><p>${esc(T("Every part of the Studio, step by step, with pictures — on the Game World site."))}</p><a class="sgh-btn" href="/game#adguide">${ic("book")} ${esc(T("Open the guide"))}</a></article></div>`;
    return `${head("learn", "Make games in ARCIRCLE Studio", "Guides and tips for every template — from your first game to live races.", `<button type="button" class="sgh-btn pri" data-search>${ic("search")} ${esc(T("Search the guides"))} <kbd>Ctrl + K</kbd></button>`)}
      ${S === "start" ? sec("Latest", `<div class="sgh-hs">${UPDATES.slice(0, 4).map((u) => `<article class="sgh-lc" data-go="updates" tabindex="0"><span class="sgh-gart"><img src="${u.img}${ver}" alt="" loading="lazy" width="400" height="229"></span><b>${esc(T(u.t))}</b><small>${esc(u.d)}</small></article>`).join("")}</div>`, moreLink("updates", "", "All updates")) + sec("Guides", guides) + sec("In ARCIRCLE WORLD", world)
      : S === "guides" ? sec("Guides", guides) : S === "templates" ? sec("Templates", tpls) : sec("In ARCIRCLE WORLD", world)}`;
  }

  function storeHtml() {
    const S = sub || "all", q = (D.sq || "").toLowerCase();
    const tp = Object.keys(TEMPLATES).filter((id) => !q || T(TEMPLATES[id].name).toLowerCase().includes(q));
    const th = Object.keys(THEMES).filter((id) => !q || T(THEMES[id].name).toLowerCase().includes(q));
    const themes = `<div class="sgh-grid g5">${th.map((id) => { const t = THEMES[id], c = (n) => "#" + Number(n).toString(16).padStart(6, "0"); return `<article class="sgh-thc" data-theme="${id}" tabindex="0" style="--a:${c(t.sky)};--b:${c(t.edge)};--c:${c(t.wall)}"><span class="sgh-thart"><img src="/images/studio/th/${id}-sky-768.webp${ver}" alt="" loading="lazy" width="400" height="229" onerror="this.remove()"><i></i><em class="sgh-free">${esc(T("Free"))}</em></span><b>${esc(T(t.name))}</b><small>${esc(T("Theme"))}</small></article>`; }).join("")}</div>`;
    const tpls = `<div class="sgh-grid g5">${tp.map((id) => tplCard(id, { free: 1 })).join("")}</div>`;
    return `<div class="sgh-stbar"><label class="sgh-sbox">${ic("search")}<input type="search" data-sq placeholder="${esc(T("Search templates, themes and games"))}" value="${esc(D.sq || "")}"></label></div>
      ${S === "all" ? sec("Trending templates", `<div class="sgh-hs">${tp.map((id) => tplCard(id, { free: 1 })).join("")}</div>`, moreLink("store", "templates")) + sec("Themes", themes, moreLink("store", "themes")) + sec("Remixable games", `<div data-fill="remix">${skel(5, "hs")}</div>`, moreLink("store", "remix"))
      : S === "templates" ? sec("Templates", tpls) : S === "themes" ? sec("Themes", themes) : sec("Remixable games", `<div data-fill="remix">${skel(8)}</div>`)}
      <p class="sgh-fine">${ic("check", "xs")} ${esc(T("Everything in the store is free to use. Remix copies a published game into your drafts — the original stays its maker's."))}</p>`;
  }

  // ---------------- the pages that read the server ----------------
  async function fill() {
    const f = (k) => root.querySelector(`[data-fill="${k}"]`), pg = page, s0 = sub, stale = () => pg !== page || s0 !== sub || !root.isConnected;
    if (pg === "home") {
      const A = await arcade(); if (stale()) return;
      const creators = new Set(A.filter((g) => !g.off).map((g) => g.byName || g.id)).size, plays = A.reduce((a, g) => a + (g.plays || 0), 0), nowN = A.reduce((a, g) => a + (g.now || 0), 0);
      const lv = f("live"); if (lv) { lv.innerHTML = [[A.length, "Games"], [plays, "Plays"], [creators, "Creators"], [nowN, "Playing now"]].map(([n, l]) => `<span><b data-count="${n}">0</b><small>${esc(T(l))}</small></span>`).join(""); countUp(lv); }
      const tr = f("trend"); if (tr) tr.innerHTML = `<div class="sgh-hs">${[...A].sort((a, b) => (b.now || 0) * 50 + (b.plays || 0) - ((a.now || 0) * 50 + (a.plays || 0))).slice(0, 12).map((g) => gameCard(g)).join("")}</div>`;
      const [w, d] = await Promise.all([week(), day()]); if (stale()) return; const hc = f("homecards"); if (hc) hc.innerHTML = contestCard(w) + dailyCard(d);
    }
    if (X.has(pg, s0)) { await X.fill(pg, s0, root, stale); if (stale()) return; reveal(); return; }
    if (pg === "creations") { const el = f("creations"); if (el) el.innerHTML = await creationsHtml(); }
    if (pg === "analytics") { const el = f("analytics"); if (el) { el.innerHTML = await analyticsHtml(); } }
    if (pg === "rewards") { const el = f("rewards"); if (el) el.innerHTML = await rewardsHtml(); }
    if (pg === "store") { const el = f("remix"); if (el) { const A = await arcade(); if (stale()) return; const q = (D.sq || "").toLowerCase(), L = A.filter((g) => !q || String(g.title).toLowerCase().includes(q)).sort((a, b) => (b.off ? 1 : 0) - (a.off ? 1 : 0) || (b.remixes || 0) - (a.remixes || 0) || (b.plays || 0) - (a.plays || 0)).slice(0, s0 === "remix" ? 40 : 12);
      el.innerHTML = L.length ? `<div class="${s0 === "remix" ? "sgh-grid" : "sgh-hs"}">${L.map((g) => gameCard(g)).join("")}</div>` : empty("search", "Nothing found", "Try another word."); } }
    if (pg === "community") { const el = f("community"); if (el) el.innerHTML = await communityHtml(s0); }
    if (stale()) return; reveal(); D.lastFill = Date.now();
  }
  const empty = (i, t, p, cta = "") => `<div class="sgh-empty"><span class="sgh-etile"><img src="/images/studio/hub/empty-240.webp${ver}" alt="" width="120" height="120" onerror="this.remove()">${ic(i)}</span><h3>${esc(T(t))}</h3><p>${esc(T(p))}</p>${cta}</div>`;
  const signCard = (t, p) => `<section class="sgh-promo"><div><h3>${esc(T(t))}</h3><p>${esc(T(p))}</p><button type="button" class="sgh-btn blue" data-signin>${ic("wallet")} ${esc(T("Connect wallet"))}</button></div></section>`;

  async function creationsHtml() {
    const S = sub || "games", m = await mine(); D.h = await handle();
    const L0 = S === "device" ? locals().map((d) => ({ id: d.id, title: d.spec.title, tpl: d.spec.tpl, at: d.at || 0, pub: false, local: 1 })) : !m ? [] : S === "shared" ? m.shared || [] : m.games || [];
    const f = D.cf || { pub: true, draft: true }, sort = D.cs || "at", dir = D.cd || -1;
    const L = L0.filter((g) => (g.pub ? f.pub : f.draft)).sort((a, b) => (sort === "title" ? String(a.title).localeCompare(String(b.title)) * -dir : ((b[sort] || 0) - (a[sort] || 0)) * -dir * -1));
    const chips = `<div class="sgh-chips">${SUBS.creations.map(([k, l]) => `<button type="button" data-go="creations" data-s="${k}" class="${S === k ? "on" : ""}">${esc(T(l))}${k === "device" && locals().length ? ` <em>${locals().length}</em>` : ""}</button>`).join("")}</div>`;
    const bar = `<div class="sgh-fbar">${chips}<span class="sgh-sp"></span><button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Create"))}</button></div><div class="sgh-fbar f2"><span class="sgh-tg"><small>${esc(T("Show:"))}</small><label><input type="checkbox" data-cf="pub"${f.pub ? " checked" : ""}><i></i>${esc(T("Published"))}</label><label><input type="checkbox" data-cf="draft"${f.draft ? " checked" : ""}><i></i>${esc(T("Drafts"))}</label></span>
      <span class="sgh-sp"></span><label class="sgh-sel"><small>${esc(T("Sort by"))}</small><select data-csort>${[["at", "Last updated"], ["plays", "Most played"], ["likes", "Most liked"], ["title", "Name"]].map(([v, l]) => `<option value="${v}"${sort === v ? " selected" : ""}>${esc(T(l))}</option>`).join("")}</select></label><button type="button" class="sgh-ib" data-cdir aria-label="${esc(T("Order"))}">${ic(dir < 0 ? "arrowd" : "arrowu")}</button></div>`;
    let promo = "";
    if (!wallet() && S !== "device") promo = signCard("Sign in to see your games", "Your games are kept with your wallet — the same sign-in as ARCIRCLE WORLD. Drafts made without it stay on this device.");
    else if (wallet() && !D.h && S === "games") promo = `<section class="sgh-promo"><div><h3>${esc(T("Reach more players"))}</h3><p>${esc(T("Pick a creator ID: your games get their own page at arcircle.app/game/@ID, playable in any browser."))}</p><button type="button" class="sgh-btn blue" data-ws="mine">${esc(T("Start"))}</button></div></section>`;
    else if (D.h && S === "games") promo = `<section class="sgh-promo ok"><div><h3>@${esc(D.h)}</h3><p>${esc(T("Your games on the web"))}: <b>arcircle.app/game/@${esc(D.h)}</b></p><a class="sgh-btn blue" href="/game/@${esc(D.h)}" target="_blank" rel="noopener">${ic("ext")} ${esc(T("Open your page"))}</a></div></section>`;
    const kpi = m && S === "games" ? (() => { const pub = (m.games || []).filter((g) => g.pub), p = pub.reduce((a, g) => a + (g.plays || 0), 0), l = pub.reduce((a, g) => a + (g.likes || 0), 0), lv = LV(p, l, pub.length);
      return `<div class="sgh-kpis sm">${kpiT("star", "Lv " + lv.lv, "Creator level", Math.round(((lv.xp - lv.from) / Math.max(1, lv.next - lv.from)) * 100))}${kpiT("play", num(p), "Plays by others")}${kpiT("heart", num(l), "Likes")}${kpiT("users", num(m.fans || 0), "Followers")}${kpiT("rocket", pub.length, "Published")}</div>`; })() : "";
    const grid = L.length ? `<div class="sgh-grid g4">${L.map((g) => g.local ? localCard(g) : gameCard(g, { own: 1 })).join("")}</div>`
      : empty("plus", S === "shared" ? "Nothing shared with you yet" : S === "device" ? "No drafts on this device" : "Create a game", S === "shared" ? "When a friend gives you a build-together code, the game shows here." : "Pick a template, tune it, test it and publish — no code. It takes about five minutes.", `<button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Create a game"))}</button>`);
    return `${bar}${promo}${kpi}${grid}`;
  }
  const localCard = (g) => `<article class="sgh-gc" data-ledit="${esc(g.id)}" tabindex="0"><span class="sgh-gart"><img src="${art(g.tpl, 400)}" alt="" loading="lazy" width="400" height="229"><em class="sgh-st draft">${esc(T("On this device"))}</em><i class="sgh-gplay">${ic("edit")}</i></span><b>${esc(g.title || T("Untitled"))}</b><small>${esc(tname(g.tpl))}</small><span class="sgh-gm"><i>${g.at ? esc(ago(g.at)) : ""}</i></span></article>`;
  const kpiT = (i, v, l, bar) => `<div class="sgh-kpi"><i>${ic(i)}</i><b>${esc(String(v))}</b><small>${esc(T(l))}</small>${bar != null ? `<span class="sgh-bar"><em style="width:${bar}%"></em></span>` : ""}</div>`;

  async function analyticsHtml() {
    if (!wallet()) return signCard("Sign in to see your analytics", "Plays, likes, clear rates and where runs end — for every game you've published.");
    const m = await mine(), G = (m.games || []).filter((g) => g.pub); if (!G.length) return empty("chart", "No published games yet", "Publish a game and its numbers show here: plays by others, likes, clear rate and where runs end.", `<button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Create a game"))}</button>`);
    const days = [...Array(14)].map((_, i) => new Date(Date.now() + 9 * 3600e3 - (13 - i) * 86400e3).toISOString().slice(0, 10)), per = days.map((d) => G.reduce((a, g) => a + ((g.dl || {})[d] || 0), 0));
    const P = G.reduce((a, g) => a + (g.plays || 0), 0), L = G.reduce((a, g) => a + (g.likes || 0), 0), R = G.reduce((a, g) => a + ((g.stats || {}).runs || 0), 0), C = G.reduce((a, g) => a + ((g.stats || {}).clears || 0), 0), RX = G.reduce((a, g) => a + Object.values(g.rx || {}).reduce((x, y) => x + y, 0), 0);
    const lv = LV(P, L, G.length), sel = D.ag && G.some((g) => g.id === D.ag) ? D.ag : G[0].id, g = G.find((x) => x.id === sel), st = g.stats || { runs: 0, clears: 0, sum: 0, ends: [] }, fb = g.fb || { up: 0, down: 0, d: [0, 0, 0] };
    const ends = Array.isArray(st.ends) ? st.ends : [], em = Math.max(1, ...ends.map((x) => Number(x) || 0));
    const chart = (vals, lab) => { const mx = Math.max(1, ...vals), W = 560, H = 160, step = W / (vals.length - 1), pts = vals.map((v, i) => [i * step, H - 14 - (v / mx) * (H - 34)]);
      return `<svg class="sgh-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(T(lab))}"><defs><linearGradient id="sghG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--h-acc)" stop-opacity=".45"/><stop offset="1" stop-color="var(--h-acc)" stop-opacity="0"/></linearGradient></defs>${[0.25, 0.5, 0.75].map((k) => `<line x1="0" x2="${W}" y1="${(H - 14) * k}" y2="${(H - 14) * k}" class="gl"/>`).join("")}<path class="ar" d="M0 ${H - 14} ${pts.map((p) => "L" + p.map((x) => x.toFixed(1)).join(" ")).join(" ")} L${W} ${H - 14}Z"/><path class="ln" d="${pts.map((p, i) => (i ? "L" : "M") + p.map((x) => x.toFixed(1)).join(" ")).join(" ")}"/>${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"><title>${days[i]}: ${vals[i]}</title></circle>`).join("")}</svg><div class="sgh-cx">${days.filter((_, i) => i % 2 === 0).map((d) => `<span>${d.slice(5).replace("-", "/")}</span>`).join("")}</div>`; };
    const S = sub || "overview";
    const over = `<div class="sgh-kpis">${kpiT("play", num(P), "Plays by others")}${kpiT("heart", num(L), "Likes")}${kpiT("users", num(m.fans || 0), "Followers")}${kpiT("flag", R ? Math.round((C / R) * 100) + "%" : "—", "Clear rate")}${kpiT("star", num(RX), "Reactions")}${kpiT("trophy", "Lv " + lv.lv, "Creator level", Math.round(((lv.xp - lv.from) / Math.max(1, lv.next - lv.from)) * 100))}</div>
      <section class="sgh-panel rv"><div class="sgh-sech"><h3>${esc(T("Plays by others, the last 14 days"))}</h3><b class="sgh-big">${num(per.reduce((a, b) => a + b, 0))}</b></div>${chart(per, "Plays by others, the last 14 days")}</section>`;
    const table = `<section class="sgh-panel rv"><div class="sgh-sech"><h3>${esc(T("Your published games"))}</h3></div><div class="sgh-tw"><table class="sgh-tb"><thead><tr><th>${esc(T("Game"))}</th><th>${esc(T("Plays"))}</th><th>${esc(T("Likes"))}</th><th>${esc(T("Runs"))}</th><th>${esc(T("Clear rate"))}</th><th>${esc(T("Average score"))}</th><th>${esc(T("Remixes"))}</th></tr></thead><tbody>
      ${G.map((x) => { const s2 = x.stats || {}; return `<tr data-ag="${esc(x.id)}" class="${x.id === sel ? "on" : ""}"><td><img src="${esc(cover(x))}" alt="" width="64" height="37" loading="lazy"><b>${esc(x.title)}</b></td><td>${num(x.plays)}</td><td>${num(x.likes)}</td><td>${num(s2.runs || 0)}</td><td>${s2.runs ? Math.round((s2.clears / s2.runs) * 100) + "%" : "—"}</td><td>${s2.runs ? Math.round(s2.sum / s2.runs) : "—"}</td><td>${num(x.remixes || 0)}</td></tr>`; }).join("")}</tbody></table></div></section>`;
    const one = `<section class="sgh-panel rv sgh-one"><div class="sgh-sech"><h3>${esc(g.title)}</h3><span class="sgh-sp"></span><button type="button" class="sgh-btn sm" data-edit="${esc(g.id)}">${ic("edit", "sm")} ${esc(T("Edit"))}</button><button type="button" class="sgh-btn sm" data-gsheet="${esc(g.id)}">${ic("play", "sm")} ${esc(T("Play"))}</button></div>
      <div class="sgh-two"><div><h4>${esc(T("Where runs end"))}</h4>${ends.length ? `<div class="sgh-heat">${ends.map((n, i) => `<i style="--k:${(Number(n) || 0) / em}" title="${i * 10}–${i * 10 + 10}%: ${n}"></i>`).join("")}</div><div class="sgh-cx"><span>${esc(T("Start"))}</span><span>${esc(T("Finish"))}</span></div>` : `<p class="sgh-fine">${esc(T("Shows once others have played it."))}</p>`}
      <h4>${esc(T("Plays by others, the last 14 days"))}</h4>${chart(days.map((d) => (g.dl || {})[d] || 0), "Plays")}</div>
      <div><h4>${esc(T("What players said"))}</h4><ul class="sgh-fb"><li><i>${ic("heart", "sm")}</i>${esc(T("Fun"))}<b>${fb.up || 0}</b></li><li><i>${ic("close", "sm")}</i>${esc(T("Not for me"))}<b>${fb.down || 0}</b></li>${["Easy", "Just right", "Hard"].map((l, i) => `<li><i>${ic("flag", "sm")}</i>${esc(T(l))}<b>${(fb.d || [])[i] || 0}</b></li>`).join("")}</ul>
      <h4>${esc(T("Reactions"))}</h4><p class="sgh-rx">${Object.entries(g.rx || {}).map(([k, n]) => `<span>${esc(k)} <b>${n}</b></span>`).join("") || `<small class="sgh-fine">${esc(T("None yet"))}</small>`}</p></div></div></section>`;
    return S === "overview" ? over + table : table + one;
  }

  async function rewardsHtml() {
    const [w, s, m] = await Promise.all([week(), season(), mine()]); const G = ((m && m.games) || []).filter((g) => g.pub), PL = G.reduce((a, g) => a + (g.plays || 0), 0), L = G.reduce((a, g) => a + (g.likes || 0), 0), lv = LV(PL, L, G.length);
    const myName = (P0 => P0.name || "")(P()), seasonMe = s && s.top ? s.top.findIndex((x) => myName && x.name === myName) : -1;
    const pz = w && w.prize, places = pz ? pz.usd.map((u, i) => (u > 0 ? `<li><i>${["🥇", "🥈", "🥉"][i] || i + 1}</i><b>${(u / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</b></li>` : "")).join("") : "";
    const entered = !!(w && G.some((g) => g.tpl === w.tpl && g.at >= Date.parse(w.week + "T00:00:00Z") - 9 * 3600e3));
    const S = sub || "overview";
    const notice = `<div class="sgh-notice">${ic("warn")}<span>${esc(T("Earnings from your games' plays aren't live yet. Plays, likes and best runs are counted now; the weekly contest can carry a USDC prize when a GM sets one."))}</span></div>`;
    const status = `<section class="sgh-panel rv sgh-prize"><div class="sgh-pring" style="--k:${pz ? 1 : 0}"><b>${pz ? "USDC" : "—"}</b></div><div><h3>${pz ? esc(T("This week's contest has a prize")) : esc(T("No prize set this week"))}</h3>${pz ? `<ol class="sgh-places">${places}</ol>` : `<p>${esc(T("Weeks with a prize show it here and on the contest card."))}</p>`}<small class="sgh-fine">${esc(T("A GM pays the prize after the week from their own wallet to the winning game's maker; the server checks the payment on Arc."))}</small></div><button type="button" class="sgh-btn" data-go="community" data-s="contest">${ic("trophy")} ${esc(T("See the contest"))}</button></section>`;
    const req = `<section class="sgh-panel rv"><h3>${esc(T("To enter this week's contest"))}</h3><ul class="sgh-req">${[[!!wallet(), "Sign in with your wallet"], [G.length > 0, "Publish at least one game"], [entered, w ? T("Publish a game made with this week's template: {t}", { t: tname(w.tpl) }) : "Publish a game made with this week's template"], [false, "Others' plays and likes (×5) rank the games until Sunday night (Seoul)"]].map(([ok, l], i) => `<li class="${ok ? "ok" : i === 3 ? "info" : ""}">${ic(ok ? "check" : i === 3 ? "clock" : "dots", "sm")}<span>${esc(T(l))}</span></li>`).join("")}</ul>${w ? `<button type="button" class="sgh-btn pri" data-use="${esc(w.tpl)}">${ic("plus")} ${esc(T("Make a {t} game", { t: tname(w.tpl) }))}</button>` : ""}</section>`;
    const lvl = `<div class="sgh-kpis">${kpiT("trophy", "Lv " + lv.lv, "Creator level", Math.round(((lv.xp - lv.from) / Math.max(1, lv.next - lv.from)) * 100))}${kpiT("play", num(PL), "Plays by others")}${kpiT("heart", num(L), "Likes")}${kpiT("star", seasonMe >= 0 ? "#" + (seasonMe + 1) : "—", "Season place")}</div>`;
    return S === "contest" ? notice + status + req : notice + lvl + status + req;
  }

  function contestCard(w) { if (!w) return "";
    return `<article class="sgh-card rv sgh-ct"><span class="sgh-kick">${ic("trophy", "sm")} ${esc(T("Weekly creator contest"))}</span><h3>${esc(tname(w.tpl))}</h3><p>${esc(T("Publish a game made with this template — others' plays and likes (×5) rank it."))}</p><small class="sgh-left">${ic("clock", "xs")} ${esc(left(w.ends))}</small>
      ${w.top && w.top.length ? `<ol class="sgh-top3">${w.top.slice(0, 3).map((x, i) => `<li><i>${["🥇", "🥈", "🥉"][i]}</i><b>${esc(x.title || "")}</b><span>${esc(x.byName || "")}</span><em>${x.pts}</em></li>`).join("")}</ol>` : `<p class="sgh-fine">${esc(T("No entries yet — yours could be #1!"))}</p>`}
      ${w.prize ? `<em class="sgh-usd">${esc(T("Prize"))}: ${(w.prize.usd[0] / 100).toLocaleString()} USDC</em>` : ""}<button type="button" class="sgh-btn pri" data-use="${esc(w.tpl)}">${ic("plus")} ${esc(T("Enter"))}</button></article>`; }
  function dailyCard(d) { if (!d) return "";
    return `<article class="sgh-card rv sgh-dc" style="--art:url('${art(d.tpl)}')"><span class="sgh-kick">${ic("bolt", "sm")} ${esc(T("Today's creator challenge"))}</span><h3>${esc(tname(d.tpl))} · ${esc(thname(d.theme))}</h3><p>${esc(T("Make a game with today's template and theme — the day's most played wins the board."))}</p><small class="sgh-left">${ic("clock", "xs")} ${esc(left(d.ends))}</small>
      ${d.top && d.top.length ? `<ol class="sgh-top3">${d.top.slice(0, 3).map((x, i) => `<li><i>${i + 1}</i><b>${esc(x.title || "")}</b><span>${esc(x.byName || "")}</span><em>▶ ${x.plays}</em></li>`).join("")}</ol>` : ""}<button type="button" class="sgh-btn pri" data-use="${esc(d.tpl)}" data-th="${esc(d.theme)}">${ic("plus")} ${esc(T("Make it"))}</button></article>`; }

  async function communityHtml(S) {
    if (S === "arcade") { const A = await arcade(), picks = A.filter((g) => g.pick), off = A.filter((g) => g.off), hot = [...A].filter((g) => !g.off).sort((a, b) => (b.plays || 0) - (a.plays || 0)), nw = [...A].filter((g) => !g.off).sort((a, b) => (b.at || 0) - (a.at || 0)), now = A.filter((g) => g.now).sort((a, b) => b.now - a.now);
      const row = (t, L, more = "") => (L.length ? sec(t, `<div class="sgh-hs">${L.slice(0, 12).map((g) => gameCard(g)).join("")}</div>`, more) : "");
      return row("Playing right now", now) + row("Editors' picks", picks) + row("Most played", hot) + row("New", nw) + row("Start here — made by ARCIRCLE", off); }
    if (S === "contest") { const w = await week(); return `<div class="sgh-two">${contestCard(w)}${w && w.last ? `<article class="sgh-card rv"><span class="sgh-kick">${ic("flag", "sm")} ${esc(T("Last week"))}</span><h3>${esc(tname(w.last.tpl))}</h3>${(w.last.top || []).length ? `<ol class="sgh-top3">${w.last.top.map((x, i) => `<li><i>${["🥇", "🥈", "🥉"][i]}</i><b>${esc(x.title || "")}</b><span>${esc(x.byName || "")}</span><em>${x.pts}</em></li>`).join("")}</ol>` : `<p class="sgh-fine">${esc(T("No entries"))}</p>`}</article>` : ""}</div>${w && w.top && w.top.length > 3 ? sec("This week's board", `<ol class="sgh-board">${w.top.map((x, i) => `<li><i>${i + 1}</i><b>${esc(x.title || "")}</b><span>${esc(x.byName || "")}</span><em>▶ ${x.p || 0} · ♥ ${x.l || 0}</em><strong>${x.pts}</strong></li>`).join("")}</ol>`) : ""}`; }
    if (S === "daily") { const d = await day(); return `<div class="sgh-two">${dailyCard(d)}${d && d.last ? `<article class="sgh-card rv"><span class="sgh-kick">${ic("clock", "sm")} ${esc(T("Yesterday"))}</span><h3>${esc(tname(d.last.tpl))} · ${esc(thname(d.last.theme))}</h3>${(d.last.top || []).length ? `<ol class="sgh-top3">${d.last.top.map((x, i) => `<li><i>${i + 1}</i><b>${esc(x.title || "")}</b><span>${esc(x.byName || "")}</span></li>`).join("")}</ol>` : `<p class="sgh-fine">${esc(T("No entries"))}</p>`}</article>` : ""}</div>`; }
    if (S === "season") { const s = await season(); if (!s) return empty("trophy", "The season board is resting", "Try again in a minute.");
      return sec("Creator season", `<p class="sgh-fine">${esc(T("Creators ranked by others' plays and likes (×5) on all their games this month."))} · ${esc(left(s.ends))}</p>${s.top.length ? `<ol class="sgh-board">${s.top.map((x, i) => `<li class="${i < 3 ? "top" : ""}"><i>${["🥇", "🥈", "🥉"][i] || i + 1}</i><b>${esc(x.name || T("A creator"))}</b><span></span><em>▶ ${x.plays} · ♥ ${x.likes}</em><strong>${x.pts}</strong></li>`).join("")}</ol>` : `<p class="sgh-fine">${esc(T("No entries yet — yours could be #1!"))}</p>`}`); }
    if (S === "races") { const r = await races(); const L = r ? [...(r.open || []), ...(r.live || [])] : [];
      return `<section class="sgh-panel rv sgh-rh"><span class="sgh-kick">${ic("bolt", "sm")} ${esc(T("Race hour"))}</span><h3>${esc((r && r.hour && r.hour.title) || T("Quick race"))}</h3><p>${esc(T("One game an hour: press Quick race and you're matched with whoever is waiting."))}${r && r.hour && r.hour.waiting ? " · " + esc(T("{n} waiting", { n: r.hour.waiting })) : ""}</p><div class="sgh-cta"><button type="button" class="sgh-btn pri" data-quick>${ic("bolt")} ${esc(T("Quick race"))}</button><label class="sgh-code"><input maxlength="5" placeholder="ABCDE" data-rcode autocomplete="off"><button type="button" class="sgh-btn" data-rjoin>${esc(T("Join"))}</button></label></div></section>
        ${L.length ? sec("Open and live races", `<ul class="sgh-races">${L.map((x) => `<li><b>${esc(x.title || x.code)}</b><span>${x.start ? esc(T("Racing now")) : esc(T("{n} in the lobby", { n: x.n || 1 }))}</span>${x.start ? "" : `<button type="button" class="sgh-btn sm" data-race="${esc(x.code)}">${esc(T("Join"))}</button>`}</li>`).join("")}</ul>`) : `<p class="sgh-fine">${esc(T("No races open right now — start one from a game's page."))}</p>`}`; }
    if (S === "feed") { if (!wallet()) return signCard("Sign in to follow creators", "Follow a creator from any game of theirs; their new games show here first.");
      const f = await feed(); const L = (f && f.games) || []; try { localStorage.setItem("arc.studio.feedSeen", String(Date.now())); } catch { /* fine */ }
      return L.length ? sec("New from creators you follow", `<div class="sgh-grid g4">${L.map((g) => gameCard({ ...g, id: g.id })).join("")}</div>`) : empty("users", "You don't follow anyone yet", "Open a game you liked and press Follow — their next games land here."); }
    return "";
  }

  // ---------------- a game's sheet: play here, in the World, its page, remix ----------------
  async function gameSheet(id) {
    const A = await arcade(), m = wallet() ? await mine() : null, g = A.find((x) => x.id === id) || ((m && [...(m.games || []), ...(m.shared || [])]) || []).find((x) => x.id === id); if (!g) return;
    const own = !!(m && (m.games || []).some((x) => x.id === id));
    let page2 = ""; try { const r = await fetch("/api/social?world=studio-game&id=" + encodeURIComponent(id), { cache: "no-store" }); if (r.ok) { const j = (await r.json()).game; if (j && j.h && j.slug) page2 = `/game/@${j.h}/${j.slug}`; } } catch { /* the World's link */ }
    const wrap = document.createElement("div"); wrap.className = "sgh-sheet"; wrap.innerHTML = `<div class="sgh-shin" role="dialog" aria-label="${esc(g.title)}"><button type="button" class="sgh-ib sgh-shx" data-shx aria-label="${esc(T("Close"))}">${ic("close")}</button>
      <div class="sgh-shart" style="--art:url('${esc(cover(g))}')"><span class="sgh-chip">${esc(tname(g.tpl))}${g.theme ? " · " + esc(thname(g.theme)) : ""}</span></div>
      <div class="sgh-shbody"><h2>${esc(g.title)}</h2><small>${esc(g.byName || "ARCIRCLE")}</small><div class="sgh-gm big"><i>${ic("play", "xs")} ${num(g.plays)} ${esc(T("Plays"))}</i><i>${ic("heart", "xs")} ${num(g.likes)} ${esc(T("Likes"))}</i>${g.now ? `<i class="nowc">● ${g.now} ${esc(T("playing"))}</i>` : ""}</div>
      <div class="sgh-shbtns"><button type="button" class="sgh-btn pri big" data-play="${esc(id)}">${ic("play")} ${esc(T("Play here"))}</button><a class="sgh-btn big" href="/play?sg=${encodeURIComponent(id)}">${ic("globe")} ${esc(T("Play in ARCIRCLE WORLD"))}</a></div>
      <div class="sgh-shrow">${own ? `<button type="button" class="sgh-btn" data-edit="${esc(id)}">${ic("edit", "sm")} ${esc(T("Edit"))}</button>` : `<button type="button" class="sgh-btn" data-remix="${esc(id)}">${ic("remix", "sm")} ${esc(T("Remix it"))}</button>`}${page2 ? `<a class="sgh-btn" href="${page2}" target="_blank" rel="noopener">${ic("ext", "sm")} ${esc(T("Game page"))}</a>` : ""}<button type="button" class="sgh-btn" data-copy="${esc(location.origin + (page2 || "/play?sg=" + encodeURIComponent(id)))}">${ic("link", "sm")} ${esc(T("Copy link"))}</button>${own ? `<button type="button" class="sgh-btn" data-go="analytics" data-s="games" data-ag="${esc(id)}">${ic("chart", "sm")} ${esc(T("Analytics"))}</button>` : ""}<button type="button" class="sgh-btn" data-xfull="${esc(id)}">${ic("ext", "sm")} ${esc(T("Full page"))}</button></div></div></div>`;
    document.body.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add("on"));
    const x = () => { wrap.classList.remove("on"); setTimeout(() => wrap.remove(), 260); document.removeEventListener("keydown", kd); }, kd = (e) => { if (e.key === "Escape") x(); };
    document.addEventListener("keydown", kd);
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-shx]")) return x(); const b = e.target.closest("button,a"); if (!b) return; if (b.matches("a[href]") && !b.dataset.go) return; x(); onAct(b, e); });
  }
  function guideSheet(id) { const g = GUIDES.find((x) => x.id === id); if (!g) return;
    const wrap = document.createElement("div"); wrap.className = "sgh-sheet"; wrap.innerHTML = `<div class="sgh-shin guide" role="dialog" aria-label="${esc(T(g.t))}"><button type="button" class="sgh-ib sgh-shx" data-shx aria-label="${esc(T("Close"))}">${ic("close")}</button><div class="sgh-shart" style="--art:url('${g.art}${ver}')"><span class="sgh-chip">${ic("clock", "xs")} ${esc(g.m)}</span></div>
      <div class="sgh-shbody"><h2>${esc(T(g.t))}</h2><ol class="sgh-gsteps">${g.steps.map((s, i) => `<li style="--d:${i * 70}ms"><em>${i + 1}</em><span>${esc(T(s))}</span></li>`).join("")}</ol><div class="sgh-shbtns"><button type="button" class="sgh-btn pri big" data-make>${ic("plus")} ${esc(T("Try it now"))}</button></div></div></div>`;
    document.body.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add("on"));
    const x = () => { wrap.classList.remove("on"); setTimeout(() => wrap.remove(), 260); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.closest("[data-shx]")) return x(); const b = e.target.closest("[data-make]"); if (b) { x(); o.ws.open("make"); } }); }

  /// a game: on a computer its full page, the card's picture flying into the page's header (a view transition); on a phone the sheet
  function openGame(id, el, full) {
    if (!full && !matchMedia("(min-width: 1024px)").matches) { gameSheet(id); return; }
    const img = el && el.querySelector ? el.querySelector(".sgh-gart img") : null, run = () => go("game", "", true, { id });
    if (img && document.startViewTransition && !reduce && page !== "game") { img.style.viewTransitionName = "sgh-morph"; try { document.startViewTransition(run); } catch { run(); } } else run();
  }
  function lightbox(src) { const w = document.createElement("div"); w.className = "sgh-sheet sgx-lb"; w.innerHTML = `<img src="${esc(src)}" alt="">`; document.body.appendChild(w); requestAnimationFrame(() => w.classList.add("on")); w.onclick = () => { w.classList.remove("on"); setTimeout(() => w.remove(), 260); }; }

  // ---------------- the pop-ups: search (Ctrl + K), the bell, the account, all tools ----------------
  let pop = null; function closePops() { if (pop) { pop.remove(); pop = null; } }
  const SEEN = "arc.hub.upd";
  const bellN = () => { let t = ""; try { t = localStorage.getItem(SEEN) || ""; } catch { /* none */ } return UPDATES.filter((u) => u.d > t).length + (D.feedN || 0) + (D.inboxN || 0); };
  function popAt(anchor, cls, html) { closePops(); pop = document.createElement("div"); pop.className = "sgh-pop " + cls; pop.innerHTML = html; document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth; pop.style.top = Math.round(r.bottom + 8) + "px"; pop.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w))) + "px"; requestAnimationFrame(() => pop && pop.classList.add("on")); return pop; }
  async function bell(a) {
    const [f, xr] = await Promise.all([feed(), X.bellRows().catch(() => "")]), L = (f && f.games) || []; let t = 0; try { t = Number(localStorage.getItem("arc.studio.feedSeen") || 0); } catch { /* none */ }
    popAt(a, "bell", `<h4>${esc(T("Notifications"))}</h4>${xr}${L.filter((x) => x.at > t).slice(0, 5).map((g) => `<button type="button" class="sgh-pi" data-gsheet="${esc(g.id)}"><img src="${art(g.tpl, 400)}" alt="" width="56" height="32"><span><b>${esc(g.title)}</b><small>${esc(T("New from {n}", { n: g.byName || T("a creator") }))} · ${esc(ago(g.at))}</small></span></button>`).join("")}
      ${UPDATES.slice(0, 4).map((u) => `<button type="button" class="sgh-pi" data-go="updates"><img src="${u.img}${ver}" alt="" width="56" height="32"><span><b>${esc(T(u.t))}</b><small>${esc(T(u.tag))} · ${esc(u.d)}</small></span></button>`).join("")}<a class="sgh-pall" href="?p=updates" data-go="updates">${esc(T("All updates"))}</a>`);
    try { localStorage.setItem(SEEN, UPDATES[0].d); } catch { /* fine */ } D.feedN = 0; if (D.inboxN) X.seen().catch(() => {}); root.querySelectorAll(".sgh-dot").forEach((e) => e.remove());
  }
  function account(a) { const m = me();
    popAt(a, "acct", `${m ? `<div class="sgh-acc">${avatar("lg")}<span><b>${esc(D.h ? "@" + D.h : m.name || m.short)}</b><small>${esc(m.short)}</small></span></div>
      ${D.h ? `<a class="sgh-pi" href="/game/@${esc(D.h)}" target="_blank" rel="noopener">${ic("ext")}<span><b>${esc(T("Your creator page"))}</b></span></a>` : `<button type="button" class="sgh-pi" data-ws="mine">${ic("link")}<span><b>${esc(T("Pick a creator ID"))}</b></span></button>`}
      ${D.h ? `<button type="button" class="sgh-pi" data-go="profile">${ic("user")}<span><b>${esc(T("Your profile"))}</b></span></button>` : ""}<button type="button" class="sgh-pi" data-go="inbox">${ic("bell")}<span><b>${esc(T("Notifications"))}</b></span></button>
      <button type="button" class="sgh-pi" data-go="creations">${ic("folder")}<span><b>${esc(T("My games"))}</b></span></button><button type="button" class="sgh-pi" data-go="analytics">${ic("chart")}<span><b>${esc(T("Analytics"))}</b></span></button>`
      : `<div class="sgh-acc">${avatar("lg")}<span><b>${esc(T("Guest"))}</b><small>${esc(T("Drafts stay on this device"))}</small></span></div><button type="button" class="sgh-btn blue full" data-signin>${ic("wallet")} ${esc(T("Connect wallet"))}</button>`}
      <a class="sgh-pi" href="/play">${ic("globe")}<span><b>${esc(T("Play ARCIRCLE WORLD"))}</b></span></a>`); }
  function tools() {
    closePops(); const G = [["Creations", [["My games", "creations", "games"], ["Shared with me", "creations", "shared"], ["On this device", "creations", "device"], ["Create a game", "", "make"]]], ["Store", [["Templates", "store", "templates"], ["Themes", "store", "themes"], ["Remixable games", "store", "remix"]]],
      ["Community", [["Creator Arcade", "community", "arcade"], ["Weekly contest", "community", "contest"], ["Daily challenge", "community", "daily"], ["Creator season", "community", "season"], ["Live races", "community", "races"], ["Following", "community", "feed"]]], ["Learn", [["Get started", "learn", "start"], ["Guides", "learn", "guides"], ["Templates", "learn", "templates"]]],
      ["Analytics", [["Overview", "analytics", "overview"], ["By game", "analytics", "games"]]], ["Rewards", [["Overview", "rewards", "overview"], ["Contest prizes", "rewards", "contest"]]], ["ARCIRCLE WORLD", [["Play ARCIRCLE WORLD", "@", "/play"], ["Game World site", "@", "/game"], ["Official games' page", "@", "/game/@arcircle"]]]];
    pop = document.createElement("div"); pop.className = "sgh-tools"; pop.innerHTML = `<div class="sgh-tin" role="dialog" aria-label="${esc(T("All tools"))}"><div class="sgh-sech"><h3>${esc(T("All tools"))}</h3><button type="button" class="sgh-ib" data-tx aria-label="${esc(T("Close"))}">${ic("close")}</button></div><div class="sgh-tg2">${G.map(([h, L]) => `<div><h4>${esc(T(h))}</h4>${L.map(([l, p, s]) => (p === "@" ? `<a href="${s}">${esc(T(l))}${ic("ext", "xs")}</a>` : p ? `<a href="?p=${p}&s=${s}" data-go="${p}" data-s="${s}">${esc(T(l))}</a>` : `<a href="#" data-make>${esc(T(l))}</a>`)).join("")}</div>`).join("")}</div></div>`;
    const sd = [...document.querySelectorAll(".sgh-side")].find((x) => x.offsetParent), x0 = sd && innerWidth >= 760 ? Math.round(sd.getBoundingClientRect().right) : 0;
    pop.style.left = x0 + "px"; pop.style.setProperty("--tx", "0px"); /* (the panel opens right beside the menu; the menu stays lit and usable) */
    document.body.appendChild(pop); requestAnimationFrame(() => pop && pop.classList.add("on"));
  }
  function search() {
    closePops(); pop = document.createElement("div"); pop.className = "sgh-cmd"; pop.innerHTML = `<div class="sgh-cin" role="dialog" aria-label="${esc(T("Search"))}"><label class="sgh-sbox">${ic("search")}<input type="search" data-cq placeholder="${esc(T("Search games, templates, guides and pages"))}" autocomplete="off"><kbd>Esc</kbd></label><div class="sgh-cres"></div></div>`;
    document.body.appendChild(pop); requestAnimationFrame(() => pop && pop.classList.add("on")); const inp = pop.querySelector("input"); inp.focus(); let A = []; arcade().then((x) => { A = x; draw(); });
    const draw = () => { const q = inp.value.trim().toLowerCase(), m = (s) => !q || String(s).toLowerCase().includes(q), box = pop && pop.querySelector(".sgh-cres"); if (!box) return;
      const pages = NAV.filter(([, , l]) => m(T(l)) || m(l)).map(([id, i, l]) => `<button type="button" class="sgh-pi" data-go="${id}">${ic(i)}<span><b>${esc(T(l))}</b><small>${esc(T("Page"))}</small></span></button>`);
      const tp = Object.keys(TEMPLATES).filter((id) => TEMPLATES[id].open && (m(T(TEMPLATES[id].name)) || m(TEMPLATES[id].name))).map((id) => `<button type="button" class="sgh-pi" data-use="${id}"><img src="${art(id, 400)}" alt="" width="56" height="32"><span><b>${esc(T(TEMPLATES[id].name))}</b><small>${esc(T("Template"))}</small></span></button>`);
      const gd = GUIDES.filter((g) => m(T(g.t)) || m(g.t)).map((g) => `<button type="button" class="sgh-pi" data-guide="${g.id}">${ic("book")}<span><b>${esc(T(g.t))}</b><small>${esc(T("Guide"))}</small></span></button>`);
      const gm = q ? A.filter((g) => m(g.title) || m(g.byName)).slice(0, 8).map((g) => `<button type="button" class="sgh-pi" data-gsheet="${esc(g.id)}"><img src="${esc(cover(g))}" alt="" width="56" height="32"><span><b>${esc(g.title)}</b><small>${esc(g.byName || "")} · ${esc(tname(g.tpl))}</small></span></button>`) : [];
      const grp = (h, L) => (L.length ? `<h4>${esc(T(h))}</h4>${L.slice(0, q ? 8 : 4).join("")}` : "");
      box.innerHTML = grp("Games", gm) + grp("Templates", tp) + grp("Guides", gd) + grp("Pages", pages) || `<p class="sgh-fine">${esc(T("Nothing found"))}</p>`; };
    inp.addEventListener("input", draw); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const b = pop.querySelector(".sgh-cres button"); if (b) b.click(); } }); draw();
  }

  // ---------------- the motion: reveal on scroll, count-up ----------------
  let io = null;
  function reveal() { FX.after(root); if (reduce || !("IntersectionObserver" in window)) { root.querySelectorAll(".rv").forEach((e) => e.classList.add("in")); return; }
    if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" });
    root.querySelectorAll(".rv:not(.in)").forEach((e) => io.observe(e)); }
  function countUp(box) { box.querySelectorAll("[data-count]").forEach((b) => { const n = Number(b.dataset.count) || 0; if (reduce || n < 2) { b.textContent = num(n); return; } const t0 = performance.now(), d = 1100;
    const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); b.textContent = num(Math.round(n * e)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }
  function after() { reveal();
    root.querySelectorAll("[data-langbtn]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const m = b.nextElementSibling, open = m.hidden; root.querySelectorAll(".sgh-lmenu").forEach((x) => { x.hidden = true; }); m.hidden = !open; b.classList.toggle("on", open); }; });
    root.querySelectorAll("[data-setlang]").forEach((b) => { b.onclick = () => { try { localStorage.setItem("arcircle.lang", b.dataset.setlang); } catch { /* fine */ } location.reload(); }; }); fill().catch((e) => console.warn("hub fill", e)); root.querySelectorAll(".sgh-lang").forEach((sel) => { sel.onchange = () => { try { localStorage.setItem("arcircle.lang", sel.value); } catch { /* fine */ } location.reload(); }; }); } // (the footer's and the top bar's language pickers)

  // ---------------- the clicks ----------------
  async function onAct(b, e) {
    const d = b.dataset;
    if (await X.act(b, e)) { e && e.preventDefault(); return true; }
    if (d.go != null && !b.hasAttribute("data-gsheet")) { e && e.preventDefault(); if (d.ag) D.ag = d.ag; go(d.go, d.s || ""); return true; }
    if (b.hasAttribute("data-make")) { e && e.preventDefault(); closePops(); drawer = false; o.ws.open("make"); return true; }
    if (d.ws) { closePops(); o.ws.open(d.ws); return true; }
    if (d.use) { closePops(); o.ws.use(d.use, d.th || ""); return true; }
    if (d.theme) { o.ws.use("", d.theme); return true; }
    if (d.edit) { closePops(); o.ws.edit(d.edit); return true; }
    if (d.ledit) { o.ws.local(d.ledit); return true; }
    if (d.play) { o.ws.play(d.play); return true; }
    if (d.remix) { o.ws.remix(d.remix); return true; }
    if (d.gsheet) { closePops(); openGame(d.gsheet, b); return true; }
    if (d.xfull) { openGame(d.xfull, null, true); return true; }
    if (d.guide) { closePops(); guideSheet(d.guide); return true; }
    if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast("🔗 " + esc(T("Link copied"))); } catch { toast(esc(d.copy)); } return true; }
    if (b.hasAttribute("data-signin")) { closePops(); try { await o.signIn(); toast("👛 " + esc(T("Signed in"))); fresh(); D.h = await handle(); paint(); } catch (er) { toast(esc((er && er.message) || T("Sign-in failed"))); } return true; }
    if (b.hasAttribute("data-quick")) { o.ws.quick(); return true; }
    if (d.race) { o.ws.race(d.race); return true; }
    if (b.hasAttribute("data-rjoin")) { const v = (root.querySelector("[data-rcode]") || {}).value || ""; if (/^[A-Za-z0-9]{5}$/.test(v.trim())) o.ws.race(v.trim().toUpperCase()); else toast(esc(T("A race code has 5 letters"))); return true; }
    return false;
  }
  root.addEventListener("click", async (e) => {
    const t = e.target;
    if (peek) { // (over the workspace: closing hides the hub again, a page link leaves the workspace for that page)
      if ((t.closest("[data-dwx]") && !t.closest(".sgh-dwin")) || t.closest("[data-dwclose]")) { unpeek(); return; }
      const pk0 = t.closest("[data-peek]"); if (pk0 && SUBS[pk0.dataset.peek] && cpage !== pk0.dataset.peek) { e.preventDefault(); cpage = pk0.dataset.peek; paint(); return; }
      if (t.closest("[data-make]")) { e.preventDefault(); unpeek(); o.ws.open("make"); return; }
      const lk = t.closest("a[href]"); if (lk && lk.getAttribute("href") !== "#") { e.preventDefault(); const h = lk.getAttribute("href"); location.href = h.startsWith("?") ? "/studio" + h : h; return; }
      if (t.closest("[data-tools]")) { e.preventDefault(); location.href = "/studio?p=home"; return; }
      if (t.closest("[data-user]")) { unpeek(); return; }
      return;
    }
    if (t.closest("[data-dwx]") && !t.closest(".sgh-dwin")) { drawer = false; cpage = null; paint(); return; }
    if (t.closest("[data-dwclose]")) { drawer = false; cpage = null; paint(); return; }
    const pk = t.closest("[data-peek]"); if (pk && drawer && SUBS[pk.dataset.peek] && cpage !== pk.dataset.peek && (cpage || page) !== pk.dataset.peek) { e.preventDefault(); cpage = pk.dataset.peek; paint(); return; } // (a phone: the rail's first tap shows that page's sub column, like Roblox's)
    if (t.closest("[data-burger]")) { if (matchMedia("(min-width: 1024px)").matches && page !== "home") { collapsed = !collapsed; try { localStorage.setItem("arc.hub.fold", collapsed ? "1" : "0"); } catch { /* fine */ } paint(); } else { drawer = true; cpage = null; paint(); } return; }
    if (t.closest("[data-tools]")) { e.preventDefault(); const own = [...document.querySelectorAll(".sgh>.sgh-side")].some((x) => x.offsetParent); if (innerWidth < 760) { if (drawer) { drawer = false; paint(); } } else if (!own && !drawer) { drawer = true; paint(); } tools(); return; } // (a computer: the panel beside the menu — the page's own, or the drawer's on Home; a phone: the panel alone)
    const u = t.closest("[data-user]"); if (u) { const inDw = drawer; if (inDw) { drawer = false; paint(); } account(inDw ? root.querySelector(".sgh-me") || u : u); return; }
    if (t.closest("[data-search]")) { search(); return; }
    if (t.closest("[data-htog]")) { FX.toggle(); return; }
    const bl = t.closest("[data-bell]"); if (bl) { bell(bl); return; }
    const ag = t.closest("tr[data-ag]"); if (ag) { D.ag = ag.dataset.ag; go("analytics", "games"); return; }
    if (t.closest("[data-cdir]")) { D.cd = (D.cd || -1) * -1; const el = root.querySelector('[data-fill="creations"]'); if (el) el.innerHTML = await creationsHtml(); return; }
    const b = t.closest("button,a,article[data-gsheet],article[data-use],article[data-guide],article[data-ledit],article[data-theme],article[data-go]"); if (!b) return;
    if (b.matches("a[href]") && !b.dataset.go && !b.dataset.xprof && !b.dataset.xgame && !b.hasAttribute("data-make") && !b.hasAttribute("data-tools")) return; // (a real link)
    if (await onAct(b, e)) e.preventDefault();
  });
  root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches && e.target.matches("article[tabindex]")) e.target.click(); });
  root.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.matches("[data-cf]")) { D.cf = { ...(D.cf || { pub: true, draft: true }), [t.dataset.cf]: t.checked }; const el = root.querySelector('[data-fill="creations"]'); if (el) el.innerHTML = await creationsHtml(); }
    if (X.onInput(t)) return;
    if (t.matches("[data-csort]")) { D.cs = t.value; const el = root.querySelector('[data-fill="creations"]'); if (el) el.innerHTML = await creationsHtml(); }
  });
  let sqT = 0; root.addEventListener("input", (e) => { if (X.onInput(e.target)) return; if (e.target.matches("[data-sq]")) { clearTimeout(sqT); const v = e.target.value; sqT = setTimeout(() => { D.sq = v; const pos = e.target.selectionStart; paint(); const ni = root.querySelector("[data-sq]"); if (ni) { ni.focus(); try { ni.setSelectionRange(pos, pos); } catch { /* fine */ } } }, 260); } });
  document.addEventListener("click", (e) => { if (!pop || pop.contains(e.target) || e.target.closest("[data-user],[data-bell],[data-search],[data-tools]")) { if (pop && pop.contains(e.target)) { const b = e.target.closest("button,a"); if (b && (b.dataset.go != null || b.dataset.ws || b.dataset.use || b.dataset.gsheet || b.dataset.guide || b.dataset.xgame || b.dataset.xpost || b.hasAttribute("data-signin") || b.hasAttribute("data-make"))) { e.preventDefault(); const keep = pop; onAct(b, e); if (pop === keep) closePops(); } else if (e.target.closest("[data-tx]") || e.target === pop) closePops(); } return; } closePops(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".sgh-tlang")) root.querySelectorAll(".sgh-lmenu").forEach((x) => { if (!x.hidden) { x.hidden = true; x.previousElementSibling.classList.remove("on"); } }); });
  document.addEventListener("keydown", (e) => { if (root.hidden) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); search(); } else if (e.key === "Escape") { if (pop) closePops(); else if (peek) unpeek(); else if (drawer) { drawer = false; paint(); } } });
  addEventListener("popstate", () => { if (root.hidden) return; route(); paint(); });

  // the bell's count: new games from creators you follow
  async function feedCount() { const f = await feed(); let t = 0; try { t = Number(localStorage.getItem("arc.studio.feedSeen") || 0); } catch { /* none */ } D.feedN = ((f && f.games) || []).filter((x) => x.at > t).length; if (D.feedN && !root.hidden) root.querySelectorAll("[data-bell]").forEach((b) => { if (!b.querySelector(".sgh-dot")) b.insertAdjacentHTML("beforeend", `<em class="sgh-dot">${bellN()}</em>`); }); }

  const FX = makeHubFx({ T, esc, ic, D, lang: o.lang, ver, num, arcade, mine, handle, wallet, LV, toast, page: () => page, hidden: () => root.hidden, forget: (re) => { for (const k of Object.keys(got)) if (re.test(k)) delete got[k]; } });
  const X = makeHubX({ T, esc, ic, num, ver, D, art, hubArt, cover, tname, thname, ago, left, wallet, me, LV, TDESC, get, arcade, mine, handle, week, feed, sess: o.sess, signed: o.signed, toast, go, paint, countUp,
    sub: () => sub, sec: (...a) => sec(...a), head: (...a) => head(...a), skel: (...a) => skel(...a), empty: (...a) => empty(...a), signCard: (...a) => signCard(...a), gameCard: (...a) => gameCard(...a), kpiT: (...a) => kpiT(...a),
    forget: (re) => { for (const k of Object.keys(got)) if (re.test(k)) delete got[k]; }, openGame, lightbox, ask: (q) => ask(T, q, { ok: T("Delete"), cancel: T("Cancel"), danger: true }), confirm: (q) => ask(T, q, { ok: T("Buy"), cancel: T("Cancel") }) });
  route(); handle().then((h) => { D.h = h; if (h && !root.hidden) { const u = root.querySelector(".sgh-user"); if (u) u.outerHTML = userRow(); } }); paint(); feedCount(); setTimeout(() => FX.milestones().catch(() => {}), 1500); X.unread().then((n) => { if (n && !root.hidden) root.querySelectorAll("[data-bell]").forEach((b) => { const d = b.querySelector(".sgh-dot"); if (d) d.textContent = bellN() > 9 ? "9+" : bellN(); else b.insertAdjacentHTML("beforeend", `<em class="sgh-dot">${bellN()}</em>`); }); }).catch(() => {});
  return {
    show() { root.hidden = false; document.body.classList.remove("sgh-ws"); fresh(); route(); paint(); FX.milestones().catch(() => {}); },
    hide() { root.hidden = true; closePops(); FX.hide(); document.body.classList.add("sgh-ws"); },
    shown: () => !root.hidden && !peek, go,
    menu() { peek = true; drawer = true; cpage = null; root.hidden = false; paint(); }, /* (the workspace's ≡: the hub's menu drawer over the Studio) */ refresh: () => { fresh(); if (!root.hidden) paint(); },
  };
}
