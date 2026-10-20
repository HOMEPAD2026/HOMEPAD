// world-share.js — a share card: a 1200×630 picture of something you did in ARCIRCLE World (your dinosaur, a royal flush,
// a SURVIVORS ARENA run), shown with "Share on X", "Save" and "Copy link". The link brings friends into the game with
// your invite on it (world-play.js referLink: when they reach level 5 you both get the invite's reward).
// On a phone that can share files, "Share on X" hands the picture and the words to the share sheet (pick X there);
// elsewhere it opens X's post window with the words and the link, and the picture is saved to attach.
//
// openShare(card, o)
//   card: { kind: "dino" | "poker" | "surv" | "rings", tag (the small line over the title), title, sub, rows: [[label, value, icon]],
//           badge (the grade in the panel's corner), cards (poker: the five, fanned), foot,
//           art (an image URL or a data URL), emoji (when there's no art), cover (the art fills the panel: a screenshot), accent ("#rrggbb"), text (the post's words) }
//   o: { T(s, v), esc, toast, link() → the invite link, coarse }
const W = 1200, Hh = 630;
const load = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.decoding = "async"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
/// the text cut to fit a width (an ellipsis at the end)
function fit(g, s, w) { s = String(s || ""); if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }
const FONT = 'system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans SC", sans-serif';

