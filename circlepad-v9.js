/* global CONFIG, state */
// circlepad-v9.js — CirclePad's round-aware copy, layout and motion (6 Oct 2026). Runs after every other CirclePad
// script (it only rearranges and decorates what they render; it never reads or writes the chain):
//   · copy that follows the round: the Airdrop tab and the Home governance card on a round with no vote (a plan
//     round such as Round #3 + #4's snapshot airdrop)
//   · layout: the round card's route ("Where your USDC goes") moves inside the card, the description folds on phones,
//     the card's badge follows the phase, empty numbers show a skeleton until they load
//   · motion: Round #3 and #4's rings merge once, a delivery step that turns done gets its stamp once, the numbers
//     under the round card bump when they change, and a contributor whose snapshot airdrop went out gets a card once.
// Every effect is skipped under prefers-reduced-motion; what each one shows is still there without it.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const GOV = () => (CONFIG.CIRCLEPAD_GOV || {})[N()] || {};
  const PLAN = () => CONFIG.CIRCLEPAD_ROUND_PLAN || null;
  const ALSO = () => (PLAN() && PLAN().also) || {};
  const DEL = () => (CONFIG.CIRCLEPAD_DELIVERY || {})[N()] || {};
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = () => window.matchMedia && matchMedia("(max-width: 900px)").matches;
  const R = () => (typeof _circlepadState !== "undefined" && _circlepadState) || null; // eslint-disable-line no-undef
  const RD = () => window.circlepadRound || null;
  const phase = () => (RD() ? RD().phase() : "pre");
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: the effect just repeats */ } },
  };
  const once = (k) => { const seen = store.get("cp9.once", []); if (seen.includes(k)) return false; store.set("cp9.once", [...seen, k].slice(-80)); return true; };

  // ================= copy that follows the round =================
  function copy() {
    const p = PLAN();
    if (!p) return;
    const b = p.buy || {}, a = p.also || {}, sym = "$" + (b.sym || "ARCIA"), r4 = a.round || N() + 1;
    // Airdrop tab: what this round's contributors get
    const lang = (window.arcI18n && window.arcI18n.get()) || "en";
    const ad = $("bp-panel-airdrop");
    const first = ad && ad.querySelector(".bp-simple > p");
    if (first && first.dataset.cp9 !== lang) {
      first.dataset.cp9 = lang;
      first.innerHTML = `<strong>${T("CirclePad airdrop")}</strong> — ${T(a.snapshot
        ? `every wallet in Round #${N()}'s raise is in the snapshot airdrop, by its share of the raise: ${sym} on ${b.chain || "Robinhood Chain"} and the Round #${r4} share on ${a.chain || "Solana"}. Round #2's contributors are included from Round #2's list. The contributor list at the close is public on-chain, so anyone can check who was in and how much.`
        : `every wallet in Round #${N()}'s raise gets ${sym} on ${b.chain || "Robinhood Chain"} and an allocation of Round #${r4}, by its share of the raise. The contributor list at the close is public on-chain.`)}`;
    }
    const note = $("cp-airdrop-note");
    if (note && a.snapshot && note.dataset.cp9 !== lang) { note.dataset.cp9 = lang; note.textContent = tr("Snapshot airdrop: the timing is announced here and on @arcircle_launch. More updates to follow."); }
    // Home: the governance card has nothing to vote on this round — say what the round does instead
    const list = document.querySelector("#bp-panel-home .bp-vote-list");
    if (list && list.dataset.cp9 !== lang) {
      list.dataset.cp9 = lang;
      list.classList.add("cp9-plan-list");
      const items = [`${sym} · ${b.chain || "Robinhood Chain"}`, `Round #${r4} · ${a.chain || "Solana"}`, a.snapshot ? "Snapshot airdrop" : "Two allocations"];
      list.innerHTML = items.map((t) => `<li>${T(t)}</li>`).join("");
      const head = list.closest(".bp-card") && list.closest(".bp-card").querySelector(".bp-card-head");
      if (head && head.firstChild && head.firstChild.nodeType === 3) head.firstChild.textContent = tr("This round") + " ";
    }
  }

  // ================= layout =================
  function layout() {
    const feat = $("bp-featured"), main = feat && feat.querySelector(".bp-featured-main");
    if (!feat || !main) return;
    feat.dataset.ph = phase();
    // the route ("Where your USDC goes") sits inside the round card, in the room under the description
    const route = $("cp5-route");
    if (route && route.parentElement !== main && main.classList.contains("cp-main")) { main.appendChild(route); main.classList.add("cp9-has-route"); }
    // phones: the description folds to three lines
    const desc = $("bp-featured-desc");
    if (desc && !desc.dataset.cp9) {
      desc.dataset.cp9 = "1";
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "cp9-more"; btn.hidden = true; btn.textContent = tr("Read more");
      btn.addEventListener("click", () => { const open = desc.classList.toggle("cp9-open"); btn.textContent = tr(open ? "Show less" : "Read more"); });
      desc.insertAdjacentElement("afterend", btn);
    }
    if (desc) {
      desc.classList.add("cp9-clamp");
      const btn = desc.nextElementSibling;
      if (btn && btn.classList.contains("cp9-more")) btn.hidden = !phone() || (!desc.classList.contains("cp9-open") && desc.scrollHeight <= desc.clientHeight + 4);
    }
    // numbers that haven't loaded yet: a shimmer instead of a dash
    const loaded = !!R();
    document.querySelectorAll("#bp-featured .bp-mini-stat strong").forEach((el) => el.classList.toggle("cp9-sk", !loaded && /^[—–-]?$/.test(el.textContent.trim())));
  }

  // ================= motion =================
  // Round #3 + #4: the two rings slide into one, once per browser (then they stay merged)
  let mergeIO = null;
  function merge() {
    const el = document.querySelector(".cp-merge");
    if (!el || el.dataset.cp9) return;
    el.dataset.cp9 = "1";
    const key = `merge:${N()}+${ALSO().round || ""}`;
    if (reduce() || !store.get("cp9.once", []).every((k) => k !== key)) { el.classList.add("done"); return; }
    if (!("IntersectionObserver" in window)) { el.classList.add("done"); return; }
    mergeIO = mergeIO || new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { mergeIO.unobserve(x.target); once(key); x.target.classList.add("go"); } }), { threshold: 0.6 });
    mergeIO.observe(el);
  }
  // the delivery board: a step that turns done gets its stamp the first time this browser sees it done
  function stamps() {
    const seen = store.get("cp9.dl", {});
    let dirty = false;
    document.querySelectorAll(".cp-dl li[data-dl]").forEach((li) => {
      const k = li.dataset.dl, st = li.dataset.dlSt || "";
      if (seen[k] === st) return;
      if (st === "done" && seen[k] !== undefined && !reduce()) { li.classList.add("cp9-stamp"); setTimeout(() => li.classList.remove("cp9-stamp"), 1600); }
      seen[k] = st; dirty = true;
    });
    if (dirty) store.set("cp9.dl", seen);
  }
  // the numbers under the round card: a short bump when one changes
  const lastNum = new WeakMap();
  function bumps() {
    document.querySelectorAll("#bp-featured .bp-mini-stat strong, #bp-featured .bp-raised-big").forEach((el) => {
      const t = el.textContent.trim(), prev = lastNum.get(el);
      lastNum.set(el, t);
      if (prev === undefined || prev === t || /^[—–-]?$/.test(prev) || reduce()) return;
      el.classList.remove("cp9-bump"); void el.offsetWidth; el.classList.add("cp9-bump");
    });
  }
  // the snapshot airdrop went out and this wallet is on the round's list: a card once per wallet
  function arrived() {
    const a = ALSO(), d = DEL().drop;
    if (!a.snapshot || !d || d.status !== "done") return;
    const w = me(), rows = window.circlepadLbRows || [];
    if (!w || !rows.length || !rows.some((r) => String(r.address).toLowerCase() === w)) return;
    if (!once(`drop:${N()}:${w}`)) return;
    const EXPL = { rh: "https://robinhoodchain.blockscout.com/tx/", sol: "https://solscan.io/tx/", arc: "https://arc.etherscan.io/tx/" };
    const txs = (d.txs || []).filter((x) => x && x.hash).slice(0, 3).map((x) => `<a href="${esc((EXPL[x.chain] || EXPL.rh) + x.hash)}" target="_blank" rel="noopener" data-no-i18n>${esc(x.label || x.hash.slice(0, 10) + "…")} ↗</a>`).join("");
    const box = document.createElement("div");
    box.className = "cp9-arrived"; box.setAttribute("role", "status");
    box.innerHTML = `<i aria-hidden="true"></i><div><b>${T("Your snapshot airdrop went out")}</b><p>${T(`This wallet is on Round #${N()}'s list — its share was in the snapshot.`)}</p>${txs ? `<span class="cp9-arrived-tx">${txs}</span>` : ""}</div><button type="button" aria-label="${T("Close")}">×</button>`;
    box.querySelector("button").addEventListener("click", () => { box.classList.add("out"); setTimeout(() => box.remove(), 400); });
    document.body.appendChild(box);
    if (!reduce() && typeof window.arcConfetti === "function") window.arcConfetti({ count: 70 });
  }

  function tick() {
    try { copy(); layout(); merge(); stamps(); bumps(); arrived(); } catch (e) { console.warn("circlepad-v9", e); }
  }
  ["circlepad:state", "circlepad:lb", "arc:lang", "arc:wallet"].forEach((ev) => document.addEventListener(ev, () => setTimeout(tick, 60)));
  window.addEventListener("resize", () => { clearTimeout(tick.t); tick.t = setTimeout(tick, 150); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
  setInterval(() => { if (!document.hidden) tick(); }, 2000);
})();
