// arc-glyph.js — ♾ drawn as the brand's own infinity mark.
// Token symbols can be emoji, and "♾" / "♾️" looks different on every phone (a purple box, a thin
// white glyph, a coloured sticker). Wherever it shows up in the page's text — a ticker, a receipt,
// a table — it's swapped for one small inline SVG in the ARCIRCLE gradient, so it reads the same
// everywhere. Inputs, textareas and copied values keep the character itself.
(function () {
  "use strict";
  if (window.arcGlyph) return;
  var RE = /♾️?/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, NOSCRIPT: 1, TITLE: 1 };
  var PATH = "M50 25c-9-11-15-16-24-16a16 16 0 0 0 0 32c9 0 15-5 24-16s15-16 24-16a16 16 0 0 1 0 32c-9 0-15-5-24-16z";
  function defs() {
    if (document.getElementById("ax-inf-defs")) return;
    var d = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    d.id = "ax-inf-defs"; d.setAttribute("width", "0"); d.setAttribute("height", "0"); d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    d.innerHTML = '<defs><linearGradient id="axInfG" x1="0" x2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>';
    document.body.appendChild(d);
  }
  function mark() {
    var s = document.createElement("span");
    s.className = "ax-glyph"; s.setAttribute("role", "img"); s.setAttribute("aria-label", "♾");
    s.innerHTML = '<svg viewBox="0 0 100 50" aria-hidden="true"><path d="' + PATH + '"/></svg>';
    return s;
  }
  function swap(node) {
    var t = node.nodeValue, m, frag = null;
    while ((m = RE.exec(t))) {
      frag = frag || document.createDocumentFragment();
      if (m.index) frag.appendChild(document.createTextNode(t.slice(0, m.index)));
      frag.appendChild(mark());
      t = t.slice(m.index + m[0].length);
    }
    if (!frag) return;
    if (t) frag.appendChild(document.createTextNode(t));
    node.parentNode.replaceChild(frag, node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (RE.test(root.nodeValue) && root.parentNode && !SKIP[root.parentNode.nodeName] && !root.parentNode.isContentEditable) swap(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] || !RE.test(root.textContent || "")) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { var p = n.parentNode; return !p || SKIP[p.nodeName] || p.isContentEditable || !RE.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; },
    });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(swap);
  }
  var queue = [], queued = false;
  function flush() { queued = false; var q = queue; queue = []; defs(); q.forEach(scan); }
  function start() {
    defs(); scan(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === "characterData") queue.push(m.target);
        else for (var i = 0; i < m.addedNodes.length; i++) queue.push(m.addedNodes[i]);
      });
      if (queue.length && !queued) { queued = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.arcGlyph = { scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
