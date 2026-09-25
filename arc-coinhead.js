// arc-coinhead.js — the coin page header on phones.
// Copy / Watch / Share shrink to icons, and everything else that lands in the
// address row (ArcScan, Edit coin info, Lock tokens, …) moves into one "···"
// menu, so the header stays on two lines however many creator tools appear.
// The menu is built from the real buttons each time it opens, so it always
// matches what the desktop row shows.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-coin");
  const row = panel && panel.querySelector(".ac2-ca-row");
  if (!row) return;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const ICON = {
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>',
  };
  // [source element id, label, icon source] — the icon is copied from the
  // source button when it has one.
  const ITEMS = [
    ["apc-scan-link", "View on ArcScan", ICON.scan],
    ["apc-edit", "Edit coin info", null],
    ["apc-lockbtn", "Lock tokens", null],
  ];
  const wrap = document.createElement("div");
  wrap.className = "apc-more";
  wrap.innerHTML = `<button type="button" class="ac2-chip-btn apc-ic apc-more-btn" aria-haspopup="menu" aria-expanded="false" aria-label="More">${ICON.more}</button>
    <div class="apc-more-menu" role="menu" hidden></div>`;
  row.appendChild(wrap);
  const btn = wrap.querySelector(".apc-more-btn"), menu = wrap.querySelector(".apc-more-menu");

  function build() {
    menu.innerHTML = "";
    for (const [id, label, icon] of ITEMS) {
      const src = document.getElementById(id);
      if (!src || src.hidden) continue;
      const it = document.createElement(src.tagName === "A" ? "a" : "button");
      if (src.tagName === "A") { it.href = src.href; it.target = "_blank"; it.rel = "noopener"; } else it.type = "button";
      it.setAttribute("role", "menuitem");
      it.className = "apc-more-item" + (id === "apc-lockbtn" ? " is-lock" : id === "apc-edit" ? " is-edit" : "");
      const svg = icon || (src.querySelector("svg") ? src.querySelector("svg").outerHTML : "");
      it.innerHTML = `${svg}<span>${tr(label)}</span>`;
      if (src.tagName !== "A") it.addEventListener("click", () => { close(true); src.click(); });
      else it.addEventListener("click", () => close());
      menu.appendChild(it);
    }
    return menu.children.length;
  }
  function open() {
    if (!build()) return;
    menu.hidden = false; btn.setAttribute("aria-expanded", "true"); wrap.classList.add("open");
    requestAnimationFrame(() => { const f = menu.querySelector(".apc-more-item"); if (f) f.focus(); });
  }
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true; btn.setAttribute("aria-expanded", "false"); wrap.classList.remove("open");
    if (refocus) btn.focus();
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); if (menu.hidden) open(); else close(); });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll(".apc-more-item")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Tab") close();
  });
  // Hide the "···" button when there's nothing to put in it (e.g. no creator
  // tools and ArcScan is already visible).
  const sync = () => {
    const any = ITEMS.some(([id]) => { const el = document.getElementById(id); return el && !el.hidden; });
    if (wrap.hidden === any) wrap.hidden = !any;
  };
  new MutationObserver(sync).observe(row, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("arcpad:tab", () => close());
  sync();
})();
