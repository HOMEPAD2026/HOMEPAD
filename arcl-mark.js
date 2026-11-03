// arcl-mark.js — the ARCL logo next to every ARCL amount (the owner, 2026-11-03: "게임, 모든 곳에도 arcl 로고 반영"):
// any text like "+500 ARCL", "3,000 ARCL a run", "Buy for 1,500 ARCL", "500 / 350 ARCL" gets the coin (images/arcl2-64.png)
// in front of the word ARCL — in the game (play.html), /game, /studio, /coins and /agents, including windows that open
// later (a MutationObserver, batched once a frame). Only a number followed by ARCL in the same text is marked, so labels
// ("ARCL Exchange") and places that already draw the coin are left alone. Skips inputs, code, SVG and [data-no-arcl].
(function () {
  "use strict";
  if (window.arclMark) return;
  var SRC = "/images/arcl2-64.png";
  var RE = /(\d[\d,.]*\s?(?:[kKmM](?![a-z]))?\s?(?:\/\s?)?)(\$?ARCL)(?![A-Za-z])/;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, CODE: 1, PRE: 1, TITLE: 1, NOSCRIPT: 1, CANVAS: 1 };
  function skipEl(el) {
    for (var e = el, n = 0; e && e.nodeType === 1 && n < 30; e = e.parentElement, n++) {
      if (SKIP[e.tagName] || e.namespaceURI === "http://www.w3.org/2000/svg" || e.isContentEditable) return true;
      if (e.classList && e.classList.contains("arcl-tok")) return true;
      if (e.hasAttribute && e.hasAttribute("data-no-arcl")) return true;
    }
    return false;
  }
  // the coin is already drawn right before this text (an <img> of the ARCL coin as the previous sibling)
  function hasCoin(node) { var p = node.previousSibling; for (var i = 0; p && i < 2; p = p.previousSibling, i++) { if (p.nodeType === 1 && p.tagName === "IMG" && /arcl/i.test(p.getAttribute("src") || "")) return true; if (p.nodeType === 3 && p.nodeValue.trim()) break; } return false; }
  function markText(tn) {
    var s = tn.nodeValue; if (!s || s.indexOf("ARCL") < 0 || !RE.test(s)) return;
    var el = tn.parentElement; if (!el || skipEl(el)) return;
    // a text we split before was rewritten in place (node.nodeValue = "…ARCL"): the old coin + word after it is stale
    var nx = tn.nextSibling; if (nx && nx.nodeType === 1 && nx.classList && nx.classList.contains("arcl-tok")) nx.remove();
    var frag = document.createDocumentFragment(), rest = s, m, first = true;
    while ((m = RE.exec(rest))) {
      var cut = m.index + m[1].length;
      frag.appendChild(document.createTextNode(rest.slice(0, cut)));
      if (first && hasCoin(tn) && m.index === 0) frag.appendChild(document.createTextNode(m[2]));
      else { var sp = document.createElement("span"); sp.className = "arcl-tok"; var im = document.createElement("img"); im.src = SRC; im.alt = ""; im.setAttribute("aria-hidden", "true"); im.draggable = false; sp.appendChild(im); sp.appendChild(document.createTextNode(m[2])); frag.appendChild(sp); }
      rest = rest.slice(cut + m[2].length); first = false;
    }
    frag.appendChild(document.createTextNode(rest));
    tn.parentNode.replaceChild(frag, tn);
  }
  function mark(root) {
    if (!root) return;
    if (root.nodeType === 3) { markText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && skipEl(root)) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.nodeValue && n.nodeValue.indexOf("ARCL") >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } });
    var list = []; for (var n = w.nextNode(); n; n = w.nextNode()) list.push(n);
    list.forEach(markText);
  }
  var css = document.createElement("style");
  css.textContent = ".arcl-tok{white-space:nowrap}.arcl-tok img{display:inline-block;width:1.08em;height:1.08em;margin:0 .14em 0 .04em;vertical-align:-.2em;border-radius:50%;filter:drop-shadow(0 0 .12em rgba(60,203,255,.55));pointer-events:none}";
  (document.head || document.documentElement).appendChild(css);
  var queue = [], sched = false;
  function flush() { sched = false; var q = queue; queue = []; for (var i = 0; i < q.length; i++) if (q[i].isConnected) mark(q[i]); }
  function push(n) { queue.push(n); if (!sched) { sched = true; (window.requestAnimationFrame || setTimeout)(flush); } }
  function start() {
    mark(document.body);
    new MutationObserver(function (recs) { for (var i = 0; i < recs.length; i++) { var r = recs[i]; if (r.type === "characterData") push(r.target); else for (var j = 0; j < r.addedNodes.length; j++) { var a = r.addedNodes[j]; if (a.nodeType === 1 && a.classList && a.classList.contains("arcl-tok")) continue; push(a); } } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  window.arclMark = { re: RE, mark: mark };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
