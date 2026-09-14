// bigpad.js — BigPad page interactivity. Currently just tab-switching
// between the sidebar sections; there is no live contract call anywhere
// in this file. The fund-pooling/auction/vote/vesting mechanism described
// on the page is a design, not a deployed contract — see the "Safety
// design" panel for why that's deliberate.

(() => {
  const items = document.querySelectorAll(".bp-nav-item");
  const panels = document.querySelectorAll(".bp-panel");

  items.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      items.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => p.classList.toggle("active", p.id === `bp-panel-${tab}`));
      document.querySelector(".bp-content").scrollTo({ top: 0, behavior: "smooth" });
      // On narrow screens the sidebar is a horizontal scroller above the
      // content — bring the tapped tab into view in case it's off-screen.
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  });
})();