// each kind's look: the ribbon over the panel, the glow round it, the title's colours
const THEME = {
  dino: { label: "MY DINOSAUR", rib: ["#1f6dff", "#38c8ff"], glow: "#38c8ff", title: ["#ffffff", "#bfeaff"], felt: ["#1d4f7a", "#1f6a5a", "#173f2c"] },
  poker: { label: "POKER", rib: ["#6a2cff", "#b46cff"], glow: "#ffcf4a", title: ["#fff3b0", "#ffb52e"], felt: ["#3a1466", "#5a1f7a", "#2a0d40"] },
  surv: { label: "SURVIVORS", rib: ["#ff5a1f", "#ffa23a"], glow: "#ff8a3a", title: ["#ffffff", "#ffd9b8"], felt: ["#3a2a6a", "#5a2a3a", "#2a1420"] },
  rings: { label: "INFINITY RINGS", rib: ["#2f6bff", "#2ee0b0"], glow: "#38d8ff", title: ["#ffffff", "#9ff6ff"], felt: ["#1a2a7a", "#3a1a7a", "#0a1440"] },
};
/// a soft copy of a picture over the whole card (drawn small, then large: a blur every browser does)
function soft(g, img, x, y, w, h, px) {
  const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
  if ("filter" in g) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.filter = `blur(${px}px)`; g.drawImage(img, x + (w - dw) / 2 - px, y + (h - dh) / 2 - px, dw + px * 2, dh + px * 2); g.restore(); return; }
  const t = document.createElement("canvas"); t.width = 160; t.height = Math.round(160 * h / w); const tg = t.getContext("2d"); tg.drawImage(img, (160 - dw * 160 / w) / 2, (t.height - dh * t.height / h) / 2, dw * 160 / w, dh * t.height / h);
  g.save(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(t, x, y, w, h); g.restore();
}
function backdrop(g, img) { soft(g, img, 0, 0, W, Hh, 10); }
/// the five cards of a hand, fanned (poker: "A♠", "K♠" …)
function drawHand(g, cards, cx, cy) {
  const n = cards.length, cw = 112, ch = 160;
  cards.forEach((c, i) => {
    const a = (i - (n - 1) / 2) * 0.16; g.save(); g.translate(cx + (i - (n - 1) / 2) * 74, cy + Math.abs(i - (n - 1) / 2) * 10); g.rotate(a);
    g.shadowColor = "#ffcf4a"; g.shadowBlur = 22; round(g, -cw / 2, -ch / 2, cw, ch, 12); const cg = g.createLinearGradient(0, -ch / 2, 0, ch / 2); cg.addColorStop(0, "#1b1530"); cg.addColorStop(1, "#06040e"); g.fillStyle = cg; g.fill();
    g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = "#ffcf4a"; g.stroke();
    const red = /[♥♦]/.test(c), rank = c.slice(0, -1), suit = c.slice(-1); g.fillStyle = red ? "#ff6b7a" : "#ffd75e"; g.textAlign = "left"; g.textBaseline = "top";
    g.font = `900 34px ${FONT}`; g.fillText(rank, -cw / 2 + 10, -ch / 2 + 8); g.font = `700 26px ${FONT}`; g.fillText(suit, -cw / 2 + 12, -ch / 2 + 44);
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = `64px ${FONT}`; g.fillText(suit, 0, 18); g.restore();
  });
}
/// the picture (a canvas)
export async function drawCard(card) {
  const c = document.createElement("canvas"); c.width = W; c.height = Hh; const g = c.getContext("2d");
  const th = THEME[card.kind] || THEME.dino, ac = /^#[0-9a-f]{6}$/i.test(card.accent || "") ? card.accent : th.glow;
  const [art, logo, bgi] = await Promise.all([load(card.art), load("/images/brand/arcircle-world-logo-256.webp"), load("/images/world-launch-banner.webp")]);
  // the ground: the world's own banner, soft and dimmed, a night-blue wash, the accent's glow behind the panel
  g.fillStyle = "#071430"; g.fillRect(0, 0, W, Hh); if (bgi) backdrop(g, bgi);
  let gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, "rgba(4,12,34,0.55)"); gr.addColorStop(1, "rgba(4,12,34,0.82)"); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  gr = g.createRadialGradient(300, 350, 30, 300, 350, 430); gr.addColorStop(0, ac + "66"); gr.addColorStop(1, ac + "00"); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  // the top: the logo and name on the left, the line on the right
  if (logo) g.drawImage(logo, 36, 22, 66, 66);
  g.textAlign = "left"; g.textBaseline = "alphabetic"; g.font = `900 30px ${FONT}`; g.fillStyle = "#ffffff"; g.fillText("ARCIRCLE", 112, 54); g.fillStyle = "#38e1ff"; g.fillText("WORLD", 112, 84);
  g.save(); g.textAlign = "right"; g.font = `italic 800 34px "Brush Script MT", "Segoe Script", cursive, ${FONT}`; g.shadowColor = "#38e1ff"; g.shadowBlur = 14; g.fillStyle = "#ffffff"; g.fillText("Play. Build. Battle. Earn.", W - 40, 66); g.restore();
  // the panel: a glowing frame, the ribbon on its top edge, the art inside, a grade badge in its corner
  const P = { x: 40, y: 128, w: 500, h: 462 };
  g.save(); round(g, P.x, P.y, P.w, P.h, 30); g.shadowColor = th.glow; g.shadowBlur = 34; g.fillStyle = "rgba(8,20,50,0.78)"; g.fill(); g.restore();
  g.save(); round(g, P.x, P.y, P.w, P.h, 30); g.clip();
  { const pg = g.createLinearGradient(0, P.y, 0, P.y + P.h); th.felt.forEach((c2, i) => pg.addColorStop(i / (th.felt.length - 1), c2)); g.fillStyle = pg; g.fillRect(P.x, P.y, P.w, P.h); }
  if (bgi && !card.cover) { g.globalAlpha = 0.3; soft(g, bgi, P.x, P.y, P.w, P.h, 18); g.globalAlpha = 1; }
  if (card.kind === "dino") { g.fillStyle = "rgba(40,90,40,0.55)"; g.beginPath(); g.ellipse(P.x + P.w / 2, P.y + P.h - 70, P.w * 0.42, 46, 0, 0, Math.PI * 2); g.fill(); }
  gr = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 10, P.x + P.w / 2, P.y + P.h / 2, P.w * 0.6); gr.addColorStop(0, ac + "55"); gr.addColorStop(1, ac + "00"); g.fillStyle = gr; g.fillRect(P.x, P.y, P.w, P.h);
  if (card.cards && card.cards.length) drawHand(g, card.cards, P.x + P.w / 2, P.y + P.h / 2 + 24);
  else if (art) { const k = card.cover ? Math.max(P.w / art.width, P.h / art.height) : Math.min(P.w / art.width, P.h / art.height) * 0.96, w = art.width * k, h = art.height * k; g.drawImage(art, P.x + (P.w - w) / 2, P.y + (P.h - h) / 2 + (card.cover ? 0 : 12), w, h); }
  else { g.font = `220px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(card.emoji || "♾️", P.x + P.w / 2, P.y + P.h / 2 + 10); }
  g.restore();
  g.save(); round(g, P.x, P.y, P.w, P.h, 30); g.lineWidth = 4; const fr = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h); fr.addColorStop(0, th.rib[1]); fr.addColorStop(1, th.glow); g.strokeStyle = fr; g.stroke(); g.restore();
  { const rw = 300, rx = P.x + (P.w - rw) / 2, ry = P.y - 26; g.save(); g.beginPath(); g.moveTo(rx + 22, ry); g.lineTo(rx + rw - 22, ry); g.lineTo(rx + rw, ry + 26); g.lineTo(rx + rw - 22, ry + 52); g.lineTo(rx + 22, ry + 52); g.lineTo(rx, ry + 26); g.closePath();
    const rg = g.createLinearGradient(rx, 0, rx + rw, 0); rg.addColorStop(0, th.rib[0]); rg.addColorStop(0.5, th.rib[1]); rg.addColorStop(1, th.rib[0]); g.fillStyle = rg; g.shadowColor = th.rib[1]; g.shadowBlur = 20; g.fill(); g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.7)"; g.stroke();
    g.font = `900 30px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffffff"; g.fillText(th.label, rx + rw / 2, ry + 28); g.restore(); }
  if (card.badge) { g.save(); g.font = `900 22px ${FONT}`; const bw = g.measureText(card.badge).width + 64, bx = P.x + 18, by = P.y + 40; round(g, bx, by, bw, 42, 21); g.fillStyle = "rgba(10,14,30,0.85)"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = ac; g.stroke();
    g.textBaseline = "middle"; g.textAlign = "left"; g.fillText("👑", bx + 12, by + 22); g.fillStyle = ac; g.fillText(card.badge, bx + 46, by + 22); g.restore(); }
  // the words on the right: the tag, the title (in its kind's colours), the line under it
  const X = 590, RW = W - X - 44; g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = `800 22px ${FONT}`; g.fillStyle = ac; g.fillText(fit(g, String(card.tag || "").toUpperCase(), RW), X, 170);
  let fs = 68; g.font = `900 ${fs}px ${FONT}`; while (fs > 38 && g.measureText(card.title || "").width > RW) { fs -= 4; g.font = `900 ${fs}px ${FONT}`; }
  const tg = g.createLinearGradient(0, 180, 0, 180 + fs); tg.addColorStop(0, th.title[0]); tg.addColorStop(1, th.title[1]);
  g.save(); g.shadowColor = th.glow; g.shadowBlur = 20; g.fillStyle = tg; g.fillText(fit(g, card.title, RW), X, 176 + fs); g.restore();
  g.font = `700 27px ${FONT}`; g.fillStyle = "#d8ecff"; g.fillText(fit(g, card.sub, RW), X, 176 + fs + 44);
  // the numbers: a glass table, one row each (an icon, the label, the value on the right)
  const rows = (card.rows || []).slice(0, 6), TY = 300, rh = Math.min(50, 220 / Math.max(1, rows.length));
  if (rows.length) { g.save(); round(g, X, TY, RW, rows.length * rh + 20, 20); g.fillStyle = "rgba(6,16,40,0.78)"; g.fill(); g.lineWidth = 2; g.strokeStyle = th.glow + "99"; g.stroke(); g.restore(); }
  rows.forEach(([l, v, ic], i) => { const y = TY + 10 + i * rh + rh / 2;
    if (i) { g.fillStyle = "rgba(160,210,255,0.14)"; g.fillRect(X + 18, y - rh / 2, RW - 36, 1); }
    g.textBaseline = "middle"; g.textAlign = "left"; g.font = `24px ${FONT}`; g.fillStyle = "#ffffff"; g.fillText(ic || "•", X + 20, y + 1);
    g.font = `600 22px ${FONT}`; g.fillStyle = "#cfe3f7"; g.fillText(fit(g, l, RW * 0.45), X + 60, y + 1);
    g.textAlign = "right"; g.font = `900 27px ${FONT}`; g.fillStyle = i === rows.length - 1 && card.goldLast ? "#ffd75e" : card.kind === "poker" ? "#ffd75e" : "#7ff0ff"; g.fillText(fit(g, v, RW * 0.5), X + RW - 20, y + 1); });
  g.textBaseline = "alphabetic";
  // the foot: where to play
  g.font = `800 26px ${FONT}`; const foot = "arcircle.app/play  ›", fw = g.measureText(foot).width + 48, fx = W - 44 - fw, fy = Hh - 82;
  g.save(); round(g, fx, fy, fw, 52, 26); const fb = g.createLinearGradient(fx, 0, fx + fw, 0); fb.addColorStop(0, "#1f6dff"); fb.addColorStop(1, "#22d3b8"); g.fillStyle = fb; g.shadowColor = "#38e1ff"; g.shadowBlur = 18; g.fill(); g.restore();
  g.textAlign = "left"; g.fillStyle = "#ffffff"; g.fillText(foot, fx + 24, fy + 35);
  g.font = `italic 800 19px ${FONT}`; g.fillStyle = "#ffffff"; g.fillText(fit(g, card.foot || "SHARE YOUR ADVENTURE", fx - X - 12), X, fy + 34);
  return c;
}

