// api/log.mjs — receives front-end error reports (window.onerror /
// unhandledrejection, sent with navigator.sendBeacon by arc-log.js) and
// writes them to the function log, where they show up in Vercel →
// Project → Logs. Nothing is stored anywhere else; no IPs are recorded.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  let text = "";
  try { text = await req.text(); } catch { /* empty */ }
  if (!text || text.length > 6000) return new Response(null, { status: 204 });
  let e = null;
  try { e = JSON.parse(text); } catch { return new Response(null, { status: 204 }); }
  const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").slice(0, n);
  const entry = {
    kind: clip(e.kind, 20), msg: clip(e.msg, 400), src: clip(e.src, 200), line: Number(e.line) || 0,
    stack: clip(e.stack, 1200), page: clip(e.page, 200), ua: clip(req.headers.get("user-agent"), 160), v: clip(e.v, 20),
  };
  console.error("[client-error]", JSON.stringify(entry));
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
