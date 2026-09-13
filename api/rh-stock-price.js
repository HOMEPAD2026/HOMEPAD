// api/rh-stock-price.js — Vercel serverless function.
//
// Proxies GET https://api.robinhood.com/rhj/prices/{symbol} — same reason as
// rh-stock-assets.js: that endpoint isn't CORS-enabled for a direct browser
// fetch from a third-party page. Response shape (per Robinhood's own docs,
// docs.robinhood.com/chain/stock-token-apis): { quotes: [{ tokenSymbol, bid,
// ask, currency, dailyTradingVolume, isTradingHalt, generatedAt }] }. Prices
// are the raw underlying-equity bid/ask, NOT multiplier-adjusted — the
// caller must apply currentMultiplier from /assets to get a token-equivalent
// USD value (see cnPONS.js computeCnStartValuation).

module.exports = async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  if (!symbol || !/^[A-Z.]{1,10}$/.test(symbol)) {
    res.status(400).json({ error: "missing or invalid ?symbol=" });
    return;
  }
  try {
    const upstream = await fetch(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(symbol)}`, {
      headers: { accept: "application/json" },
    });
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Robinhood price API returned ${upstream.status}` });
      return;
    }
    const data = await upstream.json();
    // Live quotes change fast — much shorter cache than the asset registry
    // (Robinhood's own docs list a 15s cache window for this endpoint).
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=30");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: `Couldn't reach Robinhood's price API: ${String(err && err.message || err)}` });
  }
};
