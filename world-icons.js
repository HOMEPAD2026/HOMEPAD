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
