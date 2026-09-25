/* global ethers, CONFIG, ARC, ARC_FACTORY_ABI, readProvider, openArcCoin, arcAvatarBg, fmtUsd */
// arc-search.js — ArcPad search that understands contract addresses and
// remembers what you looked at:
//   • paste a coin's contract address (either search box) → its page opens
//   • $ARCIRCLE's address → the $ARCIRCLE page
//   • focusing an empty box shows the coins you viewed recently
//   • typing in the top bar shows the best matches as you type
// Recently viewed lives in this browser only (localStorage).
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const ARCIRCLE = String((typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "").toLowerCase(); // "" while not live
  const KEY = "arcpad.recent.v1";
  const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(s);
  const safeImg = (u) => /^https?:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u || "");

  // ---------- recently viewed ----------
  function recent() { try { return (JSON.parse(localStorage.getItem(KEY) || "[]") || []).filter((r) => r && isAddr(r.t)); } catch { return []; } }
  function remember(token) {
    if (!isAddr(token)) return;
    const list = [{ t: lc(token), at: Date.now() }].concat(recent().filter((r) => r.t !== lc(token))).slice(0, 8);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  }
  if (typeof openArcCoin === "function") {
    const orig = openArcCoin;
    const wrapped = function (token) { remember(token); return orig.apply(this, arguments); };
    // eslint-disable-next-line no-global-assign
    openArcCoin = wrapped;
    window.openArcCoin = wrapped;
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "arcircle") remember(ARCIRCLE); });

  // ---------- going to an address ----------
  async function isLaunch(addr) {
    if (ARC.launches.some((l) => lc(l.token) === lc(addr))) return true;
    try {
      const f = new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ARC_FACTORY_ABI, readProvider());
      return Number(await f.launchIndexOf(addr)) > 0;
    } catch { return false; }
  }
  async function goAddress(addr, input) {
    if (lc(addr) === ARCIRCLE) { remember(ARCIRCLE); done(input); if (window.arcpadShowTab) window.arcpadShowTab("arcircle"); return true; }
    if (await isLaunch(addr)) { done(input); openArcCoin(addr); return true; }
    return false;
  }
  function done(input) {
    input.value = "";
    input.blur();
    hide();
    const ex = $("ap-explore-search");
    if (ex && ex.value) { ex.value = ""; if (typeof renderArcpadExploreGrid === "function") renderArcpadExploreGrid(); }
  }

  // ---------- dropdown ----------
  const pop = document.createElement("div");
  pop.className = "srch-pop"; pop.hidden = true; pop.setAttribute("role", "listbox");
  document.body.appendChild(pop);
  let owner = null, sel = -1, items = [];
  function place() {
    if (!owner) return;
    const r = owner.getBoundingClientRect();
    pop.style.left = `${Math.max(8, r.left)}px`;
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.width = `${Math.min(window.innerWidth - 16, Math.max(r.width, 300))}px`;
  }
  function hide() { pop.hidden = true; owner = null; sel = -1; }
  function row(it, k) {
    const l = it.l;
    const logo = it.core ? `<img src="images/arcircle-mark-sm.png" alt="">`
      : l && safeImg(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="">`
      : `<span class="srch-ph" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(it.t) : ""}">${esc(((l && l.symbol) || "?").slice(0, 1).toUpperCase())}</span>`;
    const sym = it.core ? "$ARCIRCLE" : l ? `$${esc(l.symbol)}` : `${it.t.slice(0, 6)}…${it.t.slice(-4)}`;
    const sub = it.core ? "Core coin" : l ? esc(l.name) : "ArcPad coin";
    const right = it.core ? "" : l && l.marketCapUsd != null && typeof fmtUsd === "function" ? `${fmtUsd(l.marketCapUsd)}` : "";
    return `<button type="button" class="srch-item${k === sel ? " on" : ""}" data-k="${k}" role="option">${logo}<span class="srch-who"><b>${sym}</b><small>${sub}</small></span><span class="srch-mc">${right}</span></button>`;
  }
  function show(input, { head, list, note }) {
    owner = input; items = list; sel = list.length ? Math.min(Math.max(sel, 0), list.length - 1) : -1;
    if (!list.length && !note) { hide(); return; }
    pop.innerHTML = (head ? `<div class="srch-head">${head}</div>` : "") + list.map(row).join("") + (note ? `<div class="srch-note">${note}</div>` : "");
    pop.hidden = false;
    place();
  }
  const itemFor = (t) => (lc(t) === ARCIRCLE ? { t: ARCIRCLE, core: true } : { t: lc(t), l: ARC.launches.find((x) => lc(x.token) === lc(t)) || null });
  function update(input) {
    const q = input.value.trim();
    if (!q) {
      const r = recent().map((x) => itemFor(x.t));
      show(input, { head: r.length ? `Recently viewed <button type="button" class="srch-clear">Clear</button>` : "", list: r });
      return;
    }
    if (isAddr(q)) {
      const it = itemFor(q);
      show(input, it.core || it.l ? { head: "Contract address", list: [it] } : { list: [], note: "Checking this address on ArcPad…" });
      return;
    }
    if (input.id === "ap-explore-search") { hide(); return; } // the grid below already filters
    const s = q.toLowerCase().replace(/^\$/, "");
    const hits = ARC.launches.filter((l) => l.symbol.toLowerCase().includes(s) || l.name.toLowerCase().includes(s) || (s.startsWith("0x") && lc(l.token).startsWith(s)))
      .sort((a, b) => (a.symbol.toLowerCase() === s ? -1 : 0) - (b.symbol.toLowerCase() === s ? -1 : 0) || (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1))
      .slice(0, 6).map((l) => ({ t: lc(l.token), l }));
    if ("arcircle".includes(s) && s.length >= 2) hits.unshift({ t: ARCIRCLE, core: true });
    show(input, { head: hits.length ? "Coins" : "", list: hits.slice(0, 6), note: hits.length ? "" : "No coins match — paste a contract address to open one directly." });
  }
  function choose(k) {
    const it = items[k];
    if (!it || !owner) return;
    const input = owner;
    if (it.core) { remember(ARCIRCLE); done(input); if (window.arcpadShowTab) window.arcpadShowTab("arcircle"); return; }
    done(input); openArcCoin(it.t);
  }
  pop.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
  pop.addEventListener("click", (e) => {
    if (e.target.closest(".srch-clear")) { try { localStorage.removeItem(KEY); } catch { /* fine */ } if (owner) update(owner); return; }
    const b = e.target.closest(".srch-item");
    if (b) choose(Number(b.dataset.k));
  });

  function wire(input) {
    if (!input) return;
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    let pending = 0;
    const onChange = async () => {
      update(input);
      const q = input.value.trim();
      if (isAddr(q)) {
        const my = ++pending;
        const ok = await goAddress(q, input);
        if (!ok && my === pending && input.value.trim() === q) {
          show(input, { list: [], note: `Not an ArcPad coin. <a href="${CONFIG.BLOCK_EXPLORER}/address/${esc(q)}" target="_blank" rel="noopener">Open on ArcScan ↗</a>` });
        }
      }
    };
    input.addEventListener("input", onChange);
    input.addEventListener("focus", () => update(input));
    input.addEventListener("blur", () => setTimeout(() => { if (owner === input && document.activeElement !== input) hide(); }, 120));
    input.addEventListener("keydown", (e) => {
      if (pop.hidden || owner !== input) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        pop.querySelectorAll(".srch-item").forEach((b, k) => b.classList.toggle("on", k === sel));
      } else if (e.key === "Enter" && sel >= 0 && input.id !== "ap-explore-search") { e.preventDefault(); choose(sel); }
      else if (e.key === "Enter" && input.id === "ap-explore-search" && !input.value.trim() && sel >= 0) { e.preventDefault(); choose(sel); }
      else if (e.key === "Escape") hide();
    });
  }
  const top = $("ap-topbar-search"), ex = $("ap-explore-search");
  if (top) top.placeholder = "Search coins or paste a contract address…";
  if (ex) ex.placeholder = "Search by name, ticker or contract address…";
  wire(top); wire(ex);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  document.addEventListener("arcpad:tab", hide);
})();
