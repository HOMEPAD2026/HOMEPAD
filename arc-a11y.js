// arc-a11y.js — keyboard support for every modal on the page.
// Whenever a dialog opens (coin editor, lock modal, trade modal, phone trade
// sheet, …) focus moves into it, Tab / Shift+Tab cycle inside it, Escape
// closes it, and when it closes focus goes back to the button that opened it.
// Dialogs are found by watching the DOM, so modals added later by any script
// get the same behaviour without extra wiring.
(function () {
  "use strict";
  // [selector for the open dialog box, selector for its close control]
  const KINDS = [
    [".cm-modal.in .cm-dialog", "[data-close].cm-x"],
    ["#msheet:not([hidden]) .msheet-panel", ".msheet-x"],
    [".modal-overlay:not(.hidden) > .ap-modal-box, .modal-overlay:not(.hidden) > .modal", ".ap-modal-close, .modal-close, [data-close]"],
  ];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const stack = []; // [{ box, closeSel, back }]
  function openDialogs() {
    const out = [];
    for (const [sel, closeSel] of KINDS) document.querySelectorAll(sel).forEach((box) => { if (visible(box)) out.push({ box, closeSel }); });
    return out;
  }
  const focusables = (box) => [...box.querySelectorAll(FOCUSABLE)].filter((el) => visible(el) && !el.closest("[hidden]"));
  function enter(d) {
    const box = d.box;
    if (!box.hasAttribute("role")) box.setAttribute("role", "dialog");
    if (!box.hasAttribute("aria-modal")) box.setAttribute("aria-modal", "true");
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
    d.back = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    stack.push(d);
    // Focus the first form field if there is one, otherwise the dialog itself
    // (so screen readers read its title), never the close button.
    requestAnimationFrame(() => {
      if (!box.isConnected || box.contains(document.activeElement)) return;
      const field = box.querySelector('input:not([type="hidden"]):not([disabled]),textarea:not([disabled])');
      (field && visible(field) && !matchMedia("(pointer:coarse)").matches ? field : box).focus({ preventScroll: true });
    });
  }
  function leave(d) {
    const i = stack.indexOf(d);
    if (i >= 0) stack.splice(i, 1);
    const back = d.back;
    if (back && back.isConnected && visible(back) && (!document.activeElement || document.activeElement === document.body || d.box.contains(document.activeElement) || !document.activeElement.isConnected)) {
      back.focus({ preventScroll: true });
    }
  }
  function sync() {
    const open = openDialogs();
    for (const d of stack.slice()) if (!open.some((o) => o.box === d.box)) leave(d);
    for (const o of open) if (!stack.some((d) => d.box === o.box)) enter(o);
  }
  let t = 0;
  new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(sync); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });

  // Escape runs after the dialog's own handlers (bubble phase), and only if
  // the dialog is still open by then.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    sync();
    const top = stack[stack.length - 1];
    if (!top || !top.box.isConnected) return;
    const c = top.box.querySelector(top.closeSel) || (top.box.parentElement && top.box.parentElement.querySelector(top.closeSel));
    if (c) { e.preventDefault(); c.click(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const top = stack[stack.length - 1];
    if (!top || !top.box.isConnected) return;
    const f = focusables(top.box);
    if (!f.length) { e.preventDefault(); top.box.focus(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!top.box.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && (a === first || a === top.box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);
})();
