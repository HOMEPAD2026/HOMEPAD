// api/rh-stock-assets.js — Vercel serverless function.
//
// cnPONS.js fetching https://api.robinhood.com/rhj/assets directly from the
// browser failed with "Failed to fetch" — that's the generic error a
// browser gives for a CORS rejection, and Robinhood's endpoint isn't
// documented as CORS-enabled for arbitrary third-party origins (it's meant
// for server-side/developer use per their own docs). This function fetches
// it server-side instead — no CORS applies to a server-to-server call — and
// the browser talks to this same-origin endpoint instead.
//
// Also cached at Vercel's edge (s-maxage) since the full asset list is a few
// hundred KB and changes rarely (new Stock Tokens, occasional multiplier
// updates) — no reason to re-fetch it from Robinhood on every page load.

module.exports = async function handler(req, res) {
  try {
    const upstream = await fetch("https://api.robinhood.com/rhj/assets", {
      headers: { accept: "application/json" },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Robinhood asset registry returned ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: `Couldn't reach Robinhood's asset registry: ${String(err && err.message || err)}` });
  }
};
