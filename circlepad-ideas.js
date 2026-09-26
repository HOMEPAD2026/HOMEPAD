/* global state, ethers, connectWallet, cpToast, cpErrText, CONFIG, govOptionHtml, govLogoUrl, govDate, govFmtDate */
// circlepad-ideas.js — the community's candidate ideas for Round #1's vote.
// Anyone with a wallet can suggest a name, ticker, logo, roadmap or launch
// date (a free signature, no transaction); everyone sees them and backs the
// ones they like; the recipient wallet can pull an idea straight into the
// candidates editor. Stored off-chain through /api/social (api/_circle.mjs);
// the signed messages below must match that file byte for byte.
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS || !CONFIG.CIRCLEPAD_VOTE_ADDRESS) return;
  const host = document.getElementById("gv-ideas");
  if (!host) return;
  const API = "/api/social";
  const ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS.toLowerCase();
  const CATS = ["name", "ticker", "logo", "roadmap", "date"];
  const LABEL = ["Coin name", "Ticker", "Logo", "Roadmap", "Launch date"];
  const MAX = [32, 10, 300, 400, 30];
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toast = (m, k) => (typeof cpToast === "function" ? cpToast(tr(m), k) : console.log(m));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const ago = (ms) => { const s = Math.max(1, Math.floor((Date.now() - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const me = () => (state && state.account ? lc(state.account) : null);
  const kec = (t) => ethers.keccak256(ethers.toUtf8Bytes(String(t)));

  // ---- messages: identical to api/_circle.mjs ----
  const ideaMessage = (wallet, cat, text, note, issued) => `ARCIRCLE PAD — CirclePad idea\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nCategory: ${CATS[cat]}\nIssued: ${issued}\nContent: ${kec(JSON.stringify([text, note]))}`;
  const upMessage = (wallet, id) => `ARCIRCLE PAD — back a CirclePad idea\nIdea: ${id}\nWallet: ${lc(wallet)}`;
  const hideMessage = (wallet, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide idea: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

  let D = { ideas: [], myUps: [] }, loaded = false, off = false;
  let tab = 0, formKey = "", busy = false, open = false;
  const SHOW = 8; const more = new Set(); // categories showing every idea
  const gov = () => window.circlepadGov || null;
  const published = (cat) => { const g = gov(); return !!(g && g.categories && g.categories[cat] && g.categories[cat].set); };
  const allPublished = () => [0, 1, 2, 3, 4].every(published);
  const isRecipient = () => { const g = gov(); return !!(me() && g && g.recipient && lc(g.recipient) === me()); };
  // an idea "made the ballot" when the recipient published the same text
  const onBallot = (i) => {
    const g = gov(); const c = g && g.categories && g.categories[i.cat];
    if (!c || !c.set) return false;
    const norm = (t) => lc(String(t).replace(/^\$/, "").trim());
    return c.options.some((o) => norm(o.text) === norm(i.text));
  };

  async function load() {
    try {
      const r = await fetch(`${API}?circle=ideas${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!j || j.enabled === false) { off = true; render(); return; }
      if (Array.isArray(j.ideas)) { D = { ideas: j.ideas, myUps: j.myUps || [] }; loaded = true; }
    } catch (e) { /* keep what we have */ }
    render();
  }

  async function wallet() {
    if (!state.account || !state.signer) { if (typeof connectWallet === "function") await connectWallet(); }
    return state.account && state.signer ? me() : null;
  }
  // build the message only once the wallet is known
  async function sign(build) {
    const w = await wallet();
    return w ? state.signer.signMessage(build(w)) : null;
  }
  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }

  // ---- the form, per category ----
  function inputHtml(cat) {
    const k = CATS[cat];
    if (k === "roadmap") return `<textarea id="gvi-text" rows="3" maxlength="${MAX[cat]}" placeholder="${esc(tr("Phase 1 — what gets built first"))}"></textarea>`;
    if (k === "date") return `<input id="gvi-text" type="datetime-local">`;
    if (k === "logo") return `<input id="gvi-text" type="url" maxlength="${MAX[cat]}" placeholder="${esc(tr("https://… or ipfs://… (square image)"))}"><label class="gvi-up"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="gvi-file"><span>Upload</span></label><span class="gv-ed-prev" id="gvi-prev"></span>`;
    return `<input id="gvi-text" type="text" maxlength="${MAX[cat]}" placeholder="${k === "ticker" ? "TICKER" : esc(tr("Coin name"))}"${k === "ticker" ? ' autocapitalize="characters" spellcheck="false"' : ""}>`;
  }
  function formHtml(cat) {
    if (off) return `<p class="gvi-closed">Ideas aren't switched on right now.</p>`;
    if (published(cat)) return `<p class="gvi-closed">The candidates for this one are on the ballot, so new ideas are closed.</p>`;
    return `<div class="gvi-form">
      <div class="gvi-row">${inputHtml(cat)}</div>
      <input id="gvi-note" type="text" maxlength="140" placeholder="${esc(tr("Why this one? (optional)"))}">
      <div class="gvi-foot"><small>Free — you sign with your wallet, no transaction. Up to 5 ideas a day.</small>
        <button type="button" class="bp-btn-primary" id="gvi-go">Suggest</button></div>
    </div>`;
  }
  function readForm(cat) {
    const el = document.getElementById("gvi-text");
    let v = el ? el.value.trim() : "";
    if (CATS[cat] === "ticker") v = v.replace(/^\$/, "").toUpperCase();
    if (CATS[cat] === "date" && v) { const d = new Date(v); v = isNaN(d) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
    const note = (document.getElementById("gvi-note") || {}).value || "";
    return { text: v, note: note.trim() };
  }
  function check(cat, t) {
    if (!t) return "Write your idea first.";
    if (CATS[cat] === "ticker" && !/^[A-Z0-9]{1,10}$/.test(t)) return "Tickers use letters and numbers only, up to 10.";
    if (CATS[cat] === "logo" && !govLogoUrl(t)) return "Each logo needs an https:// or ipfs:// image link.";
    if (CATS[cat] === "roadmap" && t.length < 10) return "Describe the plan in at least 10 characters.";
    if (CATS[cat] === "date") { const d = govDate(t); if (!d) return "Pick a date and time for each candidate."; if (d.getTime() < Date.now()) return "Launch dates need to be in the future."; }
    return null;
  }

  // ---- the list ----
  function listHtml(cat) {
    const list = D.ideas.filter((i) => i.cat === cat).sort((a, b) => b.up - a.up || a.at - b.at);
    if (!loaded) return `<div class="bp-empty">Loading…</div>`;
    if (!list.length) return `<div class="bp-empty">${published(cat) ? "No ideas were posted for this one." : "No ideas yet — be the first."}</div>`;
    const rec = isRecipient() && !published(cat);
    const shown = more.has(cat) ? list : list.slice(0, SHOW);
    const rest = list.length - shown.length;
    return shown.map((i, n) => {
      const mine = D.myUps.includes(i.id);
      return `<div class="gvi-item${onBallot(i) ? " ballot" : ""}" data-id="${esc(i.id)}">
        <span class="gvi-rank" data-no-i18n>${n + 1}</span>
        <div class="gvi-body">
          <div class="gvi-text" data-no-i18n>${govOptionHtml(CATS[cat], i.text)}</div>
          ${i.note ? `<p class="gvi-note" data-no-i18n>${esc(i.note)}</p>` : ""}
          <div class="gvi-meta"><span class="cp-av" style="--h:${hue(i.wallet)};--s:16px" aria-hidden="true"></span><span data-no-i18n>${esc(short(i.wallet))}</span>${i.team ? `<span class="gvi-team">Team</span>` : ""}<span data-no-i18n>· ${ago(i.at)}</span>${onBallot(i) ? `<span class="gvi-ok">On the ballot</span>` : ""}</div>
        </div>
        <div class="gvi-acts">
          <button type="button" class="gvi-up-btn${mine ? " on" : ""}" data-up="${esc(i.id)}" ${mine ? "disabled" : ""} aria-label="${esc(tr("Back this idea"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 8h-4.5v6h-5v-6H5z"/></svg><b data-no-i18n>${i.up}</b></button>
          ${rec ? `<button type="button" class="gvi-use" data-use="${esc(i.id)}">Use</button><button type="button" class="gvi-hide" data-hide="${esc(i.id)}" aria-label="${esc(tr("Hide"))}">Hide</button>` : ""}
        </div>
      </div>`;
    }).join("") + (rest > 0 ? `<button type="button" class="gvi-more" data-more="${cat}"><span>Show all</span> <b data-no-i18n>${list.length}</b></button>` : "");
  }

  function render() {
    const g = gov();
    const phaseRaise = !g || !g.votingOpen && !(Number(g.votingEnds || 0) && Math.floor(Date.now() / 1000) >= Number(g.votingEnds));
    const counts = [0, 1, 2, 3, 4].map((c) => D.ideas.filter((i) => i.cat === c).length);
    const total = counts.reduce((a, b) => a + b, 0);
    // once the ballot is set the board folds away — still one tap to read
    const folded = allPublished() && !open;
    host.classList.toggle("folded", folded);
    if (!host.querySelector(".gvi-head")) {
      host.innerHTML = `<div class="gvi-head"><div><small class="gv-k">Community ideas</small><h3>Suggest a candidate</h3><p>Anyone can suggest a name, ticker, logo, roadmap or launch date. Back the ones you like — the recipient picks the candidates from here.</p></div><button type="button" class="gvi-toggle" id="gvi-toggle"></button></div>
        <div class="gvi-tabs" role="tablist"></div><div class="gvi-formwrap"></div><div class="gvi-list"></div>`;
    }
    const tgl = host.querySelector("#gvi-toggle");
    tgl.hidden = !allPublished();
    tgl.innerHTML = `<span data-no-i18n>${total}</span> <span>${folded ? "Show ideas" : "Hide ideas"}</span>`;
    host.querySelector(".gvi-tabs").innerHTML = LABEL.map((l, i) => `<button type="button" role="tab" aria-selected="${i === tab}" class="${i === tab ? "on" : ""}${published(i) ? " set" : ""}" data-tab="${i}"><span>${esc(tr(l))}</span><b data-no-i18n>${counts[i]}</b></button>`).join("");
    const fk = `${tab}|${published(tab)}|${off}|${phaseRaise}`;
    if (fk !== formKey) { formKey = fk; host.querySelector(".gvi-formwrap").innerHTML = formHtml(tab); }
    host.querySelector(".gvi-list").innerHTML = listHtml(tab);
  }

  // ---- logo upload (the same image host ArcPad launches use) ----
  async function upload(file) {
    if (!file) return null;
    if (file.size > 4e6) { toast("That image is larger than 4 MB.", "bad"); return null; }
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logo", image: data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { toast(j.error || "Couldn't upload that image — try a link instead.", "bad"); return null; }
    return j.url;
  }
  window.circlepadUploadLogo = upload;

  host.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = Number(t.dataset.tab); render(); return; }
    if (e.target.closest("#gvi-toggle")) { open = !open; render(); return; }
    const mo = e.target.closest("[data-more]");
    if (mo) { more.add(Number(mo.dataset.more)); render(); return; }
    const up = e.target.closest("[data-up]");
    if (up && !busy) {
      busy = true;
      try {
        const id = up.dataset.up;
        const sig = await sign((w) => upMessage(w, id));
        if (!sig) return;
        const r = await post({ action: "cidea-up", wallet: me(), id, signature: sig });
        if (r.ok || r.j.already) { if (!D.myUps.includes(id)) D.myUps.push(id); const it = D.ideas.find((x) => x.id === id); if (it && r.ok) it.up = r.j.up; render(); }
        else toast(r.j.error || "Couldn't back that idea.", "bad");
      } catch (err) { toast(typeof cpErrText === "function" ? cpErrText(err, "Signing was cancelled.") : "Signing was cancelled.", "bad"); }
      finally { busy = false; }
      return;
    }
    const use = e.target.closest("[data-use]");
    if (use) {
      const it = D.ideas.find((x) => x.id === use.dataset.use);
      if (it && typeof window.circlepadGovUseIdea === "function") window.circlepadGovUseIdea(it.cat, it.text);
      return;
    }
    const hd = e.target.closest("[data-hide]");
    if (hd && !busy) {
      busy = true;
      try {
        const issued = new Date().toISOString();
        const sig = await sign((w) => hideMessage(w, hd.dataset.hide, issued));
        if (!sig) return;
        const r = await post({ action: "chide", kind: "idea", wallet: me(), id: hd.dataset.hide, issued, signature: sig });
        if (r.ok) { D.ideas = D.ideas.filter((x) => x.id !== hd.dataset.hide); render(); toast("Hidden.", "ok"); }
        else toast(r.j.error || "Couldn't hide that.", "bad");
      } catch (err) { toast("Signing was cancelled.", "bad"); }
      finally { busy = false; }
      return;
    }
    if (e.target.closest("#gvi-go") && !busy) {
      const cat = tab;
      const f = readForm(cat);
      const bad = check(cat, f.text);
      if (bad) { toast(bad, "bad"); return; }
      const btn = document.getElementById("gvi-go");
      busy = true; if (btn) { btn.disabled = true; btn.textContent = tr("Sign in wallet…"); }
      try {
        const issued = new Date().toISOString();
        const sig = await sign((w) => ideaMessage(w, cat, f.text, f.note, issued));
        if (!sig) return;
        const r = await post({ action: "cidea", wallet: me(), cat, text: f.text, note: f.note, issued, signature: sig });
        if (r.ok) {
          toast("Idea posted — thanks.", "ok");
          formKey = ""; // fresh, empty form
          await load();
          const row = host.querySelector(`.gvi-item[data-id="${r.j.id}"]`);
          if (row) { row.classList.add("new"); row.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        } else if (r.j.dup) {
          toast(r.j.error, "bad");
          await load();
          const row = host.querySelector(`.gvi-item[data-id="${r.j.id}"]`);
          if (row) { row.classList.add("new"); row.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        } else toast(r.j.error || "Couldn't post that idea.", "bad");
      } catch (err) { toast(typeof cpErrText === "function" ? cpErrText(err, "Signing was cancelled.") : "Signing was cancelled.", "bad"); }
      finally { busy = false; const b2 = document.getElementById("gvi-go"); if (b2) { b2.disabled = false; b2.textContent = tr("Suggest"); } }
    }
  });
  host.addEventListener("input", (e) => {
    if (e.target.id === "gvi-text" && CATS[tab] === "ticker") { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9$]/g, ""); if (v !== e.target.value) e.target.value = v; }
    if (e.target.id === "gvi-text" && CATS[tab] === "logo") { const u = govLogoUrl(e.target.value); const p = document.getElementById("gvi-prev"); if (p) p.innerHTML = u ? `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer">` : ""; }
  });
  host.addEventListener("change", async (e) => {
    if (e.target.id !== "gvi-file") return;
    const lab = e.target.closest(".gvi-up"); if (lab) lab.classList.add("busy");
    const url = await upload(e.target.files && e.target.files[0]).catch(() => null);
    if (lab) lab.classList.remove("busy");
    if (!url) return;
    const inp = document.getElementById("gvi-text");
    if (inp) { inp.value = url; inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });

  window.circlepadIdeas = {
    open(cat) { tab = cat; open = true; render(); host.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => { const i = document.getElementById("gvi-text"); if (i) i.focus({ preventScroll: true }); }, 400); },
    reload: load,
    get data() { return D; },
  };
  document.addEventListener("circlepad:gov", () => render());
  document.addEventListener("arc:lang", () => { formKey = ""; render(); });
  let lastMe = me();
  setInterval(() => {
    if (me() !== lastMe) { lastMe = me(); load(); return; }
    const panel = document.getElementById("bp-panel-governance");
    if (panel && panel.offsetParent !== null && !document.hidden) load();
  }, 30000);
  // a wallet connecting mid-visit: its own "backed" marks
  const origRefresh = typeof window.refreshAccountDependentViews === "function" ? window.refreshAccountDependentViews : null;
  if (origRefresh) {
    // eslint-disable-next-line no-global-assign
    window.refreshAccountDependentViews = function () { origRefresh.apply(this, arguments); if (me() !== lastMe) { lastMe = me(); load(); } };
  }
  render();
  load();
})();
