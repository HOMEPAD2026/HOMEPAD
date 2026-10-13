// world-icons.js — the game's own icon set: one 24-unit grid, 2-unit round strokes in currentColor, so every icon
// sits on the same baseline and takes the colour of the button it is in (the emote wheel, the guide's legend).
const P = {
  wave: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5"/><path d="M14 11.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.6a5 5 0 0 1-3.9-1.9L4 14.6a1.4 1.4 0 0 1 2.1-1.9L8 14.5"/>',
  no: '<path d="M6 6l12 12M18 6L6 18"/>',
  sit: '<circle cx="9" cy="5" r="2"/><path d="M9 8v6h6l2 5"/><path d="M5 20h8"/>',
  point: '<path d="M7 17L17 7"/><path d="M9 7h8v8"/>',
  pickup: '<path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M5 17v3h14v-3"/>',
  faint: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
  stick: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2"/>',
  look: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  pinch: '<path d="M4 9V4h5M20 15v5h-5"/><path d="M4 4l6 6M20 20l-6-6"/>',
  jump: '<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>',
  run: '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',
  board: '<path d="M3 13h18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="7" cy="18" r="1.4"/><circle cx="17" cy="18" r="1.4"/><path d="M8 9h8"/>',
  photo: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
  bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  shirt: '<path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4"/>',
  season: '<path d="M12 3l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 15.2 7 18l1.2-5.6L4 8.6 9.6 8z"/>',
  codex: '<path d="M4 5c3-1.5 5.5-1 8 1 2.5-2 5-2.5 8-1v14c-3-1.5-5.5-1-8 1-2.5-2-5-2.5-8-1z"/><path d="M12 6v14"/>',
  paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="6" r="1.8"/><circle cx="15.5" cy="7" r="1.8"/><circle cx="18" cy="11" r="1.6"/><path d="M8 17c0-3 2-5 4.5-5S17 14 17 16.5 15 20 12.5 19 8 19.5 8 17z"/>',
  chart: '<path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"/>',
  shop: '<path d="M4 9h16l-1.5 11h-13z"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M4 9l2-4h12l2 4"/>',
  anvil: '<path d="M4 8h12c0 2 1.5 3 4 3v2c-3 0-5 1-6 3H9c-.5-2-2-3-5-3z"/><path d="M8 16l-1 4h10l-1-4"/>',
  wrench: '<path d="M14.5 4a4 4 0 0 0-4.6 5.4L4 15.3 6.7 18l5.9-5.9A4 4 0 0 0 18 7.5l-2.3 2.3-2.4-.6-.6-2.4z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  village: '<path d="M3 20h18"/><path d="M4.5 20v-8l5-4 5 4v8"/><path d="M14.5 20v-5.5l3-2.5 3 2.5V20"/><path d="M8 20v-4h3v4"/><path d="M9.5 8V3.5l3.5 1.2-3.5 1.3"/>',
  island: '<path d="M3 18c3-2 6-2 9 0s6 2 9 0"/><path d="M12 15V7"/><path d="M12 7c-3-2-6-1-7 1M12 7c3-2 6-1 7 1M12 7c-1-2-3-3-5-2M12 7c1-2 3-3 5-2"/>',
  mail: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 8l9 6 9-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
  keys: '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M8 14h8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
  crew: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.7-3.4 2.9-5 5.5-5s4.8 1.6 5.5 5M14 14.3c.8-.2 1.6-.3 2.5-.3 2.2 0 4 1.3 4.5 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sword: '<path d="M14.5 4H20v5.5L10 19.5 4.5 14z"/><path d="M7 16.5l-3 3M5.5 13l5.5 5.5"/>',
};
/// an icon as inline SVG (decorative: hidden from screen readers; the button's text names it)
export function icon(name, size = 20) {
  const p = P[name]; if (!p) return "";
  return `<svg class="wi-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}
/// the glyphs the game used to draw as text, and the icon that now stands for each
export const GLYPH = { "✋": "wave", "✕": "no", "◡": "sit", "➚": "point", "⇩": "pickup", "✶": "faint", "◐": "stick", "◑": "look", "⇲⇱": "pinch", "↑": "jump", "▶": "run", "⏏": "board", "◉": "photo", "⚔": "sword" };
export const names = Object.keys(P);