let busy = false;
export async function openShare(card, o) {
  if (busy) return; busy = true;
  const T = o.T, esc = o.esc, link = (o.link && o.link()) || location.origin + "/play";
  let c = null; try { c = await drawCard(card); } catch (e) { console.warn("share card", e); }
  busy = false; if (!c) { o.toast(T("Couldn't make the picture — try again")); return; }
  const url = c.toDataURL("image/png"), blob = await new Promise((ok) => c.toBlob(ok, "image/png")), name = `arcircle-${card.kind || "card"}.png`;
  const file = blob && typeof File !== "undefined" ? new File([blob], name, { type: "image/png" }) : null;
  const canFiles = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const text = String(card.text || card.title || "") + "\n\n♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.\n$ARCIRCLE #ARCIRCLE #Arc #GameFi";
  const box = document.createElement("div"); box.className = "wp-st wp-share"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
  box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>
    <h2>${esc(T("Share card"))}</h2><img class="wp-share-img" src="${url}" alt="${esc(card.title || "")}" width="600" height="315">
    <div class="wp-share-btns"><button type="button" class="wp-st-buy" data-x>𝕏 ${esc(T("Share on X"))}</button><button type="button" data-save>⬇ ${esc(T("Save"))}</button><button type="button" data-copy>🔗 ${esc(T("Copy link"))}</button></div>
    <p class="wp-st-note">${esc(canFiles ? T("Pick X in the share sheet: the picture goes with your post.") : T("X opens with your words and link; the picture is saved for you to attach."))}</p>
    <p class="wp-st-note">${esc(T("Your link carries your invite: a friend who joins and reaches level 5 gets you both a reward."))}</p></div>`;
  document.body.appendChild(box);
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); if (o.closed) o.closed(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
  const save = () => { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  box.querySelector("[data-save]").addEventListener("click", save);
  box.querySelector("[data-copy]").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); o.toast(T("Link copied")); } catch { o.toast(link); } });
  box.querySelector("[data-x]").addEventListener("click", async () => {
    if (canFiles && o.coarse) { try { await navigator.share({ files: [file], text: text + "\n" + link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    save(); const u = "https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(link);
    if (!window.open(u, "_blank", "noopener")) location.href = u;
  });
  if (o.opened) o.opened(box);
}
