// arcl-page.js — /arcl: a wallet's ARCL (ARCIRCLE World's in-game points), how to earn it, and the exchange to
// $ARCIRCLE, which isn't open yet (api/_world-shop.mjs EXCHANGE). Same screen as the game's ARCL Exchange.
import { exchangeHTML } from "./world-shop.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lang = () => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" ? l : "en"; } catch { return "en"; } };
const T = (s, v) => { let t = (lang() !== "en" && window.arcI18n && window.arcI18n.translate(s, lang())) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
const SESS = "arc.world.sess";
const sess = () => { try { const s = JSON.parse(localStorage.getItem(SESS) || "null"); return s && Date.now() - Date.parse(s.issued) < 23.5 * 3600e3 ? s : null; } catch { return null; } };
const AC = () => window.arcConnect;
const wallet = () => { const s = sess(); if (s) return s.wallet; const a = AC() && AC().address && AC().address(); return a ? a.toLowerCase() : ""; };

async function paint() {
  const w = wallet();
  let d = null, top = null;
  try {
    const [a, b] = await Promise.all([w ? fetch("/api/social?world=arcl&wallet=" + w).then((r) => (r.ok ? r.json() : null)) : null, fetch("/api/social?world=arcl-top").then((r) => (r.ok ? r.json() : null))]);
    d = a && !a.error ? a : null; top = b;
  } catch { /* offline */ }
  $("arcl-mount").innerHTML = exchangeHTML(d, top, { T, esc, signedIn: !!sess() }) + (sess() ? "" : `<p class="wa-empty">${esc(w ? T("Sign in from inside ARCIRCLE World to turn on notifications.") : T("Connect a wallet to see its ARCL."))}</p>`);
  const nt = $("wa-notify");
  if (nt) nt.addEventListener("change", async () => {
    const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-arcl-notify", ...sess(), on: nt.checked }) }).then((x) => x.json().catch(() => ({}))).catch(() => ({}));
    if (r.error) { nt.checked = !nt.checked; alert(r.error); }
  });
  const b = $("arcl-connect");
  if (b) { b.textContent = w ? w.slice(0, 6) + "…" + w.slice(-4) : T("Connect wallet"); b.disabled = !!w; }
}
$("arcl-connect").addEventListener("click", () => { if (AC()) AC().connect().then(paint).catch(() => {}); });
const tick = () => { if (AC() && AC().on) AC().on(paint); };
if (document.readyState === "complete") tick(); else addEventListener("load", tick);
paint();
