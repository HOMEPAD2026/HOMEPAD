// world-store-data.js — the Studio's ASSET STORE (2026-10-29, the owner: "free 1 + premium 2 in each of characters,
// buildings, nature, backgrounds and structures, under the 3D Builder; premium 30,000 $ARCIRCLE each, 50 % burned / 50 %
// treasury; downloads too"). Shared by the Studio (world-studio-assets.js) and the server (api/_world-store.mjs).
// Every model is Meshy's (raw/sa on claude/meshy-studio-assets), packed for a phone: models/studio/store/<file>.glb, its card
// images/studio/store/<file>.webp. id: what a course's B.as holds (the scene editor's asset list: /^[a-z0-9]{6,40}$/).
export const STORE = {
  PRICE: 30000, // $ARCIRCLE a premium asset (one price for all, the owner's)
  BURN_PCT: 50, // the payment goes to FeeBurn (api/_world-shop.mjs FEE_BURN): half burned, half to the treasury — one place for the split
  CATS: [["character", "🧑‍🚀", "Characters"], ["building", "🏠", "Buildings"], ["nature", "🌳", "Nature"], ["background", "🏔️", "Backgrounds"], ["structure", "🌉", "Structures"]],
  ITEMS: [
    { id: "sacharrobot", file: "char-robot", cat: "character", free: true, name: "Helper Robot", line: "A round little robot that waves and walks", h: 1.6 },
    { id: "sacharsamurai", file: "char-samurai", cat: "character", name: "Cyber Samurai", line: "A glowing katana on the back, ready for a boss fight", h: 1.9 },
    { id: "sacharastro", file: "char-astronaut", cat: "character", name: "Space Explorer", line: "A chibi explorer in a white-and-cyan suit", h: 1.7 },
    { id: "sabldcottage", file: "bld-cottage", cat: "building", free: true, name: "Cozy Cottage", line: "A small home for a village", h: 6 },
    { id: "sabldarcade", file: "bld-arcade", cat: "building", name: "Neon Arcade Tower", line: "Three floors of glowing signs", h: 14 },
    { id: "sabldcastle", file: "bld-castle", cat: "building", name: "Crystal Castle", line: "Towers of shining crystal", h: 16 },
    { id: "sanatoak", file: "nat-oak", cat: "nature", free: true, name: "Round Oak", line: "A friendly round tree", h: 6 },
    { id: "sanatsakura", file: "nat-sakura", cat: "nature", name: "Cherry Blossom", line: "Pink petals in full bloom", h: 6.5 },
    { id: "sanatshroom", file: "nat-mushrooms", cat: "nature", name: "Glow Mushrooms", line: "A cluster that lights the night", h: 3 },
    { id: "sabgisland", file: "bg-island", cat: "background", free: true, name: "Floating Island", line: "Grass, rocks and a waterfall edge", h: 10 },
    { id: "sabgskyline", file: "bg-skyline", cat: "background", name: "Neon Skyline", line: "A block of glowing towers for the horizon", h: 24 },
    { id: "sabgvolcano", file: "bg-volcano", cat: "background", name: "Lava Volcano", line: "A mountain with a burning heart", h: 22 },
    { id: "sastbridge", file: "st-bridge", cat: "structure", free: true, name: "Plank Bridge", line: "Wooden planks across a gap", h: 3 },
    { id: "sastportal", file: "st-portal", cat: "structure", name: "Portal Gate", line: "A sci-fi ring with a glowing centre", h: 7 },
    { id: "sastlight", file: "st-lighthouse", cat: "structure", name: "Lighthouse", line: "A beacon at the top", h: 14 },
  ],
};
export const storeItem = (id) => STORE.ITEMS.find((x) => x.id === id) || null;
export const isStoreId = (id) => /^sa[a-z]+$/.test(String(id || "")) && !!storeItem(id);
export const storeGlb = (it, ver = "") => `/models/studio/store/${it.file}.glb${ver}`;
export const storeImg = (it, ver = "") => `/images/studio/store/${it.file}.webp${ver}`;
