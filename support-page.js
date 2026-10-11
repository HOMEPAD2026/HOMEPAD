// support-page.js — /support: the Help Center (world-support.js) as a page — ARCIA first, then a public report.
import { createSupport } from "./world-support.js";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lang = () => { try { const l = (window.arcI18n && window.arcI18n.get()) || localStorage.getItem("arcircle.lang") || "en"; return l === "ko" || l === "zh" ? l : "en"; } catch { return "en"; } };
const T = (s, v) => { let t = (lang() !== "en" && window.arcI18n && window.arcI18n.translate(s, lang())) || s; if (v) for (const k in v) t = t.split("{" + k + "}").join(v[k]); return t; };
const AC = () => window.arcConnect;
const mount = document.getElementById("hc-mount");
const tab = { "#report": "report", "#board": "board", "#mine": "mine" }[location.hash] || "ask";
const help = createSupport({
  T, lang: lang(), esc, where: "site", mount,
  provider: async () => { const a = AC(); if (a) { if (!a.live || !a.live()) await a.connect(); return a.provider(); } if (window.ethereum) return window.ethereum; throw new Error(T("Connect a wallet first.")); },
  address: () => { const a = AC(); return (a && a.address && a.address()) || ""; },
});
if (tab !== "ask") help.setTab(tab);
