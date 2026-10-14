// world-itemart.js — item pictures from the official concept sheets (design/concept/): potions, materials, chests,
// coins and tools, cut out and packed in one sprite sheet, images/items/items.webp (4×4 cells of 128 px, made by
// tools/concept-art.py; IDS is that script's ITEMS order). The sheet is a CSS background, so it's only fetched the
// first time a panel draws one (never on the loading path). Bump V when the sheet changes.
const V = "1";
const IDS = ["hp", "sp", "recall", "scrap", "ore", "crystal", "wood", "chest", "box", "coin", "gem", "pickaxe", "axe", "token", "fish", "hammer"];
let styled = false;
function style() {
  if (styled || typeof document === "undefined") return; styled = true;
  const s = document.createElement("style");
  // the drop shadow lifts the pictures off the dark-blue slots; a chest already opened today goes grey
  // (!important: the panels style their own bare <i> dots, e.g. .wl-chip i, and the picture takes their place)
  s.textContent = `.wi-art{display:inline-block!important;flex:none;width:var(--wi)!important;height:var(--wi)!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;background-image:url("/images/items/items.webp?v=${V}")!important;background-repeat:no-repeat!important;background-size:400% 400%!important;vertical-align:middle;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));pointer-events:none}
.wr-fart .wi-art{filter:drop-shadow(0 6px 12px rgba(0,0,0,.45)) drop-shadow(0 0 10px var(--ic,transparent))}
.wr-fart.sup-hp{--ic:rgba(255,77,109,.45)}.wr-fart.sup-sp{--ic:rgba(56,184,255,.45)}.wr-fart.sup-recall{--ic:rgba(120,140,255,.45)}.wr-fart.sup-scrap{--ic:rgba(120,200,255,.3)}
.wr-res .wi-art{margin:-3px 2px 0 0}
.wl-mats .wi-art{margin-left:-6px}.wl-chip .wi-art{margin-left:-5px}
.wl-recipes li>.wi-art{margin-right:-2px}.wl-recipes li>div{flex:1;min-width:0}
.wl-mastery b .wi-art{margin:-4px 4px 0 0}
.wq-chest.done .wi-art{filter:grayscale(.7) brightness(.75)}`;
  document.head.appendChild(s);
}
export const has = (id) => IDS.includes(id);
/// an item's picture, size px square: <i class="wi-art"> (empty string for an id the sheet doesn't have)
export function art(id, size = 24, cls = "") {
  const i = IDS.indexOf(id); if (i < 0) return ""; style();
  return `<i class="wi-art${cls ? " " + cls : ""}" style="--wi:${size}px;background-position:${((i % 4) * 100) / 3}% ${(Math.floor(i / 4) * 100) / 3}%" aria-hidden="true"></i>`;
}
